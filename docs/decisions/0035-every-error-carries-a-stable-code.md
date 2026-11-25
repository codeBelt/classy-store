# 0035. Every error carries a stable code, and throws the same in every build

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** diagnostics
- **Label:** Before 1.0
- **Changes documented behaviour:** no

## Context

The changes of 1.0 add many errors and reports. Message text is where the
bytes are: of the 625 bytes the first group of changes adds to the main
entry with its messages as first written, 271 are text. Before 1.0 the
library already has a few messages, and tests and users match on that text.
Before 1.0 the Vue and Solid messages start with their entry point and the
Angular one has no prefix.

## Decision

- An error or a logged report from the library reads
  `@codebelt/classy-store [code]: facts`, where the code is a short string
  such as `getter-cycle` and the facts are the names the user wrote.
- **One prefix.** Every message starts with `@codebelt/classy-store`, the
  adapters' too; the code says where it comes from.
- The advice that goes with each code is on one page of the documentation.
  The page also lists what 1.0 does not catch (record 0036).
- Codes are stable from 1.0: renaming one is a breaking change, adding one
  is not. The text after the code is unspecified.
- No error subclass and no `code` property are added.
- No check throws in one build and not in another. The bound on delivery
  rounds, the check for a cycle of getters on a snapshot (record 0010) and
  the handling of a cyclic store in `snapshot()` (record 0044) stay in
  every build.
- Codes are named subject first, then what went wrong. A `persist` record
  has three codes, not one, because what happens next differs: a record
  with nothing to keep is replaced at the next save, and the other two stop
  the handle from writing. An `onError` that decides whether to call
  `clear()` has to tell them apart, and the text after a code is not
  stable.

**The codes of 1.0.** Nineteen. A report made in every build is written with
`console.error`; the one development-only report with `console.warn`
(record 0036).

| Code                 | Thrown or logged by                                                                         | When                                                                                                                             | Record     |
| -------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `getter-cycle`       | A read of a getter, on the store or a snapshot                                              | Getters read each other in a cycle. Facts: the path                                                                              | 0010, 0035 |
| `not-a-store`        | `snapshot`, `subscribe`, `subscribeKey`, `prepareStoreForHydration`, every hook and adapter | The argument is not a store                                                                                                      | 0035       |
| `getter-write`       | A getter, on the store or a snapshot                                                        | It writes to the object it is computed on. Facts: the field                                                                      | 0010       |
| `delivery-loop`      | Logged where a subscriber's error is logged                                                 | Delivery reached 100 rounds                                                                                                      | 0013       |
| `batch-async`        | `batch`                                                                                     | The callback is a native `async` function                                                                                        | 0016       |
| `frozen-collection`  | The mutators of `ReactiveMap` and `ReactiveSet`                                             | Called on a snapshot, through a tracking proxy, or on a collection its owner froze                                               | 0045       |
| `persist-option`     | `persist()`, before it reads or writes                                                      | A key in `properties` that is a prototype key, a getter or a method; a half-written transform; a `version`; an `async` `migrate` | 0022       |
| `persist-invalid`    | A `persist` report, `'parse'`                                                               | A stored record that parses and has nothing to keep                                                                              | 0021, 0023 |
| `persist-newer`      | A `persist` report, `'parse'`                                                               | A stored record of a newer version                                                                                               | 0021       |
| `persist-not-plain`  | A `persist` report, `'parse'`                                                               | `migrate` or `merge` returned a thenable or a value that is not a plain object                                                   | 0021       |
| `persist-unread`     | A `persist` report, `'write'`, and the rejection of `save()`                                | `save()` before the first read has settled                                                                                       | 0021       |
| `persist-disposed`   | The rejection of a call on a disposed handle                                                | The handle was disposed                                                                                                          | 0035       |
| `persist-failed`     | The default `persist` report, without `onError`                                             | Any report; the error is its second argument                                                                                     | 0021       |
| `restore-locked`     | `undo()`, `redo()`, and a DevTools jump                                                     | The root of the store fails the check of the restore                                                                             | 0030       |
| `vue-readonly`       | A write to the ref the Vue adapter returns                                                  | Always                                                                                                                           | 0038       |
| `vue-no-scope`       | The Vue `useClassyStore`                                                                    | No active effect scope                                                                                                           | 0035       |
| `solid-no-owner`     | The Solid `useClassyStore`                                                                  | No live owner                                                                                                                    | 0035       |
| `angular-no-context` | `injectClassyStore`                                                                         | No injection context and no `injector`, or a destroyed context                                                                   | 0035, 0039 |
| `lost-write`         | Development only, logged once                                                               | A field of the raw object changed without a write through the store. Facts: the field. Only if the check of record 0036 lands    | 0036       |

Not reports of the library, and logged as they are: a subscriber's error and
the rejection of an `async` subscriber (record 0014), an error that
`onError` throws (record 0021), and a status listener's error.

**The messages from before 1.0 get their codes in one commit**, early in
the work: `getter-cycle`, `not-a-store`, `vue-no-scope`, `solid-no-owner`,
`angular-no-context` and `persist-disposed`. Their text changes once. The
snapshot's `circular reference detected in snapshot` gets no code: record
0044 removes that throw before 1.0, so no user would ever see a code for
it, and the page never lists a code that 1.0 does not have. The page of
codes is created in that commit, and from then on every commit that adds a
message adds its code and its line on that page.

## Alternatives considered

### A development build with long messages and a production build without

A split saves no more on messages than a code with the names does. A
program that fails in production and not in development, or the other way
round, is worse than either.

## Consequences

- About 100 bytes of the message text belong to messages that are kept, and
  a code with the names saves them with no build split. The rest belonged to
  refusals that are not taken.
- 29 assertions in 15 test files match the text from before 1.0 and are
  rewritten to match the code. That count is from a search, not from a run.
- A user who matched on the old text has to match on the code.
