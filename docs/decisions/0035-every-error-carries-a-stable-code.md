# 0035. Every error carries a stable code, and throws the same in every build

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** diagnostics
- **Changes behaviour that 0.11 documents:** no

## Context

The changes of 1.0 add many errors and reports. Message text is where the
bytes are: of the 625 bytes the first group of changes adds to the main
entry with its messages as first written, 271 are text. 0.11 has three
messages, and tests and users match on that text.

## Decision

- An error or a logged report from the library reads
  `@codebelt/classy-store [code]: facts`, where the code is a short string
  such as `getter-cycle` and the facts are the names the user wrote.
- The advice that goes with each code is on one page of the documentation.
  The page also lists what 1.0 does not catch (record 0036).
- Codes are stable from 1.0: renaming one is a breaking change, adding one
  is not. The text after the code is unspecified.
- No error subclass and no `code` property are added.
- No check throws in one build and not in another. The bound on delivery
  rounds and the cycle check on snapshots stay in every build.
- The three messages of 0.11 get codes at the same time, so their text
  changes once. The page of codes is created then, and from then on every
  commit that adds a message adds its code and its line on that page.

## Alternatives considered

### A development build with long messages and a production build without

A split saves no more on messages than a code with the names does. A
program that fails in production and not in development, or the other way
round, is worse than either.

## Consequences

- About 100 bytes of the message text belong to messages that are kept, and
  a code with the names saves them with no build split. The rest belonged to
  refusals that are not taken.
- 29 assertions in 15 test files match the text of 0.11 and are rewritten to
  match the code. That count is from a search, not from a run.
- A user who matched on the old text has to match on the code.
