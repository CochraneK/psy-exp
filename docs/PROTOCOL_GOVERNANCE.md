# Protocol governance

`psy-exp` treats a task protocol as research data provenance, not as a cosmetic implementation detail.

## Source of truth

The current frozen public protocol identity is represented in four places:

1. `task-manifest.json` — human/machine-readable task metadata and `protocolId`.
2. `protocol-lock.json` — reviewed freeze snapshot for the current release line.
3. `mccb-participant.js` — runtime `taskVersion` written into every saved result.
4. Each `pages/mccb-*.html` driver — emits the frozen `protocolId` into task results.

`tests/verify-protocol-lock.cjs` requires these surfaces to agree.

## What requires a protocol/version bump

A change is protocol-relevant when it can plausibly alter participant exposure, response opportunities, raw score meaning, timing semantics, or comparability. Examples include:

- stimulus content/generation rules or deterministic seeds;
- number/order of trials, practice structure, target ratio, or stopping rules;
- presentation duration, ITI, response window, timeout, or timing policy;
- response modality or answer transformation;
- scoring formula, raw metric definition, or which component enters a research domain;
- private material set/scoring interface semantics.

For such changes, update the task `protocolId` and/or `taskVersion`, update `protocol-lock.json`, document the reason, and do not merge data from the old and new signatures into one reference group.

## What normally does not require a protocol bump

Pure presentation changes that do not alter exposure or response behavior can normally retain the protocol identity, for example typography, researcher-console layout, report wording, focus styling, or an accessibility fix that leaves the task interaction protocol unchanged.

When uncertain, prefer a version bump. Historical comparability is more valuable than avoiding version churn.

## Private materials

HVLT-related and MSCEIT-related public pages remain protocol shells. Their result signatures additionally include private material/scoring identifiers so differently authorized material sets are not silently pooled even when the public shell version is the same.

## Validation boundary

Protocol locking prevents accidental software drift. It does **not** establish psychometric equivalence, device timing equivalence, official norm validity, or clinical suitability. Those require separate empirical validation after a protocol/device matrix is frozen.
