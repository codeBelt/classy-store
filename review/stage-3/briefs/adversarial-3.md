# Third adversarial brief: what changed since the second round

- **Report:** `review/stage-3/adversarial-3.md`
- **Scratch folder:** `<scratch>/stage-3-adversarial-3/`

Read `review/stage-3/briefs/adversarial-COMMON.md` first. Its instruction,
its contract, its way of working and its report format hold for you
unchanged. This is the third and last round. You took no part in the work or
in the earlier rounds.

## What happened before you

Two rounds of review raised 58 and then 30 objections against
`review/stage-3-decisions.md`. After each, entries were decided again, some
from new spikes. The section "Objections and answers" at the end of the
document has one table per round. It is the author's claim, not a fact.

## Your subject

The entries that were decided again after the second round, and the answers
to that round:

- **Decision 1**, the rule for functions, with 11, 27 and 29, and guarantee
  rules 2 and 6. Evidence: `spike-functions-2.md`, and `spike-functions.md`
  for the form that was dropped.
- **Decision 10**, a getter that writes, with rule 4. Evidence:
  `spike-core-3.md`, G1, and `spike-core-2.md`, F4.
- **Decision 12**, the table per prototype. Evidence: `spike-core-3.md`, G2,
  and `spike-core-2.md`, F2.
- **Decision 30**, the restore in place. Evidence: `spike-core-3.md`, G3, and
  `spike-combos.md`, K1 and its addendum.
- **Decisions 21 to 24** and rule 10, the `persist` rules. They were decided
  from the second review and no spike built them. Evidence:
  `persist-devtools.md`, P2 to P5, and `adversarial-2-whole.md`, objections
  1, 2, 6 and 11.
- **Decision 4**, the ceilings and the tooling that holds them, **decision
  36**, the lost-write check, and **"The order for stage 4"**.

## Order of work

1. Read the whole document once. Then review the entries above as if no
   review had happened: against the source in `packages/classy-store/src/`,
   the docs in `website/content/docs/`, and the reports they cite.
2. Only then open `adversarial-2-core.md` and `adversarial-2-whole.md` and
   the second table of "Objections and answers". For each of the 30
   objections, check the answer as `adversarial-2-COMMON.md` describes:
   does the entry's text now answer it, does the evidence show it, and did
   the change add a defect or contradict another entry?
3. Report an earlier objection again only if its answer does not hold.

## Look hardest at these

- **Decision 1.** Try to break the rule as it is now written. For every
  function a store can hold, say what a read through the store gives, what
  the object and a snapshot hold, and whether any of it is a silent failure
  that today's library does not have. Check each row the entry or its report
  claims against the report's tables, and run the ones you doubt.
- **The `persist` rules.** Walk a user through: a first install, an upgrade
  with a `migrate`, a `migrate` with a bug, a rollback of a deployment, two
  tabs on different versions with and without `syncTabs`, a record that
  expired, and `clear()`. Is there a path on which stored data is lost that
  the entries do not name, or a path on which the handle never saves again
  and nothing tells the application?
- **What was decided and never built.** List every statement in the entries
  above that no report ran. For each, is it marked as such, and does stage 4
  have a test to write first?
- **Consistency.** The index, the guarantee rules, the "unspecified" list,
  "not taken" and the order for stage 4 against the entries as they now
  read. The bytes of decision 4's tables against the reports.

## Stop condition

If after a thorough examination you find nothing of these kinds in an entry,
say so in the closing list. A short report is a valid result.
