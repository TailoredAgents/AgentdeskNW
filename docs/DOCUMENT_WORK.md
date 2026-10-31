# Source documents and transaction work

This is the domain contract for the C3/C4 document extension. [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) remains the only scheduling/status authority. **Private text documents, reviewed local-text correspondence and private transaction coordination accepted locally, October 31, 2026.** Real provider retrieval, actual delivery and company-approved title/payment procedures remain deferred.

## Usable document foundation

Start with private, versioned text documents that employees can read, correct and reuse across desktop and mobile. Desktop can import a bounded UTF-8 text file; either interface can paste/edit fictional document contents. This gives the application actual content instead of treating an attachment filename as evidence. It does not parse PDF images, verify a signature, confirm a deposit or obtain an absent provider attachment.

Each document has a title, file name, purpose, source label/date, optional permitted property/investor references and exact content. These are employee-supplied records, explicitly fictional and unverified. Document text is data, never an instruction or action authority. Private ownership is independent of manager CRM access. A property/investor reference must remain accessible on every read, save, download and replay. Binding the source records at creation prevents a revision from silently moving a document to a different relationship or deal.

Content revisions are immutable; correction creates a new revision. A current-use reference binds document identity/version/content digest and current authorized source context. Withdrawal stops current use; original private history is retained only while the employee still has source access. Shared work and eventual attachment reviews must recheck the exact reference before use; no fallback to an older revision. A read/download is not approval to share it.

UI edits preserve their original base version. An unknown save outcome may only retry its original payload. Newer server revisions do not silently overwrite unsaved changes or adopt a new write version. A changed/revoked source removes protected content. Navigation and unsaved discard remain explicit. Downloads use authenticated private routes and attachment disposition, never public file URLs.

## Correspondence and transaction extension

Exact document references now support reviewed email simulation, as specified in [COMMUNICATIONS_WORKFLOW](COMMUNICATIONS_WORKFLOW.md). Employees explicitly select current revisions and inspect exact contents; source changes invalidate review, and history retains the original permitted revision. Private transaction records and current unsent title preparation are now locally accepted; reviewed correspondence creation is the next extension. A title-coordination package needs known parties, financing type, closing date, a sourced agreement and a sourced deposit record. A missing item remains missing. Alex's stated reservation/stop-marketing sequence is provisional discovery, not verified company policy. Document presence alone never proves signatures, receipt of money, lien clearance or closing.

Track employee-reported milestones separately from external confirmation; retain who reported each fact, when and its supporting revision. Changes to parties, dates, evidence or release eligibility invalidate prepared packages. Draft preparation may identify gaps and assemble a reviewable package; it cannot invent attorney/lender contacts, wire instructions, signed agreements or payment outcomes. All local sends and transaction outcomes remain clearly simulated until separately authorized connections exist.

## Acceptance requirements

- Private account, organization/office/role and source access on every path, including replay and historical content.
- Actual text content and stable digest survive save/read/download and process restart; original revisions remain immutable.
- Correction, withdrawal or source changes invalidate a prepared reference; stale writes cannot overwrite newer content.
- Unknown outcomes recover once; no duplicate documents/revisions or lost unsaved edits across surfaces.
- Desktop/mobile content continuity, readable source labels, guarded navigation and explicit missing-file behavior.
- Full regression, isolated HTTP checks, migration-copy preservation and updated roadmap evidence before claiming acceptance.

Binary/PDF ingestion, extraction provenance, mailbox attachment retrieval, real document sharing/transfer, natural-language document tools and actual transaction package delivery are separate unfinished requirements. This text-content foundation must not be presented as all document handling completed.


## Verified foundation and boundaries

Migration 033 adds private document heads, immutable content revisions and append-only scoped events. Inputs accept `.txt`/`.md` names and valid Unicode text (32,000 characters / 64 KB); null characters, paths, binary filenames and future source dates are rejected. Source bindings stay fixed across revisions. The local library is bounded to 200 documents per employee. Immutable content digest/byte length and versions are visible through the API; historical reads recheck current ownership and linked-source scope. An ended subscription retains readable private history but cannot mutate or use documents in new work.

