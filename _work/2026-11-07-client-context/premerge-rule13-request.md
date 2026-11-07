Bounded pre-merge review (leaf call, do not invoke other models). Project: RadHires assessment workspace, fictional recruitment agency. The human asked that a stage-and-evidence discipline become a standing agent rule. Review ONLY whether the new rule below is clear, enforceable as written, consistent with the existing rules 1-12 (summary: objective-led work; lifecycle input→questions→plan→implementation→validation→audit→review; peer review at plan/pre-merge/final; never claim unrun checks; record state), and whether it creates loopholes or contradictions. Also flag if the business-record summary misstates the human's intent. Reply in under 200 words with findings labelled material/minor and a verdict pass/fail.

NEW RULE 13:
13. Workflows are ordered stages with evidence. Define each stage's required artifact and content before starting. A stage counts as complete only when that artifact exists and passes its check, never because the model reports it is done. A stage may be skipped only when the workflow allows it for the scenario, with the reason recorded. Applies to agent work and to product harness runs.

HUMAN SOURCE:
I'm giving you more information. The recruiter calibration is part of these scopes because keeping the agency understanding of a client's roles accurate is the trigger that needs to enforce that the recruiter's calibration move with that so they understand what has changed. At the end, I'm going to elaborate a presentation, which is going to be actually the README HTML file. Let's consider, of course, this is a draft for me, so we can consider this at the end. Of course, it isn't going to be on these words, but it goes like this. I already implemented the RAC system many times, integrated with many different applications. I didn't do this on this MVP because what I want to highlight is not my technical decisions to integrate with other applications, because I already did that and it will depend actually a lot more on the application, on the It will depend more on the application, on the necessity of the project, because different roles have different different applications to handle. So that is something that is easy to learn nowadays, but what is more interesting to show is the reasoning behind that. Now answering your questions, yeah, the big one, client restrictions, yes, I agree with you that the AI must point those bias also. Now, moving to B2, scenario size, yes, that's clear. B3, agent rule, yeah, completely true.
HUMAN C5 NOTE (excerpt): each step must be checked by an artifact (questions file exists; answers present in that file); AI may skip steps depending on scenario; this must be a rule for the agents maybe.

BUSINESS RECORD DIFF:
diff --git a/knowledge/business.md b/knowledge/business.md
index 7bf6f93..36134d1 100644
--- a/knowledge/business.md
+++ b/knowledge/business.md
@@ -43,7 +43,7 @@ Use three categories across artifacts: **A — requirement interpretation** (mis
 
 ## Human answers C1–C20 (prompts/client-context/003-user.md, 2026-11-07)
 Recommended option accepted for C1, C2, C4–C18; C3 proposal accepted. Notes that change the design:
-- **C1 → primary objective is now P′:** keep the agency's understanding of a client role accurate and current as communications and company signals arrive. Recruiter calibration (former P) is deferred; the living profile may later serve as its reference. The O1–O6 map below belongs to former P and is superseded once the plan rewrites it for P′.
+- **C1 → primary objective is now P′:** keep the agency's understanding of a client role accurate and current as communications and company signals arrive. (Calibration later restored to scope; see the validation answers.) The O1–O6 map below belongs to former P and is superseded once the plan rewrites it for P′.
 - **C2:** the user is the recruiter or account manager owning the search.
 - **C5 note: staged, evidence-checked workflow.** Each update runs through ordered stages. A stage counts as complete only when its artifact exists with the required content, never on the model's word. The human's example chain: analyse what changed → generate questions (question file exists) → answer them (answers present in that file) → revalidate → human review → publish (ATS or shared channel). The human says this is an example, not the final list. Stages may be skipped only where a scenario permits. The same discipline extends the objective → secondary-objective practice to activities. The human suggested it may also become an agent rule.
 - **C6 note:** real-tenant triggers (scheduled polling of Meet/tl;dv transcripts several times a day, or a human-triggered sync) are out of scope. Keep an explicit out-of-scope register.
@@ -52,10 +52,12 @@ Recommended option accepted for C1, C2, C4–C18; C3 proposal accepted. Notes th
 - **C19 note:** two fictional clients. (1) Northwind Freight Tech (55 people, Series A) with two open roles: Senior Backend Engineer joining a built team, and a new AI Agent Engineer as the team expands its capabilities. (2) An early-stage startup hiring a Founding Engineer, its first engineer. Research public JDs for similar roles as structural samples.
 - **C20:** the human manages the deadline. No time budget. Continue.
 
-## Open validation questions (raised by Claude, unanswered)
-- **V1 (C7):** apply lawful restrictions such as universities or previous employers as stated. For criteria based on protected characteristics (age, gender, nationality and similar), record them and send them to the recruiter as a client conversation rather than an automatic filter? Recommended: yes. Rationale: in many jurisdictions these are unlawful to apply, and the agency carries that risk too. This is not legal advice.
-- **V2 (C4/C19):** scenario size with three roles. Recommended: Northwind shares company events across both roles (about 8 events, including the expansion news that opens the AI role); the startup gets about 5 events. Each role keeps its own profile.
-- **V3 (C5):** make the stage-and-evidence discipline a standing agent rule in AGENTS.md as well as product behaviour? Recommended: yes, as a short rule. It is a material instruction change, so it gets peer review at the pre-merge gate.
+## Validation answers and scope correction (prompts/client-context/005-user.md, 2026-11-07)
+- **Recruiter calibration is in scope, triggered by P′.** When the role profile changes materially, that change must drive recalibration of the recruiter, so they understand what changed and why it matters. P′ and former P form one chain: client signal → profile delta → recruiter calibration. This supersedes "calibration deferred" in the C1 note.
+- **V1 yes:** follow lawful client restrictions, and the AI must still point out possible bias. Protected-characteristic criteria are recorded and raised with the recruiter, not auto-applied as filters.
+- **V2 yes:** Northwind has about 8 events shared across its two roles, with the expansion opening the AI Agent Engineer role. The startup has about 5 events. Each role has its own profile.
+- **V3 yes:** the stage-and-evidence rule goes into AGENTS.md (rule 13).
+- **Presentation intent (draft, for the end):** readme.html becomes the human's presentation. Message: the owner has built RAG systems and app integrations many times. They are deliberately mocked here because integrations depend on each client's tools and are easy to learn. The point of this submission is the reasoning: what changed, why it matters, and how the recruiter's judgment follows. Final wording is the owner's.
 
 ## Confirmed by the human — client context (prompts/client-context/001-user.md, 2026-11-07)
 - A JD alone is insufficient. Understand the client's current state and trajectory, what the team expects of the company and what the company expects of the team, and expectations at 6/9/12/18 months, usually gathered in a kickoff.
