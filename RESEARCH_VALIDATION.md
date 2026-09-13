# Research validation status

> **Status: research prototype — not a clinically equivalent MCCB implementation.**
>
> The browser tasks in this repository are useful for software prototyping, workflow automation, and exploratory research. They must not be treated as interchangeable with a licensed/standardized MCCB administration unless equivalence has been established for the exact digital procedure and a validated scoring path is used.

## Why this document exists

A polished interface can make an experimental score look more authoritative than it is. This project therefore separates three questions that were previously conflated:

1. **Does the software run correctly?** — engineering validity.
2. **Does the task reproduce the standardized administration?** — procedural equivalence.
3. **Can the result use MCCB norms/T-scores/composites?** — psychometric/scoring validity.

Passing automated browser tests answers only the first question.

## Current task matrix

| Task | Current browser implementation | MCCB-equivalent today? | Release status |
|---|---|---:|---|
| TMT | Part A + supplemental Part B | **No** | Part A may be retained as the MCCB-related component; Part B must stay supplemental and must not enter MCCB scoring |
| BACS Symbol Coding | keyboard/browser adaptation | **No** | raw score / research use only until digital equivalence is established |
| Category Fluency | typed self-administration | **No** | standard administration is oral; keep as research adaptation |
| CPT-IP | custom browser identical-pairs task | **No** | blocker: do not apply MCCB CPT-IP norms to the current parameters |
| WMS-III Spatial Span | screen-based blocks | **No** | blocker: differs from standardized physical-board administration |
| Letter-Number Span | visually displayed sequence + typed response | **No** | blocker: standard administration is oral |
| HVLT-R | visual word display + typed recall | **No** | blocker: standard administration is oral across three learning trials |
| BVMT-R | browser/canvas adaptation | **No** | blocker: establish administration and scoring equivalence before normative use |
| NAB Mazes | browser/canvas adaptation | **No** | blocker: establish administration and scoring equivalence before normative use |
| MSCEIT Managing Emotions | browser adaptation/custom scoring | **No** | blocker: use licensed/validated scoring before MCCB-style normative output |

The official MATRICS test list identifies **Trail Making Test: Part A** (not Part B) as the MCCB speed-of-processing component. It also describes Category Fluency as oral, Letter-Number Span and HVLT-R as orally administered, and Spatial Span as a physical-board task. The same page warns not to change CPT-IP parameter settings because doing so invalidates normative scores.

Reference: https://www.matricsinc.org/mccbtestlist/

## Scoring policy

### Default `internal` mode

The default scoring path is deliberately named and treated as an **exploratory project-internal index**.

It may output:

- raw task metrics;
- exploratory domain contribution (`rawIndex`);
- within-project rank (`indexScore` / `cohortPercentile`).

It must **not** output:

- MCCB T-scores;
- clinical percentiles;
- an MCCB overall composite;
- labels such as “normal”, “impaired”, “excellent”, or “clinically low” unless a validated reference explicitly supports the threshold for the exact administration.

The official MCCB scoring program transforms test raw scores into T-scores and percentiles and uses respondent demographics for corrected scoring. Its documented default option uses age and gender; another option includes education. Official composite scores are generated from standardized domain scores, not from a linear remapping of within-sample ranks.

Reference: https://matricsinc.org/wp-content/uploads/2019/12/MCCB_MSCEIT_CD_Installation.pdf

### Validated norm plug-in

`MCCBScoring.registerNorm()` still supports a future validated scoring adapter. A norm must explicitly set:

```js
{
  name: '...',
  label: '...',
  validated: true,
  apply(profiles, domains) { /* validated conversion */ }
}
```

Only a norm explicitly marked `validated: true` may generate an overall composite, and only when all seven domain T-scores are present.

This gate is an engineering safety mechanism; setting the flag is **not itself evidence of validation**. The evidence/provenance for such an adapter must be documented and reviewed separately.

## Missing-data rule

Missing task/domain data are treated as **missing**, not as zero performance. The exploratory ranking pool for a domain contains only participants with usable data for that domain.

Before implementing an official scoring adapter, reproduce the MCCB scoring program's documented missing-data rules exactly. The official program allows limited missingness in domains represented by multiple tests but requires data for single-test domains.

