'use strict';
/* Research table export contract (research-table-export-1.0.0):
   module shape, manifest alignment, table builders, RFC 4180 CSV, export audit trail,
   page/CI wiring, and the free-text privacy boundary. */
const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..');
let pass=0,fail=0;
function check(name,cond,detail=''){if(cond){pass++;console.log('  ✅ '+name)}else{fail++;console.log('  ❌ '+name+(detail?' — '+detail:''))}}
console.log('=== Research table export contract ===');

const RE=require(path.join(ROOT,'research-export.js'));

/* ---------- 1. Module shape ---------- */
check('EXPORT_VERSION pinned',RE.EXPORT_VERSION==='research-table-export-1.0.0',RE.EXPORT_VERSION);
for(const fn of['buildParticipantWide','buildAttempts','buildProvenance','buildAudit','toCSV','downloadCSV','recordExportAudit'])check('api '+fn,typeof RE[fn]==='function');
check('TASK_KEYS covers the eleven tasks',RE.TASK_KEYS.length===11);
check('browser global mounted',globalThis.ResearchExport===RE);

/* ---------- 2. Manifest alignment ---------- */
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'task-manifest.json'),'utf8'));
check('manifest tableExportVersion aligned',manifest.tableExportVersion===RE.EXPORT_VERSION,`${manifest.tableExportVersion} vs ${RE.EXPORT_VERSION}`);

