import {describe, expect, test} from 'bun:test';
import type {ReactiveMap, ReactiveSet} from '../collections/index';
import {reactiveMap, reactiveSet} from '../collections/index';
import {batch, createClassyStore, snapshot, subscribe} from '../index';

// Differential test. Every random operation is applied twice: to a store, and
// to a mirror of it made of plain objects, arrays, `Map` and `Set`, which no
// store code touches. The mirror also logs its own writes. After each
// operation:
//   - the frozen snapshot and the live store hold exactly what the mirror
//     holds, object for object: one row in two places is one object in both;
//   - a branch nothing wrote to keeps its snapshot, and a branch that was
//     written to gets a new one;
//   - every subscriber has been called exactly as often as the log says;
//   - memoized getters, live and on the snapshot, match a fresh computation on
//     the mirror, and were recomputed only if something they read changed.
// Rows are aliased across lists, a dictionary, a nested object and reactive
// collections, then detached, retained, edited and reattached, which is where
// stale caches and missed owner links would show up.
//
// Only the public entry points are used, so the test survives a rewrite of the
// internals.
//
// Volume: FUZZ_SEEDS seeds of FUZZ_STEPS operations each, the first seed being
// FUZZ_FIRST_SEED. A failure names its seed and step, and the command that
// replays it.

const DEFAULT_SEEDS = 60;
const DEFAULT_STEPS = 300;

