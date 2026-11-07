# Recruiter judgment — discovery synthesis

Status: proposals and open questions, not an approved product specification.
Update: the human selected scenario calibration before a new client role and will review the fictional reference (prompts/business-discovery/003-user.md). This resolves the timing/mode and initial reference-owner questions; remaining product choices below are proposals. The objective map in business.md is canonical.
Human source: prompts/business-discovery/001-user.md. Peer: _work/2026-11-07-business-discovery/plan-review.claude.md.

## Business thesis to test
Before a recruiter evaluates people for a client role, can the lead see whether that recruiter understands the job, uses relevant evidence, identifies uncertainty and asks useful verification questions? After an interview, can the lead see whether the recruiter updates the judgment for a sound reason?

The distinguishing angle is assessment of the evaluator's job-specific judgment. This is a positioning proposal relative to conventional sourcing/scoring workflows, not a substantiated claim that no comparable product exists. Discovery still owes who feels the pain, current workaround, frequency/cost, and an actionable desired report.

## Alternatives
| Approach | Benefit | Cost / failure mode |
|---|---|---|
| Synthetic role-specific calibration exercise (recommended first slice) | Controlled evidence, deliberate traps, no real candidate data needed | Tests behavior on simulations, not proven live recruiting competence |
| Audit historic recruiter assessments | Closer to actual decisions and interview evidence | Needs permission, redaction, valid reference judgments; historical outcomes may be biased or incomplete |
| Live assessment copilot | Immediate value during a real search | Scope expands and can drift into candidate scoring; harder to isolate recruiter learning |

## Reference quality comes first
For a real deployment, use a client-approved role brief with job-related criteria and observable examples; a qualified subject expert and recruiting lead should review technical/reference answers. For this fictional first demo, the human owner will review the intended reference; this is owner-reviewed simulation content, not expert-validated recruitment measurement. Disagreements become acceptable ranges or clarification tasks. Seniority, client preference and two-model agreement are not objective truth. Even the client brief can be wrong or underspecified. Model-generated references remain drafts until reviewed.

Use the three canonical categories in business.md: A requirement interpretation, B evidence handling, C reference quality. Missing/conflicting evidence and unsupported inference are evidence-handling sub-tags; appropriate escalation is a positive behavior, not an error. Avoid an overall recruiter ranking or a hiring pass threshold in the first proposal. Show per-case findings with citations and an actionable next practice step. A single case cannot establish statistical calibration or predictive validity.

## Possible evidence dimensions — unapproved
Role interpretation; distinction between claim and observed evidence; handling missing information; relevance of next question; willingness to seek technical assessment; reasoned revision when new evidence arrives. Confidence is reported by the recruiter, not inferred from writing fluency. Do not penalize concise writing, language style or a defensible alternate answer. Culture fit needs concrete job-related behaviors, not similarity or personal traits.

## Illustrative case, not a real role or benchmark
A fictional client requires independent production-incident investigation; framework preference is trainable. A polished résumé names the preferred framework, but contains no incident ownership evidence. Initial sound action: mark incident experience unverified and ask for a specific incident/accountability example, rather than equating keywords with competence or missing evidence with incapability. The second-round source is an interviewer note documenting a probed, specific incident account (actions, alternatives and result) in another framework. It is still a candidate self-report recorded by the interviewer, not independently verified proof. The recruiter may revise the assessment provisionally while requesting technical verification; this and other defensible interpretations must be accepted by the draft reference. A job expert would judge the technical example; the recruiter should identify the need for that expert when necessary.

Multiple defensible next questions exist. A second scenario should deliberately omit the true priority in the client brief; the desired action is client clarification, and the harness should not blame the recruiter for an ambiguous reference. This tests the benchmark as well as the recruiter. No fabricated numerical improvement or pass threshold.

## Primary research and limits
Checked 2026-11-07:
- [OPM structured interviews](https://www.opm.gov/policy-data-oversight/assessment-and-selection/other-assessment-methods/structured-interviews/) describes structured questions tied to job competencies and consistent evaluation. [OPM guide](https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/guide/) discusses subject-expert involvement and behavioral examples. These support a structured, job-linked reference; they do not validate this proposed recruiter exercise.
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) discusses evaluator design, ambiguous task specifications and combining checks. Applied here as an engineering analogy: test the AI evaluator with reviewed cases and separate final results from traces. It is not evidence of psychometric validity for recruiters.

## Proposed harness loop — subject to scope answers
Versioned role/reference pack → recruiter response with cited evidence and confidence → structured extraction/validation → reference-aware critique → evidence-linked coaching report; abstain on ambiguous reference or unavailable evidence. Use simple deterministic completeness/provenance checks alongside an LLM critique. An independent reviewed case set evaluates the critique itself, including alternate valid responses, unsupported conclusions and prompt injection. Any missing or failed model step must be visible, not replaced with a confident score. No integration or runtime provider has been chosen.
