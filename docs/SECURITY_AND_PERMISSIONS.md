# Security and permissions

## Deployment boundary

This build is a **local demonstration**, not a system approved to store real customer data. Fixed demo identities are permitted only with explicit demo configuration and loopback restrictions. A signed session prevents casual client field tampering; it does not substitute for real employee authentication. Production SSO, user lifecycle, access reviews and secure deployment are release gates.

## Authorization model

Server-resolved actor identity contains organization, office, user and role. Every service must check organization and office scope. Personal conversations, jobs, tasks, proposals and notifications are owner-scoped; managers may access only the office-level records that the service explicitly authorizes. The frontend may hide unavailable navigation, but the backend must independently reject unauthorized operations.

No API/tool input can change the acting user’s tenant or role. Demo persona switching resolves only fixed trusted test identities. Provider credentials and customer mappings are not chosen from arbitrary client URLs.

## Action policy

| Level | Examples | Control |
| --- | --- | --- |
| Automatic preparation | Read authorized status, summarize supplied text, rank research, suggest next steps | Validated service and audit/usage where relevant |
| Routine internal action | Create reminder/task, mark own task complete, change own preferences | Authenticated, scoped service; tenant policy may tighten later |
| Explicit approval | CRM notes/imports/field updates; future outbound communication | Frozen proposal, authenticated review, current access recheck, idempotent execution |
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
