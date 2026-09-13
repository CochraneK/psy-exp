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

The default scoring path is now deliberately named and treated as an **exploratory project-internal index**.

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

Missing task/domain data are now treated as **missing**, not as zero performance. The exploratory ranking pool for a domain contains only participants with usable data for that domain.

Before implementing an official scoring adapter, reproduce the MCCB scoring program's documented missing-data rules exactly. The official program allows limited missingness in domains represented by multiple tests but requires data for single-test domains.

Reference: https://www.matricsinc.org/wp-content/uploads/2019/11/MCCB_MSCEIT%20Installation%20notes.pdf

## Session-quality states required next

Every completed task should eventually carry a machine-readable quality state:

```text
valid
aborted
interrupted
timing_violation
technical_failure
```

Only `valid` sessions should enter any normative or group-comparison scoring path. `visibilitychange`, refresh, timer throttling, device sleep, or focus loss must not silently become a normal completion.

Recommended common result envelope:

```json
{
  "schemaVersion": 1,
  "taskVersion": "...",
  "participantId": "...",
  "startedAt": "...",
  "completedAt": "...",
  "status": "valid",
  "qc": {
    "visibilityInterruptions": 0,
    "timingViolation": false
  },
  "raw": {}
}
```

## Timing validation required next

For timed tasks:

- use `performance.now()` / absolute deadlines for measurement;
- treat `setInterval()` and `setTimeout()` as scheduling mechanisms, not clocks;
- record scheduled onset, actual onset, onset error, response time, focus/visibility interruptions, and browser/device metadata;
- establish acceptable jitter thresholds before using reaction-time metrics for research inference.

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

The repository's automated tests should continue to verify navigation, persistence, calculations, schema integrity, and regressions. They must never be presented as evidence that a browser adaptation is psychometrically interchangeable with the standardized MCCB procedure.
