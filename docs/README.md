# Test-material handling

This public repository intentionally does **not** bundle operator forms, standard stimulus lists, answer keys, scoring manuals, or other materials whose redistribution rights have not been independently confirmed.

## Public repository policy

- Keep only software, research-prototype instructions, synthetic/demo fixtures, and documentation that can be redistributed safely.
- Do not commit licensed MCCB component materials, screenshots/scans of manuals, standard word lists, official answer keys, proprietary scoring tables, or vendor software.
- Store study-specific licensed materials outside the public repository in an access-controlled location.
- If a local deployment needs licensed assets, load them through a local/private configuration layer rather than copying them into Git history.
- Record the rights holder, license/source, permitted use, material version, and study approval alongside the private asset.

## Important history note

Removing a file from the current branch does **not** erase it from earlier Git commits. If a rights holder or project policy requires full historical removal, perform a repository-history rewrite (for example with `git filter-repo`) from a trusted local clone, force-update the affected refs, and coordinate cache/fork cleanup as appropriate. That operation should be reviewed separately because it rewrites commit history.

## Validation boundary

The browser tasks in this repository are research adaptations. Availability of a task implementation does not imply permission to redistribute the standardized test materials, and it does not establish psychometric equivalence with the licensed/standard administration.

See [`../RESEARCH_VALIDATION.md`](../RESEARCH_VALIDATION.md) for the current task-by-task validation status.
