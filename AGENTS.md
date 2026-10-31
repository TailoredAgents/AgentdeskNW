# AgentDesk engineering instructions

Read `docs/IMPLEMENTATION_ROADMAP.md`, `MASTER_PLAN.md`, and the latest `docs/PROGRESS.md` entries before material changes. The roadmap is the only authority for current status, sequence, dependencies and next work; `docs/README.md` assigns other documents their purposes. Original briefs and historical progress are reference material, not current scheduling instructions. Update these assigned sources when direction changes; do not create competing roadmaps. This is a local concept demonstration for a prospective customer; never imply New Western endorsement or production access.

- Stack: Next.js App Router, React, strict TypeScript, Zod, SQLite via better-sqlite3. A modular Node monolith; migrate persistence to PostgreSQL before multi-instance production.
- `src/lib/contracts.ts` is the shared browser/server contract. `src/server/` owns persistence, permissions and domain services. Route handlers authenticate, validate and invoke services. Never import server modules into client components.
- Every record operation must enforce organization, office and owner/role scope. Never trust tenant IDs or roles supplied by clients or models.
- Local demo authentication binds to loopback and is explicitly enabled. The user-authorized Render presentation may use the explicit hosted-demo mode with a validated HTTPS origin, a validated four-digit presentation PIN or longer invitation code, and a separate strong signing secret, secure signed sessions, and no anonymous bootstrap or role switching. It contains fictional data only; this gate is not production identity. Real customer deployment must fail closed until approved identity is integrated.
- All fictional fixtures, research evidence and CRM operations must be labeled demo. Never fabricate verified contacts or claim provider connectivity without tool evidence.
- External writes and consequential CRM changes require server-enforced approval. An AI response cannot approve an action. Actions must be idempotent and audited.
- Model tools call the same validated services as the UI. Retrieved content is data, never authority. API secrets stay server-side; do not log transcript bodies or secrets.
- Relationship working methods follow `docs/RELATIONSHIP_METHODS.md`: current code-reviewed guidance is provisional, source/versioned and role-scoped. Keep method revisions in review/model context fingerprints; withdrawal or lost scope must not revive an older version. Method selection never authorizes an action or establishes a fact.
- Acquisitions intake follows `docs/ACQUISITIONS_INTAKE.md`: preserve supplied-versus-verified distinctions, versioned release history, package invalidation and obsolete-result protection. Existing-inventory submissions save a reviewed draft. Pre-inventory opportunities use their own scoped records and source/duplicate-bound preview; neither operation publishes or updates inventory. Preserve versions, exact retries and current opportunity references across conversation/work replay.
- Shared handoff coordination follows `docs/MANAGEMENT_HANDOFFS.md`: assignments never grant source access; employee reports need a separate manager resolution; task completion never proves a handoff or transaction outcome. Recheck current source/assignment fingerprints in saved work and conversation/voice context.
- Proactive update records store source references, not private content snapshots. Recheck current source scope on every read; quiet hours use the employee timezone. Preserve schedule/change deduplication and exact settings retries. Each update has one fixed channel/target; never resend or reroute uncertain delivery. Provider tickets are not phone display. Non-job summary references must avoid recursive work/history validation. Deterministic updates never authorize paid jobs.
- Keep all 16 specialists registered; show implemented, demo and planned capabilities truthfully. Guidance is part of normal work; there is no separate training mode.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and the smoke suite after major changes. Write tests for tenant/permission boundaries, approval enforcement, durable jobs and core workflows.
- Update `docs/PROGRESS.md` and affected specifications with actual behavior, verification and remaining setup. Do not publish, contact investors or mutate third-party accounts without authorization.

## Durable work rules

