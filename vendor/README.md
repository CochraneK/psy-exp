# Vendored browser dependency

## Chart.js 4.4.1

- File: `chart.umd.min.js`
- Upstream: Chart.js
- Version: `4.4.1`
- License: MIT
- Upstream package: https://www.npmjs.com/package/chart.js/v/4.4.1
- Source used for this vendor snapshot: `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`

Why vendored:

- `psy-exp` is intended to be reproducible from a frozen repository commit.
- Runtime charts should not depend on a third-party CDN remaining reachable.
- The jsDelivr response for this exact `.min.js` states that the file is dynamically generated and explicitly warns against using SRI for it.
- Keeping the exact UMD payload in the repository makes the deployed behavior traceable to the repository tree.

The vendored file retains the Chart.js upstream license header. Updating it is an intentional dependency change and should include a version bump here plus CI/browser smoke.
