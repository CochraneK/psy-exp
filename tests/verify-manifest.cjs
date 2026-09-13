'use strict';
const fs=require('fs');const path=require('path');
const manifest=require(path.resolve(__dirname,'../task-manifest.json'));
const runtime=require(path.resolve(__dirname,'../mccb-participant.js'));
const {MCCBScoring}=require(path.resolve(__dirname,'../mccb-scoring.js'));
let pass=0,fail=0;function check(name,cond,detail=''){if(cond){pass++;console.log('  ✅ '+name)}else{fail++;console.log('  ❌ '+name+(detail?' — '+detail:''))}}
console.log('=== Task manifest contract ===');
check('manifest mode research prototype',manifest.projectMode==='research-prototype');
check('exactly ten tasks',Array.isArray(manifest.tasks)&&manifest.tasks.length===10,String(manifest.tasks&&manifest.tasks.length));
const keys=manifest.tasks.map(t=>t.key);check('task keys unique',new Set(keys).size===10);check('runtime task keys match manifest',Object.keys(runtime.TASK_VERSIONS).every(k=>keys.includes(k))&&keys.every(k=>Object.prototype.hasOwnProperty.call(runtime.TASK_VERSIONS,k)));
for(const task of manifest.tasks){check(`${task.key}: version matches runtime`,task.taskVersion===runtime.TASK_VERSIONS[task.key],`${task.taskVersion} vs ${runtime.TASK_VERSIONS[task.key]}`);check(`${task.key}: never claims equivalence`,task.mccbEquivalent===false);check(`${task.key}: material policy explicit`,typeof task.materialPolicy==='string'&&task.materialPolicy.length>0);check(`${task.key}: timing status explicit`,typeof task.timingStatus==='string'&&task.timingStatus.length>0);check(`${task.key}: scoring validation exists`,!!MCCBScoring.TASK_VALIDATION[task.key]);}
const hvlt=manifest.tasks.find(t=>t.key==='hvlt');check('HVLT requires private licensed assets',hvlt&&hvlt.materialPolicy==='private-licensed-assets-required'&&hvlt.publicExecutable===false);
check('private stimuli path git-ignored',/\nprivate\/\n/.test(fs.readFileSync(path.resolve(__dirname,'../.gitignore'),'utf8')));
check('public docs no operator-form A',!fs.existsSync(path.resolve(__dirname,'../docs/7.简版MCCB操作者表格（A）_vlm.txt')));check('public docs no operator-form B',!fs.existsSync(path.resolve(__dirname,'../docs/8.简版MCCB操作者表格（B）_vlm.txt')));
const hvltHtml=fs.readFileSync(path.resolve(__dirname,'../pages/mccb-hvlt.html'),'utf8');check('HVLT page loads private stimulus file',hvltHtml.includes('../private/stimuli.js'));check('HVLT page has no public WORD_LIST constant',!hvltHtml.includes('WORD_LIST'));
console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);process.exit(fail===0?0:1);
