# Willow Tree Audio Studio: activity log specification

## Purpose
A reliable chronological record of who changed what, when, and whether it succeeded. This is intended for support, accountability, recovering changes and diagnosing bugs. Use the same architectural principles as the Tivvy Programme Designer's audit trail, but keep Willow Tree data entirely separate.

## Identity and trust
- **Never infer the individual user from the current shared administrator token.** Until Firebase tokens are validated server-side, actions must be labelled `shared-admin-token`, not a named person.
- Reuse existing Firebase email/password login UI only after the Worker validates each Firebase ID token using the trusted issuer/audience, signature, expiration and revocation strategy. Never trust an email address sent by the browser.
- Record immutable Firebase UID as primary identity; email and display name are optional snapshots. Add roles (administrator, producer, presenter) enforced on the backend.
- Avoid retaining bearer tokens, passwords, audio contents, text transcripts, or personal data unrelated to diagnostics in any log.

## Events
Capture login success/failure (without exposing credentials), logout, file upload, file validation failure, download, preview start, rename, metadata edit, assign tags, project open/save, track trim/cut/move/undo, effect application, source separation job creation/completion/failure, export, move to trash, restore, permanent purge, permissions changes and deployment/version changes.

## Log schema
Migration `0002_activity_log.sql` provides event ID, UTC timestamp, actor UID/email/name/type, action, resource type/id, project/session/request IDs, outcome, source, before/after JSON, detail JSON and error code. The `activity_log` table is append-only **by convention initially**; add server-side restrictions and retention/archival policy before exposing the feature to staff.

### Transaction integrity
For every persistent mutation:
1. Validate identity/role and request; create a request ID.
2. Record an event with safe before/after values and operation outcome.
3. Ensure database updates and corresponding log insertion are atomic when possible.
4. If R2 succeeds but D1 fails, reconcile the object and record the failure where feasible.
5. Never claim to record *every click* or promise guaranteed logs if the logging service itself is offline. Prefer recording meaningful actions and failures with a clear support correlation ID.

## Admin-only activity screen
Filters: date range, user, action, project, recording, status and request ID. Timeline/diff view shows changes with before-and-after summaries, without leaking audio assets. CSV export for authorised administrators, with an export event logged. Link from each recording's history to its activity.

## Data protection
Access-control all event queries, restrict export to authorised admins, set a proportionate retention period, document staff notice, and build a separate backup and recovery process. Never expose raw logs via public endpoints. Log IP/user agent only if justified by a documented purpose and retention policy.

## Status
**Schema and specification committed to GitHub, not yet migrated or integrated into deployed Worker.**
Existing `audit_events` table contains some upload/trash/restore operations attributed to `initial-admin`, **not verified named people**. This historical attribution cannot be upgraded retroactively without independent evidence.
