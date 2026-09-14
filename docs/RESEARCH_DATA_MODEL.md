# Research Data Model v1.1

`research-data.js` is the versioned Study/Site/Participant/Session/Attempt provenance layer used beside `ParticipantManager`. Version `research-data-model-1.1.0` keeps timed task persistence local and synchronous while adding consent governance, explicit session lifecycle rules and a pluggable primary-storage boundary.

## Hierarchy

`Study → Site → Participant → Session → Attempt`

- **Study**: study id, label, required consent version and protocol-governance scheme.
- **Site**: collection site/device-location identifier.
- **Participant**: de-identified participant id, site link, lifecycle status and consent record.
- **Session**: operator, consent version, environment/preflight summary, build identity, manifest/protocol-lock fingerprints, parent-session link and start/close timestamps.
- **Attempt**: session id, task key, task version, protocol id, QC status and result-record time.

The layer also stores a bounded audit trail and known build metadata.

## v1.1 governance rules

- A study may declare a required `consentVersion`.
- New sessions fail closed until the participant has a granted consent record for the exact current version.
- `withdrawn` / `declined` participants cannot start new sessions.
- Withdrawal closes still-active research sessions but does not silently erase historical data.
- Reopening a closed session creates a **new linked session** with `parentSessionId`; closed sessions are not mutated back to active.
- Explicit hard delete removes the participant and linked session/attempt provenance from the local research layer.
- Study id changes are blocked after session/attempt collection has begun.

## Storage architecture

The running experiment uses a synchronous primary adapter. By default this is browser `localStorage`; `research-data.js` can accept another synchronous adapter through `setStorageAdapter()`.

`research-storage.js` provides the current browser architecture:

`task page → synchronous local primary → bundle checkpoint → bounded outbox → authenticated HTTP replica`

The HTTP replica is deliberately asynchronous. Network latency or outage must never become part of a timed trial's critical path. Bearer credentials are held in memory only and are not written to localStorage.

See [`BACKEND_V1.md`](BACKEND_V1.md) for the replica contract and reference server.

## Compatibility with ParticipantManager

`ParticipantManager` remains the canonical task-result store in the browser prototype. Research Data Model v1.1 records provenance and synchronizes attempt metadata from `ParticipantManager.attemptHistory` idempotently.

Participant Runner binds the selected participant to an eligible research session, fingerprints `task-manifest.json` and `protocol-lock.json`, records environment/preflight metadata, and checkpoints the combined bundle outside timed task execution.

## Export / import boundary

`ResearchData.exportBundle({participantData})` produces `psy-exp-research-data-bundle` with:

- explicit model version;
- Study/Site/Participant/Session/Attempt provenance;
- audit/build metadata;
- optional ParticipantManager export payload.

`research-governance.js` validates bundle structure, identifiers, size and dangerous object keys before merge/replace import. A populated local study is not silently merged with a different study id.

The bundle is research provenance data, not a validated clinical record.

## Production boundary

The included JSON-file backend is a contract/reference implementation, not production research infrastructure. A formal deployment still needs institution-appropriate authentication/authorization, TLS, encrypted managed storage and backups, secret rotation, retention/deletion enforcement, centralized audit, monitoring, recovery testing and validated migrations. None of those controls establish MCCB psychometric equivalence or clinical suitability.
