# Common brief for the second adversarial review of the stage 3 decisions

Read `review/stage-3/briefs/adversarial-COMMON.md` first. Its instruction,
its contract, its way of working and its report format hold for you
unchanged. This file adds what is different in the second round.

## What happened before you

Three reviewers went through the first complete draft and raised 58
objections. The document was then rewritten, three more spikes were run
(`spike-functions.md`, `spike-combos.md`, `spike-core-2.md`), and nine
entries were decided again from them. You took no part in any of it.

The last section of the document, "Objections and answers", says what the
author did about each objection. It is the author's claim, not a fact.

## Order of work

1. Read the whole document once. Then review the decisions your own brief
   names as if no review had happened: against the source, the docs and the
   reports they cite.
2. Only then open the first round's reports (`adversarial-whole.md`,
   `adversarial-core.md`, `adversarial-edges.md`) and the answers table. For
   each objection your brief assigns to you, check the answer:
   - "Changed": does the text of the entry now answer the objection, and
     does the evidence it cites show it? Did the change add a new defect or
     contradict another entry?
   - "Accepted": is the cost stated where a user would read it (the entry's
     "what it costs a user", a guarantee rule, a sentence for the docs)?
   - An answer that names a spike: does the spike's report show what the
     entry now says, and was it run or only reasoned?
3. Report an objection of the first round again only if its answer does not
   hold, and say why. Do not repeat one that is answered.

## What counts most

- A new silent failure that a rewritten entry adds.
- Two entries that cannot both be true after the rewrite.
- A number in an entry that its report does not hold.
- A behaviour change labelled "can follow 1.0" or left out of stage 4.
- Anything the three new spikes were asked and did not run.

## Stop condition

If after a thorough examination you find nothing of the kinds above in a
decision, say so in the closing list. A short report is a valid result.