function setting(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const SEEDS = setting('FUZZ_SEEDS', DEFAULT_SEEDS);
const STEPS = setting('FUZZ_STEPS', DEFAULT_STEPS);
const FIRST_SEED = setting('FUZZ_FIRST_SEED', 1);

/** Ordinary subscribers are told on a microtask: let it run before asserting. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// FINDING: "a delete that removes nothing counts as a write", pinned in
// core.fuzz.findings.test.ts. The store notifies and replaces the snapshot. The
// mirror follows the store in exactly that case, so the run can keep deleting
// keys that are not there, and keep calling the array methods that do the same
// over holes (`sort` and `copyWithin`).
const DELETING_NOTHING_IS_A_WRITE = true;

// FINDING: "a live getter that reads a property which does not exist is
// recomputed on every read", pinned in core.fuzz.findings.test.ts. The run
// expects a new result on each read in exactly that case.
const A_MISSING_PROPERTY_DEFEATS_THE_LIVE_GETTER_CACHE = true;

/** Deterministic PRNG (mulberry32), so a failure names a seed that replays. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The store under test ──────────────────────────────────────────────────────

type Row = {id: number; v: number};
type Tag = number | string;
type Inner = {x?: number; y?: number};
type BoxFields = {label?: string; count?: number; inner?: Inner; row?: Row};
type Box = BoxFields & {readonly area: number};

/** A nested object literal with a getter of its own. */
function makeBox(fields: BoxFields): Box {
  return {
    ...fields,
    get area() {
      return (this.inner?.x ?? 0) * (this.inner?.y ?? 0) + (this.count ?? 0);
    },
  };
}

// Every getter reads through `this.something`. A getter that asks `key in this`
// or `Object.keys(this)` is a FINDING of its own, pinned in
// core.fuzz.findings.test.ts, and is left out of the run.
class Root {
  a: Row[] = [];
  b: Row[] = [];
  nums: number[] = [];
  dict: Record<string, Row> = {};
  slot?: Row | null = null;
  n = 0;
  box: Box = makeBox({label: 'box', count: 0, inner: {x: 1, y: 2}});
  tags = reactiveSet<Tag>();
  picked = reactiveSet<Row>();
  byKey = reactiveMap<string, Row>();
  notes = reactiveMap<Row, number>();

  get sumA() {
    return this.a.reduce((total, row) => total + row.v, 0);
  }

  get dictSize() {
    return Object.keys(this.dict).length;
  }

  get slotPlusN() {
    return (this.slot?.v ?? 0) + this.n;
  }

  get combined() {
    return this.sumA + this.dictSize + this.slotPlusN;
  }

  get numsTotal() {
    return this.nums.reduce((total, value) => total + value, 0);
  }

  get tagLine() {
    return [...this.tags].join('|');
  }

  get pickedSum() {
    let total = 0;
    for (const row of this.picked) total += row.v;
    return total;
  }

  get byKeySum() {
    let total = 0;
    this.byKey.forEach((row) => {
      total += row.v;
    });
    return total;
  }

  get notesSum() {
    let total = 0;
    for (const [row, note] of this.notes) total += row.v * note;
    return total;
  }

  get pickedInA() {
    return this.a.filter((row) => this.picked.has(row)).length;
  }

  get boxLine() {
    return `${this.box.label ?? '-'}/${this.box.area}/${this.box.row?.v ?? '-'}`;
  }

  get sizes() {
    return (
      this.tags.size + this.picked.size + this.byKey.size + this.notes.size
    );
  }

  get everything() {
    return (
      this.combined +
      this.numsTotal +
      this.pickedSum +
      this.byKeySum +
      this.notesSum +
      this.pickedInA +
      this.sizes +
      this.boxLine.length
    );
  }

  // Two getters that build an object, so that a recomputation can be told from
  // a cached result: the result is a new object exactly when it was recomputed.
  get evenIds() {
    return this.a.filter((row) => row.v % 2 === 0).map((row) => row.id);
  }

  get overview() {
    return {slot: this.slot?.id ?? 0, n: this.n, tags: this.tags.size};
  }

  bump() {
    this.n++;
    // A list can have holes after `delete list[i]` or a longer `length`.
    for (const row of this.a) if (row) row.v++;
  }

  setN(value: number) {
    this.n = value;
  }

  /** Runs any writes the caller likes inside one store method. */
  transact<T>(run: () => T): T {
    return run();
  }
}

// ── The mirror: plain data, and a log of what was written to it ──────────────

type Mirror = {
  a: Row[];
  b: Row[];
  nums: number[];
  dict: Record<string, Row>;
  slot?: Row | null;
  n: number;
  box: BoxFields;
  tags: Set<Tag>;
  picked: Set<Row>;
  byKey: Map<string, Row>;
  notes: Map<Row, number>;
};

/** The same keys in the same order as `new Root()`. */
function emptyMirror(): Mirror {
  return {
    a: [],
    b: [],
    nums: [],
    dict: {},
    slot: null,
    n: 0,
    box: {label: 'box', count: 0, inner: {x: 1, y: 2}},
    tags: new Set(),
    picked: new Set(),
    byKey: new Map(),
    notes: new Map(),
  };
}

/** What every getter of `Root` should return, computed afresh on the mirror. */
function derive(m: Mirror) {
  // `Object.values` skips holes, as `reduce` and `filter` do.
  const rowsOfA = Object.values(m.a);
  const sumA = rowsOfA.reduce((total, row) => total + row.v, 0);
  const dictSize = Object.keys(m.dict).length;
  const slotPlusN = (m.slot?.v ?? 0) + m.n;
  const combined = sumA + dictSize + slotPlusN;
  const numsTotal = Object.values(m.nums).reduce(
    (total, value) => total + value,
    0,
  );
  const tagLine = [...m.tags].join('|');
  let pickedSum = 0;
  for (const row of m.picked) pickedSum += row.v;
  let byKeySum = 0;
  for (const row of m.byKey.values()) byKeySum += row.v;
  let notesSum = 0;
  for (const [row, note] of m.notes) notesSum += row.v * note;
  const pickedInA = rowsOfA.filter((row) => m.picked.has(row)).length;
  const area =
    (m.box.inner?.x ?? 0) * (m.box.inner?.y ?? 0) + (m.box.count ?? 0);
  const boxLine = `${m.box.label ?? '-'}/${area}/${m.box.row?.v ?? '-'}`;
  const sizes = m.tags.size + m.picked.size + m.byKey.size + m.notes.size;
  return {
    sumA,
    dictSize,
    slotPlusN,
    combined,
    numsTotal,
    tagLine,
    pickedSum,
    byKeySum,
    notesSum,
    pickedInA,
    boxLine,
    sizes,
    everything:
      combined +
      numsTotal +
      pickedSum +
      byKeySum +
      notesSum +
      pickedInA +
      sizes +
      boxLine.length,
    evenIds: rowsOfA.filter((row) => row.v % 2 === 0).map((row) => row.id),
    overview: {slot: m.slot?.id ?? 0, n: m.n, tags: m.tags.size},
  };
}

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

/** The objects a mirror object holds directly. */
function membersOf(node: object): object[] {
  const held: unknown[] =
    node instanceof Map
      ? [...node.keys(), ...node.values()]
      : node instanceof Set
        ? [...node]
        : Object.values(node);
  return held.filter(isObject);
}

/** Whether `target` is `from` or sits anywhere beneath it. */
function holds(from: object, target: object, met = new Set<object>()): boolean {
  if (from === target) return true;
  met.add(from);
  for (const member of membersOf(from)) {
    if (!met.has(member) && holds(member, target, met)) return true;
  }
  return false;
}

/** An index argument as array methods read it: negative counts from the end. */
function clampIndex(relative: number, length: number): number {
  return relative < 0
    ? Math.max(length + relative, 0)
    : Math.min(relative, length);
}

/** A subscription, with the calls the log expects and the calls the store made. */
type Watch = {
  /** The mirror object whose subtree it observes. */
  readonly node: object;
  readonly sync: boolean;
  readonly label: string;
  expected: number;
  actual: number;
  /** Owed a call when the open transaction ends (sync) or at the next flush. */
  owed: boolean;
  stop: () => void;
};

/**
 * Applies writes to the mirror and works out, from the mirror alone, what each
 * one means for subscribers and for structural sharing:
 *
 *   - a write counts only if it changes the property it writes;
 *   - a subscriber hears a write made to the object it watches or to anything
 *     beneath it at that moment;
 *   - a `{sync: true}` subscriber is called once per write, or once when the
 *     outermost transaction ends if at least one write reached it;
 *   - an ordinary subscriber is called once per flush that had such a write.
 */
class WriteLog {
  /** Ticks once per write that counted. */
  clock = 0;
  readonly watches: Watch[] = [];
  private open = 0;
  private readonly writtenAt = new WeakMap<object, number>();

  /** `owner[key] = value` */
  write<T extends object, K extends keyof T>(owner: T, key: K, value: T[K]) {
    if (Object.hasOwn(owner, key) && Object.is(owner[key], value)) return;
    owner[key] = value;
    this.touch(owner);
  }

  /** `delete owner[key]` */
  remove<T extends object>(owner: T, key: keyof T) {
    if (!Object.hasOwn(owner, key) && !DELETING_NOTHING_IS_A_WRITE) return;
    Reflect.deleteProperty(owner, key);
    this.touch(owner);
  }

  /** A store method, an array method, a collection method or a `batch()`. */
  transaction<T>(run: () => T): T {
    this.begin();
    try {
      return run();
    } finally {
      this.end();
    }
  }

  begin() {
    this.open++;
  }

  end() {
    if (--this.open > 0) return;
    for (const watch of this.watches) {
      if (!watch.sync || !watch.owed) continue;
      watch.owed = false;
      watch.expected++;
    }
  }

  /** The microtask on which ordinary subscribers are told has run. */
  flushed() {
    for (const watch of this.watches) {
      if (watch.sync || !watch.owed) continue;
      watch.owed = false;
      watch.expected++;
    }
  }

  /** When `node`, or anything beneath it now, was last written to. */
  lastWrite(node: object, known: Map<object, number>): number {
    const cached = known.get(node);
    if (cached !== undefined) return cached;
    let latest = this.writtenAt.get(node) ?? 0;
    known.set(node, latest);
    for (const member of membersOf(node)) {
      latest = Math.max(latest, this.lastWrite(member, known));
    }
    known.set(node, latest);
    return latest;
  }

  add<T>(set: Set<T>, value: T) {
    this.transaction(() => {
      if (set.has(value)) return;
      set.add(value);
      this.touch(set);
    });
  }

  discard<T>(set: Set<T>, value: T): boolean {
    return this.transaction(() => {
      const removed = set.delete(value);
      if (removed) this.touch(set);
      return removed;
    });
  }

  put<K, V>(map: Map<K, V>, key: K, value: V) {
    this.transaction(() => {
      if (map.has(key) && Object.is(map.get(key), value)) return;
      map.set(key, value);
      this.touch(map);
    });
  }

  drop<K>(map: Map<K, unknown>, key: K): boolean {
    return this.transaction(() => {
      const removed = map.delete(key);
      if (removed) this.touch(map);
      return removed;
    });
  }

  empty(collection: Set<unknown> | Map<unknown, unknown>) {
    this.transaction(() => {
      if (!collection.size) return;
      collection.clear();
      this.touch(collection);
    });
  }

  /**
   * The array methods, each as the sequence of property writes and deletes
   * that ECMA-262 specifies, so that the log sees every one of them: a store
   * judges each of those writes on its own. One call is one transaction.
   */
  list<T>(target: T[]) {
    const set = (index: number, value: T) => this.write(target, index, value);
    const setLength = (length: number) => this.write(target, 'length', length);
    const drop = (index: number) => this.remove(target, index);
    const move = (from: number, to: number) => {
      if (from in target) set(to, target[from]);
      else drop(to);
    };
    const once =
      <A extends unknown[]>(run: (...args: A) => void) =>
      (...args: A) =>
        this.transaction(() => run(...args));

    return {
      push: once((...items: T[]) => {
        let length = target.length;
        for (const item of items) set(length++, item);
        setLength(length);
      }),
      pop: once(() => {
        const length = target.length;
        if (length > 0) drop(length - 1);
        setLength(Math.max(length - 1, 0));
      }),
      shift: once(() => {
        const length = target.length;
        for (let index = 1; index < length; index++) move(index, index - 1);
        if (length > 0) drop(length - 1);
        setLength(Math.max(length - 1, 0));
      }),
      unshift: once((...items: T[]) => {
        const length = target.length;
        if (items.length) {
          for (let index = length; index > 0; index--) {
            move(index - 1, index + items.length - 1);
          }
          items.forEach((item, index) => {
            set(index, item);
          });
        }
        setLength(length + items.length);
      }),
      /** `splice(start)` removes to the end; a count is clamped to what is there. */
      splice: once((start: number, count?: number, ...items: T[]) => {
        const length = target.length;
        const from = clampIndex(start, length);
        const removed =
          count === undefined
            ? length - from
            : Math.min(Math.max(count, 0), length - from);
        const added = items.length;
        if (added < removed) {
          for (let index = from; index < length - removed; index++) {
            move(index + removed, index + added);
          }
          for (let index = length; index > length - removed + added; index--) {
            drop(index - 1);
          }
        } else if (added > removed) {
          for (let index = length - removed; index > from; index--) {
            move(index + removed - 1, index + added - 1);
          }
        }
        items.forEach((item, offset) => {
          set(from + offset, item);
        });
        setLength(length - removed + added);
      }),
      reverse: once(() => {
        const length = target.length;
        for (let lower = 0; lower < Math.floor(length / 2); lower++) {
          const upper = length - lower - 1;
          const lowerValue = target[lower];
          const upperValue = target[upper];
          const hasLower = lower in target;
          const hasUpper = upper in target;
          if (hasLower && hasUpper) {
            set(lower, upperValue);
            set(upper, lowerValue);
          } else if (hasUpper) {
            set(lower, upperValue);
            drop(upper);
          } else if (hasLower) {
            drop(lower);
            set(upper, lowerValue);
          }
        }
      }),
      fill: once((value: T, start?: number, end?: number) => {
        const length = target.length;
        const final = end === undefined ? length : clampIndex(end, length);
        for (
          let index = clampIndex(start ?? 0, length);
          index < final;
          index++
        ) {
          set(index, value);
        }
      }),
      copyWithin: once((to: number, start: number, end?: number) => {
        const length = target.length;
        let into = clampIndex(to, length);
        let from = clampIndex(start, length);
        const final = end === undefined ? length : clampIndex(end, length);
        let count = Math.min(final - from, length - into);
        // Overlapping ranges are copied from the far end.
        const direction = from < into && into < from + count ? -1 : 1;
        if (direction === -1) {
          from += count - 1;
          into += count - 1;
        }
        for (; count > 0; count--) {
          move(from, into);
          from += direction;
          into += direction;
        }
      }),
      sort: once((compare?: (x: T, y: T) => number) => {
        const length = target.length;
        // JavaScriptCore returns at once when there is nothing to order, where
        // the specification would still delete the hole of a one-slot list.
        if (length < 2) return;
        // Holes are left out of the sort and end up last.
        const items = Object.values(target).sort(compare);
        items.forEach((item, index) => {
          set(index, item);
        });
        for (let index = items.length; index < length; index++) drop(index);
      }),
    };
  }

  private touch(node: object) {
    this.writtenAt.set(node, ++this.clock);
    for (const watch of this.watches) {
      if (!holds(watch.node, node)) continue;
      if (watch.sync && this.open === 0) watch.expected++;
      else watch.owed = true;
    }
  }
}

// ── Comparing the store with the mirror ───────────────────────────────────────

function show(value: unknown): string {
  if (isObject(value)) return 'an object';
  if (typeof value === 'string') return `'${value}'`;
  return Object.is(value, -0) ? '-0' : String(value);
}

/** Own data properties, in order: what a snapshot copies and getters are not. */
function dataKeys(value: object): string[] {
  return Reflect.ownKeys(value)
    .filter((key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && 'value' in descriptor;
    })
    .map(String);
}

/** Plain data from a getter: equal contents, with `Object.is` for the leaves. */
function alike(found: unknown, expected: unknown): boolean {
  if (!isObject(expected) || !isObject(found))
    return Object.is(found, expected);
  const keys = Object.keys(expected);
  return (
    Array.isArray(found) === Array.isArray(expected) &&
    Object.keys(found).join() === keys.join() &&
    keys.every((key) =>
      alike(Reflect.get(found, key), Reflect.get(expected, key)),
    )
  );
}

/**
 * Walks the mirror and one view of the store (live, or a snapshot) in step.
 * Contents must match, and so must identity: a mirror object met twice has to
 * be one object in the store as well, and two mirror objects have to be two.
 */
class Walk {
  /** Mirror object → the store's object for it, and where it was first met. */
  readonly twins = new Map<object, {found: object; path: string}>();
  readonly problems: string[] = [];
  private readonly origins = new Map<object, string>();

  constructor(
    private readonly side: string,
    private readonly frozen: boolean,
  ) {}

  compare(expected: unknown, found: unknown, path: string): void {
    if (!isObject(expected)) {
      if (!Object.is(expected, found)) {
        this.fail(path, `is ${show(found)}, the mirror has ${show(expected)}`);
      }
      return;
    }
    if (!isObject(found)) {
      this.fail(path, `is ${show(found)}, the mirror has an object`);
      return;
    }
    const twin = this.twins.get(expected);
    if (twin) {
      if (twin.found !== found) {
        this.fail(path, `and ${twin.path} are one object in the mirror`);
      }
      return;
    }
    const origin = this.origins.get(found);
    if (origin !== undefined) {
      this.fail(path, `and ${origin} are two objects in the mirror`);
      return;
    }
    this.twins.set(expected, {found, path});
    this.origins.set(found, path);
    if (this.frozen && !Object.isFrozen(found))
      this.fail(path, 'is not frozen');

    if (expected instanceof Map) this.compareMap(expected, found, path);
    else if (expected instanceof Set) this.compareSet(expected, found, path);
    else if (Array.isArray(expected)) this.compareList(expected, found, path);
    else this.compareRecord(expected, found, path);
  }

  private fail(path: string, what: string) {
    this.problems.push(`${this.side} ${path} ${what}`);
  }

  private compareRecord(expected: object, found: object, path: string) {
    const keys = Object.keys(expected);
    const present = dataKeys(found);
    if (Array.isArray(found) || present.join() !== keys.join()) {
      this.fail(path, `has keys [${present}], the mirror has [${keys}]`);
      return;
    }
    for (const key of keys) {
      this.compare(
        Reflect.get(expected, key),
        Reflect.get(found, key),
        `${path}.${key}`,
      );
    }
  }

  private compareList(expected: unknown[], found: object, path: string) {
    if (!Array.isArray(found) || found.length !== expected.length) {
      const length = Array.isArray(found) ? found.length : 'no';
      this.fail(path, `has length ${length}, the mirror ${expected.length}`);
      return;
    }
    for (let index = 0; index < expected.length; index++) {
      const here = `${path}[${index}]`;
      if (index in expected !== index in found) {
        this.fail(here, index in found ? 'should be a hole' : 'is a hole');
      } else if (index in expected) {
        this.compare(expected[index], found[index], here);
      }
    }
  }

  // The collections are read through their public methods only.

  private compareSet(expected: Set<unknown>, found: object, path: string) {
    if (typeof Reflect.get(found, 'has') !== 'function') {
      this.fail(path, 'is not a set');
      return;
    }
    const set = found as ReactiveSet<unknown>;
    const members = [...set];
    if (set.size !== expected.size || members.length !== expected.size) {
      this.fail(path, `has size ${set.size}, the mirror ${expected.size}`);
      return;
    }
    [...expected].forEach((member, index) => {
      const here = `${path}{${index}}`;
      this.compare(member, members[index], here);
      if (!set.has(members[index])) this.fail(here, 'is not found by has()');
    });
  }

  private compareMap(
    expected: Map<unknown, unknown>,
    found: object,
    path: string,
  ) {
    if (typeof Reflect.get(found, 'get') !== 'function') {
      this.fail(path, 'is not a map');
      return;
    }
    const map = found as ReactiveMap<unknown, unknown>;
    const entries = [...map];
    if (map.size !== expected.size || entries.length !== expected.size) {
      this.fail(path, `has size ${map.size}, the mirror ${expected.size}`);
      return;
    }
    [...expected].forEach(([key, value], index) => {
      const here = `${path}{${index}}`;
      const [foundKey, foundValue] = entries[index];
      this.compare(key, foundKey, `${here}.key`);
      this.compare(value, foundValue, `${here}.value`);
      if (!map.has(foundKey)) this.fail(here, 'is not found by has()');
      if (!Object.is(map.get(foundKey), foundValue)) {
        this.fail(here, 'is not what get() returns');
      }
    });
  }
}

/** Frozen objects stay frozen, so each one is inspected once. */
const knownFrozen = new WeakSet<object>();

/** The path of the first object in a snapshot that is not frozen, if any. */
function findThawed(value: unknown, path: string): string | undefined {
  if (!isObject(value) || knownFrozen.has(value)) return undefined;
  if (!Object.isFrozen(value)) return path;
  knownFrozen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    const thawed = findThawed(descriptor.value, `${path}.${String(key)}`);
    if (thawed) return thawed;
  }
  return undefined;
}

