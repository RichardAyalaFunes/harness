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

## Human answers C1–C20 (prompts/client-context/003-user.md, 2026-11-07)
Recommended option accepted for C1, C2, C4–C18; C3 proposal accepted. Notes that change the design:
- **C1 → primary objective is now P′:** keep the agency's understanding of a client role accurate and current as communications and company signals arrive. (Calibration later restored to scope; see the validation answers.) The O1–O6 map below belongs to former P and is superseded once the plan rewrites it for P′.
- **C2:** the user is the recruiter or account manager owning the search.
- **C5 note: staged, evidence-checked workflow.** Each update runs through ordered stages. A stage counts as complete only when its artifact exists with the required content, never on the model's word. The human's example chain: analyse what changed → generate questions (question file exists) → answer them (answers present in that file) → revalidate → human review → publish (ATS or shared channel). The human says this is an example, not the final list. Stages may be skipped only where a scenario permits. The same discipline extends the objective → secondary-objective practice to activities. The human suggested it may also become an agent rule.
- **C6 note:** real-tenant triggers (scheduled polling of Meet/tl;dv transcripts several times a day, or a human-triggered sync) are out of scope. Keep an explicit out-of-scope register.
- **C7 note:** the client's restrictions are followed even if they look biased. Flagging stays (option A). See open V1.
- **C11 note:** JSONL chosen so evaluators can read and audit the data. SQLite was rejected for this assessment because a binary file defeats auditing; production would use a real database.
- **C19 note:** two fictional clients. (1) Northwind Freight Tech (55 people, Series A) with two open roles: Senior Backend Engineer joining a built team, and a new AI Agent Engineer as the team expands its capabilities. (2) An early-stage startup hiring a Founding Engineer, its first engineer. Research public JDs for similar roles as structural samples.
- **C20:** the human manages the deadline. No time budget. Continue.

## Validation answers and scope correction (prompts/client-context/005-user.md, 2026-11-07)
- **Recruiter calibration is in scope, triggered by P′.** A change to the role profile must drive recalibration of the recruiter, so they understand what changed and why it matters. (Proposed, unconfirmed: which severity levels trigger recalibration, for example material and critical only.) P′ and former P form one chain: client signal → profile delta → recruiter calibration. This supersedes "calibration deferred" in the C1 note.
- **V1 yes:** follow lawful client restrictions, and the AI must still point out possible bias. Protected-characteristic criteria are recorded and raised with the recruiter, not auto-applied as filters.
- **V2 yes:** Northwind has about 8 events shared across its two roles, with the expansion opening the AI Agent Engineer role. The startup has about 5 events. Each role has its own profile.
- **V3 yes:** the stage-and-evidence rule goes into AGENTS.md (rule 13).
- **Presentation intent (draft, for the end):** readme.html becomes the human's presentation. Message: the owner has built RAG systems (the human wrote "RAC"; interpreted as RAG, to confirm) and app integrations many times. They omitted them from this MVP on purpose because integrations depend on each client's tools and are easy to learn. The point of this submission is the reasoning: what changed, why it matters, and how the recruiter's judgment follows. Final wording is the owner's.

## Prototype A chosen; glass visual style (prompts/client-context/017-user.md, 2026-11-08)
- The human chose prototype A (tabs inside the position: Pipeline, Role brief, Changes, Knowledge check).
- Visual direction for the product UI: light frosted-glass cards, large radii, soft blue/yellow backdrop, yellow pills for changes, large numerals, dark selected tab. Desktop, light theme. This supersedes docs/ui-style-reference.md for the product UI; designs.md is not yet updated (pending confirmation that it also applies to question/decision pages).
- Artifact: _work/2026-11-07-client-context/proto-ats-a-hifi.html; screenshots in the same folder under evidence/.

## Role information inside a mock ATS (prompts/client-context/015-user.md, 2026-11-07)
- Wrap the brief in a mock ATS: positions list, then a position with a fake candidate Kanban. Candidates and pipeline are fake and out of scope; role information and its changes are the scope.
- Bring back the version comparison table (faster to compare than prose) alongside the timeline.
- New need: evaluate whether the recruiter knows enough about the role.
- Two mid-fidelity, workflow-focused prototypes: proto-ats-a.html (tabs: Pipeline, Role brief, Changes with timeline and version table, Knowledge check with screening coverage) and proto-ats-b.html (brief beside the pipeline; Client review locked after a brief change until a short check passes; at submit the recruiter links screening notes to must-haves and gaps are shown). Choice pending.

## UI direction after reading prototypes (prompts/client-context/013-user.md, 2026-11-07)
- Base: proto-brief (current brief, changes since a chosen date). proto-story is dropped.
- The editorial look read as selling, not understanding. Wanted: plain hierarchy, tables for structure, factual headings.
- Never summarise a profile in a headline: a role is many criteria with weights, restrictions, expectations and open unknowns.
- Current artifact: _work/2026-11-07-client-context/proto-brief-v2.html. proto-story.html and proto-brief.html are superseded; palette from docs/ui-style-reference.md kept, stickers/rotations/large display type removed.

## UI feedback on prototype-hifi (prompts/client-context/011-user.md, 2026-11-07)
- Too much information in one space and too many visible stages. The UI is for learning and reading: one idea at a time, catching what the user is looking for.
- The style did not follow docs/ui-style-reference.md closely enough. Wanted: its editorial feel (large lowercase display type, generous space, handwritten-style captions, sticker accents).
- Deliver two different presentation ideas (proto-story.html, proto-brief.html). prototype-hifi.html is superseded. Rule-13 stages stay internal, not on the reading screen.

## Prototype choice and client-feedback loop (prompts/client-context/009-user.md, 2026-11-07)
- UI direction: A's timeline + B's "what we know, by version" table + the open-unknowns checklist on the right. B's search-lifecycle strip was unclear: dropped. Next artifact: high-fidelity, desktop-only, in the docs/ui-style-reference.md style (prototype-hifi.html).
- Client decisions (reject, or advance a candidate) are the strongest feedback. A rejection need not create a new profile version when criteria did not change. It still produces a learning signal: what our screening must verify next time.
- In scope: refining screening via a rubric of what to verify, and teaching recruiters to be field experts. Out of scope: validating or scoring candidates, and generating screening scripts. The rubric and candidate questions do not need to be exposed; the focus is recruiter learning.
- Open: option for the feedback loop (F1–F3, offered in chat 010).

## Interview stage and prototypes (prompts/client-context/007-user.md, 2026-11-07)
- RAG confirmed (not "RAC").
- The chain continues into interviews: screening, cultural-fit and similar sessions (simulated) produce transcripts of questions and answers. The harness evaluates each question's context and objective, and the rubric itself, against the current client need: are we asking what matters to this client now?
- Recalibration trigger threshold: still unanswered. Default: every profile change.
- Prototypes: three low-fidelity, desktop-only, workflow-focused wireframes (no shadows, animation or responsiveness). Show navigation, how the user sees what changed between profile versions, pending questions for the client, asking questions, and teaching the recruiter what changed. Artifact: _work/2026-11-07-client-context/prototypes.html.

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
