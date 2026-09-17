'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const runtime=read('mccb-participant.js');
const taskFiles=[
  'pages/mccb-tmt.html','pages/mccb-bacs.html','pages/mccb-fluency.html','pages/mccb-cpt.html',
  'pages/mccb-spatial-span.html','pages/mccb-lns.html','pages/mccb-hvlt.html','pages/mccb-bvmt.html',
  'pages/mccb-mazes.html','pages/mccb-msceit.html'
];
let pass=0,fail=0;
function check(name,cond){if(cond){pass++;console.log('  ✅ '+name)}else{fail++;console.log('  ❌ '+name)}}
console.log('=== Participant task return contract ===');
check('shared return helper exists',runtime.includes('function installTaskReturnNavigation()'));
check('return decision uses URL participant context',runtime.includes('const participantId=ParticipantManager.getParticipantFromUrl()'));
check('standalone tasks fail open to existing homepage links',runtime.includes('if(!participantId)return false'));
check('homepage links are rewritten centrally',runtime.includes('a[href="../index.html"]'));
check('runner target preserves participant id',runtime.includes("../participant-runner.html?p=")&&runtime.includes('encodeURIComponent(participantId)'));
check('visible label is normalized to administration flow',runtime.includes("link.textContent='返回施测流程'"));
check('shared helper is installed from safety bootstrap',runtime.includes('installTaskReturnNavigation();'));
for(const file of taskFiles){
  const html=read(file);
  check(`${file} loads shared participant runtime`,html.includes('../mccb-participant.js'));
}
const directHome=taskFiles.filter(file=>read(file).includes('href="../index.html"'));
check('legacy homepage-return tasks remain declarative for runtime rewrite',directHome.length>=8);
check('TMT keeps its explicit runner route',read('pages/mccb-tmt.html').includes('href="../participant-runner.html"'));
console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);
process.exit(fail===0?0:1);
