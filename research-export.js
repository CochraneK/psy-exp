/* Research table export v1.0: flat CSV tables (participant_wide / attempts / provenance / audit_log) + export audit trail.
   Tables carry counts and scores only: free-text responses (fluency entries, BWAIS answers) and private material content
   never enter any table. BIDS-style TSV output is intentionally deferred until a concrete consumer exists. */
(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResearchExport=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const EXPORT_VERSION='research-table-export-1.0.0';
  const TASK_KEYS=['tmt','bacs','fluency','cpt','spatial-span','lns','hvlt','bvmt','mazes','msceit','bwais'];
  const resultKeyOf=k=>'mccb-'+k+'-result';
  const num=v=>{if(v==null)return null;const x=Number(v);return Number.isFinite(x)?x:null};
  const bool=v=>v==null?null:(v?1:0);
  const str=v=>v==null?null:String(v);
  const obj=v=>v&&typeof v==='object'?v:{};
  const finite=v=>Number.isFinite(Number(v));
  const isObj=v=>v&&typeof v==='object';
  // Null-safe mirror of mccb-scoring.js delayedValue (hvlt/bvmt delayed recall: number or {score}).
  const delayedOf=r=>{const o=obj(r);if(finite(o.delayedScore))return Number(o.delayedScore);const dr=o.delayedRecall;return isObj(dr)&&finite(dr.score)?Number(dr.score):num(dr)};
  // Null-safe mirror of mccb-scoring.js BWAIS open-item raw-score guard (Number(null)===0 trap).
  const bwaisRaw=o=>isObj(o)&&o.rawScore!=null&&Number.isFinite(Number(o.rawScore))?Number(o.rawScore):null;
  const bvmtTrialScores=r=>{const t=Array.isArray(r.trials)?r.trials:(Array.isArray(r.trialScores)?r.trialScores:[]);return t.map(x=>num(isObj(x)?x.score:x))};
  const TASK_COLUMNS={
    tmt:[
      ['tmt_part_a_time_s',r=>num(obj(r.partA).time)],
      ['tmt_part_a_errors',r=>num(obj(r.partA).errors)],
      ['tmt_part_b_time_s',r=>num(obj(r.partB).time)],
      ['tmt_part_b_errors',r=>num(obj(r.partB).errors)]
    ],
    bacs:[
      ['bacs_correct',r=>num(r.correct)],
      ['bacs_attempted',r=>num(r.attempted)],
      ['bacs_accuracy_pct',r=>{const c=num(r.correct),a=num(r.attempted);return c!=null&&a!=null&&a>0?Math.round(c/a*1000)/10:null}]
    ],
    fluency:[
      ['fluency_total_entries',r=>num(r.total!=null?r.total:r.unique)],
      ['fluency_unique_entries',r=>num(r.unique!=null?r.unique:r.total)],
      ['fluency_review_status',r=>str(r.reviewStatus||'unreviewed')]
    ],
    cpt:[
      ['cpt_hits',r=>num(r.hits)],
      ['cpt_misses',r=>num(r.misses)],
      ['cpt_false_alarms',r=>num(r.falseAlarms)],
      ['cpt_mean_hit_rt_ms',r=>num(r.meanHitRT!=null?r.meanHitRT:r.meanRT)],
      ['cpt_mean_far_rt_ms',r=>num(r.meanFART)],
      ['cpt_d_prime',r=>num(r.dPrime)],
      ['cpt_total_trials',r=>num(r.totalTrials)],
      ['cpt_max_onset_error_ms',r=>num(obj(r.timing).maxOnsetErrorMs)]
    ],
    'spatial-span':[
      ['spatial_span_total_correct',r=>num(r.totalCorrect)],
      ['spatial_span_max_level',r=>num(r.maxLevel)]
    ],
    lns:[
      ['lns_total_correct',r=>num(r.totalCorrect)],
      ['lns_max_level',r=>num(r.maxLevel)]
    ],
    hvlt:[
      ['hvlt_trial1',r=>num(r.trial1)],
      ['hvlt_trial2',r=>num(r.trial2)],
      ['hvlt_trial3',r=>num(r.trial3)],
      ['hvlt_trial4',r=>num(r.trial4)],
      ['hvlt_trial5',r=>num(r.trial5)],
      ['hvlt_total_learning',r=>{const ts=[num(r.trial1),num(r.trial2),num(r.trial3),num(r.trial4),num(r.trial5)];return ts.every(x=>x!=null)?ts.reduce((a,b)=>a+b,0):null}],
      ['hvlt_recognition',r=>num(r.recognition)],
      ['hvlt_delayed_recall',r=>delayedOf(r)]
    ],
    bvmt:[
      ['bvmt_total_learning',r=>{const s=bvmtTrialScores(r).filter(x=>x!=null);return s.length?s.reduce((a,b)=>a+b,0):null}],
      ['bvmt_delayed_recall',r=>delayedOf(r)],
      ['bvmt_trials_completed',r=>{const t=Array.isArray(r.trials)?r.trials:(Array.isArray(r.trialScores)?r.trialScores:null);return Array.isArray(t)?t.length:null}]
    ],
    mazes:[
      ['mazes_total_score',r=>num(r.totalScore)],
      ['mazes_max_score',r=>num(r.maxScore)],
      ['mazes_completed',r=>Array.isArray(r.completed)?r.completed.length:num(r.completed)],
      ['mazes_total_time_s',r=>num(r.totalTime)]
    ],
    msceit:[
      ['msceit_total_items',r=>{const s=obj(r.scoring);return num(r.total!=null?r.total:s.total)}],
      ['msceit_correct',r=>{const s=obj(r.scoring);return num(r.correct!=null?r.correct:s.correct)}],
      ['msceit_raw_score',r=>{const s=obj(r.scoring);const a=num(r.rawScore),b=num(s.rawScore);if(a!=null)return a;if(b!=null)return b;return num(r.correct!=null?r.correct:s.correct)}],
      ['msceit_elapsed_s',r=>num(r.elapsed)]
    ],
    bwais:[
      ['bwais_knowledge_score',r=>bwaisRaw(r.knowledge)],
      ['bwais_similarities_score',r=>bwaisRaw(r.similarities)],
      ['bwais_picture_score',r=>bwaisRaw(r.pictureCompletion)],
      ['bwais_block_design_score',r=>bwaisRaw(r.blockDesign)],
      ['bwais_total',r=>num(r.total)],
      ['bwais_review_status',r=>str(r.reviewStatus||'unreviewed')]
    ]
  };
  const WIDE_COMMON=['participant_id','site_id','status','consent_status','consent_version','consent_recorded_at','consent_operator_id','created_at','updated_at','tasks_completed','tasks_invalid'];
  const ATTEMPTS_COMMON=['participant_id','task','attempt_number','is_canonical','qc_status','review_status','recorded_at','elapsed_ms','visibility_interruptions','timer_drift_max_ms','timing_violation','technical_failure','task_version','protocol_id'];
  const PROVENANCE_COLUMNS=['attempt_id','study_id','site_id','session_id','participant_id','test_key','task_version','protocol_id','qc_status','recorded_at','source','source_key'];
  const AUDIT_COLUMNS=['audit_id','type','at','detail_json'];
  const BAD_PROGRESS=['completed_invalid','aborted','interrupted','timing_violation','technical_failure'];
  function participantsOf(participantData){return isObj(participantData)&&isObj(participantData.participants)?participantData.participants:{}}
  function sortedIds(o){return Object.keys(o).sort()}
  function taskColumns(){const out=[];for(const k of TASK_KEYS)for(const [name] of TASK_COLUMNS[k])out.push(name);return out}
  function buildParticipantWide(input={}){
    const parts=participantsOf(input.participantData);
    const rpAll=isObj(input.researchData)&&isObj(input.researchData.participants)?input.researchData.participants:{};
    const columns=[...WIDE_COMMON,...taskColumns()];
    const rows=[];
    for(const id of sortedIds(parts)){
      const p=isObj(parts[id])?parts[id]:{};
      const rp=isObj(rpAll[id])?rpAll[id]:{};
      const consent=isObj(rp.consent)?rp.consent:{};
      const progress=isObj(p.progress)?p.progress:{};
      const vals=Object.values(progress);
      const row={
        participant_id:id,
        site_id:rp.siteId||null,
        status:rp.status||'active',
        consent_status:consent.status||null,
        consent_version:consent.version||null,
        consent_recorded_at:consent.recordedAt||null,
        consent_operator_id:consent.operatorId||null,
        created_at:p.createdAt||null,
        updated_at:p.updatedAt||null,
        tasks_completed:vals.filter(x=>x==='completed').length,
        tasks_invalid:vals.filter(x=>BAD_PROGRESS.includes(x)).length
      };
      const results=isObj(p.results)?p.results:{};
      for(const k of TASK_KEYS){
        const r=results[resultKeyOf(k)];
        if(isObj(r))for(const [name,fn] of TASK_COLUMNS[k])row[name]=fn(r);
      }
      rows.push(row);
    }
    return{columns,rows};
  }
  function buildAttempts(input={}){
    const parts=participantsOf(input.participantData);
    const columns=[...ATTEMPTS_COMMON,...taskColumns()];
    const rows=[];
    for(const id of sortedIds(parts)){
      const p=isObj(parts[id])?parts[id]:{};
      const history=isObj(p.attemptHistory)?p.attemptHistory:{};
      const results=isObj(p.results)?p.results:{};
      for(const k of TASK_KEYS){
        const rk=resultKeyOf(k);
        const items=Array.isArray(history[rk])?history[rk]:[];
        const canonical=results[rk];
        const canonicalAt=isObj(canonical)&&isObj(canonical._meta)?canonical._meta.recordedAt:null;
        items.forEach((item,i)=>{
          if(!isObj(item))return;
          const meta=isObj(item._meta)?item._meta:{};
          const qc=isObj(meta.sessionQc)?meta.sessionQc:{};
          const qcInner=isObj(qc.qc)?qc.qc:{};
          const row={
            participant_id:id,
            task:k,
            attempt_number:i+1,
            is_canonical:bool(canonicalAt!=null&&meta.recordedAt===canonicalAt),
            qc_status:qc.status||'unverified',
            review_status:k==='fluency'||k==='bwais'?(item.reviewStatus||'unreviewed'):null,
            recorded_at:meta.recordedAt||null,
            elapsed_ms:num(qc.elapsedMs),
            visibility_interruptions:num(qcInner.visibilityInterruptions),
            timer_drift_max_ms:num(qcInner.timerDriftMaxMs),
            timing_violation:bool(qcInner.timingViolation),
            technical_failure:bool(qcInner.technicalFailure),
            task_version:meta.taskVersion||null,
            protocol_id:item.protocol||null
          };
          for(const [name,fn] of TASK_COLUMNS[k])row[name]=fn(item);
          rows.push(row);
        });
      }
    }
    return{columns,rows};
  }
  function buildProvenance(input={}){
    const attempts=isObj(input.researchData)&&Array.isArray(input.researchData.attempts)?input.researchData.attempts:[];
    const rows=attempts.map(a=>{a=isObj(a)?a:{};return{
      attempt_id:a.id||null,
      study_id:a.studyId||null,
      site_id:a.siteId||null,
      session_id:a.sessionId||null,
      participant_id:a.participantId||null,
      test_key:a.testKey||null,
      task_version:a.taskVersion||null,
      protocol_id:a.protocolId||null,
      qc_status:a.qcStatus||'unverified',
      recorded_at:a.recordedAt||null,
      source:a.source||null,
      source_key:a.sourceKey||null
    }});
    return{columns:[...PROVENANCE_COLUMNS],rows};
  }
  function buildAudit(input={}){
    const audit=isObj(input.researchData)&&Array.isArray(input.researchData.audit)?input.researchData.audit:[];
    const rows=audit.map(e=>{e=isObj(e)?e:{};return{
      audit_id:e.id||null,
      type:e.type||null,
      at:e.at||null,
      detail_json:e.detail==null?null:JSON.stringify(e.detail)
    }});
    return{columns:[...AUDIT_COLUMNS],rows};
  }
  function csvCell(v){
    if(v==null)return'';
    if(typeof v==='boolean')return v?'1':'0';
    const s=typeof v==='number'?String(v):String(v);
    if(/[",\r\n]/.test(s))return'"'+s.replace(/"/g,'""')+'"';
    return s;
  }
  function toCSV(table={}){
    const cols=Array.isArray(table.columns)?table.columns.filter(c=>typeof c==='string'&&c):[];
    const rs=Array.isArray(table.rows)?table.rows:[];
    const lines=[cols.map(csvCell).join(',')];
    for(const r of rs){const o=isObj(r)?r:{};lines.push(cols.map(c=>csvCell(o[c])).join(','))}
    return'\uFEFF'+lines.join('\r\n')+'\r\n';
  }
  function downloadCSV(filename,table){
    const t=isObj(table)?table:{};
    if(!root.document||typeof root.document.createElement!=='function')return false;
    try{
      const blob=new Blob([toCSV(t)],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const a=root.document.createElement('a');
      a.href=url;
      a.download=String(filename||'psy-exp-export.csv');
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }catch(e){if(typeof root.console!=='undefined')console.warn('CSV download failed',e&&e.message||e);return false}
  }
  function uid(prefix){try{if(root.crypto&&typeof root.crypto.randomUUID==='function')return prefix+'-'+root.crypto.randomUUID()}catch{}return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}
  const sanitizeOperator=v=>String(v==null?'':v).trim().replace(/[^A-Za-z0-9._-]/g,'-').slice(0,96)||'local-researcher';
  function recordExportAudit(input={}){
    const RD=root.ResearchData;
    if(!RD||typeof RD.snapshot!=='function'||typeof RD._save!=='function')return{recorded:false,reason:'research_data_unavailable'};
    const table=String(input.table||'').trim();
    const rows=Number(input.rows);
    if(!table||!Number.isFinite(rows)||rows<0)return{recorded:false,reason:'invalid_export_record'};
    let d=null;
    try{d=RD.snapshot()}catch{return{recorded:false,reason:'snapshot_failed'}}
    if(!isObj(d)||!Array.isArray(d.audit))return{recorded:false,reason:'snapshot_failed'};
    const entryId=uid('audit');
    d.audit.push({id:entryId,type:'table_exported',at:new Date().toISOString(),detail:{table,rows,operatorId:sanitizeOperator(input.operatorId),exportVersion:EXPORT_VERSION}});
    let ok=false;
    try{ok=!!RD._save(d)}catch{return{recorded:false,reason:'persist_failed'}}
    return ok?{recorded:true,entryId}:{recorded:false,reason:'persist_failed'};
  }
  return{EXPORT_VERSION,TASK_KEYS,TASK_COLUMNS,WIDE_COMMON,ATTEMPTS_COMMON,PROVENANCE_COLUMNS,AUDIT_COLUMNS,buildParticipantWide,buildAttempts,buildProvenance,buildAudit,toCSV,downloadCSV,recordExportAudit};
});
