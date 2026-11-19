# Stage 2 report: security

Subject: our own code and supply chain, not another library, so this report
has no ports and no table of counterparts. Read at commit `12fe57d` (branch
`release/1.0`), package version 0.11.0. All library line numbers below are at
that commit.

## What I read and ran

Read closely:

- `packages/classy-store/src/utils/persist/persist.ts` and `persist.types.ts`
  (the test files only where a finding touched them)
- `packages/classy-store/src/utils/devtools/devtools.ts`
- `packages/classy-store/src/utils/history/history.ts`
- `packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts`
- `packages/classy-store/src/utils/internal/internal.ts` (`canProxy`,
  `findGetterDescriptor`, which persist, devtools and history rely on)
- `packages/classy-store/package.json`, `tsdown.config.ts`, the root
  `package.json`, `bun.lock`, `bunfig.toml`, `.changeset/config.json`
- `.github/workflows/ci.yml`, `docs.yml`, `react-compatibility.yml`,
  `react-next.yml`, `release.yml`
- The packed tarball `codebelt-classy-store-0.11.0.tgz` at the repository root
  (listed, not unpacked), and the npm registry metadata for
  `proxy-compare@3.0.1` and `@codebelt/classy-store@0.11.0`
- `website/content/docs/PERSIST_TUTORIAL.md` and `DEVTOOLS_TUTORIAL.md`, only
  to see which `merge` and `enabled` idioms we teach

Ran, all in
`/private/tmp/claude-501/-Users-robertparallax-WebstormProjects-classy-store/9c8c2bbd-bb57-4b12-aa7b-9d06972e3fdd/scratchpad/stage-2-security/`,
with Bun 1.4.4 importing our source by absolute path:

- `repro/persist-input.ts`: hostile and malformed stored records, versions,
  `migrate`, transforms, `merge`, expiry (output `repro/persist-input.out`)
- `repro/storage-events.ts`: crafted cross-tab events
- `repro/devtools-input.ts`: a fake Redux DevTools extension sending crafted
  messages
- `repro/large-input.ts`, `repro/depth.ts`, `repro/depth2.ts`,
  `repro/depth3.ts`: deep and large records
- `repro/reviver.ts`: the cost of stripping `__proto__` with a `JSON.parse`
  reviver
- `audit/`: a copy of the manifests and `bun.lock` (nothing installed), where
  `bun audit` ran
- `sig/`: `proxy-compare@3.0.1` installed with scripts disabled, where
  `npm audit signatures` ran

Nothing was run in the repository.

## Threat model in one paragraph

`persist` reads whatever is in storage under its key, and with `syncTabs` it
also reads every `storage` event under that key. `devtools` reads every message
the object at `window.__REDUX_DEVTOOLS_EXTENSION__` delivers. Who can write
those inputs: (a) script on the same origin, including XSS, which can already
do anything to the store directly; (b) a browser extension with access to the
page, which can too; (c) the user, through the browser's developer tools, on
their own client; (d) **another application on the same origin**, for example
two apps served from different paths of one `github.io` or intranet host, which
share `localStorage` but are otherwise separate; (e) an older or newer version
of the same application, which is not hostile but writes shapes this version
does not expect. Only (d) and (e) gain anything they did not already have, so
the findings below are about integrity and availability of one client's state.
None of them lets data reach another user or the server, and none pollutes
`Object.prototype`.

## Findings

### 1. Finding 48 settled: `persist` cannot swap the store's prototype unless the application lists `__proto__` itself

- **What happens.** The restore loop writes only keys in the configured or
  default property list (`propKeys`), and only when `Object.hasOwn(merged, key)`
  holds. The default list comes from `Object.keys(snapshot(store))`, which
  never contains `__proto__`, `constructor` or `prototype` for an ordinary
  class store. So a record
  `{"state":{"__proto__":{"polluted":1,"inc":"x"},"constructor":{"x":1},"prototype":{"y":1},"count":5}}`
  restores `count` and nothing else: the prototype, methods and getters are
  unchanged and `({}).polluted` is `undefined`. A custom `merge` written with
  `Object.assign({}, current, persisted)` turns the stored `__proto__` into the
  merged object's prototype, but `Object.hasOwn` then refuses the inherited
  values, so the store is unchanged too. The spread idiom the tutorial teaches
  (`{...current, ...persisted}`) keeps `__proto__` as an own key that no
  listed property matches. Only when the application names the key in
  `properties` (which `keyof T` does not offer, so it takes a cast or an
  untyped array) does the assignment
  `proxyStore['__proto__'] = clone` reach the inherited setter and replace the
  prototype: methods and getters disappear.

  ```text
  ## top-level __proto__/constructor/prototype, default properties
    store proto is Settings.prototype: true      count 5   ({}).polluted: undefined
  ## top-level prototype keys named in properties
    store proto is Settings.prototype: false     inc is method: undefined   doubled: undefined
  ## custom merge using Object.assign({}, current, persisted)
    store proto is Settings.prototype: true      count 0 (stored __proto__.count 99 refused)
  ```

  Cross-tab events go through the same function and behave the same (repro
  `storage-events.ts`, case 5). `withHistory` restores only snapshots of its
  own store, and its `isData('__proto__')` is false because
  `findGetterDescriptor` finds `Object.prototype.__proto__`.

