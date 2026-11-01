> **Operational reference, not the development roadmap.** Use [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for current scope/status and [PROGRESS.md](PROGRESS.md) for dated evidence. Rehearse only accepted capabilities on the actual deployed revision; old presentation steps do not establish live connections, mobile readiness or production identity. Check the recorded deployment evidence in PROGRESS.md and the service dashboard before a presentation.

# AgentDesk NW — private Render demonstration

This deployment is a fictional customer demonstration, not an authorized New Western integration or a production tenant. The app has a private invitation entrance; invited presenters can switch between the three fictional roles. All invited visitors share the same sample workspace, so this is not separate customer accounts.

The owner created `TailoredAgents/AgentdeskNW`, authorized publishing, and subsequently reported a Render deployment and authorized the PIN revision. Later source checkpoints are not automatically verified as deployed; inspect the hosted revision before a presentation. On November 1 the owner requested automatic deployments again; the service setting was saved and reloaded as On Commit. The existing `TailoredAgents/AgentDesk` repository is a separate project and must not be overwritten. The blueprint service name is `agentdesk-nw`.

## Deployment package

`render.yaml` defines one Node web service, with the app and durable worker supervised together. Proposed resources: **1 CPU / 2 GB RAM**, Virginia, **1 GB persistent disk** mounted at `/var/data`. The paid compute and disk price must be reviewed in the connected Render account before creation. No Render purchase has been made by preparing this file.

- Build: `npm ci --include=dev && npm run build`. Development dependencies include the TypeScript worker runner and are intentionally installed.
- Start: `npm run start:render`. Validates hosting settings, migrates the mounted database, optionally prepares the presentation scenario, then starts web and worker. The web process listens on `0.0.0.0:$PORT`.
- Database: `/var/data/agentdesk.sqlite`, including WAL files on the same persistent volume.
- Health: `/api/health` exposes only `{status:"ok"}` and never creates a demo session or reads business records.
- Runtime: Node 22.22.0; repository packages remain locked in `package-lock.json`.
- One instance only. SQLite and the worker must share the same filesystem. Do not split the worker into a separate Render service or enable replicas.
- Automatic deployment is **On Commit** for `main`, matching `autoDeployTrigger: commit` in the blueprint. The owner requested this on November 1. Run required checks before pushing, then verify Render reaches Live for that commit; a push or a queued build alone is not a successful deployment.

A paid Render disk preserves records across restarts and deploys. It also means deployments are not zero-downtime. See the official [disk documentation](https://render.com/docs/disks), [web-service requirements](https://render.com/docs/web-services), and [Blueprint fields](https://render.com/docs/blueprint-spec). Current compute plan IDs differ from older “Starter/Standard” examples; the blueprint uses `1c-2g`.

## Configuration at creation

The blueprint generates a session signing secret. Enter a four-digit invitation PIN of your choice (leading zeroes are supported), or keep an existing 16–256 character code, and the existing OpenAI key in Render's private environment settings. Do not include these values in the repository, a URL, or the blueprint. The key is optional for deterministic demonstrations; leave it empty to keep all provider calls disabled.

`AGENTDESK_HOSTED_DEMO=true` and `AGENTDESK_DEMO=true` explicitly enable hosted fictional access. The origin defaults to Render's documented `RENDER_EXTERNAL_URL`. For a selected custom domain, set `AGENTDESK_APP_ORIGIN=https://your-domain` without a path, query, or fragment. Only the chosen hostname and same-origin mutations are accepted. Hosted startup fails when required settings are incomplete.

`AGENTDESK_PREPARE_DEMO=true` prepares the one-time scenario. It grants 14-day, role-scoped trials through the normal billing service, creates a sample property release when absent, and prepares reviewable work. It does not reset the database, renew trials on restart, approve pending CRM changes, send messages, or charge payments. The existing local workspace has also received these explicitly requested presentation trials; its saved conversations and workflows were preserved.

The Render proposal uses low reasoning and a 3,000-output-token limit for responsive presentations. Existing tool, approval, entitlement, rate and usage limits remain active. Investor research stays on `synthetic-fixtures-v1`; no real investor data or contact verification is requested.

## Access behavior

Visitors see a designed invitation screen. The code creates an eight-hour signed, HttpOnly, Secure, SameSite=Strict session scoped to the deployment origin. Bootstrap, role switching, provider status, AI execution and all business APIs require that session. Invalid codes are limited to 20 attempts per minute across the service. Ordinary local development still uses loopback-only demo access.

The invitation is a demonstration gate, not enterprise SSO. It intentionally lets an invited presenter explore Alex, Jordan and Taylor. Real employee identity remains a later approved integration.

## Deployment sequence

1. Connect the `TailoredAgents/AgentdeskNW` GitHub repository to Render and select its `render.yaml` Blueprint.
2. Review the proposed compute/disk bill, supply the invitation code and optional OpenAI key, and create the service.
3. Wait for the build and health check. Confirm the log reports demo storage ready and the worker running.
4. Open the Render HTTPS URL in a fresh browser. Confirm unauthenticated visitors see the invitation screen and cannot fetch `/api/bootstrap`.
5. Enter the invitation code. Open Copilot, the calling queue, the approval queue and marketplace. The relevant specialists should show trial access.
6. Create a clearly named rehearsal task, restart the service, and confirm it survives. Check that trial expiration did not move.
7. Rehearse the sequence in `MONDAY_DEMO.md`. Test microphone/speaker access separately on the actual presentation device before promising live voice.

## Verification and remaining deployment checks

`npm run test:hosted` exercises the actual compiled server, Render startup command, access gate and a restart using a temporary local database, fake invitation/signing secrets, and no OpenAI key. It performs **15 checks** including persistence and non-renewing trials. This is an HTTP proxy simulation of HTTPS headers; it does not certify public TLS, Render resource limits, microphone audio, a real Render disk or the final deployment URL.

The initial presentation checkpoint passed 103 workflow HTTP checks and 195 automated tests. Later milestones expanded those suites; use [PROGRESS.md](PROGRESS.md) for the latest recorded acceptance and run the current required suites for a new application release. Historical counts are not evidence that the currently hosted revision passed newer checks.

Do not delete the persistent disk to “refresh” the demonstration. Restarting retains work. For a clean rehearsal, use a separate disposable database locally or a deliberately separate demonstration service. Renew an expired trial explicitly through Taylor's billing controls; startup will not silently renew it.

## Optional employee messaging

The Blueprint leaves Slack/SMS ingress and delivery disabled. After account setup, add the provider values and enable both channel flags described in [MESSAGING_SETUP.md](MESSAGING_SETUP.md). Socket Mode can run in the existing worker. Twilio uses the public Render origin for signed callbacks. No second worker or separate database is needed. Do not activate both a local and deployed worker for the same Slack app.


## Verified backup and offline restore tools

The current release includes `scripts/storage-recovery.ts`. It never loads `.env.local`, seeds/migrates a source, selects a service database or overwrites an existing destination. Paths below are examples to replace deliberately; do not run them against an unapproved data source.

```sh
node --import tsx scripts/storage-recovery.ts backup /var/data/agentdesk.sqlite /var/data/backups/new-snapshot
node --import tsx scripts/storage-recovery.ts verify /var/data/backups/new-snapshot
node --import tsx scripts/storage-recovery.ts restore /var/data/backups/new-snapshot /var/data/recovery/new-offline-copy
```

Backup uses SQLite's online backup API to include committed WAL changes; do not copy the active database file alone. A new private directory contains a 0600 database, checksum manifest, migration list and table counts. Verification checks the hash, SQLite integrity, foreign keys and manifest counts. Restore verifies first and writes a new offline directory with a review-required marker. Existing paths and modified snapshots are rejected. A checksum detects changed contents; it is not an independent authenticated off-host backup or encryption mechanism.

Before switching a service to a restored copy, stop the original writers, keep AI/research/channel/push/payment dispatch disabled, reconcile previously uncertain external outcomes against immutable operation IDs, verify the intended source revision and inspect scoped fictional records. A historical backup may predate an external receipt: never blindly restart old sends or payments. Then perform an explicitly authorized service cutover and rehearsal. The script performs none of that cutover automatically. Off-host encrypted retention, scheduled backups, production restore objectives and a hosted restore drill remain deployment work.

Settings → Preparing company connections → Background work status shows recent worker lanes. `/api/health` remains lightweight process liveness and contains no workspace data. The authenticated `/api/workspace-readiness` shows preparation and worker state without source credentials or identity subjects. A healthy worker does not prove provider success. Automatic Render deployment remains off; publication and deployment must be verified separately.

## Optional identity/research additions — schema 054

This source update does not require new settings for the existing fictional Render demonstration. Keep the single `agentdesk-nw` service and persistent SQLite disk. Startup applies additive migrations 052–054; the disposable 051→054 preservation test passes. Back up before an authorized hosted upgrade. No service was redeployed or provider flag changed during this implementation batch.

Company sign-in is a separate opt-in configuration, not a replacement four-digit demo PIN. Before selecting `AGENTDESK_AUTH_MODE=company_oidc`, provision verified issuer/subject bindings for existing approved memberships and configure `AGENTDESK_APP_ORIGIN`, `AGENTDESK_OIDC_ISSUER`, `AGENTDESK_OIDC_CLIENT_ID`, `AGENTDESK_OIDC_CLIENT_SECRET`, `AGENTDESK_OIDC_AUTHORIZATION_ENDPOINT`, `AGENTDESK_OIDC_TOKEN_ENDPOINT`, `AGENTDESK_OIDC_JWKS_URI`, and `AGENTDESK_CREDENTIAL_KEY`. The identity callback is `<origin>/api/company-auth/callback`; only pinned HTTPS endpoints and RS256 identities are supported. Incomplete configuration fails closed. Old demo sessions/phone bindings are not company sessions.

The trusted offline membership command is `node --import tsx scripts/manage-company-identity.ts --file <absolute-reviewed-json-path> [--apply]`, using an explicit absolute `AGENTDESK_DB_PATH` pointing to an existing schema-054 database. Preview validates and rolls back; it never initializes, seeds, migrates or contacts the provider. See SECURITY_AND_PERMISSIONS for the reviewed input and versioned role/departure behavior. Do not apply test identity fixtures to a live service.

Salesforce authorization additionally needs an operator-prepared source, the approved tenant/connection profile in `AGENTDESK_OAUTH_PROFILES`, its separately named client-secret variable, and callback `<origin>/api/connection-auth/callback`. Preserve the credential key across releases; losing it requires explicit reconnection. The Settings authorization controls do not activate CRM synchronization or customer email delivery. See SALESFORCE_INTEGRATION for precise profile fields and remaining application adapters.

Normal paid research can join explicitly enabled admitted-text spending using `AGENTDESK_RESEARCH_CUSTOMER_TARIFF`, the separately configured research provider/model and existing provider opt-ins. It asks for a new whole-assignment review when the aggregate maximum exceeds $1. Do not copy fixture tariffs as production pricing. Continuous paid voice, broader paid hosts and real payments remain unfinished. Neither configuring credentials nor publishing a commit establishes hosted acceptance; deploy the intended commit and verify the actual Render revision separately.