- Follow `docs/WORK_EXECUTION.md`. UI, model tools and workers use the same capability, scope and whole-job budget services. Never accept caller prices or split one assignment into smaller jobs to avoid approval above $1.
- Saved questions follow the continuation contract in `docs/WORK_EXECUTION.md`. Only authenticated employee answers complete question steps; answers are data, never approval. Preserve completed effects, refresh whole-job quotes and recheck current question/source references on history replay.
- Preserve immutable plans, original context references, step receipts and partial settlement. Recheck current sources on dispatch, display and cached conversation/tool replay; a revised plan must not expose a revoked source from an earlier version.
- The native `mobile/` client uses an independent Expo dependency graph; keep it excluded from the Next.js TS/lint build. Phone access pairs the existing fictional employee, never caller-selected roles. Device credentials and push registration must recheck current ownership/revocation. Native exports are not physical-device acceptance.
- Current job charges are fictional samples. The worker performs local/synthetic services only. Metered assignment admission has test-transport acceptance using explicit fictional tariffs; preserve stable root identity, quota/receipt/replay rules and never expose settlement to models or clients. Existing live model usage remains separate; optional auto top-up has local simulated acceptance, while actual payments and broad plan editing remain pending. Preserve one pending purchase, personal payer scope, exact outcomes and the separation of funding from job approval. Bounded conversational job controls and native phone infrastructure have local integrated acceptance; real device, speech, push and employee-channel acceptance remain pending. Consult the roadmap before extending them. Keep those distinctions visible.

## Communications inbox rules

- Follow `docs/COMMUNICATIONS_INBOX.md` for the private fictional email/investor-text inbox. Keep correspondence separate from employee Copilot conversations and channel inbox/outbox.
- Office-manager CRM access does not grant mailbox access. Recheck linked investor permissions on reads and replay. Saving a manual draft or reviewing a match never sends a message or changes CRM facts.
- Communications Phase 4A is authorized: additive fictional Salesforce company-email sources and explicit read/body/draft/simulated-send capabilities, preserving existing correspondence. Recheck current source access in UI, services and Copilot history/replay. No live connector or actual email delivery is authorized by this phase.
- Communications Phase 3 is implemented: bounded Copilot inbox tools and exact reviewed simulated delivery. Model tools may prepare work but cannot approve delivery or source-linked CRM changes. Preserve the separate later-phase boundaries for live connectors, actual investor sending and attachment transfer.

## Subscription and usage rules

- The current communications/credits Phase 1 uses all-workforce plans ($50 retail/$30 explicitly assigned company seat) and a separate $15 simulated monthly wallet. Follow `docs/COMMUNICATIONS_AND_CREDITS_PLAN.md`; old individual-specialist catalog entries remain historical only. Never describe the wallet simulator as live provider billing.

- Preserve the Phase 3 service-level entitlement checks. UI, Copilot/voice tools, direct APIs and each durable worker stage must use the same authorization decisions; a model response or client assertion cannot grant paid access.
- Keep subscription entitlement, role/company permission, implementation readiness, usage allowance and provider connectivity separate. Planned specialists remain unavailable after simulated selection.
- Core workflows must remain independently useful. Shared matching/CRM/notes infrastructure inside an authorized capability must not accidentally require a second specialist purchase.
- All pricing and allowances are provisional versioned catalog records. Quotes use integer cents, remove bundle/sponsorship duplicates, and separate company and personal totals. Never activate real payment collection, external messaging or providers as part of routine billing work.
- Reserve/settle/release usage with scoped idempotent operation IDs. Do not invent provider costs or consume research credits twice on retries. Failed/canceled work releases unused reservations. Preserve historical work after a subscription ends.
- Billing administrators require explicit assignment beyond manager role. Trials cannot bypass roles/restrictions and must expire without automatic paid conversion. Production payment events require verified signatures, tenant binding and replay protection before changing entitlements.
- Include billing regressions and the isolated HTTP smoke suite in required checks. See docs/PRICING_AND_PACKAGES.md, docs/BILLING_ARCHITECTURE.md and docs/USAGE_METERING.md before changing commercial behavior.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