- **Where.** `persist.ts:337-339` (the `pending` filter), `persist.ts:363`
  (the assignment), `persist.ts:42-68` (`resolveProperties`).
- **Who can cause it.** Only the application author, by listing the key. A
  storage writer cannot on its own. Not serious.
- **Proposal: fix, cheaply.** In `resolveProperties`, throw when a listed key
  is `__proto__`, `constructor`, `prototype`, a getter (finding 52) or a method,
  and when an entry is an object without both `serialize` and `deserialize`
  (finding 55). One validation pass at `persist()` time, so restore never has
  to ask.
- **Kind:** hardening, diagnostics.
- **Cost:** `persist.ts` and its tests. Breaking only for code that lists a
  getter or a malformed entry, which is already broken. Low risk.

### 2. A nested `__proto__` key survives restore as an own data property and is written back on the next save

- **What happens.** `JSON.parse` makes `"__proto__"` an ordinary own key.
  `cloneSnapshotValue` copies every own key with `Object.defineProperty`, so
  the restored object keeps that key as data and its real prototype stays
  `Object.prototype`. The snapshot layer also uses `defineProperty`
  (`snapshot.ts:213`, `snapshot.ts:269`), so snapshots are safe too. The
  hazard is downstream: the store now holds `prefs` with own keys
  `["__proto__","theme"]`, `JSON.stringify` writes it back on every save, and
  application code that copies the object with `Object.assign(target, prefs)`
  or a `for...in` loop that assigns `target[key] = value` replaces `target`'s
  prototype. DevTools does the same for nested values (repro
  `devtools-input.ts`: `prefs own keys: ["__proto__"]`).

  ```text
  ## nested __proto__ in prefs
    prefs own keys: ["__proto__","theme"]
    prefs proto is Object.prototype: true
    snapshot prefs proto is Object.prototype: true
    ({}).polluted: undefined
  ```

- **Where.** `cloneSnapshot.ts:22-41`, called from `persist.ts:363`;
  `devtools.ts:87` and `devtools.ts:100`.
- **Who can cause it.** Anyone who can write the storage key (d, e above) or
  send DevTools messages. It matters only with an unsafe copy in application
  code. Low.
- **Proposal: fix.** Drop own `__proto__` keys at every depth when restoring
  from storage or DevTools. The cheapest place is inside the walk
  `cloneSnapshotValue` already does, behind a parameter that only `persist`
  passes, so history keeps cloning exactly. A `JSON.parse` reviver would also
  work, but measured about ten times slower to parse (2.1 MB record: 2.7 ms
  plain, 35 ms with the reviver; `repro/reviver.out`). DevTools assigns parsed
  values without cloning; see finding 7.
- **Kind:** hardening.
- **Cost:** `cloneSnapshot.ts`, `persist.ts`, `devtools.ts`, a test each. Not
  breaking for any data a real application writes. Low risk.

### 3. A deeply nested record bricks the store: restore succeeds, then every snapshot and every save throws, and the bad record is never replaced

