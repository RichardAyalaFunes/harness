# Assessment design — discovery draft

This is a placeholder for the short submission document, not a claim that the assessment is complete.

## Problem thesis
Pending business input: identify one person, a concrete recurring pain, its cost, the desired result, and why AI is suitable (including where it is not).

## End user and interface
Pending workflow discovery. Workspace HTML artifacts help the owner make development decisions; the eventual everyday-user product interface remains to be designed and tested.

## Architecture and harness
The development workspace uses shared Markdown memory, Git worktrees, explicit specifications, cross-vendor consultation, and validation/review records. The product's model loop, tools, data boundaries, recovery path, and evals are not chosen yet.

## Tooling and tradeoffs
Git plus Python standard-library helpers keep setup portable and inspectable. Main records avoid context stranded on unmerged branches, at the cost of serialized writes. HTML artifacts are offline and transparent; importing answers is a deliberate manual step. See knowledge/decisions/0001-workspace.md and knowledge/research.md.

## Reflections
Actual effort and remaining limitations will be recorded from session evidence; no duration is invented. Next: answer workspace questions, receive business scope, define one end-to-end acceptance scenario, implement the smallest real slice, and complete the full AI review.
