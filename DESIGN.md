# Recruiter judgment calibration — assessment design draft

Status: discovery; a working product is not yet implemented. The original RadHires brief remains the submission contract. This short document evolves as decisions and evidence arrive.

## Problem thesis
**Draft primary objective:** before a recruiter assesses candidates for a new client role, surface and help correct gaps in how they understand the client's actual needs and judge job-related evidence. A recruiting agency may have sourcing and interview processes yet still misunderstand what matters for a particular role. The owner chose this evaluator-focused problem to explore the quality of the judgment behind candidate scoring. Avoidable rework, unsuitable submissions and missed suitable people are hypotheses; no baseline/cost or measured improvement has been supplied.

Confirmed context: a fictional recruitment agency; scenario calibration before a new client role; owner reviews the fictional client/role reference. Exact client, role and report operator remain open. Sources: prompts/business-discovery/001-user.md, 003-user.md and 004-user.md. An owner-reviewed scenario is a demo reference, not proof of recruiter competence or hiring-outcome validity.

## End user and interface
Proposed users: a recruiter completes a short role-specific exercise and a lead reviews evidence-linked coaching. The lead/operator and resulting business action still need confirmation. The HTML discussion artifact shows the objective map, options, an illustrative scenario and unresolved questions. It is a low-fidelity concept, with no live grading. The everyday-user product UI must ultimately let the operator understand why a finding appeared, what is uncertain and what to do next.

## Architecture and harness
Proposed thin flow: reviewed role/reference pack → recruiter response → structured evidence checks and model critique → actionable report. Use the canonical diagnosis categories in knowledge/business.md: requirement interpretation, evidence handling and reference quality. Missing evidence alone is not recruiter error. A live model report depends on verified runtime/provider access; the person or synthetic fixture providing the demo response is still to be chosen. Technical uncertainty can lead to a qualified assessor; model output is not authority. On unavailable model/invalid output, report failure or an incomplete result; never manufacture a confident score. This is an architecture proposal, not implemented behavior or a selected stack.

Quality proposal: test the harness on an ordinary scenario, unsupported/incomplete evidence, and an ambiguous reference. Accept multiple defensible answers, link findings to specific evidence and check the model critique against a reviewed reference. A prototype demonstrates behavior on synthetic cases; live effectiveness would require further validation. O1–O6 in knowledge/business.md provide the living objective/dependency/done map.

## Tooling and tradeoffs
Development uses Git worktrees, repository memory, offline HTML artifacts and bounded Claude/Codex review at plan/pre-merge/final. This makes decisions and their sources inspectable. Scenario calibration was chosen by the human over auditing historic assessments or a live interview copilot. Synthetic cases keep the first slice controlled; they may not reflect real-world ambiguity. Real historical data, external recruiting integrations, runtime provider/API access, app framework and deployment remain undecided.

## Reflections and current limits
The thesis is intentionally narrow. We still need the fictional role, primary user/action, cost of the problem, first-case expectations, and a time budget. No claims of market novelty, production readiness or measurable recruiter improvement. Actual development time has not been tracked from the start; available session timestamps and the owner's later information must be distinguished from a measured total. Browser policy blocked local-file previews, so visual/keyboard/download verification remains pending.

## Brief coverage — update as evidence arrives
| Required item | Current evidence | Still owed |
|---|---|---|
| Specific problem thesis and cost | Human brief; draft above | Concrete role, pain baseline/cost, AI fit and limits confirmed |
| Runnable prototype repository | Git and development helpers exist | Actual end-to-end business harness and runnable setup |
| Everyday-user interface | Proposed experience; discussion HTML | Implemented UI, failure states, user inspection |
| Architecture, failure and quality | Proposed flow and three case types | Implemented components, validation/evals and actual results |
| Tooling and tradeoffs | Development choices and synthetic-first direction | Product stack/provider and reasoned alternatives |
| README: setup, real/stubbed, limitations | README and explicit pending status | Product dependencies/env/run commands, verified real/stub inventory |
| Short written design document | This evolving draft | Revise to final 1–3-page equivalent with tested facts |
| Reflections: time, next steps, uncertainty | Known gaps above | Honest total/estimate provenance, final reflections |
| Delivery: repo/design/demo as relevant | Local Git only | Owner-requested publication/submission; no external send authorized |
