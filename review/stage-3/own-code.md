# Stage 3: review of our own core

Stage 3 step 2 of the pre-1.0 review. Written on 2026-11-19 against
`release/1.0` at `57404c3`. No library source was changed. Every deletion was
made in a throwaway worktree, and every patch is in Appendix A of this file.

**Status: in progress.** The work was interrupted once by a usage limit. What
is below is complete for the single-deletion spikes of all three files (101
spikes). The "Not done" list at the end says what is still open.

The three files reviewed:

- `packages/classy-store/src/core/core.ts` (611 lines)
- `packages/classy-store/src/core/ownership.ts` (170 lines)
- `packages/classy-store/src/snapshot/snapshot.ts` (311 lines)

The lists here were written before reading any stage 2 report. The section
"Compared with the stage 2 report" was added afterwards.

## Summary

Interim, to be rewritten when the open items are done:

- Every function in the three files has a reason, and 101 deletions were run
  to check them. Only **9 lines are dead** in the strict sense.
- The larger result is that **several findings from stage 1 are caused by one
  or two lines each**, and deleting those lines fails only the tests that pin
  the finding: findings 5, 32, 36 and 71, and the suspension findings 61, 66,
  67 and 68.
- **Suspension can be removed as a whole** with 9 tests failing (`o16`). Five
  pin findings 61 and 67, two pin the owner order of finding 69, one reads an
  internal count, and one simulates a runtime without `WeakRef`. The full
  deletion, its line count, its typecheck and its memory measurements are
  still to be run (`x1`).

## Method

1. Each function, and each branch that handles a special case, got one line:
   why it exists.
2. The claim was checked by deleting or stubbing that code in a throwaway
   worktree and running the unit suite (`bun test`, the same files as
   `bun run test`: 1,341 tests pass at the baseline, in about six seconds).
3. A deletion that fails no test is one of four things, and the tables say
   which:
   - **dead**: no input reaches it, or it changes nothing;
   - **fast path**: the result is the same without it, only the cost differs;
   - **memory only**: it changes when an internal link is dropped, which no
     test can watch;
   - **untested**: behaviour changes, and no test sees it.
4. A deletion whose only failing tests are ones that stage 1 wrote to pin a
   finding is marked **pins finding N**. Those tests are expected to flip when
   the finding is fixed, so such a deletion is a candidate fix, not a
   regression.

A spike has an id such as `c07`. Appendix A gives, for every spike, the patch,
the pass and fail counts, and the name of every failing test.

Two spikes made the suite hang (`c23`, `c30`). The driver killed the run after
a time limit; the tables say so.

## `core.ts`: every function and why it exists

Line numbers are those of `57404c3`.

| Function or state                                                  | Lines     | Why it exists                                                                                                                                        | Spike: what fails without it                                                                                                                                                                |
| ------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internalsMap`, `targetNodes`                                      | 13–14     | Find the node for a proxy and for a raw object, so each raw object has one proxy.                                                                    | `c29` (no proxy lookup in `createNode`): 2 tests, `createClassyStore(proxy)` wraps it again. `c30` (no raw lookup): the suite hangs, a cyclic input creates nodes for ever.                 |
| `snapshotSources`, `registerSnapshot()`                            | 17, 23–25 | Lets the core recognise a snapshot: one identity for collections, and a quick answer to "is this frozen".                                            | `s14`: 8 tests.                                                                                                                                                                             |
| `trackedSnapshots`, `registerTrackingProxy()`, `isTrackingProxy()` | 20, 28–35 | React's tracked reads wrap a snapshot in a proxy. The store and the collections must see through it.                                                 | `c05`: 2 tests. `c02`: 3. `c34`: 2.                                                                                                                                                         |
| `unwrap()`                                                         | 41–46     | Store proxy to raw object, tracking proxy to snapshot. Used by the collections.                                                                      | `c02`: 3 tests. The guard on line 42 (`c01`): 1 test. A store made from a function is then held twice by a reactive set.                                                                    |
| `identityOf()`                                                     | 52–56     | One key for a raw object, its proxy and its snapshots. Used by the collections.                                                                      | `c04`: 6 tests. The guard on line 54 (`c03`): none, fast path.                                                                                                                              |
| `trackerStack`, `activeTracker()`                                  | 65–74     | Which getter is being computed, so that reads are recorded for it. A stack, because getters read getters.                                            | The ternary (`c06`): none. It is a fast path worth half the cost of a read.                                                                                                                 |
| `recordDep()`                                                      | 80–105    | Records what a getter read: a `version` entry for a child object, a `value` entry for anything else.                                                 | Without the `version` kind (`c10`): 30 tests. Without the same-node rule on line 91 (`c07`): 2 tests, both pin finding 36.                                                                  |
| `recordComputedDep()`                                              | 112–122   | Records that a getter read another getter of the same object.                                                                                        | `c15`: 8 tests. Without the same-node rule on line 119 (`c08`): 1 test, which pins a stale result across two stores.                                                                        |
| `areDepsValid()`                                                   | 127–153   | Decides whether a cached getter result can be reused.                                                                                                | Replaced-child check, 134–135 (`c09`): 8. `!cached`, 140 (`c11`): none, dead. Nested check, 141 (`c12`): 7. Value check, 142 (`c13`): 3. `Reflect.has`, 147 (`c14`): 5, all pin finding 32. |
| `evaluateComputed()`                                               | 160–196   | Returns the cached result or runs the getter with a tracker frame.                                                                                   | Cycle check, 173–184 (`c16`): 8. `finally`, 189–195 (`c17`): 9.                                                                                                                             |
| `getInternal()`                                                    | 204–210   | Proxy to node, or throw. It also resumes a suspended subtree.                                                                                        | The throw (`c57`): 12. The resume (`c18`): 18.                                                                                                                                              |
| `notifyMutation()`                                                 | 221–239   | Bumps the version of the node and every owner, tells sync subscribers now or at the end of the transaction, and queues one microtask for the others. | Size check on line 229 (`c19`): 1. Size check on line 235 (`c20`): 1. Both tests pin finding 21.                                                                                            |
| `settleTransaction()`                                              | 249–255   | Ends one transaction level; the outermost delivers.                                                                                                  | `pendingSync.size` (`c21`): none, fast path.                                                                                                                                                |
| `transactional()`                                                  | 263–277   | Binds a method to the proxy and runs each call as a transaction.                                                                                     | `new.target` branch (`c22`): 3 tests. One says a class stored as data stays constructible; two pin findings 6 and 42.                                                                       |
| `batch()`                                                          | 299–306   | Public: a transaction around direct writes.                                                                                                          | Not spiked: public API with its own test file.                                                                                                                                              |
| `flushNotifications()`                                             | 308–312   | The microtask that delivers to ordinary subscribers.                                                                                                 | Not spiked.                                                                                                                                                                                 |
| `deliver()`                                                        | 314–328   | Calls the listeners of a set of nodes. Copies the list first, and reports a throw to `console.error`.                                                | Without the copy (`c23`): the suite hangs, a subscriber that subscribes during delivery is served for ever. Without `try` (`c24`): 15.                                                      |
| `frozenValues`, `isImmutableValue()`                               | 334–342   | A frozen object is a value and is never proxied. The set remembers the answer because `Object.isFrozen` scans every property.                        | Never immutable (`c26`): 14. Without the set (`c25`): 1 test, which counts the scans.                                                                                                       |
| `isReadOnly()`                                                     | 345–347   | A Proxy must return the own value of a non-writable, non-configurable property.                                                                      | Its use in `linkChild` (`c27`): 5.                                                                                                                                                          |
| `linkChild()`                                                      | 354–379   | Makes a value a child of a node, or says it stays as it is.                                                                                          | The `descriptor` parameter (`c27b`): none, fast path. `existing ??` on line 376 (`c28`): none, dead.                                                                                        |
| `detachTruncatedChildren()`                                        | 382–390   | A write to `length` removes elements without a `delete` trap.                                                                                        | `c40`: 8.                                                                                                                                                                                   |
| `createNode()`                                                     | 395–545   | Builds the proxy and its four traps, registers the node, and indexes the whole input graph.                                                          | See the next table.                                                                                                                                                                         |
| `createClassyStore()`                                              | 566–571   | Public. Marks the node as a root and resumes it.                                                                                                     | `isStoreRoot` (`c52`): 2. `resumeScope()` (`c53`): 1 test, reachable only through freezing (finding 61).                                                                                    |
| `subscribe()`                                                      | 585–600   | Public. One listener entry per call; unsubscribing may suspend the node.                                                                             | The wrapper (`c54`): 2. Suspend on unsubscribe (`c55`): 1 test, which pins finding 67. The `if` around it (`c56`): none, dead.                                                              |
| `getVersion()`                                                     | 609–611   | Used by `history.ts` and `persist.ts` to tell "nothing changed".                                                                                     | Not spiked.                                                                                                                                                                                 |

### The traps inside `createNode()`

| Branch                                         | Lines   | Why it exists                                                                                       | Spike: what fails without it                                                                                      |
| ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `boundMethods`                                 | 400–403 | The same wrapper for a method on every read.                                                        | `c45`: 4.                                                                                                         |
| `set`: resume                                  | 407     | The node may be suspended.                                                                          | `c31`: 1, the fuzz test.                                                                                          |
| `set`: strip a tracking proxy                  | 409–412 | A row from a rendered list is stored as its snapshot, not as React's proxy.                         | `c34`: 2.                                                                                                         |
| `set`: accessor                                | 413–418 | A setter runs with the proxy as `this`.                                                             | `c35`: 8.                                                                                                         |
| `set`: `Object.hasOwn`                         | 422     | Writing `undefined` to a missing key, or a value equal to an inherited one, still creates the key.  | `c36`: 7.                                                                                                         |
| `set`: same child, given as its proxy          | 425     | `store.a = store.a` is no change.                                                                   | `c37`: 4.                                                                                                         |
| `set`: same child, given as its raw object     | 425     | The same, when the raw object holds the proxy (finding 10).                                         | `c38`: 2.                                                                                                         |
| `set`: array truncation                        | 428–439 | Detach the elements a shorter `length` removed.                                                     | `c40`: 8.                                                                                                         |
| `set`: a refused `length` that still truncated | 440     | A non-configurable index can stop a truncation half-way.                                            | `c41`: 1.                                                                                                         |
| `set`: re-read the own descriptor              | 444–448 | Link what the object now holds, not what was passed in.                                             | `!own` (`c42`): 2, a typed array and a Proxy target. Using the written value instead (`c58`): none, **untested**. |
| `set`: drop the cached wrapper                 | 455     | A reassigned method must not return the old wrapper.                                                | `c43`: 1.                                                                                                         |
| `get`: resume                                  | 462     | The node may be suspended.                                                                          | `c32`: 1.                                                                                                         |
| `get`: getter                                  | 464–477 | Memoized getters.                                                                                   | The main path, not spiked as a whole.                                                                             |
| `get`: functions of an array are not cached    | 486     | The comment gives no reason.                                                                        | `c44`: 2, both pin finding 5.                                                                                     |
| `get`: link on first read                      | 496–497 | An object the index missed: inherited from the prototype, or added by `defineProperty` (finding 1). | `c46`: 4.                                                                                                         |
| `defineProperty` trap                          | 502–513 | `Object.freeze(proxy)`: a property that became read-only stops being a child.                       | `c47`: 7, of which 2 are about freezing and 5 pin findings 61 and 67. The embedded-store exception (`c48`): 1.    |
| `deleteProperty`: resume                       | 516     | The node may be suspended.                                                                          | `c33`: 3.                                                                                                         |
| `deleteProperty`: drop the cached wrapper      | 520     | A deleted own method must uncover the class method.                                                 | `c50`: 1.                                                                                                         |
| Index the input graph                          | 532–543 | Every nested object gets its node at creation, because a snapshot copies only what has a node.      | `c51`: 111.                                                                                                       |

## `ownership.ts`: every member and why it exists

| Member                                        | Lines     | Why it exists                                                                                                   | Spike: what fails without it                                                                                                     |
| --------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `version`, the listener sets, `computedCache` | 7–13      | Per-node state that `core.ts` reads and writes. `ownership.ts` only reads the listener sets, in `canSuspend()`. | Not spiked.                                                                                                                      |
| `isStoreRoot`                                 | 8         | A root is never suspended.                                                                                      | `o08`: 2 tests, one about owner order (finding 69).                                                                              |
| `childInternals`                              | 14        | The edges from a node to its children, by key.                                                                  | Not spiked: everything reads it.                                                                                                 |
| `parents`, with a count                       | 15        | Who is told about a write. A count, because one owner can hold a child under two keys.                          | Count ignored (`o06`): 5.                                                                                                        |
| `reference`, a `WeakRef` or a strong fallback | 16–17     | A child must not keep a dropped owner alive.                                                                    | Always strong (`o20`): 5. No fallback (`o17`): 6, all tests that remove `WeakRef` or `FinalizationRegistry` from the runtime.    |
| `parentCleanup`, `trackSharedParents()`       | 18, 59–76 | Drops the link to a collected owner without waiting for a write below the child.                                | `o05`: 2 tests, both read `parents.size`.                                                                                        |
| `detachedVersions`, `detachedParent`          | 22–23     | The state of a suspended node.                                                                                  | See `o15` and `o16`.                                                                                                             |
| `attach()`                                    | 30–36     | Put a child under a key.                                                                                        | Same-child guard (`o01`): 1, owner order. `child.resume()` (`o02`): 4.                                                           |
| `detach()`                                    | 38–44     | Remove the child under a key.                                                                                   | `suspendIfDetached()` (`o03`): 8.                                                                                                |
| `connect()`                                   | 46–54     | Add this node to the child's owners.                                                                            | Clearing `detachedParent` (`o04`): 1. The `!count` guard: a listed mutant, memory only.                                          |
| `disconnect()`                                | 78–87     | Remove this node from the child's owners.                                                                       | `count > 1` (`o06`): 5. `count === undefined` (`o07`): none, dead.                                                               |
| `canSuspend()`                                | 89–97     | No owner, not a root, no subscriber, not suspended already.                                                     | Root (`o08`): 2. Already suspended (`o09`): 2. Subscribers (`o10`): 8.                                                           |
| `suspendIfDetached()`                         | 99–114    | Cut the links from an unreachable container to its children, and remember their versions.                       | Links kept (`o11`): 14. No recursion (`o12`): 8. Never suspend (`o16`): 9.                                                       |
| `resume()`                                    | 116–144   | Restore the links, and bump the version if a child changed meanwhile.                                           | Version bump (`o13`): 16. `!frame` (`o21`): none, dead. `child.detachedVersions` guard (`o22`): none, fast path.                 |
| `resumeScope()`                               | 147–156   | Walk up to the topmost suspended container and resume from there.                                               | The walk (`o14`): 5, all pin findings 61 and 67. The walk and `detachedParent` (`o15`): 6, the same 5 and the pin of finding 68. |
| `ancestors()`                                 | 159–169   | This node and every owner above it. `notifyMutation()` is the only caller.                                      | Pruning dead links (`o18`): none, memory only.                                                                                   |

## `snapshot.ts`: every function and why it exists

| Function or state                                 | Lines   | Why it exists                                                                                               | Spike: what fails without it                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshotCache`                                   | 13      | Raw object to its last snapshot and the version it was made at. This is structural sharing.                 | `s20`: 111.                                                                                                                                                                                                                                                                       |
| `snapshotGetterCache`                             | 19–22   | A getter read twice on one snapshot gives one result.                                                       | `s01`: 3, all about an older snapshot read after a newer one, or nested getters.                                                                                                                                                                                                  |
| `originalAccessors`, `originalSnapshotAccessor()` | 26–33   | `cloneSnapshot` (history and persist) needs the user's own getter back, not the memoizing one.              | Stub (`s10`): 2. `own ? descriptor : null` (`s17`): 1. The `getter &&` guard (`s23`): none, dead.                                                                                                                                                                                 |
| `crossSnapshotMemo`                               | 59–62   | A getter result stays the same object across snapshots while what it read is unchanged.                     | `s02`: 13.                                                                                                                                                                                                                                                                        |
| `computeWithTracking()`                           | 72–96   | Runs a getter with `this` set to a recording proxy.                                                         | `readProps` (`s04`): none, fast path.                                                                                                                                                                                                                                             |
| `areMemoizedDepsValid()`                          | 104–110 | Compares each recorded read with the current snapshot.                                                      | Covered by `s02`.                                                                                                                                                                                                                                                                 |
| `evaluateSnapshotGetter()`                        | 121–162 | The two caches above, in order.                                                                             | `s01`, `s02`.                                                                                                                                                                                                                                                                     |
| `markSnapshotForTracking()`                       | 166–180 | Tells proxy-compare to track class instances, and not to track an object with an object under a symbol key. | No marking (`s06`): 11. No symbol check (`s05`): 2. A shorter descriptor test (`s18`): none, dead.                                                                                                                                                                                |
| `snapshotValue()`                                 | 183–193 | The child's snapshot if the key has a child node, else the value itself.                                    | Covered by `s20` and `c51`.                                                                                                                                                                                                                                                       |
| `installMemoizedGetters()`                        | 196–221 | Defines each getter of the object and its classes on the snapshot as a memoizing getter.                    | `seen` (`s09`): 4. Stop at `Object.prototype` (`s16`): 19. Getter for a setter-only accessor (`s08`): none, see the deletion list. `this` or `snap` (`s22`): none.                                                                                                                |
| `createSnapshotRecursive()`                       | 235–288 | Builds one frozen node, reusing cached children.                                                            | Cycle error (`s11`): 7. `defineProperty` not assignment (`s15`): 5. Accessors skipped in the data loop (`s21`): 1. Array fast path (`s07`): 2, both pin finding 71. Freeze (`s19`): 42. `registerSnapshot` (`s14`): 8. Flags (`s13`) and `inProgress.delete` (`s12`): none, dead. |
| `snapshot()`                                      | 308–311 | Public.                                                                                                     | Not spiked.                                                                                                                                                                                                                                                                       |

## Code that can be deleted with no test failing

"Lines" is the change in line count of the file.