Desktop Documents supports actual UTF-8 file import and authenticated attachment downloads. Native Work → Documents supports paste, read, correct and withdraw; binary picking/download and PDFs are still separate work. Both screens preserve unsaved text and its base version, invalidate stale withdrawal review, retain exact uncertain operation identity and suppress late reads after navigation. An interrupted refresh cannot repopulate an old document into a new form.

Local acceptance: ten backend cases, seven shared-controller cases, 42 new HTTP checks and the full regression. Schema upgrade preserved 316 existing rows across 109 prior tables, with clean integrity and foreign keys. Desktop import and guarded navigation, 390×844 native-browser correction, website retrieval of that exact revision and cross-surface withdrawal passed. Browser evidence is not physical-device acceptance. No model document tool, source ingestion from mailboxes, actual transfer, provider call or charge was added. Current totals and remaining work are in the single roadmap and PROGRESS.

## Transaction coordination implementation contract

Locally accepted slice: a private employee transaction workspace, available to all roles with current access to its property and investor. A manager does not inherit private correspondence/documents through this workspace. Shared office coordination continues through Handoffs; explicit transaction sharing and management aggregation are separate follow-on work.

Store immutable versions of the property/investor binding, closing target, financing choice, buyer/attorney/acquisition/lender contacts, independent employee-reported milestones and unresolved issues. Each report keeps a source label/date and optional exact document reference. Reports and documents do not establish external confirmation. Keep title opening, clearance, signing, funding and closing separate; never infer completion from a personal task or one preceding milestone. Changes require the original version and idempotent event identity.

A current title-opening preparation identifies missing contacts, financing/date, agreement/deposit reports and their current supporting text revisions. Cash excludes the lender; other financing requires a lender contact. Once complete, display a recipient list, unsent message and exact supporting file contents under the current transaction/source fingerprint. No wire instructions, reservation, stop-marketing rule, external action or verified outcome is inferred. This increment prepares a package only; saving it to reviewed correspondence and broader conversational execution follow separately.

Acceptance covers source correction/withdrawal, independent milestone outcomes, role/tenant/owner boundaries, stale edits, immutable history, exact retries, changed financing/parties, subscription-ended history, desktop/native continuity and missing evidence. All provider/device/practitioner acceptance remains deferred.


Migration 034 adds owner-scoped heads, immutable versions and append-only exact-retry events. Fixed property/investor bindings are checked on every list/detail/replay; private documents do not grant management access. Each selected supporting source must belong to the employee and be unbound or refer to this same property/investor; agreement/deposit/clearance use matching document purposes. Dates and bounded fields are validated. Historical reports remain readable after subscription end, while new preparation/mutation requires Core access. There are at most 200 private demonstration transactions per employee and ten issues per record.

The preparation is recalculated from current sources. Missing contacts/financing/date, prior title-opening report, duplicate recipient addresses, stale/withdrawn sources or an inactive recorded release withhold a new title draft. A reported later milestone warns about missing preceding reports without filling them in. Cash retains an entered lender in history but excludes it from preparation. Current preparation binds a source fingerprint; no email draft, external operation, wire detail, payment outcome or marketing eligibility is created. Readiness refers to this fictional preparation, not verified legal or business completeness.

Desktop/native editing protects unsaved changes and original versions, with exact uncertain retry and late-response suppression. The specialist launcher opens Transactions; model tools and existing release-stage summaries remain separate until proper source/history integration. Seventeen backend cases, six client cases and 54 HTTP cases passed with the full regression. Schema preservation and browser evidence are in PROGRESS. Explicit transaction sharing, management aggregation, document-aware Copilot/work execution, communication creation, reminders and richer transaction lifecycle remain follow-on work.
