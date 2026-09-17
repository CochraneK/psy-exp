/* Original homepage UI adapter: preserve DOM/CSS, replace legacy data/scoring/governance paths. */
(function(root){
  'use strict';
  const TASKS={
    'pages/mccb-tmt.html':{key:'tmt',result:'mccb-tmt-result'},
    'pages/mccb-bacs.html':{key:'bacs',result:'mccb-bacs-result'},
    'pages/mccb-fluency.html':{key:'fluency',result:'mccb-fluency-result'},
    'pages/mccb-cpt.html':{key:'cpt',result:'mccb-cpt-result'},
    'pages/mccb-spatial-span.html':{key:'spatial-span',result:'mccb-spatial-span-result'},
    'pages/mccb-lns.html':{key:'lns',result:'mccb-lns-result'},
    'pages/mccb-hvlt.html':{key:'hvlt',result:'mccb-hvlt-result'},
    'pages/mccb-bvmt.html':{key:'bvmt',result:'mccb-bvmt-result'},
    'pages/mccb-mazes.html':{key:'mazes',result:'mccb-mazes-result'},
    'pages/mccb-msceit.html':{key:'msceit',result:'mccb-msceit-result'}
  };
  const RESULT_TO_TASK=Object.fromEntries(Object.values(TASKS).map(x=>[x.result,x.key]));
  const LEGACY_GLOBAL_KEYS=Object.values(TASKS).map(x=>x.result);
  const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch{return null}};
  const currentId=()=>root.ParticipantManager&&root.ParticipantManager.getCurrent()||'';
  const currentData=()=>{const id=currentId();return id&&root.ParticipantManager?root.ParticipantManager.getData(id):null};

  function safeDate(result){
    const raw=result&&result._meta&&result._meta.recordedAt||result&&result.date||null;
    if(!raw)return null;const d=new Date(raw);return Number.isFinite(d.getTime())?d:null;
  }
  function currentResult(resultKey){const d=currentData();return d&&d.results&&d.results[resultKey]||null}
  function refreshOriginalUi(){
    try{root.loadDashboard&&root.loadDashboard()}catch(e){console.warn(e)}
    try{root.updateCardStatuses&&root.updateCardStatuses()}catch(e){console.warn(e)}
    try{root.generateCharts&&root.generateCharts()}catch(e){console.warn(e)}
  }
  function resetParticipantUi(){
    const byId=id=>document.getElementById(id);
    const input=byId('participantInput');if(input)input.value='';
    const login=byId('loginBtn');if(login){login.textContent='登录';login.disabled=false}
    const logout=byId('logoutBtn');if(logout)logout.style.display='none';
    const greeting=byId('greetingArea');if(greeting)greeting.style.display='none';
    const progress=byId('progressArea');if(progress)progress.style.display='none';
    const resume=byId('resumeBtn');if(resume)resume.style.display='none';
  }
  async function ensureResearchParticipant(id){
    if(!id||!root.ResearchData)return null;
    const cfg=root.ResearchStorage&&root.ResearchStorage.getConfig?root.ResearchStorage.getConfig():{};
    const snap=root.ResearchData.snapshot(),existing=snap.participants&&snap.participants[id];
    root.ResearchData.ensureParticipant(id,{siteId:existing&&existing.siteId||cfg.siteId||root.ResearchData.DEFAULT_SITE_ID});
    return root.ResearchData.snapshot().participants[id]||null;
  }
  async function syncHome(reason){
    const id=currentId();if(!id||!root.ResearchSession)return null;
    await ensureResearchParticipant(id);
    const session=root.ResearchData&&root.ResearchData.getActiveSession?root.ResearchData.getActiveSession(id):null;
    return root.ResearchSession.checkpoint(id,session,{reason});
  }
  function blockedMessage(session){
    if(!session||!session.blocked)return'';
    if(session.reason==='consent_required')return session.requiredConsentVersion?`当前参与者尚未完成研究同意（需要版本 ${session.requiredConsentVersion}）。`:'当前参与者尚未完成研究同意。';
    if(session.reason==='consent_version_mismatch')return'当前参与者的研究同意版本已过期，请在数据治理中更新。';
    if(session.reason==='participant_withdrawn')return'当前参与者已撤回研究同意，不能开始新的研究 session。';
    if(session.reason==='participant_declined')return'当前参与者未同意研究，不能开始新的研究 session。';
    return'当前参与者不满足开始研究 session 的条件。';
  }
  async function gatedTaskNavigation(href){
    const task=TASKS[href];if(!task){location.href=href;return}
    const id=currentId();
    if(!id){alert('请先选择或创建被试编号。');return}
    if(!root.ResearchSession){alert('研究 session 模块尚未载入，请刷新页面后重试。');return}
    try{
      const session=await root.ResearchSession.ensureSession(id);
      if(session&&session.blocked){alert(blockedMessage(session));location.href='data-governance.html';return}
      await root.ResearchSession.checkpoint(id,session,{reason:`original_homepage_start_${task.key}`});
      const mode=(typeof root.getMode==='function'&&root.getMode()==='dev')?'dev':'user';
      location.href=root.ParticipantManager.getTestUrl(task.key,mode);
    }catch(e){console.error(e);alert('无法建立研究 session，请检查数据治理设置后重试。')}
  }

  root.getResultData=function(key){return currentResult(key)};

  root.loadDashboard=function(){
    const grid=document.getElementById('dashGrid'),progressEl=document.getElementById('dashProgress'),fillEl=document.getElementById('dashProgressFill');
    if(!grid||!progressEl||!fillEl)return;
    const meta=(typeof TEST_META!=='undefined'&&Array.isArray(TEST_META))?TEST_META:[];
    let completed=0,latestDate=null,html='';
    for(const item of meta){
      const data=currentResult(item.key);
      if(data){
        completed++;const date=safeDate(data);if(date&&(!latestDate||date>latestDate))latestDate=date;
        const dateStr=date?date.toLocaleDateString('zh-CN',{month:'short',day:'numeric'}):'已保存';
        let score='✓';try{if(typeof root.getPrimaryScore==='function')score=root.getPrimaryScore(item.key,data)}catch{}
        html+=`<div class="dash-item"><div class="dash-item-icon done">${item.icon}</div><div class="dash-item-info"><div class="dash-item-name">${item.name}</div><div class="dash-item-date">${dateStr} · ${score}</div></div></div>`;
      }else{
        html+=`<div class="dash-item"><div class="dash-item-icon pending">${item.icon}</div><div class="dash-item-info"><div class="dash-item-name" style="color:#94a3b8;">${item.name}</div><div class="dash-item-date" style="color:#cbd5e1;">未测评</div></div></div>`;
      }
    }
    if(completed===0)grid.innerHTML='<div class="dash-empty"><div style="font-size:40px;margin-bottom:8px;">📋</div><p>尚无测评数据。请先完成任意测验，结果将自动在此显示。</p></div>';else grid.innerHTML=html;
    const total=meta.length||10,pct=Math.round(completed/total*100);
    progressEl.innerHTML=`已完成 <strong>${completed} / ${total}</strong> 项测验（${pct}%）${latestDate?' · 最近测评：'+latestDate.toLocaleDateString('zh-CN'):''}`;
    fillEl.style.width=pct+'%';
  };

  root.updateCardStatuses=function(){
    const d=currentData();
    document.querySelectorAll('.test-card').forEach(card=>{
      const onclick=card.getAttribute('onclick')||'',m=onclick.match(/goTest\('(.+?)'\)/),task=m&&TASKS[m[1]],statusEl=card.querySelector('.tc-status');
      if(!task||!statusEl)return;
      const found=!!(d&&d.results&&d.results[task.result]);
      statusEl.className='tc-status '+(found?'done':'new');statusEl.textContent=found?'✓ 已完成':'待测试';
    });
  };

  root.goTest=function(href){void gatedTaskNavigation(href)};
  root.resumeTesting=function(){
    const first=root.ParticipantManager&&root.ParticipantManager.getFirstIncomplete();
    if(!first){alert('所有测验已完成！');return}
    const entry=Object.entries(TASKS).find(([,v])=>v.key===first.key);if(entry)void gatedTaskNavigation(entry[0]);
  };

  function downloadJson(value,name){
    const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  root.exportData=function(){
    if(!root.ResearchGovernance){alert('数据治理模块尚未载入。');return}
    const bundle=root.ResearchGovernance.exportLocalBundle();downloadJson(bundle,`psy-exp-research-bundle-${new Date().toISOString().slice(0,10)}.json`);
  };
  root.exportAllParticipants=root.exportData;

  function migrateLegacyBackup(parsed){
    const id=currentId();if(!id)throw new Error('LEGACY_IMPORT_REQUIRES_PARTICIPANT');
    const d=root.ParticipantManager.getData(id);if(!d)throw new Error('PARTICIPANT_NOT_FOUND');
    let count=0;const recordedAt=parsed.exportDate||new Date().toISOString();
    for(const [resultKey,result] of Object.entries(parsed.tests||{})){
      const testKey=RESULT_TO_TASK[resultKey];if(!testKey||!result||typeof result!=='object')continue;
      const item=clone(result)||{};
      item._meta={...(item._meta||{}),schemaVersion:4,taskVersion:item._meta&&item._meta.taskVersion||'legacy-import',runtimeVersion:item._meta&&item._meta.runtimeVersion||'legacy-import',administration:'legacy-import-unverified',mccbEquivalent:false,participantId:id,recordedAt:item._meta&&item._meta.recordedAt||recordedAt,provenance:{...(item._meta&&item._meta.provenance||{}),source:'legacy-import'},sessionQc:{status:'unverified',startedAt:null,completedAt:recordedAt,elapsedMs:null,qc:{reasons:['legacy_backup_import_requires_retest_or_review']}}};
      d.invalidResults[resultKey]=item;(d.attemptHistory[resultKey]||(d.attemptHistory[resultKey]=[])).push(item);if(!d.results[resultKey])d.progress[testKey]='completed_invalid';count++;
    }
    root.ParticipantManager._saveData(id,d);return count;
  }
  root.importData=function(event){
    const file=event&&event.target&&event.target.files&&event.target.files[0];if(!file)return;
    const reader=new FileReader();reader.onload=async e=>{
      try{
        const text=String(e.target.result||''),parsed=JSON.parse(text);
        if(parsed&&parsed.format===root.ResearchGovernance.FORMAT){
          const v=root.ResearchGovernance.validateBundle(text);if(!v.ok)throw new Error(v.errors.join('; '));
          root.ResearchGovernance.importBundle(text,{mode:'merge',restoreParticipants:true});
          alert(`已安全合并研究数据：${v.summary.participants} 位参与者，${v.summary.attempts} 条 attempt。`);
        }else if(parsed&&parsed.tests&&typeof parsed.tests==='object'){
          const count=migrateLegacyBackup(parsed);alert(`已迁移 ${count} 项旧备份数据。旧结果按“未验证记录”保存，不会直接进入研究排名。`);
        }else throw new Error('不支持的备份格式');
        await syncHome('original_homepage_import');refreshOriginalUi();
      }catch(err){console.error(err);alert(`导入失败：${err&&err.message||'文件格式错误'}`)}finally{if(event&&event.target)event.target.value=''}
    };reader.readAsText(file);
  };

  root.deleteParticipant=function(cohortId){
    if(!confirm(`确定删除被试 "${cohortId}" 的本地任务数据与研究 session 数据？此操作不可恢复。`))return;
    const wasCurrent=currentId()===cohortId;
    try{if(root.ResearchData)root.ResearchData.deleteParticipant(cohortId,{reason:'original_homepage_delete'})}catch(e){console.warn(e)}
    root.ParticipantManager.deleteParticipant(cohortId);
    if(typeof root.renderParticipantList==='function')root.renderParticipantList();if(wasCurrent)resetParticipantUi();refreshOriginalUi();
  };
  root.clearAllData=function(){
    if(!confirm('确定清除所有本地参与者任务数据与关联研究 session/attempt？研究审计日志会保留。此操作不可恢复。'))return;
    for(const id of root.ParticipantManager.getAllParticipants()){
      try{if(root.ResearchData)root.ResearchData.deleteParticipant(id,{reason:'original_homepage_clear_all'})}catch(e){console.warn(e)}
      root.ParticipantManager.deleteParticipant(id);
    }
    for(const key of LEGACY_GLOBAL_KEYS)try{localStorage.removeItem(key)}catch{}
    resetParticipantUi();refreshOriginalUi();
  };

  root.viewParticipantReport=function(cohortId){location.href='research-report.html?p='+encodeURIComponent(cohortId)};
  root.exportPDF=function(){
    const id=currentId();if(!id){alert('请先选择被试。');return}location.href='research-report.html?p='+encodeURIComponent(id);
  };

  function safeDomainData(){
    if(!root.MCCBScoring)return[];const id=currentId();if(!id)return[];
    const all=root.MCCBScoring.getAllProfiles(),profile=(all.profiles||[]).find(p=>p.id===id);if(!profile)return[];
    return root.MCCBScoring.getDomainSummary(profile).filter(d=>Number.isFinite(d.cohortRankIndex)&&Number(d.referenceN)>=5);
  }
  root.getDomainScores=function(){
    const domains={};for(const d of safeDomainData())domains[d.label]=Math.round(d.cohortRankIndex*10)/10;return{domains,raw:{}};
  };
  root.getBarData=function(){return safeDomainData().map(d=>({name:d.label,score:Math.round(d.cohortRankIndex*10)/10,done:true,referenceN:d.referenceN}))};
  root.generateCharts=function(){
    const panel=document.getElementById('chartsPanel');if(!panel||typeof root.Chart!=='function')return;
    const radarCanvas=document.getElementById('radarChart'),barCanvas=document.getElementById('barChart');
    const oldRadar=radarCanvas&&typeof root.Chart.getChart==='function'?root.Chart.getChart(radarCanvas):null;
    const oldBar=barCanvas&&typeof root.Chart.getChart==='function'?root.Chart.getChart(barCanvas):null;
    if(oldRadar)oldRadar.destroy();if(oldBar)oldBar.destroy();
    const domains=safeDomainData();if(!domains.length){panel.style.display='none';return}panel.style.display='block';
    const headings=panel.querySelectorAll('h4');if(headings[0])headings[0].textContent='研究域项目内排名（雷达图）';if(headings[1])headings[1].textContent='研究域项目内排名（柱状图）';const note=panel.querySelector('div[style*="text-align:center"]');if(note)note.textContent='仅显示 N≥5 的 QC-valid、同协议项目内研究排名指数；不是 MCCB 常模 percentile/T 分。';
    const labels=domains.map(d=>d.label),values=domains.map(d=>d.cohortRankIndex);
    root.radarChartInstance=new root.Chart(radarCanvas.getContext('2d'),{type:'radar',data:{labels,datasets:[{label:'项目内研究排名指数',data:values,backgroundColor:'rgba(52, 152, 219, 0.2)',borderColor:'#3498db',borderWidth:2,pointBackgroundColor:'#3498db',pointBorderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:true,scales:{r:{beginAtZero:true,max:100,ticks:{stepSize:20,backdropColor:'transparent'}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} · N=${domains[ctx.dataIndex].referenceN}`}}}}});
    root.barChartInstance=new root.Chart(barCanvas.getContext('2d'),{type:'bar',data:{labels,datasets:[{label:'项目内研究排名指数',data:values,backgroundColor:'#3498db',borderColor:'#2980b9',borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:true,indexAxis:'y',scales:{x:{beginAtZero:true,max:100},y:{grid:{display:false}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} · N=${domains[ctx.dataIndex].referenceN}`}}}}});
  };

  const oldLogin=typeof root.loginParticipant==='function'?root.loginParticipant:null;
  if(oldLogin)root.loginParticipant=function(){
    const input=document.getElementById('participantInput'),id=String(input&&input.value||'').trim();
    if(!id){alert('请输入被试队列编号');return}
    if(!root.ParticipantManager||!root.ParticipantManager.setCurrent(id)){
      alert('被试编号无效：仅允许 1–64 位字母、数字、点、下划线和连字符。');
      return;
    }
    if(typeof root.applyParticipant==='function')root.applyParticipant(id);else oldLogin();
  };
  const oldApply=typeof root.applyParticipant==='function'?root.applyParticipant:null;
  if(oldApply)root.applyParticipant=function(id){oldApply(id);void ensureResearchParticipant(id).then(()=>syncHome('original_homepage_participant_selected')).catch(console.warn)};
  const oldSelect=typeof root.selectParticipant==='function'?root.selectParticipant:null;
  if(oldSelect)root.selectParticipant=function(id){oldSelect(id);void ensureResearchParticipant(id).catch(console.warn)};

  function hardenViewport(){const meta=document.querySelector('meta[name="viewport"]');if(meta)meta.setAttribute('content','width=device-width, initial-scale=1.0')}
  async function init(){
    hardenViewport();
    const id=currentId();if(id){try{await ensureResearchParticipant(id);await syncHome('original_homepage_load')}catch(e){console.warn(e)}}
    refreshOriginalUi();
  }
  root.PSY_EXP_ORIGINAL_UI_MODERN_CORE='1.0.0';
  void init();
})(window);