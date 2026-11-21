/* Local release and evidence records. All writes occur inside a workspace transaction. */
(function (root) {
  'use strict';
  const C = typeof module === 'object' && module.exports ? require('./core.js') : root.JMLCore;
  const groups = ['placements', 'pauses', 'observations', 'batches', 'work', 'reports', 'events'];
  const expansionGroups = ['calculations','proposals'];
  const modes = ['manual', 'simulation'];
  const states = ['ready', 'failed', 'handed-off', 'uncertain', 'scheduled', 'verified', 'cancel-pending', 'cancelled'];
  const workTypes = ['Finding', 'Experiment', 'Audience opportunity', 'Collaboration', 'Watchlist', 'Community case'];
  const metricTypes = ['period', 'lifetime'];
  const segments = ['organic', 'paid', 'mixed'];
  const origins = ['recorded', 'fixture'];
  const requireValue = (ok, message) => { if (!ok) throw Error(message); };
  const string = (v) => typeof v === 'string' && v.length < 100000;
  const nonblank = (v) => string(v) && !!v.trim();
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const date = v => /^\d{4}-\d\d-\d\d$/.test(v || '') && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  const moment = v => string(v) && !Number.isNaN(Date.parse(v));
  const https = v => {try {const u = new URL(v);return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;}catch{return false;}};
  const tz = v => {try {return nonblank(v) && !!new Intl.DateTimeFormat('en',{timeZone:v});}catch{return false;}};
  // A datetime-local value has no offset. Resolve it in the destination zone,
  // never in the browser's zone, and reject DST gaps/overlaps rather than guessing.
  function localToInstant(local, timezone) {
    requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local || '') && date(local.slice(0,10)) && +local.slice(11,13)<24 && +local.slice(14,16)<60,'Enter a valid local publication date and time.');
    requireValue(tz(timezone),'Choose a valid destination time zone.');
    const wall=Date.parse(local+':00Z');
    const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    const wallAt=instant=>{const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));return Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');};
    const offsets=new Set();
    for(let hours=-36;hours<=36;hours+=6){const sample=wall+hours*3600000;offsets.add(wallAt(sample)-sample);}
    const matches=[...offsets].map(offset=>wall-offset).filter(instant=>wallAt(instant)===wall);
    requireValue(matches.length!==0,'This local time does not exist because the clocks change. Choose another time.');
    requireValue(matches.length===1,'This local time occurs twice because the clocks change. Choose an unambiguous time.');
    return new Date(matches[0]).toISOString();
  }
  function briefSchedule(post) {
    return {local:post.date&&post.time?post.date+'T'+post.time.slice(0,5):'',timezone:post.timezone||'UTC'};
  }
  function placementSchedule(post,fields) {
    const approved=briefSchedule(post),instant=localToInstant(fields.scheduledLocal,fields.timezone);
    return {instant,approved,changed:fields.scheduledLocal!==approved.local||fields.timezone!==approved.timezone};
  }
  function clean(value, label, required = false) {
    const result = String(value ?? '').trim();
    requireValue(result.length < 100000 && (!required || !!result), 'Enter '+label+'.');
    return result;
  }
  function fresh() {return Object.fromEntries([['version',1], ...[...groups,...expansionGroups].map(k => [k, []])]);}
  function read(state) {return {...fresh(),...(state.releaseLearning || {})};}
  function data(state) {const db=state.releaseLearning ||= fresh();for(const k of expansionGroups)db[k] ||= [];return db;}
  function entry(state, collection, brand, id) {
    const value = data(state)[collection].find(v=>v.id===id && v.brandId===brand);
    requireValue(value, 'This record is no longer in this account.'); return value;
  }
  function sourcePost(state, brand, id) {
    const post = state.posts.find(v=>v.id===id && v.brandId===brand);
    requireValue(post,'Choose content in the active workspace.'); return post;
  }
  function audit(state, brand, type, targetId, actor, note) {
    const db=data(state),target=[...db.placements,...db.work,...db.calculations,...db.proposals].find(x=>x.id===targetId&&x.brandId===brand);
    const event = {id:C.id('activity'),brandId:brand,type,targetId,actor,at:C.now(),note,...(target?.contentId?{contentId:target.contentId}:{}),...(target?.versionId?{versionId:target.versionId}:{}),...(target?.briefRevision?{briefRevision:target.briefRevision}:{})};
    data(state).events.push(event); return event;
  }
  function isPaused(state, p) {
    return read(state).pauses.some(v=>v.active && (v.scope==='workspace' || (v.brandId===p.brandId && (v.scope==='brand' || (v.scope==='destination' && v.target===p.account) || (v.scope==='placement' && v.target===p.id)))));
  }
  function pause(state, brandId, scope, target, actor) {
    requireValue(['workspace','brand','destination','placement'].includes(scope),'Choose a pause scope.');
    if(scope==='placement')entry(state,'placements',brandId,target);
    const store = data(state);
    let rule = store.pauses.find(r=>r.scope===scope && (scope==='workspace' || r.brandId===brandId) && r.target===target);
    if(!rule) {rule={id:C.id('pause'),brandId,scope,target,active:false};store.pauses.push(rule);}
    rule.active=!rule.active;
    audit(state,brandId,rule.active?'Releases paused':'Releases resumed',rule.id,actor,scope+' '+target);return rule;
  }
  function currentPackage(state,p) {
    const post=sourcePost(state,p.brandId,p.contentId);
    const v=C.latest(post);
    return C.isApproved(post) && v.id===p.versionId && post.briefRevision===p.briefRevision && !C.readiness(post).length && (!p.handoff || (v.caption===p.handoff.caption && JSON.stringify(v.assets)===JSON.stringify(p.handoff.assets) && v.decisions.some(d=>d.id===p.handoff.decisionId&&d.action==='approved')));
  }
  function handoffSnapshot(post,version,placement,actor) {
    const decision=version.decisions.slice().reverse().find(d=>d.action==='approved');
    requireValue(decision,'The exact creative approval decision is missing.');
    return {id:C.id('handoff'),contentId:post.id,brandId:post.brandId,versionId:version.id,versionNumber:version.number,briefRevision:version.briefRevision,
      decisionId:decision.id,decision:C.clone(decision),qaDecisionId:version.qaDecision?.id||'',qaDecision:C.clone(version.qaDecision||null),planDecision:C.clone(post.planApproval),
      caption:version.caption,assets:C.clone(version.assets),title:post.title,format:placement.format,platform:placement.platform,account:placement.account,
      scheduledAt:placement.scheduledAt,timezone:placement.timezone,nativeNotes:placement.nativeNotes,rightsUntil:placement.rightsUntil,
      sender:decision.actor,preparedBy:actor,recipient:placement.owner,ownerPersonId:placement.ownerPersonId||'',communityOwner:placement.communityOwner,communityOwnerPersonId:placement.communityOwnerPersonId||'',at:C.now()};
  }
  function createPlacement(state,brandId,fields,actor) {
    const post=sourcePost(state,brandId,fields.contentId), version=C.latest(post);
    if(fields.scheduledLocal!==undefined){
      const schedule=placementSchedule(post,fields);
      requireValue(!schedule.changed||fields.timingChangeApproved===true,'Confirm approval for the timing change from the creative brief.');
      fields={...fields,scheduledAt:schedule.instant};
    }
    requireValue(C.isApproved(post) && !C.readiness(post).length,'Finish the brief, inputs and creative approval in Studio and Review.');
    requireValue(modes.includes(fields.mode),'Choose a release method.');
    requireValue(fields.mode==='simulation' || (!post.example && post.brandId!=='demo'),'Example content uses simulation.');
    requireValue(moment(fields.scheduledAt) && tz(fields.timezone),'Enter the planned instant and a valid time zone.');
    const account=clean(fields.account,'the destination account',true), platform=clean(fields.platform,'the destination platform',true);
    requireValue(fields.scopeApproved===true,'Confirm release approval for this account and exact version.');
    const approval=version.decisions.slice().reverse().find(d=>d.action==='approved');
    requireValue(approval?.actor===fields.approver,'Use the named approver from this exact creative decision.');
    requireValue(!data(state).placements.some(p=>p.brandId===brandId && p.contentId===post.id && p.versionId===version.id && p.account===account && p.platform===platform && p.scheduledAt===fields.scheduledAt && p.mode===fields.mode && p.state!=='cancelled'),'This version already has a placement for that account and time.');
    const placement={id:C.id('placement'),brandId,contentId:post.id,versionId:version.id,briefRevision:post.briefRevision,mode:fields.mode,platform,account,
      owner:clean(fields.owner,'the publisher',true),communityOwner:clean(fields.communityOwner,'the community owner',true),format:clean(fields.format || post.format,'the format',true),
      scheduledAt:new Date(fields.scheduledAt).toISOString(),timezone:fields.timezone,nativeNotes:clean(fields.nativeNotes,'the finishing instructions'),
      rightsUntil:clean(fields.rightsUntil,'the permission expiry'),approval:{actor:clean(fields.approver,'the release approver',true),recordedBy:actor,at:C.now()},
      ownerPersonId:clean(fields.ownerPersonId,'publisher identity'),communityOwnerPersonId:clean(fields.communityOwnerPersonId,'community identity'),
      state:'ready',attempts:[],verification:null,createdAt:C.now()};
    if(placement.rightsUntil)requireValue(date(placement.rightsUntil),'Choose a valid permission expiry date.');
    placement.handoff=handoffSnapshot(post,version,placement,actor);placement.receipt=null;
    data(state).placements.push(placement);audit(state,brandId,'Placement prepared',placement.id,actor,platform+' Â· '+account);return placement;
  }
  function receiveHandoff(state,brandId,id,actor,personId='') {
    const p=entry(state,'placements',brandId,id);
    requireValue(currentPackage(state,p),'The approved package changed. Prepare the current approved version.');
    requireValue(!['cancelled','verified'].includes(p.state),'This release no longer needs a publisher receipt.');
    requireValue(p.ownerPersonId?personId===p.ownerPersonId:actor===p.owner,'Only the assigned publisher can accept this handoff.');
    requireValue(!p.receipt,'The publisher already accepted this handoff.');
    if(!p.handoff)p.handoff=handoffSnapshot(sourcePost(state,brandId,p.contentId),sourcePost(state,brandId,p.contentId).versions.find(v=>v.id===p.versionId),p,actor);
    p.receipt={id:C.id('receipt'),handoffId:p.handoff.id,versionId:p.versionId,decisionId:p.handoff.decisionId,actor,personId,at:C.now()};
    audit(state,brandId,'Publisher accepted approved package',p.id,actor,'Version '+p.handoff.versionNumber+' Â· decision '+p.handoff.decisionId);return p.receipt;
  }
  function receiveCommunity(state,brandId,id,actor,personId='') {
    const p=entry(state,'placements',brandId,id);
    requireValue(p.state==='verified','Verify publication before accepting community work.');
    requireValue(p.communityOwnerPersonId?personId===p.communityOwnerPersonId:actor===p.communityOwner,'Only the assigned community owner can accept this handoff.');
    requireValue(!p.communityReceipt,'Community handoff already accepted.');
    p.communityReceipt={id:C.id('community-receipt'),actor,personId,at:C.now(),workId:p.communityWorkId||'',versionId:p.versionId};
    audit(state,brandId,'Community handoff accepted',p.id,actor,p.verification.url||p.verification.note);return p.communityReceipt;
  }
  function sealHandoff(state,brandId,id,files,actor,expectedHandoffId) {
    const p=entry(state,'placements',brandId,id);
    requireValue(currentPackage(state,p)&&p.handoff?.id===expectedHandoffId,'The package changed while its files were prepared. Reopen it.');
    requireValue(Array.isArray(files)&&files.length===p.handoff.assets.length&&files.every((f,i)=>f.index===i&&nonblank(f.name)&&Number.isInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256)),'The complete ordered file package is required.');
    if(p.handoff.files)requireValue(JSON.stringify(p.handoff.files)===JSON.stringify(files),'An approved asset has different bytes. Save a new creative version and request approval.');
    else p.handoff.files=C.clone(files);
    audit(state,brandId,'Approved file bundle exported',p.id,actor,p.handoff.id);return p.handoff;
  }
  function releaseDate(p, instant) {return new Intl.DateTimeFormat('sv-SE',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}
  function preflight(state,p,at=C.now()) {
    const post=sourcePost(state,p.brandId,p.contentId);
    const issues=[...new Set([...(C.permissionGaps?.(post,releaseDate(p,p.scheduledAt))||[]),...(C.permissionGaps?.(post,releaseDate(p,at))||[])])];
    if(!currentPackage(state,p))issues.push('The current brief, inputs or creative approval changed. Prepare a placement for the newly approved version.');
    if(isPaused(state,p))issues.push('A workspace, account or placement pause is active.');
    if(p.rightsUntil && (p.rightsUntil<releaseDate(p,p.scheduledAt) || p.rightsUntil<releaseDate(p,at)))issues.push('Usage permission expires before release.');
    return issues;
  }
  function packageFingerprint(p) {
    const metadata=[p.versionId,p.briefRevision,p.platform,p.account,p.format,p.scheduledAt,p.timezone,p.nativeNotes,p.approval.actor];
    let hash=2166136261;
    for(const ch of JSON.stringify(metadata))hash=Math.imul(hash^ch.charCodeAt(0),16777619);
    return (hash>>>0).toString(16).padStart(8,'0');
  }
  function capabilities(mode){return {mode,externalConnection:false,confirmation:mode==='simulation'?'fixture receipt':'manual evidence'};}
  const adapters={
    manual:{
      capabilities:()=>capabilities('manual'),
      validatePackage:preflight,
      getStatus:p=>p.state,
      reconcile:()=>{throw Error('Check the external schedule with the assigned publisher.');},
      verify(p,f){requireValue(https(f.url)&&moment(f.actualAt)&&Date.parse(f.actualAt)<=Date.now()+60000,'Enter a live HTTPS link and the actual publication time.');requireValue(nonblank(f.note),'Record your verification evidence.');return {actualAt:new Date(f.actualAt).toISOString(),url:f.url,note:f.note};},
      schedule:()=>({state:'handed-off',outcome:'Manual package handed off'}),
      cancel:()=>({state:'cancel-pending',outcome:'Awaiting manual cancellation confirmation'})
    },
    simulation:{
      capabilities:()=>capabilities('simulation'),
      validatePackage:preflight,
      getStatus:p=>p.state,
      reconcile:key=>({state:'scheduled',outcome:'Simulated receipt recovered',receipt:'SIM-'+key}),
      verify:p=>({actualAt:p.scheduledAt,url:'',note:'Simulated delivery confirmed'}),
      schedule(scenario,id){
        if(scenario==='reject')return {state:'failed',outcome:'Simulated provider rejected the request'};
        if(scenario==='timeout')return {state:'uncertain',outcome:'Simulated response lost; reconcile the request',receipt:''};
        requireValue(scenario==='accept','Choose a simulation outcome.');
        return {state:'scheduled',outcome:'Simulated scheduling acknowledgement',receipt:'SIM-'+id};
      },
      cancel:(scenario)=>scenario==='reject'?{state:'cancel-pending',outcome:'Simulated cancellation unconfirmed'}:{state:'cancelled',outcome:'Simulated cancellation confirmed'}
    }
  };
  function advance(state,brandId,id,operation,fields,actor) {
    const p=entry(state,'placements',brandId,id), prior=p.state, key=p.id+'@'+p.versionId;
    let result;
    if(operation==='schedule'){
      requireValue(p.attempts.filter(a=>a.operation==='schedule').length<4,'This placement reached its retry limit. Cancel it and prepare a corrected release.');
      requireValue(['ready','failed'].includes(prior),'Only ready or definitively failed placements can be submitted.');
      const issues=adapters[p.mode].validatePackage(state,p);requireValue(!issues.length,issues.join(' '));
      requireValue(fields.checked===true,'Check the destination, exports, copy, links and finishing instructions.');
      requireValue(!p.handoff || p.receipt?.handoffId===p.handoff.id,'The assigned publisher must accept the exact approved handoff first.');
      result=adapters[p.mode].schedule(fields.scenario,key);
    }else if(operation==='reconcile'){
      requireValue(prior==='uncertain' && p.mode==='simulation','Reconciliation requires an uncertain attempt.');
      result=adapters[p.mode].reconcile(key);
    }else if(operation==='cancel'){
      requireValue(['ready','failed','scheduled','handed-off','uncertain','cancel-pending'].includes(prior),'This release can no longer be cancelled.');
      result=['ready','failed'].includes(prior)?{state:'cancelled',outcome:'Local plan cancelled'}:adapters[p.mode].cancel(fields.scenario);
    }else if(operation==='confirm-cancel'){
      requireValue(prior==='cancel-pending' && p.mode==='manual' && fields.checked===true,'Confirm external cancellation before closing this attempt.');
      result={state:'cancelled',outcome:'Publisher confirmed external cancellation'};
    }else if(operation==='verify'){
      requireValue(['scheduled','handed-off'].includes(prior),'Record scheduling or handoff first.');
      requireValue(currentPackage(state,p),'The approved package changed. Reconcile the existing release with the publisher.');
      requireValue(fields.checked===true,'Confirm the files, copy and destination match.');
      const checked=adapters[p.mode].verify(p,fields);
      p.verification={...checked,at:C.now(),actor,versionId:p.versionId};
      result={state:'verified',outcome:p.mode==='manual'?'Live publication verified manually':'Simulated publication verified',receipt:p.mode==='manual'?fields.url:'SIM-'+key};
      const community=addWork(state,brandId,{kind:'Community case',title:'Community handoff Â· '+sourcePost(state,brandId,p.contentId).title,owner:p.communityOwner,due:releaseDate(p,p.verification.actualAt),evidence:result.receipt,detail:'Review replies and recurring questions for '+p.account+'.',fixture:p.mode==='simulation',placementId:p.id},actor);
      community.contentId=p.contentId;community.versionId=p.versionId;community.ownerPersonId=p.communityOwnerPersonId||'';p.communityWorkId=community.id;
    }else throw Error('Unknown release operation.');
    p.attempts.push({id:C.id('attempt'),key,payloadHash:packageFingerprint(p),operation,actor,at:C.now(),prior,state:result.state,outcome:result.outcome,receipt:result.receipt||''});
    p.state=result.state;audit(state,brandId,result.outcome,p.id,actor,p.account);return p;
  }
  function manifest(state,p) {
    const post=sourcePost(state,p.brandId,p.contentId),version=post.versions.find(v=>v.id===p.versionId);
    requireValue(version,'Missing package version.');
    return {kind:'jml-placement-manifest',schemaVersion:2,mode:p.mode,placement:C.clone(p),handoff:C.clone(p.handoff||null),version:C.clone(version),contentTitle:post.title,preflight:preflight(state,p),exportedAt:C.now(),externalAction:'none'};
  }
  function csvRows(text,delimiter=','){
    requireValue([',',';','\t'].includes(delimiter),'Unsupported delimiter.');
    const rows=[];let row=[],value='',quoted=false,closed=false;
    text=String(text).replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){if(ch!=='"')value+=ch;else if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}continue;}
      if(ch===delimiter){row.push(value);value='';closed=false;}
      else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value='';closed=false;}
      else if(ch==='"'&&!value&&!closed)quoted=true;
      else{requireValue(!closed && ch!=='"','Invalid CSV quoting.');value+=ch;}
    }
    requireValue(!quoted,'A quoted CSV field has no closing quote.');
    row.push(value);if(row.some(x=>x.trim()))rows.push(row);
    const headers=(rows.shift()||[]).map(x=>x.trim());
    requireValue(headers.length && headers.every(Boolean) && new Set(headers).size===headers.length,'Use unique, named columns.');
    return rows.map((r,i)=>{requireValue(r.length===headers.length,'Column count differs on row '+(i+2)+'.');return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
  }
  const dims=['account','contentId','placementId','source','metric','definition','unit','segment','aggregation','timezone','origin'];
  const identity = o => JSON.stringify([o.brandId,...dims.map(k=>o[k]),o.start,o.end]);
  const series = o => JSON.stringify([o.brandId,...dims.map(k=>o[k])]);
  function normalise(state,brandId,r,defaults={}){
    r={...defaults,...r};
    requireValue(!r.brandId||r.brandId===brandId,'This observation belongs to a different client account.');
    const row={brandId};
    for(const k of ['account','source','metric','definition','unit'])row[k]=clean(r[k],k,true);
    for(const k of ['contentId','placementId'])row[k]=clean(r[k],k);
    for(const k of ['start','end','collectedAt','timezone','segment','aggregation','origin'])row[k]=r[k];
    requireValue(date(row.start)&&date(row.end)&&row.start<=row.end&&date(row.collectedAt)&&row.collectedAt>=row.end,'Check the reporting and collection dates.');
    requireValue(tz(row.timezone)&&segments.includes(row.segment)&&metricTypes.includes(row.aggregation)&&origins.includes(row.origin),'Check the time zone, segment, aggregation and evidence type.');
    if(row.contentId)sourcePost(state,brandId,row.contentId);
    if(row.placementId){
      const p=read(state).placements.find(p=>p.id===row.placementId&&p.brandId===brandId);
      requireValue(p&&p.account===row.account&&(!row.contentId||p.contentId===row.contentId),'Placement, content and destination must match.');
      requireValue(p.mode!=='simulation'||row.origin==='fixture','Simulated placements require fixture evidence.');
      row.contentId=p.contentId;
    }
    if(brandId==='demo' || (row.contentId&&sourcePost(state,brandId,row.contentId).example))requireValue(row.origin==='fixture','The demo account uses fixture evidence.');
    requireValue(r.value==null||typeof r.value==='number'||typeof r.value==='string','Enter a number or leave the value empty.');
    row.value=r.value==null||String(r.value).trim()===''?null:Number(r.value);
    requireValue(row.value===null||Number.isFinite(row.value),'Metric value must be finite.');
    return row;
  }
  function preview(state,brandId,rows,defaults={}){
    requireValue(Array.isArray(rows)&&rows.length>0&&rows.length<=10000,'Import 1â€“10,000 observations at a time.');
    const existing=read(state).observations.filter(o=>o.brandId===brandId&&!o.supersededBy);
    const byKey=new Map(existing.map(o=>[identity(o),o])), mapped=[],errors=[],collisions=[],overlaps=[],seen=new Map();let duplicates=0;
    const seriesWindows=new Map();
    for(const o of existing){const key=series(o);if(!seriesWindows.has(key))seriesWindows.set(key,[]);seriesWindows.get(key).push(o);}
    rows.forEach((raw,i)=>{
      try{
        requireValue(obj(raw),'Expected an observation object.');
        const o=normalise(state,brandId,raw,defaults),key=identity(o),previous=byKey.get(key);
        if(seen.has(key)){requireValue(seen.get(key)===o.value,'Conflicting values in this file.');duplicates++;return;}
        seen.set(key,o.value);
        if(previous && previous.value===o.value){duplicates++;return;}
        if(previous)collisions.push({row:i+1,id:previous.id,old:previous.value,value:o.value});
        const group=series(o);
        const windows=seriesWindows.get(group)||[];
        if(windows.some(v=>(v.start!==o.start||v.end!==o.end)&&o.start<=v.end&&v.start<=o.end))overlaps.push(i+1);
        windows.push(o);seriesWindows.set(group,windows);
        mapped.push({row:o,previous:previous?.id||null});
      }catch(err){errors.push({row:i+1,message:err.message});}
    });return {mapped,errors,duplicates,collisions,overlaps};
  }
  function ingest(state,brandId,rows,opts,actor){
    const result=preview(state,brandId,rows,opts.defaults);
    requireValue(!result.errors.length,'Correct the invalid rows before importing.');
    requireValue(!result.collisions.length||opts.replace===true,'Confirm the changed values to save evidence revisions.');
    if(!result.mapped.length)return {count:0,duplicates:result.duplicates};
    const db=data(state), batch={id:C.id('import'),brandId,name:clean(opts.name,'a source reference',true),at:C.now(),actor,count:result.mapped.length,duplicates:result.duplicates,overlaps:result.overlaps.length,format:opts.format||'manual',mapping:opts.mapping||{},mappingVersion:1};
    db.batches.push(batch);
    for(const m of result.mapped){
      const o={...m.row,id:C.id('obs'),batchId:batch.id,previous:m.previous,supersededBy:null};
      if(m.previous)entry(state,'observations',brandId,m.previous).supersededBy=o.id;db.observations.push(o);
    }
    audit(state,brandId,'Evidence imported',batch.id,actor,batch.count+' observations');return batch;
  }
  function addWork(state,brandId,f,actor){
    requireValue(workTypes.includes(f.kind),'Choose a work type.');
    const item={id:C.id('learning'),brandId,kind:f.kind,title:clean(f.title,'a title',true),owner:clean(f.owner,'an owner',true),due:clean(f.due,'a review date',true),detail:clean(f.detail,'details',true),
      evidence:clean(f.evidence,'the evidence reference'),metric:clean(f.metric,'a success measure'),baseline:clean(f.baseline,'a baseline'),variable:clean(f.variable,'a variable'),
      window:clean(f.window,'an observation window'),origin:(f.fixture||brandId==='demo')?'fixture':'recorded',observationId:clean(f.observationId,'an observation reference'),status:'Open',createdAt:C.now(),actor,runs:[],decisions:[],links:[]};
    requireValue(date(item.due),'Choose a valid review date.');
    if(item.observationId){const observation=entry(state,'observations',brandId,item.observationId);if(observation.origin==='fixture')item.origin='fixture';}
    if(item.kind==='Experiment')requireValue([item.metric,item.variable,item.window,item.baseline].every(nonblank),'Specify a variable, success measure, baseline and window.');
    if(item.kind==='Finding')requireValue(nonblank(item.evidence),'Add a source observation or evidence reference.');
    if(f.placementId)item.links.push(f.placementId);
    data(state).work.push(item);audit(state,brandId,item.kind+' created',item.id,actor,item.title);return item;
  }
  function draft(state,brandId,title,detail,sourceId,actor,origin){
    const post=C.makePost({brandId,title,source:(origin==='fixture'?'Fixture learning decision ':'Learning decision ')+sourceId,caption:detail,owner:actor,example:brandId==='demo'||origin==='fixture'});
    C.event(post,'Proposed from learning',sourceId,actor);state.posts.push(post);return post;
  }
  function decideWork(state,brandId,id,f,actor){
    const item=entry(state,'work',brandId,id);
    requireValue(['Continue','Improve','Test again','Retire','Resolve','Escalate'].includes(f.decision),'Choose a decision.');
    const note=clean(f.note,'the finding or decision reason',true);
    const decision={id:C.id('decision'),at:C.now(),actor,decision:f.decision,note,contentId:null};
    if(f.propose){const p=draft(state,brandId,clean(f.title,'a draft title',true),note,id,actor,item.origin);decision.contentId=p.id;item.links.push(p.id);}
    item.decisions.push(decision);item.status=f.decision==='Escalate'?'Escalated':'Reviewed';
    audit(state,brandId,item.kind+' '+f.decision.toLowerCase(),id,actor,note);return decision;
  }
  function watchRun(state,brandId,id,f,actor){
    const item=entry(state,'work',brandId,id);
    requireValue(item.kind==='Watchlist','Choose a watchlist.');
    const source=clean(f.source,'a source',true),signal=clean(f.signal,'the observed signal',true),coverage=clean(f.coverage,'the collection scope and gaps',true);
    const known=item.runs.find(r=>r.source===source&&r.signal===signal);
    const run={id:C.id('run'),at:C.now(),actor,source,signal,coverage,opportunityId:known?.opportunityId||null};
    if(!known && f.route)run.opportunityId=addWork(state,brandId,{kind:'Audience opportunity',title:signal,owner:item.owner,due:item.due,detail:coverage,evidence:source,fixture:item.origin==='fixture'},actor).id;
    item.runs.push(run);audit(state,brandId,'Watchlist checked',item.id,actor,coverage);return run;
  }
  function snapshot(state,brandId,f,actor){
    requireValue(date(f.start)&&date(f.end)&&f.start<=f.end,'Choose a valid reporting window.');requireValue(origins.includes(f.origin),'Choose evidence type.');
    if(brandId==='demo')requireValue(f.origin==='fixture','Choose fixture evidence in Demo studio.');
    const db=data(state),selected=f.calculationId?entry(state,'calculations',brandId,f.calculationId):null;
    if(selected)requireValue(selected.origin===f.origin&&selected.start>=f.start&&selected.end<=f.end,'Keep the selected result within the report period and evidence set.');
    const previous=db.reports.filter(r=>r.brandId===brandId&&r.start===f.start&&r.end===f.end&&r.origin===f.origin&&(r.calculationId||'')===(f.calculationId||'')).at(-1);
    const observations=selected?[selected.numerator,...(selected.denominator?[selected.denominator]:[])]:db.observations.filter(o=>o.brandId===brandId&&!o.supersededBy&&o.origin===f.origin&&o.start>=f.start&&o.end<=f.end);
    const delivery=db.placements.filter(p=>p.brandId===brandId&&p.state==='verified'&&(!selected||p.id===selected.placementId)&&(p.mode==='simulation')===(f.origin==='fixture')&&releaseDate(p,p.verification.actualAt)>=f.start&&releaseDate(p,p.verification.actualAt)<=f.end);
    const names=state.posts.filter(p=>p.brandId===brandId);
    const report={id:C.id('report'),brandId,title:clean(f.title,'a report title',true),version:previous?previous.version+1:1,previous:previous?.id||null,
      start:f.start,end:f.end,origin:f.origin,calculationId:selected?.id||'',actor,createdAt:C.now(),summary:clean(f.summary,'findings',true),gaps:clean(f.gaps,'limitations',true),ask:clean(f.ask,'the decision needed',true),
      internal:clean(f.internal,'internal notes'),reviewer:clean(f.reviewer,'a reviewer',true),status:'Draft',feedback:[],approval:null,
      observations:C.clone(observations),deliveries:delivery.map(p=>({id:p.id,title:names.find(x=>x.id===p.contentId)?.title||p.contentId,platform:p.platform,account:p.account,versionId:p.versionId,actualAt:p.verification.actualAt})),
      calculations:C.clone(selected?[selected]:(db.calculations||[]).filter(c=>c.brandId===brandId&&c.origin===f.origin&&c.start>=f.start&&c.end<=f.end)),
      findings:C.clone(db.work.filter(w=>w.brandId===brandId&&w.kind==='Finding'&&w.origin===f.origin&&w.due>=f.start&&w.due<=f.end))};
    db.reports.push(report);audit(state,brandId,'Report snapshot created',report.id,actor,report.title);return report;
  }
  function reportDecision(state,brandId,id,f,actor){
    const r=entry(state,'reports',brandId,id);
    if(f.action==='review'){
      requireValue(r.status==='Draft','This snapshot already passed review.');
      requireValue(actor===r.reviewer,'Use the assigned reviewer persona ('+r.reviewer+').');
      r.status='Client ready';r.approval={actor,at:C.now()};audit(state,brandId,'Report reviewed',id,actor,r.title);return;
    }
    requireValue(r.status==='Client ready','Review this report before recording client feedback.');
    const note=clean(f.note,'the client feedback',true),owner=clean(f.owner,'a decision owner',true),due=clean(f.due,'a due date',true);
    requireValue(date(due),'Choose a valid due date.');
    const action=addWork(state,brandId,{kind:'Audience opportunity',title:clean(f.title,'an action',true),owner,due,detail:note,evidence:r.id,fixture:r.origin==='fixture'},actor);
    if(f.propose)action.links.push(draft(state,brandId,f.title,note,id,actor,r.origin).id);
    r.feedback.push({actor,at:C.now(),note,actionId:action.id});audit(state,brandId,'Report feedback recorded',id,actor,note);
  }
  // Historical facts stay in the original records. Resolve account/time ambiguity once at import.
  function legacyCandidates(state,brandId){
    const db=read(state);
    const posts=state.posts.filter(p=>p.brandId===brandId);
    const done=new Set(db.placements.map(p=>p.legacyContentId).filter(Boolean)),brandPosts=new Set(posts.map(p=>p.id));
    const imports=new Set(db.batches.flatMap(b=>b.legacyKeys||[]));
    return {placements:posts.filter(p=>p.publishing?.state!=='not-queued'&&!done.has(p.id)),
      metrics:(state.analytics||[]).filter(r=>brandPosts.has(r.contentId)&&!imports.has(JSON.stringify(r)))};
  }
  function liftPlacement(state,brandId,id,f,actor){
    const post=sourcePost(state,brandId,id),q=post.publishing;
    requireValue(legacyCandidates(state,brandId).placements.some(p=>p.id===id),'This historical record was already transferred.');
    const v=post.versions.find(version=>version.id===q.versionId);
    requireValue(v,'The saved package version is missing. Keep this entry in the historical log.');
    const approved=v.decisions.filter(d=>d.action==='approved').at(-1);
    requireValue(approved,'This entry has no recorded creative approval. A new release must be approved in Review.');
    const verified=q.state==='verified',mode=post.example||brandId==='demo'?'simulation':'manual';
    requireValue(f.checked&&moment(f.scheduledAt)&&tz(f.timezone),'Confirm the destination, original time zone and resolved UTC time.');
    if(verified && mode==='manual')requireValue(https(q.url)&&moment(f.actualAt)&&Date.parse(f.actualAt)<=Date.now()+60000,'Resolve the actual publication time and check the live link.');
    const placement={id:C.id('placement'),brandId,contentId:id,legacyContentId:id,legacyRecord:C.clone(q),versionId:v.id,briefRevision:v.briefRevision,mode,
      platform:post.platform,format:post.format,account:clean(f.account,'the original destination account',true),
      owner:clean(f.owner,'the publisher',true),communityOwner:clean(f.communityOwner,'the community owner',true),
      scheduledAt:new Date(f.scheduledAt).toISOString(),timezone:f.timezone,nativeNotes:q.note||'',rightsUntil:post.brief.productionSpec?.rightsExpiry||'',
      approval:{actor:approved.actor,recordedBy:actor,at:approved.at},state:verified?'verified':q.state==='handed-off'?'handed-off':'ready',
      attempts:[],verification:verified?{at:q.verifiedAt||C.now(),actualAt:new Date(f.actualAt||f.scheduledAt).toISOString(),actor,url:mode==='manual'?q.url:'',note:'Imported manual verification. '+q.note,versionId:v.id}:null,createdAt:C.now()};
    data(state).placements.push(placement);
    if(q.state==='on-hold')pause(state,brandId,'placement',placement.id,actor);
    audit(state,brandId,'Prior publishing record transferred',placement.id,actor,q.state+' Â· '+placement.account);
    return placement;
  }
  function liftMetrics(state,brandId,f,actor){
    const accountPosts=new Set(state.posts.filter(p=>p.brandId===brandId&&(!f.platform||p.platform===f.platform)).map(p=>p.id));
    const old=legacyCandidates(state,brandId).metrics.filter(row=>accountPosts.has(row.contentId)).slice(0,2500);
    requireValue(old.length,'All prior observations are already available.');
    const account=clean(f.account,'an account reference',true);
    requireValue(tz(f.timezone),'Choose the original reporting time zone.');
    const definitions={reach:['Reach','Source-reported accounts reached','accounts'],impressions:['Impressions','Source-reported impressions','impressions'],interactions:['Interactions','Source-defined interactions','interactions'],clicks:['Outbound clicks','Source-reported outbound clicks','clicks']};
    const rows=old.flatMap(r=>Object.keys(definitions).map(k=>({account,source:r.source,contentId:r.contentId,placementId:'',metric:definitions[k][0],definition:definitions[k][1],unit:definitions[k][2],value:r[k],segment:'mixed',aggregation:'period',timezone:f.timezone,origin:r.origin==='sample'||brandId==='demo'?'fixture':'recorded',start:r.start,end:r.end,collectedAt:r.collectedAt.slice(0,10)})));
    const opts={name:'Earlier post observations',format:'legacy',replace:f.replace};
    const result=ingest(state,brandId,rows,opts,actor);
    let batch=result;
    if(!result.id){batch={id:C.id('import'),brandId,name:opts.name,format:'legacy',at:C.now(),actor,count:0,duplicates:result.duplicates,overlaps:0,mapping:{},mappingVersion:1};data(state).batches.push(batch);}
    batch.legacyKeys=old.map(r=>JSON.stringify(r));return batch;
  }

  const rawMeasures={
    newfollows:{label:'New follows',unit:'follows',definition:'New follows during this reporting period'},
    netfollowers:{label:'Net follower change',unit:'followers',definition:'Follows minus unfollows during this reporting period'},
    qualifiedleads:{label:'Qualified leads',unit:'leads',definition:'Leads meeting the agreed qualification and attribution rules'},
    views:{label:'Views',unit:'views',definition:'Number of views reported by the platform'},
    reach:{label:'Reach',unit:'accounts',definition:'Unique accounts reached'},
    impressions:{label:'Impressions',unit:'impressions',definition:'Number of times the content was displayed'},
    saves:{label:'Saves',unit:'saves',definition:'Number of saves reported by the platform'},
    likes:{label:'Likes',unit:'likes',definition:'Number of likes'},
    comments:{label:'Comments',unit:'comments',definition:'Number of comments'},
    shares:{label:'Shares',unit:'shares',definition:'Number of shares'},
    clicks:{label:'Clicks',unit:'clicks',definition:'Number of link clicks'},
    followers:{label:'Followers',unit:'followers',definition:'Follower count reported by the platform'},
    leads:{label:'Leads',unit:'leads',definition:'Number of leads in the agreed source'}
  };
  const metricKey=v=>String(v).toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^netfollowerchange$/,'netfollowers');
  const matchingMeasure=(o,key)=>metricKey(o.metric)===metricKey(key)&&(!rawMeasures[key]||metricKey(o.unit)===metricKey(rawMeasures[key].unit));
  const sameEvidenceScope=(a,b)=>a.id!==b.id&&['account','contentId','placementId','segment','source','timezone','aggregation','origin','start','end'].every(k=>a[k]===b[k]);
  function observationDefaults(state,brandId,origin,instant=new Date()){
    const brand=state.brands.find(b=>b.id===brandId),sample=brandId==='demo'||brand?.example;
    const strategy=brand?.operations?.strategies?.at(-1)?.body,definition=brand?.operations?.kpis?.find(k=>k.id===strategy?.kpiDefinitionId);
    const key=definition?.numerator in rawMeasures?definition.numerator:'reach',measure=rawMeasures[key],day=C.localDate(brand?.timezone,instant);
    origin=sample?'fixture':origin||'recorded';
    return {account:brand?.name||'',source:origin==='fixture'?'Local sample data':'',metric:measure.label,definition:measure.definition,unit:measure.unit,start:day,end:day,collectedAt:day,timezone:brand?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone,segment:(definition?.distribution||'Organic').toLowerCase(),aggregation:'period',origin,contentId:'',placementId:''};
  }
  function matchesChannel(state,brandId,definition,observation){
    return !definition.channel||!!observation.contentId&&sourcePost(state,brandId,observation.contentId).platform.toLowerCase()===definition.channel.toLowerCase();
  }
  function compatibleObservations(state,brandId,definitionId,origin,numeratorId=''){
    const definition=state.brands.find(b=>b.id===brandId)?.operations?.kpis?.find(k=>k.id===definitionId);
    if(!definition)return {primary:[],comparison:[]};
    const windowDays=String(definition.window||'').match(/^(\d+)[ -]?day/i);
    const rows=read(state).observations.filter(o=>o.brandId===brandId&&!o.supersededBy&&o.origin===origin&&matchesChannel(state,brandId,definition,o)&&(!definition.distribution||definition.distribution.toLowerCase()===o.segment)&&(!windowDays||(Date.parse(o.end)-Date.parse(o.start))/86400000+1===Number(windowDays[1]))&&(!o.contentId||!sourcePost(state,brandId,o.contentId).measurementDefinitionId||sourcePost(state,brandId,o.contentId).measurementDefinitionId===definition.id));
    const primary=rows.filter(o=>matchingMeasure(o,definition.numerator)),selected=primary.find(o=>o.id===numeratorId)||primary[0];
    return {primary,comparison:definition.denominator&&selected?rows.filter(o=>matchingMeasure(o,definition.denominator)&&sameEvidenceScope(selected,o)):[]};
  }
  function recordMeasurements(state,brandId,fields,values,actor){
    const placement=entry(state,'placements',brandId,fields.placementId),p=sourcePost(state,brandId,placement.contentId);
    const definition=state.brands.find(b=>b.id===brandId)?.operations?.kpis?.find(k=>k.id===p.measurementDefinitionId);
    requireValue(placement.state==='verified','Verify the release before recording its results. Use Single measure for account-level evidence.');
    const origin=placement.mode==='simulation'?'fixture':'recorded';
    if(origin==='recorded')requireValue(fields.end<=C.localDate(placement.timezone)&&fields.collectedAt<=C.localDate(placement.timezone),'Recorded measurements cannot use future reporting or collection dates.');
    const keys=Object.keys(values);requireValue(keys.length&&keys.every(k=>rawMeasures[k]),'Choose supported raw measures.');
    requireValue(keys.every(key=>key==='netfollowers'||values[key]==null||String(values[key]).trim()===''||Number(values[key])>=0),'Counts cannot be negative. Use Net follower change for follows minus unfollows.');
    const rows=keys.map(key=>({...fields,brandId,account:placement.account,contentId:p.id,placementId:placement.id,timezone:placement.timezone,origin,metric:rawMeasures[key].label,definition:rawMeasures[key].definition,unit:rawMeasures[key].unit,value:values[key]}));
    // Validate on a copy: a missing KPI component or changed value cannot partly save a batch.
    const next=C.clone(state),batch=ingest(next,brandId,rows,{name:fields.source,format:'manual-batch',replace:fields.replace===true},actor);
    let result=null;
    if(definition){
      const options=compatibleObservations(next,brandId,definition.id,origin);
      const a=options.primary.find(o=>o.placementId===placement.id&&o.start===fields.start&&o.end===fields.end&&o.source===fields.source&&o.segment===fields.segment&&o.aggregation===fields.aggregation);
      const b=a&&compatibleObservations(next,brandId,definition.id,origin,a.id).comparison[0];
      if(a&&(!definition.denominator||b)){
        const existing=read(next).calculations.find(c=>c.definitionId===definition.id&&c.numerator.id===a.id&&(c.denominator?.id||'')===(b?.id||''));
        result=existing||calculate(next,brandId,{definitionId:definition.id,numeratorId:a.id,denominatorId:b?.id},actor);
      }
    }
    state.releaseLearning=next.releaseLearning;return {batch,result};
  }
  function calculate(state,brandId,fields,actor){
    const definition=state.brands.find(b=>b.id===brandId)?.operations?.kpis?.find(k=>k.id===fields.definitionId);
    requireValue(definition,'Choose a saved measurement definition from Research & strategy.');
    const a=entry(state,'observations',brandId,fields.numeratorId),b=definition.denominator?entry(state,'observations',brandId,fields.denominatorId):null;
    const content=a.contentId?sourcePost(state,brandId,a.contentId):null;
    requireValue(!content?.measurementDefinitionId||content.measurementDefinitionId===definition.id,'This content is measured against its pinned KPI definition. Choose that exact version.');
    requireValue(matchesChannel(state,brandId,definition,a),'Choose content from the channel in this KPI definition.');
    requireValue(matchingMeasure(a,definition.numerator)&&(!b||matchingMeasure(b,definition.denominator)),'Choose source measures and units that match this KPI definition.');
    requireValue(!a.supersededBy&&(!b||!b.supersededBy),'Use the current evidence revisions. Historical calculations remain preserved.');
    if(b)requireValue(sameEvidenceScope(a,b),'Choose distinct observations from the same source, account, content, window, distribution and evidence type.');
    const distribution=String(definition.distribution||'').toLowerCase();
    requireValue(!distribution||distribution===a.segment,'Evidence distribution does not match this KPI definition.');
    const days=(Date.parse(a.end)-Date.parse(a.start))/86400000+1,windowDays=String(definition.window||'').match(/^(\d+)[ -]?day/i);
    if(windowDays)requireValue(days===Number(windowDays[1]),'The evidence window must match the KPI definition ('+definition.window+').');
    const scale=Number(definition.scale??1);requireValue(Number.isFinite(scale)&&scale>0,'The KPI scale must be positive.');
    const unavailable=a.value===null||b?.value===null?'A required measurement is unknown.':b?.value===0?'The comparison measure is zero.':'';
    const result=unavailable?null:b?a.value/b.value*scale:a.value;
    const baseline=definition.baseline?.value;
    const baselineValue=baseline===null||baseline===undefined||baseline===''?null:Number(baseline);
    const baselineComparable=Number.isFinite(baselineValue)&&nonblank(definition.baseline?.source)&&definition.baseline?.window===definition.window&&String(definition.baseline?.distribution||'').toLowerCase()===a.segment;
    const calculation={id:C.id('calculation'),brandId,definitionId:definition.id,definition:C.clone(definition),numerator:C.clone(a),denominator:b?C.clone(b):null,
      scale,result,unavailable,baseline:C.clone(definition.baseline||{}),baselineValue:Number.isFinite(baselineValue)?baselineValue:null,
      baselineComparable,comparisonNote:baselineComparable?'Same measurement window and distribution.':'Record a baseline source with the same measurement window and distribution before comparing.',
      delta:result!==null&&baselineComparable?result-baselineValue:null,
      contentId:a.contentId||'',placementId:a.placementId||'',strategyVersionId:content?.strategyVersionId||'',origin:a.origin,start:a.start,end:a.end,account:a.account,source:a.source,createdAt:C.now(),actor};
    data(state).calculations.push(calculation);audit(state,brandId,'KPI result saved',calculation.id,actor,definition.title);return calculation;
  }
  function proposeNext(state,brandId,calculationId,fields,actor){
    const calculation=entry(state,'calculations',brandId,calculationId);
    requireValue(['content','strategy','calendar'].includes(fields.kind),'Choose the next planning destination.');
    requireValue(date(fields.due),'Choose a review date.');
    const proposal={id:C.id('proposal'),brandId,calculationId,kind:fields.kind,title:clean(fields.title,'a proposed test',true),detail:clean(fields.detail,'the reasoning and next action',true),
      owner:clean(fields.owner,'the decision owner',true),ownerPersonId:clean(fields.ownerPersonId,'the decision owner identity'),due:fields.due,contentId:calculation.contentId,definitionId:calculation.definitionId,origin:calculation.origin,
      status:'Proposed',createdAt:C.now(),actor,decisions:[],targetId:''};
    data(state).proposals.push(proposal);audit(state,brandId,'Next-plan proposal created',proposal.id,actor,proposal.title);return proposal;
  }
  function decideProposal(state,brandId,id,fields,actor){
    const p=entry(state,'proposals',brandId,id);
    requireValue(p.status==='Proposed','This proposal already has a decision.');
    requireValue(['accept','return'].includes(fields.action),'Choose a proposal decision.');
    requireValue(nonblank(fields.note),'Record the decision rationale.');
    requireValue(p.ownerPersonId?fields.personId===p.ownerPersonId:actor===p.owner,'Only the named decision owner can review this proposal.');
    const result=entry(state,'calculations',brandId,p.calculationId);
    if(fields.action==='accept'&&p.kind==='content'){
      const post=C.makePost({brandId,title:p.title,owner:actor,source:'Result proposal '+p.id,sourceId:p.id,caption:p.detail,example:p.origin==='fixture'});
      post.measurementDefinitionId=p.definitionId;post.resultProposalId=p.id;
      const source=state.posts.find(x=>x.brandId===brandId&&x.id===p.contentId);if(source?.strategyVersionId)post.strategyVersionId=source.strategyVersionId;
      state.posts.push(post);p.targetId=post.id;C.event(post,'Proposed from measured result',result.definition.title+' Â· '+(result.result===null?'Unknown':result.result)+' Â· '+p.detail,actor);
    }
    if(fields.action==='accept'&&p.kind!=='content'){
      const Ops=typeof module==='object'&&module.exports?require('./operations.js'):root.JMLOps;
      const operations=Ops.account(state,brandId,true);
      (operations.planningProposals ||= []).push({id:p.id,kind:p.kind,title:p.title,detail:p.detail,owner:p.owner,due:p.due,calculationId:p.calculationId,definitionId:p.definitionId,status:'Accepted',actor,at:C.now()});p.targetId=p.id;
    }
    p.status=fields.action==='accept'?'Accepted':'Returned';p.decisions.push({id:C.id('proposal-decision'),action:fields.action,note:fields.note,actor,at:C.now()});
    audit(state,brandId,'Next-plan proposal '+p.status.toLowerCase(),p.id,actor,p.title);return p;
  }

  function validate(state){
    const db=state.releaseLearning;if(db===undefined)return;
    requireValue(obj(db)&&db.version===1&&groups.every(k=>Array.isArray(db[k])&&db[k].length<=100000),'Invalid release and learning memory.');
    const brands=new Set(state.brands.map(b=>b.id)),ids=new Set();
    for(const group of [...groups,...expansionGroups])for(const v of (db[group]||[])){
      requireValue(obj(v)&&nonblank(v.id)&&!ids.has(v.id)&&brands.has(v.brandId),'Invalid or duplicate '+group+' record.');ids.add(v.id);
    }
    const strings=(v,fields)=>fields.every(k=>string(v[k]));
    const same=(key,brandId,id)=>db[key].some(v=>v.id===id&&v.brandId===brandId);
    const checkObs=o=>{
      requireValue(obj(o)&&brands.has(o.brandId),'Invalid observation account.');
      normalise(state,o.brandId,o);
      requireValue(o.value===null||Number.isFinite(o.value),'Invalid measurement value.');
      requireValue(same('batches',o.brandId,o.batchId),'Unknown observation import.');
    };
    for(const p of db.placements){
      const post=sourcePost(state,p.brandId,p.contentId);
      requireValue(strings(p,['platform','account','owner','communityOwner','format','nativeNotes','rightsUntil'])&&post.versions.some(v=>v.id===p.versionId&&v.briefRevision===p.briefRevision)&&states.includes(p.state)&&modes.includes(p.mode)&&moment(p.scheduledAt)&&tz(p.timezone)&&(!p.rightsUntil||date(p.rightsUntil))&&obj(p.approval)&&strings(p.approval,['actor','recordedBy','at'])&&Array.isArray(p.attempts),'Invalid release placement.');
      requireValue(p.mode==='simulation'||(!post.example&&p.brandId!=='demo'),'Example releases require simulation.');
      for(const a of p.attempts)requireValue(obj(a)&&strings(a,['id','key','operation','actor','at','prior','state','outcome','receipt'])&&states.includes(a.state),'Invalid release attempt.');
      if(p.state==='verified')requireValue(obj(p.verification)&&moment(p.verification.actualAt)&&p.verification.versionId===p.versionId&&strings(p.verification,['actor','note','url','at'])&&(p.mode==='simulation'?!p.verification.url:https(p.verification.url)),'Invalid verification receipt.');
      if(p.handoff){
        const h=p.handoff,v=post.versions.find(v=>v.id===p.versionId),d=v.decisions.find(d=>d.id===h.decisionId&&d.action==='approved');
        requireValue(obj(h)&&h.brandId===p.brandId&&h.contentId===p.contentId&&h.versionId===p.versionId&&h.briefRevision===p.briefRevision&&d&&h.caption===v.caption&&JSON.stringify(h.assets)===JSON.stringify(v.assets),'Invalid approved handoff snapshot.');
        if(h.files)requireValue(Array.isArray(h.files)&&h.files.length===h.assets.length&&h.files.every((f,i)=>f.index===i&&nonblank(f.name)&&Number.isInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256)),'Invalid release file manifest.');
        if(p.receipt)requireValue(p.receipt.handoffId===h.id&&p.receipt.versionId===p.versionId&&p.receipt.decisionId===h.decisionId&&moment(p.receipt.at),'Invalid publisher receipt.');
      }
    }
    for(const p of db.placements)if(p.legacyContentId)requireValue(p.legacyContentId===p.contentId&&obj(p.legacyRecord),'Invalid historical publication reference.');
    for(const b of db.batches)if(b.legacyKeys)requireValue(Array.isArray(b.legacyKeys)&&b.legacyKeys.every(string),'Invalid legacy observation references.');
    for(const b of db.batches)requireValue(strings(b,['name','at','actor','format'])&&Number.isInteger(b.count)&&b.count>=0&&Number.isInteger(b.overlaps)&&obj(b.mapping),'Invalid evidence batch.');
    for(const o of db.observations){checkObs(o);for(const k of ['previous','supersededBy'])if(o[k])requireValue(same('observations',o.brandId,o[k]),'Unknown evidence revision.');}
    for(const w of db.work){
      if(w.observationId)requireValue(same('observations',w.brandId,w.observationId),'Unknown learning evidence.');
      requireValue(workTypes.includes(w.kind)&&origins.includes(w.origin)&&strings(w,['title','owner','detail','due','evidence','metric','baseline','variable','window','status','actor','createdAt'])&&date(w.due)&&['runs','decisions','links'].every(k=>Array.isArray(w[k]))&&w.links.every(string),'Invalid learning record.');
      for(const r of w.runs)requireValue(obj(r)&&strings(r,['source','signal','coverage','at','actor','id']),'Invalid collection run.');
      for(const d of w.decisions)requireValue(obj(d)&&strings(d,['at','actor','decision','note','id']),'Invalid learning decision.');
    }
    for(const r of db.reports){
      requireValue(strings(r,['title','summary','gaps','ask','internal','reviewer','actor','createdAt'])&&date(r.start)&&date(r.end)&&r.start<=r.end&&Number.isInteger(r.version)&&origins.includes(r.origin)&&['Draft','Client ready'].includes(r.status)&&['observations','deliveries','findings','feedback'].every(k=>Array.isArray(r[k])),'Invalid report.');
      for(const o of r.observations){requireValue(o.brandId===r.brandId&&o.origin===r.origin&&same('observations',r.brandId,o.id),'Report references incompatible evidence.');checkObs(o);}
      for(const d of r.deliveries)requireValue(obj(d)&&strings(d,['id','title','platform','account','versionId','actualAt'])&&same('placements',r.brandId,d.id),'Invalid report delivery.');
      for(const f of r.findings)requireValue(obj(f)&&f.brandId===r.brandId&&same('work',r.brandId,f.id)&&strings(f,['title','detail','evidence']),'Invalid report finding.');
      for(const f of r.feedback)requireValue(obj(f)&&strings(f,['actor','at','note','actionId'])&&same('work',r.brandId,f.actionId),'Invalid report feedback.');
      if(r.status==='Client ready')requireValue(obj(r.approval)&&r.approval.actor===r.reviewer&&moment(r.approval.at),'Missing report approval.');
    }
    for(const p of db.pauses)requireValue(['workspace','brand','placement','destination'].includes(p.scope)&&string(p.target)&&typeof p.active==='boolean','Invalid pause rule.');
    for(const a of db.events)requireValue(strings(a,['type','targetId','actor','at','note'])&&moment(a.at),'Invalid release history.');
    for(const c of (db.calculations||[])){
      requireValue(obj(c.definition)&&c.definition.id===c.definitionId&&Number.isFinite(c.scale)&&c.scale>0&&origins.includes(c.origin)&&moment(c.createdAt)&&date(c.start)&&date(c.end)&&c.start<=c.end,'Invalid saved KPI result.');
      requireValue(c.result===null||Number.isFinite(c.result),'Invalid KPI result value.');
      requireValue(c.numerator?.brandId===c.brandId&&same('observations',c.brandId,c.numerator.id)&&(!c.denominator||c.denominator.brandId===c.brandId&&same('observations',c.brandId,c.denominator.id)),'Invalid KPI evidence references.');
    }
    for(const p of (db.proposals||[]))requireValue(['content','strategy','calendar'].includes(p.kind)&&['Proposed','Accepted','Returned'].includes(p.status)&&strings(p,['title','detail','owner','due','createdAt','actor'])&&date(p.due)&&(db.calculations||[]).some(c=>c.brandId===p.brandId&&c.id===p.calculationId)&&Array.isArray(p.decisions),'Invalid next-plan proposal.');
  }
  const api={recordMeasurements,rawMeasures,observationDefaults,compatibleObservations,localToInstant,briefSchedule,placementSchedule,calculate,proposeNext,decideProposal,receiveHandoff,receiveCommunity,sealHandoff,legacyCandidates,liftPlacement,liftMetrics,groups,states,modes,workTypes,read,entry,sourcePost,isPaused,pause,currentPackage,preflight,createPlacement,advance,manifest,adapters,csvRows,normalise,preview,ingest,addWork,decideWork,watchRun,snapshot,reportDecision,validate};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.JMLReleaseDomain=api;
})(typeof window==='undefined'?globalThis:window);