- **What happens.** Nothing bounds the depth of restored data.
  `cloneSnapshotValue` and the snapshot builder both recurse once per level,
  and the snapshot builder runs out of stack first. Between those two limits a
  restore succeeds with no error, after which `snapshot(store)` throws
  `RangeError` on every call. Every component that reads the store fails, every
  automatic save fails with a `'write'` error, and `save()` rejects, so the
  record that caused it stays in storage and the next page load repeats it.
  Beyond the clone limit, restore fails part-way: fields earlier in the class
  are restored, later ones are not, and a `'parse'` error is reported (the same
  partial-restore shape as stage 1 finding 52).

  ```text
  depth   a (first field)  b (deep field)  snapshot      errors
  15000   restored-a       object          ok
  16000   restored-a       object          RangeError    (none)
  17000   restored-a       object          RangeError    (none)
  18000   restored-a       object          RangeError    (none)
  19000   restored-a       default         ok            parse:RangeError
  after an edit at depth 17000: errors write:RangeError | stored record unchanged: true
  save() rejects with RangeError
  ```

  The limits are Bun's (JavaScriptCore's) and will differ by engine and by how
  much stack is in use; browsers are likely to fail at lower depths. Large but
  shallow input is only slow: 100,000 rows (2.1 MB) restore in 133 ms, 1,000,000
  rows (22 MB, beyond any browser's `localStorage` quota) in 1.5 s, with no
  error (`repro/large-input.out`).
- **Where.** `cloneSnapshot.ts:37` (recursion), `snapshot.ts:235`
  (`createSnapshotRecursive`), `persist.ts:360-377` (one field at a time).
- **Who can cause it.** A storage writer (d, e). An application can also do
  it to itself with legitimately deep data, which is a core limit rather than
  a persist one. Availability only, but persistent until the user clears site
  data. Low to moderate for apps on a shared origin.
- **Proposal: fix the partial restore, and document the depth limit.** Clone
  every value before assigning any, so a failure leaves the store untouched,
  as a throwing `deserialize` already does (verified: `count` stayed 0). Then
  take one `snapshot()` inside the same `try`; if it throws, put back the
  fields just written and report `'parse'`. That turns a bricked store into a
  reported, skipped record. A depth cap in `cloneSnapshotValue` is an
  alternative, but any number we pick is engine-dependent.
- **Kind:** bug, hardening.
- **Cost:** `persist.ts` and a test. Not breaking. The rollback path needs
  care with the existing `skipAutoSaveVersion` and `clearedVersion`
  bookkeeping. Medium risk.

### 4. Records persist cannot read are skipped without any report

- **What happens.** A record that is valid JSON but not an envelope, or whose
  `state` is not an object, is skipped with no error and no status change:
  `5`, `null`, `"str"`, `[]`, `{"state":null}`, `{"state":"str"}`. So is a
  record whose version differs when there is no `migrate`, and a `migrate`
  that returns a string or an array. Only text that is not JSON, a `migrate`
  that throws, or one that returns `null` is reported, as `'parse'`. An array
  `state` passes the envelope check (stage 1 finding 53) and is handed to
  `migrate`, whose type says `Record<string, unknown>`.

  ```text
  envelope 5 / null / "str" / [] / state null / state "str" / state [1,2,3]
    count 0, errors: [], lastError: none
  migrate returns a string / an array      errors: []
  migrate throws                           errors: ["parse: migrate boom"]
  migrate returns null                     errors: ["parse: null is not an object ..."]
  ```

- **Where.** `persist.ts:287-294`, `persist.ts:312-315`, `persist.ts:321`.
- **Who can cause it.** Anyone who writes the key, mostly (e). It matters
  because the store silently starts from defaults and the next save overwrites
  the record, so data loss leaves no trace.
- **Proposal: fix.** Replace the scattered guards (which stage 1 finding 54
  shows are partly redundant) with one `readEnvelope(raw)` that returns either
  a typed envelope or a reason, and report every reason through `onError` with
  `'parse'`. Reject an array `state` and a `migrate` result that is not a plain
  object.
- **Kind:** diagnostics, bug.
- **Cost:** `persist.ts`, `persist.types.ts` (perhaps an error class or code),
  tests. Not breaking in the API; applications see new `onError` calls. Low.

### 5. A version that is not a number counts as version 0

- **What happens.** `typeof envelope.version === 'number' ? envelope.version : 0`
  makes a missing version, `"2"`, `null` and `{}` all version 0. With
  `version: 2` configured, the record `{"version":"2",...}` is handed to
  `migrate` as version 0, so a v0-to-v2 migration runs over data already in v2
  shape; without `migrate` it is dropped silently (finding 4). Negative,
  fractional and huge numbers (`-1`, `2.5`, `1e308`) reach `migrate` as they
  are.

  ```text
  version "2" vs configured 2, with migrate:  migrate got oldVersion 0
  version -1 / 2.5 / 1e308:                   migrate got -1 / 2.5 / 1e308
  version "2", no migrate:                    count 0, errors: []
  ```

- **Where.** `persist.ts:310-315`.
- **Who can cause it.** (e), or (d). Integrity of one client's state. Low.
- **Proposal: fix.** Only a missing `version` means 0 (keeps the documented
  rule for old records). Any other value that is not a finite integer is an
  unreadable record, reported as in finding 4. Document that `migrate` may
  receive any integer, including one newer than the current version.
- **Kind:** bug, docs.
- **Cost:** `persist.ts`, the tutorial's migration section, a test. Breaking
  only for records with a non-numeric version, which are already mishandled.
  Low.

### 6. With `expireIn` set, a record with no usable `expiresAt` never expires

- **What happens.** Expiry is checked only when `expiresAt` is a number. A
  record without it, or with a string, `null` or `1e308`, is restored however
  old it is. `-1` and `0` expire as expected.

  ```text
  expiresAt missing / "yesterday" / null / 1e308, expireIn 1000: restored (count 9)
  expiresAt -1 / 0:                                              skipped (count 0)
  ```

  The realistic case is benign: records written before the application added
  `expireIn`, or by a version without it, live forever. The TTL is also not a
  security control, since whoever writes the record chooses `expiresAt`.
- **Where.** `persist.ts:297-303`.
- **Who can cause it.** (e) mostly. Low.
- **Proposal: owner's call between fix and document.** Fixing means: when
  `expireIn` is set, a record without a finite `expiresAt` counts as expired.
  That drops pre-TTL records once, which is arguably what someone adding a TTL
  wants. Either way, document that expiry bounds the age of data this
  application wrote, and is not a way to make stored data trustworthy.
- **Kind:** bug or docs.
- **Cost:** `persist.ts` and a test, or one paragraph. Behaviour change for
  old records if fixed. Low.

### 7. DevTools time travel adds fields, calls setters, and differs from history's restore

- **What happens.** Only `DISPATCH` messages whose payload type is
  `JUMP_TO_STATE` or `JUMP_TO_ACTION` and which carry a `state` string are
  acted on; `ROLLBACK`, `IMPORT_STATE`, `RESET`, `COMMIT`, `TOGGLE_ACTION` and
  `ACTION` are ignored. For an acted-on message, every top-level key of the
  parsed state is assigned unless the store has a getter or a function there.
  Consequences, all verified:
  - Prototype: safe. `__proto__` is skipped because `findGetterDescriptor`
    finds the inherited accessor on `Object.prototype`, and `constructor`
    because it reads as a function. This is incidental, not designed.
  - Methods and getters cannot be replaced.
  - **New fields are added** (`added`, `prototype` became own fields), and
    fields missing from the jumped-to state are left as they are, so the store
    can end up in a state DevTools never showed.
  - **A setter-only accessor is called** with the message's value (`set level`
    ran with `7`), because the skip checks only for a getter.
  - Nested values are assigned as parsed, without the cloning history uses, and
    keep own `__proto__` keys (finding 2).
  - A malformed `state` is swallowed silently.
  - An edit made in the same tick as a jump is never sent to DevTools, because
    `isTimeTraveling` stays true until a microtask.
  - Every snapshot is sent to the extension, so any secret held in store state
    (a token, personal data) is copied into the extension's history.