/* ---------- Fixtures ---------- */
const TV={tmt:'tmt-web-0.4.0',bacs:'bacs-web-0.4.0',fluency:'fluency-web-0.4.0',cpt:'cpt-web-0.4.0','spatial-span':'spatial-span-web-0.4.0',lns:'lns-web-0.4.0',hvlt:'hvlt-web-0.5.0',bvmt:'bvmt-web-0.4.0',mazes:'mazes-web-0.4.0',msceit:'msceit-web-0.4.0',bwais:'bwais-web-0.2.0'};
const T0='2026-10-27T01:00:00.000Z',T1='2026-10-28T01:00:00.000Z';
const at=(n)=>`2026-10-28T0${1+n}:00:00.000Z`;
function makeMeta(testKey,recordedAt,status='valid'){
  return{schemaVersion:4,taskVersion:TV[testKey],runtimeVersion:'research-runtime-0.5.0',administration:'digital_research_adaptation',mccbEquivalent:false,participantId:'P1',recordedAt,provenance:{runtimeVersion:'research-runtime-0.5.0',taskVersion:TV[testKey],source:'browser-local'},sessionQc:{testKey,taskVersion:TV[testKey],runtimeVersion:'research-runtime-0.5.0',timingPolicy:{mode:'absolute-deadline'},status,startedAt:recordedAt,completedAt:recordedAt,startedPerfMs:0,elapsedMs:1234,clock:'performance.now',qc:{visibilityInterruptions:0,timingViolation:false,technicalFailure:false,timerDriftMaxMs:5,timerSamples:12,reasons:[]},events:[]}};
}
const enrich=(testKey,payload,recordedAt,status='valid')=>Object.assign({},payload,{_meta:makeMeta(testKey,recordedAt,status)});
const PROTOCOLS={tmt:'trail-making-browser-synthetic-v2',bacs:'symbol-coding-synthetic-v1',fluency:'typed-animal-fluency-v1',cpt:'identical-pairs-4digit-research-v2','spatial-span':'synthetic-spatial-sequence-v1',lns:'synthetic-letter-number-ordering-v1',hvlt:'hvlt-r-5trial-recognition-private-shell-v1',bvmt:'synthetic-visual-pattern-v1',mazes:'generated-perfect-mazes-v1',msceit:'private-social-cognition-shell-v1',bwais:'brief-wais-4subtest-synthetic-v1'};
const results={
  'mccb-tmt-result':enrich('tmt',{protocol:PROTOCOLS.tmt,partA:{time:42.5,errors:1},partB:{time:88.2,errors:3}},at(1)),
  'mccb-bacs-result':enrich('bacs',{protocol:PROTOCOLS.bacs,correct:40,attempted:45},at(2)),
  'mccb-fluency-result':enrich('fluency',{protocol:PROTOCOLS.fluency,total:23,unique:19,duplicates:4,entries:['老虎','狐狸','cat, "big" dog','elephant'],reviewStatus:'verified',semanticReview:{status:'verified',reviewedAt:T1,reviewer:'r1'}},at(3)),
  'mccb-cpt-result':enrich('cpt',{protocol:PROTOCOLS.cpt,hits:20,misses:2,falseAlarms:3,meanHitRT:612.4,meanFART:590.1,dPrime:3.2,totalTrials:25,timing:{maxOnsetErrorMs:12}},at(4)),
  'mccb-spatial-span-result':enrich('spatial-span',{protocol:PROTOCOLS['spatial-span'],totalCorrect:9,maxLevel:4},at(5)),
  'mccb-lns-result':enrich('lns',{protocol:PROTOCOLS.lns,totalCorrect:11,maxLevel:5},at(6)),
  'mccb-hvlt-result':enrich('hvlt',{protocol:PROTOCOLS.hvlt,trial1:5,trial2:6,trial3:7,trial4:8,trial5:9,recognition:4,delayedRecall:8,stimulusSet:{id:'priv-hvlt-1',version:'v1',fingerprint:'ab12cd34'}},at(7)),
  'mccb-bvmt-result':enrich('bvmt',{protocol:PROTOCOLS.bvmt,trials:[{score:1},{score:2},{score:3},{score:4},{score:5}],delayedScore:4},at(8)),
  'mccb-mazes-result':enrich('mazes',{protocol:PROTOCOLS.mazes,totalScore:18,maxScore:26,completed:[1,1,1,1,0,1,1],totalTime:321},at(9)),
  'mccb-msceit-result':enrich('msceit',{protocol:PROTOCOLS.msceit,scoring:{total:20,correct:14,rawScore:17,version:'private-1'},elapsed:540},at(10)),
  'mccb-bwais-result':enrich('bwais',{protocol:PROTOCOLS.bwais,materialSet:{id:'bwais-1',version:'v1',fingerprint:'feedbeef'},knowledge:{rawScore:null,maxScore:29,administered:29,answers:{k1:'老虎会爬树'}},similarities:{rawScore:null,maxScore:26,administered:13,answers:{s1:'都是交通工具'}},pictureCompletion:{rawScore:null,maxScore:21,administered:21,answers:{p1:'缺了轮子'}},blockDesign:{rawScore:38,maxScore:48,administered:10,items:[]},reviewStatus:'unreviewed'},at(11))
};
const attemptHistory={};
for(const k of RE.TASK_KEYS)attemptHistory['mccb-'+k+'-result']=[results['mccb-'+k+'-result']];
attemptHistory['mccb-bacs-result']=[
  enrich('bacs',{protocol:PROTOCOLS.bacs,correct:5,attempted:9},T0,'aborted'),
  results['mccb-bacs-result']
];
const participantData={schemaVersion:4,runtimeVersion:'research-runtime-0.5.0',exportDate:T1,participantCount:1,participants:{P1:{schemaVersion:4,runtimeVersion:'research-runtime-0.5.0',cohortId:'P1',createdAt:T0,updatedAt:T1,progress:Object.fromEntries(RE.TASK_KEYS.map(k=>[k,'completed'])),sessions:{},results,invalidResults:{},attemptHistory}}};
const researchData={schemaVersion:1,modelVersion:'research-data-model-1.1.0',createdAt:T0,updatedAt:T1,study:{id:'study-x',label:'Study X',consentVersion:'cv-1',protocolGovernance:'protocol-lock-v1'},sites:{'site-a':{id:'site-a',label:'Site A',createdAt:T0}},participants:{P1:{id:'P1',studyId:'study-x',siteId:'site-a',createdAt:T0,updatedAt:T1,status:'active',consent:{status:'granted',version:'cv-1',recordedAt:T0,operatorId:'op-1',note:null}}},sessions:{},attempts:[{id:'attempt-1',studyId:'study-x',siteId:'site-a',sessionId:'session-1',participantId:'P1',testKey:'tmt',taskVersion:TV.tmt,protocolId:PROTOCOLS.tmt,qcStatus:'valid',recordedAt:at(1),source:'participant-manager-history',sourceKey:'P1|tmt|tmt-web-0.4.0|trail-making-browser-synthetic-v2|rec|valid'}],audit:[{id:'audit-1',type:'study_configured',at:T0,detail:{studyId:'study-x',siteId:'site-a',consentVersion:'cv-1'}},{id:'audit-2',type:'participant_consent_recorded',at:T0,detail:null}],builds:{}};

