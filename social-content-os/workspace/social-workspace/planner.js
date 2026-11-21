/* The full planner is the calendar editor. Its embedded document consumes the
   same saved posts as Studio, with its additional calendar metadata retained. */
(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const briefMap = {copy:'caption', objective:'objective', audience:'audience', cta:'cta', owner:'owner', pillar:'pillar', campaign:'campaign'};
  const postFields = ['title','platform','format','date','time','timezone'];
  const statusNames = ['draft','needs-approval','ready','approved'];
  const clean = value => typeof value === 'string' ? value : '';
  const missing = value => !value || ['To be defined','To define','Unassigned'].includes(value);
  const campaignKey = name => clean(name).trim().toLocaleLowerCase();
  let context, frame, bootFrame, queue = Promise.resolve();
  let remembered = null;
  let activeSession = null;
  let untouchedBoot = false;
  const sections=[
    {key:'calendar',label:'Content calendar',group:'core',kind:'calendar',value:'all'},
    {key:'ideas',label:'Ideas & drafts',group:'workflow',kind:'calendar',value:'draft'},
    {key:'plan-approvals',label:'Needs approval',group:'workflow',kind:'calendar',value:'needs-approval'},
    {key:'ready',label:'Ready for review',group:'workflow',kind:'calendar',value:'ready'},
    {key:'approved',label:'Approved',group:'workflow',kind:'calendar',value:'approved'},
    {key:'planner-dashboard',label:'Planner dashboard',group:'tools',kind:'dashboard'},
    ...[['campaigns','Campaigns'],['pillars','Content pillars'],['assets','Asset library'],['team','Team & approvals'],['performance','Performance notes'],['experiments','Experiments'],['sources','Source evidence'],['roles','Planner access reference']].map(([value,label])=>({key:'planner-'+value,label,group:'tools',kind:'module',value})),
    {key:'planner-artwork',label:'Prepared artwork',group:'tools',kind:'artwork'},
    ...[['portfolio','Portfolio overview'],['channels','Channel comparison'],['internal','Internal account report'],['client','Client report']].map(([value,label])=>({key:'planner-report-'+value,label,group:'reports',kind:'report',value})),
    ...[['campaigns','Campaign settings'],['pillars','Content pillar settings'],['team','Owner reference list'],['platforms','Platform settings']].map(([value,label])=>({key:'planner-settings-'+value,label,group:'settings',kind:'settings',value}))
  ];
  const sectionFor=key=>sections.find(s=>s.key===key)||sections[0];
  const viewMemory=new Map();
  let requestedSection='calendar';
  let bootReady=null,resolveBoot=null;

  function sourceFields(row) {
    const fields = {brief:{}};
    postFields.forEach(key => { if (typeof row[key] === 'string') fields[key] = row[key]; });
    Object.entries(briefMap).forEach(([key, dest]) => {
      if (typeof row[key] === 'string') fields.brief[dest] = missing(row[key]) ? '' : row[key];
    });
    return fields;
  }

  function extraFields(row) {
    const extra = {...row};
    for (const key of ['id','brand_id', ...postFields, ...Object.keys(briefMap),'source','workspaceAssets']) delete extra[key];
    return extra;
  }

  function projection(post, brand, C, includeMedia=true) {
    const extra = post.planner || {};
    const row = {...extra, id:post.id, brand_id:post.brandId, account:extra.account || brand.name,
      asset:extra.asset || 'bricks', source:post.source, status:statusNames.includes(extra.status)?extra.status:'draft',
      approval:extra.approval || 'pending', hook:clean(extra.hook)};
    postFields.forEach(key => { row[key] = clean(post[key]); });
    Object.entries(briefMap).forEach(([key,dest]) => { row[key] = clean(post.brief[dest]); });
    if (post.planApproval?.revision === post.briefRevision) {
      row.status = 'approved'; row.approval = 'approved';
    } else if (extra.approvalRevision && extra.approvalRevision !== post.briefRevision) {
      row.status = 'needs-approval'; row.approval = 'pending';
    }
    const assets = includeMedia && C.latest(post)?.assets;
    if (assets?.length) row.workspaceAssets = assets.filter(a=>C.safeMedia(a.url)).map(a=>({
      type:a.type, url:root.JMLStorage?.mediaURL(a.url) || a.url, alt:a.alt, name:a.name
    }));
    return row;
  }

  function collectLegacy(state, initial, C) {
    const brandIds = new Set(state.brands.map(b=>b.id));
    const existing = new Map(state.posts.map(p=>[p.id,p]));
    const report={added:0,matched:0,skipped:0,decisions:0};
    for (const row of initial.rows) {
      if (!row.id || !brandIds.has(row.brand_id)){report.skipped++;continue;}
      let p = existing.get(row.id);
      const fields = sourceFields(row);
      if(p)report.matched++;else report.added++;
      if(p && initial.preserveIds?.includes(p.id))continue;
      if (!p) {
        p = C.makePost({...row, ...fields, ...fields.brief, brandId:row.brand_id,
          source:row.source || 'Imported Content Planner record'});
        state.posts.push(p);
        existing.set(row.id,p);
      } else if (p.brandId !== row.brand_id) {
        throw Error('Content ID belongs to two accounts: '+row.id);
      } else if (p.briefRevision === 1 && !p.planApproval && !state.workingDrafts?.[p.id] && p.id!==initial.openPost) {
        // Preserve workspace edits. Bring across missing source fields and
        // explicit legacy scheduling decisions before the initial migration.
        const saved = initial.storedIds.includes(row.id);
        const defaults = {...p.brief};
        for (const [key,val] of Object.entries(fields.brief)) {
          if (missing(defaults[key]) || (saved && val)) defaults[key] = val;
        }
        const merged = {brief:defaults};
        for (const key of postFields) if (fields[key] && (!p[key] || saved)) merged[key]=fields[key];
        if (Object.keys(merged).some(k=>k==='brief'?!equal(merged.brief,p.brief):merged[k]!==p[k])) {
          C.saveBrief(p,merged,'Planner import');
        }
      }
      p.planner = extraFields(row);
      if (row.status==='approved') p.planner.approvalRevision=p.briefRevision;
      for (const ev of row.reviewHistory || []) {
        report.decisions++;
        if (!p.history.some(h=>h.id===ev.id)) p.history.push({id:String(ev.id),at:clean(ev.at),actor:clean(ev.actor),
          action:ev.action==='approved'?'Legacy plan approved':'Legacy plan changes requested',detail:clean(ev.comment)});
      }
    }
    state.plannerArchive = {format:1, initializedAt:C.now(), report, settings:copy(initial.settings), notifications:copy(initial.notifications), notes:{}};
  }

  function applyChanges(state, payload, C, actor) {
    const byId = new Map(state.posts.map(p=>[p.id,p]));
    for (const {before,after} of payload.rows || []) {
      let p=byId.get(after.id);
      if (!state.brands.some(b=>b.id===after.brand_id)) throw Error('Planner account was removed.');
      if (!p) {
        if (before) throw Error('This content item has changed. Reopen Plan and retry.');
        p=C.makePost({...after,...sourceFields(after).brief,brandId:after.brand_id});
        root.JMLBriefTemplate?.adopt(state,p); p.planner=extraFields(after); state.posts.push(p); byId.set(p.id,p);
        continue;
      }
      if (!before || p.brandId!==after.brand_id) throw Error('Duplicate planner content ID.');
      const delta=sourceFields(after);
      for (const k of postFields) if (before[k]===after[k]) delete delta[k];
      Object.entries(briefMap).forEach(([k,dest])=>{if(before[k]===after[k])delete delta.brief[dest];});
      if (Object.keys(delta.brief).length || Object.keys(delta).length>1) C.saveBrief(p,delta,actor);
      const previous = p.planner || {};
      p.planner={...extraFields(after)};
      if (previous.approvalRevision) p.planner.approvalRevision=previous.approvalRevision;
      const seen = new Set((before.reviewHistory||[]).map(h=>h.id));
      for (const decision of (after.reviewHistory||[]).filter(h=>!seen.has(h.id))) {
        if (decision.action==='approved') {
          C.approvePlan(p,decision.actor||actor); p.planner.approvalRevision=p.briefRevision;
        } else {
          p.planApproval=null;
          if (['planned','handed-off'].includes(p.publishing.state)) p.publishing.state='on-hold';
          C.event(p,'Plan changes requested',clean(decision.comment),decision.actor||actor);
        }
      }
    }
    const archive=state.plannerArchive;
    if(payload.settings) for(const brand of state.brands) {
      const entries=payload.settings[brand.id]?.campaigns || [];
      const previous=archive.settings[brand.id]?.campaigns || [];
      for(const campaign of brand.operations?.campaigns || []) {
        const old=previous.find(c=>c.id===campaign.id || campaignKey(c.name)===campaignKey(campaign.title));
        const match=entries.find(c=>c.id===campaign.id || (old && c.id===old.id) || campaignKey(c.name)===campaignKey(campaign.title));
        if(match)Object.assign(campaign,{title:match.name,objective:match.objective,owner:match.owner});
      }
    }
    for (const key of ['settings','notifications','notes']) if (payload[key]!==undefined) archive[key]=copy(payload[key]);
  }

  function validate(state) {
    const a=state.plannerArchive;
    if(a && (a.format!==1 || !a.settings || typeof a.settings!=='object' || !Array.isArray(a.notifications) || !a.notes || typeof a.notes!=='object')) throw Error('Invalid planner settings or notification history.');
    if(a) for(const item of Object.values(a.settings)) {
      for (const key of ['campaigns','pillars','team','platforms']) {
        if(!Array.isArray(item?.[key]) || item[key].some(entry=>typeof entry.name!=='string' || typeof entry.id!=='string')) throw Error('Invalid planner reference list.');
      }
    }
    for(const p of state.posts) if(p.planner && (!statusNames.includes(p.planner.status) || (p.planner.reviewHistory&&!Array.isArray(p.planner.reviewHistory)))) throw Error('Invalid planning state for '+p.id);
  }

  const settingKinds={campaigns:['objective','owner'],pillars:['purpose'],team:['role'],platforms:[]};
  const transferText=('account asset hook approval reviewURL dateStatus suggestedStart funnelStage keyTalkingPoints geographicAngle calendarNotes originalCalendarStatus assetStatus publishingStatus assetPath captionPath sourcePackage sourceCalendar campaignProvenance pillarProvenance dateOrigin captionStatus importBatch productionNote timeSource originalCreativeTitle caption hashtags description keyPoints productionBrief onScreenText assetsNeeded dimensions storyType briefNotes sourceCalendarId sourceKind sourceCalendarDate sourceCalendarTime sourceCalendarRevision').split(' ');
  const isObject=o=>o && typeof o==='object' && !Array.isArray(o);
  const validKey=v=>typeof v==='string' && /^[\w.-]{1,180}$/.test(v) && !Object.hasOwn(Object.prototype,v);
  function transferRow(raw,brandId) {
    if(!isObject(raw)||!validKey(raw.id)||raw.brand_id!==brandId||!clean(raw.title).trim()||!clean(raw.platform).trim()||!statusNames.includes(raw.status))throw Error('Invalid item or different account in planner export.');
    const r={id:raw.id,brand_id:brandId,status:raw.status};
    for(const key of [...postFields,...Object.keys(briefMap),'source',...transferText])if(key in raw){
      if(typeof raw[key]!=='string')throw Error('Invalid '+key+' for '+r.id+'.');
      r[key]=raw[key];
    }
    if(r.reviewURL && !/^content-planner-review\.html(?:#[\w%-]+)?$/.test(r.reviewURL))throw Error('Invalid artwork review link for '+r.id+'.');
    for(const key of ['relativeDay','week','postNumber'])if(key in raw){
      if(!Number.isInteger(raw[key])||raw[key]<0)throw Error('Invalid calendar number for '+r.id+'.');r[key]=raw[key];
    }
    if(typeof raw.briefProposed==='boolean')r.briefProposed=raw.briefProposed;
    if(raw.provenance!==undefined){
      if(!isObject(raw.provenance)||Object.values(raw.provenance).some(v=>typeof v!=='string')||(raw.provenance.brand_id&&raw.provenance.brand_id!==brandId))throw Error('Invalid item provenance for '+r.id+'.');
      r.provenance=Object.fromEntries(['brand_id','claim_type','confidence','evidence_ref'].filter(k=>k in raw.provenance).map(k=>[k,raw.provenance[k]]));
    }
    if(raw.reviewHistory!==undefined){
      const ids=new Set();
      if(!Array.isArray(raw.reviewHistory))throw Error('Invalid review history for '+r.id+'.');
      r.reviewHistory=raw.reviewHistory.map(h=>{
        if(!isObject(h)||!validKey(h.id)||ids.has(h.id)||!['approved','rejected'].includes(h.action)||typeof h.actor!=='string'||typeof h.comment!=='string'||!Number.isFinite(Date.parse(h.at)))throw Error('Invalid planning decision for '+r.id+'.');
        ids.add(h.id);
        return Object.fromEntries(['id','action','at','actor','comment','actorRole','recipient'].filter(k=>typeof h[k]==='string').map(k=>[k,h[k]]));
      });
    }
    return r;
  }
  function wasEdited(p,s) {
    return !!(s.workingDrafts?.[p.id] || p.planApproval || p.production || p.requests.length ||
      ['Created in this workspace','User-created in local prototype'].includes(p.source) ||
      p.publishing.state!=='not-queued' || p.versions.some(v=>v.creator!=='Source import' || v.state!=='draft') ||
      p.planner?.reviewHistory?.length || (p.briefVersions||[]).some(v=>v.number>1 && v.actor!=='Planner import') ||
      p.history.some(h=>h.action==='Plan changes requested' || h.action==='Plan approved'));
  }
  function transferPlan(state,payload,C) {
    const brand=state.brands.find(b=>b.id===payload?.brand_id);
    const settings=payload?.settings;
    if(!brand||!isObject(settings)||settings.brand_id!==brand.id||!Array.isArray(payload.calendar_items)||payload.calendar_items.length>5000)throw Error('Select a one-account JSON export from Content Planner.');
    if(!state.plannerArchive)throw Error('The local Content Planner is initializing. Retry the preview in a moment.');
    const postings=new Map(state.posts.map(p=>[p.id,p])),seen=new Set(),rows=[],references=[];
    const summary={brandId:brand.id,brandName:brand.name,added:0,updated:0,unchanged:0,conflicts:[],settings:{added:0,unchanged:0,conflicts:[]}};
    for(const raw of payload.calendar_items){
      const r=transferRow(raw,brand.id),p=postings.get(r.id);
      if(seen.has(r.id)||p && p.brandId!==brand.id)throw Error('Duplicate or cross-account content ID: '+r.id);
      seen.add(r.id);
      if(!p){rows.push({r,kind:'added'});summary.added++;continue;}
      const current=projection(p,brand,C,false),fields=sourceFields(r),extra=extraFields(r);
      delete extra.reviewHistory;
      const edits=[];
      for(const [key,value] of Object.entries(fields))if(key!=='brief' && value!==p[key])edits.push(key);
      for(const [key,value] of Object.entries(fields.brief))if(value!==p.brief[key])edits.push(key);
      for(const [key,value] of Object.entries(extra))if(!equal(value,current[key]))edits.push(key);
      // The workspace retains source provenance for prepared files. A calendar
      // export can contribute other plan fields without replacing that record.
      const localHistory=new Map((p.planner?.reviewHistory||[]).map(h=>[h.id,h]));
      const decisions=(r.reviewHistory||[]).filter(h=>{
        const old=localHistory.get(h.id);
        if(old && ['action','at','actor','comment'].some(k=>h[k]!==old[k]))throw Error('A calendar decision ID has conflicting history for '+r.id+'.');
        return !old;
      });
      if(!edits.length && !decisions.length){summary.unchanged++;continue;}
      const kind=edits.length && wasEdited(p,state)?'conflict':'updated';
      if(kind==='conflict')summary.conflicts.push({id:r.id,title:r.title,fields:edits});
      else summary.updated++;
      rows.push({r,p,kind,fields,extra,decisions});
    }
    if(postings.size+summary.added>5000)throw Error('This import exceeds the workspace limit of 5,000 content items.');
    const local=state.plannerArchive.settings[brand.id];
    for(const [kind,extra] of Object.entries(settingKinds)){
      const incoming=settings[kind],known=local?.[kind]||[],ids=new Set(),names=new Set(),matched=new Set();
      if(!Array.isArray(incoming))throw Error('The planner export is missing its '+kind+' list.');
      for(const raw of incoming){
        if(!isObject(raw)||!validKey(raw.id)||raw.brand_id!==brand.id||typeof raw.name!=='string'||!raw.name.trim()||!['active','planning','archived'].includes(raw.status)||ids.has(raw.id)||names.has(campaignKey(raw.name)))throw Error('Invalid or duplicate '+kind+' reference.');
        ids.add(raw.id);names.add(campaignKey(raw.name));
        const value={id:raw.id,brand_id:brand.id,name:raw.name,status:raw.status};
        for(const k of extra){if(typeof raw[k]!=='string')throw Error('Invalid '+kind+' reference '+k+'.');value[k]=raw[k];}
        const match=known.find(v=>v.id===value.id),sameName=known.find(v=>campaignKey(v.name)===campaignKey(value.name));
        if(match && sameName && match!==sameName)throw Error('A '+kind+' ID and name match two different local settings.');
        const existing=match||sameName,key=kind+':'+value.id;
        if(existing){
          if(matched.has(existing.id))throw Error('Two '+kind+' references match the same local setting.');
          matched.add(existing.id);value.id=existing.id;
        }
        const fields=existing?Object.keys(value).filter(k=>value[k]!==existing[k]):[];
        if(existing && !fields.length){summary.settings.unchanged++;continue;}
        if(existing)summary.settings.conflicts.push({id:key,title:value.name,fields});
        else summary.settings.added++;
        references.push({existing,value,key,kind});
      }
    }
    return {summary,rows,references};
  }
  function previewTransfer(state,payload,C){return transferPlan(state,payload,C).summary;}
  function applyTransfer(state,payload,C,actor,options={}) {
    const {summary,rows,references}=transferPlan(state,payload,C);
    const replaced=new Set(options.replaceIds||[]),replaceRefs=new Set(options.replaceSettings||[]);
    for(const {r,p:match,kind,fields,extra,decisions} of rows) {
      if(kind==='conflict' && !replaced.has(r.id))continue;
      let p=match;
      if(!p){
        const source=sourceFields(r);
        p=C.makePost({id:r.id,brandId:r.brand_id,...source,...source.brief,source:r.source||'Imported planner export'});
        Object.assign(p,Object.fromEntries(Object.entries(source).filter(([k])=>k!=='brief')));
        p.planner=extraFields(r);delete p.planner.reviewHistory;
        state.posts.push(p);
      }else{
        C.saveBrief(p,fields,actor);
        p.planner={...(p.planner||{}),...extra};
        if(kind==='conflict' && p.planApproval && r.status!=='approved'){
          if(!p.planDecisions)p.planDecisions=[copy(p.planApproval)];
          p.planApproval=null;
          if(['planned','handed-off'].includes(p.publishing.state))p.publishing.state='on-hold';
        }
      }
      if(r.status==='approved')p.planner.approvalRevision=p.briefRevision;
      else delete p.planner.approvalRevision;
      for(const h of decisions||r.reviewHistory||[]){
        (p.planner.reviewHistory??=[]).push(copy(h));
        if(!p.history.some(entry=>entry.id===h.id))p.history.push({id:h.id,at:h.at,actor:h.actor,action:h.action==='approved'?'Legacy plan approved':'Legacy plan changes requested',detail:h.comment});
      }
      C.event(p,'Planner export imported',summary.brandName+' · '+(kind==='added'?'added to the local calendar':'merged planning record'),actor);
    }
    const archive=state.plannerArchive.settings;
    if(references.length && !archive[summary.brandId])archive[summary.brandId]={brand_id:summary.brandId,campaigns:[],pillars:[],team:[],platforms:[]};
    for(const {existing,value,key,kind} of references){
      if(existing){if(replaceRefs.has(key))Object.assign(existing,value);}
      else archive[summary.brandId][kind].push(copy(value));
    }
    return summary;
  }

  function markup(ctx,section){
    const key=sectionFor(typeof ctx==='string'?ctx:section||ctx?.ui?.section).key;
    return '<h1 class="hidden">'+sectionFor(key).label+'</h1><section id="planner-host" data-planner-section="'+key+'" class="planner-host" aria-label="'+sectionFor(key).label+'"><p class="planner-loading" role="status">Opening '+sectionFor(key).label.toLowerCase()+'…</p></section>';
  }
  function sourceWindow(win) { return !!win && (frame?.contentWindow===win || bootFrame?.contentWindow===win); }
  function current(){return context.getState?.() || context.state;}
  function getPayload() {
    const state=current(), G=root.JMLGovernance,allowed=G?G.brands(state,context.ui):state.brands,ids=new Set(allowed.map(b=>b.id)),brands=new Map(allowed.map(b=>[b.id,b]));
    const archive=copy(state.plannerArchive);archive.settings=Object.fromEntries(Object.entries(archive.settings).filter(([id])=>ids.has(id)));archive.notes=Object.fromEntries(Object.entries(archive.notes).filter(([key])=>ids.has(key.split('|')[0])));archive.notifications=archive.notifications.filter(n=>ids.has(n.brandId||n.brand_id));
    return {brandId:context.ui.brand,identity:G?{personId:context.ui.personId,name:context.ui.actor,canEdit:G.can(state,context.ui,'edit'),canSettings:G.can(state,context.ui,'admin'),canReport:['analyze','coordinate','strategy'].some(cap=>G.can(state,context.ui,cap)),canPortfolio:G.can(state,context.ui,'directory'),canApprove:false}:null,brands:allowed.map(b=>({id:b.id,name:b.name, initials:b.initials,primary:b.primary,accent:b.accent,
      campaigns:copy(b.operations?.campaigns||[])})),
      rows:state.posts.filter(p=>ids.has(p.brandId)&&(!G||G.can(state,context.ui,'read',p))).map(p=>projection(p,brands.get(p.brandId),context.C)),
      archive, view:viewMemory.get(context.ui.brand+'|'+(context.ui.personId||''))||remembered, section:sectionFor(requestedSection), sections:copy(sections), revision:state.revision};
  }
  function enqueue(action) {
    const result=queue.then(action);
    queue=result.catch(()=>{});
    return result;
  }
  async function importIfNeeded(initial) {
    while (!current().plannerArchive || current().plannerArchive.deferredLegacyImport && (!root.JMLGovernance||root.JMLGovernance.can(current(),context.ui,'backup'))) {
      const canImport=!root.JMLGovernance||root.JMLGovernance.can(current(),context.ui,'backup');
      try {
        await context.commit(next=>{
          if(canImport){
            const previous=next.plannerArchive;
            collectLegacy(next,{...initial,openPost:context.ui.post,preserveIds:previous?.deferredLegacyImport?next.posts.filter(p=>wasEdited(p,next)).map(p=>p.id):[]},context.C);
            if(previous){next.plannerArchive.settings={...next.plannerArchive.settings,...previous.settings};next.plannerArchive.notes=previous.notes;const seen=new Set(next.plannerArchive.notifications.map(n=>n.id));next.plannerArchive.notifications.push(...previous.notifications.filter(n=>!seen.has(n.id)));}
          }else if(!next.plannerArchive)next.plannerArchive={format:1,initializedAt:context.C.now(),settings:{},notifications:[],notes:{},deferredLegacyImport:true};
        },'',{render:false});
      } catch(err) {
        if(err.message!=='A save is already in progress.')throw err;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    }
  }
  function accept(win,initial) {
    if(!sourceWindow(win)) throw Error('Unrecognized planner.');
    return enqueue(async()=>{
      await importIfNeeded(initial);
      if (win===bootFrame?.contentWindow) {
        resolveBoot?.(true);resolveBoot=null;
        setTimeout(()=>{
          if (bootFrame) {bootFrame.remove();bootFrame=null;}
          if (untouchedBoot && !document.getElementById('planner-host') && !document.querySelector('dialog[open],#brief-form')) context.render();
        },0);
        return null;
      }
      activeSession=win;
      return getPayload();
    });
  }
  function write(win,payload) {
    if (!sourceWindow(win) || win!==activeSession) return Promise.reject(Error('Reopen the calendar to continue.'));
    return enqueue(async()=>{
      if (payload.revision!==current().revision) throw Error('The workspace changed. Reopen the calendar before saving.');
      const G=root.JMLGovernance,state=current();
      if(G){for(const row of payload.rows||[]){G.assert(state,context.ui,'edit',{...row.after,brandId:row.after.brand_id});if(row.after.brand_id!==context.ui.brand)throw Error('Edit the selected account only.');if(JSON.stringify(row.before?.reviewHistory)!==JSON.stringify(row.after?.reviewHistory))G.assert(state,context.ui,'approve',state.posts.find(p=>p.id===row.after.id));}
        for(const [id,value]of Object.entries(payload.settings||{}))if(!equal(value,state.plannerArchive.settings[id]))G.assert(state,context.ui,'admin',{brandId:id});
      }
      const merged={...payload};if(payload.settings)merged.settings={...state.plannerArchive.settings,...payload.settings};if(payload.notes)merged.notes={...state.plannerArchive.notes,...payload.notes};if(payload.notifications){const ids=new Set(payload.notifications.map(n=>n.id));merged.notifications=[...state.plannerArchive.notifications.filter(n=>!ids.has(n.id)),...payload.notifications];}
      await context.commit(next=>applyChanges(next,merged,context.C,context.ui.actor),'',{render:false});
      return current().revision;
    });
  }
  function setBrand(win,id){
    if(sourceWindow(win) && current().brands.some(b=>b.id===id) && context.ui.brand!==id) {
      remembered=null; context.setBrand(id);
    }
  }
  async function studio(win,id) {
    await queue;
    if (sourceWindow(win) && current().posts.some(p=>p.id===id && p.brandId===context.ui.brand)) context.navigate('#content/'+encodeURIComponent(id)+'/brief');
  }
  function remember(win,view){if(sourceWindow(win)){remembered=view;viewMemory.set(view.brandId+'|'+(view.personId||''),copy(view));}}
  function resize(win,height){
    if(frame?.contentWindow!==win||win!==activeSession||!Number.isFinite(height))return;
    const next=Math.max(520,Math.min(20000,Math.ceil(height)));
    if(Math.abs((parseFloat(frame.style.height)||0)-next)>1)frame.style.height=next+'px';
    viewport();
  }
  function viewport(){
    if(!frame?.isConnected||!frame.contentDocument?.documentElement)return;
    const rect=frame.getBoundingClientRect(),style=frame.contentDocument.documentElement.style,top=Math.max(0,-rect.top)+16,height=Math.max(240,Math.min(root.innerHeight-Math.max(0,rect.top)-32,rect.height-top-16));
    style.setProperty('--planner-overlay-top',top+'px');style.setProperty('--planner-overlay-height',height+'px');
  }
  if(root.addEventListener){root.addEventListener('scroll',viewport,{passive:true});root.addEventListener('resize',viewport,{passive:true});}
  async function prepareNavigation(){
    try{if(bootFrame&&bootReady)await bootReady;if(frame?.isConnected&&frame.contentWindow===activeSession)await frame.contentWindow.JMLPlannerFrame?.prepareNavigation();await queue;return true;}
    catch(err){context.toast('Finish or recover the planner save before leaving. '+err.message);return false;}
  }
  async function navigateSection(win,key){
    if(!sourceWindow(win)||win!==activeSession||!sections.some(s=>s.key===key))return false;
    await queue;context.navigate('#plan/'+key);return true;
  }
  function reportError(win,message) {
    if (!sourceWindow(win)) return;
    context.toast('Calendar could not load. '+String(message));
    if (bootFrame?.contentWindow===win) {resolveBoot?.(false);resolveBoot=null;bootFrame.remove();bootFrame=null;}
  }
  function createFrame(hidden) {
    const f=document.createElement('iframe');
    f.title='Agency content planner'; f.className='agency-planner-frame'; f.hidden=hidden;
    f.src='content-planner.html?workspace=1';
    return f;
  }
  function mount(ctx,section=ctx.ui.section){
    context=ctx;
    const host=document.getElementById('planner-host');
    requestedSection=sectionFor(section||host?.dataset.plannerSection).key;
    if(!host) {
      frame=null;activeSession=null;
      if((!current().plannerArchive||current().plannerArchive.deferredLegacyImport&&(!root.JMLGovernance||root.JMLGovernance.can(current(),context.ui,'backup'))) && !bootFrame) {
        untouchedBoot=true;
        const touched=()=>{untouchedBoot=false;};
        for(const type of ['input','pointerdown','keydown'])document.addEventListener(type,touched,{capture:true,once:true});
        bootReady=new Promise(resolve=>{resolveBoot=resolve;});bootFrame=createFrame(true);document.body.append(bootFrame);
        const pending=bootFrame;setTimeout(()=>{if(bootFrame===pending&&resolveBoot){resolveBoot(false);resolveBoot=null;}},10000);
      }
      return;
    }
    if(frame?.isConnected && host.contains(frame)){frame.contentWindow.JMLPlannerFrame?.navigate(sectionFor(requestedSection));return;}
    frame=createFrame(false);
    host.replaceChildren(frame);
  }
  const api={sections,sectionFor,prepareNavigation,navigateSection,markup,mount,accept,reportError,write,setBrand,studio,remember,resize,validate,collectLegacy,applyChanges,projection,previewTransfer,applyTransfer};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.JMLPlanner=api;
})(typeof window==='undefined'?globalThis:window);
