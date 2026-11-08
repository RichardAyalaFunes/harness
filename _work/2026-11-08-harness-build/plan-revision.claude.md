# Plan revision after Codex plan review (plan-review-2.codex.md, verdict FAIL)

Disposition of each finding; these rules amend plan.claude.md and win where they differ.

1. **Recruiter completion is evidence-based (accepted).** Table `completions(recruiter_id, role_id, version, item_id, kind, response, created_at)`. Check per kind: `ack` = row exists for that item and version; `study` = response is non-empty (≥20 chars) and the item is linked to a change of type new must-have or level; `review` = review row has `accepted_by` and at least one accepted reference item or an explicit "none needed" with reason. A recruiter is "up to date" on version v only when every learning item of v (and of client decisions after v) has a passing completion. Assignments alone count for nothing.
2. **Approval gates publication (accepted).** Version states: `proposed → approved | rejected`. Only approved versions become current, create learning items and assignments, or count for "up to date". Rejected: the proposal is kept for audit; fields stay as before. Edit = reject + new proposal with the lead's correction recorded as a manual source (channel `manual-correction`). Re-analysis of an unchanged source is a no-op. Demo: the seed approves proposals through recorded `approvals` rows (actor "lead (seed)"); the UI shows proposed items and an Approve button.
3. **No gate on candidate movement (accepted).** Pipeline moves never read learning or verify data. "What to verify in screenings" is informational only. A test asserts that moves succeed with incomplete learning. The earlier "enforced when submitting" wording is superseded.
4. **Client decisions (accepted).** A client-decision source names the candidate. The harness finds that candidate's screening transcript(s) for the role. If there are several, use the latest before the decision date. The review compares against the brief version current at the screening date. With no transcript the result is `insufficient_evidence` (visible, item still created: "add screening notes"), never a pass. The lead or the screening recruiter accepts the review.
5. **Version semantics (accepted).**
   - Canonical fields: company.direction, company.team, req.<slug> (weight must/trainable/nice/proposed), restriction.<slug> (applied / not_applied_bias / pending), expect.6m/12m/18m, offer.level, offer.budget, offer.start, offer.location, offer.equity.
   - One source creates at most one proposal. It bundles all its changes, and the highest severity decides.
   - Severity rules: any must-have add/remove/weight change, level, budget, location, restriction = material; wording-only = minor (recorded, no version); news context = minor unless the model cites a criterion change.
   - A repeated value equal to the current one is "no change".
   - A contradiction with the current approved value is still a proposal, flagged `conflicts_with` the earlier source.
   - A client decision that states a new criterion produces a proposal like any other source. "check design depth before sending" is recorded as `req.system-design` weight `proposed` (pending client confirmation), not must-have.
   - Changed hash on re-ingest: the source is marked `superseded`, a new source row is created, and its stages rerun. Earlier proposals keep their original hash.
   - Reruns are idempotent per (source hash, stage).
6. **Stub replay honesty (accepted).** Replay fixtures include negative cases under `harness/test/fixtures/`: malformed JSON, unknown field, non-verbatim quote, out-of-enum severity, no-change result, truncated source, conflicting claim. Each must be rejected or handled by a check. Demo and README say the replay proves orchestration and checks, not extraction quality.
7. **Quote evidence (accepted).** Normalise line endings to \n and strip front-matter before hashing the body used for model context. Each quote is stored with `start,end` offsets into that body. The check requires `body.slice(start,end) === quote`. If offsets are missing or wrong but the text appears exactly once, the offsets are recomputed. Text that appears more than once without offsets fails as ambiguous. Quotes beyond the truncation point fail.
8. **node:sqlite spike first (accepted).** Before building, a spike script checks on Node 24.12: open, migrations, transactions, prepared statements and the warning output. Decision point: if it fails, use better-sqlite3 and document the native-build requirement.

Added tests: every item in the review's "Missing tests" list becomes a `node --test` case. The bias tests cover the age (protected) case, the university (proxy) case, and a lawful partner no-poach rule that must not be flagged.

New mock fact covering bias: Kestrel's 27 Oct email asks for "under 35" (age, protected). It is not applied, and the recruiter must raise it.

## Revision 2 (after plan-rereview.codex.md: 1 high, 1 medium)

9. **Historical brief for screening reviews (accepted).** Stage 6 artifact: `screening_reviews(source_id, screening_source_id, brief_version_at_screening, must_have_snapshot_json, coverage_json, status, purpose)`. Acceptance check: coverage lists every must-have of `brief_version_at_screening` (not the current brief). A must-have added after the screening is listed as `not_applicable_historical`, never as a gap. `purpose` is `retrospective` (coaching on that screening) and the suggested items are marked `future_screenings`. This replaces "coverage for every current must-have" in plan.claude.md stage 6.
10. **Approval of review items (accepted).** Client-decision review items have their own state `proposed → approved | rejected`, recorded in `approvals` (target_type `review`). They publish only when approved: approval creates assignments and the items count toward "up to date". A rejected item is kept for audit, creates no assignment, does not affect "up to date", and shows "rejected" in the UI. If the decision also produces a brief proposal, the two are approved separately.
11. **Deterministic matching (accepted).**
    - A decision attaches only to screenings with the same role_id and candidate name.
    - Only screenings dated on or before the decision date count. With several, take the latest date, then the latest ingest order.
    - If none qualify, the result is `insufficient_evidence`.
    - If the role is missing or mismatched, the decision is rejected at stage 1 with a visible error.
12. **Lawful restrictions (accepted).** An approved applied restriction (no-poach) is shown in the brief only. It never scores candidates or gates the pipeline; a test asserts this.

Added tests: v1-screening/v2-later-must-have case; decision with no version (approve, reject, visibility); decision dated before all transcripts; same-date transcripts; role mismatch.


## Gate result
Plan gate: PASS on third Codex pass (plan-review3.codex.md, gpt-5.6-terra). Earlier FAILs (plan-review-2, plan-rereview) resolved by plan-revision.claude.md. First attempt plan-review.codex.md failed to run (model id gpt-6.1-terra not available to this account; used gpt-5.6-terra, the Terra model in the Codex model list).
