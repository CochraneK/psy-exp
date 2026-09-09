/**
 * Add participant tracking integration to all 10 MCCB test pages.
 * Run: node tests/add-participant.cjs
 *
 * For each page:
 *  1. Add <script src="mccb-participant.js"> after mccb-common.css link
 *  2. Add markInProgress() before the test starts
 *  3. Add ParticipantManager.saveResult() alongside existing localStorage.setItem
 *  4. Add "返回测验中心" button on result page
 *  5. Init participant from URL on DOMContentLoaded
 */
const fs = require('fs');
const path = require('path');

const DIR = 'D:/Software/DSH/psy-exp';

// Per-page config: testKey, startTest line desc, save line desc, resultPageId
const PAGE_CONFIG = [
  { file:'mccb-msceit.html', key:'msceit', startFunc:'window.startTest()',
    savePattern:'localStorage.setItem(\'mccb-msceit-result\'',
    resultPage:'page-result' },
  { file:'mccb-bacs.html', key:'bacs', startFunc:'function startTest',
    savePattern:'localStorage.setItem(\'mccb-bacs-result\'',
    resultPage:'page-result' },
  { file:'mccb-hvlt.html', key:'hvlt', startFunc:'startTrial(1)',
    savePattern:'localStorage.setItem(\'mccb-hvlt-result\'',
    resultPage:'page-result' },
  { file:'mccb-fluency.html', key:'fluency', startFunc:'function startTest',
    savePattern:'localStorage.setItem(\'mccb-fluency-result\'',
    resultPage:'page-result' },
  { file:'mccb-spatial-span.html', key:'spatial-span', startFunc:'function startTest',
    savePattern:'localStorage.setItem(\'mccb-spatial-span-result\'',
    resultPage:'page-result' },
  { file:'mccb-lns.html', key:'lns', startFunc:'function startTest',
    savePattern:'localStorage.setItem(\'mccb-lns-result\'',
    resultPage:'page-result' },
  { file:'mccb-tmt.html', key:'tmt', startFunc:'function startTestPhase',
    savePattern:'localStorage.setItem(\'mccb-tmt-result\'',
    resultPage:'page-result' },
  { file:'mccb-bvmt.html', key:'bvmt', startFunc:'function startTest',
    savePattern:'localStorage.setItem(\'mccb-bvmt-result\'',
    resultPage:'page-result' },
  { file:'mccb-mazes.html', key:'mazes', startFunc:'function startTest',
    savePattern:'localStorage.setItem(\'mccb-mazes-result\'',
    resultPage:'page-result' },
  { file:'mccb-cpt.html', key:'cpt', startFunc:'startPractice()',
    savePattern:'localStorage.setItem(\'mccb-cpt-result\'',
    resultPage:'page-results' },
];

