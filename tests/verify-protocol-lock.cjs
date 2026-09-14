'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const manifest=require(path.join(ROOT,'task-manifest.json'));
const lock=require(path.join(ROOT,'protocol-lock.json'));
const runtime=require(path.join(ROOT,'mccb-participant.js'));
let pass=0,fail=0;
function check(name,cond,detail=''){if(cond){pass++;console.log('  ✅ '+name)}else{fail++;console.log('  ❌ '+name+(detail?' — '+detail:''))}}
console.log('=== Protocol freeze / version governance ===');
check('protocol governance declared',manifest.protocolGovernance==='protocol-lock-v1',String(manifest.protocolGovernance));
check('lock version supported',lock.lockVersion===1,String(lock.lockVersion));
check('change policy documented',typeof lock.policy==='string'&&lock.policy.includes('protocolId')&&lock.policy.includes('taskVersion'));
const manifestKeys=manifest.tasks.map(t=>t.key).sort();
const lockKeys=Object.keys(lock.tasks||{}).sort();
check('lock covers exactly manifest tasks',JSON.stringify(manifestKeys)===JSON.stringify(lockKeys),`${manifestKeys.join(',')} vs ${lockKeys.join(',')}`);
for(const task of manifest.tasks){
  const frozen=lock.tasks&&lock.tasks[task.key];
  check(`${task.key}: frozen entry exists`,!!frozen);
  if(!frozen)continue;
  check(`${task.key}: protocolId is explicit`,typeof task.protocolId==='string'&&task.protocolId.length>4&&!task.protocolId.includes('legacy'),String(task.protocolId));
  check(`${task.key}: manifest protocol matches lock`,task.protocolId===frozen.protocolId,`${task.protocolId} vs ${frozen.protocolId}`);
  check(`${task.key}: manifest version matches lock`,task.taskVersion===frozen.taskVersion,`${task.taskVersion} vs ${frozen.taskVersion}`);
  check(`${task.key}: runtime version matches lock`,runtime.TASK_VERSIONS[task.key]===frozen.taskVersion,`${runtime.TASK_VERSIONS[task.key]} vs ${frozen.taskVersion}`);
  const pagePath=path.join(ROOT,frozen.page||'');
  check(`${task.key}: frozen page exists`,fs.existsSync(pagePath),frozen.page);
  if(fs.existsSync(pagePath)){
    const html=fs.readFileSync(pagePath,'utf8');
    check(`${task.key}: page emits frozen protocol marker`,html.includes(frozen.protocolId),frozen.protocolId);
    check(`${task.key}: page uses participant runtime`,html.includes('../mccb-participant.js'));
  }
}
check('all runtime tasks are frozen',Object.keys(runtime.TASK_VERSIONS).every(k=>Object.prototype.hasOwnProperty.call(lock.tasks,k)));
console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);
process.exit(fail===0?0:1);
