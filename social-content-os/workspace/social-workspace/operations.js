/* Account planning, production tasks and versioned reviews. Stored in the workspace JSON. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.JMLCore;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ROUTES = {
    S:{name:'Designed static', field:'Layout and slide sequence', steps:['Set layout and visual references','Design and adapt each placement','Check slide order, copy and export']},
    A:{name:'Motion graphics',field:'Scene order, style frames and timing',steps:['Prepare script and style frames','Approve style frames','Animate and add sound','Render and check captions']},
    B:{name:'Real footage edit',field:'Shot list and editing instructions',steps:['Check footage, releases and sound','Assemble rough cut','Approve rough cut structure','Finish captions, audio and cover']},
    G:{name:'AI-generated video',field:'Shot prompts, reference frames and disclosure',steps:['Approve AI use and references','Prepare shot prompts and start frames','Select takes and record AI use','Edit, caption and export']}
  };
  const PLAN_TYPES = {foundation:'foundationVersions',strategy:'strategies',calendar:'calendars'};
  const emptyOps = () => ({foundation:{},foundationVersions:[],sources:[],watchlists:[],runs:[],strategies:[],calendars:[],decisions:[],campaigns:[],slots:[],events:[],exceptions:[]});
  function account(state, brandId, write=false) {
    const brand=state.brands.find(b=>b.id===brandId);
    if(!brand)throw Error('This account is unavailable.');
    if(!brand.operations && write)brand.operations=emptyOps();
    if(brand.operations && write)brand.operations.foundationVersions||=[];
    return brand.operations || emptyOps();
  }
  function record(ops,actor,action,detail) {
    ops.events.push({id:C.id('event'),at:C.now(),actor,action,detail});
  }
  function snapshot(ops,kind,body,actor,extra={}) {
    const collection=ops[PLAN_TYPES[kind]];
    if(!collection)throw Error('Unknown planning document.');
    const row={id:C.id(kind),number:collection.length+1,actor,at:C.now(),body:C.clone(body),...extra};
    collection.push(row);
    record(ops,actor,'Saved '+kind+' version '+row.number,body.title || body.objective || body.start || '');
    return row;
  }
  function decision(ops,kind,versionId,outcome,actor,note) {
    const version=ops[PLAN_TYPES[kind]]?.at(-1);
    if(!version || version.id!==versionId)throw Error('A newer version needs review.');
    if(!['approved','changes-requested'].includes(outcome))throw Error('Select a review decision.');
    if(!actor?.trim() || (outcome==='changes-requested' && !note?.trim()))throw Error('Name the decision owner and describe any requested changes.');
    if(ops.foundation.finalApprover && actor.trim()!==ops.foundation.finalApprover)throw Error('This decision is assigned to '+ops.foundation.finalApprover+'.');
    if(ops.decisions.some(d=>d.targetId===versionId))throw Error('This version already has a decision. Save a revised version first.');
    if(kind==='strategy'&&outcome==='approved'&&ops.foundationVersions?.length&&!approved(ops,ops.foundationVersions.at(-1)))throw Error('Confirm the current client foundation before approving the strategy.');
    if(kind==='strategy'&&outcome==='approved'&&version.foundationVersionId&&version.foundationVersionId!==ops.foundationVersions?.at(-1)?.id)throw Error('The client foundation changed. Save a strategy version against the current foundation.');
    ops.decisions.push({id:C.id('decision'),kind,targetId:versionId,decision:outcome,actor:actor.trim(),note,at:C.now()});
    record(ops,actor,kind+' V'+version.number+' · '+outcome,note);
  }
  const approved=(ops,v)=>v && ops.decisions.some(d=>d.targetId===v.id && d.decision==='approved');
  function calendarScope(p) {
    return {contentId:p.id,title:p.title,platform:p.platform,format:p.format,date:p.date,time:p.time,timezone:p.timezone,owner:p.brief.owner,campaign:p.brief.campaign,
      objective:p.brief.objective,angleId:p.planningAngleId||'',measurementDefinitionId:p.measurementDefinitionId||'',strategyVersionId:p.strategyVersionId||''};
  }
  function calendarCoverage(state,p) {
    const ops=account(state,p.brandId), scope=calendarScope(p);
    const version=ops.calendars.slice().reverse().find(v=>approved(ops,v)&&v.body.entries.some(e=>e.contentId===p.id&&JSON.stringify(e)===JSON.stringify(scope)));
    return version?{calendarId:version.id,number:version.number,decision:ops.decisions.find(d=>d.targetId===version.id)}:null;
  }
  function calendarPackage(state,brandId,range) {
    if(!range.start || !range.end || range.end<range.start)throw Error('Choose a valid calendar period.');
    const ops=account(state,brandId),strategy=ops.strategies.at(-1);
    if(!approved(ops,strategy))throw Error('Approve the current strategy before submitting a calendar.');
    if(strategy.foundationVersionId&&strategy.foundationVersionId!==ops.foundationVersions?.at(-1)?.id)throw Error('The client foundation changed. Review strategy before submitting the calendar.');
    const entries=state.posts.filter(p=>p.brandId===brandId && p.date>=range.start && p.date<=range.end)
      .map(calendarScope)
      .sort((a,b)=>a.date.localeCompare(b.date)||a.contentId.localeCompare(b.contentId));
    const slots=ops.slots.filter(s=>!s.contentId && s.date>=range.start && s.date<=range.end);
    if(!entries.length && !slots.length)throw Error('Choose a period with scheduled content or a reserved trend slot.');
    if(entries.some(p=>!p.owner?.trim()))throw Error('Assign a content owner to each included item before submitting the calendar.');
    const weeks={};
    for(const row of [...entries,...slots]){
      const weekday=new Date(row.date+'T12:00:00Z').getUTCDay();
      const week=C.addDays(row.date,-((weekday+6)%7));
      weeks[week]=(weeks[week]||0)+1;
    }
    const limit=Number(ops.foundation.weeklyCapacity);
    const exceeded=Object.keys(weeks).find(week=>limit>0 && weeks[week]>limit);
    if(exceeded)throw Error('Week of '+exceeded+' has '+weeks[exceeded]+' planned items against an agreed capacity of '+limit+'. Adjust capacity or move a slot.');
    return {start:range.start,end:range.end,strategyVersionId:strategy.id,entries,slots:C.clone(slots),weeks};
  }
  function readiness(post) {
    const spec=post.brief.productionSpec || {};
    const issues=[...C.readiness(post), ...C.permissionGaps(post)];
    if(!ROUTES[spec.route])issues.push('Choose a production route');
    if(!spec.instructions?.trim())issues.push('Add route-specific instructions');
    if(!spec.references?.trim())issues.push('Add a source asset or approved reference');
    if((/carousel|video|motion|reel/i.test(post.format)||['A','B','G'].includes(spec.route)) && !post.brief.slideCopy?.trim())issues.push('Add slide copy or a script to the brief');
    if(!post.brief.caption?.trim())issues.push('Add the working caption');
    return issues;
  }
  function configureProduction(post,data,actor) {
    const route=ROUTES[data.route];
    if(!route)throw Error('Select a supported route.');
    if(!data.producer || !data.qcReviewer || data.producer===data.qcReviewer)throw Error('Assign a producer and a different internal reviewer.');
    if(data.reviewDue<data.draftDue)throw Error('Review is due before the draft. Choose a later review date.');
    const spec={...post.brief.productionSpec,route:data.route,instructions:data.instructions,references:data.references,rights:data.rights,rightsExpiry:data.rightsExpiry,consent:data.consent,
      disclosure:data.disclosure,output:data.output,producer:data.producer,qcReviewer:data.qcReviewer,draftDue:data.draftDue,reviewDue:data.reviewDue};
    for(const key of ['placement','hook','acceptance','deliveryPackage','productionTimezone','deliveryDue'])if(key in data)spec[key]=data[key];
    const changed=C.saveBrief(post,{brief:{productionSpec:spec,...(!post.brief.approver&&data.approver?{approver:data.approver}:{})}},actor);
    if(!changed && post.production){
      if(post.production.backupOwner!==data.backupOwner){
        post.production.backupOwner=data.backupOwner||'';
        C.event(post,'Backup owner changed',post.production.backupOwner||'Unassigned',actor);
      }
      return;
    }
    post.production={route:data.route,qcReviewer:data.qcReviewer,producer:data.producer,backupOwner:data.backupOwner||'',draftDue:data.draftDue,reviewDue:data.reviewDue,
      startedRevision:null,checkpoints:{},tasks:route.steps.map((label,index)=>({id:C.id('task'),label,owner:label.startsWith('Approve')?post.brief.approver||data.qcReviewer:data.producer,due:data.draftDue,gate:label.startsWith('Approve'),done:false,position:index}))};
    C.event(post,'Production assigned',route.name+' · '+data.producer+' · QA: '+data.qcReviewer,actor);
  }
  function startProduction(p,actor,state) {
    const gaps=readiness(p);
    if(state && p.strategyVersionId && !calendarCoverage(state,p))gaps.push('Approve the current calendar scope before production');
    if(gaps.length)throw Error(gaps.join('. ')+'.');
    if(!p.production || p.production.startedRevision===p.briefRevision)throw Error('This route is already started or has no tasks.');
    p.production.startedRevision=p.briefRevision;C.event(p,'Production started','Brief revision '+p.briefRevision,actor);
  }
  function acceptBriefReadiness(state,p,actor){
    const coverage=calendarCoverage(state,p);if(!coverage)throw Error('Approve the current calendar scope before accepting the production brief.');
    const check=C.clone(p);check.planApproval={revision:p.briefRevision};const gaps=readiness(check);
    if(gaps.length)throw Error(gaps.join('. ')+'.');
    if(!p.production)throw Error('Assign production before accepting the brief.');
    if(p.planApproval?.revision===p.briefRevision)throw Error('This brief revision already has a readiness decision.');
    if(!p.planDecisions)p.planDecisions=p.planApproval?[C.clone(p.planApproval)]:[];
    p.planApproval={id:C.id('brief-readiness'),kind:'production-readiness',revision:p.briefRevision,actor,at:C.now(),sourceCalendarId:coverage.calendarId,sourceDecisionId:coverage.decision.id};
    p.planDecisions.push(C.clone(p.planApproval));
    C.event(p,'Production readiness accepted','Brief revision '+p.briefRevision+' · Calendar V'+coverage.number+' approved by '+coverage.decision.actor+'. Client creative approval remains separate.',actor);return p.planApproval;
  }
  function recordQcFailure(p, reviewer, note) {
    const v=C.latest(p);
    if(!v || v.state!=='draft' || v.internalFailure || v.briefRevision!==p.briefRevision)throw Error('Choose the current draft creative version.');
    if(!reviewer?.trim() || !note?.trim())throw Error('Name the reviewer and describe the required correction.');
    if(p.production && reviewer!==p.production.qcReviewer)throw Error('Internal QA is assigned to '+p.production.qcReviewer+'.');
    v.internalFailure={reviewer,note,at:C.now(),versionId:v.id,owner:p.production?.producer||p.brief.owner};
    C.event(p,'Internal correction requested','V'+v.number+' · '+note,reviewer);
  }
  function finishTask(p,id,actor,note='') {
    const pr=p.production;
    if(!pr || pr.startedRevision!==p.briefRevision)throw Error('Start production on the current brief first.');
    const task=pr.tasks.find(t=>!t.done);
    if(task?.id!==id)throw Error('Complete earlier production steps first.');
    if(task.gate && (!note.trim() || actor.trim()!==task.owner))throw Error('Record sign-off from '+task.owner+' with a version or artifact reference.');
    task.done=true;task.at=C.now();task.completedBy=actor;task.note=note;
    if(task.gate)pr.checkpoints[id]={actor,at:task.at,note,briefRevision:p.briefRevision};
    C.event(p,task.gate?'Intermediate approval':'Production task complete',task.label+(note?' · '+note:''),actor);
  }
  function dateToday(){return new Date().toLocaleDateString('sv-SE');}
  function boardLane(p) {
    const status=C.status(p);
    if(status==='approved')return 'Approved';
    if(status==='in-review')return 'In review';
    if(status==='changes-requested'||p.production?.startedRevision===p.briefRevision)return 'In production';
    return 'To brief';
  }
  const urlFor=(p,tab='workflow')=>'#content/'+encodeURIComponent(p.id)+'/'+tab;
  const human=value=>value?esc(value):'—';
  const labelFor=d=>d?.decision==='approved'?'Approved':d?.decision==='changes-requested'?'Changes requested':'Awaiting decision';
  const button=(label,action,id='',style='')=>'<button type="button" class="btn '+style+'" data-ops-action="'+action+'" data-ops-id="'+esc(id)+'">'+esc(label)+'</button>';
  const small=(label,action,id='')=>button(label,action,id,'small');
  const card=(title,description,body,actions='')=>'<section class="panel ops-panel"><div class="panel-head"><div><h2>'+esc(title)+'</h2>'+(description?'<p>'+esc(description)+'</p>':'')+'</div>'+actions+'</div><div class="panel-body">'+body+'</div></section>';
  const link=(p,tab,text)=>'<a class="link-btn" href="'+esc(urlFor(p,tab))+'">'+esc(text)+'</a>';
  const row=(title,subtitle,action='')=>'<div class="ops-row"><div><strong>'+esc(title)+'</strong><p>'+esc(subtitle)+'</p></div>'+action+'</div>';
  function field(name,label,value='',type='text',required=false){
    const attrs=' name="'+name+'"'+(required?' required':'');
    const control=type==='textarea'?'<textarea rows="3"'+attrs+'>'+esc(value)+'</textarea>':'<input'+attrs+' type="'+type+'" value="'+esc(value)+'" '+(type==='number'?'min="0" step="1"':'')+'>';
    return '<label class="'+(type==='textarea'?'full':'')+'">'+esc(label)+(required?' <span class="ops-field-required" aria-hidden="true">*</span>':'')+control+'</label>';
  }
  function select(name,label,options,value) {
    return '<label>'+esc(label)+'<select name="'+name+'">'+[...options,...(value&&!options.some(([key])=>key===value)?[[value,value+' (saved value)']]:[])].map(([key,text])=>'<option value="'+esc(key)+'" '+(key===value?'selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';
  }
  function lines(records,empty,make){return records.length?records.map(make).join(''):'<p class="ops-empty">'+esc(empty)+'</p>';}
  function versionList(ops,kind){
    const versions=ops[PLAN_TYPES[kind]]||[];
    return lines(versions.slice().reverse(),'No versions saved.',v=>{
      const review=ops.decisions.find(d=>d.targetId===v.id);
      return row(({foundation:'Client foundation',strategy:'Strategy',calendar:'Calendar'})[kind]+' V'+v.number+' · '+labelFor(review),kind==='foundation'?v.body.business:kind==='strategy'?v.body.objective:v.body.start+' – '+v.body.end+' · '+v.body.entries.length+' items',
        '<div class="actions">'+small('Inspect','inspect-'+kind,v.id)+(!review && v===versions.at(-1)?small('Review','decision-'+kind,v.id):'')+'</div>');
    });
  }
  let activePlanSection='foundation',boardFilter='all',mineOnly=false;
  function planView(ctx,ops,options={}) {
    if(options.section)activePlanSection=options.section;
    const sections=[['foundation','Client foundation'],['research','Research'],['strategy','Strategy & KPIs'],['calendar','Calendar approvals'],['history','Decisions & history']];
    const tabs='<nav class="ops-tabs" aria-label="Account planning">'+sections.map(([key,label])=>'<button type="button" data-ops-action="plan-tab" data-ops-id="'+key+'" aria-pressed="'+(key===activePlanSection)+'">'+label+'</button>').join('')+'</nav>';
    let body;
    if(activePlanSection==='foundation'){
      const f=ops.foundation;const brief=f.business?'<div class="ops-facts">'+[['Business & offers',f.business],['Audience',f.audience],['Service scope',f.scope],['90-day priorities',f.priorities],['Available media',f.media],['Brand book',f.brandBook],['Account access / outstanding inputs',f.access],['Responsible team',f.team],['Approval owner',f.finalApprover],['Community owner',f.communityOwner],['Weekly capacity',f.weeklyCapacity]].map(([name,value])=>'<div><small>'+esc(name)+'</small><p>'+human(value)+'</p></div>').join('')+'</div>':'<p>Capture the client’s scope, available media, delivery limits and named approvers.</p>';
      body=card('Client foundation',f.updatedAt?'Last saved by '+f.actor+' · '+f.updatedAt.slice(0,10):'',brief,button(f.business?'Edit intake':'Set up intake','foundation','','primary'));
      body+=card('Client confirmations','The named client confirms goals, scope and outstanding inputs against an exact intake version.',versionList(ops,'foundation'));
      body+=card('Campaigns','',lines(ops.campaigns,'Add the campaign objective and delivery window for upcoming work.',v=>row(v.title,v.objective+' · '+v.start+' – '+v.end)),small('Add campaign','campaign'));
    }else if(activePlanSection==='research'){
      body=options.watchlistsOnly?'':card('Research evidence','Keep observations and their source together.',lines(ops.sources.slice().reverse(),'No sources collected for this account.',s=>row(s.title,s.type+' · '+s.observed+' · '+s.observation,'<div class="actions">'+small('Inspect source','source-details',s.id)+small('Use as idea','source-idea',s.id)+'</div>')),button('Add evidence','source','','primary'));
      body+=card('Listening watchlists','Record coverage each time you review a source.',lines(ops.watchlists,'Create a watchlist for a competitor, brand or recurring audience question.',w=>row(w.title,w.reference+' · '+w.cadence,small('Record collection','collect',w.id))),small('Add watchlist','watchlist'));
      if(ops.runs.length)body+=card('Collection history','',ops.runs.slice().reverse().map(r=>row(r.watchTitle,r.at.slice(0,10)+' · '+r.coverage+' · '+r.gaps)).join(''));
    }else if(activePlanSection==='strategy'){
      body=card('Strategy and measurement agreement','Record a strategy version, then send its exact contents to the named client approver.',versionList(ops,'strategy'),button('Save strategy version','strategy','','primary'));
    }else if(activePlanSection==='calendar'){
      body=card('Calendar approvals','Approve purpose, angle, channel, format, date and KPI for this period. Production brief and final creative decisions are separate.',versionList(ops,'calendar'),button('Capture calendar version','calendar','','primary'));
      body+=card('Reserved trend slots','',lines(ops.slots,'Reserve capacity and choose an evergreen fallback for each opening.',s=>row(s.title,s.date+' · '+s.owner+' · Fallback: '+s.fallback,s.contentId?'<a class="link-btn" href="'+esc(urlFor({id:s.contentId},'brief'))+'">Open selected idea</a>':small('Select topic','convert-slot',s.id))),small('Reserve slot','slot'));
    }else{
      body=card('Planning decisions and history','',lines(ops.events.slice().reverse(),'Account planning actions will appear here.',v=>row(v.action,v.detail+' · '+v.actor+' · '+v.at.slice(0,10))));
    }
    return '<div class="ops-stack">'+(options.embedded?'':'<header class="ops-page-title"><h1>Strategy &amp; intake</h1></header>'+tabs)+body+'</div>';
  }
  function boardView(ctx) {
    const all=ctx.scoped(),lanes=['To brief','In production','In review','Approved'];
    const visible=all.filter(p=>boardFilter==='all'||p.production?.route===boardFilter);
    return '<section class="ops-board-wrap"><div class="ops-heading"><div><h1>Production board</h1><p>Open an item to assign its route, check its inputs and work through the batch.</p></div><label>Production route<select id="ops-route-filter">'+[['all','All routes'],...Object.entries(ROUTES).map(([key,v])=>[key,v.name])].map(([key,name])=>'<option value="'+key+'" '+(boardFilter===key?'selected':'')+'>'+name+'</option>').join('')+'</select></label></div><div class="ops-board">'+lanes.map(lane=>{
      const list=visible.filter(p=>boardLane(p)===lane);
      return '<section class="ops-lane"><header><h3>'+lane+'</h3><span>'+list.length+'</span></header>'+lines(list,'No items here.',p=>'<a class="ops-tile" href="'+esc(urlFor(p))+'"><small>'+esc(p.platform)+' · '+esc(p.format)+'</small><strong>'+esc(p.title)+'</strong><span>'+esc(p.production?.producer||p.brief.owner||'Unassigned')+' · '+esc(p.production?.draftDue||p.date||'Undated')+'</span>'+(p.production?'<small>'+esc(ROUTES[p.production.route]?.name)+' · '+p.production.tasks.filter(t=>t.done).length+'/'+p.production.tasks.length+' tasks</small>':'')+'</a>')+'</section>';
    }).join('')+'</div></section>';
  }
  function workflowView(ctx,p){
    const pr=p.production,gaps=readiness(p);
    const configured=pr && p.brief.productionSpec;
    const spec=p.brief.productionSpec||{};
    const started=pr?.startedRevision===p.briefRevision;
    const tasks=pr?.tasks || [], next=tasks.find(t=>!t.done);
    let body=card('Production route',configured?ROUTES[pr.route].name:'Assign a producer, a reviewer and the package this item needs.',configured?'<div class="ops-facts"><div><small>Producer</small><p>'+esc(pr.producer)+'</p></div><div><small>Internal reviewer</small><p>'+esc(pr.qcReviewer)+'</p></div><div><small>Draft due</small><p>'+esc(pr.draftDue)+'</p></div><div><small>Client review due</small><p>'+esc(pr.reviewDue)+'</p></div></div><p class="ops-notes">'+esc(spec.instructions)+'</p>':'',button(configured?'Edit production route':'Configure route','route',p.id,'primary'));
    if(p.strategyVersionId){const coverage=calendarCoverage(ctx.state,p);body+=card('Planning scope',coverage?'Calendar V'+coverage.number+' approved by '+coverage.decision.actor:'Calendar decision required','<p>'+ (coverage?'This item matches the approved calendar purpose, format, channel, date and KPI.':'Capture and approve a calendar version covering this item before starting production.')+'</p><p>Detailed copy, assets and production instructions are reviewed separately as brief revision '+p.briefRevision+'.</p>','<a class="link-btn" href="#plan/strategy">Open planning decisions</a>');if(!coverage)gaps.push('Approve the current calendar scope before production');}
    if(configured)body+=card('Production handoff','The exact brief revision stays with its tasks.', '<div class="ops-facts">'+[['Placement',spec.placement],['Hook',spec.hook],['Output specifications',spec.output],['Delivery package',spec.deliveryPackage],['Acceptance & review',spec.acceptance],['Delivery deadline',spec.deliveryDue],['Production timezone',spec.productionTimezone],['Source references',spec.references]].map(([k,v])=>'<div><small>'+esc(k)+'</small><p>'+human(v)+'</p></div>').join('')+'</div>');
    if(configured){
      const coverage=calendarCoverage(ctx.state,p),needsBrief=p.planApproval?.revision!==p.briefRevision;
      body+=card('Ready for production',started?'Working from brief revision '+p.briefRevision:'',gaps.length?'<ul class="ops-issues">'+gaps.map(g=>'<li>'+esc(g)+'</li>').join('')+'</ul><div class="actions">'+link(p,'brief','Edit brief & approval')+link(p,'requests','Manage inputs')+'</div>':'<p>The brief, permissions, timing and inputs are ready.</p>',!gaps.length&&!started?small('Start production','start',p.id):needsBrief&&coverage?small('Accept production brief','brief-ready',p.id):'');
      body+=card('Production tasks','Steps run in order. Intermediate decisions record the reviewer and artifact.',tasks.map(t=>row(t.label,(t.done?'Complete':'Open')+' · '+t.owner+' · '+t.due,'<div class="actions">'+(!t.done?small('Reassign or reschedule','edit-task',t.id):'')+(t===next && started?small(t.gate?'Record sign-off':'Complete step','task',t.id):'')+'</div>')).join(''),next?'':link(p,'versions','Submit creative for QA'));
    }
    if(p.requests.length)body+=card('Supplied media','Attach accepted files to the request that needs them.',p.requests.map(r=>row(r.title,r.state+' · '+(r.acceptedMedia?.name||r.owner),'<div class="actions">'+small('Attach input','supply',r.id)+(r.acceptedMedia?small('Download file','download-input',r.id)+small('Request correction','correct-input',r.id):'')+'</div>')).join(''));
    const draft=C.latest(p);
    if(draft?.state==='draft' && draft.briefRevision===p.briefRevision)body+=card('Internal quality review','Creative V'+draft.number,draft.internalFailure?'<p>Revision required · '+esc(draft.internalFailure.note)+' · '+esc(draft.internalFailure.reviewer)+'</p>':link(p,'versions','Open creative and complete QC'),draft.internalFailure?link(p,'versions','Upload corrected version'):small('Request internal fix','qc-failure',p.id));
    if(p.versions.length>=2)body+=card('Compare creative versions','Select any pair to compare ordered files and captions.','',small('Compare versions','compare',p.id));
    return '<div class="ops-stack">'+body+annotationsView(p)+'</div>';
  }
  function annotationsView(p){
    const notes=p.annotations || [];
    return card('Version feedback','Comments can refer to a slide, frame or video timecode.',lines(notes,'No annotations recorded.',a=>row('V'+a.number+' · '+a.location,a.note+' · '+a.actor+' · '+(a.resolved?'Resolved':'Open'),a.resolved?'':small('Resolve','resolve',a.id))),p.versions.length?small('Add annotation','annotate',p.id):'');
  }
  function historyView(p) {
    return card('Brief versions','Restore copies a previous snapshot into a new revision.',C.briefSnapshots(p).slice().reverse().map(v=>row('Brief V'+v.number+' · '+v.body.title,v.actor+(v.at?' · '+v.at.slice(0,10):''),
      '<div class="actions">'+small('Inspect','brief-details',String(v.number))+(v.number!==p.briefRevision?small('Restore as new','restore',String(v.number)):'')+'</div>')).join(''));
  }
  function queueFor(posts,day){
    const tasks=[];
    for(const p of posts){
      const pr=p.production;
      if(pr){
        const next=pr.tasks.find(t=>!t.done);
        if(next)tasks.push({id:next.id,title:next.label,owner:next.owner,backup:pr.backupOwner,due:next.due,p,tab:'workflow'});
        if(C.status(p)==='in-review')tasks.push({id:'review-'+p.id,title:'Client decision',owner:p.brief.approver,backup:pr.backupOwner,due:pr.reviewDue,p,tab:'versions'});
      }
      const failure=C.latest(p)?.internalFailure;
      if(failure)tasks.push({id:'qc-'+failure.versionId,title:'Correct creative: '+failure.note,owner:failure.owner,backup:pr?.backupOwner||'',due:pr?.draftDue||p.date,p,tab:'versions'});
      for(const r of p.requests.filter(r=>!['accepted','cancelled'].includes(r.state)))tasks.push({id:r.id,title:r.title,owner:r.owner,backup:pr?.backupOwner||'',due:r.due,p,tab:'requests'});
    }
    return tasks.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).map(t=>({...t,overdue:t.due && t.due<day}));
  }
  function todayView(ctx,ops){
    const identity=ctx.ui.actor.trim().toLocaleLowerCase();
    const tasks=queueFor(ctx.scoped(),dateToday()).filter(t=>!mineOnly || [t.owner,ops.exceptions.find(x=>x.key===t.id+':'+t.due)?.owner].some(name=>name?.trim().toLocaleLowerCase()===identity));
    const selector='<div class="ops-tabs" aria-label="Task assignment">'+[['account','Account work'],['mine','My work']].map(([key,label])=>'<button type="button" data-ops-action="scope-tasks" data-ops-id="'+key+'" aria-pressed="'+((key==='mine')===mineOnly)+'">'+label+'</button>').join('')+'</div>';
    return card('Assigned delivery work',tasks.length+' open · '+tasks.filter(t=>t.overdue).length+' overdue'+(mineOnly?' · '+ctx.ui.actor:''),lines(tasks,mineOnly?'No open tasks assigned to '+ctx.ui.actor+'.':'No pending production tasks or input requests.',t=>{
      const exc=ops.exceptions.find(x=>x.key===t.id+':'+t.due);
      return row(t.title+' · '+t.p.title,(t.overdue?'Overdue':'Due')+' '+(t.due||'date needed')+' · '+(exc?.owner||t.owner||'Unassigned')+(exc?' · '+exc.status:''),'<div class="actions">'+link(t.p,t.tab,'Open')+(t.overdue?small(exc?'Manage exception':'Escalate','exception',t.id):'')+'</div>');
    }),selector);
  }
  function reviewView(ctx,ops) {
    const pending=Object.keys(PLAN_TYPES).flatMap(kind=>{const version=ops[PLAN_TYPES[kind]]?.at(-1);return version&&!ops.decisions.some(d=>d.targetId===version.id)?[{kind,version}]:[];});
    return card('Planning decisions','',lines(pending,'No foundation, strategy or calendar versions awaiting a decision.',({kind,version})=>row(({foundation:'Client foundation',strategy:'Strategy',calendar:'Calendar'})[kind]+' V'+version.number,version.actor+' · '+version.at.slice(0,10),'<div class="actions">'+small('Inspect','inspect-'+kind,version.id)+small('Record decision','decision-'+kind,version.id)+'</div>')));
  }
  function view(ctx,section,options) {
    const ops=account(ctx.state,ctx.ui.brand);
    if(section==='plan')return planView(ctx,ops,options);
    if(section==='board')return boardView(ctx);
    if(section==='today')return todayView(ctx,ops);
    if(section==='review')return reviewView(ctx,ops);
    const p=ctx.post();
    if(!p || p.brandId!==ctx.ui.brand)return '';
    if(section==='workflow')return workflowView(ctx,p);
    if(section==='history')return historyView(p);
    return '';
  }
  let context=null, installed=false;
  const definitionList=body=>'<dl class="ops-document">'+Object.entries(body).map(([key,val])=>'<dt>'+esc(key.replace(/([a-z])([A-Z])/g,'$1 $2'))+'</dt><dd>'+(Array.isArray(val)?esc(val.map(v=>typeof v==='object'?Object.entries(v).map(([k,x])=>k+': '+x).join(' · '):v).join('\n')):typeof val==='object'&&val!==null?definitionList(val):human(val))+'</dd>').join('')+'</dl>';
  function openForm(title,action,id,fields,submit='Save'){
    context.showModal(esc(title),'<form data-ops-form="'+action+'" data-ops-id="'+esc(id)+'" data-ops-brand="'+esc(context.ui.brand)+'"><div class="modal-body"><div class="form-grid">'+fields+'</div><div class="form-error" data-ops-error role="alert"></div></div><div class="modal-actions">'+button('Cancel','dismiss')+'<button type="submit" class="btn primary">'+esc(submit)+'</button></div></form>');
  }
  function comparison(post, firstId, secondId){
    const versions=[firstId,secondId].map(id=>post.versions.find(v=>v.id===id));
    return '<div class="ops-comparison">'+versions.map(v=>'<section><h3>V'+v.number+'</h3><p>'+esc(v.creator)+' · '+esc(v.createdAt.slice(0,10))+' · Brief V'+v.briefRevision+'</p><p class="ops-notes">'+esc(v.caption)+'</p><ol>'+v.assets.map(a=>'<li>'+esc(a.name)+'<p>'+esc(a.alt)+'</p>'+(a.type==='image'?'<img loading="lazy" src="'+esc(root.JMLStorage?.mediaURL?.(a.url)||a.url)+'" alt="'+esc(a.alt||a.name)+'">':'<video src="'+esc(root.JMLStorage?.mediaURL?.(a.url)||a.url)+'" controls preload="metadata"></video>')+'</li>').join('')+'</ol></section>').join('')+'</div>';
  }
  const fullText=(name,label,value,req=false)=>field(name,label,value,'textarea',req);
  const todayDate=()=>dateToday();
  const asText=(entries,index=0)=>entries.map(v=>[v,v]);
  const foundationFields=[
    ['business','Business and priority offers'],['audience','Audience and customer needs'],['scope','Service scope and restrictions'],['priorities','90-day priorities or substitute brief'],
    ['brandBook','Brand book and approved references'],['media','Available media and permissions'],['access','Accounts, evidence access and missing inputs'],['team','Delivery roles, backup owners and escalation contacts']
  ];
  const strategyFields=[['objective','Business objective'],['audience','Audience and value proposition'],['channelRoles','Channel roles and cadence'],['pillars','Pillars and funnel stages'],
    ['kpi','Primary KPI'],['definition','Metric definition and denominator'],['source','Measurement source'],['baseline','Baseline or evidence gap'],['target','Agreed target, if available'],['window','Measurement window'],['cadence','Reporting cadence'],['growth','Discovery, growth experiments and community ownership']];
  function assertAction(action,id,state=context.state){
    const G=root.JMLGovernance;if(!G)return;
    if(['dismiss','scope-tasks','plan-tab'].includes(action))return;
    const {ui}=context,p=context.post(),record=p||{brandId:ui.brand};
    if(action.startsWith('inspect-')||['source-details','compare','brief-details','download-input'].includes(action)){
      if(!G.can(state,ui,'read',record)&&!(action.startsWith('inspect-')&&G.can(state,ui,'approve',{brandId:ui.brand})))throw Error('This record is not available to the selected person.');return;
    }
    let caps=['coordinate'];
    if(action==='brief-ready')caps=['readiness'];
    if(action.startsWith('decision-'))caps=['approve'];
    else if(['source','watchlist','collect'].includes(action))caps=['strategy','analyze'];
    else if(action==='strategy')caps=['strategy'];
    else if(action==='source-idea')caps=['strategy','coordinate'];
    else if(['start','task'].includes(action))caps=action==='task'&&p?.production?.tasks.find(t=>t.id===id)?.gate?['approve','qa']:['produce'];
    else if(action==='qc-failure')caps=['qa'];
    else if(action==='annotate')caps=['qa','approve','edit'];
    else if(['restore','resolve','supply'].includes(action))caps=['edit','qa'];
    const target=action.startsWith('decision-')?{brandId:ui.brand}:record;
    if(!caps.some(cap=>G.can(state,ui,cap,target)))throw Error('The selected person does not have authority for this action.');
  }
  function personField(name,label,value,functions){
    const G=root.JMLGovernance;if(!G)return field(name,label,value,'text',true);
    const people=G.eligiblePeople(context.state,context.ui.brand).filter(p=>!functions||functions.some(fn=>G.eligiblePeople(context.state,context.ui.brand,fn).some(x=>x.id===p.id)));
    return select(name,label,[['','Choose an assigned person'],...people.map(p=>[p.name,p.name])],value||'');
  }
  function showAction(action,id) {
    const {state,ui}=context,ops=account(state,ui.brand),post=context.post();
    assertAction(action,id);
    if(action==='dismiss'){context.closeModal();return;}
    if(action==='scope-tasks'){mineOnly=id==='mine';context.render();return;}
    if(action==='plan-tab'){activePlanSection=id;context.render();return;}
    if(action==='foundation'){
      const f=ops.foundation;
      openForm('Client foundation',action,id,foundationFields.map(([k,l])=>fullText(k,l,f[k],k==='business')).join('')+
        personField('finalApprover','Named client approver',f.finalApprover,['client'])+personField('communityOwner','Community owner',f.communityOwner)+
        field('weeklyCapacity','Planned content items per week',f.weeklyCapacity??'','number')+field('responseDue','Next input review',f.responseDue||'','date')+
        select('status','Intake readiness',asText(['In progress','Ready for client confirmation']),f.status||'In progress'));
    }else if(action==='strategy'){
      const last=ops.strategies.at(-1)?.body||{};
      if(!ops.foundation.business || !ops.foundation.finalApprover)throw Error('Complete the client foundation and name the final approver first.');
      openForm('Save strategy version',action,id,strategyFields.map(([k,l])=>field(k,l,last[k]||'', ['objective','channelRoles','pillars','growth','definition'].includes(k)?'textarea':'text',!['target','baseline','growth'].includes(k))).join(''),'Save reviewable version');
    }else if(action==='calendar'){
      const start=ui.anchor||todayDate();
      openForm('Capture calendar version',action,id,field('start','Period starts',start,'date',true)+field('end','Period ends',C.addDays(start,29),'date',true),'Capture current plan');
    }else if(action.startsWith('decision-')){
      const kind=action.slice(9),v=ops[PLAN_TYPES[kind]].find(v=>v.id===id);
      if(!v)throw Error('Version is unavailable.');
      openForm('Review '+kind+' V'+v.number,action,id,'<div class="full ops-inspect">'+definitionList(v.body)+'</div>'+field('actor','Decision owner',ops.foundation.finalApprover||ui.actor,'text',true)+select('outcome','Decision',asText(['approved','changes-requested']),'approved')+fullText('note','Feedback or approval note',''),'Record decision');
    }else if(action.startsWith('inspect-')){
      const kind=action.slice(8),v=ops[PLAN_TYPES[kind]].find(v=>v.id===id);
      if(!v)throw Error('Version is unavailable.');
      const review=ops.decisions.find(d=>d.targetId===v.id);
      context.showModal(({foundation:'Client foundation',strategy:'Strategy',calendar:'Calendar'})[kind]+' V'+v.number,'<div class="modal-body"><h3>'+labelFor(review)+'</h3>'+(review?'<p>'+esc(review.actor)+' · '+esc(review.at)+' · '+esc(review.note)+'</p>':'')+definitionList(v.body)+'</div>');
    }else if(action==='source-details'){
      const source=ops.sources.find(s=>s.id===id);
      if(!source)throw Error('This evidence is unavailable.');
      const sourceLink=/^https?:\/\//i.test(source.reference)?'<p><a href="'+esc(source.reference)+'" target="_blank" rel="noopener noreferrer">Open original source</a></p>':'';
      context.showModal('Research evidence','<div class="modal-body"><h3>'+esc(source.title)+'</h3>'+definitionList(source)+sourceLink+'</div>');
    }else if(action==='source'){
      openForm('Research evidence',action,id,field('title','Evidence title','','text',true)+select('type','Evidence type',asText(['Verified observation','Hypothesis','Creative reference']),'Verified observation')+
        field('reference','Source URL or original file reference','','text',true)+field('observed','Observation date',todayDate(),'date',true)+fullText('observation','Finding and audience relevance','',true)+field('rights','Usage or coverage limits')+
        select('confidence','Confidence',asText(['Unassessed','Low','Medium','High']),'Unassessed'));
    }else if(action==='watchlist'){
      openForm('New listening watchlist',action,id,field('title','Brand, topic or competitor','','text',true)+field('reference','Sources to check','','text',true)+field('owner','Collection owner',ui.actor,'text',true)+select('cadence','Review cadence',asText(['Weekly','Monthly','Daily']),'Weekly'));
    }else if(action==='collect'){
      openForm('Record collection run',action,id,fullText('coverage','Sources reviewed and period covered','',true)+fullText('gaps','Coverage limits','')+field('signal','New signal or audience question')+field('reference','Original source for signal')+field('observed','Observation date',todayDate(),'date',true));
    }else if(action==='campaign'){
      openForm('New campaign',action,id,field('title','Campaign name','','text',true)+fullText('objective','Business objective','',true)+field('owner','Campaign owner',ui.actor,'text',true)+field('start','Starts',todayDate(),'date',true)+field('end','Ends',C.addDays(todayDate(),29),'date',true));
    }else if(action==='slot'){
      openForm('Reserve a trend slot',action,id,field('title','Slot name','','text',true)+field('owner','Selection owner',ui.actor,'text',true)+field('date','Planned date',todayDate(),'date',true)+field('selectionDue','Choose topic by',todayDate(),'date',true)+field('fallback','Evergreen alternative','','text',true));
    }else if(action==='convert-slot'||action==='source-idea'){
      const item=(action==='convert-slot'?ops.slots:ops.sources).find(s=>s.id===id);
      if(!item)throw Error('Source record is unavailable.');
      openForm(action==='convert-slot'?'Select a topic':'Create a sourced idea',action,id,field('title','Proposed content title',item.title,'text',true)+field('owner','Content owner',item.owner||ui.actor,'text',true)+field('platform','Platform','Instagram','text',true)+field('date','Proposed date',item.date||'','date'),'Create draft');
    }else if(action==='route'){
      if(post?.id!==id)throw Error('Select the content item again.');
      const pr=post.production||{},sp=post.brief.productionSpec||{},route=pr.route||(/video|reel/i.test(post.format)?'B':'S');
      openForm('Configure production route',action,id,select('route','Route',Object.entries(ROUTES).map(([k,v])=>[k,k+' · '+v.name]),route)+
        personField('producer','Producer',pr.producer||post.brief.owner,['copy','design'])+personField('qcReviewer','Internal QC reviewer',pr.qcReviewer,['creative'])+field('backupOwner','Backup owner',pr.backupOwner)+
        field('draftDue','Draft due',pr.draftDue||post.date||todayDate(),'date',true)+field('reviewDue','Review due',pr.reviewDue||post.date||todayDate(),'date',true)+
        fullText('instructions',ROUTES[route].field,sp.instructions,true)+fullText('references','Source assets and approved references',sp.references,true)+fullText('rights','Rights, consent scope and source',sp.rights,true)+
        field('rightsExpiry','Permission expires, if applicable',sp.rightsExpiry,'date')+field('output','Format, sizes and required exports',sp.output,'text',true)+field('consent','People, releases and usage limits',sp.consent)+fullText('disclosure','AI tool, model, human checks and disclosure',sp.disclosure,route==='G')+
        field('placement','Channel and placement',sp.placement||post.platform)+fullText('hook','Opening hook / message',sp.hook||post.brief.direction)+fullText('deliveryPackage','Delivery package: exports, editable source, cover and caption',sp.deliveryPackage)+fullText('acceptance','Acceptance criteria and review instructions',sp.acceptance)+field('deliveryDue','Final package due',sp.deliveryDue||post.date,'date')+field('productionTimezone','Production timezone',sp.productionTimezone||post.timezone),'Save route and brief revision');
    }else if(action==='compare'){
      const opts=post.versions.map(v=>[v.id,'V'+v.number+' · '+v.createdAt.slice(0,10)]);
      const first=opts.at(-2)[0],second=opts.at(-1)[0];
      context.showModal('Compare creative versions','<div class="modal-body" id="ops-compare"><div class="form-grid">'+select('firstVersion','Earlier version',opts,first)+select('secondVersion','Comparison version',opts,second)+'</div><div id="ops-comparison-body">'+comparison(post,first,second)+'</div></div>');
    }else if(action==='edit-task'){
      const task=post?.production?.tasks.find(t=>t.id===id && !t.done);
      if(!task)throw Error('An open production task is required.');
      openForm('Update '+task.label,action,id,field('owner','Task owner',task.owner,'text',true)+field('due','Due date',task.due,'date',true)+fullText('note','Reason for change','',true),'Update assignment');
    }else if(action==='task'){
      const task=post?.production?.tasks.find(t=>t.id===id);
      if(!task)throw Error('Production task is unavailable.');
      openForm(task.label,action,id,field('actor',task.gate?'Assigned approver':'Completed by',task.owner||ui.actor,'text',true)+fullText('note',task.gate?'Version or artifact approved':'Completion notes','',task.gate),task.gate?'Record sign-off':'Complete task');
    }else if(action==='start'){
      if(!post || post.id!==id)throw Error('Choose the content item again.');
      return context.commit(next=>startProduction(scopedPost(next,id,ui.brand),ui.actor,next),'Production started.');
    }else if(action==='brief-ready'){
      return context.commit(next=>acceptBriefReadiness(next,scopedPost(next,id,ui.brand),ui.actor),'Production brief accepted.');
    }else if(action==='qc-failure'){
      openForm('Request internal correction',action,id,field('reviewer','Internal reviewer',post.production?.qcReviewer||ui.actor,'text',true)+fullText('note','What must change before client review?','',true),'Return for correction');
    }else if(action==='annotate'){
      openForm('Add version feedback',action,id,select('versionId','Creative version',post.versions.map(v=>[v.id,'V'+v.number+' · '+v.createdAt.slice(0,10)]),C.latest(post).id)+field('location','Slide, timecode or field','Whole package','text',true)+fullText('note','Feedback','',true));
    }else if(action==='resolve'){
      const notes=post.annotations||[];
      const annotation=notes.find(a=>a.id===id);
      if(!annotation)throw Error('Feedback is unavailable.');
      openForm('Resolve feedback',action,id,select('versionId','Resolution version',post.versions.map(v=>[v.id,'V'+v.number]),C.latest(post).id)+fullText('note','What changed?','',true),'Record resolution');
    }else if(action==='brief-details'||action==='restore'){
      const version=C.briefSnapshots(post).find(v=>v.number===Number(id));
      if(!version)throw Error('This snapshot is unavailable.');
      const preview='<div class="full ops-inspect">'+definitionList(version.body)+'</div>';
      if(action==='restore')openForm('Restore brief V'+version.number,action,id,preview,'Save as a new revision');
      else context.showModal('Brief V'+version.number,'<div class="modal-body">'+preview+'</div>');
    }else if(action==='download-input'){
      const r=post.requests.find(r=>r.id===id),file=r?.supplies?.find(s=>s.id===r.acceptedMedia?.id);
      if(!file)throw Error('The accepted input is unavailable.');
      const bytes=Uint8Array.from(atob(file.bytes),c=>c.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
      const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }else if(action==='correct-input'){
      openForm('Request input correction',action,id,fullText('note','What must be corrected?','',true),'Return to input owner');
    }else if(action==='supply'){
      const req=post.requests.find(r=>r.id===id);
      if(!req)throw Error('Media request is unavailable.');
      openForm('Accept supplied input',action,id,field('source','Original file reference','','text',true)+field('rights','Permission or licence reference','','text',true)+'<label class="full">Original input file<input type="file" name="media" required></label>'+fullText('note','Acceptance notes','',true),'Accept and link input');
    }else if(action==='exception'){
      const task=queueFor(context.scoped(),todayDate()).find(t=>t.id===id);
      if(!task)throw Error('This task is no longer open.');
      const old=ops.exceptions.find(x=>x.key===task.id+':'+task.due);
      openForm('Delivery exception',action,id,field('owner','Follow-up owner',old?.owner||task.backup||task.owner,'text',true)+select('status','Exception state',asText(['Escalated','Acknowledged','Resolved']),old?.status||'Escalated')+fullText('note','Follow-up and revised timing',old?.note||'',true));
    }
  }
  function scopedPost(state,id,brandId){
    const p=state.posts.find(x=>x.id===id && x.brandId===brandId);
    if(!p)throw Error('This content is unavailable in the active account.');
    return p;
  }
  function acceptFile(file){
    if(!file || !file.size || file.size>12*1024*1024)throw Error('Choose an input file up to 12 MB.');
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(Error('The selected input could not be read.'));
      reader.onload=()=>resolve({id:C.id('input'),name:file.name,size:file.size,mime:file.type||'application/octet-stream',bytes:String(reader.result).split(',')[1]});
      reader.readAsDataURL(file);
    });
  }
  async function saveForm(form) {
    const kind=form.dataset.opsForm,id=form.dataset.opsId,brandId=form.dataset.opsBrand;
    const f=Object.fromEntries(new FormData(form));
    Object.keys(f).forEach(k=>{if(typeof f[k]==='string')f[k]=f[k].trim();});
    const {ui}=context,postId=context.post()?.id,actor=ui.actor;
    if(brandId!==ui.brand)throw Error('The active account changed. Reopen this form.');
    assertAction(kind,id);
    if(root.JMLGovernance){if('actor' in f)f.actor=ui.actor;if('reviewer' in f)f.reviewer=ui.actor;}
    const attached=kind==='supply'?await acceptFile(f.media):null;
    const sourceIdea=['convert-slot','source-idea'].includes(kind);
    let opened='';
    await context.commit(next=>{
      const ops=account(next,brandId,true), p=postId?scopedPost(next,postId,brandId):null;
      assertAction(kind,id,next);
      if(kind==='foundation'){
        if(!f.business || !f.finalApprover || !f.communityOwner)throw Error('Enter the business, final approver and community owner.');
        if(root.JMLGovernance&&!root.JMLGovernance.eligiblePeople(next,brandId,'client').some(p=>p.name===f.finalApprover))throw Error('Choose an active named client approver for this account.');
        if(!['In progress','Ready for client confirmation'].includes(f.status))throw Error('Choose an intake readiness state. Client confirmation is a separate decision.');
        const before=C.clone(ops.foundation);ops.foundation={...f,actor,updatedAt:C.now()};
        snapshot(ops,'foundation',ops.foundation,actor);record(ops,actor,'Client foundation saved',f.status);Object.assign(ops.events.at(-1),{before,after:C.clone(ops.foundation)});
      }else if(kind==='strategy'){
        const version=snapshot(ops,kind,f,actor,{foundation:C.clone(ops.foundation),sourceIds:ops.sources.map(s=>s.id)});
        if(!version.body.kpi || !version.body.definition)throw Error('Define the KPI and its measurement method.');
      }else if(kind==='calendar'){
        snapshot(ops,'calendar',calendarPackage(next,brandId,f),actor);
      }else if(kind.startsWith('decision-')){
        const type=kind.slice(9);
        if(type==='calendar' && f.outcome==='approved'){
          const version=ops.calendars.find(v=>v.id===id);
          if(!version || JSON.stringify(calendarPackage(next,brandId,version.body))!==JSON.stringify(version.body))throw Error('The strategy, calendar or reserved slots changed. Capture a fresh calendar version.');
        }
        decision(ops,type,id,f.outcome,f.actor,f.note);
      }else if(kind==='source'||kind==='watchlist'||kind==='campaign'||kind==='slot'){
        if(kind==='campaign' && f.end<f.start)throw Error('Choose an end date on or after the campaign start.');
        if(kind==='campaign' && ops.campaigns.some(c=>c.title.trim().toLocaleLowerCase()===f.title.trim().toLocaleLowerCase()))throw Error('This account already has a campaign with that name.');
        if(kind==='slot' && f.selectionDue>f.date)throw Error('Selection must happen by the planned date.');
        const collection={source:'sources',watchlist:'watchlists',campaign:'campaigns',slot:'slots'}[kind];
        if(!f.title)throw Error('Enter a title.');
        ops[collection].push({...f,id:C.id(kind),at:C.now(),actor});record(ops,actor,'Added '+kind,f.title);
      }else if(kind==='collect'){
        const w=ops.watchlists.find(x=>x.id===id);
        if(!w)throw Error('Watchlist is unavailable.');
        if(f.signal && !f.reference)throw Error('Add the original reference for your signal.');
        ops.runs.push({id:C.id('run'),watchId:id,watchTitle:w.title,at:C.now(),actor,...f});
        if(f.signal && !ops.sources.some(s=>s.watchId===id && s.observation===f.signal && s.reference===f.reference && s.observed===f.observed)){
          ops.sources.push({id:C.id('source'),watchId:id,title:f.signal,observation:f.signal,reference:f.reference,observed:f.observed,type:'Verified observation',confidence:'Unassessed',rights:'',actor,at:C.now()});
        }
        record(ops,actor,'Listening collection',w.title);
      }else if(sourceIdea){
        const item=(kind==='convert-slot'?ops.slots:ops.sources).find(s=>s.id===id);
        if(!item)throw Error('The source was removed.');
        if(kind==='convert-slot' && item.contentId)throw Error('This slot already has an idea.');
        const recordId=C.id('content');
        const content=C.makePost({...f,id:recordId,brandId,timezone:next.brands.find(b=>b.id===brandId).timezone,source:(kind==='convert-slot'?'Selected trend slot':'Research evidence')+' · '+item.title,sources:item.reference?[item.reference]:[],example:brandId==='demo'});
        content.planningSourceId=item.id;root.JMLBriefTemplate?.adopt(next,content);next.posts.push(content);if(kind==='convert-slot')item.contentId=content.id;
        record(ops,actor,'Created linked draft',content.title);opened=content.id;
      }else if(kind==='route'){
        if(f.route==='G' && !f.disclosure)throw Error('Record your AI-use and disclosure plan.');
        configureProduction(scopedPost(next,id,brandId),{...f,approver:ops.foundation.finalApprover},actor);
        if(root.JMLGovernance){for(const [kind,name,due] of [['production',f.producer,f.draftDue],['qa',f.qcReviewer,f.reviewDue]]){const person=root.JMLGovernance.eligiblePeople(next,brandId).find(p=>p.name===name);if(!person)throw Error('Choose a person with an active account membership.');root.JMLGovernance.assign(next,ui,{brandId,contentId:id,kind,personId:person.id,due});}}
      }else if(kind==='task')finishTask(p,id,f.actor,f.note);
      else if(kind==='edit-task'){
        const task=p.production.tasks.find(t=>t.id===id && !t.done);
        if(!task)throw Error('Choose an open production task.');
        C.event(p,'Production assignment updated',task.label+' · '+task.owner+' '+task.due+' → '+f.owner+' '+f.due+' · '+f.note,actor);
        task.owner=f.owner;task.due=f.due;
      }
      else if(kind==='qc-failure')recordQcFailure(scopedPost(next,id,brandId),f.reviewer,f.note);
      else if(kind==='annotate'){
        const v=p.versions.find(v=>v.id===f.versionId);
        if(!v)throw Error('Creative version is unavailable.');
        (p.annotations ||= []).push({...f,id:C.id('annotation'),number:v.number,at:C.now(),actor,resolved:false});
        C.event(p,'Feedback added','V'+v.number+' · '+f.location+' · '+f.note,actor);
      }else if(kind==='resolve'){
        const a=p.annotations.find(a=>a.id===id);if(!a||a.resolved || !p.versions.some(v=>v.id===f.versionId))throw Error('This feedback or resolution version is unavailable.');
        a.resolved={versionId:f.versionId,at:C.now(),actor,note:f.note};C.event(p,'Feedback resolved',a.location+' · '+f.note,actor);
      }else if(kind==='restore')C.restoreBrief(p,Number(id),actor);
      else if(kind==='correct-input'){
        const r=p.requests.find(r=>r.id===id);if(!r?.acceptedMedia)throw Error('This input has no accepted file.');
        (r.corrections ||= []).push({fileId:r.acceptedMedia.id,note:f.note,at:C.now(),actor});
        r.state='requested';r.note=f.note;delete r.acceptedMedia;
        C.event(p,'Input correction requested',r.title+' · '+f.note,actor);
      }else if(kind==='supply'){
        const r=p.requests.find(r=>r.id===id);
        if(!r)throw Error('Media request is unavailable.');
        const media={...attached,source:f.source,rights:f.rights,note:f.note,at:C.now(),actor};
        (r.supplies ||= []).push(media);r.acceptedMedia={id:media.id,name:media.name};r.note=f.note;r.state='accepted';
        C.event(p,'Input accepted',r.title+' · '+media.name,actor);
      }else if(kind==='exception'){
        const task=queueFor(next.posts.filter(p=>p.brandId===brandId),todayDate()).find(t=>t.id===id);
        if(!task)throw Error('This delivery exception no longer applies.');
        const key=task.id+':'+task.due;
        let ex=ops.exceptions.find(x=>x.key===key);
        if(!ex){ex={key,taskId:task.id,events:[]};ops.exceptions.push(ex);}
        Object.assign(ex,f);ex.events.push({...f,at:C.now(),actor});record(ops,actor,'Delivery exception '+f.status,task.title+' · '+f.note);
      }
    },sourceIdea?'Draft created.':'Saved to this account.');
    if(opened)context.navigate(urlFor({id:opened},'brief'));
  }
  function mount(ctx) {
    context=ctx;
    if(installed)return;
    installed=true;
    document.addEventListener('click',async ev=>{
      const target=ev.target.closest('[data-ops-action]');
      if(!target || target.disabled)return;
      ev.preventDefault();
      try{await showAction(target.dataset.opsAction,target.dataset.opsId||'');}
      catch(error){context.toast(error.message);}
    });
    document.addEventListener('change',ev=>{
      if(ev.target.closest('#ops-compare')){
        const panel=document.querySelector('#ops-compare');
        const first=panel.querySelector('[name="firstVersion"]').value,second=panel.querySelector('[name="secondVersion"]').value;
        panel.querySelector('#ops-comparison-body').innerHTML=comparison(context.post(),first,second);
      }
      if(ev.target.id==='ops-route-filter'){boardFilter=ev.target.value;context.render();}
      const form=ev.target.closest('[data-ops-form="route"]');
      if(form && ev.target.name==='route'){
        const instructions=form.elements.instructions;
        instructions.parentElement.firstChild.textContent=ROUTES[ev.target.value].field+' ';
        form.elements.disclosure.required=ev.target.value==='G';
      }
    });
    document.addEventListener('submit',async ev=>{
      if(!ev.target.matches('[data-ops-form]'))return;
      ev.preventDefault();ev.stopImmediatePropagation();
      const button=ev.submitter;if(button)button.disabled=true;
      try{await saveForm(ev.target);}
      catch(error){const message=ev.target.querySelector('[data-ops-error]');message.textContent=error.message;message.tabIndex=-1;message.focus();}
      finally{if(button?.isConnected)button.disabled=false;}
    },true);
  }
  function validate(state) {
    const fail=message=>{throw Error('Invalid operations backup: '+message);};
    function rows(value,keys,context){
      if(!Array.isArray(value)||value.length>20000)fail(context);
      const ids=new Set();
      for(const row of value){
        if(!row || keys.some(k=>typeof row[k]!=='string'))fail(context);
        if(keys.includes('id') && (!row.id || ids.has(row.id)))fail(context+' IDs');
        ids.add(row.id);
      }
    }
    const postIds=new Map(state.posts.map(p=>[p.id,p.brandId]));
    const fields={sources:['id','title','reference','type','observation','observed'],watchlists:['id','title','reference','cadence','owner'],runs:['id','watchId','watchTitle','coverage','gaps','at'],
      strategies:['id','at','actor'],calendars:['id','at','actor'],decisions:['id','targetId','decision','kind','actor','at','note'],
      campaigns:['id','title','owner','objective','start','end'],slots:['id','title','owner','date','fallback','selectionDue'],events:['id','at','actor','action','detail'],exceptions:['key','owner','status','taskId']};
    for(const b of state.brands){
      const ops=b.operations;if(ops===undefined)continue;
      if(!ops || !ops.foundation || typeof ops.foundation!=='object'||Array.isArray(ops.foundation))fail(b.id+' foundation');
      for(const [key,required] of Object.entries(fields))rows(ops[key],required,key);
      if(ops.foundationVersions!==undefined){rows(ops.foundationVersions,['id','at','actor'],'foundation versions');for(const v of ops.foundationVersions)if(!Number.isInteger(v.number)||!v.body||typeof v.body.business!=='string'||typeof v.body.finalApprover!=='string')fail('foundation version');}
      for(const v of ops.strategies)if(!v.body || typeof v.body.objective!=='string'||!Number.isInteger(v.number))fail('strategy version');
      for(const v of ops.calendars){
        if(!v.body || !Array.isArray(v.body.entries)||!Number.isInteger(v.number)||!ops.strategies.some(s=>s.id===v.body.strategyVersionId))fail('calendar version');
        if(v.body.entries.some(p=>postIds.get(p.contentId)!==b.id))fail('calendar account reference');
      }
      for(const d of ops.decisions)if(!PLAN_TYPES[d.kind] || !ops[PLAN_TYPES[d.kind]]?.some(v=>v.id===d.targetId) || !['approved','changes-requested'].includes(d.decision))fail('decision target');
      for(const s of ops.slots)if(s.contentId && postIds.get(s.contentId)!==b.id)fail('selected slot');
      for(const r of ops.runs)if(!ops.watchlists.some(w=>w.id===r.watchId))fail('collection source');
    }
    for(const p of state.posts){
      if(p.briefVersions){
        const numbers=new Set();
        if(!Array.isArray(p.briefVersions))fail('brief revisions');
        for(const v of p.briefVersions){
          if(!Number.isInteger(v.number)||v.number<1||v.number>p.briefRevision||numbers.has(v.number)||!v.body?.brief)fail('brief revision');
          if(['title','platform','format','date','time','timezone'].some(k=>typeof v.body[k]!=='string'))fail('brief revision content');
          if(['objective','audience','cta','owner','approver','direction','slideCopy','caption','pillar','campaign'].some(k=>typeof v.body.brief[k]!=='string'))fail('brief fields');
          numbers.add(v.number);
        }
      }
      if(p.production){
        if(!Object.hasOwn(ROUTES,p.production.route))fail('production route');
        rows(p.production.tasks,['id','label','owner','due'],'production tasks');
        if(!p.production.tasks.length || p.production.tasks.some(t=>typeof t.done!=='boolean'||typeof t.gate!=='boolean'))fail('production task state');
      }
      if(p.planDecisions){
        rows(p.planDecisions,['actor','at'],'brief approval history');
        if(p.planDecisions.some(d=>!Number.isInteger(d.revision)||d.revision>p.briefRevision||d.revision<1))fail('brief approval revision');
      }
      if(p.annotations){
        rows(p.annotations,['id','versionId','location','note','actor','at'],'feedback');
        if(p.annotations.some(a=>!p.versions.some(v=>v.id===a.versionId)))fail('feedback target');
      }
      for(const req of p.requests){
        if(req.supplies){
          rows(req.supplies,['id','name','bytes','source','rights','note'],'supplied media');
          if(req.supplies.some(s=>!Number.isInteger(s.size)||s.size<=0||s.size>12*1024*1024||s.bytes.length!==4*Math.ceil(s.size/3)))fail('supplied file');
          if(req.acceptedMedia && !req.supplies.some(s=>s.id===req.acceptedMedia.id))fail('accepted file');
        }
      }
    }
    return state;
  }
  const api={view,mount,validate,account,snapshot,decision,calendarPackage,calendarScope,calendarCoverage,readiness,configureProduction,startProduction,acceptBriefReadiness,recordQcFailure,finishTask,queueFor,ROUTES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.JMLOps=api;
})(typeof window!=='undefined'?window:globalThis);
