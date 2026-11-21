/* Evidence, strategy and measurement agreements. All records remain account scoped. */
(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports;
  const C=node?require('./core.js'):root.JMLCore;
  const O=node?require('./operations.js'):root.JMLOps;
  const U=node?require('./workflow-ui.js'):root.JMLWorkflowUI;
  const METRICS=['views','reach','impressions','saves','likes','comments','shares','clicks','followers','leads','newfollows','netfollowers','qualifiedleads'];
  const KPI_PRESETS=[
    {id:'reach',title:'Reach',numerator:'reach',unit:'accounts',note:'Unique accounts reached; use the platform’s reach field.'},
    {id:'views',title:'Views',numerator:'views',unit:'views',note:'Views as defined by your platform export.'},
    {id:'impressions',title:'Impressions',numerator:'impressions',unit:'impressions',note:'Displays of the content, including repeat displays.'},
    {id:'saves-rate',title:'Saves per 1,000 views',numerator:'saves',denominator:'views',scale:1000,unit:'saves / 1,000 views',note:'Use only when both saves and views are available for the same content.'},
    {id:'shares-rate',title:'Shares per 1,000 views',numerator:'shares',denominator:'views',scale:1000,unit:'shares / 1,000 views',note:'Use only when shares and views are available for the same content.'},
    {id:'clicks',title:'Link clicks',numerator:'clicks',unit:'clicks',note:'Use link clicks, not all interactions.'},
    {id:'ctr',title:'Click-through rate',numerator:'clicks',denominator:'impressions',scale:100,unit:'%',note:'Link clicks ÷ impressions. Both must come from the same export and period.'},
    {id:'new-follows',title:'New follows',numerator:'newfollows',unit:'follows',note:'New follows during the period, where provided. Do not enter total followers.'},
    {id:'net-followers',title:'Net follower change',numerator:'netfollowers',unit:'followers',note:'Follows minus unfollows for the period. Negative values are valid.'},
    {id:'qualified-leads',title:'Qualified leads',numerator:'qualifiedleads',unit:'leads',note:'Use an agreed qualification rule, source and attribution window.'}
  ].map(p=>({denominator:'',scale:1,window:'7 days',dataSource:'Platform export',...p}));
  const TYPES=['Verified observation','Hypothesis','Creative reference'];
  const REFERENCES=[
    {title:'Paid creative archive',description:'Published paid-ad examples and the separate organic collection. Capture the exact item you use; the library is not imported.',links:[['Paid creative library','https://biocool.github.io/jml-sales-hub/ad-intelligence/#library-title'],['Ad Intelligence · Organic tab','https://biocool.github.io/jml-sales-hub/ad-intelligence/'],['Paid source CSV','https://biocool.github.io/jml-sales-hub/ad-intelligence/data.csv']]},
    {title:'Research & analysis',description:'Compare landing patterns and organic social research. Preserve source, distribution and observed limits with each finding.',links:[['Paid landing analysis','https://biocool.github.io/jml-sales-hub/ad-intelligence/visual-report.html#landing'],['Organic post research','https://biocool.github.io/jml-sales-hub/social-post-research/']]},
    {title:'Image prompt library',description:'Save a selected prompt as a creative reference, with its source and any usage limits.',links:[['JML Image Prompt Gallery','https://biocool.github.io/jml-image-prompt-gallery/#source-library']]}
  ];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>typeof value==='string'?value.trim():'';
  const required=(value,label)=>{const v=text(value);if(!v)throw Error(label+' is required.');return v;};
  function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
  function store(state,brandId,write=false){const ops=O.account(state,brandId,write);if(write){for(const key of ['themes','angles','kpis'])ops[key]||=[];}return {...ops,themes:ops.themes||[],angles:ops.angles||[],kpis:ops.kpis||[]};}
  function history(ops,actor,action,detail,before,after){const event={id:C.id('research-event'),at:C.now(),actor,action,detail};if(before!==undefined)event.before=C.clone(before);if(after!==undefined)event.after=C.clone(after);ops.events.push(event);return event;}
  function one(rows,id,label){const row=rows.find(v=>v.id===id);if(!row)throw Error(label+' is unavailable in this account.');return row;}
  function selectedSources(ops,ids){if(!Array.isArray(ids)||!ids.length)throw Error('Select at least one evidence record.');return [...new Set(ids)].map(id=>one(ops.sources,id,'Evidence'));}
  function citation(s){return {id:s.id,revision:s.revision||1,title:s.title,type:s.type,sourceType:s.sourceType||'Manual observation',text:s.observation,url:safeLink(s.reference),reference:s.reference,observed:s.observed,channel:s.channel||'',audience:s.audience||'',confidence:s.confidence||'Unassessed',limits:s.rights||'',collector:s.actor||'',capturedAt:s.at,attachments:C.clone(s.attachments||[])};}
  function saveEvidence(state,brandId,data,actor,id){
    const ops=store(state,brandId,true),old=id?one(ops.sources,id,'Evidence'):null;
    const body={title:text(data.title)||required(data.observation,'Observation').slice(0,90),type:data.type||'Verified observation',reference:required(text(data.reference)||(data.attachments?.length?'Attached file: '+data.attachments.map(f=>f.name).join(', '):''),'a source reference or attachment'),observed:required(data.observed,'Observation date'),observation:required(data.observation,'Observation or prompt'),sourceType:text(data.sourceType)||'Manual observation',channel:text(data.channel),audience:text(data.audience),window:text(data.window),rights:text(data.rights),confidence:text(data.confidence)||'Unassessed'};
    if(!TYPES.includes(body.type))throw Error('Choose an evidence type.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(body.observed))throw Error('Choose a valid observation date.');
    if(/^[a-z][a-z\d+.-]*:/i.test(body.reference)&&!safeLink(body.reference)&&! /^[A-Z]:[\\/]/i.test(body.reference))throw Error('Use an ordinary http/https source URL or a local file reference.');
    const files=data.attachments===undefined?C.clone(old?.attachments||[]):C.clone(data.attachments);
    validateAttachments(files);
    const before=old?citation(old):null;
    const row={...body,id:old?.id||C.id('source'),revision:(old?.revision||0)+1,at:C.now(),actor,status:'captured',attachments:files,revisions:[...(old?.revisions||[])]};
    if(old)row.revisions.push({...before,at:old.at,actor:old.actor});
    if(old)Object.assign(old,row);else ops.sources.push(row);
    history(ops,actor,old?'Evidence revised':'Evidence captured',body.title,before,citation(row));return old||row;
  }
  function reviewEvidence(state,brandId,id,actor,note){const ops=store(state,brandId,true),s=one(ops.sources,id,'Evidence');required(note,'Review note');const before=citation(s);s.status='reviewed';s.review={actor,at:C.now(),note};history(ops,actor,'Evidence reviewed',s.title,before,{...citation(s),review:s.review});return s;}
  function mergeEvidence(state,brandId,sourceId,targetId,actor,reason){
    if(sourceId===targetId)throw Error('Choose a different destination.');
    const ops=store(state,brandId,true),source=one(ops.sources,sourceId,'Evidence'),target=one(ops.sources,targetId,'Evidence');
    if(source.mergedInto||target.mergedInto)throw Error('Choose two active evidence records.');
    required(reason,'Merge reason');source.mergedInto=targetId;source.status='merged';
    (target.relatedCitations||=[]).push(citation(source),...(source.relatedCitations||[]));
    history(ops,actor,'Duplicate evidence merged',reason,{source:citation(source),target:citation(target)},{sourceId,targetId});return target;
  }
  function saveTheme(state,brandId,data,actor,id){
    const ops=store(state,brandId,true),sources=selectedSources(ops,data.sourceIds),old=id?one(ops.themes,id,'Theme'):null;
    const row={id:old?.id||C.id('theme'),title:required(data.title,'Question or theme'),summary:required(data.summary,'Interpretation'),contradictions:text(data.contradictions),sourceIds:sources.map(s=>s.id),citations:sources.map(citation),confidence:text(data.confidence)||'Unassessed',status:'synthesized',at:C.now(),actor,revision:(old?.revision||0)+1};
    const before=old?C.clone(old):null;if(old)Object.assign(old,row);else ops.themes.push(row);
    for(const s of sources)if(s.status!=='merged')s.status='synthesized';
    history(ops,actor,'Theme saved',row.title,before,row);return old||row;
  }
  function validateKpi(k){
    if(!k||!METRICS.includes(k.numerator)||k.denominator&&!METRICS.includes(k.denominator)||!Number.isFinite(k.scale)||k.scale<=0)throw Error('Choose supported metrics and a positive multiplier.');
    if(!k.denominator&&k.scale!==1)throw Error('A raw count uses a multiplier of 1.');
    if(k.baseline?.value!==null&&k.baseline?.value!==undefined&&(!Number.isFinite(k.baseline.value)||k.baseline.value<0&&k.numerator!=='netfollowers'))throw Error('The baseline must be a non-negative number.');
    if(k.baseline?.value!==null&&k.baseline?.value!==undefined&&(!text(k.baseline.source)||!text(k.baseline.window)))throw Error('Record the baseline source and comparison window.');
  }
  function saveKpi(state,brandId,data,actor){
    const preset=KPI_PRESETS.find(p=>p.id===data.presetId);if(preset)data={...data,...preset,dataSource:text(data.dataSource)||preset.dataSource,window:text(data.window)||preset.window};
    if(data.baselineValue!==''&&data.baselineValue!=null)data.baselineWindow||=data.window;
    const ops=store(state,brandId,true),prev=data.previousId?one(ops.kpis,data.previousId,'KPI version'):null;
    const row={id:C.id('kpi'),key:prev?.key||C.id('measure'),version:prev?Math.max(...ops.kpis.filter(k=>k.key===prev.key).map(k=>k.version))+1:1,title:required(data.title,'KPI title'),channel:text(data.channel),presetId:data.presetId||'',numerator:data.numerator,denominator:data.denominator||'',scale:Number(data.scale),unit:required(data.unit,'Display unit'),window:required(data.window,'Measurement window'),distribution:data.distribution||'Organic',dataSource:required(data.dataSource,'Metric source'),baseline:{value:data.baselineValue===''||data.baselineValue==null?null:Number(data.baselineValue),source:text(data.baselineSource),window:text(data.baselineWindow),sampleSize:text(data.baselineSampleSize),distribution:data.baselineDistribution||data.distribution||'Organic'},createdAt:C.now(),createdBy:actor};
    validateKpi(row);ops.kpis.push(row);history(ops,actor,'KPI agreement version saved',row.title+' V'+row.version,null,row);return row;
  }
  function getKpi(state,brandId,id){return store(state,brandId).kpis.find(k=>k.id===id)||null;}
  function saveStrategy(state,brandId,data,actor){
    const ops=store(state,brandId,true);
    if(!ops.foundation.business||!ops.foundation.finalApprover)throw Error('Complete the client foundation and named approver first.');
    const kpi=one(ops.kpis,data.kpiDefinitionId,'KPI definition'),sourceIds=data.sourceIds||[];
    sourceIds.forEach(id=>one(ops.sources,id,'Evidence'));
    const body={objective:required(data.objective,'Business objective'),audience:required(data.audience,'Audience'),channelRoles:required(data.channelRoles,'Channel roles'),pillars:required(data.pillars,'Content pillars'),cadence:required(data.cadence,'Reporting cadence'),growth:text(data.growth),target:text(data.target),kpi:kpi.title,definition:kpi.numerator+(kpi.denominator?' / '+kpi.denominator+' × '+kpi.scale:''),source:kpi.dataSource,baseline:kpi.baseline.value===null?'Not established':String(kpi.baseline.value)+' '+kpi.unit,window:kpi.window,kpiDefinitionId:kpi.id};
    const proposal=data.resultProposalId?one(ops.planningProposals||[],data.resultProposalId,'Planning proposal'):null;
    const version=O.snapshot(ops,'strategy',body,actor,{foundation:C.clone(ops.foundation),foundationVersionId:ops.foundationVersions?.at(-1)?.id||'',sourceIds:[...new Set(sourceIds)],citations:sourceIds.map(id=>citation(one(ops.sources,id,'Evidence'))),measurementSnapshot:C.clone(kpi),...(proposal?{sourceResultProposalId:proposal.id}:{})});
    if(proposal){proposal.strategyVersionId=version.id;proposal.status='Incorporated into strategy draft';proposal.appliedAt=C.now();}
    history(ops,actor,'Strategy provenance recorded','Selected evidence and exact KPI version',null,{strategyId:version.id,sourceIds:version.sourceIds,kpiDefinitionId:kpi.id});return version;
  }
  function saveAngle(state,brandId,data,actor,id){
    const ops=store(state,brandId,true),theme=one(ops.themes,data.themeId,'Theme'),strategy=one(ops.strategies,data.strategyVersionId,'Strategy version');
    const kpi=one(ops.kpis,data.kpiDefinitionId||strategy.body.kpiDefinitionId,'KPI definition');
    const old=id?one(ops.angles,id,'Angle'):null;
    if(old?.contentId)throw Error('This angle already has a calendar draft. Create a new angle for a different test.');
    const row={id:old?.id||C.id('angle'),themeId:theme.id,title:required(data.title,'Angle title'),audience:required(data.audience,'Audience'),problem:required(data.problem,'Audience problem'),hook:required(data.hook,'Opening message'),objective:required(data.objective,'Objective'),cta:text(data.cta),platform:required(data.platform,'Channel'),format:required(data.format,'Format'),rationale:text(data.rationale)||'Developed from the linked evidence and current strategy.',uncertainty:text(data.uncertainty),strategyVersionId:strategy.id,kpiDefinitionId:kpi.id,sourceIds:[...theme.sourceIds],citations:C.clone(theme.citations),evidenceType:theme.citations.some(s=>s.type==='Hypothesis')?'Hypothesis':'Evidence-informed idea',status:'candidate',decisions:[...(old?.decisions||[])],revision:(old?.revision||0)+1,actor,at:C.now()};
    if(row.evidenceType==='Hypothesis'&&!row.uncertainty)throw Error('Describe the uncertainty before selecting a hypothesis.');
    const before=old?C.clone(old):null;if(old)Object.assign(old,row);else ops.angles.push(row);history(ops,actor,'Angle saved',row.title,before,row);return old||row;
  }
  function decideAngle(state,brandId,id,outcome,reason,actor){
    const ops=store(state,brandId,true),a=one(ops.angles,id,'Angle');if(!['selected','deferred','rejected'].includes(outcome))throw Error('Choose an angle decision.');
    if(a.contentId)throw Error('This angle has already been used. Revisit its calendar draft.');if(outcome!=='selected')required(reason,'Decision reason');reason=text(reason)||'Selected for the next calendar draft.';
    const before=a.status;a.status=outcome;a.decisions.push({id:C.id('angle-decision'),outcome,reason,actor,at:C.now(),revision:a.revision});history(ops,actor,'Angle '+outcome,reason,{status:before},{angleId:id,status:outcome});return a;
  }
  function createIdeaDraft(state,brandId,sourceId,data,actor){
    const ops=store(state,brandId,true),source=one(ops.sources,sourceId,'Evidence');
    const strategy=one(ops.strategies,data.strategyVersionId||ops.strategies.at(-1)?.id,'Strategy');
    const theme=saveTheme(state,brandId,{title:text(data.problem)||source.title,summary:text(data.problem)||source.observation,sourceIds:[source.id],contradictions:source.rights},actor);
    const angle=saveAngle(state,brandId,{...data,themeId:theme.id,strategyVersionId:strategy.id,audience:text(data.audience)||strategy.body.audience,objective:text(data.objective)||strategy.body.objective,problem:theme.summary,kpiDefinitionId:data.kpiDefinitionId||strategy.body.kpiDefinitionId,uncertainty:text(data.uncertainty)||(source.type==='Hypothesis'?'This idea tests the linked hypothesis; no observed audience outcome yet.':'')},actor);
    decideAngle(state,brandId,angle.id,'selected','Selected for a calendar draft from the linked source.',actor);
    return promoteAngle(state,brandId,angle.id,data,actor);
  }
  function promoteAngle(state,brandId,id,data,actor){
    const ops=store(state,brandId,true),a=one(ops.angles,id,'Angle');
    if(a.contentId&&!data.adaptation)return one(state.posts.filter(p=>p.brandId===brandId),a.contentId,'Linked draft');
    if(!['selected','used'].includes(a.status))throw Error('Select this angle with a reason before creating a calendar draft.');
    const strategy=one(ops.strategies,a.strategyVersionId,'Strategy version');one(ops.kpis,a.kpiDefinitionId,'KPI definition');
    const b=state.brands.find(b=>b.id===brandId);
    const p=C.makePost({id:C.id('content'),brandId,title:text(data.title)||a.title,platform:a.platform,format:a.format,date:text(data.date),owner:required(data.owner,'Delivery owner'),timezone:b.timezone,objective:a.objective,audience:a.audience,cta:a.cta,source:a.evidenceType+' · '+a.title,sources:a.citations.map(c=>c.reference),example:brandId==='demo'||!!b.example});
    Object.assign(p,{planningAngleId:a.id,strategyVersionId:strategy.id,measurementDefinitionId:a.kpiDefinitionId,researchCitations:C.clone(a.citations),researchStatus:a.evidenceType,planningProposal:true});
    Object.assign(p.brief,{direction:a.hook,approver:ops.foundation.finalApprover||'',researchCitations:C.clone(a.citations),researchUncertainty:a.uncertainty});
    if(data.adaptation){p.adaptedFrom=a.contentId;p.source='Adaptation · '+p.source;(a.adaptations||=[]).push(p.id);}else a.contentId=p.id;
    a.status='used';state.posts.push(p);C.event(p,'Research promoted to calendar','Angle '+a.id+' · Strategy V'+strategy.number+' · KPI '+a.kpiDefinitionId,actor);
    history(ops,actor,data.adaptation?'Angle adapted':'Angle used in calendar',p.title,null,{contentId:p.id,angleId:a.id,strategyVersionId:strategy.id,measurementDefinitionId:a.kpiDefinitionId});return p;
  }
  function linkCitations(state,brandId,postId,ids,actor){
    const ops=store(state,brandId),p=one(state.posts.filter(p=>p.brandId===brandId),postId,'Content'),sources=ids.length?selectedSources(ops,ids):[];
    const snapshots=sources.map(citation),before=C.clone(p.researchCitations||[]);
    C.saveBrief(p,{brief:{researchCitations:snapshots,...(p.brief.creativeBrief?{creativeBrief:{...p.brief.creativeBrief,researchCitations:snapshots}}:{})}},actor);
    p.researchCitations=snapshots;C.event(p,'Content research links changed','Saved '+snapshots.length+' citation snapshots',actor);Object.assign(p.history.at(-1),{before,after:C.clone(snapshots)});return p;
  }
  function applyCalendarProposal(state,brandId,proposalId,contentId,date,reason,actor){
    const ops=store(state,brandId,true),proposal=one(ops.planningProposals||[],proposalId,'Planning proposal'),p=one(state.posts.filter(p=>p.brandId===brandId),contentId,'Calendar item');
    if(proposal.kind!=='calendar'||proposal.contentId)throw Error('Choose an unapplied calendar proposal.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Choose a proposed calendar date.');required(reason,'Change rationale');
    const before=O.calendarScope(p);C.saveBrief(p,{date},actor);Object.assign(proposal,{contentId:p.id,proposedDate:date,reason,status:'Applied to calendar draft',appliedAt:C.now()});
    history(ops,actor,'Measured result applied to calendar proposal',reason,before,{...O.calendarScope(p),resultProposalId:proposal.id});return p;
  }
  function validateAttachments(files){if(!Array.isArray(files)||files.length>8)throw Error('Attach up to eight source files.');for(const f of files)if(!f||typeof f.id!=='string'||typeof f.name!=='string'||typeof f.bytes!=='string'||!Number.isInteger(f.size)||f.size<=0||f.size>3*1024*1024||f.bytes.length!==4*Math.ceil(f.size/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.bytes))throw Error('Invalid source attachment. Each file must be at most 3 MB.');}
  function validate(state){
    for(const b of state.brands){const ops=store(state,b.id);for(const key of ['themes','angles','kpis']){if(!Array.isArray(ops[key])||ops[key].length>20000)throw Error('Invalid research '+key);const ids=new Set();for(const r of ops[key]){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))throw Error('Invalid research IDs');ids.add(r.id);}}
      for(const s of ops.sources){if(s.attachments)validateAttachments(s.attachments);if(s.mergedInto)one(ops.sources,s.mergedInto,'Merged evidence');}
      for(const k of ops.kpis){validateKpi(k);if(!Number.isInteger(k.version)||k.version<1||typeof k.key!=='string'||typeof k.title!=='string')throw Error('Invalid KPI version');}
      for(const t of ops.themes){selectedSources(ops,t.sourceIds);if(!Array.isArray(t.citations)||typeof t.title!=='string')throw Error('Invalid theme');}
      for(const a of ops.angles){one(ops.themes,a.themeId,'Theme');one(ops.strategies,a.strategyVersionId,'Strategy');one(ops.kpis,a.kpiDefinitionId,'KPI');if(!Array.isArray(a.citations)||!Array.isArray(a.decisions)||!['candidate','selected','deferred','rejected','used'].includes(a.status))throw Error('Invalid angle');if(a.contentId)one(state.posts.filter(p=>p.brandId===b.id),a.contentId,'Linked draft');}
      for(const s of ops.strategies)if(s.body.kpiDefinitionId)one(ops.kpis,s.body.kpiDefinitionId,'KPI');
      for(const p of state.posts.filter(p=>p.brandId===b.id)){if(p.measurementDefinitionId)one(ops.kpis,p.measurementDefinitionId,'Content KPI');if(p.strategyVersionId)one(ops.strategies,p.strategyVersionId,'Content strategy');if(p.planningAngleId)one(ops.angles,p.planningAngleId,'Content angle');}
    }return state;
  }

  const btn=(label,action,id='',primary=false)=>'<button class="btn '+(primary?'primary':'small')+'" type="button" data-research-action="'+esc(action)+'" data-research-id="'+esc(id)+'">'+esc(label)+'</button>';
  const link=(url,label)=>safeLink(url)?'<a href="'+esc(safeLink(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>':'';
  const panel=(title,description,body,actions='')=>'<section class="panel research-panel"><div class="panel-head"><div><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p></div><div class="actions">'+actions+'</div></div><div class="panel-body">'+body+'</div></section>';
  const empty=message=>'<p class="research-empty">'+esc(message)+'</p>';
  const badge=value=>'<span class="research-badge">'+esc(value)+'</span>';
  const input=(name,label,value='',type='text',req=false)=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'"'+(req?' required':'')+(type==='number'?' step="any" min="0"':'')+'></label>';
  const area=(name,label,value='',req=false)=>'<label class="full">'+esc(label)+'<textarea name="'+name+'" rows="3"'+(req?' required':'')+'>'+esc(value)+'</textarea></label>';
  const select=(name,label,options,value)=>'<label>'+esc(label)+'<select name="'+name+'">'+[...options,...(value&&!options.some(x=>(Array.isArray(x)?x[0]:x)===value)?[[value,value+' (saved value)']]:[])].map(x=>{const [key,label]=Array.isArray(x)?x:[x,x];return '<option value="'+esc(key)+'"'+(key===value?' selected':'')+'>'+esc(label)+'</option>';}).join('')+'</select></label>';
  const checks=(name,label,items,selected=[])=>'<fieldset class="full research-checks"><legend>'+esc(label)+'</legend>'+(items.length?items.map(r=>'<label><input type="checkbox" name="'+name+'" value="'+esc(r.id)+'"'+(selected.includes(r.id)?' checked':'')+'><span>'+esc(r.title)+' <small>'+esc(r.type||'')+'</small></span></label>').join(''):empty('Capture evidence first.'))+'</fieldset>';
  let currentTab='evidence',query='';
  function can(ctx,capability,record){return !root.JMLGovernance?ctx.ui.role==='agency':root.JMLGovernance.can(ctx.state,ctx.ui,capability,record);}
  function assertAccess(ctx,kind,id){
    const p=kind==='link'?ctx.state.posts.find(p=>p.id===id&&p.brandId===ctx.ui.brand):null;
    const caps=['evidence','review','merge'].includes(kind)?['strategy','analyze']:['promote','adapt','idea-draft','proposal-calendar'].includes(kind)?['strategy','coordinate']:kind==='link'?['edit']:['strategy'];
    if(ctx.ui.role!=='agency'||!caps.some(cap=>can(ctx,cap,p)))throw Error('Your current account assignment does not allow this action.');
  }
  function form(ctx,title,kind,id,body,submit='Save'){ctx.showModal(title,'<form data-research-form="'+esc(kind)+'" data-research-id="'+esc(id||'')+'" data-research-brand="'+esc(ctx.ui.brand)+'"><div class="modal-body form-grid">'+body+'<p class="form-error full" data-research-error role="alert"></p></div><div class="modal-actions">'+btn('Cancel','close')+'<button class="btn primary" type="submit">'+esc(submit)+'</button></div></form>');}
  function evidenceCards(ops){const q=query.toLowerCase();const rows=ops.sources.filter(s=>!s.mergedInto&&[s.title,s.observation,s.type,s.channel,s.reference].join(' ').toLowerCase().includes(q));return rows.length?'<div class="research-grid">'+rows.slice().reverse().map(s=>'<article class="research-card">'+badge(s.type)+badge(s.status||'captured')+'<h3>'+esc(s.title)+'</h3><p class="research-copy">'+esc(s.observation)+'</p><p class="research-meta">'+esc(s.observed)+' · '+esc(s.channel||s.sourceType||'Manual observation')+' · '+esc(s.confidence||'Unassessed')+'</p>'+link(s.reference,'Open source')+'<div class="actions">'+btn('Create content draft','idea-draft',s.id,true)+btn('Inspect source','inspect',s.id)+'</div>'+U.optional('Edit or review this evidence',btn('Edit','evidence',s.id)+btn('Review','review',s.id)+btn('Merge duplicate','merge',s.id))+'</article>').join('')+'</div>':empty(query?'No matching evidence in this account.':'Capture an audience question, an observation, or a cited creative reference.');}
  function view(ctx,section){
    const ops=store(ctx.state,ctx.ui.brand);
    if(section==='foundation')return '<div class="research-stack"><header><h1>Client foundation</h1><p>Goals, delivery scope and the people responsible for this account.</p></header>'+O.view(ctx,'plan',{section:'foundation',embedded:true})+'</div>';
    if(section==='strategy')return strategyView(ctx,ops)+proposalView(ctx,ops);
    if(section==='calendar-approvals')return O.view(ctx,'plan',{section:'calendar',embedded:true});
    const tabs=[['evidence','Evidence inbox'],['themes','Themes (optional)'],['angles','Angles & ideas'],['watchlists','Audits & watchlists']];
    let body='';
    if(currentTab==='evidence')body=panel('Evidence inbox','Keep each observation with its exact source, context and limits.','<label class="research-search">Find evidence<input id="research-search" type="search" value="'+esc(query)+'" placeholder="Search questions, prompts or sources"></label><div id="research-evidence-results">'+evidenceCards(ops)+'</div>',btn('Capture evidence','evidence','',true))+'<details class="research-library"><summary>Open research libraries and reference tools</summary><div class="research-grid">'+REFERENCES.map(r=>'<article class="research-card"><h3>'+esc(r.title)+'</h3><p>'+esc(r.description)+'</p>'+r.links.map(([label,url])=>link(url,label)).join('<br>')+'</article>').join('')+'</div><p class="research-meta">Links open their source. Save the specific observation or prompt here to cite it in a brief.</p></details>';
    else if(currentTab==='themes')body=panel('Questions & themes','Select the observations that support each interpretation. Keep contradictory evidence visible.',ops.themes.length?'<div class="research-grid">'+ops.themes.map(t=>'<article class="research-card"><h3>'+esc(t.title)+'</h3>'+badge(t.sourceIds.length===1?'Single observation':t.sourceIds.length+' linked observations')+'<p>'+esc(t.summary)+'</p>'+(t.contradictions?'<p><strong>Limits / contradictions:</strong> '+esc(t.contradictions)+'</p>':'')+'<div class="actions">'+btn('Inspect evidence','theme-details',t.id)+btn('Edit theme','theme',t.id)+btn('Develop angle','angle',t.id)+'</div></article>').join('')+'</div>':empty('Group audience questions and observations into a theme.'),btn('Group evidence','theme','',true));
    else if(currentTab==='angles')body=panel('Angles & ideas','Compare candidates and record why an idea is selected, deferred or rejected.',ops.angles.length?'<div class="research-grid">'+ops.angles.map(a=>{const strategy=ops.strategies.find(s=>s.id===a.strategyVersionId),k=ops.kpis.find(k=>k.id===a.kpiDefinitionId);return '<article class="research-card">'+badge(a.status)+badge(a.evidenceType)+'<h3>'+esc(a.title)+'</h3><p>'+esc(a.hook)+'</p><p class="research-meta">'+esc(a.platform)+' · '+esc(a.format)+' · '+esc(k?.title||'KPI unavailable')+' · Strategy V'+esc(strategy?.number)+'</p>'+ (ops.strategies.at(-1)?.id!==a.strategyVersionId?'<p class="research-warning">A newer strategy exists. Review this proposal against the updated direction.</p>':'')+'<div class="actions">'+btn('Inspect','angle-details',a.id)+(a.contentId?'<a class="link-btn" href="#content/'+encodeURIComponent(a.contentId)+'/brief">Open calendar draft</a>'+btn('Create adaptation','adapt',a.id):btn('Record decision','angle-decision',a.id)+(a.status==='selected'?btn('Create calendar draft','promote',a.id,true):''))+'</div></article>';}).join('')+'</div>':empty('Develop an angle from a theme after saving a strategy and KPI agreement.'));
    else body=O.view(ctx,'plan',{section:'research',embedded:true,watchlistsOnly:true});
    return '<div class="research-stack"><header class="research-heading"><div><h1>Research</h1><p>Turn a source into an audience insight, then a testable content idea.</p></div><a class="link-btn" href="#plan/strategy">Strategy &amp; KPIs</a></header><nav class="ops-tabs" aria-label="Research areas">'+tabs.map(([key,label])=>'<button type="button" data-research-action="tab" data-research-id="'+key+'" aria-pressed="'+(currentTab===key)+'">'+label+'</button>').join('')+'</nav>'+body+'</div>';
  }
  function strategyView(ctx,ops){
    const latest=ops.strategies.at(-1),decision=latest&&ops.decisions.find(d=>d.targetId===latest.id),kpis=ops.kpis.slice().reverse();
    const strategyAction=latest?btn('Revise strategy','strategy','',true):btn('Set direction','strategy','',true);
    const current=latest?'<article class="strategy-direction"><h3>'+esc(latest.body.objective)+'</h3><p>'+esc(latest.body.audience)+'</p><dl class="ops-facts"><div><dt>Channels and cadence</dt><dd>'+esc(latest.body.channelRoles)+'</dd></div><div><dt>Content themes</dt><dd>'+esc(latest.body.pillars)+'</dd></div></dl><div class="actions">'+badge('Strategy V'+latest.number)+badge(decision?.decision||'Awaiting client decision')+'<button class="btn small" data-ops-action="inspect-strategy" data-ops-id="'+esc(latest.id)+'">Inspect saved version</button>'+(!decision?'<button class="btn primary" data-ops-action="decision-strategy" data-ops-id="'+esc(latest.id)+'">Review strategy</button>':'')+'</div></article>':empty('Start with the audience, channel role and content themes. Your account goal and audience are already filled in.');
    return '<div class="research-stack"><header><h1>Strategy &amp; KPIs</h1></header>'+
      U.lead('Agree on what success looks like','Set the direction once. Content drafts inherit the audience, objective and agreed measure.',ops.kpis.length?strategyAction:btn('Choose a measure','kpi','',true))+
      panel('Current direction','The client decision applies to this saved version.',current)+
      panel('Measures of success','Presets supply the formula and units. A baseline can stay unknown.',kpis.length?'<div class="research-grid">'+kpis.map(k=>'<article class="research-card"><h3>'+esc(k.title)+' · V'+k.version+'</h3><p>'+esc([k.channel||'Any supported channel',k.window,k.distribution].join(' · '))+'</p><p>Baseline: '+(k.baseline.value===null?'Not established':esc(k.baseline.value)+' '+esc(k.unit))+'</p>'+U.optional('Formula and source','<div class="full"><p class="research-formula">'+esc(k.numerator)+(k.denominator?' ÷ '+esc(k.denominator)+' × '+k.scale:'')+'</p><p>'+esc(k.unit)+' · '+esc(k.dataSource)+'</p><p>'+esc([k.baseline.source,k.baseline.window].filter(Boolean).join(' · '))+'</p>'+btn('Create revised definition','kpi',k.id)+'</div>')+'</article>').join('')+'</div>':empty('Choose a measure to get started.'),ops.kpis.length?btn('Add measure','kpi'):'')+
      U.optional('Calendar approvals and reserved slots',O.view(ctx,'plan',{section:'calendar',embedded:true}))+
      U.optional('Earlier strategy versions and planning history',
        (ops.strategies.length>1?'<div class="full">'+ops.strategies.slice(0,-1).reverse().map(v=>'<article class="research-row"><div><strong>Strategy V'+v.number+' · '+esc(v.body.objective)+'</strong></div><button class="btn small" data-ops-action="inspect-strategy" data-ops-id="'+esc(v.id)+'">Inspect</button></article>').join('')+'</div>':'')+
        '<div class="full">'+(ops.events.slice(-25).reverse().map(v=>'<details class="research-history"><summary>'+esc(v.action)+' · '+esc(v.actor)+' · '+esc(v.at.slice(0,10))+'</summary><p>'+esc(v.detail)+'</p>'+(v.before!==undefined?'<h4>Before</h4><pre>'+esc(JSON.stringify(v.before,null,2))+'</pre>':'')+(v.after!==undefined?'<h4>After</h4><pre>'+esc(JSON.stringify(v.after,null,2))+'</pre>':'')+'</details>').join('')||empty('No planning history yet.'))+'</div>')+'</div>';
  }
  function citationHTML(c){return '<article class="research-card">'+badge(c.type)+'<h3>'+esc(c.title)+'</h3><p class="research-copy">'+esc(c.text)+'</p><p>'+esc(c.observed)+' · '+esc(c.channel)+' · '+esc(c.confidence)+'</p><p>'+esc(c.limits)+'</p>'+link(c.url,'Open cited source')+'</article>';}
  function proposalView(ctx,ops){const rows=ops.planningProposals||[];if(!rows.length)return '';return panel('Next-plan proposals from results','Accepted interpretations create new proposals; earlier strategy and reports retain their original meaning.','<div class="research-grid">'+rows.map(p=>'<article class="research-card">'+badge(p.kind)+badge(p.status)+'<h3>'+esc(p.title)+'</h3><p>'+esc(p.detail)+'</p><p class="research-meta">'+esc(p.owner)+' · Review by '+esc(p.due)+' · Result '+esc(p.calculationId)+'</p><div class="actions">'+(p.strategyVersionId?'<button class="btn small" data-ops-action="inspect-strategy" data-ops-id="'+esc(p.strategyVersionId)+'">Inspect resulting strategy</button>':p.contentId?'<a class="link-btn" href="#content/'+encodeURIComponent(p.contentId)+'/brief">Open calendar draft</a>':btn(p.kind==='strategy'?'Use to revise strategy':'Apply to calendar draft',p.kind==='strategy'?'strategy-proposal':'proposal-calendar',p.id))+'</div></article>').join('')+'</div>');}
  function content(ctx,p){const citations=p.brief.researchCitations||p.researchCitations||[],k=getKpi(ctx.state,p.brandId,p.measurementDefinitionId);return panel('Research & measurement','Citation snapshots preserve the evidence used for this brief revision.',(k?'<p><strong>'+esc(k.title)+' V'+k.version+'</strong> · '+esc(k.unit)+' · '+esc(k.window)+'</p>':'')+(p.researchStatus?'<p>'+badge(p.researchStatus)+' '+esc(p.brief.researchUncertainty||'')+'</p>':'')+(citations.length?U.optional('View '+citations.length+' linked source'+(citations.length===1?'':'s'),'<div class="research-grid full">'+citations.map(citationHTML).join('')+'</div>'):empty('Link an insight or prompt from this account’s research.')),btn('Link research','link',p.id));}
  function action(ctx,actionName,target){
    if(!['close','tab','inspect','theme-details','angle-details','attachment','evidence','review','merge','theme','idea-draft','kpi','strategy','strategy-proposal','proposal-calendar','angle','angle-decision','promote','adapt','idea-draft','link'].includes(actionName))return false;
    const id=typeof target==='string'?target:target?.dataset?.researchId||'',ops=store(ctx.state,ctx.ui.brand),s=id?ops.sources.find(s=>s.id===id):null;
    if(actionName==='close'){ctx.closeModal();return true;}
    if(actionName==='tab'){currentTab=id;ctx.render();return true;}
    if(actionName==='inspect'){const source=one(ops.sources,id,'Evidence');ctx.showModal('Evidence & source history','<div class="modal-body">'+citationHTML(citation(source))+(source.relatedCitations?.length?'<h3>Merged source references</h3>'+source.relatedCitations.map(citationHTML).join(''):'')+'<div class="actions">'+(source.attachments||[]).map(f=>btn('Download '+f.name,'attachment',source.id+'|'+f.id)).join('')+'</div><details><summary>Saved revisions</summary><pre>'+esc(JSON.stringify(source.revisions||[],null,2))+'</pre></details></div>');return true;}
    if(actionName==='theme-details'||actionName==='angle-details'){const r=one(actionName==='theme-details'?ops.themes:ops.angles,id,'Research record');ctx.showModal(r.title,'<div class="modal-body"><pre class="research-record">'+esc(JSON.stringify({...r,citations:undefined},null,2))+'</pre><h3>Evidence snapshots</h3>'+r.citations.map(citationHTML).join('')+'</div>');return true;}
    if(actionName==='attachment'){const [sid,fid]=id.split('|'),file=one(ops.sources,sid,'Evidence').attachments.find(f=>f.id===fid);if(!file)throw Error('Attachment unavailable.');const bytes=Uint8Array.from(atob(file.bytes),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return true;}
    assertAccess(ctx,actionName,id);
    if(actionName==='strategy-proposal'){const p=one(ops.planningProposals||[],id,'Planning proposal');if(p.strategyVersionId)throw Error('This proposal already has a strategy draft.');action(ctx,'strategy','');const f=document.querySelector('[data-research-form="strategy"]');f.dataset.researchProposal=p.id;f.elements.objective.value=p.detail;if(ops.kpis.some(k=>k.id===p.definitionId))f.elements.kpiDefinitionId.value=p.definitionId;return true;}
    if(actionName==='proposal-calendar'){const p=one(ops.planningProposals||[],id,'Planning proposal'),posts=ctx.state.posts.filter(p=>p.brandId===ctx.ui.brand);if(!posts.length)throw Error('Create a calendar draft before applying this timing proposal.');form(ctx,'Apply result to calendar draft','proposal-calendar',id,select('contentId','Existing calendar item',posts.map(p=>[p.id,p.title]),'')+input('date','Proposed date',p.due,'date',true)+area('reason','What changes, and why?',p.detail,true),'Update proposed date');return true;}
    if(actionName==='evidence'){
      const zone=ctx.state.brands.find(b=>b.id===ctx.ui.brand)?.timezone;
      form(ctx,s?'Revise evidence':'Capture evidence','evidence',id,
        U.section('What did you notice?','Keep the observation and its source together.',area('observation','Observation or audience question',s?.observation,true)+select('type','How should this be treated?',TYPES,s?.type||TYPES[0]))+
        U.section('Where did it come from?','Add a reference or attach the original material.',input('reference','Source link or file reference',s?.reference)+'<label>Source file (optional)<input type="file" name="attachments" multiple></label>')+
        U.optional('Context and usage limits (optional)',input('title','Short title',s?.title)+input('observed','Observation date · '+(zone||'local time'),s?.observed||C.localDate(zone),'date',true)+input('channel','Channel',s?.channel||ops.foundation.channels?.split(',')[0]?.trim())+select('sourceType','Source category',['Audience question','Competitor audit','Platform export','Manual observation','Creative prompt','Paid creative archive','Organic research'],s?.sourceType||'Audience question')+input('audience','Audience',s?.audience)+input('window','Period covered',s?.window)+select('confidence','Confidence',['Unassessed','Low','Medium','High'],s?.confidence||'Unassessed')+area('rights','Coverage, uncertainty and usage limits',s?.rights)), 'Save evidence');
    }
    else if(actionName==='review')form(ctx,'Review evidence','review',id,area('note','Evidence quality, relevance and remaining limits','',true),'Record review');
    else if(actionName==='merge')form(ctx,'Merge duplicate evidence','merge',id,select('targetId','Keep this record as the primary reference',ops.sources.filter(x=>x.id!==id&&!x.mergedInto).map(x=>[x.id,x.title]),'')+area('reason','Why are these duplicates?','',true),'Merge, preserving references');
    else if(actionName==='theme'){const t=id?one(ops.themes,id,'Theme'):null;form(ctx,'Group audience questions','theme',id,input('title','Question or theme',t?.title,'text',true)+area('summary','What does this evidence suggest?',t?.summary,true)+area('contradictions','Contradictions, coverage gaps and uncertainty',t?.contradictions)+select('confidence','Confidence',['Unassessed','Low','Medium','High'],t?.confidence||'Unassessed')+checks('sourceIds','Select supporting and contradictory evidence',ops.sources.filter(s=>!s.mergedInto),t?.sourceIds));}
    else if(actionName==='kpi'){
      const k=id?one(ops.kpis,id,'KPI'):null,preset=k?KPI_PRESETS.find(p=>p.title===k.title&&p.numerator===k.numerator&&p.denominator===k.denominator&&p.scale===k.scale):KPI_PRESETS.find(p=>p.id==='saves-rate');
      form(ctx,k?'Revise measurement agreement':'Choose a measure','kpi',id,
        U.section('What should this work achieve?','Choose a preset. Its formula and units are supplied.',select('presetId','Measure',[...KPI_PRESETS.map(p=>[p.id,p.title]),['custom','Custom definition']],preset?.id||'custom')+select('channel','Channel',[['','Any supported channel'],'Instagram','LinkedIn','Facebook','TikTok','YouTube','X','Threads'],k?.channel||'')+input('window','Measurement window',k?.window||preset?.window||'7 days','text',true)+'<div class="task-summary full" data-preset-summary></div>')+
        '<div class="full" data-custom-kpi>'+U.section('Custom formula','Use measures your source can supply.',input('title','KPI name',k?.title||preset?.title,'text',true)+select('numerator','Measure to count',METRICS,k?.numerator||preset?.numerator)+select('denominator','Compare with',[['','None — raw count'],...METRICS],k?.denominator??preset?.denominator)+input('scale','Multiplier',k?.scale??preset?.scale,'number',true)+input('unit','Display unit',k?.unit||preset?.unit,'text',true))+'</div>'+
        U.optional('Baseline and source (optional)',input('baselineValue','Baseline value — leave blank if unknown',k?.baseline?.value??'','number')+'<div class="full form-grid" data-baseline-fields>'+input('baselineSource','Baseline source',k?.baseline?.source)+input('baselineWindow','Baseline period',k?.baseline?.window||k?.window||preset?.window)+input('baselineSampleSize','Sample size',k?.baseline?.sampleSize)+select('baselineDistribution','Baseline distribution',['Organic','Paid','Mixed'],k?.baseline?.distribution||'Organic')+'</div>'+select('distribution','Distribution',['Organic','Paid','Mixed'],k?.distribution||'Organic')+input('dataSource','Measurement source',k?.dataSource||preset?.dataSource,'text',true)), 'Save KPI definition');
      updateKpiForm(document.querySelector('[data-research-form="kpi"]'));
    }
    else if(actionName==='strategy'){
      if(!ops.kpis.length)throw Error('Choose a KPI first.');const last=ops.strategies.at(-1);
      form(ctx,'Save strategy version','strategy','',
        U.section('Direction for the next plan','The goal and audience carry over from the account brief.',area('objective','Business objective',last?.body.objective||ops.foundation.priorities||ops.foundation.business,true)+area('audience','Audience and value proposition',last?.body.audience||ops.foundation.audience,true)+area('channelRoles','Channel roles and cadence',last?.body.channelRoles,true)+area('pillars','Content themes',last?.body.pillars,true))+
        U.section('How we will judge it','Choose the agreed measure; its definition stays attached to this strategy.',select('kpiDefinitionId','Primary KPI agreement',ops.kpis.map(k=>[k.id,k.title+' · V'+k.version]),last?.body.kpiDefinitionId||ops.kpis.at(-1).id)+input('cadence','Reporting cadence',last?.body.cadence||'Monthly','text',true))+
        U.optional('Target, supporting evidence and growth tests',input('target','Target, if agreed',last?.body.target)+area('growth','Growth tests and community ownership',last?.body.growth)+checks('sourceIds','Evidence informing this version',ops.sources.filter(s=>!s.mergedInto),last?.sourceIds||[])), 'Save for client review');
    }
    else if(actionName==='angle'||actionName==='idea-draft'){
      if(!ops.strategies.length)throw Error('Save a strategy and its KPI first, then create a content draft from this source.');
      const direct=actionName==='idea-draft',source=direct?one(ops.sources,id,'Evidence'):one(ops.themes,id,'Theme'),last=ops.strategies.at(-1),k=ops.kpis.find(k=>k.id===last.body.kpiDefinitionId);
      const producer=root.JMLGovernance?.eligiblePeople(ctx.state,ctx.ui.brand,'design').find(p=>!p.agencyAdmin)?.name||ctx.ui.actor;
      form(ctx,direct?'Turn evidence into a draft':'Develop content idea',actionName,id,
        U.summary('Using Strategy V'+last.number,(last.body.audience||'')+' · '+(k?.title||''))+
        U.section('The content idea','One idea, linked to its original evidence.',input('title','Content title',source.title,'text',true)+area('hook','Opening message','',true)+input('cta','What should the audience do next?')+select('platform','Channel',['Instagram','LinkedIn','Facebook','TikTok','YouTube','X'],source.channel||'Instagram')+select('format','Format',['Carousel','Photo','Reel','Video','Text post','Story'],'Carousel'))+
        (direct?U.section('Put it on the calendar','This creates a draft; approval follows separately.',input('owner','Producer',producer,'text',true)+input('date','Proposed date','','date')):'')+
        U.optional('Adjust inherited strategy or context',area('problem','Audience problem',source.summary||source.observation,true)+input('audience','Audience',last.body.audience,'text',true)+area('objective','Objective',last.body.objective,true)+select('strategyVersionId','Strategy version',ops.strategies.map(v=>[v.id,'V'+v.number+' · '+v.body.objective]),last.id)+select('kpiDefinitionId','Primary KPI',ops.kpis.map(k=>[k.id,k.title+' · V'+k.version]),last.body.kpiDefinitionId)+area('rationale','Why this idea? (optional)')+area('uncertainty','What remains uncertain?',source.contradictions||source.rights||((source.type==='Hypothesis')?'Test the linked hypothesis; no observed audience outcome yet.':''))),direct?'Create calendar draft':'Save idea');
    }
    else if(actionName==='angle-decision')form(ctx,'Choose the next idea','angle-decision',id,select('outcome','Decision',['selected','deferred','rejected'],'selected')+area('reason','Reason — required for defer or reject'),'Record decision');
    else if(actionName==='promote'||actionName==='adapt'){const a=one(ops.angles,id,'Angle');form(ctx,actionName==='adapt'?'Create a deliberate adaptation':'Create calendar draft',actionName,id,input('title','Content title',a.title,'text',true)+input('owner','Delivery owner',ctx.ui.actor,'text',true)+input('date','Proposed date','','date')+'<p class="full">Creates a draft linked to this evidence, strategy and KPI version. Calendar and production brief decisions follow separately.</p>','Create draft');}
    else if(actionName==='link'){const p=one(ctx.state.posts.filter(p=>p.brandId===ctx.ui.brand),id,'Content');form(ctx,'Link research to brief','link',id,checks('sourceIds','Choose insights and creative references',ops.sources.filter(s=>!s.mergedInto),(p.brief.researchCitations||p.researchCitations||[]).map(s=>s.id)),'Save citation snapshots');}
    else return false;return true;
  }
  async function attachment(file){if(!file.size||file.size>3*1024*1024)throw Error('Each source file must be between 1 byte and 3 MB.');const bytes=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Source file could not be read.'));reader.readAsDataURL(file);});return {id:C.id('source-file'),name:file.name,size:file.size,mime:file.type,bytes};}
  async function submit(ctx,formElement){
    const kind=formElement.dataset.researchForm;if(!kind)return false;
    const brandId=formElement.dataset.researchBrand,id=formElement.dataset.researchId;
    if(brandId!==ctx.ui.brand)throw Error('The account changed. Reopen this form.');
    assertAccess(ctx,kind,id);
    const fd=new FormData(formElement),data=Object.fromEntries(fd);data.sourceIds=fd.getAll('sourceIds');data.resultProposalId=formElement.dataset.researchProposal||'';
    if(kind==='evidence'){const old=store(ctx.state,brandId).sources.find(s=>s.id===id);data.attachments=[...(old?.attachments||[]),...await Promise.all(fd.getAll('attachments').filter(f=>f.size).map(attachment))];}
    let openId='';
    const result=await ctx.commit(next=>{const actor=ctx.ui.actor,eventStart=store(next,brandId).events.length;
      if(kind==='evidence')saveEvidence(next,brandId,data,actor,id);
      else if(kind==='review')reviewEvidence(next,brandId,id,actor,data.note);
      else if(kind==='merge')mergeEvidence(next,brandId,id,data.targetId,actor,data.reason);
      else if(kind==='theme')saveTheme(next,brandId,data,actor,id);
      else if(kind==='kpi')saveKpi(next,brandId,{...data,previousId:id},actor);
      else if(kind==='strategy')saveStrategy(next,brandId,data,actor);
      else if(kind==='idea-draft')openId=createIdeaDraft(next,brandId,id,data,actor).id;
      else if(kind==='angle')saveAngle(next,brandId,{...data,themeId:id},actor);
      else if(kind==='angle-decision')decideAngle(next,brandId,id,data.outcome,data.reason,actor);
      else if(kind==='promote'||kind==='adapt')openId=promoteAngle(next,brandId,id,{...data,adaptation:kind==='adapt'},actor).id;
      else if(kind==='link')linkCitations(next,brandId,id,data.sourceIds,actor);
      else if(kind==='proposal-calendar')openId=applyCalendarProposal(next,brandId,id,data.contentId,data.date,data.reason,actor).id;
      else throw Error('Unknown research action.');
      for(const event of store(next,brandId).events.slice(eventStart))if(ctx.ui.personId)event.actorId=ctx.ui.personId;
      root.JMLGovernance?.log?.(next,ctx.ui,'Research '+kind,{brandId,contentId:openId||undefined,recordId:id,capability:['promote','adapt'].includes(kind)?'coordinate':'strategy'});
    },'Saved to this account.');
    if(result===false)return true;ctx.closeModal();if(openId)ctx.navigate('#content/'+encodeURIComponent(openId)+'/brief');return true;
  }
  function updateKpiForm(form){
    if(!form)return;const f=form.elements,preset=KPI_PRESETS.find(p=>p.id===f.presetId.value),custom=form.querySelector('[data-custom-kpi]');
    custom.hidden=!!preset;custom.querySelectorAll('input,select').forEach(el=>el.disabled=!!preset);
    const summary=form.querySelector('[data-preset-summary]');summary.textContent=preset?preset.note+' Formula: '+preset.numerator+(preset.denominator?' ÷ '+preset.denominator+' × '+preset.scale:'')+'. Unit: '+preset.unit+'.':'Define your formula below. Existing results keep their original definition.';
    if((preset?.numerator||f.numerator.value)==='netfollowers')f.baselineValue.removeAttribute('min');else f.baselineValue.min='0';
    const known=f.baselineValue.value!=='',fields=form.querySelector('[data-baseline-fields]');fields.hidden=!known;fields.querySelectorAll('input,select').forEach(el=>el.disabled=!known);f.baselineSource.required=known;f.baselineWindow.required=known;
  }
  function change(ctx,el){
    const form=el.closest?.('[data-research-form="kpi"]');if(form&&['presetId','baselineValue','numerator'].includes(el.name)){updateKpiForm(form);return true;}
if(el.id==='research-search'){query=el.value;const host=document.getElementById('research-evidence-results');if(host)host.innerHTML=evidenceCards(store(ctx.state,ctx.ui.brand));return true;}return false;}
  let liveContext=null,inputInstalled=false;
  function init(ctx){liveContext=ctx;if(inputInstalled||typeof document==='undefined')return;inputInstalled=true;document.addEventListener('input',ev=>{if(ev.target.id==='research-search'||ev.target.name==='baselineValue')change(liveContext,ev.target);});}
  const api={KPI_PRESETS,createIdeaDraft,view,content,action,submit,change,init,validate,store,getKpi,saveEvidence,reviewEvidence,mergeEvidence,saveTheme,saveKpi,saveStrategy,saveAngle,decideAngle,promoteAngle,linkCitations,applyCalendarProposal,citation,safeLink,REFERENCES,METRICS};
  if(node)module.exports=api;else root.JMLResearch=api;
})(typeof window!=='undefined'?window:globalThis);