| Spike  | File           | What                                                                    | Lines | Kind                                                                                                                                                                                                            |
| ------ | -------------- | ----------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c06`  | `core.ts`      | The ternary in `activeTracker()`                                        | 0     | **Fast path, and a large one.** The mutation list calls it "same behaviour". Without it every read looks up index −1 of an empty array, and a read costs almost twice as much. See "The combination".           |
| `c11`  | `core.ts`      | `if (!cached) return false` in `areDepsValid()`                         | −1    | Dead at run time. The type checker needs the narrowing, so the check is merged into the next line instead of deleted.                                                                                           |
| `c28`  | `core.ts`      | `existing ??` in `linkChild()`                                          | 0     | Dead. `createNode()` begins with the same lookup.                                                                                                                                                               |
| `c56`  | `core.ts`      | The `if` around `suspendIfDetached()` in the unsubscribe function       | 0     | Dead. `suspendIfDetached()` checks its own conditions.                                                                                                                                                          |
| `o07`  | `ownership.ts` | `if (count === undefined) return` in `disconnect()`                     | −1    | Dead at run time. The type checker needs the narrowing: `?? 0` on the line above does the same in less.                                                                                                         |
| `o21`  | `ownership.ts` | `if (!frame) break` in `resume()`                                       | −2    | Dead. `pop()` runs only while the list is not empty. Written as `for (let frame = pending.pop(); frame; frame = pending.pop())` the loop needs no check.                                                        |
| `s12`  | `snapshot.ts`  | `inProgress.delete(target)`                                             | −1    | Dead. A finished node is in the cache, and the cache is read before `inProgress`.                                                                                                                               |
| `s13`  | `snapshot.ts`  | `configurable: true` twice and `writable: true`                         | −3    | Dead. `Object.freeze` sets both to false before the snapshot leaves.                                                                                                                                            |
| `s18`  | `snapshot.ts`  | `descriptor && 'value' in descriptor &&` in `markSnapshotForTracking()` | −2    | Dead. The `typeof descriptor.value === 'object'` test that follows rejects the same cases.                                                                                                                      |
| `s23`  | `snapshot.ts`  | `getter &&` in `originalSnapshotAccessor()`                             | 0     | Dead. `WeakMap.get(undefined)` is `undefined`.                                                                                                                                                                  |
| `c03`  | `core.ts`      | The early return in `identityOf()`                                      | −1    | Fast path.                                                                                                                                                                                                      |
| `c21`  | `core.ts`      | `&& pendingSync.size` in `settleTransaction()`                          | 0     | Fast path.                                                                                                                                                                                                      |
| `c27b` | `core.ts`      | The `descriptor` parameter of `linkChild()`                             | −1    | Fast path. It saves one descriptor lookup per linked object. Removing it takes `linkChild()` from five parameters to four.                                                                                      |
| `o22`  | `ownership.ts` | `if (child.detachedVersions)` in `resume()`                             | 0     | Fast path.                                                                                                                                                                                                      |
| `s04`  | `snapshot.ts`  | `readProps` in `computeWithTracking()`                                  | −4    | Fast path. Without it a property read twice is recorded twice and compared twice.                                                                                                                               |
| `o18`  | `ownership.ts` | Pruning a dead link in `ancestors()`                                    | 0     | Memory only.                                                                                                                                                                                                    |
| `c58`  | `core.ts`      | The re-read of the own descriptor in the `set` trap                     | −5    | **Untested.** See below.                                                                                                                                                                                        |
| `s08`  | `snapshot.ts`  | The memoizing getter installed for an accessor that has only a setter   | 0     | **Untested.** See below.                                                                                                                                                                                        |
| `s22`  | `snapshot.ts`  | `this` passed to `evaluateSnapshotGetter()`, where `snap` would do      | 0     | **Untested.** `this` differs from `snap` only for an object that inherits from a snapshot, or for the copy proxy-compare makes of a frozen snapshot. Not a deletion; noted because no test tells the two apart. |

The dead rows total **10 lines** over the three files (`r5` in Appendix A
applies them all: 1,341 tests pass and the typecheck passes). The fast paths
are another 6 lines. None of them should go without a benchmark: `c06` shows
why.

**`c58` is untested, not dead.** The `set` trap writes the value and then
reads the property back, to link what the object now holds. `c58` links the
value that was passed in. A script shows where the two differ (output in
Appendix A under `y0` and `y6`):

| Case                                                                  | Unmodified                       | With `c58`                                  |
| --------------------------------------------------------------------- | -------------------------------- | ------------------------------------------- |
| A typed array as the store, `store[0] = {a: 1}` (the array holds NaN) | `typeof store[0]` is `'number'`  | `'object'`: a proxy of an object not stored |
| A state object that is a Proxy and stores a copy of what it is given  | `store.x` is a proxy of the copy | a proxy of the object that was passed in    |

For a plain object, an array or a class instance the two are the same. So the
re-read has a reason, and no test states it. **Recommendation: keep the code
and add the two cases as tests. Can follow 1.0.**

**`s08` is untested, not dead.** `installMemoizedGetters()` installs a getter
for an accessor that has only a setter. With `s08` the key is gone from the
snapshot (Appendix A, `y0` and `y7`):

| Case                                 | Unmodified                                                       | With `s08`          |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------- |
| `{n: 1}` with an own `set onlySet()` | `'onlySet' in snapshot` is true, keys are `n, onlySet`           | false, keys are `n` |
| A class with `set onlySet()`         | `onlySet` is an own key of the snapshot, listed by `Object.keys` | not an own key      |

The own case matches the store, where the key is also listed. The class case
does not: the store does not list a class setter in `Object.keys`, the
snapshot does. **Recommendation: add a test for the own case. Decide the
class case with the question of whether class getters should be own keys of
a snapshot at all.**

## Deletions that fail only tests which pin a stage 1 finding

These are the more useful result. In each case the code that was deleted is
the cause of the finding, and the tests that fail are the ones stage 1 wrote
to pin it.

| Spike        | What is deleted                                                            | Lines                | Tests that fail | Finding it changes                                                                         |
| ------------ | -------------------------------------------------------------------------- | -------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `c14`        | `if (!Reflect.has(dep.target, dep.prop)) return false` in `areDepsValid()` | −1, and 3 of comment | 5               | 32: a getter that reads a missing property is recomputed on every read.                    |
| `c44`        | `if (Array.isArray(_target)) return transactional(method, receiver)`       | −1, and 1 of comment | 2               | 5: a function read from an array is a new wrapper on every read.                           |
| `c07`        | The same-node rule in `recordDep()`                                        | −2, and 3 of comment | 2               | 36: a getter that reads another store, or a child through a held reference, stays stale.   |
| `c08`        | The same-node rule in `recordComputedDep()`                                | −1                   | 1               | 36, for a getter that reads a getter of another store.                                     |
| `s07`        | The primitive fast path for array elements in `createSnapshotRecursive()`  | −2                   | 2               | 71: an array element redefined to a primitive disagrees between store and snapshot.        |
| `o14`, `o15` | The walk in `resumeScope()`, and `detachedParent` with it                  | −6, −9               | 5, 6            | 66, 67, 68.                                                                                |
| `o16`, `x1`  | Suspension as a whole                                                      | −85                  | 9               | 61, 66, 67 and 69. It costs a 275 times slower write in one case: see "Hardest places", 1. |
| `c19`, `c20` | The `size` checks in `notifyMutation()`                                    | 0, −1                | 1, 1            | 21: whether a late subscriber hears an earlier write.                                      |

Each was run again with a script that reproduces the finding, before and
after. The full outputs are in Appendix A under `y0` to `y8`.

| Spike        | Before                                                                                                              | After                                                                                                           | Cost                                                                                                                             | Recommendation                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `c14`        | A getter that reads a missing property returns a new object on every read.                                          | One object. It is still recomputed when the property appears, and when an inherited value shows after a delete. | None found. Five tests flip.                                                                                                     | **Do it. Before 1.0**: it changes how often a getter runs, which stage 1 pinned.                                                 |
| `c44`        | `list[0] === list[0]` is `false` for a function; `indexOf` gives −1; `splice(indexOf(f), 1)` removes the wrong one. | `true`, 0, and the right one.                                                                                   | One cached wrapper per array method that is read. Two tests flip.                                                                | **Do it. Before 1.0**: `list.push === list.push` becomes true.                                                                   |
| `c07`        | A getter that reads another store, or its own child through a held reference, stays stale.                          | Both follow.                                                                                                    | **A cached read of a getter that sums 1,000 rows goes from 80 ns to 26,120 ns**, because every row read is now a recorded entry. | **Do not delete.** The rule is what keeps a cached read cheap. See "Hardest places", 2, for what a fix needs.                    |
| `c08`        | A getter that reads a getter of another store stays stale.                                                          | It follows.                                                                                                     | One entry per such read. One test flips.                                                                                         | **Not alone.** With it, `other.total` is followed and `other.n` is not. Decide together with `c07`.                              |
| `s07`        | After `defineProperty(rows, 0, {value: 7})` the store shows the old object and the snapshot shows 7.                | Both show the old object.                                                                                       | A map lookup for every primitive element of every array snapshot.                                                                | **Do not.** It makes the snapshot wrong in the same way as the store. The fix belongs in the `defineProperty` trap (finding 45). |
| `c19`, `c20` | A subscriber added after a write hears it only if another subscriber of that kind already existed.                  | It always hears it.                                                                                             | A node without listeners is queued and then skipped.                                                                             | **Stage 3 decides** which of the two is the rule (finding 21). The deletion gives one consistent answer.                         |

### Seen on the way: a function wrapper ends up in the raw object

Not in stage 1's list. On the unmodified library (Appendix A, `y0`):

- After `store.callbacks.reverse()` the raw array holds the store's wrappers,
  not the original functions, and `snapshot(store).callbacks[0]` is a wrapper
  too. Each further reorder wraps them once more.
- `store.cb = store.cb` calls a sync subscriber once, and the raw object then
  holds the wrapper instead of the function.

The cause is in the `set` trap: it recognises a child's proxy that is
assigned back (`core.ts:425`) and strips a tracking proxy
(`core.ts:409-412`), but it stores a function wrapper as it is. This is
finding 10 for functions, and it belongs with findings 5, 6, 42 and 62. `c44`
does not change it.

## Duplicated logic

| #   | What                                                                         | Where                                                                                                     | Proposal                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Two getter-memoization engines with different rules                          | `core.ts:58-196` and `snapshot.ts:35-162`                                                                 | Keep two engines: a live getter must return live proxies and a snapshot getter frozen ones. Write the rules they must share in one place and test both against them. See "Hardest places". |
| D2  | Two walks up the prototype chain for a descriptor, with different stop rules | `utils/internal/internal.ts:88-99` (walks to `null`), `snapshot.ts:198-219` (stops at `Object.prototype`) | One walk. The difference is finding 47: the live store treats `__proto__` as a getter and memoizes it, the snapshot does not.                                                              |
| D3  | Three ways to drop the link from a child to an owner that is gone            | `ownership.ts:99-114` (suspension), `59-76` (registry), `165` (pruning)                                   | One or two. See `x1`.                                                                                                                                                                      |
| D4  | `resumeScope()` before every entry point                                     | `core.ts:208, 407, 462, 516, 569`                                                                         | The `defineProperty` trap was missed, which is findings 61, 66 and 67. Remove suspension, or put the rule in one place.                                                                    |
| D5  | "Copy the pending set, clear it, deliver"                                    | `core.ts:251-253` and `core.ts:309-311`                                                                   | One helper that takes the set and the listener kind.                                                                                                                                       |
| D6  | The tracker lookup and the same-node rule                                    | `core.ts:85-91` and `core.ts:117-119`                                                                     | One `recordDep(node, entry)`.                                                                                                                                                              |
| D7  | Strip a tracking proxy                                                       | `core.ts:45` in `unwrap()` and `core.ts:409-412` in the `set` trap                                        | One helper.                                                                                                                                                                                |
| D8  | Look up an existing node by proxy                                            | `core.ts:364` and `core.ts:396`                                                                           | Keep the one in `linkChild()`, which needs the answer, and drop `existing ??` on line 376 (`c28`).                                                                                         |
| D9  | `typeof value !== 'object' \|\| value === null`                              | `core.ts:42, 54, 361, 410`, `snapshot.ts:258`, `utils/internal/internal.ts:57, 71`                        | One `isObject()` helper. Four of the seven are fast paths in front of a lookup that would miss anyway.                                                                                     |
| D10 | "Get the map for this key, or create it"                                     | `snapshot.ts:146-149` and `snapshot.ts:154-158`                                                           | One helper. The first copy creates its map after the getter ran, which is finding 37.                                                                                                      |
| D11 | `detach`, drop the cached wrapper, notify                                    | `core.ts:450-457` and `core.ts:519-521`                                                                   | Small. Leave unless the traps are rewritten.                                                                                                                                               |
| D12 | "Is this descriptor a data property"                                         | `core.ts:414, 447, 539`, `snapshot.ts:174, 204, 267`                                                      | Small. Three of the six are listed as mutants that change nothing.                                                                                                                         |

## State kept in two places

| #   | What                                                                                                 | Where                                                                                                  | What goes wrong when they disagree                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | What a property holds: the raw object's own value, and `childInternals`                              | Written in `core.ts:448-450, 497, 510, 519, 540`; trusted in `core.ts:93, 134, 497`, `snapshot.ts:189` | The traps keep them in step. Anything that goes round the traps does not: a raw write (finding 11), `defineProperty` (1, 45, 71), freezing the raw object (46). The `get` trap and the snapshot then return the old child. |
| T2  | An edge: `childInternals` on the owner, `parents` on the child                                       | `ownership.ts:30-54, 78-87`                                                                            | During suspension they disagree on purpose, and `detachedVersions` is a third copy. Findings 61, 66 and 67 are this state going wrong.                                                                                     |
| T3  | The owner of a getter's dependencies: `parent`, `target` and `internal` in `DepEntry`                | `core/core.types.ts:10-27`, `core.ts:95-103, 121`                                                      | Nothing today. All three always name the getter's own node, because of the same-node rule. `areDepsValid(node, deps)` would need none of them.                                                                             |
| T4  | Raw object and its node: `target` passed beside `internal`                                           | `snapshot.ts:235-239, 191, 310`                                                                        | Nothing today. `target` is always `internal.target`. One parameter would do.                                                                                                                                               |
| T5  | Raw to snapshot in `snapshot.ts` (`snapshotCache`), snapshot to raw in `core.ts` (`snapshotSources`) | `snapshot.ts:13, 283-285`, `core.ts:17, 23-25`                                                         | Nothing today. Two modules each hold half of one relation.                                                                                                                                                                 |
| T6  | The cached wrapper of a function, and the function the object holds                                  | `core.ts:400-403, 455, 487-491, 520`                                                                   | Dropped on `set` and `delete` only. After `defineProperty` or a prototype swap the old wrapper is returned (finding 47).                                                                                                   |

## Names and comments that no longer match

| #   | Where                                       | What it says                                                                       | What is true                                                                                                                                                                                               |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | `ownership.ts:6`, and `internal` everywhere | `StoreInternal`, `internalsMap`, `childInternals`                                  | The class's own comment calls it "one canonical node per raw object". Newer code says `node`, `createNode`, `targetNodes`, `owners`. Two words for one thing.                                              |
| N2  | `core.ts:204`                               | `getInternal()`                                                                    | It also resumes a suspended subtree. Seven adapters call it only to throw on a non-store, and ignore the result.                                                                                           |
| N3  | `ownership.ts:159`                          | `ancestors()`                                                                      | The result starts with the node itself. The one caller names it `owners`.                                                                                                                                  |
| N4  | `ownership.ts:99`                           | `suspendIfDetached()`                                                              | It suspends only if the node also has no subscriber and is not a root. "Detached" also names two different things: an edge removed by `detach()`, and a suspended node.                                    |
| N5  | `ownership.ts:22`                           | `detachedVersions`                                                                 | Its presence is the "suspended" flag. Nothing says so.                                                                                                                                                     |
| N6  | `ownership.ts:20-21`                        | "Retaining one row must not keep every filtered array alive."                      | With `WeakRef` a child never keeps an owner alive, suspended or not (measured, `x1`). Without `WeakRef` it does, through `detachedParent` (finding 68). What suspension gives is a bounded cost per write. |
| N7  | `core/core.types.ts:8`                      | "`value`: dependency is a primitive"                                               | A `value` entry is any property with no child node: a `Date`, a `Map`, a frozen object, a class instance, a missing property. The comment also lists two kinds of three.                                   |
| N8  | `core/core.types.ts:15`                     | "Parent target"                                                                    | The field holds a node, not a target.                                                                                                                                                                      |
| N9  | `core.ts:88-90`                             | "Child-proxy reads don't need explicit tracking because child mutations bubble up" | True only for a child reached through the getter's own object. A child reached another way is not tracked at all (finding 36).                                                                             |
| N10 | `core.ts:485`                               | "Array prototype methods should not be cached the same way as class methods."      | No reason is given, the line also covers functions stored as elements, and deleting it fails only the pins of finding 5.                                                                                   |
| N11 | `core.ts:198`                               | "Public helpers"                                                                   | `getInternal()` is not exported from any public entry.                                                                                                                                                     |
| N12 | `core.ts:603-607`                           | `getVersion()` is "useful for debugging, custom cache invalidation, or testing"    | It is internal. History and persist use it.                                                                                                                                                                |
| N13 | `core.ts:330-390`                           | These five functions sit under the heading "Mutation notification"                 | They decide what is proxied. They belong with `createNode()`.                                                                                                                                              |
| N14 | `utils/internal/internal.ts:63-64`          | `canProxy()` decides what is "deep-cloned in snapshots (`snapshot.ts`)"            | `snapshot.ts` does not call `canProxy()` and clones nothing. It copies what has a child node and shares every other value by reference.                                                                    |
| N15 | `snapshot.ts:306`                           | "@returns A deeply frozen plain-JS object"                                         | The snapshot keeps its class as prototype, and a `Date` or `Map` inside it is the store's own object, not frozen.                                                                                          |
| N16 | `core.ts:241, 246`                          | `pendingNotifications` and `pendingSync`                                           | The first holds nodes with ordinary subscribers, the second nodes with sync ones. The names do not say which is which.                                                                                     |
| N17 | `core.ts:400`                               | `boundMethods`                                                                     | It holds every function-valued property, including callbacks and classes stored as data (findings 6 and 42).                                                                                               |

## Module boundaries as they are

```text
types.ts, core/core.types.ts     types only
utils/internal/internal.ts       canProxy, findPropertyDescriptor, getArrayIndex, mapOwnArrayElements
        ▲                ▲
        │                │
core/ownership.ts ◄── core/core.ts ◄── snapshot/snapshot.ts ──► proxy-compare (markToTrack)
 (StoreInternal)            ▲                 ▲
                            └── storeRuntime.ts ──┘   (re-exports for every entry point)
