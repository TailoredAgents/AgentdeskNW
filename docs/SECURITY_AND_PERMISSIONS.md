# Security and permissions

[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for completion status and development order. This specification preserves permission contracts and release gates; written source, local tests, real transport acceptance and production authorization are separate evidence.

## Shared work and native access — unaccepted C1/C2 source

The committed durable-work foundation makes jobs private to the employee, rechecks current source/role access on dispatch and replay, and requires an exact employee decision above $1 of fictional whole-job credit usage. Cost approval does not grant CRM or communication authority. Existing live model/provider spending remains separate; C6 must connect actual usage to the same whole-job policy. Auto top-up is planned and cannot approve a job or grant a role.

Uncommitted C1/C2 source adds bounded conversational controls and exact review records before model execution, plus native demonstration pairing and notification infrastructure. Integrated acceptance is incomplete. Models cannot issue cost decisions, ambiguous assent cannot choose an arbitrary job, and changed scope/version requires a fresh review. The native app and employee channels must use the same scoped services as desktop. No mobile approval or real SMS round-trip is claimed accepted by this document.

Phone pairing binds a single-use code from a signed-in fictional employee to a revocable hashed bearer credential. Server-side session validation checks expiry, revocation and current membership/role; a phone cannot choose a tenant/persona or issue another pairing code. Browser cookie/origin protections remain separate from native transport admission. These credentials are for the fictional demonstration and do not satisfy production SSO, company provisioning, departure or device-management requirements. Migrations 022–024 are written but have not passed integrated preservation acceptance; the active local schema-009 database is unchanged.

Phone notifications require per-device opt-in and session ownership. Dispatch rechecks the session, current work/source access and existing notification preferences/quiet hours. Payloads use generic text and an exact job link; current access is checked when that link opens. Queued, accepted, push-service-received, failed and uncertain states do not imply that a phone displayed a notice. Default live sending is disabled, ambiguous sends do not automatically retry, and actual phone delivery remains unverified. Preferred-channel routing and cross-channel coalescing remain later work under C5.

## Company source access — communications Phase 4A

Fictional company email retains organization/office/employee ownership. CRM access, source body access, local drafting and a simulated sending route are distinct. Header-only sources cannot create body-derived replies, observations or follow-ups; captured activity alone cannot authorize sending. Current capability checks run before mutation replay. Revoked accounts mask message content, identities, source references, drafts, history and relationship context; hidden bodies and drafts cannot match inbox search.

Source access revisions invalidate earlier exact-send reviews and protected Copilot history/tool receipts. Restoring demonstration access does not revive stale approvals or old body-bearing assistant results. Duplicate-source links are scoped, immutable and based on trusted demonstration correlation, not matching prose. Employee-reviewed journey text remains an explicit separate record; private source identifiers stay in private receipts. No live connector, investor delivery or attachment transfer is enabled. See [COMPANY_EMAIL_DEMO.md](COMPANY_EMAIL_DEMO.md) and [PROGRESS.md](PROGRESS.md).

## Private correspondence and reviewed actions — communications Phase 3

Inbox ownership is the authenticated organization/office/employee, independent of manager CRM visibility. Incoming correspondence is untrusted data: it cannot issue employee commands, change preferences, schedule work or approve a relationship update. Current CRM permissions and subscription access are rechecked. Copilot may search/read/prepare; exact simulated delivery and source-linked journey/task updates require explicit UI/API review. Reviews bind the saved message, sender, recipient, versions and protected context and expire; changed content or access invalidates them. Only the current server-generated relationship reply is eligible for simulation, with no attachments or property distribution. Scoped immutable receipts and transactions protect replay. Shared observation provenance omits private mailbox IDs/addresses and retains only deliberately reviewed text plus minimal source labels. No live sending, OAuth or attachment transfer is enabled. See COMMUNICATIONS_WORKFLOW.md.

## Communications and credits update — October 29, 2026

The workforce offer changes entitlement packaging without widening employee record access or completing planned specialists. Company-seat assignment requires an explicitly authorized billing admin; employee requests cannot grant the company discount. Wallet quotes/operations are private to an organization and employee, with office membership verified and provenance retained. Clients cannot supply fictional provider prices, rewrite ledger entries or settle real provider usage. Simulator mutations are unavailable outside configured demo mode.


## Deployment boundary

This build is a **fictional demonstration**, not a system approved to store real customer data. Local demonstration mode requires explicit configuration and loopback restrictions. The separately authorized hosted presentation uses a validated HTTPS origin, invitation PIN/code and signed secure sessions with fictional personas; it is not a real employee tenant. Unaccepted native pairing is also demonstration access. Signed sessions prevent casual client field tampering but do not substitute for managed employee identity. Production SSO, user lifecycle, access reviews and operating controls remain C7 release gates before real company-data ingestion.

## Authorization model

Server-resolved actor identity contains organization, office, user and role. Every service must check organization scope and its applicable office, owner, visibility and role policy. Cross-office investor reads require explicitly configured sharing or organization visibility; all other office boundaries remain enforced. Personal conversations, jobs, tasks, proposals and notifications are owner-scoped; managers may access only the office-level records that the service explicitly authorizes. The frontend may hide unavailable navigation, but the backend must independently reject unauthorized operations.

No API/tool input can change the acting user’s tenant or role. Demo persona switching resolves only fixed trusted test identities. Provider credentials and customer mappings are not chosen from arbitrary client URLs.

## Action policy

| Level | Examples | Control |
| --- | --- | --- |
| Automatic preparation | Read authorized status, summarize supplied text, rank research, suggest next steps | Validated service and audit/usage where relevant |
| Routine internal action | Create reminder/task, mark own task complete, change own preferences | Authenticated, scoped service; tenant policy may tighten later |
| Explicit approval | CRM notes/imports/field updates/buy boxes; package review before copy/compose handoff | Frozen proposal, authenticated review, current access recheck, idempotent execution |
| Restricted | Binding offers, altered contract terms, sensitive account changes, bulk deletion | No generic executable tool in the demonstration |

A model cannot approve an action. Rephrasing a proposal as a completed action does not change its state. A repeated review request must return the prior outcome without duplicate mutation. Qualification field changes store before-values and fail if the record changed before approval; a stale proposal cannot silently overwrite new information. Rejected/failed states remain inspectable.

## Application controls

- Validate bounded JSON inputs with Zod and reject malformed values.
- Authenticate routes before exposing records or minting paid provider credentials.
- Use same-origin/request-header checks for browser state changes and signed HTTP-only session cookies; separately validate native bearer transport without relaxing browser controls.
- Keep permanent API keys in ignored server environment files; never expose a public-prefixed key.
- Restrict model tools to the approved registry and enforce a bounded loop.
- Apply rate limits and provider timeouts; use centralized safe error messages.
- Record relevant approvals, executions and failures without logging full transcripts or secrets.
- Treat uploaded text, web content, transcript instructions and model arguments as untrusted data.
- Escape rendered text and prevent spreadsheet-formula execution when exporting CSV.

Check current acceptance status in the [implementation roadmap](IMPLEMENTATION_ROADMAP.md) and historical verification evidence in [PROGRESS](PROGRESS.md). This document is a requirement baseline; it does not assert a completed penetration test or enterprise certification.

## Prompt injection and action integrity

Retrieved content can describe a business fact but cannot grant access, install a tool, change an approval policy or request credential disclosure. Bind the actor on the server, validate references again when tools execute, and expose minimal data. Separate the system’s instructions from source text. Source evidence may support a recommendation; it cannot authorize an external write.

Tool results are authoritative for whether an operation ran. Text claiming success is not. Provider errors propagate as failures or incomplete work, with no silent conversion into invented results.

## Privacy and consent

Use fictional transcripts in the demonstration. Real recordings need an organization-approved consent process appropriate to the participants and jurisdictions. Do not infer consent from a file upload. Store only the business information needed, show source provenance, and implement retention/deletion before real use.

Contact discovery must use licensed or lawfully accessible professional sources, with source/verification metadata and applicable outbound-contact controls. A public record is not permission for every use. The application does not automatically call, email or text prospects.

## Production hardening backlog

Managed OIDC/SSO and MFA policy; session revocation; tenant/member administration; managed secret encryption; PostgreSQL tenant constraints/RLS; real field/record authorization from Salesforce; secure token rotation; provider allowlists; distributed rate limits and durable queue supervision; encrypted backups and restore tests; retention and deletion; secure upload scanning; external webhook signature/replay validation; monitoring/redaction; dependency and security review; incident response ownership.

Do not enable remote access merely by setting the local compiled-demo flag. No production launch or customer-data ingestion is authorized by a working localhost demonstration.

## Implemented investor ownership policy

`src/server/access.ts` validates the server-resolved membership before any investor read. Owner-only is the default. An office manager may read their own office; explicitly shared users and office visibility grant read access. Organization visibility and cross-office sharing are disabled unless a manager enables the corresponding organization policy. Shared reads do not grant modification rights: only the owner or an authorized manager of the owning office may propose or apply investor changes. A linked task must reference an investor in the acting office. These are configurable demonstration assumptions, not New Western ownership rules.

Only a manager may change sharing, configure ownership policy or reassign a relationship. Reassignment can be disabled by policy and is restricted to an existing member of the same office; it clears sharing. Conversations and private package/debrief records do not become readable merely because an investor is shared or reassigned. The daily calling queue remains owner-specific.

Duplicate detection queries only the acting organization. A protected same-organization match returns `possible_duplicate` and `matchedInvestorId: null`; no hidden name, notes, contact information or record identifier is returned. The signal prevents an import proposal and is checked again at execution. A visible match can return its permitted ID. Entity normalization is a conservative demo heuristic, not corporate identity resolution.

## Criteria, release and disclosure safeguards

Buy-box proposals preserve prior versions, changed-field conflicts and source statements. Approval rechecks permissions and the expected version within the transaction; unchanged field provenance is retained. Models cannot approve actions, releases or packages through an invented tool or text response. Research evidence and recap instructions remain data.

Property access and investor access are separate. Base inventory inherits release restrictions as soon as a release exists, including draft and withdrawn versions. The central property-read service protects bootstrap inventory, direct matching/briefings, debrief inference and saved debrief replay. Without a release, Phase 1 office-shared inventory remains available. Releases are office-scoped and visible to their owner, office manager and assigned dispositions users. Match identities are recalculated for the requesting actor and are not stored in the shared release. Restricted or withdrawn releases cannot authorize property packages. A current release version, valid disclosure and intended-recipient media access are rechecked at package review and handoff. Release updates invalidate earlier packages.

The local disclosure policy conservatively requires the current demo version. Only managers may enter synthetic disclosure fixtures; a signed fixture requires a `demo:` evidence reference and current version. Expiry is checked when read. This is not signature verification and cannot be used to self-declare a real investor signed. No provider can be treated as active without credentials and verified integration evidence.

Packages are drafts until explicit review; copy/compose handoff records preparation, never delivery. The package workflow does not send Gmail, personal SMS, iMessage or Slack messages. Employee Copilot SMS/Slack adapters exist separately, with actual account setup and provider round-trip acceptance still pending; they do not authorize investor distribution. Mobile is the primary daily interface, employee SMS is optional, and Slack is retained for future demand. Formal disclosure rules, authoritative signed-document sources, property-release authority and corporate sharing rules remain customer confirmation gates.

## Structured investor testimony

Relationship reports follow current investor visibility; only the owner or authorized manager of the owning office can add/correct them, with Core access checked again on exact retries. Shared readers cannot write. The API binds the path investor, rejects client identity fields, validates active approved buy-box scope and requires the current record/context version. Corrections must target an active report for that same investor, field and buy box. Reused keys with changed payloads and stale reviews fail.

The review screen explicitly identifies the report as shared employee testimony. Reports never import private email automatically or expose an employee's private preferences/tasks. They do not change canonical CRM criteria, grant access, create delivery authority or debit credits. Captured notes and original statements stay in the record; audit entries contain metadata only. The model can read authorized reports but has no new write or approval tool.
