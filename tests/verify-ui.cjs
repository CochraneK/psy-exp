'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const taskDir = path.join(ROOT, 'pages');
const taskFiles = fs.readdirSync(taskDir).filter(name => /^mccb-.*\.html$/i.test(name)).sort();
const v4Files = ['index.html', 'participant-runner.html', 'research-report.html', 'research-comparison.html'];
const appFiles = [...v4Files, 'data-governance.html'];
let passed = 0;
let failed = 0;

function check(ok, message) {
  if (ok) { passed++; console.log(`PASS ${message}`); }
  else { failed++; console.error(`FAIL ${message}`); }
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
for (const name of v4Files) {
  const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
  check(/research-ui\.css\?v=4\.0\.0/.test(html), `${name}: v4 stylesheet URL is cache-busted`);
}

const css = fs.readFileSync(path.join(ROOT, 'research-ui.css'), 'utf8');
check(/UI v4/.test(css), 'shared stylesheet identifies UI v4');
check(/overflow:auto/.test(css), 'research app restores long-page scrolling');
check(/prefers-reduced-motion/.test(css), 'research UI honors reduced-motion preference');
check(/focus-visible/.test(css), 'research UI exposes keyboard focus styling');
check(/\.task-grid/.test(css) && /\.runner-focus/.test(css) && /\.comparison-layout/.test(css), 'v4 task-first layout primitives exist');

const consoleHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check(/console-identity/.test(consoleHtml), 'console has compact active-participant strip');
check(/task-grid/.test(consoleHtml) && /participant-panel/.test(consoleHtml), 'console uses task-first workspace plus participant sidebar');
check(!/id=["']cohortMetrics["']/.test(consoleHtml), 'console no longer carries the old cohort dashboard strip');
check(!/① 施测|② QC|③ 分析/.test(consoleHtml), 'console removes explanatory process-card clutter');
check(/href=["']data-governance\.html["']/.test(consoleHtml), 'console exposes researcher-only data governance entry');
check(/research-storage\.js/.test(consoleHtml) && /sessionEligibility/.test(consoleHtml), 'console is wired to storage config and session eligibility');

const runner = fs.readFileSync(path.join(ROOT, 'participant-runner.html'), 'utf8');
check(/getTestUrl\(key,'user'\)/.test(runner), 'participant runner forces USER mode');
check(/timerJitter/.test(runner), 'participant runner includes timer-jitter preflight');
check(!/modeSelect/.test(runner), 'participant runner exposes no DEV-mode selector');
check(/runner-focus/.test(runner) && /runner-roadmap/.test(runner), 'participant runner centers one next action plus compact roadmap');
check(/<details>[\s\S]*设备预检与技术状态/.test(runner), 'participant technical preflight is secondary/collapsible');
check(/research-storage\.js/.test(runner) && /applySessionGate/.test(runner), 'participant runner loads storage layer and applies fail-closed session gate');
check(/ResearchStorage\.stageBundle/.test(runner) && /syncParticipantData/.test(runner), 'participant runner checkpoints provenance through async outbox path');
check(!/href=["']data-governance\.html["']/.test(runner), 'participant runner does not expose researcher governance controls');

const researchData = fs.readFileSync(path.join(ROOT, 'research-data.js'), 'utf8');
check(/research-data-model-1\.1\.0/.test(researchData) && /sessionEligibility/.test(researchData), 'research data model includes v1.1 consent/session governance');

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
check(/report-masthead/.test(report) && /domain-grid/.test(report), 'single report uses document-style hierarchy');
check(/MIN_REFERENCE_N=5/.test(comparison), 'comparison report preserves small-N display guardrail');
check(/comparison-layout/.test(comparison) && /selector-panel/.test(comparison), 'comparison uses participant selector plus evidence matrix');

console.log(`\nUI contracts: ${passed} passed / ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