Reference: https://www.matricsinc.org/wp-content/uploads/2019/11/MCCB_MSCEIT%20Installation%20notes.pdf

## Session-quality states — implemented baseline

Newly saved task results now receive a common metadata envelope from `mccb-participant.js` with these states:

```text
valid
aborted
interrupted
timing_violation
technical_failure
unverified
```

`markInProgress()` starts a monotonic session clock. `visibilitychange` marks active sessions as interrupted; `pagehide` marks unfinished sessions as aborted. `saveResult()` preserves an invalid status instead of restoring it to valid. Results with invalid QC are stored for auditability but their participant progress is `completed_invalid`.

Only sessions explicitly marked `valid` enter the default project-internal group-comparison indices. Historical results that predate the metadata envelope are marked `unverified`: they remain visible as raw data but are excluded from the default ranking pool.

Current result metadata includes:

```json
{
  "_meta": {
    "schemaVersion": 2,
    "taskVersion": "research-web-0.2.0",
    "administration": "digital_research_adaptation",
    "mccbEquivalent": false,
    "participantId": "P001",
    "recordedAt": "...",
    "sessionQc": {
      "status": "valid",
      "startedAt": "...",
      "completedAt": "...",
      "elapsedMs": 12345,
      "clock": "performance.now",
      "qc": {
        "visibilityInterruptions": 0,
        "timingViolation": false,
        "technicalFailure": false,
        "reasons": []
      }
    }
  }
}
```

This is an engineering QC baseline, not a complete psychometric validation system.

## Research-safe reporting — implemented

`research-report.html` is the default report surface for this branch. The legacy `comprehensive-report.html` automatically redirects to it because the legacy page assumes T-score-shaped data.

The research report clearly separates:

- raw task metrics;
- session QC (`valid`, invalid states, `unverified`);
- exploratory project-internal indices;
- a future validated-norm path.

Individual task pages may still contain historical threshold strings in their source code. The shared runtime replaces `.norm-ref` result interpretations with a research-only safety notice so unsupported “normal / impaired / excellent” language is not presented as a valid interpretation. Removing the dead threshold branches from every individual page remains desirable cleanup work.

## Timing validation — partially implemented

`ExperimentRuntime` now measures session duration with `performance.now()` where available and provides an absolute-deadline scheduler (`ExperimentRuntime.deadline`) for task migrations.

Still required for timing-sensitive tasks:

- migrate task countdowns away from callback-counting `setInterval()` logic;
- record scheduled onset, actual onset, onset error, and response timestamps per trial where relevant;
- define timing/jitter acceptance thresholds;
- validate those thresholds on target browser/device combinations.

`setInterval()` and `setTimeout()` must be treated as scheduling mechanisms, not clocks.

## Test-material licensing and security

MATRICS states that several component tests have their own copyright holders, while Trail Making Test Part A and Category Fluency: Animal Naming are public-domain tests for administration/scoring questions. Before publishing complete stimuli, answer keys, administrator forms, or derived reproductions, confirm redistribution rights with the relevant rights holder.

Reference: https://www.matricsinc.org/technical-assistance/

Until that review is complete, test-material licensing/security should be treated as a release blocker for a public deployment that exposes protected content.

## Definition of done for “validated MCCB mode”

Do not describe this project as an MCCB-equivalent clinical assessment until all of the following are true:

- exact administration protocol is documented per task;
- stimulus materials and scoring have appropriate permissions/licensing;
- timing-critical tasks have device/browser timing validation;
- digital-vs-standard equivalence has empirical evidence for each adapted task;
- scoring uses validated normative transformations with provenance/versioning;
- official missing-data rules are reproduced and tested;
- raw-data fixtures with known expected outputs pass conformance tests;
- every result records task version, scoring version, norm version, and QC status;
- security/privacy handling is appropriate for the intended study environment;
- reports visibly distinguish raw, research-standardized, and validated normative scores.

## Engineering tests vs psychometric validation

The repository's automated tests verify navigation, persistence, calculations, schema integrity, session-QC invariants, report safety contracts, and regressions. They must never be presented as evidence that a browser adaptation is psychometrically interchangeable with the standardized MCCB procedure.
