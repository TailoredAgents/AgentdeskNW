# Security and permissions

## Deployment boundary

This build is a **local demonstration**, not a system approved to store real customer data. Fixed demo identities are permitted only with explicit demo configuration and loopback restrictions. A signed session prevents casual client field tampering; it does not substitute for real employee authentication. Production SSO, user lifecycle, access reviews and secure deployment are release gates.

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
- Use same-origin/request-header checks for state changes and signed HTTP-only session cookies.
- Keep permanent API keys in ignored server environment files; never expose a public-prefixed key.
- Restrict model tools to the approved registry and enforce a bounded loop.
- Apply rate limits and provider timeouts; use centralized safe error messages.
- Record relevant approvals, executions and failures without logging full transcripts or secrets.
- Treat uploaded text, web content, transcript instructions and model arguments as untrusted data.
- Escape rendered text and prevent spreadsheet-formula execution when exporting CSV.

Implemented controls and verification evidence must be checked in [PROGRESS](PROGRESS.md). This document is a requirement baseline; it does not assert a completed penetration test or enterprise certification.

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

Packages are drafts until explicit review; copy/compose handoff records preparation, never delivery. No Gmail, personal SMS, iMessage or Slack send occurs. Paid SMS and Slack dispatch remain unconfigured/planned adapter work. Formal disclosure rules, authoritative signed-document sources, property-release authority and corporate sharing rules remain customer confirmation gates.
