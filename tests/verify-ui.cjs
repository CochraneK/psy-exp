'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const taskDir = path.join(ROOT, 'pages');
const taskFiles = fs.readdirSync(taskDir).filter(name => /^mccb-.*\.html$/i.test(name)).sort();
const appFiles = ['index.html', 'participant-runner.html', 'data-governance.html', 'research-report.html', 'research-comparison.html'];
let passed = 0;
let failed = 0;

function check(ok, message) {
  if (ok) {
    passed++;
    console.log(`PASS ${message}`);
  } else {
    failed++;
    console.error(`FAIL ${message}`);
  }
}

for (const name of taskFiles) {
  const html = fs.readFileSync(path.join(taskDir, name), 'utf8');
  check(!/user-scalable\s*=\s*no/i.test(html), `${name}: browser zoom is not disabled`);
  check(!/maximum-scale\s*=\s*1(?:\.0)?/i.test(html), `${name}: viewport does not cap zoom at 1x`);
  check(/<meta\s+name=["']viewport["']/i.test(html), `${name}: viewport metadata exists`);
  check(/<html\b[^>]*lang=["']zh-CN["']/i.test(html), `${name}: document language declared`);
}

for (const name of appFiles) {
  const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
  check(/research-ui\.css/.test(html), `${name}: unified research UI stylesheet loaded`);
  check(/research-app/.test(html), `${name}: long-form research shell enabled`);
}

const css = fs.readFileSync(path.join(ROOT, 'research-ui.css'), 'utf8');
check(/overflow:auto/.test(css), 'research app restores long-page scrolling');
check(/prefers-reduced-motion/.test(css), 'research UI honors reduced-motion preference');
check(/focus-visible/.test(css), 'research UI exposes keyboard focus styling');

const runner = fs.readFileSync(path.join(ROOT, 'participant-runner.html'), 'utf8');
check(/getTestUrl\(key,'user'\)/.test(runner), 'participant runner forces USER mode');
check(/timerJitter/.test(runner), 'participant runner includes timer-jitter preflight');
check(!/modeSelect/.test(runner), 'participant runner exposes no DEV-mode selector');
check(/applySessionGate/.test(runner) && /sessionEligibility/.test(fs.readFileSync(path.join(ROOT,'research-data.js'),'utf8')), 'participant runner has a fail-closed research session gate');
check(/ResearchStorage\.stageBundle/.test(runner), 'participant runner stages replica checkpoints without blocking task pages');

const governance = fs.readFileSync(path.join(ROOT, 'data-governance.html'), 'utf8');
check(/research-storage\.js/.test(governance) && /research-data\.js/.test(governance) && /research-governance\.js/.test(governance), 'data governance loads storage, model and validator layers');
check(/id="consentVersion"/.test(governance) && /id="grantConsentBtn"/.test(governance) && /id="withdrawConsentBtn"/.test(governance), 'data governance exposes consent-version controls');
check(/id="replicaToken"[^>]*type="password"/.test(governance), 'replica token input is password-scoped');
check(/setSessionToken/.test(governance) && !/localStorage\.setItem\([^)]*token/i.test(governance), 'replica token is not persisted by the governance page');
check(/id="importFile"/.test(governance) && /validateBundle/.test(governance), 'data governance validates imports before application');
check(/id="hardDeleteBtn"/.test(governance), 'data governance exposes explicit hard-delete workflow');

const report = fs.readFileSync(path.join(ROOT, 'research-report.html'), 'utf8');
const comparison = fs.readFileSync(path.join(ROOT, 'research-comparison.html'), 'utf8');
check(/MIN_REFERENCE_N=5/.test(report), 'single report preserves small-N display guardrail');
check(/MIN_REFERENCE_N=5/.test(comparison), 'comparison report preserves small-N display guardrail');

console.log(`\nUI contracts: ${passed} passed / ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