/* ---------- 3. participant_wide ---------- */
const wide=RE.buildParticipantWide({participantData,researchData});
check('wide: common column block first',wide.columns.slice(0,11).join('|')===RE.WIDE_COMMON.join('|'));
check('wide: all eleven task column groups present',RE.TASK_KEYS.every(k=>RE.TASK_COLUMNS[k].every(([n])=>wide.columns.includes(n))));
check('wide: one row per participant',wide.rows.length===1,String(wide.rows.length));
const w=wide.rows[0]||{};
check('wide: participant identity + site',w.participant_id==='P1'&&w.site_id==='site-a'&&w.status==='active');
check('wide: consent merged from research layer',w.consent_status==='granted'&&w.consent_version==='cv-1'&&w.consent_recorded_at===T0&&w.consent_operator_id==='op-1');
check('wide: progress counts',w.tasks_completed===11&&w.tasks_invalid===0);
check('wide: tmt canonical scores',w.tmt_part_a_time_s===42.5&&w.tmt_part_a_errors===1&&w.tmt_part_b_time_s===88.2&&w.tmt_part_b_errors===3);
check('wide: bacs accuracy derived',w.bacs_accuracy_pct===88.9,String(w.bacs_accuracy_pct));
check('wide: hvlt derived totals',w.hvlt_total_learning===35&&w.hvlt_recognition===4&&w.hvlt_delayed_recall===8);
check('wide: bvmt derived totals',w.bvmt_total_learning===15&&w.bvmt_trials_completed===5&&w.bvmt_delayed_recall===4);
check('wide: mazes completion count',w.mazes_completed===7&&w.mazes_total_score===18&&w.mazes_max_score===26);
check('wide: bwais fail-closed pre-review',w.bwais_knowledge_score===null&&w.bwais_similarities_score===null&&w.bwais_picture_score===null&&w.bwais_block_design_score===38&&w.bwais_total===null&&w.bwais_review_status==='unreviewed');
const p2=RE.buildParticipantWide({participantData:{participants:{P2:{progress:{},results:{}}}},researchData});
check('wide: no-result participant → null score cells',p2.rows.length===1&&p2.rows[0].tmt_part_a_time_s===undefined&&p2.rows[0].tasks_completed===0);
check('wide: invalid inputs → empty table',RE.buildParticipantWide({}).rows.length===0&&RE.buildParticipantWide({participantData:null,researchData:'x'}).rows.length===0);

/* ---------- 4. attempts ---------- */
const att=RE.buildAttempts({participantData});
check('attempts: 11 canonical + 1 invalid = 12 rows',att.rows.length===12,String(att.rows.length));
const bacsRows=att.rows.filter(r=>r.task==='bacs').sort((a,b)=>a.attempt_number-b.attempt_number);
check('attempts: per-task numbering',bacsRows.length===2&&bacsRows[0].attempt_number===1&&bacsRows[1].attempt_number===2);
check('attempts: is_canonical flags',bacsRows[0].is_canonical===0&&bacsRows[1].is_canonical===1,String(bacsRows.map(r=>r.is_canonical)));
check('attempts: qc status propagated',bacsRows[0].qc_status==='aborted'&&bacsRows[1].qc_status==='valid');
check('attempts: both attempts carry scores',bacsRows[0].bacs_correct===5&&bacsRows[1].bacs_correct===40);
const tmtRow=att.rows.find(r=>r.task==='tmt')||{};
check('attempts: task-scoped score columns',tmtRow.tmt_part_a_time_s===42.5&&tmtRow.bacs_correct===undefined);
const fluRow=att.rows.find(r=>r.task==='fluency')||{};
check('attempts: review_status on fluency',fluRow.review_status==='verified');
check('attempts: review_status null elsewhere',tmtRow.review_status===null);
check('attempts: session qc fields',tmtRow.elapsed_ms===1234&&tmtRow.visibility_interruptions===0&&tmtRow.timer_drift_max_ms===5&&tmtRow.timing_violation===0&&tmtRow.technical_failure===0);
check('attempts: task_version + protocol_id',tmtRow.task_version===TV.tmt&&tmtRow.protocol_id===PROTOCOLS.tmt&&tmtRow.recorded_at===at(1));
check('attempts: invalid inputs → empty table',RE.buildAttempts({}).rows.length===0);

/* ---------- 5. provenance ---------- */
const prov=RE.buildProvenance({researchData});
check('provenance: column set',prov.columns.join('|')===RE.PROVENANCE_COLUMNS.join('|'));
check('provenance: row mapping',prov.rows.length===1&&prov.rows[0].attempt_id==='attempt-1'&&prov.rows[0].test_key==='tmt'&&prov.rows[0].qc_status==='valid'&&prov.rows[0].source_key.includes('|'));
check('provenance: empty researchData → 0 rows',RE.buildProvenance({}).rows.length===0);

/* ---------- 6. audit_log ---------- */
const aud=RE.buildAudit({researchData});
check('audit_log: row mapping',aud.rows.length===2&&aud.rows[0].audit_id==='audit-1'&&aud.rows[0].type==='study_configured'&&aud.rows[0].at===T0);
check('audit_log: detail_json roundtrip',JSON.parse(aud.rows[0].detail_json).studyId==='study-x');
check('audit_log: null detail stays null',aud.rows[1].detail_json===null);

