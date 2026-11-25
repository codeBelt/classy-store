# Brief: the decision records

- **You write:** files under `docs/decisions/`, and nothing else. The folder
  does not exist yet.
- **Scratch folder:** `<scratch>/stage-3-step7-records/`

One decision record per decision of `review/stage-3-decisions.md`, 46 in
all, plus an index. These files are kept in the repository for good; the
decision document and every report under `review/` are deleted when the work
ends. So each record must stand on its own (see the common brief).

## Files

- `docs/decisions/README.md`: what the folder is, how a record is named and
  numbered, the life of a record (accepted, superseded by another record),
  the rule of `CONSTRAINTS.md` that a number there moves only together with
  a record, and a table of all records: number, title, kind, label.
- `docs/decisions/NNNN-short-title.md`, four digits, the same number as the
  decision (`0001` to `0046`), the title in lower case with hyphens.

## Each record

```markdown
# NNNN. Title as a statement

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug | simplification | public API | diagnostics | performance | repository | constraint
- **Changes behaviour that 0.11 documents:** yes | no

## Context

What the library did, shown by a short example where one helps, and why
that was a problem. In words; no finding numbers.

## Decision

What 1.0 does. Exact enough that a reader could check the code against it.

## Alternatives considered

One sub-heading per alternative the decision document names under "Not
taken", with why it was not taken. Include the alternatives listed for this
decision in "Proposed in a report and not taken".

## Consequences

What changes for a user, what it costs (bytes, time, a behaviour given up),
what stays unverified, and what would make this decision worth opening
again.
```

## Rules for the content

- The record of decision 4 is the one `CONSTRAINTS.md` will point to for
  every size budget. It carries the table of ceilings, the table of the main
  entry change by change, how a budget moves, and an empty section
  "Measured in stage 4" with the columns commit, entry, measured bytes, new
  budget. Stage 4 adds a line there with each commit that grows an entry.
- A decision whose answer is "no change" (17, 18, 26, 40, 41 and 46) gets a
  record too. Its value is that the question is not opened again without a
  new reason.
- Numbers are copied from the decision document: bytes, timings, test
  counts. Say what was measured and on which engine. Where the document says
  "not run" or "not verified", the record says so under Consequences.
- Do not name the review, its stages, the spikes or the agents. "A
  prototype was built and measured" is enough where the origin matters.
- Keep each record short: most fit in 40 to 80 lines.
