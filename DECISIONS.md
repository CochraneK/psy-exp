# Decisions

This log records durable cross-agent decisions. Project-native protocol/research documents remain authoritative for their domains.

## Research claims boundary

The public implementation is a cognitive research prototype. Passing software tests does not establish psychometric, normative, clinical, or official MCCB equivalence.

## Research-safe scoring

Project-native cohort ranking must remain clearly distinct from official T scores or clinical percentiles. Compatibility/QC gates remain part of the scoring boundary.

## Protected material boundary

Licensed/private task material is not distributed in the public repository. Public code provides protocol shells and local injection points where needed.

## Surface separation

Researcher Console/reporting and Participant Runner/task execution have different interaction/layout requirements and should not be collapsed into one generic UI shell.

## Canonical state and handoff

Git is the durable project state. `AGENTS.md`, `HANDOFF.md`, `STATUS.md`, and this file improve continuity but must summarize—not override—`task-manifest.json`, `protocol-lock.json`, validation/governance docs, and implementation evidence.

## Identity

Repository-facing maintainer identity uses **CochraneK**.
