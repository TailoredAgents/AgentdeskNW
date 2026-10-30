> **Operational reference, not the development roadmap.** Use [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for current scope/status and [PROGRESS.md](PROGRESS.md) for dated evidence. Rehearse only accepted capabilities on the actual deployed revision; old presentation steps do not establish live connections, mobile readiness or production identity. The latest Render revision is unverified by this documentation reset.

# AgentDesk NW — private Render demonstration

This deployment is a fictional customer demonstration, not an authorized New Western integration or a production tenant. The app has a private invitation entrance; invited presenters can switch between the three fictional roles. All invited visitors share the same sample workspace, so this is not separate customer accounts.

The owner created `TailoredAgents/AgentdeskNW`, authorized publishing, and subsequently reported a Render deployment and authorized the PIN revision. Later source checkpoints are not automatically verified as deployed; inspect the hosted revision before a presentation. This planning update does not perform deployment. The existing `TailoredAgents/AgentDesk` repository is a separate project and must not be overwritten. The blueprint service name is `agentdesk-nw`.

## Deployment package

`render.yaml` defines one Node web service, with the app and durable worker supervised together. Proposed resources: **1 CPU / 2 GB RAM**, Virginia, **1 GB persistent disk** mounted at `/var/data`. The paid compute and disk price must be reviewed in the connected Render account before creation. No Render purchase has been made by preparing this file.

- Build: `npm ci --include=dev && npm run build`. Development dependencies include the TypeScript worker runner and are intentionally installed.
- Start: `npm run start:render`. Validates hosting settings, migrates the mounted database, optionally prepares the presentation scenario, then starts web and worker. The web process listens on `0.0.0.0:$PORT`.
- Database: `/var/data/agentdesk.sqlite`, including WAL files on the same persistent volume.
- Health: `/api/health` exposes only `{status:"ok"}` and never creates a demo session or reads business records.
- Runtime: Node 22.22.0; repository packages remain locked in `package-lock.json`.
- One instance only. SQLite and the worker must share the same filesystem. Do not split the worker into a separate Render service or enable replicas.
- Automatic redeployment is off for presentation stability. Deploy a verified commit deliberately.

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