// ── One seed ──────────────────────────────────────────────────────────────────

type Kind =
  | 'direct write'
  | 'store method'
  | 'array method'
  | 'collection method'
  | 'batch()'
  | 'read';

/** The notification counts met for each kind of operation, across all seeds. */
type Tally = Map<string, Set<number>>;

/** One thing held by the store, and its counterpart in the mirror. */
type Twin<T> = {live: T; mirror: T};

/** Lists stay short, so that an operation usually meets rows that are aliased. */
const CAPACITY = 8;
/** Few distinct values: sorts meet ties, and a write often changes nothing. */
const VALUES = 6;
const DICT_KEYS = ['k0', 'k1', 'k2', 'k3', 'k4', '1', '0'];
const MAP_KEYS = ['p', 'q', 'r', 's'];
const FIELD_NUMBERS = [0, 1, 2, 3, -0, Number.NaN];
// No NaN in the number list: a comparator has no consistent answer for it.
const LIST_NUMBERS = [0, 1, 2, 3, 5, -0];
// FINDING: "+0 and -0 are two members of a reactive collection", pinned in
// core.fuzz.findings.test.ts. A native `Set` holds them as one, so -0 is left
// out of the members.
const TAGS: Tag[] = [1, 2, 3, 'x', 'y', Number.NaN];
const ORDERS: [string, (x: Row, y: Row) => number][] = [
  ['v, descending', (x, y) => y.v - x.v],
  ['v', (x, y) => x.v - y.v],
  ['id', (x, y) => x.id - y.id],
];

/** Thrown through a transaction on purpose, part-way. */
const INTERRUPTION = new Error('interrupted on purpose');

/** The store and the mirror disagree; carries what `verify` found. */
class Divergence extends Error {}

function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`the store has no ${what} where the mirror has one`);
  }
  return value;
}

