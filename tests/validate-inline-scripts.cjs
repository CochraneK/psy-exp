'use strict';

/**
 * Zero-dependency static HTML inline-script syntax validator.
 *
 * This does not execute browser code. It extracts non-src <script> blocks and
 * asks Node's parser to compile them, catching syntax regressions that ordinary
 * `node --check` cannot see inside .html files.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const files = [
  'index.html',
  'research-report.html',
  'research-comparison.html',
  'comprehensive-report.html',
  'comparison-report.html',
  'pages/mccb-tmt.html',
  'pages/mccb-bacs.html',
  'pages/mccb-fluency.html',
  'pages/mccb-cpt.html',
  'pages/mccb-spatial-span.html',
  'pages/mccb-lns.html',
  'pages/mccb-hvlt.html',
  'pages/mccb-bvmt.html',
  'pages/mccb-mazes.html',
  'pages/mccb-msceit.html',
];

let checked = 0;
let failed = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`MISSING ${rel}`);
    failed++;
    continue;
  }
  const html = fs.readFileSync(abs, 'utf8');
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (type && !/^(text\/javascript|application\/javascript|module)$/i.test(type)) continue;
    scripts.push(match[2]);
  }
  if (!scripts.length) {
    console.log(`SKIP ${rel} — no inline JavaScript`);
    continue;
  }
  scripts.forEach((source, i) => {
    try {
      new vm.Script(source, { filename: `${rel}#inline-${i + 1}` });
      checked++;
    } catch (err) {
      failed++;
      console.error(`BAD  ${rel} inline script ${i + 1}: ${err.message}`);
    }
  });
  if (!failed) console.log(`OK   ${rel} (${scripts.length} inline script${scripts.length === 1 ? '' : 's'})`);
}

console.log(`\nInline scripts parsed: ${checked}; failures: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
