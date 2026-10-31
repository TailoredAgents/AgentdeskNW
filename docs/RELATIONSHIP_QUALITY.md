# Relationship specialist quality — first milestone

The first two stages of [the depth plan](RELATIONSHIP_SPECIALIST_PLAN.md) are implemented: an executable quality baseline and a stronger investor record. This is an engineering checkpoint for a fictional demonstration, not proof of expert-level reasoning, New Western endorsement, higher sales or retention.

## Results — October 30, 2026

| Run | Cases passed | Checks passed | Meaning |
| --- | --- | --- | --- |
| Original application at `89f8c57`, development cases | 8 / 24 | 14 / 36 | Existing freeform observations lacked the new structured representation |
| Updated application, same development cases | 24 / 24 | 36 / 36 | Required record behavior implemented |
| Updated application, reserved variations | 12 / 12 | 18 / 18 | Same behaviors also passed on the third fictional investor |

Twelve behavior families cover differing budgets/timing, separate buy boxes, explicit corrections, older statements entered later, unknown dates, reconfirmation, source traceability, pauses, objections, commitments and private scope. Twenty-four cases use Mike/Sarah; twelve reserved variations use David. The reserved variations were first run after the implementation passed development cases and the production build. No subsequent behavioral changes were made in response to their results.

The old system receives the same statements through its original observation interface. The updated system also receives explicit topic, value, buy-box scope and correction fields. That representation advantage is part of the product change. This is **not an equal-context generic-model comparison**. Reserved cases are authored variants of the same families, not independently authored, blinded or broad adversarial evaluation. There is no model call in this benchmark. Passing it does not establish nuanced judgment, natural writing or real customer effectiveness.

Checked-in JSON files under `docs/evaluations/` retain case inputs, expected outcomes and individual pass/fail checks. Full synthetic output snapshots remain local under ignored `artifacts/relationship/`. The runner generates full reports; updated reports record the parent revision, an uncommitted-source flag and an implementation fingerprint, so the parent revision is not mistaken for the changed implementation.

## Reproduce

Run `npm run test:relationship-quality` for development cases, add `-- --reserved` for reserved variations, or `-- --all` for all 36. Each case uses a fresh in-memory database, a blank model key and a fetch implementation that rejects network access. The runner never loads the active local database. A failed updated check returns a failing exit status. `--output=path.json` chooses the full result destination.

The recorded baseline was run in a disposable archive of `89f8c57`, with only the benchmark runner/cases and its imported relationship-record service/contracts overlaid. The baseline branch never calls that new service; original fixture, observation, journey and recommendation implementations remain from the archived revision. Set `RELATIONSHIP_BASELINE_REVISION` to the archived revision and pass `--baseline` there. Running `--baseline` on a newer checkout measures that checkout's observation interface; it does not reproduce the historical application by itself.

## Broader verification

Typecheck, lint, production build and **459 tests in 24 files** passed. Compiled acceptance passed **648 HTTP checks**: 42 new relationship-record, plus the existing 606 across workflows, intelligence, conversation, wallet, inbox, communications, company email, hosted demo and mocked messaging. New tests cover immutable correction lineage, tenant/role/sharing checks, entitlement rechecks, exact replay, changed-payload/stale-context rejection, compound-field provenance, unchanged canonical criteria, inbox review invalidation, and model-context invalidation for cross-office shared investors and in-flight changes. No real message, provider operation or wallet debit was performed.

A disposable copy of the active schema-009 database was upgraded using the prior revision to schema 18, populated with current company correspondence and a saved draft, then upgraded to 19. **All 220 prior rows across 74 tables were preserved byte-for-byte** before exercising the new service. The saved draft and report retry survived; SQLite integrity was `ok`; the active database remained unchanged.

Browser acceptance covered desktop 1280×720 and phone 390×844: enter/review/save a dated budget report, compare the two budgets and their source dates, see the clarification recommendation, correct the report on phone, retain the superseded original, and retrieve only the active budget in typed Copilot. No document horizontal overflow or browser warning/error logs were observed. Date entry was verified through the native date control, including its exact review value. Screenshots are local under `artifacts/relationship/`.

## Original checkpoint follow-up (historical)

Proceed to stage 3: versioned, source-backed methods for qualification, objections, reactivation and follow-through. Use clearly provisional methods until New Western supplies approved procedures. Then evaluate richer next-action judgment and communication quality using varied cases, equal-context generic-model comparisons and independent employee review. Track factual correctness, useful next actions, edits required, task completion, latency and cost before making effectiveness claims. Live company connections and Slack/Twilio account acceptance remain separate work.


## Current Phase 2 continuation

The versioned relationship methods, conditional shortlist/qualification decisions and current-correspondence interpretation are now implemented; current evidence is in PROGRESS and the canonical roadmap. The all-specialist evaluation pack and reporting contract are documented in [AI_EMPLOYEES](AI_EMPLOYEES.md#repeatable-model-quality-evaluation). Its 32 authored cases have **not** been run against live models or independently graded. They do not supersede the historical record benchmark above or establish competitive superiority. Actual repeated equal-context model comparison, correction effort and practitioner acceptance remain deferred.