/** Run one seed. Returns a description of the first divergence, if any. */
async function runSeed(
  seed: number,
  steps: number,
  tally: Tally,
): Promise<string | undefined> {
  const next = random(seed);
  const int = (bound: number) => Math.floor(next() * bound);
  const chance = (probability: number) => next() < probability;
  const pick = <T>(items: readonly T[]): T => items[int(items.length)];

  // Three seeds in four compare everything after every operation, as this test
  // always has. The fourth looks only now and then: a store that is read after
  // every write never leaves anything to be picked up lazily.
  const eager = seed % 4 !== 0;
  // In every other seed the synchronous subscriber takes a snapshot when it is
  // called, as a framework binding does.
  const listenerTakesSnapshots = seed % 2 === 1;

  const store = createClassyStore(new Root());
  const mirror = emptyMirror();
  const log = new WriteLog();
  /** Mirror row → the raw object that was handed to the store for it. */
  const raws = new WeakMap<Row, Row>();
  // Proxies kept by "user code", possibly detached from the store.
  const keptRows: Twin<Row>[] = [];
  const keptLists: Twin<Row[]>[] = [];
  /** What an operation noticed itself, such as a wrong return value. */
  const slips: string[] = [];
  const history: string[] = [];
  let ids = 0;

  // ── Subscribers ──

  const watch = (
    node: object,
    proxy: object,
    sync: boolean,
    label: string,
    heard?: () => void,
  ): Watch => {
    const entry: Watch = {
      node,
      sync,
      label,
      expected: 0,
      actual: 0,
      owed: false,
      stop: () => {},
    };
    entry.stop = subscribe(
      proxy,
      () => {
        entry.actual++;
        heard?.();
      },
      {sync},
    );
    log.watches.push(entry);
    return entry;
  };

  /** The snapshot the synchronous subscriber took when it was last called. */
  let heardSnapshot: object | undefined;
  const rootSync = watch(mirror, store, true, 'the sync subscriber', () => {
    if (listenerTakesSnapshots) heardSnapshot = snapshot(store);
  });
  const rootOrdinary = watch(mirror, store, false, 'the ordinary subscriber');
  /** Subscriptions to parts of the store, added and dropped along the way. */
  const partWatches: Watch[] = [];

  // ── Rows and where to find them ──

  const fresh = (): Twin<Row> => {
    const id = ++ids;
    const v = int(VALUES);
    const mirrored = {id, v};
    const raw = {id, v};
    raws.set(mirrored, raw);
    return {live: raw, mirror: mirrored};
  };

  /** The indices of a list that hold something. */
  const filled = (list: unknown[]) => Object.keys(list).map(Number);

  /** Every row within reach, with how to read the store's proxy for it. */
  const knownRows = (): {mirror: Row; read: () => Row}[] => {
    const rows: {mirror: Row; read: () => Row}[] = [];
    for (const name of ['a', 'b'] as const) {
      for (const index of filled(mirror[name])) {
        rows.push({
          mirror: mirror[name][index],
          read: () => store[name][index],
        });
      }
    }
    for (const [key, row] of Object.entries(mirror.dict)) {
      rows.push({mirror: row, read: () => store.dict[key]});
    }
    if (mirror.slot) {
      rows.push({mirror: mirror.slot, read: () => need(store.slot, 'slot')});
    }
    if (mirror.box.row) {
      rows.push({
        mirror: mirror.box.row,
        read: () => need(store.box.row, 'box.row'),
      });
    }
    [...mirror.picked].forEach((row, index) => {
      rows.push({mirror: row, read: () => [...store.picked][index]});
    });
    for (const [key, row] of mirror.byKey) {
      rows.push({mirror: row, read: () => need(store.byKey.get(key), key)});
    }
    [...mirror.notes.keys()].forEach((row, index) => {
      rows.push({mirror: row, read: () => [...store.notes.keys()][index]});
    });
    for (const kept of keptRows) {
      rows.push({mirror: kept.mirror, read: () => kept.live});
    }
    return rows;
  };

  /**
   * A row to put into the store: one it already holds, handed over as its
   * proxy or as its raw object, or a new one.
   */
  const someRow = (): Twin<Row> => {
    const rows = knownRows();
    if (!rows.length || chance(0.35)) return fresh();
    const row = pick(rows);
    const raw = raws.get(row.mirror);
    return {
      mirror: row.mirror,
      live: raw && chance(0.25) ? raw : row.read(),
    };
  };

  /**
   * A row to look up in a collection: by its proxy, its raw object or a
   * snapshot of it, which all name the same member. Sometimes a row the store
   * has never seen.
   */
  const someLookup = (among: Row[]): Twin<Row> => {
    const rows = knownRows();
    const members = rows.filter((row) => among.includes(row.mirror));
    const from = members.length && chance(0.7) ? members : rows;
    if (!from.length || chance(0.1)) return fresh();
    const row = pick(from);
    const form = int(3);
    if (form === 0)
      return {mirror: row.mirror, live: need(raws.get(row.mirror), 'raw row')};
    const proxy = row.read();
    return {mirror: row.mirror, live: form === 1 ? proxy : snapshot(proxy)};
  };

  /** Rows to build a collection from: each object once, and in one form only. */
  // FINDING: "a collection built from one object in two forms holds it twice",
  // pinned in core.fuzz.findings.test.ts. `add` and `set` would hold it once.
  const distinctRows = (count: number): Twin<Row>[] => {
    const rows = new Map<Row, Twin<Row>>();
    for (let index = 0; index < count; index++) {
      const row = someRow();
      if (!rows.has(row.mirror)) rows.set(row.mirror, row);
    }
    return [...rows.values()];
  };

  const someList = (): Twin<Row[]> & {name: string} => {
    if (keptLists.length && chance(0.12)) {
      return {...pick(keptLists), name: 'a kept list'};
    }
    const name = chance(0.5) ? 'a' : 'b';
    return {live: store[name], mirror: mirror[name], name};
  };

  /** How many rows a list can still take. */
  const room = (list: unknown[]) => Math.max(0, CAPACITY - list.length);
  /** An index argument: inside the list, past its end, or negative. */
  const reach = (length: number) => int(length * 2 + 3) - length - 1;
  const someRows = (count: number) => Array.from({length: count}, someRow);
  const lives = <T>(twins: Twin<T>[]) => twins.map((twin) => twin.live);
  const mirrors = <T>(twins: Twin<T>[]) => twins.map((twin) => twin.mirror);

  // ── Checks ──

  /** Mirror object → its snapshot when last seen, and the clock at that time. */
  const lastSnapshots = new WeakMap<object, {snap: object; at: number}>();
  /** Mirror object → the store's proxy for it. A proxy is for life. */
  const proxies = new WeakMap<object, object>();
  /** Getter → its last result, and what it had read to produce it. */
  const lastResults = new Map<string, {result: unknown; inputs: unknown[]}>();

  /** What a getter reads at `key`: the value, or the object and its last write. */
  const input = (
    owner: object,
    key: string,
    writes: Map<object, number>,
  ): unknown[] => {
    const value: unknown = Reflect.get(owner, key);
    return isObject(value) ? [value, log.lastWrite(value, writes)] : [value];
  };

  /**
   * A getter that builds an object returns the cached object as long as nothing
   * it reads has changed, and a new one once something has.
   */
  const checkMemo = (
    name: string,
    result: unknown,
    inputs: unknown[],
    uncached: boolean,
    problems: string[],
  ) => {
    const before = lastResults.get(name);
    lastResults.set(name, {result, inputs});
    if (!before) return;
    const unchanged =
      !uncached &&
      inputs.length === before.inputs.length &&
      inputs.every((value, index) => Object.is(value, before.inputs[index]));
    if (unchanged && result !== before.result) {
      problems.push(`${name} was recomputed though nothing it reads changed`);
    }
    if (!unchanged && result === before.result) {
      problems.push(`${name} kept its cached result though its inputs changed`);
    }
  };

  const checkGetters = (
    side: string,
    view: object,
    expected: ReturnType<typeof derive>,
    problems: string[],
  ) => {
    const results = new Map<string, unknown>();
    for (const [name, value] of Object.entries(expected)) {
      const result: unknown = Reflect.get(view, name);
      results.set(name, result);
      if (!alike(result, value)) {
        problems.push(
          `${side} getter ${name} is stale: ${JSON.stringify(result)}, a fresh computation gives ${JSON.stringify(value)}`,
        );
      }
    }
    const writes = new Map<object, number>();
    checkMemo(
      `${side} getter evenIds`,
      results.get('evenIds'),
      input(mirror, 'a', writes),
      false,
      problems,
    );
    checkMemo(
      `${side} getter overview`,
      results.get('overview'),
      [
        ...input(mirror, 'slot', writes),
        ...input(mirror, 'n', writes),
        ...input(mirror, 'tags', writes),
      ],
      side === 'live' &&
        A_MISSING_PROPERTY_DEFEATS_THE_LIVE_GETTER_CACHE &&
        !Object.hasOwn(mirror, 'slot'),
      problems,
    );
  };

  /** The live objects under `proxy` are the mirror's, one proxy per object. */
  const checkLive = (
    expected: object,
    proxy: object,
    path: string,
    problems: string[],
  ) => {
    const walk = new Walk('live', false);
    walk.compare(expected, proxy, path);
    problems.push(...walk.problems);
    for (const [node, {found, path: where}] of walk.twins) {
      const before = proxies.get(node);
      if (before && before !== found) {
        problems.push(`live ${where} is a second proxy for the same object`);
      }
      proxies.set(node, found);
    }
  };

  /**
   * The snapshot under `proxy` is the mirror's data, frozen throughout, and
   * shares with the previous one exactly the branches nothing wrote to.
   */
  const checkSnapshot = (
    expected: object,
    proxy: object,
    path: string,
    problems: string[],
  ): object => {
    const current = snapshot(proxy);
    const walk = new Walk('snapshot', true);
    walk.compare(expected, current, path);
    problems.push(...walk.problems);
    const thawed = findThawed(current, path);
    if (thawed) problems.push(`snapshot ${thawed} is not frozen`);

    const writes = new Map<object, number>();
    for (const [node, {found, path: where}] of walk.twins) {
      const before = lastSnapshots.get(node);
      lastSnapshots.set(node, {snap: found, at: log.clock});
      if (!before) continue;
      const written = log.lastWrite(node, writes) > before.at;
      if (written && found === before.snap) {
        problems.push(`snapshot ${where} was written to but kept its identity`);
      }
      if (!written && found !== before.snap) {
        problems.push(
          `snapshot ${where} was not written to but is a new object`,
        );
      }
    }
    return current;
  };

  /** Everything that must hold after an operation, at any transaction depth. */
  const verify = (depth: number): string[] => {
    const problems = slips.splice(0);
    for (const entry of log.watches) {
      if (entry.actual !== entry.expected) {
        problems.push(
          `${entry.label} was called ${entry.actual} times, the writes call for ${entry.expected}`,
        );
      }
    }
    const expected = derive(mirror);
    const readLive = () => {
      checkLive(mirror, store, 'store', problems);
      checkGetters('live', store, expected, problems);
    };
    const readSnapshot = () => {
      const current = checkSnapshot(mirror, store, 'store', problems);
      checkGetters('snapshot', current, expected, problems);
      // Outside a transaction nothing changes without a notification, so the
      // snapshot the subscriber took last is still the current one.
      if (depth === 0 && heardSnapshot && heardSnapshot !== current) {
        problems.push(
          'the store changed after its sync subscriber was last called',
        );
      }
    };
    const liveFirst = chance(0.5);
    if (liveFirst && (eager || chance(0.3))) readLive();
    if (eager || chance(0.4)) readSnapshot();
    if (!liveFirst && (eager || chance(0.3))) readLive();
    return problems;
  };

  // ── Operations ──

  type Operation = {
    weight: number;
    kind: Kind;
    run: (depth: number) => string;
  };

  /** Several operations inside one `batch()` or one store method. */
  const group = (
    depth: number,
    label: string,
    open: (run: () => object) => object,
  ): string => {
    const count = int(4);
    const failAt = chance(0.2) ? int(count + 1) : -1;
    /** What the callback returns, and so what the call has to return. */
    const result = {};
    let returned: object | undefined;
    let interrupted = false;
    history.push(`${label} {`);
    log.begin();
    try {
      returned = open(() => {
        for (let index = 0; index < count; index++) {
          if (index === failAt) throw INTERRUPTION;
          act(depth + 1);
          // Reads inside a transaction are current, and nobody is told yet.
          const problems = verify(depth + 1);
          if (problems.length) throw new Divergence(problems.join('; '));
        }
        if (failAt === count) throw INTERRUPTION;
        return result;
      });
    } catch (error) {
      if (error !== INTERRUPTION) throw error;
      interrupted = true;
    } finally {
      log.end();
    }
    // The error thrown inside comes out, and so does the return value.
    if (interrupted !== (failAt !== -1)) {
      slips.push(`${label} swallowed the error thrown inside it`);
    } else if (!interrupted && returned !== result) {
      slips.push(`${label} did not return what its callback returned`);
    }
    return failAt === -1 ? '}' : '} interrupted';
  };

  const operations: Operation[] = [
    // ── Array methods on a list of rows ──
    {
      weight: 5,
      kind: 'array method',
      run: () => {
        const list = someList();
        const rows = someRows(Math.min(int(3), room(list.mirror)));
        list.live.push(...lives(rows));
        log.list(list.mirror).push(...mirrors(rows));
        return `push ${rows.length} onto ${list.name}`;
      },
    },
    {
      weight: 3,
      kind: 'array method',
      run: () => {
        const list = someList();
        list.live.pop();
        log.list(list.mirror).pop();
        return `pop ${list.name}`;
      },
    },
    {
      weight: 3,
      kind: 'array method',
      run: () => {
        const list = someList();
        list.live.shift();
        log.list(list.mirror).shift();
        return `shift ${list.name}`;
      },
    },
    {
      weight: 4,
      kind: 'array method',
      run: () => {
        const list = someList();
        const rows = someRows(Math.min(int(3), room(list.mirror)));
        list.live.unshift(...lives(rows));
        log.list(list.mirror).unshift(...mirrors(rows));
        return `unshift ${rows.length} onto ${list.name}`;
      },
    },
    {
      weight: 5,
      kind: 'array method',
      run: () => {
        const list = someList();
        const start = reach(list.mirror.length);
        if (chance(0.15)) {
          list.live.splice(start);
          log.list(list.mirror).splice(start);
          return `splice ${list.name} from ${start}`;
        }
        const count = int(5) - 1;
        const rows = someRows(Math.min(int(3), room(list.mirror)));
        list.live.splice(start, count, ...lives(rows));
        log.list(list.mirror).splice(start, count, ...mirrors(rows));
        return `splice ${list.name} at ${start}: ${count} out, ${rows.length} in`;
      },
    },
    {
      weight: 4,
      kind: 'array method',
      run: () => {
        const list = someList();
        const [name, order] = pick(ORDERS);
        list.live.sort(order);
        log.list(list.mirror).sort(order);
        return `sort ${list.name} by ${name}`;
      },
    },
    {
      weight: 3,
      kind: 'array method',
      run: () => {
        const list = someList();
        list.live.reverse();
        log.list(list.mirror).reverse();
        return `reverse ${list.name}`;
      },
    },
    {
      weight: 3,
      kind: 'array method',
      run: () => {
        const list = someList();
        const row = someRow();
        const [start, end] = [
          reach(list.mirror.length),
          reach(list.mirror.length),
        ].slice(0, int(3));
        list.live.fill(row.live, start, end);
        log.list(list.mirror).fill(row.mirror, start, end);
        return `fill ${list.name} from ${start} to ${end}`;
      },
    },
    {
      weight: 3,
      kind: 'array method',
      run: () => {
        const list = someList();
        const length = list.mirror.length;
        const [to, start] = [reach(length), reach(length)];
        const end = chance(0.5) ? reach(length) : undefined;
        list.live.copyWithin(to, start, end);
        log.list(list.mirror).copyWithin(to, start, end);
        return `copyWithin ${list.name} to ${to} from ${start} until ${end}`;
      },
    },
    {
      weight: 2,
      kind: 'array method',
      run: () => {
        // Writes made by the callback belong to the forEach call.
        const list = someList();
        const step = int(3);
        list.live.forEach((row) => {
          row.v = (row.v + step) % VALUES;
        });
        log.transaction(() => {
          list.mirror.forEach((row) => {
            log.write(row, 'v', (row.v + step) % VALUES);
          });
        });
        return `forEach row of ${list.name}: add ${step}`;
      },
    },
    {
      weight: 2,
      kind: 'array method',
      run: () => {
        const from = filled(mirror.a);
        if (!from.length || !room(mirror.b))
          return 'alias a row across lists: no row, or no room';
        const index = pick(from);
        store.b.push(store.a[index]);
        log.list(mirror.b).push(mirror.a[index]);
        return 'alias a row across lists';
      },
    },
    {
      weight: 2,
      kind: 'array method',
      run: () => {
        const list = someList();
        if (!keptRows.length || !room(list.mirror))
          return 'reattach a retained row: none, or no room';
        const kept = pick(keptRows);
        list.live.push(kept.live);
        log.list(list.mirror).push(kept.mirror);
        return `reattach a retained row to ${list.name}`;
      },
    },

    // ── Direct writes to a list of rows ──
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        const list = someList();
        const length = Math.min(CAPACITY, int(list.mirror.length + 3));
        list.live.length = length;
        log.write(list.mirror, 'length', length);
        return `set the length of ${list.name} to ${length}`;
      },
    },
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        const list = someList();
        const index = int(Math.min(CAPACITY, list.mirror.length + 2));
        const row = someRow();
        list.live[index] = row.live;
        log.write(list.mirror, index, row.mirror);
        return `assign ${list.name}[${index}]`;
      },
    },
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        const list = someList();
        const index = int(list.mirror.length + 1);
        delete list.live[index];
        log.remove(list.mirror, index);
        return `delete ${list.name}[${index}]`;
      },
    },
    {
      weight: 4,
      kind: 'direct write',
      run: () => {
        const list = someList();
        const at = filled(list.mirror);
        if (!at.length) return `edit a row of ${list.name}: none`;
        const index = pick(at);
        const v = int(VALUES);
        list.live[index].v = v;
        log.write(list.mirror[index], 'v', v);
        return `edit ${list.name}[${index}]`;
      },
    },
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        const name = chance(0.5) ? 'a' : 'b';
        const keep = new Set(filled(mirror[name]).filter(() => chance(0.7)));
        store[name] = store[name].filter((_, index) => keep.has(index));
        log.write(
          mirror,
          name,
          mirror[name].filter((_, index) => keep.has(index)),
        );
        return `replace ${name} with a filtered copy`;
      },
    },
    {
      weight: 2,
      kind: 'direct write',
      run: () => {
        const held = store.a;
        store.a = store.b;
        store.b = held;
        const heldMirror = mirror.a;
        log.write(mirror, 'a', mirror.b);
        log.write(mirror, 'b', heldMirror);
        return 'swap the lists';
      },
    },
    {
      weight: 1,
      kind: 'direct write',
      run: () => {
        if (!keptLists.length) return 'put a kept list back: none';
        const kept = pick(keptLists);
        const name = chance(0.5) ? 'a' : 'b';
        store[name] = kept.live;
        log.write(mirror, name, kept.mirror);
        return `put a kept list back as ${name}`;
      },
    },

    // ── The list of numbers ──
    {
      weight: 5,
      kind: 'array method',
      run: () => {
        const list = store.nums;
        const copy = log.list(mirror.nums);
        const length = mirror.nums.length;
        const values = Array.from(
          {length: Math.min(int(3), room(mirror.nums))},
          () => pick(LIST_NUMBERS),
        );
        const [from, to] = [reach(length), reach(length)];
        switch (int(10)) {
          case 0:
            list.push(...values);
            copy.push(...values);
            return `push ${values.length} numbers`;
          case 1:
            list.pop();
            copy.pop();
            return 'pop a number';
          case 2:
            list.shift();
            copy.shift();
            return 'shift a number';
          case 3:
            list.unshift(...values);
            copy.unshift(...values);
            return `unshift ${values.length} numbers`;
          case 4: {
            const count = int(4);
            list.splice(from, count, ...values);
            copy.splice(from, count, ...values);
            return `splice the numbers at ${from}: ${count} out, ${values.length} in`;
          }
          case 5:
            list.sort();
            copy.sort();
            return 'sort the numbers as strings';
          case 6:
            list.sort((x, y) => y - x);
            copy.sort((x, y) => y - x);
            return 'sort the numbers, descending';
          case 7:
            list.reverse();
            copy.reverse();
            return 'reverse the numbers';
          case 8: {
            const value = pick(LIST_NUMBERS);
            list.fill(value, from, to);
            copy.fill(value, from, to);
            return `fill the numbers from ${from} to ${to}`;
          }
          default:
            list.copyWithin(from, to);
            copy.copyWithin(from, to);
            return `copyWithin the numbers to ${from} from ${to}`;
        }
      },
    },
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        const length = mirror.nums.length;
        switch (int(3)) {
          case 0: {
            const index = int(Math.min(CAPACITY, length + 2));
            const value = pick(LIST_NUMBERS);
            store.nums[index] = value;
            log.write(mirror.nums, index, value);
            return `assign nums[${index}]`;
          }
          case 1: {
            const index = int(length + 1);
            delete store.nums[index];
            log.remove(mirror.nums, index);
            return `delete nums[${index}]`;
          }
          default: {
            const next = Math.min(CAPACITY, int(length + 3));
            store.nums.length = next;
            log.write(mirror.nums, 'length', next);
            return `set the length of nums to ${next}`;
          }
        }
      },
    },

    // ── The slot, the dictionary and the counter ──
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        const row = chance(0.2) ? undefined : someRow();
        store.slot = row ? row.live : null;
        log.write(mirror, 'slot', row ? row.mirror : null);
        return row ? 'alias a row into the slot' : 'empty the slot';
      },
    },
    {
      weight: 1,
      kind: 'direct write',
      run: () => {
        delete store.slot;
        log.remove(mirror, 'slot');
        return 'delete the slot';
      },
    },
    {
      weight: 2,
      kind: 'direct write',
      run: () => {
        if (!mirror.slot) return 'edit the slot: empty';
        const v = int(VALUES);
        need(store.slot, 'slot').v = v;
        log.write(mirror.slot, 'v', v);
        return 'edit the slot';
      },
    },
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        const key = pick(DICT_KEYS);
        const row = someRow();
        store.dict[key] = row.live;
        log.write(mirror.dict, key, row.mirror);
        return `alias a row into the dict at ${key}`;
      },
    },
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        const key = pick(DICT_KEYS);
        delete store.dict[key];
        log.remove(mirror.dict, key);
        return `delete dict key ${key}`;
      },
    },
    {
      weight: 2,
      kind: 'direct write',
      run: () => {
        const value = pick(FIELD_NUMBERS);
        store.n = value;
        log.write(mirror, 'n', value);
        return `set n to ${show(value)}`;
      },
    },

    // ── The nested object ──
    {
      weight: 4,
      kind: 'direct write',
      run: () => {
        switch (int(7)) {
          case 0: {
            const label = pick(['p', 'q', undefined]);
            store.box.label = label;
            log.write(mirror.box, 'label', label);
            return `set box.label to ${show(label)}`;
          }
          case 1:
            delete store.box.label;
            log.remove(mirror.box, 'label');
            return 'delete box.label';
          case 2: {
            const count = pick([0, 1, 2, undefined]);
            store.box.count = count;
            log.write(mirror.box, 'count', count);
            return `set box.count to ${show(count)}`;
          }
          case 3:
            delete store.box.count;
            log.remove(mirror.box, 'count');
            return 'delete box.count';
          case 4: {
            const row = someRow();
            store.box.row = row.live;
            log.write(mirror.box, 'row', row.mirror);
            return 'alias a row into box.row';
          }
          case 5:
            delete store.box.row;
            log.remove(mirror.box, 'row');
            return 'delete box.row';
          default: {
            if (!mirror.box.row) return 'edit box.row: none';
            const v = int(VALUES);
            need(store.box.row, 'box.row').v = v;
            log.write(mirror.box.row, 'v', v);
            return 'edit box.row';
          }
        }
      },
    },
    {
      weight: 4,
      kind: 'direct write',
      run: () => {
        const inner = mirror.box.inner;
        const key = chance(0.5) ? 'x' : 'y';
        const roll = int(5);
        if (roll === 0 || !inner) {
          const [x, y] = [int(3), int(3)];
          store.box.inner = {x, y};
          log.write(mirror.box, 'inner', {x, y});
          return 'replace box.inner';
        }
        if (roll === 1) {
          delete store.box.inner;
          log.remove(mirror.box, 'inner');
          return 'delete box.inner';
        }
        const live = need(store.box.inner, 'box.inner');
        if (roll === 2) {
          delete live[key];
          log.remove(inner, key);
          return `delete box.inner.${key}`;
        }
        const value = int(3);
        live[key] = value;
        log.write(inner, key, value);
        return `set box.inner.${key}`;
      },
    },
    {
      weight: 1,
      kind: 'direct write',
      run: () => {
        const live: BoxFields = {};
        const copy: BoxFields = {};
        if (chance(0.7)) {
          live.label = pick(['p', 'q']);
          copy.label = live.label;
        }
        if (chance(0.7)) {
          live.count = int(3);
          copy.count = live.count;
        }
        if (chance(0.7)) {
          const [x, y] = [int(3), int(3)];
          live.inner = {x, y};
          copy.inner = {x, y};
        }
        if (chance(0.5)) {
          const row = someRow();
          live.row = row.live;
          copy.row = row.mirror;
        }
        store.box = makeBox(live);
        log.write(mirror, 'box', copy);
        return 'replace the box';
      },
    },

    // ── Proxies kept by the caller ──
    {
      weight: 2,
      kind: 'read',
      run: () => {
        const rows = knownRows();
        if (!rows.length) return 'retain a row: none';
        const row = pick(rows);
        keptRows.push({live: row.read(), mirror: row.mirror});
        if (keptRows.length > 6) keptRows.shift();
        return 'retain a row';
      },
    },
    {
      weight: 3,
      kind: 'direct write',
      run: () => {
        if (!keptRows.length) return 'edit a retained row: none';
        const kept = pick(keptRows);
        const v = int(VALUES);
        kept.live.v = v;
        log.write(kept.mirror, 'v', v);
        return 'edit a retained row';
      },
    },
    {
      weight: 1,
      kind: 'read',
      run: () => {
        const name = chance(0.5) ? 'a' : 'b';
        keptLists.push({live: store[name], mirror: mirror[name]});
        if (keptLists.length > 4) keptLists.shift();
        return `retain list ${name}`;
      },
    },
    {
      weight: 2,
      kind: 'read',
      run: () => {
        // Whatever the caller kept is still readable, attached or not.
        const kept = [...keptRows, ...keptLists];
        if (!kept.length) return 'read something kept: nothing';
        const {live, mirror: expected} = pick(kept);
        if (chance(0.5)) checkLive(expected, live, 'kept', slips);
        if (chance(0.5)) checkSnapshot(expected, live, 'kept', slips);
        return 'read something kept';
      },
    },

    // ── Reactive collections ──
    {
      weight: 5,
      kind: 'collection method',
      run: () => {
        const tag = pick(TAGS);
        switch (int(5)) {
          case 0:
          case 1:
            store.tags.add(tag);
            log.add(mirror.tags, tag);
            return `add tag ${show(tag)}`;
          case 2: {
            const removed = store.tags.delete(tag);
            if (removed !== log.discard(mirror.tags, tag)) {
              slips.push(`tags.delete(${show(tag)}) returned ${removed}`);
            }
            return `delete tag ${show(tag)}`;
          }
          case 3: {
            const found = store.tags.has(tag);
            if (found !== mirror.tags.has(tag)) {
              slips.push(`tags.has(${show(tag)}) returned ${found}`);
            }
            return `look for tag ${show(tag)}`;
          }
          default:
            if (chance(0.7)) return 'clear the tags: not this time';
            store.tags.clear();
            log.empty(mirror.tags);
            return 'clear the tags';
        }
      },
    },
    {
      weight: 5,
      kind: 'collection method',
      run: () => {
        const members = [...mirror.picked];
        const roll = int(6);
        if (roll < 2 && members.length < 6) {
          const row = someRow();
          store.picked.add(row.live);
          log.add(mirror.picked, row.mirror);
          return 'pick a row';
        }
        if (roll < 4) {
          const row = someLookup(members);
          const removed = store.picked.delete(row.live);
          if (removed !== log.discard(mirror.picked, row.mirror)) {
            slips.push(`picked.delete() returned ${removed}`);
          }
          return 'unpick a row';
        }
        if (roll === 4) {
          const row = someLookup(members);
          const found = store.picked.has(row.live);
          if (found !== mirror.picked.has(row.mirror)) {
            slips.push(`picked.has() returned ${found}`);
          }
          return 'look for a picked row';
        }
        if (chance(0.7)) return 'clear the picked rows: not this time';
        store.picked.clear();
        log.empty(mirror.picked);
        return 'clear the picked rows';
      },
    },
    {
      weight: 5,
      kind: 'collection method',
      run: () => {
        const key = pick(MAP_KEYS);
        switch (int(6)) {
          case 0:
          case 1: {
            const row = someRow();
            store.byKey.set(key, row.live);
            log.put(mirror.byKey, key, row.mirror);
            return `set byKey ${key}`;
          }
          case 2: {
            const removed = store.byKey.delete(key);
            if (removed !== log.drop(mirror.byKey, key)) {
              slips.push(`byKey.delete(${key}) returned ${removed}`);
            }
            return `delete byKey ${key}`;
          }
          case 3: {
            const found = store.byKey.get(key);
            const expected = mirror.byKey.get(key);
            if (
              store.byKey.has(key) !== mirror.byKey.has(key) ||
              found?.id !== expected?.id
            ) {
              slips.push(`byKey.get(${key}) returned row ${found?.id}`);
            }
            return `look up byKey ${key}`;
          }
          default:
            if (chance(0.7)) return 'clear byKey: not this time';
            store.byKey.clear();
            log.empty(mirror.byKey);
            return 'clear byKey';
        }
      },
    },
    {
      weight: 5,
      kind: 'collection method',
      run: () => {
        const keys = [...mirror.notes.keys()];
        const roll = int(6);
        if (roll < 2) {
          // An existing key may be named in any form; a new key is stored as
          // given, so it is handed over live.
          // FINDING: "a snapshot given as a new member is stored frozen and
          // answers for the live row", pinned in core.fuzz.findings.test.ts.
          // A snapshot is never handed over as a new key or member.
          const row =
            keys.length >= 5 || (keys.length && chance(0.5))
              ? someLookup(keys)
              : someRow();
          if (!mirror.notes.has(row.mirror) && Object.isFrozen(row.live)) {
            return 'note on a row: a snapshot is not a new key';
          }
          if (!mirror.notes.has(row.mirror) && keys.length >= 5) {
            return 'note on a row: no room';
          }
          const note = int(4);
          store.notes.set(row.live, note);
          log.put(mirror.notes, row.mirror, note);
          return 'note on a row';
        }
        if (roll < 4) {
          const row = someLookup(keys);
          const removed = store.notes.delete(row.live);
          if (removed !== log.drop(mirror.notes, row.mirror)) {
            slips.push(`notes.delete() returned ${removed}`);
          }
          return 'delete a note';
        }
        if (roll === 4) {
          const row = someLookup(keys);
          const found = store.notes.get(row.live);
          if (
            store.notes.has(row.live) !== mirror.notes.has(row.mirror) ||
            !Object.is(found, mirror.notes.get(row.mirror))
          ) {
            slips.push(`notes.get() returned ${show(found)}`);
          }
          return 'look up a note';
        }
        if (chance(0.7)) return 'clear the notes: not this time';
        store.notes.clear();
        log.empty(mirror.notes);
        return 'clear the notes';
      },
    },
    {
      weight: 2,
      kind: 'direct write',
      run: () => {
        // A member read from a collection is live state.
        const v = int(VALUES);
        const roll = int(3);
        if (roll === 0 && mirror.picked.size) {
          const index = int(mirror.picked.size);
          [...store.picked][index].v = v;
          log.write([...mirror.picked][index], 'v', v);
          return 'edit a picked row';
        }
        if (roll === 1 && mirror.byKey.size) {
          const key = pick([...mirror.byKey.keys()]);
          need(store.byKey.get(key), key).v = v;
          log.write(need(mirror.byKey.get(key), key), 'v', v);
          return `edit the row at byKey ${key}`;
        }
        if (mirror.notes.size) {
          const index = int(mirror.notes.size);
          [...store.notes.keys()][index].v = v;
          log.write([...mirror.notes.keys()][index], 'v', v);
          return 'edit a row that has a note';
        }
        return 'edit a row in a collection: none';
      },
    },
    {
      weight: 2,
      kind: 'direct write',
      run: () => {
        switch (int(4)) {
          case 0: {
            const tags = TAGS.filter(() => chance(0.4));
            const doubled = [...tags, ...tags.slice(0, 1)];
            store.tags = reactiveSet(doubled);
            log.write(mirror, 'tags', new Set(doubled));
            return 'replace the tags';
          }
          case 1: {
            const rows = distinctRows(int(4));
            store.picked = reactiveSet(lives(rows));
            log.write(mirror, 'picked', new Set(mirrors(rows)));
            return 'replace the picked rows';
          }
          case 2: {
            const keys = Array.from({length: int(4)}, () => pick(MAP_KEYS));
            const rows = someRows(keys.length);
            store.byKey = reactiveMap(
              keys.map((key, index): [string, Row] => [key, rows[index].live]),
            );
            log.write(
              mirror,
              'byKey',
              new Map(keys.map((key, index) => [key, rows[index].mirror])),
            );
            return 'replace byKey';
          }
          default: {
            const rows = distinctRows(int(4));
            const values = rows.map(() => int(4));
            store.notes = reactiveMap(
              rows.map((row, index): [Row, number] => [
                row.live,
                values[index],
              ]),
            );
            log.write(
              mirror,
              'notes',
              new Map(rows.map((row, index) => [row.mirror, values[index]])),
            );
            return 'replace the notes';
          }
        }
      },
    },

    // ── Store methods and batch() ──
    {
      weight: 3,
      kind: 'store method',
      run: () => {
        store.bump();
        log.transaction(() => {
          log.write(mirror, 'n', mirror.n + 1);
          for (const row of mirror.a) if (row) log.write(row, 'v', row.v + 1);
        });
        return 'store method bump()';
      },
    },
    {
      weight: 2,
      kind: 'store method',
      run: () => {
        const value = chance(0.5) ? mirror.n : pick(FIELD_NUMBERS);
        store.setN(value);
        log.transaction(() => log.write(mirror, 'n', value));
        return `store method setN(${show(value)})`;
      },
    },
    {
      weight: 3,
      kind: 'store method',
      run: (depth) =>
        depth >= 3
          ? 'store method: too deep'
          : group(depth, 'store method', (run) => store.transact(run)),
    },
    {
      weight: 6,
      kind: 'batch()',
      run: (depth) =>
        depth >= 3 ? 'batch(): too deep' : group(depth, 'batch()', batch),
    },
  ];

  const totalWeight = operations.reduce((sum, {weight}) => sum + weight, 0);

  /** Apply one random operation to the store and to the mirror. */
  function act(depth: number): Kind {
    let roll = next() * totalWeight;
    const operation =
      operations.find(({weight}) => {
        roll -= weight;
        return roll < 0;
      }) ?? operations[0];
    history.push(`${'· '.repeat(depth)}${operation.run(depth)}`);
    if (history.length > 24) history.shift();
    return operation.kind;
  }

  /** Things a subscriber can be attached to, wherever they sit by now. */
  const watchable = (): {node: object; read: () => object; label: string}[] => [
    ...(
      [
        'a',
        'b',
        'nums',
        'dict',
        'box',
        'tags',
        'picked',
        'byKey',
        'notes',
      ] as const
    ).map((name) => ({
      node: mirror[name],
      read: () => store[name],
      label: name,
    })),
    ...(mirror.box.inner
      ? [
          {
            node: mirror.box.inner,
            read: () => need(store.box.inner, 'box.inner'),
            label: 'box.inner',
          },
        ]
      : []),
    ...knownRows().map((row) => ({
      node: row.mirror,
      read: row.read,
      label: `row ${row.mirror.id}`,
    })),
    ...keptLists.map((kept) => ({
      node: kept.mirror,
      read: () => kept.live,
      label: 'a kept list',
    })),
  ];

  /** Subscribe to a part of the store, or drop such a subscription. */
  const changeWatches = (step: number) => {
    if (partWatches.length < 3 && chance(0.6)) {
      const target = pick(watchable());
      const sync = chance(0.7);
      partWatches.push(
        watch(
          target.node,
          target.read(),
          sync,
          `the ${sync ? 'sync' : 'ordinary'} subscriber put on ${target.label} at step ${step}`,
        ),
      );
    } else if (partWatches.length) {
      const [dropped] = partWatches.splice(int(partWatches.length), 1);
      dropped.stop();
      log.watches.splice(log.watches.indexOf(dropped), 1);
    }
  };

  const note = (kind: Kind, subscriber: string, calls: number) => {
    const key = `${kind}: ${subscriber}`;
    const counts = tally.get(key) ?? new Set<number>();
    counts.add(calls);
    tally.set(key, counts);
  };

  const report = (step: number, problems: string) =>
    `seed ${seed}, step ${step}: ${problems}. Last operations: ${history.join(' | ')}. Replay: FUZZ_FIRST_SEED=${seed} FUZZ_SEEDS=1 FUZZ_STEPS=${step + 1} bun test src/core/core.fuzz.test.ts`;

  /** The kind of the one operation since the last flush, if there was just one. */
  let alone: Kind | undefined;
  let sinceFlush = 0;

  for (let step = 0; step < steps; step++) {
    const syncBefore = rootSync.actual;
    let kind: Kind;
    try {
      kind = act(0);
      const problems = verify(0);
      if (problems.length) return report(step, problems.join('; '));
    } catch (error) {
      return report(
        step,
        error instanceof Divergence ? error.message : `threw ${error}`,
      );
    }
    note(kind, 'sync', rootSync.actual - syncBefore);
    alone = sinceFlush++ === 0 ? kind : undefined;

    if (chance(0.6) || step === steps - 1) {
      const ordinaryBefore = rootOrdinary.actual;
      await flush();
      log.flushed();
      const late = log.watches.filter(
        (entry) => entry.actual !== entry.expected,
      );
      if (late.length) {
        return report(
          step,
          late
            .map(
              (entry) =>
                `after a flush ${entry.label} was called ${entry.actual} times, the writes call for ${entry.expected}`,
            )
            .join('; '),
        );
      }
      if (alone) note(alone, 'ordinary', rootOrdinary.actual - ordinaryBefore);
      sinceFlush = 0;
      // Nothing is pending now, so a subscription can come or go.
      if (chance(0.1)) changeWatches(step);
    }
  }
  for (const entry of log.watches) entry.stop();
  return undefined;
}