function patchFile(cfg) {
  const fp = path.join(DIR, cfg.file);
  let content = fs.readFileSync(fp, 'utf-8');
  let changes = 0;

  // 1. Add participant script reference after mccb-common.css link
  const cssLink = '<link rel="stylesheet" href="mccb-common.css">';
  const scriptTag = '<script src="mccb-participant.js"></script>';
  if (content.includes(scriptTag)) {
    console.log(`  ${cfg.file}: already has participant script`);
  } else if (content.includes(cssLink)) {
    content = content.replace(cssLink, cssLink + '\n' + scriptTag);
    changes++;
    console.log(`  ${cfg.file}: + participant script reference`);
  } else {
    console.log(`  ${cfg.file}: WARN - no mccb-common.css link found`);
  }

  // 2. Add markInProgress() at start of test
  // Inject after `applyModeStyles()` call (present in all pages)
  const modeStyleCall = 'applyModeStyles();';
  const markProgress = modeStyleCall + '\n    ParticipantManager.initFromUrl(); ParticipantManager.markInProgress(\'' + cfg.key + '\');';
  if (content.includes(markProgress)) {
    console.log(`  ${cfg.file}: already has markInProgress`);
  } else if (content.includes(modeStyleCall)) {
    content = content.replace(modeStyleCall, markProgress);
    changes++;
    console.log(`  ${cfg.file}: + markInProgress`);
  } else {
    // Fallback: try inserting near startTest or startPractice
    const altPatterns = [
      { from: `function startTest() {\n  document.body.classList.add('testing-active');\n  applyModeStyles();`, to: `function startTest() {\n  document.body.classList.add('testing-active');\n  applyModeStyles();\n  ParticipantManager.initFromUrl(); ParticipantManager.markInProgress('${cfg.key}');` },
      { from: `function startPractice() {\n  document.body.classList.add('testing-active');\n  applyModeStyles();`, to: `function startPractice() {\n  document.body.classList.add('testing-active');\n  applyModeStyles();\n  ParticipantManager.initFromUrl(); ParticipantManager.markInProgress('${cfg.key}');` },
      { from: `function startTestPhase() {\n  document.body.classList.add('testing-active');\n  applyModeStyles();`, to: `function startTestPhase() {\n  document.body.classList.add('testing-active');\n  applyModeStyles();\n  ParticipantManager.initFromUrl(); ParticipantManager.markInProgress('${cfg.key}');` },
    ];
    let matched = false;
    for (const p of altPatterns) {
      if (content.includes(p.from)) {
        content = content.replace(p.from, p.to);
        changes++;
        matched = true;
        console.log(`  ${cfg.file}: + markInProgress (alt pattern)`);
        break;
      }
    }
    if (!matched) {
      console.log(`  ${cfg.file}: WARN - no applyModeStyles() found for markInProgress`);
    }
  }

  // 3. Add ParticipantManager.saveResult() alongside save line
  // The save line is: localStorage.setItem('mccb-xxx-result', JSON.stringify(data));
  // We need to insert ParticipantManager.saveResult() right after it
  const saveLine = cfg.savePattern;
  if (content.includes('ParticipantManager.saveResult(\'' + cfg.key + '\'')) {
    console.log(`  ${cfg.file}: already has saveResult`);
  } else if (content.includes(saveLine)) {
    content = content.replace(saveLine + ',',
      saveLine + ',');
    // Actually, let's find the full line and add after it
    const lines = content.split('\n');
    let foundSave = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(saveLine) && !lines[i].includes('ParticipantManager')) {
        const indent = lines[i].match(/^\s*/)[0];
        lines[i] = lines[i] + '\n' + indent + 'ParticipantManager.saveResult(\'' + cfg.key + '\', data);';
        content = lines.join('\n');
        changes++;
        foundSave = true;
        console.log(`  ${cfg.file}: + saveResult at line ~${i+1}`);
        break;
      }
    }
    if (!foundSave) {
      console.log(`  ${cfg.file}: WARN - saveLine found but injection failed`);
    }
  } else {
    console.log(`  ${cfg.file}: WARN - save line not found`);
  }

  // 4. Add "返回测验中心" button on result page
  // Add it inside the result page section, before its closing </section>
  const resultSectionEnd = '</section>\n\n  <!-- =========' ;
  const backBtnHtml = '<p style="text-align:center;margin-top:20px;"><a href="index.html" class="btn btn-outline" style="display:inline-block;padding:10px 28px;text-decoration:none;">← 返回测验中心</a></p>';
  const backBtnPattern1 = '<p style="text-align:center;margin-top:20px;"><a href="index.html" class="btn btn-outline" style="display:inline-block;padding:10px 28px;text-decoration:none;">← 返回测验中心</a></p>\n' + resultSectionEnd;
  const backBtnPattern2 = '<p style="text-align:center;margin-top:20px;"><a href="index.html" class="btn btn-outline" style="display:inline-block;padding:10px 28px;text-decoration:none;">← 返回测验中心</a></p>';
  const resultPageClose = '<\/section>\n\n  <!-- =========';

  if (content.includes('返回测验中心')) {
    console.log(`  ${cfg.file}: already has back button`);
  } else {
    // Find the result page section close tag
    const resultId = cfg.resultPage;
    // Find section with id=resultPage and close it
    const secRegex = new RegExp('(<section[^>]*id="' + resultId + '"[^>]*>)([\\s\\S]*?)(</section>)', 'i');
    const match = content.match(secRegex);
    if (match) {
      const full = match[0];
      const closeTag = match[3];
      const body = match[2];
      // Add back button inside, before </section>
      const newBody = body + '\n  ' + backBtnHtml;
      const newFull = match[1] + newBody + closeTag;
      content = content.replace(full, newFull);
      changes++;
      console.log(`  ${cfg.file}: + back button on ${resultId}`);
    } else {
      console.log(`  ${cfg.file}: WARN - result section id="${resultId}" not found`);
    }
  }

  // Write back
  if (changes > 0) {
    fs.writeFileSync(fp, content, 'utf-8');
    console.log(`  ${cfg.file}: written (${changes} changes)`);
  } else {
    console.log(`  ${cfg.file}: no changes needed`);
  }
}

console.log('Adding participant tracking to MCCB pages...');
PAGE_CONFIG.forEach(patchFile);
console.log('Done!');