- **Where.** `devtools.ts:82-113`, the skip at `devtools.ts:93-99`, the flag
  at `devtools.ts:73-79` and `devtools.ts:107-109`.
- **Who can cause it.** The extension, or any page script that defines
  `window.__REDUX_DEVTOOLS_EXTENSION__` before `devtools()` runs (a), or the
  user (c). In production, if an application leaves `enabled` at its default
  `true`, any user with the extension can edit the client state. That is the
  user editing their own client, which the server must not trust anyway. Low.
- **Proposal: fix by reuse.** Apply the jumped-to state with the same function
  history uses (`applySnapshot`'s rule: only keys that are data on the store,
  delete data fields absent from the state, clone with the `__proto__` strip
  from finding 2). Skip any accessor, not only getters. Report a malformed
  message in development. Keep `enabled` defaulting to `true` (the library has
  no portable way to detect production), but say in the API reference, next to
  `enabled`, that the extension receives every state, so secrets should not
  live in a store that has DevTools enabled outside development.
- **Kind:** hardening, simplification, docs.
- **Cost:** `devtools.ts`, `history.ts` (export the apply helper to a shared
  internal module), docs, tests. Behaviour change for time travel only, which
  becomes more faithful. Low.

### 8. Cross-tab sync accepts events from any storage area, and synthetic events, under the same key

