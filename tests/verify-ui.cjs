'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const taskDir = path.join(ROOT, 'pages');
const taskFiles = fs.readdirSync(taskDir).filter(name => /^mccb-.*\.html$/i.test(name)).sort();
const researchAppFiles = ['participant-runner.html', 'data-governance.html'];
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

for (const name of researchAppFiles) {
  const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
  check(/research-ui\.css/.test(html), `${name}: unified research UI stylesheet loaded`);
  check(/research-app/.test(html), `${name}: long-form research shell enabled`);
}
const runnerHtml = fs.readFileSync(path.join(ROOT, 'participant-runner.html'), 'utf8');
check(/research-ui\.css\?v=6\.0\.0/.test(runnerHtml), 'participant-runner.html: shared stylesheet URL is cache-busted');

const css = fs.readFileSync(path.join(ROOT, 'research-ui.css'), 'utf8');
check(/overflow:auto/.test(css), 'research app restores long-page scrolling');
check(/prefers-reduced-motion/.test(css), 'research UI honors reduced-motion preference');
check(/focus-visible/.test(css), 'research UI exposes keyboard focus styling');
check(/\.runner-focus/.test(css), 'research-only runner layout primitives remain available');

const consoleHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check(/<title>psy-exp · 认知研究任务套件<\/title>/.test(consoleHtml)&&consoleHtml.includes('MCCB-related cognitive research prototype'), 'console exposes research-prototype title and boundary');
check(!consoleHtml.includes('标准化认知功能评估工具')&&!consoleHtml.includes('分数已标准化为百分比'), 'console avoids pseudo-standardization wording');
check(/\.container\s*\{\s*max-width:\s*1100px/.test(consoleHtml), 'console restores original 1100px centered shell');
check(/linear-gradient\(135deg,\s*#3498db,\s*#2ecc71\)/.test(consoleHtml), 'console restores original blue-green logo tile');
check(/class=["']header["']/.test(consoleHtml) && /class=["']logo["']/.test(consoleHtml), 'console restores original centered header and logo');
check(/class=["']dashboard["']\s+id=["']dashboard["']/.test(consoleHtml), 'console restores original assessment dashboard');
check(/class=["']mode-toggle-wrap["']/.test(consoleHtml) && /id=["']modeToggle["']/.test(consoleHtml), 'console restores original DEV/USER pill toggle');
check(/id=["']wm-toggle["']/.test(consoleHtml), 'console restores original wide-mode control');
check((consoleHtml.match(/class=["']domain-section["']/g)||[]).length===7, 'console restores seven original cognitive-domain sections');
check((consoleHtml.match(/class=["']test-card["']/g)||[]).length===10, 'console restores ten original task cards');
check(/id=["']participantManagerOverlay["']/.test(consoleHtml) && /id=["']resumeBtn["']/.test(consoleHtml), 'console restores original participant manager and resume control');
check(/id=["']dashGrid["']/.test(consoleHtml) && /id=["']dashProgressFill["']/.test(consoleHtml), 'console restores original dashboard progress grid');
check(!/workbench-header|subject-bar|task-grid/.test(consoleHtml), 'console no longer uses later v4/v5 workbench shell');
check(!/research-ui\.css/.test(consoleHtml), 'console is visually independent from later research-ui stylesheet');

const runner = runnerHtml;
check(/getTestUrl\(key,'user'\)/.test(runner), 'participant runner forces USER mode');
check(/timerJitter/.test(runner), 'participant runner includes timer-jitter preflight');
check(!/modeSelect/.test(runner), 'participant runner exposes no DEV-mode selector');
check(/runner-focus/.test(runner) && /runner-roadmap/.test(runner), 'participant runner centers one next action plus compact roadmap');
check(/<summary>设备检查<\/summary>/.test(runner), 'participant technical preflight is secondary/collapsible');
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
check(/psy-exp 综合认知研究报告/.test(report) && /class="header"/.test(report) && /subject-card/.test(report), 'single report uses research-safe title and original visual language');
check(!/report-masthead|research-app|Research report/.test(report), 'single report removes later research-report UI shell');
check(/MIN_REFERENCE_N=5/.test(report) && /非 MCCB T 分/.test(report), 'single report preserves small-N and non-clinical guardrails');
check(/psy-exp 多被试研究对比/.test(comparison) && /class="header"/.test(comparison) && /participant-chip/.test(comparison), 'comparison uses research-safe title and original visual language');
check(!/selector-panel|research-app|Cohort comparison/.test(comparison), 'comparison removes later research-comparison UI shell');
check(/MIN_REFERENCE_N=5/.test(comparison) && /reference group/.test(comparison), 'comparison preserves protocol/reference-group guardrails');
check(!/MCCB 综合认知报告/.test(report) && !/MCCB 多被试对比/.test(comparison), 'report surfaces do not imply official MCCB reporting');

console.log(`\nUI contracts: ${passed} passed / ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);