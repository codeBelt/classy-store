# Brief: behaviour that tests pin and the docs do not promise

- **Report:** `review/stage-3/pinned.md`
- **Scratch folder:** `<scratch>/stage-3-pinned/`
- **Skill to load first:** `api-and-interface-design`
- **Spikes:** none.

## The job

Stage 3 step 5 in `REVIEW_PLAN.md`. Stage 1 added about 550 tests that pin
what the library does today, including behaviour nobody decided on:
notification order across owners, for example. Unless each is labelled, the
tests make every incidental behaviour part of the 1.0 contract.

1. Read the tests stage 1 added. `review/stage-1-report.md` lists the files
   under "Characterisation tests", "Fuzz test" and "Type tests", and its
   findings name the test that pins each one.
2. For every pinned behaviour, find whether
   `website/content/docs/` promises it (`API_REFERENCE.md`,
   `ARCHITECTURE.md` and the guides). Quote the sentence and file if it does.
3. For each behaviour the docs do not promise, recommend **guaranteed** (it
   will be documented, and changing it is a breaking change) or
   **unspecified** (it may change in a minor release), with one line of
   reasoning: would a reasonable user come to depend on it?
4. Mark the behaviours that are defects, by stage 1 finding number. They are
   pinned only so a fix shows up as a changed test; do not label those.
5. Where the docs promise something no test checks, list it.

## What the report holds

One table grouped by area (notifications, transactions, getters, snapshots,
identity, ownership and memory, collections, persist, history, devtools,
types), with columns: behaviour, test file and name, documented or not,
recommendation, reason. Then the list for point 5.

Keep each row to one line. The orchestrating agent copies this table into the
decision document.