- **What happens.** The handler checks the key, ignores `newValue === null`,
  and, when `storageArea` is present, skips an event whose value is no longer
  in that area. It does not check that the area is the configured storage. An
  event from another `Storage` (for example `sessionStorage` in a same-origin
  frame, or another library's area) with the same key is applied, and an event
  with no `storageArea` (only a script can make one) skips the staleness check.
  Events with another key, a `null` key (`localStorage.clear()` in another
  tab), and events after `dispose()` are correctly ignored.

  ```text
  1. synthetic event without storageArea applied: true
  2. event from a different storage area with the same key applied: true theirs
  3. event whose value is no longer in the configured storage applied: false
  4. event with a different key applied: false
  7. clear() from another tab ignored
  8. event after dispose applied: false
  ```

- **Where.** `persist.ts:446-453`.
- **Who can cause it.** Same-origin script (a), which gains nothing, or (d)
  writing a different area under the same key. Low.
- **Proposal: document, and fix the cheap half.** When `storage` is itself
  the event's kind of object (`storage instanceof Storage`), ignore events whose
  `storageArea !== storage`. Do not require identity when the adapter is a
  wrapper, or `syncTabs` stops working for wrapped `localStorage`. Document that
  `syncTabs` listens to `localStorage` events under `name` whatever adapter is
  configured.
- **Kind:** hardening, docs.
- **Cost:** `persist.ts`, `persist.types.ts` doc comment, a test. Not breaking
  for real browser events. Low.

### 9. Restored values are not validated against the class's field types

- **What happens.** Any JSON value is restored into any field: a string into
  `count`, an object into `label`, and `{"0":"x","length":3}` into an array
  field, after which `Array.isArray(store.items)` is false and
  `store.items.map` throws in application code. JSON cannot forge a `Date`,
  `ReactiveMap` or class instance, because `cloneSnapshotValue` keeps the
  parsed object's own prototype (`Object.prototype` or `Array.prototype`).
  The tutorial already says stored input is `unknown` and transforms should
  validate it (`PERSIST_TUTORIAL.md:145`), and a throwing `merge` or
  `deserialize` already rejects the whole record before anything is assigned
  (verified).
- **Where.** `persist.ts:321-339`.
- **Who can cause it.** (d), (e). Low; it is the application's schema.
- **Proposal: document, possibly adapt.** Say once, prominently, that stored
  data is untrusted input and that a `merge` function is the place to validate
  the whole record (throwing rejects it atomically). Show a short validating
  `merge` with a schema library. A dedicated `validate` option would duplicate
  `merge`; I would not add one before 1.0.
- **Kind:** docs.
- **Cost:** the persist tutorial and API reference. None to the code.

### 10. Runtime dependency: `proxy-compare` 3.0.1

- **What happens.** It is the only runtime dependency and the published code
  imports it externally (`dist/storeRuntime.mjs`, line 2). Registry metadata:
  one maintainer (npm user `daishi`, the author of Valtio and Zustand), MIT, no
  dependencies, no `preinstall`, `install` or `postinstall` script (its
  scripts are build and test only), published 2024-11-22 and not changed
  since, registry signature verified (`npm audit signatures`: "1 package has a
  verified registry signature"), no provenance attestation. We declare it
  exactly (`"proxy-compare": "3.0.1"`, `packages/classy-store/package.json`),
  and `bunfig.toml` sets `exact = true` for future additions. Valtio 2.3.2
  declares `^3.0.1`.
- **Where.** `packages/classy-store/package.json` `dependencies`.
- **Who can cause it.** A takeover of that one npm account. With an exact pin
  a malicious 3.0.2 does not reach our consumers until we release with it; the
  cost is that a security fix in it does not reach them either, and that a
  consumer with Valtio may install two copies once 3.0.2 exists.
- **Proposal: accept, and document the choice.** The package is small (a few
  hundred lines), stable and has no dependencies of its own. Keep the exact pin
  for 1.0, watch it with Dependabot or Renovate, and say in `CONTRIBUTING.md`
  why it is exact. Vendoring it would remove the account risk but makes us the
  maintainer of its fixes; not worth it unless it goes unmaintained.
- **Kind:** hardening, docs.
- **Cost:** none, or one paragraph.

### 11. Development dependencies: 17 advisories, none in the published artifact

- **What happens.** `bun audit` over the committed lockfile:

  ```text
  baseline-browser-mapping@2.10.25  moderate  DoS on invalid input
      via next, @angular/build, and @babel/core (dev dependency of the package)
  browserslist@4.28.2               2 high    memory growth; prototype write via custom stats file
      via @angular/build, and @babel/core (dev dependency of the package)
  fast-uri@3.1.0                    8 high, 2 moderate, 2 low   URI parsing (ajv)
      via website > serve, @angular/cli, @angular/build
  immutable@5.1.5                   2 high    DoS (sass)
      via examples (next, vite, @angular/build)
  17 vulnerabilities (12 high, 3 moderate, 2 low)
  ```

  None can reach a consumer: the tarball holds only `dist`, `README.md`,
  `CHANGELOG.md`, `LICENSE` and `package.json` (verified by listing the packed
  0.11.0 tarball: 98 entries, all compiled output and source maps), and
  `dist` imports only `proxy-compare` and the framework peers. All four
  packages run at build or test time in CI on inputs we write (browserslist
  queries in our configs, URIs in our configs, our own Sass). Bun runs no
  dependency lifecycle scripts except its built-in trusted list and the root's
  `trustedDependencies: ["sharp"]` (`bun.lock:168`).
- **Where.** `bun.lock`.
- **Who can cause it.** Nobody outside the project, as far as I can see. Low.
- **Proposal: fix at the next dependency refresh, not a release blocker.**
  `bun update` within ranges clears most of them (`fast-uri` 3.1.9,
  `browserslist` above 4.28.6, `immutable` 5.1.8). Add a `bun audit` step to
  CI that reports but does not fail, or fails only for packages reachable from
  `packages/classy-store`'s `dependencies`.
- **Kind:** hardening.
- **Cost:** `bun.lock`, perhaps `ci.yml`. Not breaking.

### 12. The release job gives every dependency the npm publishing identity

- **What happens.** `release.yml` runs one job with `contents: write`,
  `pull-requests: write` and `id-token: write`. In that job it runs
  `bun install --frozen-lockfile` (about 1,800 locked packages, including the
  website's and examples' trees), `bun run build` (tsdown and its plugins),
  `changesets/action@v1` (which runs `changeset version` and our `biome format`
  script), then `npm publish --provenance` of the `dist` that build produced.
  There is no npm token in the workflow: publishing uses npm trusted publishing
  over OIDC, and the registry confirms it (`_npmUser` of 0.11.0 is
  `GitHub Actions <npm-oidc-no-reply@github.com>`, with a SLSA provenance
  attestation). That design is good, but anything that executes in the job can
  request the OIDC token from the runner's environment and publish its own
  version, or rewrite `dist` before `npm publish` packs it. The provenance would
  still say it came from this workflow. `actions/checkout` also leaves the
  `GITHUB_TOKEN` (with `contents: write`) in `.git/config` for the whole job.
  Actions are pinned by moving major tags (`actions/checkout@v6`,
  `actions/setup-node@v6`, `oven-sh/setup-bun@v2`, `changesets/action@v1`), not
  commit SHAs, so a moved tag on a third-party action runs with the same
  rights. `ci.yml`, `react-compatibility.yml` and `react-next.yml` declare no
  `permissions` (pull requests from forks get a read-only token anyway);
  `docs.yml` declares `contents: read` and grants `pages` and `id-token` only to
  the deploy job, which is the pattern the release job should follow. Node is
  `"24"` (floating), Bun is pinned to 1.4.4.
- **Where.** `.github/workflows/release.yml` (permissions block and steps),
  `ci.yml`, `react-compatibility.yml`, `react-next.yml` (no `permissions`).
- **Who can cause it.** A compromised development dependency or a moved action
  tag, the realistic supply-chain path into consumers. Moderate: it is the one
  route by which someone else's compromise becomes a malicious
  `@codebelt/classy-store` release with valid provenance.
- **Proposal: fix before 1.0.**
  1. Split the release into two jobs. Job one (`contents: write`,
     `pull-requests: write`, no `id-token`) installs, builds, runs
     changesets, and on a publishable commit runs `npm pack` and uploads the
     tarball as an artifact. Job two (`id-token: write` and `contents: read`
     only) installs nothing, downloads the tarball, and runs
     `npm publish <tarball> --provenance`. A compromised dependency then never
     sees the OIDC token.
  2. Put job two in a GitHub environment (for example `npm`) with the owner as
     required reviewer, and configure the npm trusted publisher to accept only
     that environment. This also matches the rule that the owner alone
     releases.
  3. Pin every third-party action to a full commit SHA with the tag in a
     comment, and let Dependabot update them.
  4. `persist-credentials: false` on checkouts that do not push; in the
     release, push the tags with the token passed explicitly.
  5. Add `permissions: contents: read` at the top of the three workflows that
     lack it.
  6. In the npm package settings, once trusted publishing works, disallow
     publishing with tokens.
- **Kind:** hardening.
- **Cost:** `.github/workflows/*.yml` and npm settings. No code, not
  breaking. Medium risk only in the sense that the first release after the
  change must be watched.

### 13. What the published tarball contains

- **What happens.** `files` is `dist`, `README.md`, `CHANGELOG.md`, `LICENSE`.
  The packed 0.11.0 tarball has 98 entries: those four files, `package.json`,
  and `.mjs`, `.cjs`, `.d.mts`, `.d.cts` and `.map` files under `dist`. The
  source maps embed `sourcesContent`, which is our public source and no
  secret. No test, fixture, `.env` or configuration file is included, and the
  library source has no `process.env`, `eval`, `new Function` or `innerHTML`.
  The published `package.json` has no install-time scripts; it keeps
  `prepack` (`cp ../../README.md .`), which runs only when someone packs from a
  checkout. Unpacked size is 543 KB, mostly source maps.
- **Where.** `packages/classy-store/package.json` `files`, `scripts.prepack`.
- **Who can cause it.** Nothing to cause. Informational.
- **Proposal: accept.** Optionally strip the development scripts from the
  published manifest, but nothing here is a risk.
- **Kind:** none needed.
- **Cost:** none.

## Stage 1 findings followed up

- **48** (`Object.assign` with `__proto__` swaps the prototype): settled in
  finding 1. Persist does not use `Object.assign`, and its key filter keeps
  `__proto__` out unless the application lists it. DevTools skips it by
  accident of `findGetterDescriptor` (finding 7).
- **52** (a getter in `properties` is saved and restoring fails part-way):
  still true. Finding 1 proposes rejecting getters at `persist()` time, and
  finding 3 proposes the clone-everything-first restore that makes any failure
  atomic.
- **53** (an array `state` passes the envelope check): still true, and the
  array also reaches `migrate`, whose type says it cannot. Finding 4.
- **54** (dead or redundant code in `persist.ts`): none of it is a security
  issue. The redundant `typeof envelope !== 'object'` guard is safe because a
  primitive's `state` reads as `undefined`. Finding 4 proposes replacing the
  guards with one `readEnvelope` that reports why a record was refused.

## API question 8: development-only diagnostics that would catch silent failures

From this subject's side, in order of value:

1. **Unreadable stored records** (finding 4, 5): report through `onError` as
   `'parse'` with a reason. This is not development-only; it is a missing
   error.
2. **Bad `properties` entries** (finding 1, stage 1 findings 52 and 55): throw
   at `persist()` time for a getter, a method, a prototype key or a malformed
   transform.
3. **A restore that leaves the store unsnapshottable** (finding 3): one
   `snapshot()` after restore, inside the existing `try`, turns a bricked store
   into a reported failure. Cheap enough to run always.
4. **DevTools**: warn in development on a malformed time-travel message and on
   a key that does not exist on the store, instead of swallowing the first and
   silently adding the second (finding 7).
5. **`syncTabs` with an adapter that is not `localStorage`**: warn in
   development, since the option then listens to `localStorage` events that
   the adapter never produces (`persist.types.ts:113-114` already says so in a
   comment).

## Verified by running code, and only read

Verified by running code (scripts and outputs in the scratch folder named
above):

- Findings 1 to 9: every behaviour quoted in their output blocks, against our
  source at `12fe57d`, under Bun 1.4.4. The depth limits in finding 3 are
  Bun's and were not measured in a browser.
- Finding 10: registry metadata, absence of install scripts, registry
  signature.
- Finding 11: `bun audit` output over a copy of the lockfile.
- Finding 12: that 0.11.0 was published by GitHub Actions over OIDC with a
  provenance attestation (registry metadata).
- Finding 13: the tarball listing, and the absence of `process.env`, `eval`,
  `new Function` and `innerHTML` in `packages/classy-store/src` (grep).

Only read, not run:

- That anything running in the release job can obtain the OIDC token and
  publish (finding 12). This is how GitHub's OIDC and npm trusted publishing
  work as documented; I did not attempt it.
- That Bun's default trusted list is the only set of dependency scripts that
  run on install.
- That `keyof T` of a class instance type excludes `__proto__` and
  `constructor` (finding 1). I did not compile a test.
- That an array `state` reaches `migrate` (finding 4): read from
  `persist.ts:287-315`, not run with a version mismatch.
- That browsers hit the recursion limits of finding 3 at lower depths than
  Bun.
- I did not read `~/.npmrc` or any credential file, and found no secret in the
  tracked files (`git ls-files` has no `.env`, `.npmrc`, key or certificate
  file).

## Appendix: reproduction code and output

The scripts are in
`/private/tmp/claude-501/-Users-robertparallax-WebstormProjects-classy-store/9c8c2bbd-bb57-4b12-aa7b-9d06972e3fdd/scratchpad/stage-2-security/repro/`.
The essential parts follow.

### Hostile stored records (`persist-input.ts`, abridged)

```ts
class Settings {
  count = 0;
  label = 'a';
  prefs: Record<string, unknown> = {theme: 'light'};
  items: string[] = [];
  get doubled() {
    return this.count * 2;
  }
  inc() {
    this.count++;
  }
}

async function restore(title: string, raw: string | null, extra = {}) {
  const store = createClassyStore(new Settings());
  const storage = memoryStorage(raw); // a Map behind getItem/setItem/removeItem
  const h = persist(store, {name: 'k', storage, onError, ...extra} as never);
  await h.hydrated;
  // prints prototype, fields, own keys of prefs, ({}).polluted, errors
}

await restore(
  'top-level prototype keys named in properties',
  `{"version":0,"state":{"__proto__":{"polluted":1},"constructor":{"x":1},"count":5}}`,
  {properties: ['count', '__proto__', 'constructor']},
);
await restore(
  'nested __proto__ in prefs',
  `{"version":0,"state":{"prefs":{"__proto__":{"polluted":1,"isAdmin":true},"theme":"dark"}}}`,
);
await restore(
  'custom merge using Object.assign({}, current, persisted)',
  `{"version":0,"state":{"__proto__":{"count":99,"polluted":1}}}`,
  {merge: (p: object, c: object) => Object.assign({}, c, p)},
);
// ...envelopes 'not json', '5', 'null', '"str"', '[]', state null/'str'/[1,2,3];
// versions undefined, -1, '2', 2.5, 1e308, {}, null against version 2;
// migrate throwing / returning null, a string, an array; deserialize throwing;
// merge returning null; expiresAt undefined, 'yesterday', -1, 0, 1e308, null.
```

Output, condensed (the full output is `persist-input.out`):

```text
top-level __proto__/constructor/prototype, default properties
  proto Settings: true   count 5   inc: function   doubled 10   ({}).polluted: undefined   errors []
top-level prototype keys named in properties
  proto Settings: false  count 5   inc: undefined  doubled undefined   own constructor: true
nested __proto__ in prefs
  proto Settings: true   prefs own keys ["__proto__","theme"]   prefs proto Object.prototype: true
custom merge using Object.assign / using spread
  proto Settings: true   count 0 / 3   ({}).polluted: undefined
stored keys named after a method and a getter
  count 2   inc: function   doubled 4
envelope not json            errors ["parse: JSON Parse error: Unexpected identifier \"not\""]
envelope 5, null, "str", [], state null, state "str", state [1,2,3]
                             count 0   errors []
wrong field types            count "hello"   label {"nested":true}   items {"0":"x","length":3} isArray false
version missing / {} / null  migrate got oldVersion 0
version "2"                  migrate got oldVersion 0     (configured version is 2)
version -1 / 2.5 / 1e308     migrate got -1 / 2.5 / 1e308
version "2", no migrate      count 0   errors []
migrate throws               errors ["parse: migrate boom"]
migrate returns null         errors ["parse: null is not an object (evaluating 'Object.keys(state)')"]
migrate returns string/array count 0   errors []
deserialize throws on label  count 0 (nothing assigned)   errors ["parse: bad label"]
merge returns null           count 0   errors ["parse: null is not an object"]
expiresAt missing/"yesterday"/null/1e308   count 9 (restored)
expiresAt -1 / 0                           count 0 (expired)
```

### Cross-tab events (`storage-events.ts`)

```ts
function fire(init: {
  key: string | null;
  newValue: string | null;
  storageArea?: unknown;
}) {
  const event = new Event('storage') as Event & Record<string, unknown>;
  Object.assign(event, init); // Bun has no StorageEvent; persist reads only these three
  globalThis.dispatchEvent(event);
}
const h = persist(store, {name: 'app', storage, syncTabs: true, onError});
fire({key: 'app', newValue: rec({count: 1})});
otherArea.map.set('app', rec({count: 2, token: 'theirs'}));
fire({
  key: 'app',
  newValue: rec({count: 2, token: 'theirs'}),
  storageArea: otherArea,
});
fire({key: 'app', newValue: rec({count: 3}), storageArea: storage});
fire({key: 'other', newValue: rec({count: 4})});
fire({
  key: 'app',
  newValue: '{"version":0,"state":{"__proto__":{"x":1},"count":5}}',
});
fire({key: 'app', newValue: 'garbage'});
fire({key: null, newValue: null});
h.dispose();
fire({key: 'app', newValue: rec({count: 99})});
```

```text
1. synthetic event without storageArea applied: true
2. event from a different storage area with the same key applied: true theirs
3. event whose value is no longer in the configured storage applied: false
4. event with a different key applied: false
5. __proto__ in event: count 5 proto kept true
6. malformed event value -> errors: ["parse: JSON Parse error: Unexpected identifier \"garbage\""]
7. clear() from another tab ignored, count stays 5
8. event after dispose applied: false
```

### DevTools messages (`devtools-input.ts`, abridged)

```ts
globalThis.window = globalThis;
globalThis.__REDUX_DEVTOOLS_EXTENSION__ = {
  connect: () => ({
    init,
    send,
    subscribe: (l) => {
      listener = l;
      return () => {
        listener = undefined;
      };
    },
  }),
};
class Account {
  count = 0;
  role = 'user';
  prefs = {theme: 'light'};
  #secret = 1;
  get isAdmin() {
    return this.role === 'admin';
  }
  set level(v: unknown) {
    console.log('   setter "level" called with', JSON.stringify(v));
  }
  promote() {
    this.role = 'admin';
  }
}
const store = createClassyStore(new Account());
devtools(store, {name: 'test'});
jump({
  count: 5,
  isAdmin: true,
  promote: 'replaced',
  constructor: {evil: 1},
  prototype: {p: 1},
  level: 7,
  added: 'new field',
});
listener({
  type: 'DISPATCH',
  payload: {type: 'JUMP_TO_STATE'},
  state:
    '{"__proto__":{"promote":"x","polluted":1},"prefs":{"__proto__":{"isAdmin":true}}}',
});
// then ROLLBACK, IMPORT_STATE, RESET, COMMIT, TOGGLE_ACTION, ACTION with count 77/78;
// jump({count: 1}); jump({count: 2}) followed by store.count = 3 in the same tick; '{oops'.
```

```text
init payload keys: [ "count", "role", "prefs", "isAdmin", "level" ]
   setter "level" called with 7
count: 5
isAdmin still a getter: false function
promote still a method: function
constructor own field: false prototype own field: true
added field: true new field
store proto unchanged: true
prefs own keys: ["__proto__"] prefs proto plain: true
({}).polluted: undefined
count after other message types: 5
fields not in the jumped-to state survive: {"count":1,"role":"user","prefs":{"__proto__":{"isAdmin":true}},"prototype":{"p":1},"added":"new field","isAdmin":false}
edit in the same tick as a jump was sent: false count 3
malformed state ignored without report
listener removed on dispose: true
```

### Deep and large records (`depth2.ts`, `depth3.ts`, `large-input.ts`)

```ts
class S {
  a: unknown = 'default-a';
  b: unknown = 'default-b';
}
for (const d of [15000, 16000, 17000, 18000, 19000, 20000]) {
  const raw = `{"version":0,"state":{"a":"restored-a","b":${'{"n":'.repeat(d)}0${'}'.repeat(d)}}}`;
  const store = createClassyStore(new S());
  const h = persist(store, {name: 'k', storage: mapStorage(raw), onError});
  await h.hydrated;
  // try snapshot(store); print a, typeof b, snapshot result, errors
}
// depth3.ts: at depth 17000, edit store.a, wait, compare the stored record, then save()
```

```text
15000 a= restored-a b= object snapshot ok errors
16000 a= restored-a b= object snapshot RangeError errors
17000 a= restored-a b= object snapshot RangeError errors
18000 a= restored-a b= object snapshot RangeError errors
19000 a= restored-a b= string snapshot ok errors parse:RangeError
20000 a= restored-a b= string snapshot ok errors parse:RangeError

after an edit: errors write:RangeError | stored record unchanged: true
save() rejects with RangeError

100000 rows (2.1 MB): restore 133.1 ms, list.length=100000, ok, ok, errors=[]
1000000 rows (21.9 MB): restore 1483.1 ms, list.length=1000000, ok, ok, errors=[]
```

### Cost of a `__proto__`-stripping reviver (`reviver.ts`)

```ts
const rev = (k: string, v: unknown) => (k === '__proto__' ? undefined : v);
// JSON.parse(raw) vs JSON.parse(raw, rev) on a 2.1 MB record, three rounds
```

```text
2.1 MB: plain 4.0 ms, with __proto__ reviver 41.3 ms
2.1 MB: plain 2.6 ms, with __proto__ reviver 34.1 ms
2.1 MB: plain 2.7 ms, with __proto__ reviver 35.2 ms
["b"]
```