describe('core — randomized differential test', () => {
  test(
    'snapshots, sharing, notifications and getters match a plain mirror under random edits',
    async () => {
      const tally: Tally = new Map();
      const failures: string[] = [];
      // Seeds run side by side, so that their flushes overlap; each has its own
      // store, mirror and random numbers, and never yields in mid-operation.
      const lanes = 100;
      for (let done = 0; done < SEEDS; done += lanes) {
        const seeds = Array.from(
          {length: Math.min(lanes, SEEDS - done)},
          (_, index) => FIRST_SEED + done + index,
        );
        const results = await Promise.all(
          seeds.map((seed) => runSeed(seed, STEPS, tally)),
        );
        for (const failure of results) if (failure) failures.push(failure);
      }
      expect(failures.slice(0, 5)).toEqual([]);

      // Today's counts for a whole operation, whatever it was: nothing if it
      // changed nothing, and otherwise one call per direct write, or one call
      // for the whole of a method or batch. An ordinary subscriber gets one
      // call per flush at most. A short replay does not meet every case.
      if (SEEDS * STEPS < DEFAULT_SEEDS * DEFAULT_STEPS) return;
      const met = Object.fromEntries(
        [...tally].map(([key, counts]) => [key, [...counts].sort()]),
      );
      expect(met).toEqual({
        'direct write: sync': [0, 1, 2],
        'direct write: ordinary': [0, 1],
        'store method: sync': [0, 1],
        'store method: ordinary': [0, 1],
        'array method: sync': [0, 1],
        'array method: ordinary': [0, 1],
        'collection method: sync': [0, 1],
        'collection method: ordinary': [0, 1],
        'batch(): sync': [0, 1],
        'batch(): ordinary': [0, 1],
        'read: sync': [0],
        'read: ordinary': [0],
      });
    },
    30_000 + SEEDS * STEPS,
  );
});
