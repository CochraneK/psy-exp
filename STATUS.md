# Status

## State

**Active research software prototype.**

The repository is engineering-mature enough to run its browser research workflow and automated regression suite, but it intentionally remains **not psychometrically or clinically validated as an MCCB-equivalent implementation**.

## Current capabilities

- researcher/participant surface separation;
- ten browser cognitive research tasks;
- local session/result persistence plus optional HTTP replica architecture;
- task/runtime/protocol/material metadata;
- session QC and attempt history;
- protocol/material/version-compatible research ranking;
- guarded Fluency semantic review;
- raw/report/comparison/export research surfaces;
- automated static, UI/accessibility, browser-smoke, protocol, privacy/material and scoring regression checks.

## Current limitations / external gates

- no official MCCB T-score or clinical percentile interpretation;
- no claim of standard MCCB equivalence;
- no cross-device timing-equivalence evidence from CI alone;
- private licensed material must remain outside public Git;
- formal empirical reliability/validity and target-device validation remain separate research work;
- GitHub Pages/local browser storage should not be treated as formal clinical-data infrastructure.

## Canonical status sources

Task and protocol state live in `task-manifest.json`, `protocol-lock.json`, `RESEARCH_VALIDATION.md`, and the implementation they govern. This file is a handoff summary only.
