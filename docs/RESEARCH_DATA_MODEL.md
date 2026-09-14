# Research Data Model v1

`research-data.js` adds a versioned metadata layer beside the legacy participant/result storage. It is intentionally backend-agnostic so the current static GitHub Pages prototype can begin recording reproducibility metadata without breaking existing task pages.

## Hierarchy

`Study → Site → Participant → Session → Attempt`

- **Study**: study id, label, consent version, protocol-governance scheme.
- **Site**: collection site/device location identifier. The public prototype defaults to `local-browser-site`.
- **Participant**: de-identified participant id linked to one study/site.
- **Session**: operator, consent version, environment/preflight summary, build identity, manifest/protocol-lock fingerprints and start/close timestamps.
- **Attempt**: session id, task key, task version, protocol id, QC status and result-record time.

The layer also stores a bounded append-only audit trail and known build metadata.

## Compatibility strategy

The existing `ParticipantManager` remains the canonical task-result store in this phase. Research Data Model v1 is a sidecar provenance model. This avoids silently migrating or invalidating existing local participant records.

Participant Runner binds the current participant to a research session and writes preflight/environment metadata into that session. A later migration may move canonical task results into a server-backed implementation while keeping this logical hierarchy and export format.

## Export

`ResearchData.exportBundle({participantData})` produces a combined bundle containing:

- `modelVersion`
- research metadata/audit records
- optional existing ParticipantManager export payload

The bundle is research provenance data, not a validated clinical record.

## Backend migration boundary

A formal deployment should replace browser-only persistence with authenticated server storage, access control, encryption, backup, retention/deletion rules and an audit-capable API. `research-data.js` deliberately keeps its API small so those operations can later be implemented by another storage adapter without changing the Study/Site/Participant/Session/Attempt semantics.
