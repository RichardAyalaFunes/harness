# Business context

Status: initial human brief received; product boundary pending discussion.
Source: prompts/business-discovery/001-user.md, 2026-11-07.

## Confirmed by the human
- Cross-vendor review cadence: plan, pre-merge and final. Raw source: prompts/business-discovery/001-user.md; accepted operating decision: knowledge/decisions/0002-review-cadence.md.
- Simulate a recruitment agency placing people into client companies' roles.
- Surrounding workflow: sourcing (inbound/outbound), assessment, contact, interviews, reassessment, possible further interviews, presentation to client.
- The assessment product should focus on whether recruiters understand the client/company/role and evaluate candidates appropriately, rather than implementing the surrounding sourcing/contact/placement workflow.
- Recruiters may lack technical judgment. A profile looking good on paper is not sufficient evidence. Consider how their judgment develops after interviews.
- Explore scenario questions to recruiters and discuss the approach before implementation.
- The human wants to demonstrate a thoughtful alternative to a conventional candidate-scoring/sourcing demo. Novelty or market uniqueness has not been established.
- First setting confirmed: before a recruiter starts assessing candidates for a new client role, through scenario calibration. The human will review a fictional client/role and its intended reference judgment. Source: prompts/business-discovery/003-user.md.
- Operating practice confirmed: macro primary objective → secondary objectives → dependencies and done criteria; evolve this map through fast MVP/prototype feedback rather than a fixed roadmap or Scrum ceremony. Draft assessment deliverables continuously and retain their sources. Source: prompts/business-discovery/004-user.md.

## Proposed thesis — not an accepted product scope
Help a recruiting lead surface and coach role-specific judgment gaps before client submission. A recruiter interprets a reference role brief, evaluates synthetic evidence, chooses what to verify next, and revises conclusions as evidence changes. A report separates misunderstood requirements, unsupported inferences, missing evidence and ambiguous client expectations. Do not label it a validated test of recruiter competence or of hiring success.

## Living objective map — proposed wording, awaiting human refinement
**Primary objective (P):** before a recruiter assesses people for a new client role, surface and help correct gaps in how that recruiter understands the client's actual needs and judges job-related evidence.

Business hypotheses: this could avoid weak submissions, missed suitable people and repeated clarification/rework. The human has not yet supplied a baseline, frequency, cost or real outcome evidence; do not state these benefits as measured results.

| ID | Secondary objective | Depends on | Observable done criterion |
|---|---|---|---|
| O1 | Define enough fictional agency/client/role context to explain success | Human case choice | Business outcome, responsibilities, must-have vs. trainable criteria, observable work behaviors, assessor limits and unknowns are recorded; owner reviews the fictional reference |
| O2 | Create one role-specific case first, then the small validation set | O1 | Every case used in O5 has an owner-reviewed reference, cited evidence, acceptable alternatives and clarification behavior; begin with one case and add variants while iterating |
| O3 | Elicit recruiter judgment, evidence gaps and next verification step | Minimum O2 case; E2 demo respondent identified | The named demo respondent or explicit synthetic fixture supplies an assessment with evidence and uncertainty; a later reveal can test revision if chosen |
| O4 | Return an actionable diagnosis | O2 + O3; E1 for a working model report | Report cites evidence, uses categories A/B/C, permits no issue/needs clarification, and offers a next action; static mock and model output are distinguished |
| O5 | Demonstrate that the harness behaves as intended on reviewed cases | Thin O3→O4 flow; E1; all O2 fixture references reviewed | Ordinary, insufficient-evidence and ambiguous-reference cases follow their references; variants cover valid alternate answers, conflicting evidence and instruction-like input; model errors are visible and results recorded |
| O6 | Learn quickly and integrate only supported behavior | First useful prototype; later O5 + peer pre-merge review | Owner inspects the first result, changes are recorded, tests cover accepted behavior, material findings are resolved before integration |

These are evolving objectives, not a commitment to six features. Begin with one O1/O2 case and prototype O3/O4 early. Do not wait for a complete company handbook. Add O5 edge cases as the loop takes shape. A static HTML concept is discussion evidence, not a working model harness. Synthetic fixture success demonstrates the implementation against the fictional reference, not recruiter competence or hiring success.

Every new request names P/O1–O6, why it helps, its current dependency and its done evidence. If the request does not help P, discuss whether P should change or the request should wait.

## Canonical diagnosis taxonomy — draft for the first experiment
Use three categories across artifacts: **A — requirement interpretation** (misreading an explicit job need); **B — evidence handling** (unsupported inference, missing/conflicting evidence, or a poor verification step); **C — reference quality** (ambiguous, incomplete or faulty client brief/reference). Cases can involve more than one. Missing evidence is not itself recruiter failure; the report examines how it was handled. Record a disposition such as no issue, needs clarification, or unresolved rather than forcing a negative finding. Appropriate escalation and justified disagreement are positive behaviors, not extra fault categories.

## Runtime and respondent prerequisites
**E1 (open):** select and verify runtime/provider access and run configuration before claiming a working model critique or running O5 live-harness checks. Development CLI authentication does not establish API access. **E2 (open):** identify who supplies the demo's recruiter response; owner role-play or pre-authored synthetic responses are options, not actual recruiters who have been assessed. These do not block a clearly labelled static concept.

## Confirmed by the human — client context (prompts/client-context/001-user.md, 2026-11-07)
- A JD alone is insufficient. Understand the client's current state and trajectory, what the team expects of the company and what the company expects of the team, and expectations at 6/9/12/18 months, usually gathered in a kickoff.
- Clients are small to medium companies with at most about 80–100 people.
- Every message or meeting is re-analysed for its effect on the current role understanding. Changes vary in size and can shift budget, necessity and importance.
- Client restrictions (for example universities or previous employers) must be captured.
- Communications (email, calendar, transcripts, Slack/Teams, Notion) and client intel (news, funding, review sites, forums, social, hiring) are simulated with mock data in a folder.
- Relevance beats volume. Standing rule: do not overfill the model context window.
- A simulated ATS/CRM stores results. In production: raw files in a bucket, knowledge in a database with RAG embeddings. For this assessment, local files (JSONL/JSON/CSV under discussion) are acceptable.
- The AI reaches data through CLI or Node.js tools it can start. Setup after cloning should be minimal (for example pnpm install/start). No production deploy.
- Open: C1–C20 in _work/2026-11-07-client-context/questions.html, including whether the living role understanding (proposed P′) replaces or feeds the recruiter-calibration objective P.

## Critical open questions
Primary operator and report audience/action; fictional client/company/role focus; exact costly judgment error; representative scenario; how to challenge the owner-reviewed fictional reference; shape of recruiter input/output; success criterion; time/budget. Training timing and initial fictional reference reviewer are already answered; do not ask them again.

## Proposed boundaries
For the first slice: one role, a small synthetic scenario set, a declared draft reference reviewed by the business owner, structured evidence and feedback. Recruiter training/calibration only; no ranking of real candidates, autonomous hiring actions, or claims of validated job-performance prediction. These are design proposals to discuss, not limits the human has already approved.
