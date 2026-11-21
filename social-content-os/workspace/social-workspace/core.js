/* Domain rules shared by the offline UI and its tests. No provider calls. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const now = () => new Date().toISOString();
  const brands = [
    {id:'demo',name:'Demo studio',initials:'DS',description:'An example workflow to explore',timezone:'America/Los_Angeles'},
    {id:'brand_jay',name:'Jay Zahiri',initials:'JZ',description:'Personal brand',timezone:'America/Los_Angeles'},
    {id:'brand_nn',name:'Nikki Nitro Coffee',initials:'NN',description:'Coffee, events & hospitality',timezone:'America/Los_Angeles'},
    {id:'brand_b4k',name:'Bricks 4 Kidz LA Valley',initials:'B4',description:'Learning through building',timezone:'America/Los_Angeles'},
    {id:'brand_zees',name:'Zee’s Booking',initials:'ZB',description:'Bookkeeping & business clarity',timezone:'America/Los_Angeles'},
    {id:'brand_jml',name:'Jay Marketing Lab',initials:'JL',description:'Marketing systems',timezone:'America/Los_Angeles'},
    {id:'brand_mlb',name:'My Law Bridge',initials:'ML',description:'Client workspace',timezone:'America/Los_Angeles'}
  ];
  const qcKeys = ['brief','accuracy','brand','files','rights'];
  const qcLabels = ['Matches the approved brief','Copy and claims checked','Brand and legibility checked','Files and slide order checked','Usage permissions checked'];
  function event(p, action, detail, actor='Workspace member') {
    p.history.push({id:id('event'),at:now(),actor,action,detail});
  }
  function latest(p) { return p.versions.at(-1) || null; }
  function isApproved(p) {
    const v=latest(p);
    return !!(v && v.state==='approved' && v.briefRevision===p.briefRevision && p.planApproval?.revision===p.briefRevision);
  }
  function status(p) {
    const v=latest(p);
    if(isApproved(p)) return 'approved';
    if(v && v.briefRevision!==p.briefRevision) return 'revision-needed';
    if(v?.state==='in-review') return 'in-review';
    if(v?.state==='changes-requested') return 'changes-requested';
    return 'draft';
  }
  function readiness(p) {
    const b=p.brief, gaps=[...(globalThis.JMLBriefTemplate?.missing(p)||[])];
    for(const [key,label] of Object.entries({objective:'Objective',audience:'Audience',cta:'Call to action',owner:'Content owner',approver:'Final approver',direction:'Creative direction'})) if(!b[key]?.trim()) gaps.push(label+' is missing');
    if(!p.date) gaps.push('Planned date is missing');
    if(!p.planApproval || p.planApproval.revision!==p.briefRevision) gaps.push('Current brief needs plan approval');
    if(p.requests.some(r=>r.state!=='accepted'&&r.state!=='cancelled')) gaps.push('A media request is still open');
    return gaps;
  }
  function permissionGaps(p, date=p.date) {
    const spec=p.brief?.productionSpec;
    if(!spec)return [];
    const gaps=[];
    if(!spec.rights?.trim())gaps.push('Record the source and permission for the planned use');
    if(spec.rightsExpiry && date && spec.rightsExpiry<date)gaps.push('Media permission expires before this release');
    return gaps;
  }
  function briefBody(p) {
    return clone(Object.fromEntries(['title','platform','format','date','time','timezone','brief'].map(key=>[key,p[key]])));
  }
  function briefSnapshots(p) {
    const snapshots=[...(p.briefVersions||[])];
    if(!snapshots.some(v=>v.number===p.briefRevision)){
      snapshots.push({number:p.briefRevision,body:briefBody(p),at:null,actor:'Existing workspace record'});
    }
    return snapshots;
  }
  function restoreBrief(p, number, actor) {
    const version=briefSnapshots(p).find(v=>v.number===number);
    if(!version)throw Error('That brief snapshot is unavailable.');
    const priorRoute=JSON.stringify(p.brief.productionSpec||null);
    if(!saveBrief(p,version.body,actor,true))throw Error('These are already the current brief contents.');
    if(priorRoute!==JSON.stringify(p.brief.productionSpec||null))delete p.production;
    event(p,'Brief restored','Copied revision '+number+' into revision '+p.briefRevision,actor);
  }
  function makePost(source) {
    const p={id:source.id||id('content'),brandId:source.brandId||'demo',title:source.title||'Untitled idea',platform:source.platform||'Instagram',format:source.format||'Photo',date:source.date||'',time:source.time||'09:00',timezone:source.timezone||'America/Los_Angeles',dateNote:source.dateNote||'Proposed date',source:source.source||'Created in this workspace',sources:source.sources||[],example:!!source.example,briefRevision:1,brief:{objective:source.objective||'',audience:source.audience||'',cta:source.cta||'',pillar:source.pillar||'',campaign:source.campaign||'',owner:source.owner||'',approver:'',direction:'',slideCopy:'',caption:source.caption||''},planApproval:null,versions:[],requests:[],history:[],publishing:{state:'not-queued',versionId:null,date:'',time:'',timezone:source.timezone||'America/Los_Angeles',url:'',note:'',verifiedAt:null}};
    if(source.assets?.length) p.versions.push({id:id('version'),number:1,createdAt:now(),creator:'Source import',briefRevision:1,caption:source.caption||'',note:'Prepared source files. No final approval inferred.',assets:clone(source.assets),state:'draft',qc:{},decisions:[]});
    event(p,'Content added',source.source||'New idea');
    return p;
  }
  function seed(records, day) {
    const createdAt=now();
    const state={schemaVersion:1,kind:'jml-social-workspace',workspaceId:id('workspace'),createdAt,revision:0,updatedAt:createdAt,brands:clone(brands),posts:records.map(makePost),analytics:[],findings:[]};
    const examples=records.filter(p=>p.brandId==='brand_jay').slice(0,4);
    examples.forEach((s,i)=>{
      const p=makePost({...s,id:'example-'+(i+1),brandId:'demo',example:true,date:addDays(day,i-1),source:'Workflow example using prepared Jay artwork. Decisions are illustrative; nothing is published.'});
      Object.assign(p.brief,{objective:'Build consideration through evidence-led content',audience:'Founders and marketing leaders',cta:'Share a perspective in the comments',owner:'Content designer',approver:'Client reviewer',direction:'Preserve the supplied editorial artwork. Check the headline, chart, source and caption together.',slideCopy:'Use the supplied cover and research chart in their original order.'});
      p.planApproval={revision:1,actor:'Example account lead',at:now()};
      const v=latest(p); v.qc=Object.fromEntries(qcKeys.map(k=>[k,true]));
      if(i===0) v.state='in-review';
      if(i===1){v.state='approved';v.decisions.push({id:id('decision'),action:'approved',actor:'Example reviewer',comment:'Illustrative approval for testing only.',at:now()});}
      if(i===2){v.state='changes-requested';v.decisions.push({id:id('decision'),action:'changes-requested',actor:'Example reviewer',comment:'Make the caption’s closing question more specific to business owners.',at:now()});}
      if(i===3){p.planApproval=null;p.requests.push({id:id('request'),title:'Confirm final caption and source references',owner:'Content owner',due:day,state:'requested',note:'Example input request. Record the response before review.'});}
      event(p,'Example workflow prepared','Illustrative state for exploring the prototype.');
      state.posts.unshift(p);
    });
    return state;
  }
  function addDays(date,n) { const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10); }
  function saveBrief(p, fields, actor, replaceBrief=false) {
    const previous=briefSnapshots(p);
    const before=JSON.stringify([p.title,p.platform,p.format,p.date,p.time,p.timezone,p.brief]);
    for(const key of ['title','platform','format','date','time','timezone']) if(key in fields)p[key]=fields[key];
    if(replaceBrief)p.brief=clone(fields.brief);
    else Object.assign(p.brief,fields.brief);
    // Workbook fields and the regular brief editor share one current revision.
    if(p.brief.creativeBrief?.values && !fields.brief?.creativeBrief){
      const values=p.brief.creativeBrief.values, b=fields.brief||{};
      for(const [key,label] of Object.entries({caption:'Caption',objective:'Objective',cta:'CTA',direction:p.brief.creativeBrief.kind==='Video'?'Shot list & timing':'Layout / slide map',slideCopy:p.brief.creativeBrief.kind==='Video'?'Script / VO':'Copy on artwork'}))if(key in b)values[label]=b[key];
      for(const [key,label] of Object.entries({title:'Working title',format:'Format',platform:'Channel',timezone:'Timezone'}))if(key in fields)values[label]=fields[key];
      if('date' in fields||'time' in fields)values['Publish date/time']=p.date+(p.time?' '+p.time:'');
    }
    // The full Studio and attached workbook are editors of the same brief. Preserve
    // module-only answers while keeping fields shared with another editor current.
    if(p.brief.studioBrief?.values){
      const studio=p.brief.studioBrief.values,b=fields.brief||{};
      const shared={objective:'goal',audience:'audience',cta:'cta',caption:'caption',pillar:'pillar',slideCopy:'body'};
      if(!b.studioBrief)shared.direction=p.brief.creativeBrief?(p.brief.creativeBrief.kind==='Video'?'shots':'layout'):'visual';
      for(const [key,target] of Object.entries(shared))if(key in b)studio[target]=b[key];
      if('title' in fields)studio.project=p.title;
      if('platform' in fields)studio.channel=p.platform;
      if(b.creativeBrief?.values){
        const v=b.creativeBrief.values,video=b.creativeBrief.kind==='Video';
        const mapping={Hook:'hook','Key message':'message','Layout / slide map':'layout','Shot list & timing':'shots','Runtime (sec)':'duration','Audio direction':'sound','Visual assets & rights':'assets','Export package':'delivery','Reference URL':'references'};
        mapping[video?'Captions / accessibility':'Image alt text']='audio';
        for(const [source,target]of Object.entries(mapping))if(source in v)studio[target]=v[source];
        studio.format=[p.format,v['Dimensions (px)'],v['Slide count']?v['Slide count']+' slides':''].filter(Boolean).join(' · ');
      }else if(b.studioBrief&&p.brief.creativeBrief?.values){
        const v=p.brief.creativeBrief.values,video=p.brief.creativeBrief.kind==='Video';
        const mapping={hook:'Hook',message:'Key message',delivery:'Export package'};
        if(video){Object.assign(mapping,{shots:'Shot list & timing',sound:'Audio direction',audio:'Captions / accessibility'});}else Object.assign(mapping,{layout:'Layout / slide map',assets:'Visual assets & rights',audio:'Image alt text'});
        for(const [source,target]of Object.entries(mapping))if(source in studio)v[target]=studio[source];
        // Studio allows narrative duration and multiple references. Keep those
        // answers without putting invalid text in the workbook's typed fields.
        if(video&&/^\d+(?:\.\d+)?$/.test(studio.duration?.trim()||''))v['Runtime (sec)']=studio.duration.trim();
        if(/^https?:\/\/\S+$/i.test(studio.references?.trim()||''))v['Reference URL']=studio.references.trim();
      }
    }
    const after=JSON.stringify([p.title,p.platform,p.format,p.date,p.time,p.timezone,p.brief]);
    if(before===after)return false;
    p.briefRevision++;
    p.briefVersions=[...previous,{number:p.briefRevision,at:now(),actor,body:briefBody(p)}];
    if(p.production){
      (p.productionRuns ||= []).push({briefRevision:p.briefRevision-1,at:now(),actor,record:clone(p.production)});
      for(const task of p.production.tasks)task.done=false;
      p.production.startedRevision=null;
      p.production.checkpoints={};
    }
    if(['planned','handed-off'].includes(p.publishing.state))p.publishing.state='on-hold';
    event(p,'Brief updated','Revision '+p.briefRevision+'. Plan and creative approval must match this revision.',actor);
    return true;
  }
  function approvePlan(p, actor) {
    if(!actor?.trim())throw Error('Enter the name of the person recording this decision.');
    const missing=globalThis.JMLBriefTemplate?.missing(p)||[];if(missing.length)throw Error(missing.join('; ')+'.');
    if(!p.planDecisions)p.planDecisions=p.planApproval?[clone(p.planApproval)]:[];
    p.planApproval={id:id('plan-decision'),revision:p.briefRevision,actor,at:now()};
    p.planDecisions.push(clone(p.planApproval));
    event(p,'Plan approved','Brief revision '+p.briefRevision+'. Final creative still needs its own approval.',actor);
  }
  function addVersion(p, input, actor) {
    if(!input.caption?.trim())throw Error('Add the complete caption before saving a content version.');
    if(!input.assets.length && p.format!=='Text post')throw Error('Upload at least one content file.');
    const v={id:id('version'),number:p.versions.length+1,createdAt:now(),creator:actor,briefRevision:p.briefRevision,caption:input.caption,note:input.note||'',assets:clone(input.assets),state:'draft',qc:{},decisions:[]};
    p.versions.push(v);
    if(['planned','handed-off'].includes(p.publishing.state))p.publishing.state='on-hold';
    event(p,'Version '+v.number+' saved',input.note||'New content snapshot. Previous versions are preserved.',actor);
    return v;
  }
  function submit(p, actor, checks) {
    const v=latest(p),gaps=readiness(p);
    if(p.brief.productionSpec && !p.production)gaps.push('Confirm the production route after restoring this brief');
    if(p.production){
      if(p.production.startedRevision!==p.briefRevision)gaps.push('Start production for the current brief revision');
      if(p.production.tasks.some(t=>!t.done))gaps.push('Finish the assigned production tasks');
      if(p.production.qcReviewer && actor!==p.production.qcReviewer)gaps.push('Record internal QA as '+p.production.qcReviewer);
      gaps.push(...permissionGaps(p));
    }
    if(!v)throw Error('Upload a content version first.');
    if(v.briefRevision!==p.briefRevision)gaps.push('Create a new version for the current brief');
    if(!v.caption.trim())gaps.push('Caption is missing');
    if(!v.assets.length && p.format!=='Text post')gaps.push('Content files are missing');
    if(!qcKeys.every(k=>checks[k]))gaps.push('Complete every internal review check');
    if(v.internalFailure)gaps.push('Submit a revised creative version after the internal QA failure');
    if(['approved','in-review','changes-requested'].includes(v.state))gaps.push('Create a new version before resubmitting');
    if(gaps.length)throw Error(gaps.join('. ')+'.');
    v.qc=clone(checks);v.qaDecision={id:id('qa-decision'),versionId:v.id,briefRevision:p.briefRevision,actor,at:now(),checks:clone(checks),action:'passed'};v.state='in-review';event(p,'Sent for review','Version '+v.number+' passed the internal checklist.',actor);
  }
  function decide(p, action, comment, actor) {
    const v=latest(p);
    if(!actor?.trim())throw Error('Enter the reviewer’s name.');
    if(!v||v.state!=='in-review'||v.briefRevision!==p.briefRevision)throw Error('Only the current submitted version can receive a decision.');
    if(!['approved','changes-requested'].includes(action))throw Error('Unknown review decision.');
    if(p.production && p.brief.approver && actor.trim()!==p.brief.approver.trim())throw Error('This package is assigned to '+p.brief.approver+' for final review.');
    if(action==='changes-requested'&&!comment.trim())throw Error('Explain what needs to change.');
    v.state=action;v.decisions.push({id:id('decision'),at:now(),actor,action,comment});
    event(p,action==='approved'?'Creative approved':'Changes requested','Version '+v.number+(comment?': '+comment:'.'),actor);
  }
  function publish(p, fields, actor) {
    if(!isApproved(p))throw Error('The latest content version and current brief need approval first.');
    if(fields.state!=='on-hold' && permissionGaps(p,fields.date).length)throw Error(permissionGaps(p,fields.date).join('. '));
    if(!['planned','handed-off','verified','on-hold'].includes(fields.state))throw Error('Choose a publishing state.');
    if(!fields.date||!fields.time)throw Error('Add the publication date and time.');
    if(fields.state==='verified'&&!/^https:\/\//i.test(fields.url))throw Error('Add the live HTTPS post link before recording publication.');
    p.publishing={...p.publishing,...fields,versionId:latest(p).id,verifiedAt:fields.state==='verified'?now():null};
    event(p,'Publishing record updated',fields.state==='verified'?'Publication marked as manually verified. '+fields.url:fields.state==='planned'?'Local publishing plan saved. No provider schedule created.':fields.state,actor);
  }
  function packageFor(p) {
    if(!isApproved(p))throw Error('Approve the latest creative version before exporting a publishing package.');
    const gaps=permissionGaps(p,p.publishing.date||p.date);
    if(gaps.length)throw Error(gaps.join('. '));
    return {kind:'jml-publishing-package',schemaVersion:1,exportedAt:now(),contentId:p.id,brandId:p.brandId,title:p.title,platform:p.platform,format:p.format,planned:{date:p.publishing.date||p.date,time:p.publishing.time||p.time,timezone:p.publishing.timezone||p.timezone},briefRevision:p.briefRevision,approval:clone(latest(p).decisions),version:clone(latest(p)),providerAction:'none',example:p.example};
  }
  function safeMedia(url) {
    return typeof url==='string' && (/^data:(image\/(png|jpeg|webp|gif)|video\/(mp4|webm));base64,[A-Za-z0-9+/=\s]+$/.test(url)||/^(planner-artwork|B4K%20Creatives|B4K Creatives)\/[^<>"\r\n]+$/.test(url)&&!url.includes('..'));
  }
  function validate(data) {
    if(!data||data.schemaVersion!==1||data.kind!=='jml-social-workspace')throw Error('This is not a JML workspace backup (schema version 1).');
    if(!Array.isArray(data.brands)||!data.brands.length||!Array.isArray(data.posts)||data.posts.length>5000||!Array.isArray(data.analytics)||!Array.isArray(data.findings))throw Error('The backup is missing required collections.');
    const brandIds=new Set(), ids=new Set();
    for(const b of data.brands){if(!b.id||brandIds.has(b.id)||typeof b.name!=='string'||typeof b.initials!=='string')throw Error('Invalid or duplicate brand.');brandIds.add(b.id);}
    const str=(o,keys)=>keys.every(k=>typeof o[k]==='string');
    for(const p of data.posts){
      if(!p.id||ids.has(p.id)||!brandIds.has(p.brandId))throw Error('Invalid brand or duplicate content ID.');ids.add(p.id);
      if(!str(p,['title','platform','format','date','time','timezone','source'])||!p.brief||!str(p.brief,['objective','audience','cta','owner','approver','direction','slideCopy','caption','pillar','campaign'])||!Number.isInteger(p.briefRevision)||p.briefRevision<1)throw Error('Invalid brief: '+p.id);
      if(!Array.isArray(p.versions)||!Array.isArray(p.history)||!Array.isArray(p.requests)||!Array.isArray(p.sources)||!p.publishing||!str(p.publishing,['state','date','time','timezone','url','note']))throw Error('Incomplete content record: '+p.id);
      const versionIds=new Set();
      for(const v of p.versions){
        if(!v.id||versionIds.has(v.id)||!Number.isInteger(v.number)||!Number.isInteger(v.briefRevision)||!str(v,['caption','note','createdAt','creator','state'])||!['draft','in-review','changes-requested','approved'].includes(v.state)||!v.qc||!Array.isArray(v.assets)||!Array.isArray(v.decisions))throw Error('Invalid content version: '+p.id);
        versionIds.add(v.id);
        for(const a of v.assets)if(!str(a,['id','name','type','alt','url'])||!['image','video'].includes(a.type)||!safeMedia(a.url))throw Error('Invalid media file: '+p.id);
        for(const d of v.decisions)if(!str(d,['id','action','actor','comment','at']))throw Error('Invalid review decision.');
      }
      for(const h of p.history)if(!str(h,['id','at','actor','action','detail']))throw Error('Invalid history entry.');
      for(const r of p.requests)if(!str(r,['id','title','owner','due','state','note'])||!['requested','received','accepted','cancelled'].includes(r.state))throw Error('Invalid media request.');
      if(p.planApproval&&(!Number.isInteger(p.planApproval.revision)||!str(p.planApproval,['actor','at'])))throw Error('Invalid plan approval.');
    }
    validateMetrics(data.analytics,data.posts);
    for(const f of data.findings)if(!brandIds.has(f.brandId)||!str(f,['id','observation','action','owner','due','evidence','createdAt']))throw Error('Invalid learning note.');
    return data;
  }
  function validateMetrics(rows, posts) {
    if(!Array.isArray(rows)||rows.length>10000)throw Error('Analytics must be an array of at most 10,000 rows.');
    const keys=new Set();
    for(const r of rows){
      if(!posts.some(p=>p.id===r.contentId))throw Error('Unknown content ID: '+r.contentId);
      if(typeof r.source!=='string'||!r.source.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(r.start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(r.end||'')||r.end<r.start||!/^\d{4}-\d{2}-\d{2}/.test(r.collectedAt||''))throw Error('Every analytics row needs a source, valid reporting window, and collection date.');
      if(!['sample','manual','imported'].includes(r.origin))throw Error('Analytics origin must be sample, manual, or imported.');
      for(const k of ['impressions','reach','interactions','clicks'])if(r[k]!==null && (!Number.isFinite(r[k])||r[k]<0))throw Error(k+' must be a non-negative number or null (unknown).');
      const key=[r.contentId,r.start,r.end,r.origin].join('|');if(keys.has(key))throw Error('Duplicate analytics row for '+r.contentId);keys.add(key);
    }
    return rows;
  }
  const api={clone,id,now,brands,qcKeys,qcLabels,event,latest,isApproved,status,readiness,permissionGaps,briefSnapshots,restoreBrief,makePost,seed,addDays,saveBrief,approvePlan,addVersion,submit,decide,publish,packageFor,safeMedia,validate,validateMetrics};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JMLCore=api;
})(typeof window!=='undefined'?window:globalThis);
