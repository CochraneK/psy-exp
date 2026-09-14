# Backend-ready storage / replica contract v1

`psy-exp` keeps the experiment runtime **local-first and synchronous** while making research data replicable to an authenticated HTTP backend.

This separation is intentional: a network request must never become part of a timed trial's critical path.

## Architecture

```text
Task page
  → ParticipantManager / ResearchData
  → synchronous local primary
  → research bundle checkpoint
  → bounded outbox
  → authenticated HTTP replica
```

Machine-readable versions:

- Research data model: `research-data-model-1.1.0`
- Storage architecture: `local-primary-http-replica-1.0.0`
- Protocol governance: `protocol-lock-v1`

The browser-local primary remains authoritative for the running task. Replica synchronization is an asynchronous durability/collection path, not a timing dependency.

## Browser client

`research-storage.js` provides:

- synchronous `LocalPrimaryAdapter` and testable `MemoryPrimaryAdapter`;
- HTTPS-only remote configuration, except localhost/loopback development;
- a bounded local outbox;
- Bearer-token authenticated push/pull/delete operations;
- idempotency keys for bundle checkpoints;
- sync state/error metadata;
- a memory-only session token API.

The Bearer token is **not persisted to localStorage**. Navigating to another page clears that in-memory token. In the static prototype, this means Runner pages normally queue checkpoints and a researcher later flushes them from `data-governance.html`. A production authentication provider can supply fresh short-lived credentials without changing the experiment data model.

## Reference API

The zero-dependency Node reference server in `server/research-backend.cjs` implements:

```text
GET    /v1/health
PUT    /v1/studies/:studyId/bundle
GET    /v1/studies/:studyId/bundle
DELETE /v1/studies/:studyId/participants/:participantId
```

Study endpoints require:

```text
Authorization: Bearer <token>
```

Bundle PUT also accepts:

```text
Idempotency-Key: <checkpoint-key>
```

The reference server performs strict identifier checks, body-size limits, explicit browser-origin checks, atomic file replacement, SHA-256 ETags and a backup before overwrite/delete.

## Running the reference server locally

```bash
PSY_EXP_API_TOKEN='replace-this-development-token' \
PSY_EXP_ALLOWED_ORIGINS='http://127.0.0.1:8000' \
node server/research-backend.cjs
```

Optional environment variables:

```text
PSY_EXP_HOST             default 127.0.0.1
PSY_EXP_PORT             default 8787
PSY_EXP_DATA_DIR         default ./.psy-exp-data
PSY_EXP_ALLOWED_ORIGINS  comma-separated browser origins
PSY_EXP_MAX_BODY_BYTES   default 12582912
```

`.psy-exp-data/` is git-ignored.

## Data governance UI

`data-governance.html` lets a researcher:

- configure Study and Site identifiers;
- freeze/declare a required consent version;
- record consent grant or withdrawal for the selected participant;
- close a research session;
- create a **new linked session** when reopening/retesting instead of mutating a closed session;
- configure an HTTP replica and test its health endpoint;
- inspect pending outbox checkpoints;
- manually synchronize a research bundle;
- validate and preview a bundle before merge/replace import;
- perform an explicit local hard delete and, when configured, request the corresponding remote delete.

Consent version enforcement is fail-closed in Participant Runner: when the study declares a consent version, a participant must have a granted consent record with the exact current version before a new research session is created.

## Import policy

`research-governance.js` validates imported bundles before applying them. It rejects unsupported structure, invalid identifiers, invalid JSON, oversized input and dangerous object keys. `merge` and `replace` are explicit modes.

A study mismatch is not silently merged into an already populated local research dataset.

## What the reference backend is **not**

The included server is a contract/reference implementation and CI target. It is not a claim of production research or clinical data compliance. A real deployment should replace JSON-file persistence with infrastructure appropriate to the study and institution, including at minimum:

- TLS termination and secure headers;
- an identity provider and short-lived credentials;
- role/site/study authorization;
- managed secret storage and key rotation;
- encrypted database/storage and encrypted backups;
- backup/restore drills;
- retention and deletion enforcement;
- centralized append-only audit logs;
- monitoring, alerting and incident response;
- rate limits and abuse protection;
- deployment/version provenance;
- validated migration and recovery procedures.

None of these infrastructure controls establish MCCB psychometric equivalence or clinical suitability.