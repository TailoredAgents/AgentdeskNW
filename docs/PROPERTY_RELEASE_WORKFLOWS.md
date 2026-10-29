# Property release workflows

## Implemented local behavior

`src/server/workflows.ts` owns a reusable release service. Acquisitions employees and office managers can release an existing authorized property. Dispositions employees cannot create or revise releases. A release owner or manager can revise its details. These are local demonstration controls, not asserted New Western corporate policy.

The release stores the property's current supplied snapshot, property type, description, notes, source, media URL/access declaration, optional ARV and repair assumptions with source, showing instructions, release time/status/version and authorized dispositions employees. Transaction metadata distinguishes an upstream party/stage from a downstream stage and accepts unspecified, single, double or same-day closing structure plus an optional closing timestamp. These are configurable descriptions, not a contract engine or legal advice.

One current release exists per property in an organization and office. `eventKey` deduplicates identical release commands, including retries. Reusing a key for different data fails. Updates require the current `expectedVersion`; stale updates fail. `release_events` retains each version and its source snapshot. Replaying a successful event returns that event's version, while normal reads return the current release. SQLite transactions commit release changes, event receipt, package invalidation and notification creation together.

Release recipients must be dispositions members of the same office. An empty recipient list leaves visibility with the release owner and office manager. Tenant/office boundaries and audience checks run in services. Shared releases never contain a stored cross-employee match list: each read calculates matches against the requesting employee's permitted investor scope. Recipient-specific media investor IDs are likewise filtered before returning a release.

A released event evaluates matches separately for each recipient and creates a deduplicated private notification, subject to the existing notification preferences, quiet hours and rate limit. It does not disclose another employee's investor names. The daily calling queue independently ranks current releases and current permitted investors; release updates therefore change current recommendations. No external investor is contacted.

The existing worker retries release and draft-review notices from durable current records after quiet hours or a notification limit prevents immediate display. It rechecks the current audience and skips withdrawn releases; an old version is not replayed after a newer version replaces it. Notification preferences are still respected. This is a local polling worker, not a production notification broker.

## Packages and revisions

Any release revision invalidates associated packages, clears approval and removes their old restricted body. This includes withdrawal, a media-link change or audience change. Employees compose a new package from current data and review it again. Every package list/copy/approval also rechecks current release access, version, disclosure and media eligibility.

Once a release exists, the base property list and direct property reads use the same audience boundary; the older Phase 1 inventory API cannot bypass release access.

No marketplace, Salesforce property feed or email/Drive importer is connected. Releases come from the authenticated manual demo flow or the same validated application service. The application neither fetches media nor claims to test a recipient's Google Drive permissions. The authoritative property source, release permissions, external-source agreements and transaction stages require customer confirmation before a pilot.

## Persistence and verification

Migration `004_workflows.sql` adds scoped releases, idempotent release events, packages, debriefs, templates and channel identity fixtures without replacing Phase 1 tables. Composite foreign keys bind releases and packages to their organization/office/property/investor/membership records. SQLite remains a local single-instance persistence choice; PostgreSQL and production identity are required before distributed deployment.

`tests/workflows.test.ts` covers release versioning, command idempotence, stale writes, tenant/office/role/audience boundaries, private match and media-recipient filtering, URL validation and package invalidation. The integration smoke suite and full project checks are reported in `PROGRESS.md`; this specification does not certify live provider connectivity.