/* ---------- 7. toCSV (RFC 4180) ---------- */
const csv=RE.toCSV({columns:['a','b','c'],rows:[{a:'x,y',b:1,c:true},{a:'say "hi"',b:null,c:false}]});
check('csv: UTF-8 BOM prefix',csv.charCodeAt(0)===0xFEFF);
check('csv: CRLF line endings + trailing CRLF',csv.endsWith('\r\n')&&!csv.includes('\n\r'));
const lines=csv.slice(1).split('\r\n');
check('csv: header row',lines[0]==='a,b,c');
check('csv: comma field quoted',lines[1]==='"x,y",1,1');
check('csv: quotes doubled, null empty, false→0',lines[2]==='"say ""hi""",,0');
check('csv: empty rows → header only',RE.toCSV({columns:['a'],rows:[]})==='\uFEFFa\r\n');
check('csv: numbers keep decimal form',RE.toCSV(wide).includes('42.5'));

/* ---------- 8. recordExportAudit ---------- */
let savedD=null;
global.ResearchData={snapshot:()=>JSON.parse(JSON.stringify(researchData)),_save:d=>{savedD=d;return true}};
const beforeAuditLen=researchData.audit.length;
const rec=RE.recordExportAudit({table:'participant_wide',rows:1,operatorId:' op 1 '});
check('audit: recorded + entryId',rec.recorded===true&&typeof rec.entryId==='string'&&rec.entryId.startsWith('audit-'));
check('audit: entry appended once',savedD&&savedD.audit.length===beforeAuditLen+1&&savedD.audit[beforeAuditLen].type==='table_exported');
const det=savedD&&savedD.audit[beforeAuditLen]&&savedD.audit[beforeAuditLen].detail;
check('audit: detail fields (table/rows/operator/version)',det&&det.table==='participant_wide'&&det.rows===1&&det.operatorId==='op-1'&&det.exportVersion===RE.EXPORT_VERSION);
check('audit: original snapshot object untouched',researchData.audit.length===beforeAuditLen);
check('audit: invalid table rejected',RE.recordExportAudit({table:'',rows:5}).reason==='invalid_export_record');
check('audit: negative rows rejected',RE.recordExportAudit({table:'x',rows:-1}).reason==='invalid_export_record');
global.ResearchData={snapshot:()=>JSON.parse(JSON.stringify(researchData)),_save:()=>false};
check('audit: persist failure reported',RE.recordExportAudit({table:'x',rows:1}).reason==='persist_failed');
delete global.ResearchData;
check('audit: missing ResearchData reported',RE.recordExportAudit({table:'x',rows:1}).reason==='research_data_unavailable');
delete global.ResearchData;

/* ---------- 9. downloadCSV ---------- */
check('download: no document → false',RE.downloadCSV('x.csv',{columns:['a'],rows:[]})===false);
let captured=null;
global.document={createElement:()=>(captured={href:'',download:'',click(){}})};
const dl=RE.downloadCSV('psy-exp-test.csv',{columns:['a'],rows:[{a:1}]});
check('download: document path → true + filename',dl===true&&captured&&captured.download==='psy-exp-test.csv');
check('download: blob url assigned',captured&&String(captured.href).startsWith('blob:'));
delete global.document;

/* ---------- 10. Page + CI wiring ---------- */
const dg=fs.readFileSync(path.join(ROOT,'data-governance.html'),'utf8');
check('page: loads research-export.js',dg.includes('<script src="research-export.js"></script>'));
for(const id of['exportParticipantWideBtn','exportAttemptsBtn','exportProvenanceBtn','exportAuditBtn','exportStatus'])check('page: element '+id,dg.includes(`id="${id}"`));
check('page: handler records export audit',dg.includes('ResearchExport.recordExportAudit'));
const battery=fs.readFileSync(path.join(ROOT,'tests','full-battery.cjs'),'utf8');
check('battery: export group registered',battery.includes("['research table export','tests/verify-export.cjs']"));
const ci=fs.readFileSync(path.join(ROOT,'.github','workflows','ci.yml'),'utf8');
check('ci: node --check entries',ci.includes('node --check research-export.js')&&ci.includes('node --check tests/verify-export.cjs'));
check('ci: file guard',ci.includes('test -f research-export.js'));
check('ci: version greps',ci.includes("grep -q \"EXPORT_VERSION='research-table-export-1.0.0'\" research-export.js")&&ci.includes("grep -q '\"tableExportVersion\": \"research-table-export-1.0.0\"' task-manifest.json"));
check('ci: page wiring grep',ci.includes("grep -q 'id=\"exportParticipantWideBtn\"' data-governance.html"));

/* ---------- 11. Privacy boundary (free text stays out of tables) ---------- */
const wideText=RE.toCSV(wide);
const attText=RE.toCSV(att);
check('privacy: fluency free text stays out of wide',!wideText.includes('老虎')&&!wideText.includes('cat, "big" dog'));
check('privacy: fluency free text stays out of attempts',!attText.includes('老虎')&&!attText.includes('elephant'));
check('privacy: bwais open answers stay out of all tables',!wideText.includes('都是交通工具')&&!attText.includes('缺了轮子'));

console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);
process.exit(fail===0?0:1);