```

- `core.ts` imports the `StoreInternal` class from `ownership.ts`.
  `ownership.ts` imports only a type from `core.types.ts`.
- `snapshot.ts` imports `getInternal` and `registerSnapshot` from `core.ts`.
  `core.ts` does not import `snapshot.ts`.
- There is no import cycle at run time.

**What `core.ts` knows about `ownership.ts`: nearly everything.**
`StoreInternal` has eleven fields, and eight are public. `core.ts` reads or
writes all eight: `target`, `proxy`, `version` (it does the `version++`),
`childInternals`, `syncListeners`, `batchedListeners`, `computedCache` and
`isStoreRoot`. It calls five methods: `attach`, `detach`, `ancestors`,
`resumeScope` and `suspendIfDetached`.

**What `ownership.ts` knows about `core.ts`: it stores things for it.**
`computedCache` is never read in `ownership.ts`. The two listener sets are
read once, in `canSuspend()`. So `StoreInternal` is two things in one class:
the ownership graph, and a bag of per-node state that belongs to `core.ts`.

**What `snapshot.ts` knows about the other two.** It reads `internal.target`,
`internal.version` and `internal.childInternals` directly. It calls
`getInternal()`, which resumes a suspended subtree as a side effect. It reports
each snapshot to `core.ts` through `registerSnapshot()`.

**What `core.ts` knows about snapshots and React.** It holds two registries
that are not about the write proxy: `snapshotSources` (snapshot to raw object)
and `trackedSnapshots` (React tracking proxy to snapshot).

### Where a boundary leaks

| #   | Leak                                                                                                                                                                                                         | Where                                                           | Proposal                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | **The suspension rule lives in the caller.** `core.ts` must call `resumeScope()` before it touches a node, at five places, and `suspendIfDetached()` after an unsubscribe. One place was missed.             | `core.ts:208, 407, 462, 516, 569, 598`                          | Remove suspension (`x1`). If it stays, no caller should know it exists.                                                                                                                                |
| L2  | **The version is written from two modules.** `core.ts` bumps it in `notifyMutation()`, and `ownership.ts` bumps it in `resume()`.                                                                            | `core.ts:224`, `ownership.ts:131`                               | One writer. Without suspension only `core.ts` writes it.                                                                                                                                               |
| L3  | **`snapshot.ts` reads the edge map itself** and trusts it over the object.                                                                                                                                   | `snapshot.ts:189`                                               | Acceptable while there is one reader. It is the reason T1 matters to snapshots.                                                                                                                        |
| L4  | **The core knows React's tracking library.** `snapshot.ts` calls proxy-compare's `markToTrack` on every snapshot node, and `core.ts` keeps `trackedSnapshots` and strips tracking proxies in the `set` trap. | `snapshot.ts:1, 166-180, 281`, `core.ts:20, 28-35, 45, 409-412` | It cannot move without a hook, because a snapshot must be marked before React wraps it. Worth knowing: every entry point, Vue and Svelte included, carries this. The size it adds is not measured yet. |
| L5  | **`getInternal()` is three things:** an assertion, a resume, and access to the node. The seven adapters want only the first.                                                                                 | `core.ts:204-210`, and seven adapter files                      | Split: an `assertStore(proxy)` for the adapters, and the node lookup for `snapshot.ts`.                                                                                                                |
| L6  | **Identity helpers live in the write proxy's file.** `unwrap`, `identityOf`, `isTrackingProxy` and the two registries are used by the collections and by React, not by the traps.                            | `core.ts:10-56`                                                 | Their own module. `core.ts` would then hold four concerns instead of five: getter tracking, notification, the traps, and the public functions.                                                         |

## The places that are hardest to reason about

The plan names two candidates. The first is confirmed. The second is
corrected: the three kinds are not the hard part, the two engines are.

### 1. Suspend and resume in `ownership.ts` (confirmed)

What makes it hard:

- **Hidden state.** A node is suspended exactly when `detachedVersions` is
  set. While it is, the owner lists the child and the child does not list the
  owner.
- **The rule is enforced by the caller.** Every entry point in `core.ts` has
  to resume first. Stage 1 found the one that does not (findings 61, 66, 67).
- **It is the third of three mechanisms for one job.** A link from a child to
  an owner that is gone is removed by suspension, by a
  `FinalizationRegistry`, and by pruning in `ancestors()`.
- **It depends on the runtime.** Without `WeakRef` the link upward is strong,
  and suspension then keeps alive what it was written to release (finding 68).
- **Most of it is tested only through its own defects.** `c53` and `c55`
  each fail one test that needs a freeze to show anything, and `o14` and
  `o15` fail only pins of findings.

**Three variants were run**, each with the reproductions of findings 61, 66,
67 and 69 and with a measurement of what suspension is for. The outputs are
in Appendix A under `x0` to `x3`.

| Variant                                                           | Lines  | Tests failing                                                                                        | 61 and 67 (stale snapshot, missed write) | 66 (read never returns) | 68 (list kept alive without `WeakRef`) | 69 (owner order depends on hidden state) | Write to a row that outlived 2,000 lists |
| ----------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------- | -------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `x0`: unmodified                                                  | 0      | 0                                                                                                    | present                                  | present                 | present                                | present                                  | 446 ns, 1 owner link                     |
| `x3`: stage 1's fix, `resumeScope()` in the `defineProperty` trap | +1     | 5, all pins of 61 and 67                                                                             | gone                                     | gone                    | present                                | present                                  | not measured, same code path as `x0`     |
| `x2`: delete `detachedParent` and the walk in `resumeScope()`     | +1 −10 | 6: the same 5 and the pin of 68                                                                      | gone                                     | gone                    | gone                                   | present                                  | 434 ns, 1 owner link                     |
| `x1`: delete suspension as a whole                                | +1 −85 | 9: the same 5, 2 pins of 69, 1 test that reads `parents.size`, 1 test of a runtime without `WeakRef` | gone                                     | gone                    | worse: every removed list is kept      | gone: one fixed order                    | **122,610 ns, 2,001 owner links**        |

Typecheck passes for `x1` and `x2`.

**What suspension buys, measured.** One row is held while its list is
replaced 2,000 times with `store.items = store.items.filter(...)`:

- With suspension the row has 1 owner link, and a write to it costs about
  450 ns.
- Without it (`x1`) the row has 2,001 owner links until the garbage collector
  runs, and a write costs about 123,000 ns, because every write bumps the
  version of every former list. After a forced collection the count is back
  to 1 and the cost to 468 ns.
- If something keeps the old lists alive, the cost stays. In the test the
  caller held them: 114,000 ns per write. In an application `withHistory()`
  does the same: a held snapshot keeps its raw list alive
  (`snapshotSources`), and the raw list keeps its node alive
  (`targetNodes`). That chain is from reading the code, not from a run.

So the comment at `ownership.ts:20-21` gives the wrong reason. With `WeakRef`
a held row never keeps a removed list alive, suspended or not. What
suspension gives is that a write costs the same however many former lists
are still around. That is worth keeping.

**What the walk and `detachedParent` buy: nothing.** `x2` removes both. Every
node already saves its children's versions when it is suspended, so each
node can resume on its own when it is touched, and its container catches up
when the container is touched. The walk to the topmost suspended container
is what goes wrong when a trap has removed a child from a suspended
container: the walk resumes the container, which no longer lists the child,
and the child stays suspended. That is findings 61 and 67, and the loop of
finding 66. The pointer is also the strong link of finding 68.

**Recommendation: do `x2`. Label: Can follow 1.0**, as it removes defects and
changes no documented behaviour. Do not do `x1`.

- **What it changes for a user:** the first snapshot after freezing a removed
  container is current, a subscriber added then hears the next write, and
  the read of finding 66 returns. Nothing else.
- **Cost for stage 4:** `ownership.ts` only, 10 lines out. Six tests flip
  and are rewritten to assert the corrected behaviour (five in
  `core.unobservedObjects.test.ts` and `core.removedContainers.test.ts`, one
  in `core.noWeakRefMemory.test.ts`). Add a test for finding 66, which could
  not be pinned before because it hung. The mutation list loses the
  `resumeScope` entry. No number in `CONSTRAINTS.md` moves. Risk: low, the
  fuzz test passes.
- **Follow-up that `x2` makes possible:** with the walk gone,
  `resumeScope()` is `resume()`. The five call sites in `core.ts` remain
  (leak L1). A second step could move them behind `ownership.ts`.
- **Finding 69** stays. The decision document should mark the order of owner
  notifications as unspecified.

### 2. Two getter engines, not three kinds of dependency (corrected)

The three kinds in `core.ts` are each simple: compare a value, compare a
child's identity and version, or check another getter's cache. Each is needed
(`c10`, `c12`, `c13`, `c15` all fail tests of promised behaviour).

What is hard is that the library memoizes getters twice, with different
rules:

|                                     | Live store (`core.ts:58-196`)                                  | Snapshot (`snapshot.ts:35-162`)                                |
| ----------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| What is recorded                    | Reads on the getter's own node, through the store's `get` trap | Reads on `this`, through a throwaway proxy over `{}`           |
| Kinds of dependency                 | Three                                                          | One: the value read                                            |
| A cycle of getters                  | A clear error                                                  | Stack overflow (finding 38)                                    |
| A missing property                  | Recomputed on every read (finding 32)                          | Cached                                                         |
| `Object.keys(this)`, `in`           | Read, not tracked, so stale (finding 30)                       | Sees no keys at all (finding 31)                               |
| `this`                              | The store proxy                                                | A proxy over an empty object (finding 41)                      |
| Another store                       | Not tracked: cached for good (finding 36)                      | Not tracked: cached while the store's own fields are unchanged |
| A getter that throws, then recovers | Stays on the fallback (finding 36)                             | Recovers                                                       |

Nine stage 1 findings (30 to 32 and 36 to 41) are a difference between these
two columns or a gap in one of them.

Inside the live engine, the one rule that is hard to hold in mind is the
same-node rule (`core.ts:91, 119`): a read is recorded only if it is on the
getter's own object. It keeps validation cheap, because one `version` entry
covers a whole child subtree. It is also why a getter that reads anything
outside its own object goes stale. `c07` and `c08` show what removing it does.

### 3. The `set` trap (`core.ts:406-459`)

Fifty-four lines, eleven special cases in one function: strip a tracking
proxy, hand over to a setter, three ways a write can be "no change", array
truncation, a truncation that was refused half-way, re-reading what was
stored, linking or detaching the child, dropping a cached wrapper, notifying.
Two flags (`written`, `truncated`) carry state between them. The `c58`
result shows the cost: one step can go and no test notices.

### 4. The mirror of the object graph (`childInternals`)

`childInternals` must list exactly the own properties that hold a proxyable
object. Five places write it (`core.ts:448-450, 497, 510, 519, 540`) and four
trust it (`core.ts:93, 134, 497`, `snapshot.ts:189`). `linkChild()` has four
ordered exceptions, and `createNode()` and `linkChild()` call each other
through a work list. Nothing states the invariant, and no single function
enforces it. Findings 1, 11, 45, 46 and 71 are all cases where the mirror
and the object disagree.

## How many lines the three files could lose

Not computed yet. Known so far: 9 dead lines, 6 lines of fast paths, and the finding-fixing deletions in the table above.

## Compared with the stage 2 report

I read `review/stage-2-report.md` after the tables above and the suspension
and reproduction results were in this file. The combination run and the
total were written after it. I did not read any report under
`review/stage-2/`.

### Where the two agree

| Point                                     | Stage 2 report                                                                                        | This review                                                                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The walk to a detached parent can go      | Valtio has no such pointer and returns from the read that hangs ours. Listed as spike 4 for stage 3.  | Run as `x2`: 10 lines out, six tests flip, all pins of findings 61, 67 and 68, and the read of finding 66 returns.                                                                                                               |
| The cause of finding 37 is one line       | Defect 7.                                                                                             | Duplication D10: the same "get or create" block is written twice, and the first copy creates its map too late.                                                                                                                   |
| `Object.defineProperty` should be a write | Four libraries do it. A sketch fixed findings 1, 45, 66 and 71.                                       | State T1 and spike `s07`: the store's edge map and the object disagree after `defineProperty`, and the fix belongs in the trap, not in the snapshot.                                                                             |
| A getter should record each property once | Defect 3: 2,000 entries for a loop over 1,000 rows.                                                   | The snapshot engine already does this (`readProps`, spike `s04`). The live engine does not. It is one of the differences in "Hardest places", 2.                                                                                 |
| Subscriber delivery needs one queue       | Four libraries; findings 18 to 23.                                                                    | Duplication D5, and spikes `c19`, `c20` and `c23`, which show that today's rules for a late subscriber come from two `size` checks and one array copy.                                                                           |
| Functions held in a store                 | Return a stored function as it is, and bind only methods found on a prototype. Fixes 5, 6, 42 and 62. | `c44` fixes finding 5 alone by caching. The stage 2 change is the better one: it removes the cause, and it should also remove the wrapper that ends up in the raw object ("Seen on the way"). **If it is approved, drop `c44`.** |

### What this review has that the stage 2 report lacks

- **What suspension is worth.** The stage 2 report notes that Valtio has no
  suspend and resume and gives the same answers. `x1` shows what that costs
  here: a write to a row that outlived 2,000 replaced lists goes from 446 ns
  to 122,610 ns until the collector runs. So the walk can go, and suspension
  should stay.
- **The cause of finding 32** (`c14`): one `Reflect.has` guard.
- **Where the same-node rule earns its place** (`c07`): removing it fixes
  two parts of finding 36 and makes a cached getter over 1,000 rows 326
  times slower.
- **A reason, and a test count, for every function** in the three files, the
  list of dead lines, and two pieces of code that no test needs (`c58`,
  `s08`).
- **Function wrappers stored back into the raw object** by `reverse()` and by
  `store.cb = store.cb`.
- **The boundary leaks**, the duplicated logic, the stale names and
  comments, and the redundant owner fields in `DepEntry`.

### What the stage 2 report has that this review lacks

This review asked whether the code that exists is needed. It did not ask
what is missing. The stage 2 report covers that:

- `has` and `ownKeys` traps, and the key set as a dependency.
- A class getter as an enumerable own key of a snapshot (API question 3).
  Spike `s08` only touches its edge.
- A delete that removes nothing.
- The cost of a clean read of getters arranged as a diamond (defect 2), the
  version stamp that would make it constant, and caching a thrown error.
- A subscription on a removed container that the collector ends (defect 5).
  That follows from the weak owner links (`reference`, spike `o20`), which
  this review took as given.
- A Proxy target of the library's own, a snapshot rebuild that copies the
  previous array, a development build, and everything about the adapters,
  `persist`, `devtools` and the release workflow.

### One place where the two should be read together

The stage 2 report's first agreed change (functions returned as they are)
and its second (`defineProperty` as a write) both rewrite parts of the `get`
and `set` traps. The `set` trap is already the third hardest place in this
review. Stage 4 should make those two changes first and remove the dead
lines listed here afterwards, or the patches will not apply.

## Verified and not verified

- **Run:** 101 single deletions, each against the full unit suite. Results
  and patches are in Appendix A.
- **Read only:** the duplication, naming, state and boundary tables.
- **Not run:** typecheck, size and benchmarks for any spike; the browser,
  framework and mutation suites.

## Not done

A later agent with an empty scratchpad can continue from here. Recreate a
worktree as the common brief says, apply a patch from Appendix A with
`git apply`, and run `bun test src tests/memory/heapSnapshot.test.ts tests/mutation`
in `packages/classy-store`.

1. Run the full removal of suspension (`x1`): delete `isStoreRoot`,
   `detachedVersions`, `detachedParent`, `canSuspend`, `suspendIfDetached`,
   `resume` and `resumeScope` from `ownership.ts`, and the six calls in
   `core.ts`. Record tests, typecheck, size, benchmarks, and reproductions of
   findings 61, 66, 67 and 69 before and after.
2. Measure what suspension buys: owner links on a row that outlives 2,000
   replaced lists, before and after garbage collection, with and without it.
3. Classify `c58` and `s08` as dead or untested with a script.
4. Reproduce findings 5, 32, 36 and 71 before and after `c44`, `c14`, `c07`
   and `s07`, and benchmark `c07`.
5. Run the recommended combination with typecheck, size and both benchmarks.
6. Read `review/stage-2-report.md` and write the comparison section.
7. Compute the total.

## Appendix A: every spike, its patch and the tests it fails

Baseline: 1,341 tests pass on the unmodified worktree. A spike id starts with
`c` for `core.ts`, `o` for `ownership.ts`, `s` for `snapshot.ts` and `x` for a
combination. Paths in the test lists are relative to `packages/classy-store/`.

### `c01-unwrap-guard`

Lines: +1 -2. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.functionStores.test.ts`: a store made from a function, as a member of a reactive set > is held once, found again and removed, when it is given as its proxy each time

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..705e2c6 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -39,8 +39,7 @@ export function isTrackingProxy(value: object): boolean {
  * wraps: the raw target for live state, the frozen snapshot for tracked reads.
  */
 export function unwrap<T>(value: T): T {
-  if (typeof value !== 'object' || value === null) return value;
-  const internal = internalsMap.get(value);
+  const internal = internalsMap.get(value as object);
   if (internal) return internal.target as T;
   return (trackedSnapshots.get(value) ?? value) as T;
 }
```

### `c02-unwrap-tracked`

Lines: +1 -1. Result: 1338 pass, 3 fail.

Failing tests:

- `src/core/core.snapshotValues.test.ts`: identity helpers > unwrap strips a store proxy and a tracking proxy, nothing else
- `src/core/core.snapshotValues.test.ts`: identity helpers > identityOf is the same for the raw object, its proxy, snapshots and tracked reads
- `src/collections/collections.identity.test.ts`: reactive collections — tracked reads in a component > a lookup records the entries it compared, so a replaced key is noticed

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..1cc0285 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -42,7 +42,7 @@ export function unwrap<T>(value: T): T {
   if (typeof value !== 'object' || value === null) return value;
   const internal = internalsMap.get(value);
   if (internal) return internal.target as T;
-  return (trackedSnapshots.get(value) ?? value) as T;
+  return value;
 }
 
 /**
```

### `c03-identityOf-guard`

Lines: +1 -2. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..2d02e22 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -51,8 +51,7 @@ export function unwrap<T>(value: T): T {
  */
 export function identityOf(value: unknown): unknown {
   const raw = unwrap(value);
-  if (typeof raw !== 'object' || raw === null) return raw;
-  return snapshotSources.get(raw) ?? raw;
+  return snapshotSources.get(raw as object) ?? raw;
 }
 
 // ── Dependency tracking for computed getters ──────────────────────────────────
```

### `c04-identityOf-sources`

Lines: +1 -1. Result: 1335 pass, 6 fail.

Failing tests:

- `src/core/core.snapshotValues.test.ts`: identity helpers > identityOf is the same for the raw object, its proxy, snapshots and tracked reads
- `src/core/core.fuzz.findings.test.ts`: core — findings of the differential test > reactive collections > a snapshot given as a new member is stored frozen and answers for the live row
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/collections/collections.identity.test.ts`: reactive collections inside a store — object members > the raw object, its store proxy and its snapshots are one key
- `src/collections/collections.identity.test.ts`: reactive collections inside a store — object members > an older snapshot of a member still identifies it after it changes
- `src/collections/collections.identity.test.ts`: reactive collections — tracked reads in a component > a lookup records the entries it compared, so a replaced key is noticed

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..30c9b97 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -52,7 +52,7 @@ export function unwrap<T>(value: T): T {
 export function identityOf(value: unknown): unknown {
   const raw = unwrap(value);
   if (typeof raw !== 'object' || raw === null) return raw;
-  return snapshotSources.get(raw) ?? raw;
+  return raw;
 }
 
 // ── Dependency tracking for computed getters ──────────────────────────────────
```

### `c05-isTrackingProxy-stub`

Lines: +1 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/collections/collections.identity.test.ts`: reactive collections — tracked reads in a component > a lookup records the entries it compared, so a replaced key is noticed
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — reactive collections > an auto-tracked lookup re-renders when the looked-up key appears

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..0769875 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -31,7 +31,7 @@ export function registerTrackingProxy(proxy: object, snap: object): void {
 
 /** @internal Whether a value is a render-tracking proxy over a snapshot. */
 export function isTrackingProxy(value: object): boolean {
-  return trackedSnapshots.has(value);
+  return false;
 }
 
 /**
```

### `c06-activeTracker-ternary`

Lines: +1 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..cd999b9 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -70,7 +70,7 @@ const trackerStack: {
 
 /** Returns the tracker currently recording deps, or `null` if none is active. */
 function activeTracker() {
-  return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
+  return trackerStack[trackerStack.length - 1];
 }
 
 /**
```

### `c07-recordDep-same-node`

Lines: +0 -2. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a getter that reads another store keeps its result after that store changes
- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a getter that reads a child through a held reference keeps its result after the child changes

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..15e58df 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -88,8 +88,6 @@ function recordDep(
   // Only record deps for reads on the SAME proxy that owns the getter.
   // Child-proxy reads don't need explicit tracking because child mutations
   // bubble up via version numbers on the parent's childInternals.
-  if (tracker.internal !== internal) return;
-
   const childInternal = internal.childInternals.get(prop);
   if (childInternal) {
     tracker.deps.push({
```

### `c08-recordComputedDep-same-node`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.gettersAcrossNodes.test.ts`: a getter that reads a getter of another store > keeps its result after the other store changes and its getter has recomputed

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..4ab8326 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -116,7 +116,6 @@ function recordComputedDep(
 ): void {
   const tracker = activeTracker();
   if (!tracker) return;
-  if (tracker.internal !== internal) return;
 
   tracker.deps.push({kind: 'computed', internal, prop, value});
 }
```

### `c09-version-dep-parent-check`

Lines: +0 -2. Result: 1333 pass, 8 fail.

Failing tests:

- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > recomputes when a sub-tree property is replaced entirely
- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > recomputes when a dependency property is deleted
- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > recomputes when a dep with value undefined is deleted
- `src/core/core.characterisation.getters.test.ts`: a getter that reads one field of a nested object > is re-run when the object is replaced by an equal one
- `src/core/core.test.ts`: createClassyStore() — core reactivity > computed getter memoization > getter invalidates when property is replaced entirely
- `src/core/core.characterisation.detached.test.ts`: putting a removed subtree back > a store getter that reads the subtree follows it out and back, on the proxy and on the snapshot
- `src/core/core.characterisation.detached.test.ts`: what the collector can free > a removed subtree that nobody holds is kept alive by a store getter that read it, until that getter is read again
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..e3b8d3c 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -131,8 +131,6 @@ function areDepsValid(deps: DepEntry[]): boolean {
       // If the property was replaced entirely (e.g., store.items = newArray),
       // the old child internal is detached and its version never changes.
       // This check catches that case.
-      if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
-        return false;
       if (dep.internal.version !== dep.version) return false;
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
```

### `c10-version-dep-as-value`

Lines: +1 -12. Result: 1311 pass, 30 fail.

Failing tests:

- `src/core/core.gettersAcrossNodes.test.ts`: a getter that reads a getter of the same name on a nested object > returns its result: two getters that share a name on different objects are not a cycle
- `src/core/core.ownership.test.ts`: shared proxy ownership > an edit reaches every alias, including a path never read through the proxy
- `src/core/core.characterisation.identity.test.ts`: the same raw object held in two stores > invalidates a getter in one store when it is written through the other
- `src/core/core.characterisation.identity.test.ts`: reference cycles > a getter that reads the store through its own cycle recomputes after a write to a field it never read
- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > recomputes when an array dependency is mutated via push
- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > recomputes when a deeply nested dependency changes
- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > correctly caches and invalidates a getter that returns undefined
- `src/core/core.characterisation.getters.test.ts`: a getter that reads one field of a nested object > is re-run by a write to a field it never read, at any depth under that object
- `src/core/core.characterisation.getters.test.ts`: a getter that reads one field of a nested object > is re-run when a key is added to the object, and when one is deleted
- `src/core/core.characterisation.getters.test.ts`: a getter that reads one field of a nested object > is re-run when a key the object never had is deleted
- `src/core/core.characterisation.getters.test.ts`: getters that read an array: an index, length, filter, map, reduce and for...of > all re-run after a write to one element, whatever part of the array each one read
- `src/core/core.characterisation.getters.test.ts`: getters that read an array: an index, length, filter, map, reduce and for...of > all re-run once after push
- `src/core/core.characterisation.getters.test.ts`: getters that read an array: an index, length, filter, map, reduce and for...of > all re-run once after reverse
- `src/core/core.characterisation.getters.test.ts`: getters that read an array: an index, length, filter, map, reduce and for...of > all re-run once after splice
- `src/core/core.characterisation.getters.test.ts`: getters that read an array: an index, length, filter, map, reduce and for...of > all re-run once after an element replaced
- `src/core/core.characterisation.getters.test.ts`: getters that read an array: an index, length, filter, map, reduce and for...of > all re-run once after a length write
- `src/core/core.characterisation.getters.test.ts`: getters that read a reactive collection > re-run after a new key, after an edit to a stored value, and after a delete
- `src/core/core.characterisation.getters.test.ts`: getters that read a reactive collection > over a set re-run after add and clear, not after a duplicate add or a clear when empty
- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a root getter that reads a child getter re-runs after any write under the child; the child getter only when its own dependency changed
- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a getter that reads a store embedded as a child re-runs when that store changes
- `src/core/core.characterisation.getters.test.ts`: a getter that returns an object or an array, on the live store > notifies once for a write through an element of a filter result, and then returns a new array
- `src/core/core.characterisation.getters.test.ts`: a getter that writes to the store while it runs > never settles when it pushes to an array it reads
- `src/core/core.characterisation.getters.test.ts`: a getter whose result depends on which keys the store has > re-runs a getter that reads a child when a key is added to or deleted from that child
- `src/core/core.functionStores.test.ts`: a store made from a function, as a member of a reactive set > is held once, found again and removed, when it is given as its proxy each time
- `src/core/core.test.ts`: createClassyStore() — core reactivity > computed getter memoization > getter with nested object dependency recomputes on child mutation
- `src/core/core.characterisation.detached.test.ts`: a container that left the store and is still held > a getter on a removed object refreshes when an object below it, shared with the store, is written in the store
- `src/core/core.characterisation.invariants.test.ts`: the well-known symbols a store is asked for > a Symbol.toStringTag getter is read as a memoized getter by Object.prototype.toString, on the store and on a snapshot
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/collections/collections.identity.test.ts`: reactive collections inside a store — object members > a map finds, replaces and deletes an entry by the same raw object key
- `src/utils/persist/persist.test.ts`: persist() > merge strategies > preserves reactive defaults and opaque leaves during partial hydration

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..3a75527 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -90,18 +90,7 @@ function recordDep(
   // bubble up via version numbers on the parent's childInternals.
   if (tracker.internal !== internal) return;
 
-  const childInternal = internal.childInternals.get(prop);
-  if (childInternal) {
-    tracker.deps.push({
-      kind: 'version',
-      internal: childInternal,
-      version: childInternal.version,
-      parent: internal,
-      prop,
-    });
-  } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
-  }
+  tracker.deps.push({kind: 'value', target: internal.target, prop, value});
 }
 
 /**
```

### `c11-computed-dep-nocache`

Lines: +0 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..9819a5a 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -137,7 +137,6 @@ function areDepsValid(deps: DepEntry[]): boolean {
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
```

### `c12-computed-dep-nested`

Lines: +0 -1. Result: 1334 pass, 7 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > runs no body on a write; each level re-runs once when the outermost getter is next read
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > re-runs only the innermost getter when it alone is read after the write
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > runs a getter that two others read once per change
- `src/core/core.characterisation.getters.test.ts`: getters that read each other in a cycle > throw only while the state closes the cycle
- `src/core/core.test.ts`: createClassyStore() — core reactivity > computed getter memoization > getter that reads another getter (nested computed)

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..211d1ec 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -138,7 +138,6 @@ function areDepsValid(deps: DepEntry[]): boolean {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
       if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
       // Check that the property still exists — if it was deleted and
```

### `c13-computed-dep-value`

Lines: +0 -1. Result: 1338 pass, 3 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > re-runs only the innermost getter when it alone is read after the write
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > runs a getter that two others read once per change
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..e68a2b7 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -139,7 +139,6 @@ function areDepsValid(deps: DepEntry[]): boolean {
       const cached = dep.internal.computedCache.get(dep.prop);
       if (!cached) return false; // no cache → must recompute
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
-      if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
       // Check that the property still exists — if it was deleted and
       // dep.value was `undefined`, Object.is(undefined, undefined) would
```

### `c14-value-dep-has`

Lines: +0 -1. Result: 1336 pass, 5 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > runs on every read while the property is missing
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > runs on every read again after the property is deleted
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > returns a new object on every read when it builds one
- `src/core/core.fuzz.findings.test.ts`: core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..1bf9f69 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -144,7 +144,6 @@ function areDepsValid(deps: DepEntry[]): boolean {
       // Check that the property still exists — if it was deleted and
       // dep.value was `undefined`, Object.is(undefined, undefined) would
       // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
       if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
         return false;
     }
```

### `c15-no-computed-dep`

Lines: +0 -1. Result: 1333 pass, 8 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > runs no body on a write; each level re-runs once when the outermost getter is next read
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > re-runs only the innermost getter when it alone is read after the write
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on the live store > runs a getter that two others read once per change
- `src/core/core.characterisation.getters.test.ts`: getters that read each other in a cycle > throw only while the state closes the cycle
- `src/core/core.test.ts`: createClassyStore() — core reactivity > computed getter memoization > getter that reads another getter (nested computed)
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..220390b 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -472,7 +472,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         );
         // Record as a computed dependency for any parent getter currently tracking.
         // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
-        recordComputedDep(internal, prop, value);
         return value;
       }
```

### `c16-cycle-detection`

Lines: +0 -12. Result: 1333 pass, 8 fail.

Failing tests:

- `src/core/core.gettersAcrossNodes.test.ts`: a cycle of getters that is reached through a getter outside it > is reported from the getter where it closes, without the getter that led into it
- `src/core/core.characterisation.getters.test.ts`: getters that read each other in a cycle > throw a plain Error that names the path, starting from the getter that was read
- `src/core/core.characterisation.getters.test.ts`: getters that read each other in a cycle > name a getter that reads itself twice
- `src/core/core.characterisation.getters.test.ts`: getters that read each other in a cycle > name symbol-keyed getters by their description
- `src/core/core.characterisation.getters.test.ts`: getters that read each other in a cycle > throw only while the state closes the cycle
- `src/core/core.characterisation.getters.test.ts`: a getter that writes to the store while it runs > reports a circular dependency to a sync subscriber that reads the getter during its write
- `src/core/core.test.ts`: createClassyStore() — core reactivity > computed getter error handling > throws a clear error on circular getter dependency (A → B → A)
- `src/core/core.test.ts`: createClassyStore() — core reactivity > computed getter error handling > throws a clear error on self-referencing getter

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..033291f 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -170,18 +170,6 @@ function evaluateComputed(
 
   // Cycle detection: if this (internal, prop) pair is already being
   // evaluated higher in the stack, the getter chain is recursive.
-  for (const existing of trackerStack) {
-    if (existing.internal === internal && existing.prop === prop) {
-      const cycle = trackerStack
-        .slice(trackerStack.indexOf(existing))
-        .map((f) => String(f.prop))
-        .concat(String(prop))
-        .join(' → ');
-      throw new Error(
-        `@codebelt/classy-store: circular computed getter dependency: ${cycle}`,
-      );
-    }
-  }
 
   // Push a new tracker frame for this getter evaluation.
   const frame = {internal, prop, deps: [] as DepEntry[]};
```

### `c17-tracker-finally`

Lines: +4 -7. Result: 1332 pass, 9 fail.

Failing tests:

- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > getter that throws does not leave stale/corrupt cache entries
- `src/core/core.characterisation.getters.test.ts`: getters that read each other in a cycle > throw a plain Error that names the path, starting from the getter that was read
- `src/core/core.characterisation.getters.test.ts`: getters that read each other in a cycle > throw only while the state closes the cycle
- `src/core/core.characterisation.getters.test.ts`: a getter that throws > runs its body and throws a new error on every read
- `src/core/core.characterisation.getters.test.ts`: a getter that throws > keeps throwing after a write to a field it never read
- `src/core/core.characterisation.getters.test.ts`: a getter that throws > returns a value once its dependency changes, and caches it from then on
- `src/core/core.characterisation.getters.test.ts`: a getter that throws > passes its error through a getter that reads it, which is not cached either
- `src/core/core.characterisation.getters.test.ts`: a getter that catches the error of another getter > keeps its fallback on the live store after the other getter recovers
- `src/core/core.test.ts`: createClassyStore() — core reactivity > computed getter error handling > a getter that throws propagates the error and leaves the store usable

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..c12d5a6 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -186,13 +186,10 @@ function evaluateComputed(
   // Push a new tracker frame for this getter evaluation.
   const frame = {internal, prop, deps: [] as DepEntry[]};
   trackerStack.push(frame);
-  try {
-    const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
-    return value;
-  } finally {
-    trackerStack.pop();
-  }
+  const value = getterFn.call(receiver);
+  internal.computedCache.set(prop, {value, deps: frame.deps});
+  trackerStack.pop();
+  return value;
 }
 
 // ── Public helpers ────────────────────────────────────────────────────────────
```

### `c18-getInternal-resume`

Lines: +0 -1. Result: 1323 pass, 18 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > a detached list refreshes shared rows when read again
- `src/core/core.ownership.test.ts`: shared proxy ownership > a detached list with one row refreshes when that row changed meanwhile
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > disconnects retired subtrees after replacement
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > disconnects retired subtrees after deletion
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > array truncation disconnects only removed index subtrees
- `src/core/core.unobservedObjects.test.ts`: an object deleted from a parent that had already left the store > gives a current snapshot after a change under it
- `src/core/core.unobservedObjects.test.ts`: an object deleted from a parent that had already left the store > tells a subscriber added after the delete about a change under it
- `src/core/core.unobservedObjects.test.ts`: a store created from an object that had left another store > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it
- `src/core/core.unobservedObjects.test.ts`: a store whose only subscriber has left > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.characterisation.detached.test.ts`: subscriptions on a node that leaves the store > once that subscriber is removed, a write to the shared row in the store still shows in the next snapshot of the list
- `src/core/core.characterisation.detached.test.ts`: subscriptions on a node that leaves the store > after the subscriber of a row in a removed list is removed, a write through an object held below that row shows in the snapshot of the list
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, after it was deleted from that container
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, made before the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..652ae84 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -205,7 +205,6 @@ export function getInternal(proxy: object): StoreInternal {
   const internal = internalsMap.get(proxy);
   if (!internal)
     throw new Error('@codebelt/classy-store: object is not a store proxy');
-  internal.resumeScope();
   return internal;
 }
```

### `c19-notify-sync-size`

Lines: +1 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.characterisation.notifications.test.ts`: subscribing or unsubscribing between a write and its delivery > a sync subscriber added inside a batch after a write is not told about it when its node had no sync subscriber at that time

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..b5db434 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -226,7 +226,7 @@ function notifyMutation(internal: StoreInternal): void {
     // Inside a store method or array operation: tell synchronous subscribers
     // once, when the outermost call returns.
     for (const node of owners) {
-      if (node.syncListeners.size) pendingSync.add(node);
+      pendingSync.add(node);
     }
   } else {
     deliver(owners, 'syncListeners');
```

### `c20-notify-batched-size`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.characterisation.notifications.test.ts`: subscribing or unsubscribing between a write and its delivery > a batched subscriber added after a write is not told about it when its node had no batched subscriber at that time

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..65eb8ff 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -232,7 +232,6 @@ function notifyMutation(internal: StoreInternal): void {
     deliver(owners, 'syncListeners');
   }
   for (const node of owners) {
-    if (!node.batchedListeners.size) continue;
     if (!pendingNotifications.size) queueMicrotask(flushNotifications);
     pendingNotifications.add(node);
   }
```

### `c21-settle-size`

Lines: +1 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..547d47c 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -247,7 +247,7 @@ const pendingSync = new Set<StoreInternal>();
 
 /** Close one transaction level; the outermost one notifies sync subscribers. */
 function settleTransaction(): void {
-  if (--transactionDepth === 0 && pendingSync.size) {
+  if (--transactionDepth === 0) {
     const owners = new Set(pendingSync);
     pendingSync.clear();
     deliver(owners, 'syncListeners');
```

### `c22-new-target`

Lines: +0 -1. Result: 1338 pass, 3 fail.

Failing tests:

- `src/core/core.characterisation.identity.test.ts`: functions read through a store > a class stored as data is read back as a wrapper without its static members
- `src/core/core.characterisation.getters.test.ts`: static getters > are not reachable through store.constructor, which is not the class
- `src/core/core.transactions.test.ts`: transactions > a class stored as data stays constructible

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..459ef7e 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -266,7 +266,6 @@ function transactional(
 ): (...args: unknown[]) => unknown {
   return function (...args: unknown[]) {
     // A class stored as data stays constructible, as a bound function would.
-    if (new.target) return Reflect.construct(method, args);
     transactionDepth++;
     try {
       return Reflect.apply(method, receiver, args);
```

### `c23-deliver-copy`

Lines: +7 -7. Result: the suite did not finish and was killed.

Failing tests:

- `src/core/core.characterisation.notifications.test.ts`: subscribing during delivery > a sync subscriber added by another one during delivery is first called for the next write
- `src/core/core.characterisation.notifications.test.ts`: subscribing during delivery > a batched subscriber added by another one during delivery is first called for the next write
- `src/core/core.characterisation.notifications.test.ts`: subscribing during delivery > a sync subscriber added to the root while a nested node is being delivered is first called for the next write
- `src/core/core.characterisation.notifications.test.ts`: unsubscribing during delivery > a sync subscriber removed by an earlier one is still called once in the delivery that is running
- `src/core/core.characterisation.notifications.test.ts`: unsubscribing during delivery > a batched subscriber removed by an earlier one is still called once in the delivery that is running
- `src/core/core.characterisation.notifications.test.ts`: unsubscribing during delivery > a root sync subscriber removed by a nested one is still called once in the delivery that is running
- `src/core/core.characterisation.notifications.test.ts`: unsubscribing during delivery > a root batched subscriber removed by a nested one is still called once in the delivery that is running

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..68f7035 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -316,13 +316,13 @@ function deliver(
   kind: 'syncListeners' | 'batchedListeners',
 ): void {
   // Copy first: a listener may subscribe or unsubscribe during delivery.
-  const listeners: (() => void)[] = [];
-  for (const node of owners) listeners.push(...node[kind]);
-  for (const listener of listeners) {
-    try {
-      listener();
-    } catch (error) {
-      console.error(error);
+  for (const node of owners) {
+    for (const listener of node[kind]) {
+      try {
+        listener();
+      } catch (error) {
+        console.error(error);
+      }
     }
   }
 }
```

### `c24-deliver-trycatch`

Lines: +1 -5. Result: 1326 pass, 15 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: a getter that writes to the store while it runs > reports a circular dependency to a sync subscriber that reads the getter during its write
- `src/core/core.test.ts`: createClassyStore() — core reactivity > listener error isolation > calls remaining listeners even if an earlier one throws
- `src/core/core.test.ts`: createClassyStore() — core reactivity > listener error isolation > calls remaining sync listeners even if an earlier one throws
- `src/core/core.characterisation.notifications.test.ts`: a write made inside a sync subscriber > when the subscriber writes on every call > recurses until the stack overflows, and reports the overflow instead of throwing it to the writer
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a sync subscriber that throws leaves the write applied and in the snapshot
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a sync subscriber that throws on a nested node does not stop the subscribers further up
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a batched subscriber that throws on a nested node does not stop the subscribers further up
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a sync subscriber that throws stays subscribed, and later writes are delivered and reported again
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a batched subscriber that throws stays subscribed, and later writes are delivered and reported again
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > each subscriber that throws is reported on its own, in delivery order, with the value it threw
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a subscriber that throws when a store method returns does not change what the method returns
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a subscriber that throws when a batch ends does not change what batch() returns
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a transaction whose subscriber threw is closed: the next direct write notifies at once
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a sync subscriber that throws does not cancel the batched notification of the same write
- `src/core/core.characterisation.notifications.test.ts`: a subscriber that throws > a throw inside a nested delivery is reported once for each delivery, and both deliveries finish

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..495245c 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -319,11 +319,7 @@ function deliver(
   const listeners: (() => void)[] = [];
   for (const node of owners) listeners.push(...node[kind]);
   for (const listener of listeners) {
-    try {
-      listener();
-    } catch (error) {
-      console.error(error);
-    }
+    listener();
   }
 }
```

### `c25-frozenValues-cache`

Lines: +1 -4. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > whether it is frozen is worked out once, not on every read

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..0ab8c08 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -335,10 +335,7 @@ const frozenValues = new WeakSet<object>();
 
 /** A snapshot, or any object its owner froze: a value the store never proxies. */
 function isImmutableValue(value: object): boolean {
-  if (snapshotSources.has(value) || frozenValues.has(value)) return true;
-  if (!Object.isFrozen(value)) return false;
-  frozenValues.add(value);
-  return true;
+  return snapshotSources.has(value) || Object.isFrozen(value);
 }
 
 /** A Proxy must return such a property's own value, never a proxy of it. */
```

### `c26-isImmutable-never`

Lines: +1 -4. Result: 1327 pass, 14 fail.

Failing tests:

- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > a snapshot assigned into a store is held by reference and stays frozen
- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > a snapshot present in the initial state is not proxied
- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > a tracked read handed back to a store is stored as its snapshot
- `src/core/core.fuzz.findings.test.ts`: core — findings of the differential test > reactive collections > a snapshot given as a new member is stored frozen and answers for the live row
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > is returned as itself, and its contents read normally
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > a frozen array is returned as itself, with its own elements
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > a snapshot keeps it by reference
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > deeply frozen data assigned later is stored and read as it is
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > replacing it notifies once; assigning the same object again does not
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > it can replace a reactive object, and be replaced by one
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > reactive collections keep it by reference as a value and as a member
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > whether it is frozen is worked out once, not on every read
- `src/core/core.frozenValues.test.ts`: a frozen object that holds another store > a frozen value assigned into a store is not searched for stores
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > re-renders when a frozen value it read through is replaced

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..df81c3f 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -335,10 +335,7 @@ const frozenValues = new WeakSet<object>();
 
 /** A snapshot, or any object its owner froze: a value the store never proxies. */
 function isImmutableValue(value: object): boolean {
-  if (snapshotSources.has(value) || frozenValues.has(value)) return true;
-  if (!Object.isFrozen(value)) return false;
-  frozenValues.add(value);
-  return true;
+  return false;
 }
 
 /** A Proxy must return such a property's own value, never a proxy of it. */
```

### `c27-linkChild-readonly`

Lines: +0 -6. Result: 1336 pass, 5 fail.

Failing tests:

- `src/core/core.frozenValues.test.ts`: a frozen store root > reads return its own values, and writes throw
- `src/core/core.frozenValues.test.ts`: a read-only property that holds an object > returns the object itself while the other fields stay reactive
- `src/core/core.frozenValues.test.ts`: freezing an object that is already in a store > Object.freeze through the proxy leaves it readable
- `src/core/core.frozenValues.test.ts`: freezing an object that is already in a store > a property made read-only through the proxy returns its own value
- `src/core/core.characterisation.invariants.test.ts`: a field that is non-writable, non-configurable, or both, holding an object > neither: the object is handed out raw, so a write to it notifies no one and shows in an existing snapshot

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..c4c2865 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -366,12 +366,6 @@ function linkChild(
     // An immutable value is held by reference, like a `Date`. Opaque types are
     // ruled out first: they are read far more often than they are frozen.
     if (!canProxy(value) || isImmutableValue(value)) return;
-    if (
-      isReadOnly(
-        descriptor ?? Object.getOwnPropertyDescriptor(owner.target, key),
-      )
-    )
-      return;
   }
   const child = existing ?? createNode(value, pending);
   owner.attach(key, child);
```

### `c27b-linkChild-descriptor-param`

Lines: +1 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a160b79 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -368,7 +368,7 @@ function linkChild(
     if (!canProxy(value) || isImmutableValue(value)) return;
     if (
       isReadOnly(
-        descriptor ?? Object.getOwnPropertyDescriptor(owner.target, key),
+        Object.getOwnPropertyDescriptor(owner.target, key),
       )
     )
       return;
```

### `c28-linkChild-existing-or`

Lines: +1 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..033e008 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -373,7 +373,7 @@ function linkChild(
     )
       return;
   }
-  const child = existing ?? createNode(value, pending);
+  const child = createNode(value, pending);
   owner.attach(key, child);
   return child;
 }
```

### `c29-createNode-internalsMap`

Lines: +1 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.characterisation.identity.test.ts`: createClassyStore() called again > returns a store proxy that is passed in
- `src/core/core.characterisation.identity.test.ts`: createClassyStore() called again > returns the nested proxy for a nested proxy and for the raw object behind it

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..49a3160 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -393,7 +393,7 @@ function detachTruncatedChildren(
 
 /** Register one write proxy for the target and index its outgoing data edges. */
 function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
-  const existing = targetNodes.get(target) ?? internalsMap.get(target);
+  const existing = targetNodes.get(target);
   if (existing) return existing;
 
   /** Cache for bound methods so we return the same reference each time. */
```

### `c30-createNode-targetNodes`

Lines: +1 -1. Result: the suite did not finish and was killed.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..bf23151 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -393,7 +393,7 @@ function detachTruncatedChildren(
 
 /** Register one write proxy for the target and index its outgoing data edges. */
 function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
-  const existing = targetNodes.get(target) ?? internalsMap.get(target);
+  const existing = internalsMap.get(target);
   if (existing) return existing;
 
   /** Cache for bound methods so we return the same reference each time. */
```

### `c31-set-resume`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..9c65f11 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -404,7 +404,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
-      internal.resumeScope();
       // Store the snapshot itself, never the render-tracking proxy around it.
       const value: unknown =
         typeof incoming === 'object' && incoming !== null
```

### `c32-get-resume`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.characterisation.detached.test.ts`: a container that left the store and is still held > a getter on a removed object refreshes when an object below it, shared with the store, is written in the store

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..31804fc 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -459,7 +459,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     get(_target, prop, receiver) {
-      internal.resumeScope();
       // 1. Check for getters on the prototype chain (computed values).
       const getterDesc = findPropertyDescriptor(_target, prop);
       if (getterDesc?.get) {
```

### `c33-delete-resume`

Lines: +0 -1. Result: 1338 pass, 3 fail.

Failing tests:

- `src/core/core.unobservedObjects.test.ts`: an object deleted from a parent that had already left the store > gives a current snapshot after a change under it
- `src/core/core.unobservedObjects.test.ts`: an object deleted from a parent that had already left the store > tells a subscriber added after the delete about a change under it
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, after it was deleted from that container

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..71d28ee 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -513,7 +513,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     deleteProperty(_target, prop) {
-      internal.resumeScope();
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
```

### `c33b-all-trap-resumes`

Lines: +0 -3. Result: 1336 pass, 5 fail.

Failing tests:

- `src/core/core.unobservedObjects.test.ts`: an object deleted from a parent that had already left the store > gives a current snapshot after a change under it
- `src/core/core.unobservedObjects.test.ts`: an object deleted from a parent that had already left the store > tells a subscriber added after the delete about a change under it
- `src/core/core.characterisation.detached.test.ts`: a container that left the store and is still held > a getter on a removed object refreshes when an object below it, shared with the store, is written in the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, after it was deleted from that container
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..925e7f0 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -404,7 +404,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
-      internal.resumeScope();
       // Store the snapshot itself, never the render-tracking proxy around it.
       const value: unknown =
         typeof incoming === 'object' && incoming !== null
@@ -459,7 +458,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     get(_target, prop, receiver) {
-      internal.resumeScope();
       // 1. Check for getters on the prototype chain (computed values).
       const getterDesc = findPropertyDescriptor(_target, prop);
       if (getterDesc?.get) {
@@ -513,7 +511,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     deleteProperty(_target, prop) {
-      internal.resumeScope();
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
```

### `c34-set-tracked-unwrap`

Lines: +1 -4. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > a tracked read handed back to a store is stored as its snapshot
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — values handed back to the store > a row from a rendered list (auto-tracked) is stored as an immutable snapshot

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a7a2fb6 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -406,10 +406,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     set(_target, prop, incoming, receiver) {
       internal.resumeScope();
       // Store the snapshot itself, never the render-tracking proxy around it.
-      const value: unknown =
-        typeof incoming === 'object' && incoming !== null
-          ? (trackedSnapshots.get(incoming) ?? incoming)
-          : incoming;
+      const value: unknown = incoming;
       const descriptor = findPropertyDescriptor(_target, prop);
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
```

### `c35-set-setter-path`

Lines: +0 -5. Result: 1333 pass, 8 fail.

Failing tests:

- `src/snapshot/snapshot.test.ts`: snapshot data properties and accessors > runs a class setter through the proxy and refreshes nested snapshots
- `src/core/core.characterisation.getters.test.ts`: a property with both a getter and a setter > notifies a sync subscriber once per write inside the setter, where a method notifies once
- `src/core/core.characterisation.getters.test.ts`: a property with both a getter and a setter > shows a sync subscriber the half-applied state between the two writes
- `src/core/core.characterisation.getters.test.ts`: a property with both a getter and a setter > re-runs the getter once after the setter changed what it reads
- `src/core/core.characterisation.getters.test.ts`: a property with both a getter and a setter > runs the setter when it is given the current value, which then notifies no one
- `src/core/core.characterisation.getters.test.ts`: a property with both a getter and a setter > notifies no one when the setter decides to write nothing
- `src/core/core.characterisation.invariants.test.ts`: assigning \_\_proto\_\_ or calling Object.setPrototypeOf on a store > store.\_\_proto\_\_ = x swaps the prototype of the raw object and notifies no one
- `src/core/core.characterisation.invariants.test.ts`: assigning \_\_proto\_\_ or calling Object.setPrototypeOf on a store > Object.assign with a JSON \_\_proto\_\_ key swaps the prototype, as on a plain object, and notifies for the other keys only

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..55ff84b 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -411,11 +411,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
           ? (trackedSnapshots.get(incoming) ?? incoming)
           : incoming;
       const descriptor = findPropertyDescriptor(_target, prop);
-      if (descriptor && !('value' in descriptor)) {
-        // Setters perform their own writes. Use the proxy as `this` so nested
-        // mutations invalidate their actual owners and notify just once.
-        return Reflect.set(_target, prop, value, receiver);
-      }
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
       if (
```

### `c36-set-hasOwn`

Lines: +0 -1. Result: 1334 pass, 7 fail.

Failing tests:

- `src/snapshot/snapshot.test.ts`: snapshot() > array snapshots > preserves holes, explicit undefined elements, and trailing length across edits
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > a store keeps its place when it is assigned the object it already inherits
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > is memoized once the property exists, even with the value undefined
- `src/core/core.test.ts`: createClassyStore() — core reactivity > primitive mutations > creates a missing property assigned undefined and notifies exactly once
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/utils/history/history.fields.test.ts`: withHistory() — which fields a restore touches > undo brings back a removed field whose value was undefined
- `src/frameworks/react/react.behavior.test.tsx`: shallowEqual as useClassyStore isEqual — integration > renders both transitions between a hole and an explicit undefined slot

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..7666026 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -419,7 +419,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
       if (
-        Object.hasOwn(_target, prop) &&
         (Object.is(oldValue, value) ||
           (previousChild &&
             (previousChild.proxy === value || previousChild.target === value)))
```

### `c37-set-prevchild-proxy`

Lines: +1 -1. Result: 1337 pass, 4 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: getters that read an array: an index, length, filter, map, reduce and for...of > none re-run after a sibling write, a same-value write or a sort that moves nothing
- `src/core/core.characterisation.getters.test.ts`: getters that read a reactive collection > do not re-run after the stored value is set again, a missing key is deleted, or a sibling is written
- `src/core/core.test.ts`: createClassyStore() — core reactivity > assignments with no effect on ownership > assigning a nested proxy back to its own property changes nothing
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..6fd6820 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -422,7 +422,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         Object.hasOwn(_target, prop) &&
         (Object.is(oldValue, value) ||
           (previousChild &&
-            (previousChild.proxy === value || previousChild.target === value)))
+            previousChild.target === value))
       )
         return true;
       const oldLength =
```

### `c38-set-prevchild-target`

Lines: +1 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.characterisation.identity.test.ts`: a store inside a store > is left as it is when the same store, or the raw object behind it, is assigned again
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a397494 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -422,7 +422,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         Object.hasOwn(_target, prop) &&
         (Object.is(oldValue, value) ||
           (previousChild &&
-            (previousChild.proxy === value || previousChild.target === value)))
+            previousChild.proxy === value))
       )
         return true;
       const oldLength =
```

### `c40-set-truncate`

Lines: +0 -3. Result: 1333 pass, 8 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > array truncation disconnects only removed index subtrees
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > repeated growth and truncation releases every removed child entry
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > truncation preserves object-valued properties that are not array indices
- `src/core/core.characterisation.detached.test.ts`: a write through a proxy held from before its object left the store > after a shorter array length, it reaches the subscribers of the held proxy and no subscriber of the store
- `src/core/core.characterisation.detached.test.ts`: a write through a proxy held from before its object left the store > after a shorter array length, it shows in a snapshot of the held proxy and leaves the snapshot of the store as it was
- `src/core/core.memory.test.ts`: createClassyStore subtree lifecycle > partial array truncation prunes removed children and reports the actual mutation
- `src/core/core.characterisation.invariants.test.ts`: writing the length of an array > an element removed by a length write stays a working store of its own: its subscriber is notified, its old owner is not
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..f9c219d 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -434,9 +434,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         oldLength !== undefined && (_target as unknown[]).length < oldLength;
       // A non-configurable array index can reject the requested length after
       // higher indices were already removed. Clean up the actual truncation.
-      if (truncated) {
-        detachTruncatedChildren(internal, (_target as unknown[]).length);
-      }
       if (!written && !truncated) return false;
 
       // Keep the old child connected when a property rejects the write.
```

### `c41-set-notwritten`

Lines: +1 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.memory.test.ts`: createClassyStore subtree lifecycle > partial array truncation prunes removed children and reports the actual mutation

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..3399033 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -437,7 +437,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (truncated) {
         detachTruncatedChildren(internal, (_target as unknown[]).length);
       }
-      if (!written && !truncated) return false;
+      if (!written) return false;
 
       // Keep the old child connected when a property rejects the write.
       if (written) {
```

### `c42-set-own-missing`

Lines: +0 -2. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.proxyTargets.test.ts`: a store made from a Proxy that lists keys it does not describe > passes a write on to the Proxy and notifies once
- `src/core/core.typedArrayStores.test.ts`: a store made from a typed array > accepts a write past its end without storing it, and still notifies

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..33b5718 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -443,8 +443,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (written) {
         const own = Object.getOwnPropertyDescriptor(_target, prop);
         if (
-          !own ||
-          !('value' in own) ||
           !linkChild(internal, prop, own.value, undefined, own)
         ) {
           internal.detach(prop);
```

### `c43-set-bound-delete`

Lines: +0 -2. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.test.ts`: createClassyStore() — core reactivity > bound method cache invalidation > reassigning a method returns the new function on next access

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..e9180ca 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -451,8 +451,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         }
       }
 
-      // Drop any cached bound method — the previous binding is dead now.
-      boundMethods.delete(prop);
 
       notifyMutation(internal);
       return written;
```

### `c44-get-array-nocache`

Lines: +0 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.characterisation.identity.test.ts`: functions read through a store > a method read from a store array is a new function on every read
- `src/core/core.characterisation.identity.test.ts`: functions read through a store > a function held in a store array is not found by includes() or indexOf(), even when it was just read from that array

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a6dcd5a 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -483,7 +483,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (typeof value === 'function') {
         const method = value as (...args: unknown[]) => unknown;
         // Array prototype methods should not be cached the same way as class methods.
-        if (Array.isArray(_target)) return transactional(method, receiver);
         const cached = boundMethods.get(prop);
         if (cached) return cached;
         const bound = transactional(method, receiver);
```

### `c45-get-no-bound-cache`

Lines: +1 -5. Result: 1337 pass, 4 fail.

Failing tests:

- `src/core/core.characterisation.identity.test.ts`: functions read through a store > a function stored as data is read back as one stable wrapper bound to the store, while the snapshot holds the original
- `src/core/core.test.ts`: createClassyStore() — core reactivity > bound method cache invalidation > reassigning a method returns the new function on next access
- `src/core/core.test.ts`: createClassyStore() — core reactivity > bound method cache invalidation > deleting a reassigned own method clears the bound cache; re-adding returns a fresh binding
- `src/core/core.characterisation.invariants.test.ts`: assigning \_\_proto\_\_ or calling Object.setPrototypeOf on a store > a method called before a prototype swap keeps the old body for good; one first called after it has the new body

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..088c162 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -484,11 +484,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         const method = value as (...args: unknown[]) => unknown;
         // Array prototype methods should not be cached the same way as class methods.
         if (Array.isArray(_target)) return transactional(method, receiver);
-        const cached = boundMethods.get(prop);
-        if (cached) return cached;
-        const bound = transactional(method, receiver);
-        boundMethods.set(prop, bound);
-        return bound;
+        return transactional(method, receiver);
       }
 
       // Own data edges are indexed before a retained alias can be mutated.
```

### `c46-get-lazy-link`

Lines: +1 -2. Result: 1337 pass, 4 fail.

Failing tests:

- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > a store keeps its place when it is assigned the object it already inherits
- `src/core/core.characterisation.invariants.test.ts`: assigning \_\_proto\_\_ or calling Object.setPrototypeOf on a store > an object inherited from the new prototype is a proxy on the store, and the raw unfrozen object on a snapshot
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: a new data property > holding an object: a snapshot hands it out raw and unfrozen until the store has read it; then it is a proxy
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: accessors, and several properties at once > Object.defineProperties defines each property and notifies no one

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..0806fe6 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -493,8 +493,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
       // Own data edges are indexed before a retained alias can be mutated.
       // An inherited data property becomes an edge on its first proxy read.
-      const child =
-        internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
+      const child = internal.childInternals.get(prop);
       recordDep(internal, prop, value);
       return child ? child.proxy : value;
     },
```

### `c47-defineProperty-trap`

Lines: +0 -13. Result: 1334 pass, 7 fail.

Failing tests:

- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.frozenValues.test.ts`: freezing an object that is already in a store > Object.freeze through the proxy leaves it readable
- `src/core/core.frozenValues.test.ts`: freezing an object that is already in a store > a property made read-only through the proxy returns its own value
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..85ab688 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -499,19 +499,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       return child ? child.proxy : value;
     },
 
-    defineProperty(_target, prop, descriptor) {
-      const defined = Reflect.defineProperty(_target, prop, descriptor);
-      // `Object.freeze(proxy)` arrives here once per property. A property that
-      // is now read-only holds its value as it is, as if frozen all along.
-      const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
-      if (own && isReadOnly(own)) {
-        const child = internal.childInternals.get(prop);
-        // An embedded store's proxy is that value: it remains a child.
-        if (child && child.proxy !== own.value) internal.detach(prop);
-      }
-      return defined;
-    },
-
     deleteProperty(_target, prop) {
       internal.resumeScope();
       const deleted = Reflect.deleteProperty(_target, prop);
```

### `c48-defineProperty-embedded`

Lines: +1 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.frozenValues.test.ts`: a frozen object that holds another store > a root frozen afterwards keeps passing them on

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..5560236 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -507,7 +507,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (own && isReadOnly(own)) {
         const child = internal.childInternals.get(prop);
         // An embedded store's proxy is that value: it remains a child.
-        if (child && child.proxy !== own.value) internal.detach(prop);
+        if (child) internal.detach(prop);
       }
       return defined;
     },
```

### `c50-delete-bound-delete`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.test.ts`: createClassyStore() — core reactivity > bound method cache invalidation > deleting an own method that shadows a class method restores the class method

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..78f68e8 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -517,7 +517,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
-        boundMethods.delete(prop);
         notifyMutation(internal);
       }
       return deleted;
```

### `c51-eager-index`

Lines: +0 -8. Result: 1230 pass, 111 fail.

Failing tests:

- `src/types.collections.test.ts`: collections entry point types > the Snapshot of a collection makes its fields readonly and leaves every method, mutators included, as it was
- `src/types.snapshot.test.ts`: Snapshot callable types > keeps typed reactive collection queries callable
- `src/types.snapshot.test.ts`: Snapshot callable types > still rejects assignment to readonly data, nested values, and arrays
- `src/types.exports.test.ts`: public entry point types > PROXYABLE is a symbol that a class can use as a static key
- `src/snapshot/snapshot.memory.test.ts`: snapshot cache ownership > releases the obsolete untracked clone when an array becomes tracked and is truncated
- `src/snapshot/snapshot.memory.test.ts`: snapshot cache ownership > releases the obsolete untracked clone when an array becomes tracked and its child is replaced
- `src/snapshot/snapshot.memory.test.ts`: snapshot cache ownership > releases the obsolete untracked clone when a plain object becomes tracked
- `src/snapshot/snapshot.restoredGetters.test.ts`: a nested object rebuilt by undo > still takes a class getter from its class, and lists it in a snapshot as before
- `src/snapshot/snapshot.restoredGetters.test.ts`: a nested object rebuilt by undo > gets back a getter that the object declared itself
- `src/snapshot/snapshot.test.ts`: snapshot() > property read tracking > tracks previously unaccessed nested opted-in classes
- `src/snapshot/snapshot.test.ts`: snapshot() > freezing > returns a deeply frozen object
- `src/snapshot/snapshot.test.ts`: snapshot() > array snapshots > preserves holes, explicit undefined elements, and trailing length across edits
- `src/snapshot/snapshot.test.ts`: snapshot() > array snapshots > array push is reflected in new snapshot
- `src/snapshot/snapshot.test.ts`: snapshot() > array snapshots > array splice is reflected in new snapshot
- `src/snapshot/snapshot.test.ts`: snapshot() > untracked nested objects > deep-clones untracked nested objects
- `src/snapshot/snapshot.test.ts`: snapshot() > untracked nested objects > snapshot of deeply nested arrays freezes all levels
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > snapshot of store with empty array
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > snapshot of store with nested empty objects
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > throws a clear error when the store contains a circular reference
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > throws on a self-referencing array (tracked sub-tree)
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > throws on a circular reference inside an untracked nested plain object
- `src/snapshot/snapshot.test.ts`: snapshot data properties and accessors > runs a class setter through the proxy and refreshes nested snapshots
- `src/core/core.ownership.test.ts`: shared proxy ownership > an edit reaches every alias, including a path never read through the proxy
- `src/core/core.ownership.test.ts`: shared proxy ownership > shared roots deliver each subscription once and keep independent registrations
- `src/core/core.ownership.test.ts`: shared proxy ownership > a detached list refreshes shared rows when read again
- `src/core/core.ownership.test.ts`: shared proxy ownership > a detached list with one row refreshes when that row changed meanwhile
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > array truncation disconnects only removed index subtrees
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > truncation preserves object-valued properties that are not array indices
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > a store keeps its place when its last subscriber is removed
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > an owner inside a container that left the store and came back, while nothing observed it, is called after a later owner of the same record
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > an owner inside a container that left the store and came back, while it had a subscriber, is called before a later owner of the same record
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > two owners inside a container are called in the opposite order once the container left the store and came back
- `src/core/core.characterisation.identity.test.ts`: createClassyStore() called again > gives a raw object wrapped on its own the same proxy inside a store built around it later
- `src/core/core.characterisation.identity.test.ts`: the same raw object held in two stores > notifies the synchronous subscribers of both stores once, whichever store it is written through
- `src/core/core.characterisation.identity.test.ts`: the same raw object held in two stores > has one snapshot, shared by both root snapshots before and after a change
- `src/core/core.characterisation.identity.test.ts`: reference cycles > a subtree outside the cycle can still be snapshotted on its own
- `src/core/core.characterisation.identity.test.ts`: reference cycles > a write to either of two objects that reference each other notifies the subscribers of both
- `src/core/core.characterisation.identity.test.ts`: reference stability > a write through the raw object is not observed, and snapshots keep the old content until the object is written through its proxy
- `src/core/core.characterisation.identity.test.ts`: looking an object up in a store array > a snapshot array finds only its own frozen elements, not the raw object or its proxy
- `src/core/core.characterisation.identity.test.ts`: snapshot identity of nested proxies > the snapshot of a nested proxy taken first is reused inside the root snapshot
- `src/core/core.characterisation.identity.test.ts`: snapshot identity of nested proxies > the snapshot of a nested proxy taken after the root snapshot is the object inside it
- `src/core/core.characterisation.identity.test.ts`: snapshot identity of nested proxies > the snapshot of a nested proxy keeps its reference when a sibling changes and gets a new one when its own content changes
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a list that was replaced is collected while a row it held lives on in the store
- `src/core/core.characterisation.getters.test.ts`: a getter that returns an object or an array, on a snapshot > returns the frozen child snapshot when the getter returns a child
- `src/core/core.characterisation.getters.test.ts`: a getter that returns an object or an array, on a snapshot > returns an unfrozen array of frozen element snapshots from a filter getter
- `src/core/core.characterisation.detached.test.ts`: a container that left the store and is still held > the snapshot of a removed list keeps the identity of the rows that did not change
- `src/core/core.characterisation.detached.test.ts`: subscriptions on a node that leaves the store > a subscriber added to a list before it was removed still hears about a row that the list shares with the store
- `src/core/core.characterisation.detached.test.ts`: subscriptions on a node that leaves the store > once that subscriber is removed, a write to the shared row in the store still shows in the next snapshot of the list
- `src/core/core.characterisation.detached.test.ts`: putting a removed subtree back > a raw object changed directly while it was out of the store and written back keeps the snapshot from before it left
- `src/core/core.characterisation.detached.test.ts`: a child with several owners > held under two properties of one store, it leaves the store only when the second property lets go
- `src/core/core.characterisation.detached.test.ts`: a child with several owners > held by two arrays of one store, a write reaches the array that still holds it and the store, and then only its own subscriber
- `src/core/core.characterisation.detached.test.ts`: a child with several owners > held by two stores, a write reaches the store that still holds it, and then neither
- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > a snapshot assigned into a store is held by reference and stays frozen
- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > replacing a stored snapshot notifies and later edits to its source do not leak in
- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > a snapshot present in the initial state is not proxied
- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > a tracked read handed back to a store is stored as its snapshot
- `src/core/core.snapshotValues.test.ts`: array snapshots > a sparse array keeps its holes, later elements and length
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > whether it is frozen is worked out once, not on every read
- `src/core/core.frozenValues.test.ts`: a frozen object that holds another store > a frozen root passes on the changes of a store embedded in it
- `src/core/core.frozenValues.test.ts`: a frozen object that holds another store > a root frozen afterwards keeps passing them on
- `src/core/core.removedContainers.test.ts`: a list that left the store and shares a row with it > shows a write made to the row after the list was read again, as well as one made before
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, after it was deleted from that container
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, made before the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store
- `src/core/core.characterisation.noWeakRef.test.ts`: a runtime without WeakRef > still shares one child between two stores
- `src/core/core.characterisation.invariants.test.ts`: frozen objects: what core.frozenValues.test.ts leaves out > a nested object throws a TypeError when read, once its raw parent was frozen behind the store
- `src/core/core.characterisation.invariants.test.ts`: frozen objects: what core.frozenValues.test.ts leaves out > a store whose raw root was frozen behind it throws a TypeError when spread or passed to JSON.stringify
- `src/core/core.characterisation.invariants.test.ts`: symbols as data keys > an object under a symbol key is a proxy: a write inside it notifies and gives a new frozen snapshot of it
- `src/core/core.characterisation.invariants.test.ts`: sparse arrays > a write past the end notifies once and leaves holes, in the store and in the snapshot
- `src/core/core.characterisation.invariants.test.ts`: writing the length of an array > a longer length notifies once and adds holes, not undefined elements
- `src/core/core.characterisation.invariants.test.ts`: writing the length of an array > length = 0 notifies a sync and a batched subscriber once each, however many elements go
- `src/core/core.characterisation.invariants.test.ts`: what reflection on a store hands out for a nested object > Object.getOwnPropertyDescriptor hands out the raw object: a write through it notifies no one and misses the snapshot
- `src/core/core.noFinalizationRegistry.test.ts`: a runtime without FinalizationRegistry > still shares one child between two stores
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/core/core.characterisation.notifications.test.ts`: notification order across the owners of one write > the key order of the initial state decides which container held the shared child first
- `src/core/core.characterisation.notifications.test.ts`: notification order across the owners of one write > a container that drops the shared child and takes it back is called after the other one
- `src/core/core.characterisation.notifications.test.ts`: notification order across the owners of one write > two stores that share a child have their sync subscribers called in the order the stores were created, after the child
- `src/core/core.characterisation.notifications.test.ts`: notification order across the owners of one write > two stores that share a child have their batched subscribers called in the order the stores were created, after the child
- `src/collections/collections.test.ts`: reactiveMap() > snapshot captures map data
- `src/collections/collections.test.ts`: reactiveSet() > snapshot captures set data
- `src/collections/collections.identity.test.ts`: reactive collections inside a store — object members > the raw object, its store proxy and its snapshots are one key
- `src/utils/history/history.test.ts`: withHistory > keeps nested state editable after undo without changing history
- `src/utils/history/history.test.ts`: withHistory > keeps nested state editable after redo without changing history
- `src/utils/history/history.test.ts`: withHistory > preserves reactive collection methods and getters after restoration
- `src/utils/history/history.restore.test.ts`: withHistory() — restoring state > undo and redo keep the identity of branches they do not change
- `src/utils/history/history.restore.test.ts`: withHistory() — restoring state > undo still restores a branch that did change
- `src/utils/persist/persist.test.ts`: persist() > merge strategies > keeps omitted nested defaults editable after shallow initial hydration
- `src/utils/persist/persist.test.ts`: persist() > merge strategies > keeps omitted nested defaults editable after shallow rehydration
- `src/utils/persist/persist.test.ts`: persist() > merge strategies > keeps omitted nested defaults editable after custom initial hydration
- `src/utils/persist/persist.test.ts`: persist() > merge strategies > keeps omitted nested defaults editable after custom rehydration
- `src/utils/persist/persist.test.ts`: persist() > merge strategies > preserves reactive defaults and opaque leaves during partial hydration
- `src/frameworks/vue/vue.test.ts`: vue useClassyStore > returns a shallow ref containing the current immutable snapshot
- `src/frameworks/angular/angular.test.ts`: angular injectClassyStore > returns a readonly signal with the current immutable snapshot
- `src/frameworks/solid/solid.test.ts`: solid useClassyStore > returns the current immutable snapshot without copying it
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — values handed back to the store > a row from a rendered list (selector) is stored as an immutable snapshot
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — values handed back to the store > a row from a rendered list (auto-tracked) is stored as an immutable snapshot
- `src/frameworks/react/react.behavior.test.tsx`: shallowEqual as useClassyStore isEqual — integration > renders both transitions between a hole and an explicit undefined slot
- `src/frameworks/react/react.hydration.lifecycle.test.tsx`: prepareStoreForHydration lifecycle > keeps nested data, getters, and replaced native leaves at their captured values for hydration
- `src/frameworks/react/react.lifecycle.test.tsx`: useClassyStore lifecycle > tracks nested conditional reads on a null-prototype object
- `src/frameworks/react/react.lifecycle.test.tsx`: useClassyStore lifecycle > tracks nested conditional reads on a nested opted-in class
- `src/frameworks/react/react.test.tsx`: useClassyStore — auto-tracked mode > tracks nested object property access
- `src/frameworks/react/react.test.tsx`: useClassyStore — auto-tracked mode > tracks array length and element access
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > keeps committed nested reads live through an abandoned transition
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > keeps a memoized child live after its parent renders with unchanged data
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > a field its memoized child never read does not re-render the parent
- `src/frameworks/react/react.performance.test.tsx`: useClassyStore render counts > keeps shared snapshot targets independent across many consumer read sets
- `src/frameworks/react/react.performance.test.tsx`: useClassyStore render counts > protects shared root targets starting with the first consumer
- `src/frameworks/react/react.performance.test.tsx`: useClassyStore render counts > protects shared array targets starting with the first consumer
- `src/frameworks/react/react.performance.test.tsx`: useClassyStore render counts > protects shared nested row targets starting with the first consumer
- `src/frameworks/react/react.performance.test.tsx`: useClassyStore render counts > keeps target reuse independent when a consumer changes stores and unmounts

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..99c3a4d 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -532,14 +532,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
   if (pending) {
     pending.push(internal);
   } else {
-    const nodes = [internal];
-    for (const owner of nodes) {
-      for (const key of Reflect.ownKeys(owner.target)) {
-        const desc = Object.getOwnPropertyDescriptor(owner.target, key);
-        if (desc && 'value' in desc)
-          linkChild(owner, key, desc.value, nodes, desc);
-      }
-    }
   }
   return internal;
 }
```

### `c52-create-isStoreRoot`

Lines: +0 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > a store keeps its place when its last subscriber is removed
- `src/core/core.unobservedObjects.test.ts`: a store whose only subscriber has left > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..e33ecb2 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -565,7 +565,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
  */
 export function createClassyStore<T extends object>(instance: T): T {
   const node = createNode(instance);
-  node.isStoreRoot = true;
   node.resumeScope();
   return node.proxy as T;
 }
```

### `c53-create-resume`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.unobservedObjects.test.ts`: a store created from an object that had left another store > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..3e630f8 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -566,7 +566,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 export function createClassyStore<T extends object>(instance: T): T {
   const node = createNode(instance);
   node.isStoreRoot = true;
-  node.resumeScope();
   return node.proxy as T;
 }
```

### `c54-subscribe-wrapper`

Lines: +1 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.test.ts`: createClassyStore() — core reactivity > subscribe / unsubscribe > registers the same callback independently on each call
- `src/core/core.characterisation.notifications.test.ts`: unsubscribing during delivery > an unsubscribe function called again after its callback was subscribed again leaves the new subscription in place

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..44d2d58 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -592,7 +592,7 @@ export function subscribe(
     ? internal.syncListeners
     : internal.batchedListeners;
   // One entry per call: registering a callback twice gives two subscriptions.
-  const listener = () => callback();
+  const listener = callback;
   listeners.add(listener);
   return () => {
     if (listeners.delete(listener)) internal.suspendIfDetached();
```

### `c55-unsubscribe-suspend`

Lines: +1 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..e1ec843 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -595,7 +595,7 @@ export function subscribe(
   const listener = () => callback();
   listeners.add(listener);
   return () => {
-    if (listeners.delete(listener)) internal.suspendIfDetached();
+    listeners.delete(listener);
   };
 }
```

### `c56-unsubscribe-guard`

Lines: +2 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..e98a263 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -595,7 +595,8 @@ export function subscribe(
   const listener = () => callback();
   listeners.add(listener);
   return () => {
-    if (listeners.delete(listener)) internal.suspendIfDetached();
+    listeners.delete(listener);
+    internal.suspendIfDetached();
   };
 }
```

### `c57-getInternal-throw`

Lines: +0 -2. Result: 1329 pass, 12 fail.

Failing tests:

- `src/core/core.characterisation.identity.test.ts`: snapshot() and subscribe() given something other than the proxy > reject the raw object a store was created from
- `src/core/core.characterisation.identity.test.ts`: snapshot() and subscribe() given something other than the proxy > reject a snapshot
- `src/core/core.test.ts`: createClassyStore() — core reactivity > error handling > getInternal throws for a non-store object
- `src/core/core.test.ts`: createClassyStore() — core reactivity > error handling > getInternal throws for a primitive wrapper
- `src/core/core.test.ts`: createClassyStore() — core reactivity > error handling > getVersion throws for a non-store object
- `src/frameworks/svelte/svelte.test.ts`: toSvelteStore > throws when given a non-store object
- `src/frameworks/vue/vue.test.ts`: vue useClassyStore > throws when given a non-store object
- `src/frameworks/angular/angular.test.ts`: angular injectClassyStore > rejects non-store objects
- `src/frameworks/solid/solid.test.ts`: solid useClassyStore > validates the store before checking ownership
- `src/frameworks/react/react.hydration.lifecycle.test.tsx`: prepareStoreForHydration lifecycle > validates proxies, preserves identity, and does not subscribe
- `src/frameworks/react/react.test.tsx`: useClassyStore — error handling > throws when given a non-store proxy
- `src/frameworks/react/react.test.tsx`: createStoreHook > throws when given a non-store proxy

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..262e4ef 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -203,8 +203,6 @@ function evaluateComputed(
  */
 export function getInternal(proxy: object): StoreInternal {
   const internal = internalsMap.get(proxy);
-  if (!internal)
-    throw new Error('@codebelt/classy-store: object is not a store proxy');
   internal.resumeScope();
   return internal;
 }
```

### `c58-set-delete-descriptor-reread`

Lines: +1 -6. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..4620cfb 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -441,12 +441,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
       // Keep the old child connected when a property rejects the write.
       if (written) {
-        const own = Object.getOwnPropertyDescriptor(_target, prop);
-        if (
-          !own ||
-          !('value' in own) ||
-          !linkChild(internal, prop, own.value, undefined, own)
-        ) {
+        if (!linkChild(internal, prop, value)) {
           internal.detach(prop);
         }
       }
```

### `o01-attach-same`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > a store keeps its place when it is assigned the object it already inherits

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..cfa3107 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -28,7 +28,6 @@ export class StoreInternal {
   ) {}
 
   attach(key: string | symbol, child: StoreInternal): void {
-    if (this.childInternals.get(key) === child) return;
     this.detach(key);
     this.childInternals.set(key, child);
     this.connect(child);
```

### `o02-attach-resume`

Lines: +0 -1. Result: 1337 pass, 4 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > reattaching a detached list reconnects a row that kept its own subscriber
- `src/core/core.characterisation.detached.test.ts`: putting a removed subtree back > a write through a held row that kept its own subscriber while its list was out shows in the store once the list is back
- `src/core/core.characterisation.detached.test.ts`: putting a removed subtree back > a store getter that was not read while the subtree was out refreshes for a write that reached a shared child through another owner
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..4540d0e 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -32,7 +32,6 @@ export class StoreInternal {
     this.detach(key);
     this.childInternals.set(key, child);
     this.connect(child);
-    child.resume();
   }
 
   detach(key: string | symbol): void {
```

### `o03-detach-suspend`

Lines: +0 -1. Result: 1333 pass, 8 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > filtering repeatedly keeps a single proxy and bounded work per scalar write
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > an owner inside a container that left the store and came back, while nothing observed it, is called after a later owner of the same record
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > two owners inside a container are called in the opposite order once the container left the store and came back
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a list that was replaced is collected while a row it held lives on in the store
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..4c4190a 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -40,7 +40,6 @@ export class StoreInternal {
     if (!child) return;
     this.childInternals.delete(key);
     this.disconnect(child);
-    child.suspendIfDetached();
   }
 
   private connect(child: StoreInternal): void {
```

### `o04-connect-clear-detachedParent`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, after it was deleted from that container

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..4292263 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -44,7 +44,6 @@ export class StoreInternal {
   }
 
   private connect(child: StoreInternal): void {
-    child.detachedParent = undefined;
     const count = child.parents.get(this.reference) ?? 0;
     if (!count) {
       child.trackSharedParents();
```

### `o05-registry`

Lines: +0 -28. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > read-only shared data releases collected request owners without a child mutation
- `src/core/core.ownership.test.ts`: shared proxy ownership > a child whose only owner was collected drops that owner when it gains a new one

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..17e93ff 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -15,7 +15,6 @@ export class StoreInternal {
   readonly parents = new Map<ParentReference, number>();
   readonly reference: ParentReference =
     typeof WeakRef === 'function' ? new WeakRef(this) : {deref: () => this};
-  private parentCleanup?: FinalizationRegistry<ParentReference>;
 
   // An unobserved, detached container keeps its children but stops receiving
   // their mutations. Retaining one row must not keep every filtered array alive.
@@ -46,35 +45,9 @@ export class StoreInternal {
   private connect(child: StoreInternal): void {
     child.detachedParent = undefined;
     const count = child.parents.get(this.reference) ?? 0;
-    if (!count) {
-      child.trackSharedParents();
-      child.parentCleanup?.register(this, this.reference, this.reference);
-    }
     child.parents.set(this.reference, count + 1);
   }
 
-  // A single-owner node has at most one stale reference. Start collecting
-  // dead links when it gains another owner, without scanning parents on
-  // every attachment or requiring a later read/write on a shared config.
-  private trackSharedParents(): void {
-    if (
-      this.parentCleanup ||
-      !this.parents.size ||
-      typeof WeakRef !== 'function' ||
-      typeof FinalizationRegistry !== 'function'
-    )
-      return;
-    const parents = this.parents;
-    this.parentCleanup = new FinalizationRegistry((reference) => {
-      parents.delete(reference);
-    });
-    for (const reference of parents.keys()) {
-      const parent = reference.deref();
-      if (parent) this.parentCleanup.register(parent, reference, reference);
-      else parents.delete(reference);
-    }
-  }
-
   private disconnect(child: StoreInternal): void {
     const count = child.parents.get(this.reference);
     if (count === undefined) return;
@@ -83,7 +56,6 @@ export class StoreInternal {
       return;
     }
     child.parents.delete(this.reference);
-    child.parentCleanup?.unregister(this.reference);
   }
 
   private canSuspend(): boolean {
```

### `o06-count`

Lines: +0 -4. Result: 1336 pass, 5 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > a retained row still notifies once after reverse, and stops after removal
- `src/core/core.characterisation.detached.test.ts`: a child with several owners > held under two properties of one store, it leaves the store only when the second property lets go
- `src/core/core.characterisation.detached.test.ts`: a child with several owners > held twice by one array, it leaves the store only when the second index lets go
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > recovers while array deletion produces transient empty slots

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..7003ce1 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -78,10 +78,6 @@ export class StoreInternal {
   private disconnect(child: StoreInternal): void {
     const count = child.parents.get(this.reference);
     if (count === undefined) return;
-    if (count > 1) {
-      child.parents.set(this.reference, count - 1);
-      return;
-    }
     child.parents.delete(this.reference);
     child.parentCleanup?.unregister(this.reference);
   }
```

### `o07-disconnect-undefined`

Lines: +0 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..3d11885 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -77,7 +77,6 @@ export class StoreInternal {
 
   private disconnect(child: StoreInternal): void {
     const count = child.parents.get(this.reference);
-    if (count === undefined) return;
     if (count > 1) {
       child.parents.set(this.reference, count - 1);
       return;
```

### `o08-canSuspend-root`

Lines: +0 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > a store keeps its place when its last subscriber is removed
- `src/core/core.unobservedObjects.test.ts`: a store whose only subscriber has left > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..7a43b5d 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -90,7 +90,6 @@ export class StoreInternal {
     return (
       !this.detachedVersions &&
       !this.parents.size &&
-      !this.isStoreRoot &&
       !this.syncListeners.size &&
       !this.batchedListeners.size
     );
```

### `o09-canSuspend-twice`

Lines: +0 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, made before the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..ca54800 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -88,7 +88,6 @@ export class StoreInternal {
 
   private canSuspend(): boolean {
     return (
-      !this.detachedVersions &&
       !this.parents.size &&
       !this.isStoreRoot &&
       !this.syncListeners.size &&
```

### `o10-canSuspend-listeners`

Lines: +1 -3. Result: 1333 pass, 8 fail.

Failing tests:

- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > an owner inside a container that left the store and came back, while it had a subscriber, is called before a later owner of the same record
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a list that was replaced while it had a subscriber is kept alive by a row that lives on in the store
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.characterisation.detached.test.ts`: subscriptions on a node that leaves the store > a subscriber added to a list before it was removed still hears about a row that the list shares with the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, made before the container was frozen
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..532c813 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -90,9 +90,7 @@ export class StoreInternal {
     return (
       !this.detachedVersions &&
       !this.parents.size &&
-      !this.isStoreRoot &&
-      !this.syncListeners.size &&
-      !this.batchedListeners.size
+      !this.isStoreRoot
     );
   }
```

### `o11-suspend-keep-links`

Lines: +0 -1. Result: 1327 pass, 14 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > filtering repeatedly keeps a single proxy and bounded work per scalar write
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > disconnects retired subtrees after replacement
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > disconnects retired subtrees after deletion
- `src/core/core.ownership.test.ts`: createClassyStore memory ownership > array truncation disconnects only removed index subtrees
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > an owner inside a container that left the store and came back, while nothing observed it, is called after a later owner of the same record
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > two owners inside a container are called in the opposite order once the container left the store and came back
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a list that was replaced is collected while a row it held lives on in the store
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.memory.test.ts`: createClassyStore subtree lifecycle > retired descendants stop notifying and retaining their former root
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..c84f620 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -104,7 +104,6 @@ export class StoreInternal {
       node.detachedVersions = versions;
       for (const child of node.childInternals.values()) {
         versions.set(child, child.version);
-        node.disconnect(child);
         if (child.canSuspend()) {
           child.detachedParent = node.reference;
           pending.push(child);
```

### `o12-suspend-no-recursion`

Lines: +0 -4. Result: 1333 pass, 8 fail.

Failing tests:

- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > an owner inside a container that left the store and came back, while nothing observed it, is called after a later owner of the same record
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > two owners inside a container are called in the opposite order once the container left the store and came back
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a row held from a removed list keeps that list alive
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..7e0a1f3 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -105,10 +105,6 @@ export class StoreInternal {
       for (const child of node.childInternals.values()) {
         versions.set(child, child.version);
         node.disconnect(child);
-        if (child.canSuspend()) {
-          child.detachedParent = node.reference;
-          pending.push(child);
-        }
       }
     }
   }
```

### `o13-resume-version-bump`

Lines: +0 -6. Result: 1325 pass, 16 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > a detached list refreshes shared rows when read again
- `src/core/core.ownership.test.ts`: shared proxy ownership > a detached list with one row refreshes when that row changed meanwhile
- `src/core/core.unobservedObjects.test.ts`: an object deleted from a parent that had already left the store > gives a current snapshot after a change under it
- `src/core/core.unobservedObjects.test.ts`: a store created from an object that had left another store > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it
- `src/core/core.unobservedObjects.test.ts`: a store whose only subscriber has left > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.characterisation.detached.test.ts`: a container that left the store and is still held > a getter on a removed object refreshes when an object below it, shared with the store, is written in the store
- `src/core/core.characterisation.detached.test.ts`: subscriptions on a node that leaves the store > once that subscriber is removed, a write to the shared row in the store still shows in the next snapshot of the list
- `src/core/core.characterisation.detached.test.ts`: subscriptions on a node that leaves the store > after the subscriber of a row in a removed list is removed, a write through an object held below that row shows in the snapshot of the list
- `src/core/core.characterisation.detached.test.ts`: putting a removed subtree back > a write through a held row that kept its own subscriber while its list was out shows in the store once the list is back
- `src/core/core.characterisation.detached.test.ts`: putting a removed subtree back > a store getter that was not read while the subtree was out refreshes for a write that reached a shared child through another owner
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, after it was deleted from that container
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > shows a write to a child it shares with the store, made before the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..9e57f36 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -126,12 +126,6 @@ export class StoreInternal {
       if (!frame) break;
       const {node, versions} = frame;
       if (versions) {
-        for (const [child, previous] of versions) {
-          if (child.version !== previous) {
-            node.version++;
-            break;
-          }
-        }
       } else if (node.detachedVersions) {
         pending.push({node, versions: node.detachedVersions});
         node.detachedVersions = undefined;
```

### `o14-resumeScope-walk`

Lines: +1 -7. Result: 1336 pass, 5 fail.

Failing tests:

- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..1f5f899 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -146,13 +146,7 @@ export class StoreInternal {
   /** A caller can still read, mutate, or subscribe to a detached subtree. */
   resumeScope(): void {
     if (!this.detachedVersions) return;
-    let scope: StoreInternal = this;
-    let parent = scope.detachedParent?.deref();
-    while (parent?.detachedVersions) {
-      scope = parent;
-      parent = scope.detachedParent?.deref();
-    }
-    scope.resume();
+    this.resume();
   }
 
   /** This node and every container that currently owns it, up to each root. */
```

### `o15-detachedParent-all`

Lines: +1 -10. Result: 1335 pass, 6 fail.

Failing tests:

- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a row held from a removed list keeps that list alive
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..11b1c00 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -20,7 +20,6 @@ export class StoreInternal {
   // An unobserved, detached container keeps its children but stops receiving
   // their mutations. Retaining one row must not keep every filtered array alive.
   private detachedVersions?: Map<StoreInternal, number>;
-  private detachedParent?: ParentReference;
 
   constructor(
     readonly target: object,
@@ -44,7 +43,6 @@ export class StoreInternal {
   }
 
   private connect(child: StoreInternal): void {
-    child.detachedParent = undefined;
     const count = child.parents.get(this.reference) ?? 0;
     if (!count) {
       child.trackSharedParents();
@@ -106,7 +104,6 @@ export class StoreInternal {
         versions.set(child, child.version);
         node.disconnect(child);
         if (child.canSuspend()) {
-          child.detachedParent = node.reference;
           pending.push(child);
         }
       }
@@ -146,13 +143,7 @@ export class StoreInternal {
   /** A caller can still read, mutate, or subscribe to a detached subtree. */
   resumeScope(): void {
     if (!this.detachedVersions) return;
-    let scope: StoreInternal = this;
-    let parent = scope.detachedParent?.deref();
-    while (parent?.detachedVersions) {
-      scope = parent;
-      parent = scope.detachedParent?.deref();
-    }
-    scope.resume();
+    this.resume();
   }
 
   /** This node and every container that currently owns it, up to each root. */
```

### `o16-never-suspend`

Lines: +1 -1. Result: 1332 pass, 9 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > filtering repeatedly keeps a single proxy and bounded work per scalar write
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > an owner inside a container that left the store and came back, while nothing observed it, is called after a later owner of the same record
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > two owners inside a container are called in the opposite order once the container left the store and came back
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a list that was replaced is collected while a row it held lives on in the store
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..f0cb4ad 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -87,7 +87,7 @@ export class StoreInternal {
   }
 
   private canSuspend(): boolean {
-    return (
+    return false && (
       !this.detachedVersions &&
       !this.parents.size &&
       !this.isStoreRoot &&
```

### `o17-weakref-fallbacks`

Lines: +2 -4. Result: 1335 pass, 6 fail.

Failing tests:

- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a list that was replaced is collected while a row it held lives on in the store
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a list that was replaced while it had a subscriber is kept alive by a row that lives on in the store
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a row held from a removed list keeps that list alive
- `src/core/core.characterisation.noWeakRef.test.ts`: a runtime without WeakRef > still tells a store about a write to a nested object
- `src/core/core.characterisation.noWeakRef.test.ts`: a runtime without WeakRef > still shares one child between two stores
- `src/core/core.noFinalizationRegistry.test.ts`: a runtime without FinalizationRegistry > still shares one child between two stores

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..c66b17b 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -14,7 +14,7 @@ export class StoreInternal {
   readonly childInternals = new Map<string | symbol, StoreInternal>();
   readonly parents = new Map<ParentReference, number>();
   readonly reference: ParentReference =
-    typeof WeakRef === 'function' ? new WeakRef(this) : {deref: () => this};
+    new WeakRef(this);
   private parentCleanup?: FinalizationRegistry<ParentReference>;
 
   // An unobserved, detached container keeps its children but stops receiving
@@ -59,9 +59,7 @@ export class StoreInternal {
   private trackSharedParents(): void {
     if (
       this.parentCleanup ||
-      !this.parents.size ||
-      typeof WeakRef !== 'function' ||
-      typeof FinalizationRegistry !== 'function'
+      !this.parents.size
     )
       return;
     const parents = this.parents;
```

### `o18-ancestors-prune`

Lines: +0 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..fd7ea7d 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -162,7 +162,6 @@ export class StoreInternal {
       for (const reference of node.parents.keys()) {
         const parent = reference.deref();
         if (parent) visited.add(parent);
-        else node.parents.delete(reference);
       }
     }
     return visited;
```

### `o20-strong-parents`

Lines: +1 -1. Result: 1336 pass, 5 fail.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > read-only shared data releases collected request owners without a child mutation
- `src/core/core.ownership.test.ts`: shared proxy ownership > a child whose only owner was collected drops that owner when it gains a new one
- `src/core/core.characterisation.detached.test.ts`: what the collector can free > a store that is dropped while one of its children is held is collected, and the child goes on working
- `src/core/core.characterisation.detached.test.ts`: what the collector can free > a row held from a removed list does not keep that list alive, and works once the list is gone
- `src/core/core.characterisation.detached.test.ts`: what the collector can free > a child shared by two stores lets a dropped store be collected, and still reports to the other store

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..6ee2dcd 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -14,7 +14,7 @@ export class StoreInternal {
   readonly childInternals = new Map<string | symbol, StoreInternal>();
   readonly parents = new Map<ParentReference, number>();
   readonly reference: ParentReference =
-    typeof WeakRef === 'function' ? new WeakRef(this) : {deref: () => this};
+    {deref: () => this};
   private parentCleanup?: FinalizationRegistry<ParentReference>;
 
   // An unobserved, detached container keeps its children but stops receiving
```

### `o21-resume-frame-break`

Lines: +1 -2. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..fa7f9ba 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -123,8 +123,7 @@ export class StoreInternal {
     }[] = [{node: this}];
     while (pending.length) {
       const frame = pending.pop();
-      if (!frame) break;
-      const {node, versions} = frame;
+      const {node, versions} = frame as NonNullable<typeof frame>;
       if (versions) {
         for (const [child, previous] of versions) {
           if (child.version !== previous) {
```

### `o22-resume-shared-once`

Lines: +1 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..e046e80 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -137,7 +137,7 @@ export class StoreInternal {
         node.detachedVersions = undefined;
         for (const child of node.childInternals.values()) {
           node.connect(child);
-          if (child.detachedVersions) pending.push({node: child});
+          pending.push({node: child});
         }
       }
     }
```

### `s01-per-snapshot-cache`

Lines: +0 -10. Result: 1338 pass, 3 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on snapshots > runs nothing again on the same snapshot, whichever level is read
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on snapshots > gives an inner getter result a new identity on the next snapshot when the outer getter was read first
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on snapshots > recomputes for an older snapshot read after a newer one, and again for the snapshot after it

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..bb7074a 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -125,8 +125,6 @@ function evaluateSnapshotGetter(
   getterFn: () => unknown,
 ): unknown {
   // ── Per-snapshot fast path ──
-  const perSnapCache = snapshotGetterCache.get(currentSnap);
-  if (perSnapCache?.has(key)) return perSnapCache.get(key);
 
   // ── Cross-snapshot memo ──
   let memoMap = crossSnapshotMemo.get(target);
@@ -150,14 +148,6 @@ function evaluateSnapshotGetter(
     memoMap.set(key, {deps: computation.deps, result});
   }
 
-  // Save per-snapshot cache.
-  let cache = snapshotGetterCache.get(currentSnap);
-  if (!cache) {
-    cache = new Map();
-    snapshotGetterCache.set(currentSnap, cache);
-  }
-  cache.set(key, result);
-
   return result;
 }
```

### `s02-cross-memo`

Lines: +1 -1. Result: 1328 pass, 13 fail.

Failing tests:

- `src/snapshot/snapshot.computed.test.ts`: computed getters — snapshot memoization > returns same reference across snapshots when getter deps have not changed
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on snapshots > re-runs the two inner getters, not the outermost, on the next snapshot after an unrelated write
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on snapshots > runs nothing on the snapshot after that one
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on snapshots > keeps the inner getter result identity when the inner getter was read first
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on snapshots > skips the outer levels when a memoized inner getter recomputes to the same result
- `src/core/core.characterisation.getters.test.ts`: getters that read a reactive collection > evaluate on a snapshot and stay memoized across an unrelated write
- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a snapshot getter that reads another store keeps its result after that store changes
- `src/core/core.characterisation.getters.test.ts`: a getter that returns an object or an array, on a snapshot > carries a mutation of the returned object into the next snapshot
- `src/core/core.characterisation.getters.test.ts`: a getter that catches the error of another getter > keeps its fallback on later snapshots after the other getter recovers
- `src/core/core.characterisation.getters.test.ts`: getters on a subclass > a snapshot runs the base body inside the overriding getter in the same way
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a Date, a Map, a frozen object or an unmarked class instance > is still not re-run after a later unrelated write, on the store or on the next snapshot
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/frameworks/react/react.computed.test.tsx`: computed getters — useClassyStore integration > selector with getter returns stable reference — no re-render on unrelated change

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..8f345c9 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -134,7 +134,7 @@ function evaluateSnapshotGetter(
 
   let result: unknown;
 
-  if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
+  if (false as boolean) {
     // Dependencies unchanged → reuse previous result.
     result = prev.result;
   } else {
```

### `s04-readProps`

Lines: +1 -5. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..d8d46b0 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -74,7 +74,6 @@ function computeWithTracking(
   getterFn: () => unknown,
 ): {deps: GetterDep[]; result: unknown} {
   const deps: GetterDep[] = [];
-  const readProps = new Set<string | symbol>();
 
   // Use an empty non-frozen target — we delegate everything to `snap`.
   const handler: ProxyHandler<object> = {
@@ -82,10 +81,7 @@ function computeWithTracking(
       // Delegate to the real snapshot (receiver = snap so installed getters
       // run with `this = snap`, triggering their own memoization chain).
       const value = Reflect.get(snap, prop, snap);
-      if (!readProps.has(prop)) {
-        readProps.add(prop);
-        deps.push({prop, value});
-      }
+      deps.push({prop, value});
       return value;
     },
   };
```

### `s05-mark-symbol-check`

Lines: +1 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/snapshot/snapshot.symbolKeys.test.tsx`: a component that reads one field of a state with a symbol key > is rendered again for a field it did not read when the symbol key holds an object
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > tracks nested object values held by class symbol fields

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..bf2739b 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -176,7 +176,7 @@ function markSnapshotForTracking(value: object): void {
       descriptor.value !== null
     );
   });
-  markToTrack(value, !hasObjectSymbol);
+  markToTrack(value, true);
 }
 
 /** Return the versioned snapshot for a data edge, or its opaque/primitive value. */
```

### `s06-mark-none`

Lines: +0 -1. Result: 1330 pass, 11 fail.

Failing tests:

- `src/snapshot/snapshot.symbolKeys.test.tsx`: a component that reads one field of a state with a symbol key > is rendered again for a field it did not read when the symbol key holds an object
- `src/snapshot/snapshot.test.ts`: snapshot() > property read tracking > tracks class-root properties without subscribing to unrelated fields
- `src/snapshot/snapshot.test.ts`: snapshot() > property read tracking > tracks previously accessed nested opted-in classes
- `src/snapshot/snapshot.test.ts`: snapshot() > property read tracking > tracks previously unaccessed nested opted-in classes
- `src/snapshot/snapshot.test.ts`: snapshot() > property read tracking > tracks null-prototype store properties
- `src/frameworks/react/react.behavior.test.tsx`: Multiple components sharing the same store > auto-tracked components update only for properties they read
- `src/frameworks/react/react.lifecycle.test.tsx`: useClassyStore lifecycle > tracks nested conditional reads on a null-prototype object
- `src/frameworks/react/react.lifecycle.test.tsx`: useClassyStore lifecycle > tracks nested conditional reads on a nested opted-in class
- `src/frameworks/react/react.lifecycle.test.tsx`: useClassyStore lifecycle > tracks the currently rendered conditional property (auto-tracked)
- `src/frameworks/react/react.lifecycle.test.tsx`: useClassyStore lifecycle > discards reads from an abandoned suspended render (auto-tracked)
- `src/frameworks/react/react.test.tsx`: useLocalStore > works with auto-tracked mode

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..e37c00a 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -278,7 +278,6 @@ function createSnapshotRecursive<T extends object>(
     installMemoizedGetters(snap as Record<string | symbol, unknown>, target);
   }
 
-  markSnapshotForTracking(snap);
   Object.freeze(snap);
   registerSnapshot(snap, target);
   // Cache AFTER populating + freezing. The reference is stable.
```

### `s07-array-fastpath`

Lines: +1 -3. Result: 1339 pass, 2 fail.

Failing tests:

- `src/snapshot/snapshot.redefinedElements.test.ts`: an array element redefined from an object to a value that is not an object > shows a number in a snapshot while the store still returns the old object
- `src/snapshot/snapshot.redefinedElements.test.ts`: an array element redefined from an object to a value that is not an object > shows null in a snapshot while the store still returns the old object

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..adb7171 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -255,9 +255,7 @@ function createSnapshotRecursive<T extends object>(
   if (Array.isArray(target)) {
     // Only objects can be child nodes; primitives need no key lookup.
     snap = mapOwnArrayElements(target, (value, index) =>
-      typeof value === 'object' && value !== null
-        ? snapshotValue(value, internal, String(index), inProgress)
-        : value,
+      snapshotValue(value, internal, String(index), inProgress),
     );
   } else {
     // Preserve the prototype chain and install memoized getters on the snapshot.
```

### `s08-setter-only`

Lines: +1 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..3804fc3 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -201,7 +201,7 @@ function installMemoizedGetters(snap: object, target: object): void {
       if (seen.has(key)) continue;
       seen.add(key);
       const descriptor = Object.getOwnPropertyDescriptor(proto, key);
-      if (!descriptor || 'value' in descriptor) continue;
+      if (!descriptor || 'value' in descriptor || !descriptor.get) continue;
       const getter = descriptor.get;
       function memoizedGetter(this: object) {
         return getter
```

### `s09-seen`

Lines: +0 -2. Result: 1337 pass, 4 fail.

Failing tests:

- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > uses the most-derived getter when a subclass overrides a parent getter
- `src/core/core.computed.test.ts`: computed getters — write proxy memoization > overridden and non-overridden getters coexist correctly
- `src/core/core.characterisation.getters.test.ts`: getters on a subclass > a snapshot runs the base body inside the overriding getter in the same way
- `src/core/core.characterisation.getters.test.ts`: getters on a subclass > an own data property hides a prototype getter until it is deleted

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..4b67983 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -198,8 +198,6 @@ function installMemoizedGetters(snap: object, target: object): void {
   let proto: object | null = target;
   while (proto && proto !== Object.prototype) {
     for (const key of Reflect.ownKeys(proto)) {
-      if (seen.has(key)) continue;
-      seen.add(key);
       const descriptor = Object.getOwnPropertyDescriptor(proto, key);
       if (!descriptor || 'value' in descriptor) continue;
       const getter = descriptor.get;
```

### `s10-originalAccessors-stub`

Lines: +1 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/snapshot/snapshot.restoredGetters.test.ts`: a nested object rebuilt by undo > still takes a class getter from its class, and lists it in a snapshot as before
- `src/utils/cloneSnapshot/cloneSnapshot.test.ts`: cloneSnapshotValue > restores own getters and setters when cloning a nested snapshot

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..01ebba0 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -29,7 +29,7 @@ const originalAccessors = new WeakMap<
 >();
 
 export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
-  return getter && originalAccessors.get(getter);
+  return undefined;
 }
 
 // ── Cross-snapshot getter memoization ─────────────────────────────────────────
```

### `s11-cycle-throw`

Lines: +0 -5. Result: 1334 pass, 7 fail.

Failing tests:

- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > throws a clear error when the store contains a circular reference
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > throws on a self-referencing array (tracked sub-tree)
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > throws on a circular reference inside an untracked nested plain object
- `src/core/core.characterisation.identity.test.ts`: reference cycles > a self-reference assigned later makes snapshot() throw, and deleting it makes snapshot() work again
- `src/core/core.characterisation.identity.test.ts`: reference cycles > a subtree outside the cycle can still be snapshotted on its own
- `src/core/core.characterisation.identity.test.ts`: reference cycles > two objects that reference each other read each other back, and snapshot() throws for every node on the path to them
- `src/core/core.characterisation.identity.test.ts`: reference cycles > two stores that reference each other notify each other and cannot be snapshotted until one lets go

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..d22cdff 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -243,11 +243,6 @@ function createSnapshotRecursive<T extends object>(
     return cached[1] as T;
   }
 
-  if (inProgress.has(target)) {
-    throw new Error(
-      '@codebelt/classy-store: circular reference detected in snapshot',
-    );
-  }
   inProgress.add(target);
 
   let snap: Record<string | symbol, unknown> | unknown[];
```

### `s12-inProgress-delete`

Lines: +0 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..2d4a5cf 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -283,7 +283,6 @@ function createSnapshotRecursive<T extends object>(
   registerSnapshot(snap, target);
   // Cache AFTER populating + freezing. The reference is stable.
   snapshotCache.set(target, [internal.version, snap]);
-  inProgress.delete(target);
   return snap as T;
 }
```

### `s13-define-flags`

Lines: +0 -3. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..7de164d 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -213,7 +213,6 @@ function installMemoizedGetters(snap: object, target: object): void {
       Object.defineProperty(snap, key, {
         get: memoizedGetter,
         enumerable: own ? descriptor.enumerable : true,
-        configurable: true,
       });
     }
     proto = Object.getPrototypeOf(proto);
@@ -269,8 +268,6 @@ function createSnapshotRecursive<T extends object>(
       Object.defineProperty(snap, key, {
         value: snapshotValue(desc.value, internal, key, inProgress),
         enumerable: desc.enumerable,
-        configurable: true,
-        writable: true,
       });
     }
```

### `s14-registerSnapshot`

Lines: +0 -1. Result: 1333 pass, 8 fail.

Failing tests:

- `src/core/core.characterisation.detached.test.ts`: what the collector can free > a removed subtree that nobody holds is kept alive by the last snapshot of its store, until the next snapshot is taken
- `src/core/core.characterisation.detached.test.ts`: what the collector can free > a store that is dropped while a snapshot of it is held is not collected until the snapshot is dropped too
- `src/core/core.snapshotValues.test.ts`: identity helpers > identityOf is the same for the raw object, its proxy, snapshots and tracked reads
- `src/core/core.fuzz.findings.test.ts`: core — findings of the differential test > reactive collections > a snapshot given as a new member is stored frozen and answers for the live row
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/collections/collections.identity.test.ts`: reactive collections inside a store — object members > the raw object, its store proxy and its snapshots are one key
- `src/collections/collections.identity.test.ts`: reactive collections inside a store — object members > an older snapshot of a member still identifies it after it changes
- `src/collections/collections.identity.test.ts`: reactive collections — tracked reads in a component > a lookup records the entries it compared, so a replaced key is noticed

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..66699cb 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -280,7 +280,6 @@ function createSnapshotRecursive<T extends object>(
 
   markSnapshotForTracking(snap);
   Object.freeze(snap);
-  registerSnapshot(snap, target);
   // Cache AFTER populating + freezing. The reference is stable.
   snapshotCache.set(target, [internal.version, snap]);
   inProgress.delete(target);
```

### `s15-assign-not-define`

Lines: +1 -6. Result: 1336 pass, 5 fail.

Failing tests:

- `src/snapshot/snapshot.test.ts`: snapshot data properties and accessors > preserves an own JSON \_\_proto\_\_ key without changing snapshot prototypes
- `src/core/core.characterisation.getters.test.ts`: getters on a subclass > an own data property hides a prototype getter until it is deleted
- `src/core/core.characterisation.getters.test.ts`: static getters > on a class store are computed on its snapshot, which is an object and not a class
- `src/core/core.characterisation.invariants.test.ts`: an own property named \_\_proto\_\_ > a write inside it and a replacement of it each notify once and leave the prototype alone
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: an existing property > a field made non-enumerable leaves Object.keys and JSON at once, and the keys of a cached snapshot with the next write

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..3bf5aa2 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -266,12 +266,7 @@ function createSnapshotRecursive<T extends object>(
       const desc = Object.getOwnPropertyDescriptor(target, key);
       if (!desc || !('value' in desc)) continue;
       // Assignment can call an inherited setter (including Object.prototype.__proto__).
-      Object.defineProperty(snap, key, {
-        value: snapshotValue(desc.value, internal, key, inProgress),
-        enumerable: desc.enumerable,
-        configurable: true,
-        writable: true,
-      });
+      (snap as Record<string | symbol, unknown>)[key] = snapshotValue(desc.value, internal, key, inProgress);
     }
 
     // Install lazy-memoizing getters with cross-snapshot caching.
```

### `s16-proto-stop`

Lines: +1 -1. Result: 1322 pass, 19 fail.

Failing tests:

- `src/snapshot/snapshot.ownKeys.test.ts`: the own keys of a snapshot > list a getter declared before a data field after that field
- `src/snapshot/snapshot.ownKeys.test.ts`: a state object that is a Proxy listing a key it does not describe > is snapshotted without that key
- `src/snapshot/snapshot.ownKeys.test.ts`: a state object that is a Proxy listing a key it does not describe > is snapshotted without that key when it is nested in a store
- `src/snapshot/snapshot.restoredGetters.test.ts`: a nested object rebuilt by undo > still takes a class getter from its class, and lists it in a snapshot as before
- `src/snapshot/snapshot.restoredGetters.test.ts`: a nested object rebuilt by undo > gets back a getter that the object declared itself
- `src/snapshot/snapshot.test.ts`: snapshot() > leaf types > exposes class getters as enumerable own properties
- `src/snapshot/snapshot.test.ts`: snapshot() > leaf types > keeps an own getter as enumerable as it was declared
- `src/core/core.characterisation.identity.test.ts`: the same raw object held in two stores > keeps notifying the store that still holds it after the other store drops it
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > removed by assigning null over it, it stops notifying the outer store and stays a working store
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > removed by deleting its property, it stops notifying the outer store and stays a working store
- `src/core/core.characterisation.getters.test.ts`: a getter that throws > makes spreading and JSON.stringify of the snapshot throw, but not Object.keys
- `src/core/core.characterisation.getters.test.ts`: a getter on an object literal passed to createClassyStore > is an own enumerable key of the store, where a class getter is not
- `src/core/core.characterisation.getters.test.ts`: a getter that asks for the shape of 'this' on a snapshot > reads children and calls methods through 'this' as usual
- `src/core/core.characterisation.invariants.test.ts`: assigning \_\_proto\_\_ or calling Object.setPrototypeOf on a store > a snapshot taken before Object.setPrototypeOf is still returned after it, until the next ordinary write
- `src/core/core.characterisation.invariants.test.ts`: assigning \_\_proto\_\_ or calling Object.setPrototypeOf on a store > a getter read before a prototype swap keeps its old result until a dependency changes
- `src/core/core.characterisation.invariants.test.ts`: assigning \_\_proto\_\_ or calling Object.setPrototypeOf on a store > Object.assign with a JSON \_\_proto\_\_ key swaps the prototype, as on a plain object, and notifies for the other keys only
- `src/core/core.characterisation.invariants.test.ts`: sparse arrays > sort moves a hole to the end, in one notification
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: an existing property > a field made non-enumerable leaves Object.keys and JSON at once, and the keys of a cached snapshot with the next write
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..15f1d8d 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -196,7 +196,7 @@ function snapshotValue(
 function installMemoizedGetters(snap: object, target: object): void {
   const seen = new Set<string | symbol>();
   let proto: object | null = target;
-  while (proto && proto !== Object.prototype) {
+  while (proto) {
     for (const key of Reflect.ownKeys(proto)) {
       if (seen.has(key)) continue;
       seen.add(key);
```

### `s17-own-descriptor-null`

Lines: +1 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/snapshot/snapshot.restoredGetters.test.ts`: a nested object rebuilt by undo > still takes a class getter from its class, and lists it in a snapshot as before

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..ed72c39 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -209,7 +209,7 @@ function installMemoizedGetters(snap: object, target: object): void {
           : undefined;
       }
       const own = proto === target;
-      originalAccessors.set(memoizedGetter, own ? descriptor : null);
+      originalAccessors.set(memoizedGetter, descriptor);
       Object.defineProperty(snap, key, {
         get: memoizedGetter,
         enumerable: own ? descriptor.enumerable : true,
```

### `s18-symbol-scan-descriptor`

Lines: +1 -3. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..21338b0 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -170,9 +170,7 @@ function markSnapshotForTracking(value: object): void {
   const hasObjectSymbol = Object.getOwnPropertySymbols(value).some((key) => {
     const descriptor = Object.getOwnPropertyDescriptor(value, key);
     return (
-      descriptor &&
-      'value' in descriptor &&
-      typeof descriptor.value === 'object' &&
+      typeof descriptor?.value === 'object' &&
       descriptor.value !== null
     );
   });
```

### `s19-freeze`

Lines: +0 -1. Result: 1299 pass, 42 fail.

Failing tests:

- `src/types.collections.test.ts`: collections entry point types > the Snapshot of a collection makes its fields readonly and leaves every method, mutators included, as it was
- `src/types.snapshot.test.ts`: Snapshot callable types > still rejects assignment to readonly data, nested values, and arrays
- `src/types.exports.test.ts`: public entry point types > PROXYABLE is a symbol that a class can use as a static key
- `src/snapshot/snapshot.memory.test.ts`: snapshot cache ownership > releases the obsolete untracked clone when an array becomes tracked and is truncated
- `src/snapshot/snapshot.memory.test.ts`: snapshot cache ownership > releases the obsolete untracked clone when an array becomes tracked and its child is replaced
- `src/snapshot/snapshot.test.ts`: snapshot() > freezing > returns a deeply frozen object
- `src/snapshot/snapshot.test.ts`: snapshot() > freezing > throws when attempting to mutate a snapshot
- `src/snapshot/snapshot.test.ts`: snapshot() > array snapshots > preserves holes, explicit undefined elements, and trailing length across edits
- `src/snapshot/snapshot.test.ts`: snapshot() > edge cases > snapshot of an empty store
- `src/snapshot/snapshot.test.ts`: snapshot() > untracked nested objects > deep-clones untracked nested objects
- `src/snapshot/snapshot.test.ts`: snapshot() > untracked nested objects > snapshot of deeply nested arrays freezes all levels
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > snapshot of store with empty array
- `src/snapshot/snapshot.test.ts`: snapshot() > special structures > snapshot of store with nested empty objects
- `src/snapshot/snapshot.computed.test.ts`: computed getters — snapshot memoization > snapshot getter reads frozen data correctly
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > has one snapshot: the outer snapshot holds the snapshot of the inner store
- `src/core/core.characterisation.getters.test.ts`: a getter that returns an object or an array, on a snapshot > returns an unfrozen object from a deeply frozen snapshot
- `src/core/core.characterisation.getters.test.ts`: a getter that returns an object or an array, on a snapshot > returns the frozen child snapshot when the getter returns a child
- `src/core/core.characterisation.getters.test.ts`: a getter that returns an object or an array, on a snapshot > returns an unfrozen array of frozen element snapshots from a filter getter
- `src/core/core.characterisation.getters.test.ts`: a getter that writes to the store while it runs > drops the write on a snapshot: no error, no notification, snapshot and store unchanged
- `src/core/core.snapshotValues.test.ts`: snapshots kept in a store > a snapshot assigned into a store is held by reference and stays frozen
- `src/core/core.snapshotValues.test.ts`: array snapshots > a sparse array keeps its holes, later elements and length
- `src/core/core.frozenValues.test.ts`: a frozen object that holds another store > a frozen root passes on the changes of a store embedded in it
- `src/core/core.characterisation.invariants.test.ts`: symbols as data keys > an object under a symbol key is a proxy: a write inside it notifies and gives a new frozen snapshot of it
- `src/core/core.characterisation.invariants.test.ts`: the well-known symbols a store is asked for > a class with a Symbol.iterator generator yields its rows as proxies from the store and as frozen snapshots from a snapshot
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: a new data property > holding an object: a snapshot hands it out raw and unfrozen until the store has read it; then it is a proxy
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/collections/collections.test.ts`: reactiveMap() > snapshot captures map data
- `src/collections/collections.test.ts`: reactiveSet() > snapshot captures set data
- `src/frameworks/svelte/svelte.test.ts`: toSvelteStore > immediately delivers the current immutable snapshot to each subscriber
- `src/frameworks/vue/vue.test.ts`: vue useClassyStore > returns a shallow ref containing the current immutable snapshot
- `src/frameworks/angular/angular.test.ts`: angular injectClassyStore > returns a readonly signal with the current immutable snapshot
- `src/frameworks/solid/solid.test.ts`: solid useClassyStore > returns the current immutable snapshot without copying it
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — transactions > unshift on a long list builds one snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — transactions > sort on a long list builds one snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — transactions > reverse on a long list builds one snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — transactions > splice on a long list builds one snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — batch() > a batched loop of direct writes builds one list snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — values handed back to the store > a row from a rendered list (selector) is stored as an immutable snapshot
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — values handed back to the store > a row from a rendered list (auto-tracked) is stored as an immutable snapshot
- `src/frameworks/react/react.performance.test.tsx`: useClassyStore render counts > protects shared root targets starting with the first consumer
- `src/frameworks/react/react.performance.test.tsx`: useClassyStore render counts > protects shared array targets starting with the first consumer
- `src/frameworks/react/react.performance.test.tsx`: useClassyStore render counts > protects shared nested row targets starting with the first consumer

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..301a138 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -279,7 +279,6 @@ function createSnapshotRecursive<T extends object>(
   }
 
   markSnapshotForTracking(snap);
-  Object.freeze(snap);
   registerSnapshot(snap, target);
   // Cache AFTER populating + freezing. The reference is stable.
   snapshotCache.set(target, [internal.version, snap]);
```

### `s20-version-cache`

Lines: +0 -3. Result: 1230 pass, 111 fail.

Failing tests:

- `src/snapshot/snapshot.memory.test.ts`: snapshot cache ownership > releases the obsolete untracked clone when an array becomes tracked and is truncated
- `src/snapshot/snapshot.memory.test.ts`: snapshot cache ownership > releases the obsolete untracked clone when an array becomes tracked and its child is replaced
- `src/snapshot/snapshot.memory.test.ts`: snapshot cache ownership > releases the obsolete untracked clone when a plain object becomes tracked
- `src/snapshot/snapshot.symbolKeys.test.tsx`: a component that reads one field of a state with a symbol key > is not rendered again for a field it did not read when the symbol key holds a number
- `src/snapshot/snapshot.symbolKeys.test.tsx`: a component that reads one field of a state with a symbol key > is rendered again for a field it did not read when the symbol key holds an object
- `src/snapshot/snapshot.test.ts`: snapshot() > version cache > returns the same snapshot object when version has not changed
- `src/snapshot/snapshot.test.ts`: snapshot() > structural sharing > unchanged nested objects retain the same reference across snapshots
- `src/snapshot/snapshot.test.ts`: snapshot() > structural sharing > unchanged array elements retain the same reference
- `src/snapshot/snapshot.test.ts`: snapshot() > array snapshots > preserves holes, explicit undefined elements, and trailing length across edits
- `src/snapshot/snapshot.test.ts`: snapshot() > subclass inheritance > structural sharing works across inheritance levels
- `src/snapshot/snapshot.test.ts`: snapshot() > cross-snapshot getter memoization > getter result is stable across snapshots when deps unchanged
- `src/snapshot/snapshot.computed.test.ts`: computed getters — snapshot memoization > returns same reference across snapshots when getter deps have not changed
- `src/core/core.ownership.test.ts`: shared proxy ownership > a retained row still notifies once after reverse, and stops after removal
- `src/core/core.ownership.test.ts`: shared proxy ownership > an edit reaches every alias, including a path never read through the proxy
- `src/core/core.characterisation.identity.test.ts`: createClassyStore() called again > keeps the state, subscribers and snapshots of the first call
- `src/core/core.characterisation.identity.test.ts`: the same raw object held in two stores > has one snapshot, shared by both root snapshots before and after a change
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > has one snapshot: the outer snapshot holds the snapshot of the inner store
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > is left as it is when the same store, or the raw object behind it, is assigned again
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > removed by assigning null over it, it stops notifying the outer store and stays a working store
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > removed by deleting its property, it stops notifying the outer store and stays a working store
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > is connected in the same way when it is already in the object passed to createClassyStore()
- `src/core/core.characterisation.identity.test.ts`: a store inside a store > is connected when it is a class instance embedded by its proxy, and its snapshot keeps the class
- `src/core/core.characterisation.identity.test.ts`: a nested proxy read from one store and assigned into another > has one snapshot, held by both root snapshots
- `src/core/core.characterisation.identity.test.ts`: a nested proxy read from one store and assigned into another > is adopted, not wrapped again, when it is already in the object passed to createClassyStore()
- `src/core/core.characterisation.identity.test.ts`: reference cycles > a self-reference assigned later makes snapshot() throw, and deleting it makes snapshot() work again
- `src/core/core.characterisation.identity.test.ts`: reference cycles > a subtree outside the cycle can still be snapshotted on its own
- `src/core/core.characterisation.identity.test.ts`: reference cycles > two stores that reference each other notify each other and cannot be snapshotted until one lets go
- `src/core/core.characterisation.identity.test.ts`: reference stability > assigning the raw object a property already holds changes nothing
- `src/core/core.characterisation.identity.test.ts`: reference stability > a write through the raw object is not observed, and snapshots keep the old content until the object is written through its proxy
- `src/core/core.characterisation.identity.test.ts`: snapshot identity of nested proxies > the snapshot of a nested proxy taken first is reused inside the root snapshot
- `src/core/core.characterisation.identity.test.ts`: snapshot identity of nested proxies > the snapshot of a nested proxy taken after the root snapshot is the object inside it
- `src/core/core.characterisation.identity.test.ts`: snapshot identity of nested proxies > the snapshot of a nested proxy keeps its reference when a sibling changes and gets a new one when its own content changes
- `src/core/core.characterisation.identity.test.ts`: snapshot identity of nested proxies > a nested proxy removed from the store keeps its last snapshot until it is written again
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.characterisation.getters.test.ts`: nested getters, three levels deep, on snapshots > keeps the inner getter result identity when the inner getter was read first
- `src/core/core.characterisation.getters.test.ts`: getters that read a reactive collection > evaluate on a snapshot and stay memoized across an unrelated write
- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a snapshot getter that reads another store keeps its result after that store changes
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a Date, a Map, a frozen object or an unmarked class instance > keeps its result on the snapshot, whose own data does show the mutation
- `src/core/core.test.ts`: createClassyStore() — core reactivity > primitive mutations > creates a missing property assigned undefined and notifies exactly once
- `src/core/core.test.ts`: createClassyStore() — core reactivity > assignments with no effect on ownership > assigning a nested proxy back to its own property changes nothing
- `src/core/core.characterisation.detached.test.ts`: a write through a proxy held from before its object left the store > after delete, it shows in a snapshot of the held proxy and leaves the snapshot of the store as it was
- `src/core/core.characterisation.detached.test.ts`: a write through a proxy held from before its object left the store > after replacing its property, it shows in a snapshot of the held proxy and leaves the snapshot of the store as it was
- `src/core/core.characterisation.detached.test.ts`: a write through a proxy held from before its object left the store > after splice, it shows in a snapshot of the held proxy and leaves the snapshot of the store as it was
- `src/core/core.characterisation.detached.test.ts`: a write through a proxy held from before its object left the store > after pop, it shows in a snapshot of the held proxy and leaves the snapshot of the store as it was
- `src/core/core.characterisation.detached.test.ts`: a write through a proxy held from before its object left the store > after a shorter array length, it shows in a snapshot of the held proxy and leaves the snapshot of the store as it was
- `src/core/core.characterisation.detached.test.ts`: a write through a proxy held from before its object left the store > after replacing its parent, it shows in a snapshot of the held proxy and leaves the snapshot of the store as it was
- `src/core/core.characterisation.detached.test.ts`: a container that left the store and is still held > the snapshot of a removed list keeps the identity of the rows that did not change
- `src/core/core.characterisation.detached.test.ts`: putting a removed subtree back > a raw object changed directly while it was out of the store and written back keeps the snapshot from before it left
- `src/core/core.characterisation.detached.test.ts`: putting a removed subtree back > a subtree removed and written back unchanged keeps the snapshot it had before
- `src/core/core.characterisation.detached.test.ts`: a child with several owners > held by two stores, a write reaches the store that still holds it, and then neither
- `src/core/core.fuzz.findings.test.ts`: core — findings of the differential test > a delete that removes nothing counts as a write > a write of the value already there does neither, for comparison
- `src/core/core.fuzz.findings.test.ts`: core — findings of the differential test > a delete that removes nothing counts as a write > sort on a list in order without holes does not notify, for comparison
- `src/core/core.frozenValues.test.ts`: a frozen object held in a store > an object inside it is not tracked: replace the frozen object to update
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.characterisation.invariants.test.ts`: a sealed or non-extensible object as the store root > Reflect.set and Reflect.deleteProperty report the same refusals as false, without throwing
- `src/core/core.characterisation.invariants.test.ts`: a field that is non-writable, non-configurable, or both, holding a primitive > neither: a write and a delete each throw a TypeError, and no one is notified
- `src/core/core.characterisation.invariants.test.ts`: a field that is non-writable, non-configurable, or both, holding an object > neither: the object is handed out raw, so a write to it notifies no one and shows in an existing snapshot
- `src/core/core.characterisation.invariants.test.ts`: symbols as data keys > an object under a symbol key is a proxy: a write inside it notifies and gives a new frozen snapshot of it
- `src/core/core.characterisation.invariants.test.ts`: the well-known symbols a store is asked for > a class with a Symbol.iterator generator yields its rows as proxies from the store and as frozen snapshots from a snapshot
- `src/core/core.characterisation.invariants.test.ts`: assigning \_\_proto\_\_ or calling Object.setPrototypeOf on a store > a snapshot taken before Object.setPrototypeOf is still returned after it, until the next ordinary write
- `src/core/core.characterisation.invariants.test.ts`: sparse arrays > delete list[1] leaves a hole and the length, notifies once, and disconnects the element
- `src/core/core.characterisation.invariants.test.ts`: writing the length of an array > a longer length notifies once and adds holes, not undefined elements
- `src/core/core.characterisation.invariants.test.ts`: writing the length of an array > a shorter length keeps the snapshots of the elements that stay
- `src/core/core.characterisation.invariants.test.ts`: writing the length of an array > a length defined with Object.defineProperty empties the raw array in silence, and the store still hands out the removed element
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: a new data property > is live at once, notifies no one, and is missing from the snapshot cached before it
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: a new data property > reaches a cached snapshot with the next write that changes a field, not with a write of the value it holds
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: an existing property > a field made non-enumerable leaves Object.keys and JSON at once, and the keys of a cached snapshot with the next write
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: accessors, and several properties at once > a new accessor is a memoized getter on the live store, and reaches a cached snapshot with the next write
- `src/core/core.characterisation.invariants.test.ts`: Object.defineProperty on a store: accessors, and several properties at once > Object.defineProperties defines each property and notifies no one
- `src/core/core.characterisation.invariants.test.ts`: what reflection on a store hands out for a nested object > Object.getOwnPropertyDescriptor hands out the raw object: a write through it notifies no one and misses the snapshot
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
- `src/core/core.characterisation.notifications.test.ts`: a write made inside a sync subscriber > a subscriber that runs after the writing one is called twice with the same snapshot
- `src/core/core.characterisation.notifications.test.ts`: a write made inside a batched subscriber > a subscriber that runs after the writing one is called again with an unchanged snapshot
- `src/collections/collections.identity.test.ts`: reactive collections inside a store — object members > the raw object, its store proxy and its snapshots are one key
- `src/collections/collections.identity.test.ts`: reactive collections inside a store — object members > setting the value a key already has changes nothing
- `src/utils/history/history.restore.test.ts`: withHistory() — restoring state > undo and redo keep the identity of branches they do not change
- `src/utils/subscribe-key/subscribe-key.test.ts`: subscribeKey > works with object/array values using reference comparison
- `src/utils/persist/persist.test.ts`: persist() > per-property transforms > serializes and deserializes ReactiveMap via transform
- `src/utils/persist/persist.test.ts`: persist() > version migration > calls migrate when stored version differs
- `src/utils/persist/persist.test.ts`: persist() > merge strategies > preserves own accessors returned by a custom merge
- `src/frameworks/vue/vue.test.ts`: vue useClassyStore > returns a shallow ref containing the current immutable snapshot
- `src/frameworks/angular/angular.test.ts`: angular injectClassyStore > returns a readonly signal with the current immutable snapshot
- `src/frameworks/solid/solid.test.ts`: solid useClassyStore > returns the current immutable snapshot without copying it
- `src/frameworks/react/react.hydration.test.tsx`: React delayed Suspense hydration > preserves server content when persistence updates before the first direct selector read
- `src/frameworks/react/react.hydration.test.tsx`: React delayed Suspense hydration > preserves server content when persistence updates before the first direct auto-tracking read
- `src/frameworks/react/react.hydration.test.tsx`: React delayed Suspense hydration > preserves server content when persistence updates before the first bound selector read
- `src/frameworks/react/react.hydration.test.tsx`: React delayed Suspense hydration > preserves server content when persistence updates before the first bound auto-tracking read
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — transactions > unshift on a long list builds one snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — transactions > reverse on a long list builds one snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — transactions > splice on a long list builds one snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — batch() > a batched loop of direct writes builds one list snapshot and renders once
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — values handed back to the store > a row from a rendered list (selector) is stored as an immutable snapshot
- `src/frameworks/react/react.transactions.test.tsx`: useClassyStore — values handed back to the store > a row from a rendered list (auto-tracked) is stored as an immutable snapshot
- `src/frameworks/react/react.behavior.test.tsx`: Set-then-revert — commits the restored value > unrelated prop revert — structural sharing preserves reference
- `src/frameworks/react/react.computed.test.tsx`: computed getters — useClassyStore integration > selector with getter returns stable reference — no re-render on unrelated change
- `src/frameworks/react/react.hydration.lifecycle.test.tsx`: prepareStoreForHydration lifecycle > uses live values on a client-only mount even after preparation
- `src/frameworks/react/react.hydration.lifecycle.test.tsx`: prepareStoreForHydration lifecycle > keeps nested data, getters, and replaced native leaves at their captured values for hydration
- `src/frameworks/react/react.hydration.lifecycle.test.tsx`: prepareStoreForHydration lifecycle > never evaluates a selector against initial data on a client-only mount
- `src/frameworks/react/react.hydration.lifecycle.test.tsx`: prepareStoreForHydration lifecycle > reselects current state when selectors, equality, and prepared stores change after hydration
- `src/frameworks/react/react.hydration.lifecycle.test.tsx`: prepareStoreForHydration lifecycle > retains initial data for a second root hydrated after the first root updates
- `src/frameworks/react/react.hydration.lifecycle.test.tsx`: prepareStoreForHydration lifecycle > retains equal selection identity across hydration for prepared unchanged state with default equality
- `src/frameworks/react/react.test.tsx`: useClassyStore — selector mode > handles object selectors with structural equality
- `src/frameworks/react/react.test.tsx`: useClassyStore — selector mode > handles array selectors
- `src/frameworks/react/react.utilities.test.tsx`: core and React utility happy paths > restores reactive Map and Set transforms and keeps subsequent edits reactive
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > preserves nested snapshot identity across local state renders
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > keeps a memoized child live after its parent renders with unchanged data
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > a field its memoized child never read does not re-render the parent
- `src/frameworks/react/react.updates.test.tsx`: useClassyStore update consistency > tracks nested object values held by class symbol fields
- `src/frameworks/react/react.ssr.test.tsx`: React server rendering and hydration > defers persisted data until after hydration and cleans up on unmount

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..e1cd316 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -239,9 +239,6 @@ function createSnapshotRecursive<T extends object>(
 ): T {
   // Cache hit: version unchanged → return the same frozen snapshot reference.
   const cached = snapshotCache.get(target);
-  if (cached && cached[0] === internal.version) {
-    return cached[1] as T;
-  }
 
   if (inProgress.has(target)) {
     throw new Error(
```

### `s21-accessor-skip-data`

Lines: +1 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/snapshot/snapshot.ownKeys.test.ts`: the own keys of a snapshot > list a getter declared before a data field after that field

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..9e50614 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -264,7 +264,7 @@ function createSnapshotRecursive<T extends object>(
     snap = Object.create(Object.getPrototypeOf(target));
     for (const key of Reflect.ownKeys(target)) {
       const desc = Object.getOwnPropertyDescriptor(target, key);
-      if (!desc || !('value' in desc)) continue;
+      if (!desc) continue;
       // Assignment can call an inherited setter (including Object.prototype.__proto__).
       Object.defineProperty(snap, key, {
         value: snapshotValue(desc.value, internal, key, inProgress),
```

### `s22-getter-this`

Lines: +1 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..9cea4c1 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -205,7 +205,7 @@ function installMemoizedGetters(snap: object, target: object): void {
       const getter = descriptor.get;
       function memoizedGetter(this: object) {
         return getter
-          ? evaluateSnapshotGetter(this, target, key, getter)
+          ? evaluateSnapshotGetter(snap, target, key, getter)
           : undefined;
       }
       const own = proto === target;
```

### `s23-originalAccessor-guard`

Lines: +1 -1. Result: 1341 pass, 0 fail.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..d717d78 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -29,7 +29,7 @@ const originalAccessors = new WeakMap<
 >();
 
 export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
-  return getter && originalAccessors.get(getter);
+  return originalAccessors.get(getter as () => unknown);
 }
 
 // ── Cross-snapshot getter memoization ─────────────────────────────────────────
```

### `x0-baseline`

Lines: +1 -1. Result: 1341 pass, 0 fail.

Reproductions run with this patch applied:

```text
$ bun scripts/repro-suspension.ts wt/packages/classy-store/src
61/67 snapshot after freeze: first=0 second=1 (correct: 1 and 1)
61/67 subscriber added after freeze heard the write: 0 time(s) (correct: 1)
69 order after a trip out and back, unobserved meanwhile: later, box
69 order after a trip out and back, observed meanwhile: box, later
66 read after defineProperty on a removed container: never returned, killed after 8 s

$ bun scripts/owner-links.ts wt/packages/classy-store/src
after 2000 filter() replacements, before gc: owner links on the held row = 1
  write to the held row, before gc: 446 ns per write
  after gc: owner links = 1
  write to the held row, after gc: 479 ns per write
  after gc and a write: owner links = 1
  store still sees the row: true
with all 2000 old lists held by the caller: owner links = 1
  write to the held row: 333 ns per write
  kept 2000 lists
shared object embedded in 2000 dropped stores, before gc: owner links = 2000
  after gc, no write: owner links = 0
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..f990e84 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -9,7 +9,7 @@ import {StoreInternal} from './ownership';
 
 // ── Global state ──────────────────────────────────────────────────────────────
 
-/** Maps every store proxy → its internal bookkeeping. */
+/** Maps every store proxy → its internal bookkeeping.  */
 const internalsMap = new WeakMap<object, StoreInternal>();
 const targetNodes = new WeakMap<object, StoreInternal>();
```

### `x1-no-suspension`

Lines: +1 -85. Result: 1332 pass, 9 fail, typecheck ok.

Failing tests:

- `src/core/core.ownership.test.ts`: shared proxy ownership > filtering repeatedly keeps a single proxy and bounded work per scalar write
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > an owner inside a container that left the store and came back, while nothing observed it, is called after a later owner of the same record
- `src/core/core.ownerOrder.test.ts`: the place of an owner among the owners of a shared object > two owners inside a container are called in the opposite order once the container left the store and came back
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a list that was replaced is collected while a row it held lives on in the store
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

Reproductions run with this patch applied:

```text
$ bun scripts/repro-suspension.ts wt/packages/classy-store/src
61/67 snapshot after freeze: first=1 second=1 (correct: 1 and 1)
61/67 subscriber added after freeze heard the write: 1 time(s) (correct: 1)
69 order after a trip out and back, unobserved meanwhile: box, later
69 order after a trip out and back, observed meanwhile: box, later
66 read after defineProperty on a removed container: read returned 1

$ bun scripts/owner-links.ts wt/packages/classy-store/src
after 2000 filter() replacements, before gc: owner links on the held row = 2001
  write to the held row, before gc: 117787 ns per write
  after gc: owner links = 1
  write to the held row, after gc: 530 ns per write
  after gc and a write: owner links = 1
  store still sees the row: true
with all 2000 old lists held by the caller: owner links = 2001
  write to the held row: 122405 ns per write
  kept 2000 lists
shared object embedded in 2000 dropped stores, before gc: owner links = 2000
  after gc, no write: owner links = 0
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..5bcab0d 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -205,7 +205,6 @@ export function getInternal(proxy: object): StoreInternal {
   const internal = internalsMap.get(proxy);
   if (!internal)
     throw new Error('@codebelt/classy-store: object is not a store proxy');
-  internal.resumeScope();
   return internal;
 }
 
@@ -404,7 +403,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
-      internal.resumeScope();
       // Store the snapshot itself, never the render-tracking proxy around it.
       const value: unknown =
         typeof incoming === 'object' && incoming !== null
@@ -459,7 +457,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     get(_target, prop, receiver) {
-      internal.resumeScope();
       // 1. Check for getters on the prototype chain (computed values).
       const getterDesc = findPropertyDescriptor(_target, prop);
       if (getterDesc?.get) {
@@ -513,7 +510,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     deleteProperty(_target, prop) {
-      internal.resumeScope();
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
@@ -565,8 +561,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
  */
 export function createClassyStore<T extends object>(instance: T): T {
   const node = createNode(instance);
-  node.isStoreRoot = true;
-  node.resumeScope();
   return node.proxy as T;
 }
 
@@ -595,7 +589,7 @@ export function subscribe(
   const listener = () => callback();
   listeners.add(listener);
   return () => {
-    if (listeners.delete(listener)) internal.suspendIfDetached();
+    listeners.delete(listener);
   };
 }
 
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..9ca51d5 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -5,7 +5,6 @@ type ParentReference = {deref(): StoreInternal | undefined};
 /** One canonical node per raw object. Each property owns one edge to a child. */
 export class StoreInternal {
   version = 0;
-  isStoreRoot = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
   readonly batchedListeners = new Set<() => void>();
@@ -17,11 +16,6 @@ export class StoreInternal {
     typeof WeakRef === 'function' ? new WeakRef(this) : {deref: () => this};
   private parentCleanup?: FinalizationRegistry<ParentReference>;
 
-  // An unobserved, detached container keeps its children but stops receiving
-  // their mutations. Retaining one row must not keep every filtered array alive.
-  private detachedVersions?: Map<StoreInternal, number>;
-  private detachedParent?: ParentReference;
-
   constructor(
     readonly target: object,
     readonly proxy: object,
@@ -32,7 +26,6 @@ export class StoreInternal {
     this.detach(key);
     this.childInternals.set(key, child);
     this.connect(child);
-    child.resume();
   }
 
   detach(key: string | symbol): void {
@@ -40,11 +33,9 @@ export class StoreInternal {
     if (!child) return;
     this.childInternals.delete(key);
     this.disconnect(child);
-    child.suspendIfDetached();
   }
 
   private connect(child: StoreInternal): void {
-    child.detachedParent = undefined;
     const count = child.parents.get(this.reference) ?? 0;
     if (!count) {
       child.trackSharedParents();
@@ -86,75 +77,6 @@ export class StoreInternal {
     child.parentCleanup?.unregister(this.reference);
   }
 
-  private canSuspend(): boolean {
-    return (
-      !this.detachedVersions &&
-      !this.parents.size &&
-      !this.isStoreRoot &&
-      !this.syncListeners.size &&
-      !this.batchedListeners.size
-    );
-  }
-
-  suspendIfDetached(): void {
-    if (!this.canSuspend()) return;
-    const pending: StoreInternal[] = [this];
-    for (const node of pending) {
-      const versions = new Map<StoreInternal, number>();
-      node.detachedVersions = versions;
-      for (const child of node.childInternals.values()) {
-        versions.set(child, child.version);
-        node.disconnect(child);
-        if (child.canSuspend()) {
-          child.detachedParent = node.reference;
-          pending.push(child);
-        }
-      }
-    }
-  }
-
-  private resume(): void {
-    if (!this.detachedVersions) return;
-    // Compare saved versions after resuming descendants. An explicit stack
-    // keeps deep detached inputs safe and visits shared descendants once.
-    const pending: {
-      node: StoreInternal;
-      versions?: Map<StoreInternal, number>;
-    }[] = [{node: this}];
-    while (pending.length) {
-      const frame = pending.pop();
-      if (!frame) break;
-      const {node, versions} = frame;
-      if (versions) {
-        for (const [child, previous] of versions) {
-          if (child.version !== previous) {
-            node.version++;
-            break;
-          }
-        }
-      } else if (node.detachedVersions) {
-        pending.push({node, versions: node.detachedVersions});
-        node.detachedVersions = undefined;
-        for (const child of node.childInternals.values()) {
-          node.connect(child);
-          if (child.detachedVersions) pending.push({node: child});
-        }
-      }
-    }
-  }
-
-  /** A caller can still read, mutate, or subscribe to a detached subtree. */
-  resumeScope(): void {
-    if (!this.detachedVersions) return;
-    let scope: StoreInternal = this;
-    let parent = scope.detachedParent?.deref();
-    while (parent?.detachedVersions) {
-      scope = parent;
-      parent = scope.detachedParent?.deref();
-    }
-    scope.resume();
-  }
-
   /** This node and every container that currently owns it, up to each root. */
   ancestors(): Set<StoreInternal> {
     const visited = new Set<StoreInternal>([this]);
```

### `x2-no-detached-parent`

Lines: +1 -10. Result: 1335 pass, 6 fail, typecheck ok.

Failing tests:

- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a row held from a removed list keeps that list alive
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

Reproductions run with this patch applied:

```text
$ bun scripts/repro-suspension.ts wt/packages/classy-store/src
61/67 snapshot after freeze: first=1 second=1 (correct: 1 and 1)
61/67 subscriber added after freeze heard the write: 1 time(s) (correct: 1)
69 order after a trip out and back, unobserved meanwhile: later, box
69 order after a trip out and back, observed meanwhile: box, later
66 read after defineProperty on a removed container: read returned 1

$ bun scripts/owner-links.ts wt/packages/classy-store/src
after 2000 filter() replacements, before gc: owner links on the held row = 1
  write to the held row, before gc: 478 ns per write
  after gc: owner links = 1
  write to the held row, after gc: 498 ns per write
  after gc and a write: owner links = 1
  store still sees the row: true
with all 2000 old lists held by the caller: owner links = 1
  write to the held row: 343 ns per write
  kept 2000 lists
shared object embedded in 2000 dropped stores, before gc: owner links = 2000
  after gc, no write: owner links = 0
```

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..11b1c00 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -20,7 +20,6 @@ export class StoreInternal {
   // An unobserved, detached container keeps its children but stops receiving
   // their mutations. Retaining one row must not keep every filtered array alive.
   private detachedVersions?: Map<StoreInternal, number>;
-  private detachedParent?: ParentReference;
 
   constructor(
     readonly target: object,
@@ -44,7 +43,6 @@ export class StoreInternal {
   }
 
   private connect(child: StoreInternal): void {
-    child.detachedParent = undefined;
     const count = child.parents.get(this.reference) ?? 0;
     if (!count) {
       child.trackSharedParents();
@@ -106,7 +104,6 @@ export class StoreInternal {
         versions.set(child, child.version);
         node.disconnect(child);
         if (child.canSuspend()) {
-          child.detachedParent = node.reference;
           pending.push(child);
         }
       }
@@ -146,13 +143,7 @@ export class StoreInternal {
   /** A caller can still read, mutate, or subscribe to a detached subtree. */
   resumeScope(): void {
     if (!this.detachedVersions) return;
-    let scope: StoreInternal = this;
-    let parent = scope.detachedParent?.deref();
-    while (parent?.detachedVersions) {
-      scope = parent;
-      parent = scope.detachedParent?.deref();
-    }
-    scope.resume();
+    this.resume();
   }
 
   /** This node and every container that currently owns it, up to each root. */
```

### `x3-defineProperty-resume`

Lines: +1 -0. Result: 1336 pass, 5 fail.

Failing tests:

- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

Reproductions run with this patch applied:

```text
$ bun scripts/repro-suspension.ts wt/packages/classy-store/src
61/67 snapshot after freeze: first=1 second=1 (correct: 1 and 1)
61/67 subscriber added after freeze heard the write: 1 time(s) (correct: 1)
69 order after a trip out and back, unobserved meanwhile: later, box
69 order after a trip out and back, observed meanwhile: box, later
66 read after defineProperty on a removed container: read returned 1
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..279db7d 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -500,6 +500,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     defineProperty(_target, prop, descriptor) {
+      internal.resumeScope();
       const defined = Reflect.defineProperty(_target, prop, descriptor);
       // `Object.freeze(proxy)` arrives here once per property. A property that
       // is now read-only holds its value as it is, as if frozen all along.
```

### `y0-baseline-misc`

Lines: +1 -1. Result: 1341 pass, 0 fail.

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): false
5  indexOf of a function just read from the array (correct: 0): -1
5  splice(indexOf(first), 1) leaves: a (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): false
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 1
36 a getter that reads a child through a held reference follows it (correct: 2): 1
36 a getter that reads a getter of another store follows it (correct: 4): 2
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined

$ bun scripts/getter-cost.ts wt/packages/classy-store/src
cached read of a getter over two fields: 69 ns (lowest 62, highest 73)
cached read of a getter that sums 1,000 rows: 80 ns (lowest 74, highest 94)
recompute of the getter that sums 1,000 rows after one row changed: 130983 ns (lowest 130354, highest 132043)
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..f990e84 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -9,7 +9,7 @@ import {StoreInternal} from './ownership';
 
 // ── Global state ──────────────────────────────────────────────────────────────
 
-/** Maps every store proxy → its internal bookkeeping. */
+/** Maps every store proxy → its internal bookkeeping.  */
 const internalsMap = new WeakMap<object, StoreInternal>();
 const targetNodes = new WeakMap<object, StoreInternal>();
```

### `y1-c14-with-reproductions`

Lines: +0 -1. Result: 1336 pass, 5 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > runs on every read while the property is missing
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > runs on every read again after the property is deleted
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > returns a new object on every read when it builds one
- `src/core/core.fuzz.findings.test.ts`: core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): false
5  indexOf of a function just read from the array (correct: 0): -1
5  splice(indexOf(first), 1) leaves: a (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): true
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 1
36 a getter that reads a child through a held reference follows it (correct: 2): 1
36 a getter that reads a getter of another store follows it (correct: 4): 2
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..1bf9f69 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -144,7 +144,6 @@ function areDepsValid(deps: DepEntry[]): boolean {
       // Check that the property still exists — if it was deleted and
       // dep.value was `undefined`, Object.is(undefined, undefined) would
       // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
       if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
         return false;
     }
```

### `y2-c44-with-reproductions`

Lines: +0 -1. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.characterisation.identity.test.ts`: functions read through a store > a method read from a store array is a new function on every read
- `src/core/core.characterisation.identity.test.ts`: functions read through a store > a function held in a store array is not found by includes() or indexOf(), even when it was just read from that array

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): true
5  indexOf of a function just read from the array (correct: 0): 0
5  splice(indexOf(first), 1) leaves: b (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): false
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 1
36 a getter that reads a child through a held reference follows it (correct: 2): 1
36 a getter that reads a getter of another store follows it (correct: 4): 2
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a6dcd5a 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -483,7 +483,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (typeof value === 'function') {
         const method = value as (...args: unknown[]) => unknown;
         // Array prototype methods should not be cached the same way as class methods.
-        if (Array.isArray(_target)) return transactional(method, receiver);
         const cached = boundMethods.get(prop);
         if (cached) return cached;
         const bound = transactional(method, receiver);
```

### `y3-c07-with-reproductions`

Lines: +0 -2. Result: 1339 pass, 2 fail.

Failing tests:

- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a getter that reads another store keeps its result after that store changes
- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a getter that reads a child through a held reference keeps its result after the child changes

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): false
5  indexOf of a function just read from the array (correct: 0): -1
5  splice(indexOf(first), 1) leaves: a (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): false
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 2
36 a getter that reads a child through a held reference follows it (correct: 2): 2
36 a getter that reads a getter of another store follows it (correct: 4): 2
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined

$ bun scripts/getter-cost.ts wt/packages/classy-store/src
cached read of a getter over two fields: 69 ns (lowest 62, highest 75)
cached read of a getter that sums 1,000 rows: 26120 ns (lowest 25831, highest 26756)
recompute of the getter that sums 1,000 rows after one row changed: 173149 ns (lowest 167869, highest 250775)
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..15e58df 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -88,8 +88,6 @@ function recordDep(
   // Only record deps for reads on the SAME proxy that owns the getter.
   // Child-proxy reads don't need explicit tracking because child mutations
   // bubble up via version numbers on the parent's childInternals.
-  if (tracker.internal !== internal) return;
-
   const childInternal = internal.childInternals.get(prop);
   if (childInternal) {
     tracker.deps.push({
```

### `y4-c08-with-reproductions`

Lines: +0 -1. Result: 1340 pass, 1 fail.

Failing tests:

- `src/core/core.gettersAcrossNodes.test.ts`: a getter that reads a getter of another store > keeps its result after the other store changes and its getter has recomputed

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): false
5  indexOf of a function just read from the array (correct: 0): -1
5  splice(indexOf(first), 1) leaves: a (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): false
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 1
36 a getter that reads a child through a held reference follows it (correct: 2): 1
36 a getter that reads a getter of another store follows it (correct: 4): 4
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..4ab8326 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -116,7 +116,6 @@ function recordComputedDep(
 ): void {
   const tracker = activeTracker();
   if (!tracker) return;
-  if (tracker.internal !== internal) return;
 
   tracker.deps.push({kind: 'computed', internal, prop, value});
 }
```

### `y5-s07-with-reproductions`

Lines: +1 -3. Result: 1339 pass, 2 fail.

Failing tests:

- `src/snapshot/snapshot.redefinedElements.test.ts`: an array element redefined from an object to a value that is not an object > shows a number in a snapshot while the store still returns the old object
- `src/snapshot/snapshot.redefinedElements.test.ts`: an array element redefined from an object to a value that is not an object > shows null in a snapshot while the store still returns the old object

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): false
5  indexOf of a function just read from the array (correct: 0): -1
5  splice(indexOf(first), 1) leaves: a (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): false
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 1
36 a getter that reads a child through a held reference follows it (correct: 2): 1
36 a getter that reads a getter of another store follows it (correct: 4): 2
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot {"n":1} (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined
```

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..adb7171 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -255,9 +255,7 @@ function createSnapshotRecursive<T extends object>(
   if (Array.isArray(target)) {
     // Only objects can be child nodes; primitives need no key lookup.
     snap = mapOwnArrayElements(target, (value, index) =>
-      typeof value === 'object' && value !== null
-        ? snapshotValue(value, internal, String(index), inProgress)
-        : value,
+      snapshotValue(value, internal, String(index), inProgress),
     );
   } else {
     // Preserve the prototype chain and install memoized getters on the snapshot.
```

### `y6-c58-with-reproductions`

Lines: +1 -6. Result: 1341 pass, 0 fail.

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): false
5  indexOf of a function just read from the array (correct: 0): -1
5  splice(indexOf(first), 1) leaves: a (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): false
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 1
36 a getter that reads a child through a held reference follows it (correct: 2): 1
36 a getter that reads a getter of another store follows it (correct: 4): 2
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): object
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: false
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..4620cfb 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -441,12 +441,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
       // Keep the old child connected when a property rejects the write.
       if (written) {
-        const own = Object.getOwnPropertyDescriptor(_target, prop);
-        if (
-          !own ||
-          !('value' in own) ||
-          !linkChild(internal, prop, own.value, undefined, own)
-        ) {
+        if (!linkChild(internal, prop, value)) {
           internal.detach(prop);
         }
       }
```

### `y7-s08-with-reproductions`

Lines: +1 -1. Result: 1341 pass, 0 fail.

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): false
5  indexOf of a function just read from the array (correct: 0): -1
5  splice(indexOf(first), 1) leaves: a (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): false
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 1
36 a getter that reads a child through a held reference follows it (correct: 2): 1
36 a getter that reads a getter of another store follows it (correct: 4): 2
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = false, keys = n
s08 class setter-only accessor: key on the snapshot: own key = false, keys = n, value = undefined
```

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..3804fc3 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -201,7 +201,7 @@ function installMemoizedGetters(snap: object, target: object): void {
       if (seen.has(key)) continue;
       seen.add(key);
       const descriptor = Object.getOwnPropertyDescriptor(proto, key);
-      if (!descriptor || 'value' in descriptor) continue;
+      if (!descriptor || 'value' in descriptor || !descriptor.get) continue;
       const getter = descriptor.get;
       function memoizedGetter(this: object) {
         return getter
```

### `y8-c07-c08-with-reproductions`

Lines: +0 -3. Result: 1338 pass, 3 fail.

Failing tests:

- `src/core/core.gettersAcrossNodes.test.ts`: a getter that reads a getter of another store > keeps its result after the other store changes and its getter has recomputed
- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a getter that reads another store keeps its result after that store changes
- `src/core/core.characterisation.getters.test.ts`: getters that reach beyond their own fields > a getter that reads a child through a held reference keeps its result after the child changes

Reproductions run with this patch applied:

```text
$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): false
5  indexOf of a function just read from the array (correct: 0): -1
5  splice(indexOf(first), 1) leaves: a (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): false
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 2
36 a getter that reads a child through a held reference follows it (correct: 2): 2
36 a getter that reads a getter of another store follows it (correct: 4): 4
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined

$ bun scripts/getter-cost.ts wt/packages/classy-store/src
cached read of a getter over two fields: 69 ns (lowest 63, highest 74)
cached read of a getter that sums 1,000 rows: 25711 ns (lowest 25415, highest 25880)
recompute of the getter that sums 1,000 rows after one row changed: 161239 ns (lowest 157824, highest 166611)
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..7a45426 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -88,8 +88,6 @@ function recordDep(
   // Only record deps for reads on the SAME proxy that owns the getter.
   // Child-proxy reads don't need explicit tracking because child mutations
   // bubble up via version numbers on the parent's childInternals.
-  if (tracker.internal !== internal) return;
-
   const childInternal = internal.childInternals.get(prop);
   if (childInternal) {
     tracker.deps.push({
@@ -116,7 +114,6 @@ function recordComputedDep(
 ): void {
   const tracker = activeTracker();
   if (!tracker) return;
-  if (tracker.internal !== internal) return;
 
   tracker.deps.push({kind: 'computed', internal, prop, value});
 }
```

### `r0-unmodified-measures`

Lines: +1 -1. Result: 1341 pass, 0 fail, typecheck ok.

Reproductions run with this patch applied:

```text
$ cd wt && bun run size 2>&1 | grep -v "build:" | tail -40
$ bun run build && bun packages/classy-store/tests/size/runSize.ts
$ bun run --filter @codebelt/classy-store build
| Entry | Minified | Gzipped | Adds to main | Against baseline | Budget |
| --- | ---: | ---: | ---: | ---: | ---: |
| `.` | 10709 | 3661 |  | 0 | 3750 |
| `./utils` | 17828 | 6347 | 2686 | 0 | 2750 |
| `./collections` | 13460 | 4388 | 727 | 0 | 750 |
| `./react` | 15247 | 5323 | 1662 | 0 | 1700 |
| `./react/server` | 11063 | 3814 | 153 | 0 | 175 |
| `./vue` | 11322 | 3941 | 280 | 0 | 300 |
| `./svelte` | 11126 | 3843 | 182 | 0 | 200 |
| `./angular` | 11301 | 3932 | 271 | 0 | 300 |
| `./solid` | 11361 | 3973 | 312 | 0 | 335 |

Bun 1.4.4. Sizes are in bytes; every entry is measured together with the main one. Report: wt/test-results/size/size.json

$ cd wt && bun run benchmark:core:node 2>&1 | grep "^|\|is .* above"
| Metric | Median | Lowest | Highest | Baseline | Change | |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| raw.read | 0.541 | 0.538 | 0.561 | 0.54 | 0.2% | same |
| proxy.read | 23.3 | 23.2 | 23.4 | 22 | 5.9% | slower |
| store.read | 48.6 | 46.3 | 48.9 | 45.1 | 7.8% | slower |
| store.read.nested | 142 | 140 | 143 | 132 | 7.6% | slower |
| snapshot.read | 0.48 | 0.476 | 0.482 | 0.453 | 6.0% | slower |
| raw.write | 0.46 | 0.458 | 0.481 | 0.435 | 5.7% | slower |
| proxy.write | 156 | 155 | 157 | 147 | 6.1% | slower |
| store.write | 210 | 208 | 212 | 195 | 7.7% | slower |
| store.write.same | 58 | 56.8 | 58.5 | 53.6 | 8.2% | slower |
| store.write.sync | 252 | 250 | 258 | 234 | 7.7% | slower |
| store.write.batched | 219 | 215 | 226 | 204 | 7.4% | slower |
| store.write.nested | 516 | 505 | 524 | 482 | 7.1% | slower |
| store.method | 295 | 291 | 300 | 276 | 6.9% | slower |
| store.batch10 | 1716 | 1667 | 1727 | 1593 | 7.7% | slower |
| array.pushPop | 3674 | 3510 | 3863 | 3414 | 7.6% | slower |
| snapshot.cached | 32.5 | 29.3 | 32.9 | 29.9 | 8.7% | same |
| snapshot.afterWrite | 61991 | 60466 | 65231 | 60417 | 2.6% | same |
| snapshot.first | 3313370 | 2887375 | 3776208 | 2737592 | 21.0% | slower |
| getter.cached | 83.1 | 82.4 | 85.5 | 80.4 | 3.4% | same |
| getter.recompute | 401 | 398 | 408 | 377 | 6.4% | slower |
| getter.rows.recompute | 262581 | 258626 | 274787 | 256030 | 2.6% | slower |
| create.small | 6273 | 5819 | 6586 | 5063 | 23.9% | slower |
| create.rows | 1580625 | 1124788 | 1656866 | 1101774 | 43.5% | same |
| subscribe | 57.2 | 56.3 | 60.8 | 53.7 | 6.5% | same |
| Ratio | Median | Lowest | Highest | Baseline | Limit | |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| read: store.read / proxy.read | 2.08 | 1.98 | 2.11 | 2.04 | 2.5 | same |
| write: store.write / proxy.write | 1.35 | 1.33 | 1.37 | 1.33 | 1.7 | same |
| getter: getter.cached / proxy.read | 3.55 | 3.54 | 3.67 | 3.65 | 5.3 | same |
| snapshot: snapshot.cached / proxy.read | 1.39 | 1.26 | 1.41 | 1.36 | 1.8 | same |
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..f990e84 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -9,7 +9,7 @@ import {StoreInternal} from './ownership';
 
 // ── Global state ──────────────────────────────────────────────────────────────
 
-/** Maps every store proxy → its internal bookkeeping. */
+/** Maps every store proxy → its internal bookkeeping.  */
 const internalsMap = new WeakMap<object, StoreInternal>();
 const targetNodes = new WeakMap<object, StoreInternal>();
```

### `r1-dead-code-only`

Lines: +7 -15. Result: 1341 pass, 0 fail, typecheck FAIL.

Reproductions run with this patch applied:

```text
$ cd wt && bun run size 2>&1 | grep -v "build:" | tail -40
$ bun run build && bun packages/classy-store/tests/size/runSize.ts
$ bun run --filter @codebelt/classy-store build
| Entry | Minified | Gzipped | Adds to main | Against baseline | Budget |
| --- | ---: | ---: | ---: | ---: | ---: |
| `.` | 10552 | 3613 |  | -48 | 3750 |
| `./utils` | 17668 | 6314 | 2701 | -33 | 2750 |
| `./collections` | 13303 | 4343 | 730 | -45 | 750 |
| `./react` | 15090 | 5286 | 1673 | -37 | 1700 |
| `./react/server` | 10906 | 3765 | 152 | -49 | 175 |
| `./vue` | 11165 | 3897 | 284 | -44 | 300 |
| `./svelte` | 10969 | 3800 | 187 | -43 | 200 |
| `./angular` | 11144 | 3889 | 276 | -43 | 300 |
| `./solid` | 11204 | 3930 | 317 | -43 | 335 |

Bun 1.4.4. Sizes are in bytes; every entry is measured together with the main one. Report: wt/test-results/size/size.json
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..17196d6 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -70,7 +70,7 @@ const trackerStack: {
 
 /** Returns the tracker currently recording deps, or `null` if none is active. */
 function activeTracker() {
-  return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
+  return trackerStack[trackerStack.length - 1];
 }
 
 /**
@@ -137,7 +137,6 @@ function areDepsValid(deps: DepEntry[]): boolean {
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
@@ -373,7 +372,7 @@ function linkChild(
     )
       return;
   }
-  const child = existing ?? createNode(value, pending);
+  const child = createNode(value, pending);
   owner.attach(key, child);
   return child;
 }
@@ -595,7 +594,8 @@ export function subscribe(
   const listener = () => callback();
   listeners.add(listener);
   return () => {
-    if (listeners.delete(listener)) internal.suspendIfDetached();
+    listeners.delete(listener);
+    internal.suspendIfDetached();
   };
 }
 
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..7a11465 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -77,7 +77,6 @@ export class StoreInternal {
 
   private disconnect(child: StoreInternal): void {
     const count = child.parents.get(this.reference);
-    if (count === undefined) return;
     if (count > 1) {
       child.parents.set(this.reference, count - 1);
       return;
@@ -123,8 +122,7 @@ export class StoreInternal {
     }[] = [{node: this}];
     while (pending.length) {
       const frame = pending.pop();
-      if (!frame) break;
-      const {node, versions} = frame;
+      const {node, versions} = frame as NonNullable<typeof frame>;
       if (versions) {
         for (const [child, previous] of versions) {
           if (child.version !== previous) {
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..03e3f6c 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -29,7 +29,7 @@ const originalAccessors = new WeakMap<
 >();
 
 export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
-  return getter && originalAccessors.get(getter);
+  return originalAccessors.get(getter as () => unknown);
 }
 
 // ── Cross-snapshot getter memoization ─────────────────────────────────────────
@@ -170,9 +170,7 @@ function markSnapshotForTracking(value: object): void {
   const hasObjectSymbol = Object.getOwnPropertySymbols(value).some((key) => {
     const descriptor = Object.getOwnPropertyDescriptor(value, key);
     return (
-      descriptor &&
-      'value' in descriptor &&
-      typeof descriptor.value === 'object' &&
+      typeof descriptor?.value === 'object' &&
       descriptor.value !== null
     );
   });
@@ -213,7 +211,6 @@ function installMemoizedGetters(snap: object, target: object): void {
       Object.defineProperty(snap, key, {
         get: memoizedGetter,
         enumerable: own ? descriptor.enumerable : true,
-        configurable: true,
       });
     }
     proto = Object.getPrototypeOf(proto);
@@ -269,8 +266,6 @@ function createSnapshotRecursive<T extends object>(
       Object.defineProperty(snap, key, {
         value: snapshotValue(desc.value, internal, key, inProgress),
         enumerable: desc.enumerable,
-        configurable: true,
-        writable: true,
       });
     }
 
@@ -283,7 +278,6 @@ function createSnapshotRecursive<T extends object>(
   registerSnapshot(snap, target);
   // Cache AFTER populating + freezing. The reference is stable.
   snapshotCache.set(target, [internal.version, snap]);
-  inProgress.delete(target);
   return snap as T;
 }
```

### `r2-recommended`

Lines: +8 -31. Result: 1328 pass, 13 fail, typecheck FAIL.

Failing tests:

- `src/core/core.characterisation.identity.test.ts`: functions read through a store > a method read from a store array is a new function on every read
- `src/core/core.characterisation.identity.test.ts`: functions read through a store > a function held in a store array is not found by includes() or indexOf(), even when it was just read from that array
- `src/core/core.noWeakRefMemory.test.ts`: what the collector can free in a runtime without WeakRef > a row held from a removed list keeps that list alive
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
- `src/core/core.unobservedObjects.test.ts`: an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > runs on every read while the property is missing
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > runs on every read again after the property is deleted
- `src/core/core.characterisation.getters.test.ts`: a getter that reads a property the store does not have > returns a new object on every read when it builds one
- `src/core/core.fuzz.findings.test.ts`: core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
- `src/core/core.removedContainers.test.ts`: an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store
- `src/core/core.fuzz.test.ts`: core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits

Reproductions run with this patch applied:

```text
$ bun scripts/repro-suspension.ts wt/packages/classy-store/src
61/67 snapshot after freeze: first=1 second=1 (correct: 1 and 1)
61/67 subscriber added after freeze heard the write: 1 time(s) (correct: 1)
69 order after a trip out and back, unobserved meanwhile: later, box
69 order after a trip out and back, observed meanwhile: box, later
66 read after defineProperty on a removed container: read returned 1

$ bun scripts/repro-misc.ts wt/packages/classy-store/src
5  store.callbacks[0] === store.callbacks[0] (correct: true): true
5  indexOf of a function just read from the array (correct: 0): 0
5  splice(indexOf(first), 1) leaves: b (correct: b)
5b after reverse(), the raw array still holds the original functions (correct: true): false
5b after reverse() twice, snapshot(store).callbacks[0] is the original function (correct: true): false
5b store.cb = store.cb notifies (correct: 0 calls) and leaves the original in the raw object (correct: true): 1 call(s), raw.cb === cb: false
32 a getter that reads a missing property returns one object on two reads (correct: true): true
32 ... and is recomputed once the property exists (correct: 5): 5
32 a getter that read an own undefined field sees an inherited value after delete (correct: 7): 7
36 a getter that reads another store follows it (correct: 2): 1
36 a getter that reads a child through a held reference follows it (correct: 2): 1
36 a getter that reads a getter of another store follows it (correct: 4): 2
71 after defineProperty(rows, 0, {value: 7}): store and snapshot: store {"n":1}, snapshot 7 (correct: both 7)
c58 typed array root, store[0] = {a: 1}: typeof store[0] (the array holds NaN): number
c58 Proxy state that stores a copy of what it is given: store.x is a proxy of the stored copy: true
s08 own setter-only accessor: key on the snapshot: 'onlySet' in snapshot = true, keys = n,onlySet
s08 class setter-only accessor: key on the snapshot: own key = true, keys = n,onlySet, value = undefined

$ cd wt && bun run size 2>&1 | grep -v "build:" | tail -40
$ bun run build && bun packages/classy-store/tests/size/runSize.ts
$ bun run --filter @codebelt/classy-store build
| Entry | Minified | Gzipped | Adds to main | Against baseline | Budget |
| --- | ---: | ---: | ---: | ---: | ---: |
| `.` | 10310 | 3559 |  | -102 | 3750 |
| `./utils` | 17425 | 6264 | 2705 | -83 | 2750 |
| `./collections` | 13060 | 4288 | 729 | -100 | 750 |
| `./react` | 14847 | 5232 | 1673 | -91 | 1700 |
| `./react/server` | 10663 | 3710 | 151 | -104 | 175 |
| `./vue` | 10922 | 3840 | 281 | -101 | 300 |
| `./svelte` | 10726 | 3743 | 184 | -100 | 200 |
| `./angular` | 10901 | 3832 | 273 | -100 | 300 |
| `./solid` | 10961 | 3875 | 316 | -98 | 335 |

Bun 1.4.4. Sizes are in bytes; every entry is measured together with the main one. Report: wt/test-results/size/size.json

$ cd wt && bun run benchmark:core 2>&1 | grep "^|\|is .* above"
| Metric | Median | Lowest | Highest | Baseline | Change | |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| raw.read | 0.182 | 0.174 | 0.188 | 0.167 | 9.0% | slower |
| proxy.read | 2.06 | 2.01 | 2.31 | 2.17 | -5.1% | same |
| store.read | 60.2 | 59 | 61.1 | 31.8 | 89.3% | slower |
| store.read.nested | 188 | 187 | 191 | 106 | 77.4% | slower |
| snapshot.read | 0.165 | 0.163 | 0.165 | 0.155 | 6.5% | slower |
| raw.write | 0.345 | 0.344 | 0.345 | 0.326 | 5.8% | slower |
| proxy.write | 63.4 | 63 | 63.9 | 59.8 | 6.0% | slower |
| store.write | 173 | 169 | 178 | 156 | 10.9% | slower |
| store.write.same | 35.3 | 35.2 | 35.7 | 34.1 | 3.5% | slower |
| store.write.sync | 183 | 181 | 189 | 168 | 8.9% | slower |
| store.write.batched | 184 | 178 | 188 | 169 | 8.9% | slower |
| store.write.nested | 379 | 373 | 394 | 302 | 25.5% | slower |
| store.method | 280 | 267 | 287 | 227 | 23.3% | slower |
| store.batch10 | 1555 | 1509 | 1655 | 1409 | 10.4% | slower |
| array.pushPop | 2022 | 1983 | 2128 | 1722 | 17.4% | slower |
| snapshot.cached | 15.5 | 15.3 | 15.8 | 15.9 | -2.5% | same |
| snapshot.afterWrite | 136311 | 130937 | 138556 | 125053 | 9.0% | slower |
| snapshot.first | 2120448 | 2031645 | 2155336 | 1941856 | 9.2% | slower |
| getter.cached | 79.1 | 70.4 | 81.5 | 57.3 | 38.0% | slower |
| getter.recompute | 502 | 420 | 555 | 358 | 40.2% | same |
| getter.rows.recompute | 152457 | 151451 | 168124 | 151276 | 0.8% | same |
| create.small | 1561 | 1449 | 1619 | 1431 | 9.1% | slower |
| create.rows | 652203 | 628824 | 685817 | 555739 | 17.4% | slower |
| subscribe | 46 | 44.9 | 46.7 | 42.4 | 8.5% | slower |
| Ratio | Median | Lowest | Highest | Baseline | Limit | |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| read: store.read / proxy.read | 28.9 | 26.2 | 29.7 | 14.3 | 20 | slower |
| write: store.write / proxy.write | 2.74 | 2.68 | 2.78 | 2.6 | 3.2 | slower |
| getter: getter.cached / proxy.read | 36.3 | 30.6 | 39.4 | 26.1 | 41 | same |
| snapshot: snapshot.cached / proxy.read | 7.49 | 6.77 | 7.73 | 7.28 | 10 | same |

$ cd wt && bun run benchmark:core:node 2>&1 | grep "^|\|is .* above"
| Metric | Median | Lowest | Highest | Baseline | Change | |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| raw.read | 0.562 | 0.554 | 0.564 | 0.54 | 4.1% | slower |
| proxy.read | 23.3 | 23.1 | 23.4 | 22 | 5.9% | slower |
| store.read | 83.2 | 81.8 | 83.7 | 45.1 | 84.5% | slower |
| store.read.nested | 262 | 247 | 316 | 132 | 98.5% | slower |
| snapshot.read | 0.481 | 0.479 | 0.483 | 0.453 | 6.2% | slower |
| raw.write | 0.462 | 0.46 | 0.466 | 0.435 | 6.2% | slower |
| proxy.write | 156 | 155 | 157 | 147 | 6.1% | slower |
| store.write | 208 | 205 | 219 | 195 | 6.7% | slower |
| store.write.same | 56.8 | 55.7 | 57.8 | 53.6 | 6.0% | slower |
| store.write.sync | 251 | 246 | 263 | 234 | 7.3% | slower |
| store.write.batched | 219 | 215 | 227 | 204 | 7.4% | slower |
| store.write.nested | 602 | 578 | 638 | 482 | 24.9% | slower |
| store.method | 338 | 325 | 366 | 276 | 22.5% | slower |
| store.batch10 | 1706 | 1665 | 1840 | 1593 | 7.1% | slower |
| array.pushPop | 3952 | 3420 | 4560 | 3414 | 15.8% | same |
| snapshot.cached | 32.1 | 31.8 | 34.1 | 29.9 | 7.4% | same |
| snapshot.afterWrite | 66430 | 62676 | 74177 | 60417 | 10.0% | slower |
| snapshot.first | 3740411 | 2853535 | 3928111 | 2737592 | 36.6% | same |
| getter.cached | 111 | 110 | 113 | 80.4 | 38.1% | slower |
| getter.recompute | 442 | 428 | 448 | 377 | 17.2% | slower |
| getter.rows.recompute | 286852 | 271682 | 293410 | 256030 | 12.0% | slower |
| create.small | 6271 | 5848 | 8448 | 5063 | 23.9% | slower |
| create.rows | 1549381 | 1156405 | 1679405 | 1101774 | 40.6% | same |
| subscribe | 57.6 | 56.5 | 62.8 | 53.7 | 7.3% | same |
| Ratio | Median | Lowest | Highest | Baseline | Limit | |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| read: store.read / proxy.read | 3.55 | 3.52 | 3.59 | 2.04 | 2.5 | slower |
| write: store.write / proxy.write | 1.33 | 1.31 | 1.4 | 1.33 | 1.7 | same |
| getter: getter.cached / proxy.read | 4.75 | 4.72 | 4.83 | 3.65 | 5.3 | slower |
| snapshot: snapshot.cached / proxy.read | 1.37 | 1.37 | 1.47 | 1.36 | 1.8 | same |
```

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..4821e29 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -70,7 +70,7 @@ const trackerStack: {
 
 /** Returns the tracker currently recording deps, or `null` if none is active. */
 function activeTracker() {
-  return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
+  return trackerStack[trackerStack.length - 1];
 }
 
 /**
@@ -137,14 +137,9 @@ function areDepsValid(deps: DepEntry[]): boolean {
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
       if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
         return false;
     }
@@ -373,7 +368,7 @@ function linkChild(
     )
       return;
   }
-  const child = existing ?? createNode(value, pending);
+  const child = createNode(value, pending);
   owner.attach(key, child);
   return child;
 }
@@ -482,8 +477,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       // and run each call as one transaction.
       if (typeof value === 'function') {
         const method = value as (...args: unknown[]) => unknown;
-        // Array prototype methods should not be cached the same way as class methods.
-        if (Array.isArray(_target)) return transactional(method, receiver);
         const cached = boundMethods.get(prop);
         if (cached) return cached;
         const bound = transactional(method, receiver);
@@ -595,7 +588,8 @@ export function subscribe(
   const listener = () => callback();
   listeners.add(listener);
   return () => {
-    if (listeners.delete(listener)) internal.suspendIfDetached();
+    listeners.delete(listener);
+    internal.suspendIfDetached();
   };
 }
 
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..43ffdd6 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -20,7 +20,6 @@ export class StoreInternal {
   // An unobserved, detached container keeps its children but stops receiving
   // their mutations. Retaining one row must not keep every filtered array alive.
   private detachedVersions?: Map<StoreInternal, number>;
-  private detachedParent?: ParentReference;
 
   constructor(
     readonly target: object,
@@ -44,7 +43,6 @@ export class StoreInternal {
   }
 
   private connect(child: StoreInternal): void {
-    child.detachedParent = undefined;
     const count = child.parents.get(this.reference) ?? 0;
     if (!count) {
       child.trackSharedParents();
@@ -77,7 +75,6 @@ export class StoreInternal {
 
   private disconnect(child: StoreInternal): void {
     const count = child.parents.get(this.reference);
-    if (count === undefined) return;
     if (count > 1) {
       child.parents.set(this.reference, count - 1);
       return;
@@ -106,7 +103,6 @@ export class StoreInternal {
         versions.set(child, child.version);
         node.disconnect(child);
         if (child.canSuspend()) {
-          child.detachedParent = node.reference;
           pending.push(child);
         }
       }
@@ -123,8 +119,7 @@ export class StoreInternal {
     }[] = [{node: this}];
     while (pending.length) {
       const frame = pending.pop();
-      if (!frame) break;
-      const {node, versions} = frame;
+      const {node, versions} = frame as NonNullable<typeof frame>;
       if (versions) {
         for (const [child, previous] of versions) {
           if (child.version !== previous) {
@@ -146,13 +141,7 @@ export class StoreInternal {
   /** A caller can still read, mutate, or subscribe to a detached subtree. */
   resumeScope(): void {
     if (!this.detachedVersions) return;
-    let scope: StoreInternal = this;
-    let parent = scope.detachedParent?.deref();
-    while (parent?.detachedVersions) {
-      scope = parent;
-      parent = scope.detachedParent?.deref();
-    }
-    scope.resume();
+    this.resume();
   }
 
   /** This node and every container that currently owns it, up to each root. */
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..03e3f6c 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -29,7 +29,7 @@ const originalAccessors = new WeakMap<
 >();
 
 export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
-  return getter && originalAccessors.get(getter);
+  return originalAccessors.get(getter as () => unknown);
 }
 
 // ── Cross-snapshot getter memoization ─────────────────────────────────────────
@@ -170,9 +170,7 @@ function markSnapshotForTracking(value: object): void {
   const hasObjectSymbol = Object.getOwnPropertySymbols(value).some((key) => {
     const descriptor = Object.getOwnPropertyDescriptor(value, key);
     return (
-      descriptor &&
-      'value' in descriptor &&
-      typeof descriptor.value === 'object' &&
+      typeof descriptor?.value === 'object' &&
       descriptor.value !== null
     );
   });
@@ -213,7 +211,6 @@ function installMemoizedGetters(snap: object, target: object): void {
       Object.defineProperty(snap, key, {
         get: memoizedGetter,
         enumerable: own ? descriptor.enumerable : true,
-        configurable: true,
       });
     }
     proto = Object.getPrototypeOf(proto);
@@ -269,8 +266,6 @@ function createSnapshotRecursive<T extends object>(
       Object.defineProperty(snap, key, {
         value: snapshotValue(desc.value, internal, key, inProgress),
         enumerable: desc.enumerable,
-        configurable: true,
-        writable: true,
       });
     }
 
@@ -283,7 +278,6 @@ function createSnapshotRecursive<T extends object>(
   registerSnapshot(snap, target);
   // Cache AFTER populating + freezing. The reference is stable.
   snapshotCache.set(target, [internal.version, snap]);
-  inProgress.delete(target);
   return snap as T;
 }
```
