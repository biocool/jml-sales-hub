/* Publishing and learning views for the shared local workspace. */
(function (root) {
  'use strict';
  const D=root.JMLReleaseDomain,U=root.JMLWorkflowUI;
  let ctx,installed=false,lastBrand=null,learnTab='Results',queueFilter='All',evidenceFilter='',pending=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brand=()=>ctx.ui.brand, actor=()=>ctx.ui.actor;
  const can=(cap,record)=>!root.JMLGovernance||root.JMLGovernance.can(ctx.state,ctx.ui,cap,record);
  const allow=(cap,record)=>root.JMLGovernance?.assert(ctx.state,ctx.ui,cap,record);
  const publisher=p=>p.ownerPersonId?p.ownerPersonId===ctx.ui.personId:p.owner===actor();
  const communityOwner=p=>p.communityOwnerPersonId?p.communityOwnerPersonId===ctx.ui.personId:p.communityOwner===actor();
  const items=k=>D.read(ctx.state)[k].filter(v=>v.brandId===brand());
  const currentBrand=()=>ctx.state.brands.find(b=>b.id===brand());
  const today=()=>ctx.C.localDate(currentBrand().timezone);
  const number=v=>v===null?'Unknown':Number(v).toLocaleString();
  const action=(name,label,key='',style='')=>'<button type="button" class="btn '+style+'" data-rl="'+esc(name)+'" data-key="'+esc(key)+'">'+esc(label)+'</button>';
  const badge=(text,style='')=>'<span class="rl-badge '+style+'">'+esc(text)+'</span>';
  const option=(v,t=v,selected=false)=>'<option value="'+esc(v)+'" '+(selected?'selected':'')+'>'+esc(t)+'</option>';
  const input=(label,name,value='',type='text',required=true)=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?'required':'')+(type==='number'?' step="any"':'')+'></label>';
  const area=(label,name,value='',required=true)=>'<label class="full">'+esc(label)+'<textarea rows="3" name="'+name+'" '+(required?'required':'')+'>'+esc(value)+'</textarea></label>';
  const select=(label,name,pairs,current,required=true)=>'<label>'+esc(label)+'<select name="'+name+'" '+(required?'required':'')+'>'+[...pairs,...(current&&!pairs.some(x=>(Array.isArray(x)?x[0]:x)===current)?[[current,current+' (saved value)']]:[])].map(x=>Array.isArray(x)?option(x[0],x[1],x[0]===current):option(x,x,x===current)).join('')+'</select></label>';
  const check=(label,name,required=false)=>'<label class="rl-check full"><input name="'+name+'" type="checkbox" '+(required?'required':'')+'>'+esc(label)+'</label>';
  const panel=(title,body,extra='')=>'<section class="rl-panel"><header><h2>'+esc(title)+'</h2>'+extra+'</header>'+body+'</section>';
  const empty=(title,content)=>'<div class="rl-empty"><strong>'+esc(title)+'</strong><p>'+esc(content)+'</p></div>';
  const meta=s=>'<p class="rl-meta">'+esc(s)+'</p>';
  const summaryRow=(title,sub,controls='',tag='')=>'<article class="rl-row"><div>'+tag+'<h3>'+esc(title)+'</h3>'+meta(sub)+'</div><div class="rl-controls">'+controls+'</div></article>';
  const utcDisplay=v=>new Date(v).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC';
  const timeField=(label,name,v)=>input(label+' · UTC',name,v?(v.length===10?v+'T09:00':new Date(v).toISOString().slice(0,16)):'','datetime-local');
  const utc=v=>v?v+':00Z':'';
  const modeText=p=>p.mode==='simulation'?'Simulation':'Manual';
  const kindText=v=>v==='fixture'?'Sample data':'Recorded evidence';
  const stateName={ready:'Ready',failed:'Failed','handed-off':'Handed off',uncertain:'Delivery unknown',scheduled:'Schedule confirmed',verified:'Verified',cancelled:'Cancelled','cancel-pending':'Cancellation pending'};
  function getStrategy(){
    const ops=currentBrand()?.operations||{};
    return (ops.strategies||[]).slice().reverse().find(s=>(ops.decisions||[]).filter(d=>d.kind==='strategy'&&d.targetId===s.id).at(-1)?.decision==='approved')?.body||{};
  }
  function form(title,name,fields,submit,key='',intro=''){
    ctx.showModal(esc(title),'<form data-rl-form="'+name+'" data-key="'+esc(key)+'" data-brand="'+esc(brand())+'"><div class="modal-body rl-form">'+(intro?'<p>'+esc(intro)+'</p>':'')+'<div class="form-grid">'+fields+'</div><p class="rl-error" role="alert"></p></div><div class="modal-actions"><button type="button" class="btn" data-action="close">Cancel</button><button type="submit" class="btn primary">'+esc(submit)+'</button></div></form>');
  }
  function show(title,body){ctx.showModal(esc(title),'<div class="modal-body rl-dialog">'+body+'</div>');}
  function download(value,name,type='application/json'){
    const u=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));
    const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);
  }
  function choices(list){return [...new Set(list.filter(Boolean))];}
  function asAttributes(label,cmd,values,selected){
    return '<label class="rl-select">'+esc(label)+'<select data-rl-change="'+cmd+'">'+values.map(x=>option(x,x,x===selected)).join('')+'</select></label>';
  }
  function contentName(id){return ctx.state.posts.find(p=>p.brandId===brand()&&p.id===id)?.title||id;}
  function contentLink(id){return '<a href="#content/'+encodeURIComponent(id)+'/versions">Open creative</a>';}
  function record(k,id){return D.entry(ctx.state,k,brand(),id);}
  function historyRows(events){
    return events.length?'<ol class="rl-timeline">'+events.slice().reverse().map(r=>'<li><strong>'+esc(r.type||r.outcome||r.decision)+'</strong><small>'+esc(utcDisplay(r.at)+' · '+r.actor)+'</small><p>'+esc(r.note||r.receipt||'')+'</p></li>').join('')+'</ol>':meta('No activity yet.');
  }
  function emit(s,msg){
    const b=brand(),who=actor();return ctx.commit(n=>{s(n,b,who);D.validate(n);},msg);
  }
  function publishView(){
    const posts=ctx.scoped(),approved=posts.filter(ctx.C.isApproved),placements=items('placements').filter(p=>can('coordinate',p)||publisher(p)||communityOwner(p)).slice().reverse();
    const needing=placements.filter(p=>['uncertain','failed','cancel-pending'].includes(p.state)||(!['verified','cancelled'].includes(p.state)&&D.preflight(ctx.state,p).length));
    const scopes=['All','Ready','In progress','Needs attention','Verified'];
    const visible=placements.filter(p=>queueFilter==='All'||queueFilter==='Ready'&&p.state==='ready'||queueFilter==='Needs attention'&&needing.includes(p)||queueFilter==='Verified'&&p.state==='verified'||queueFilter==='In progress'&&['scheduled','handed-off','uncertain','cancel-pending'].includes(p.state));
    const paused=D.read(ctx.state).pauses.filter(r=>r.active&&(r.scope==='workspace'||r.brandId===brand()));
    const status=paused.length?'<div class="rl-message">'+esc(paused.map(r=>r.scope+' pause'+(r.target?' · '+r.target:'')).join(' / '))+'</div>':'';
    const list=visible.map(p=>{
      const stale=!['verified','cancelled'].includes(p.state)&&!D.currentPackage(ctx.state,p);
      return summaryRow(contentName(p.contentId),p.platform+' · '+p.account+' · '+utcDisplay(p.scheduledAt),action('placement','Open placement',p.id),badge(modeText(p))+' '+badge(stale?'Approval changed':stateName[p.state],stale||needing.includes(p)?'warning':''));
    }).join('');
    return ctx.heading('Delivery','Publishing desk','Prepare approved packages and track each destination through verification.',can('coordinate')||can('publish')?action('new-placement','Prepare placement','','primary'):'')+
      status+'<div class="rl-stats">'+[ [approved.length,'Approved creatives'],[placements.filter(p=>p.state==='ready').length,'Ready placements'],[needing.length,'Need attention'],[placements.filter(p=>p.state==='verified').length,'Verified receipts'] ].map(x=>'<div><b>'+x[0]+'</b><span>'+x[1]+'</span></div>').join('')+'</div>'+
      panel('Release queue',list||empty('No placements in this queue',approved.length?'Prepare a placement from an approved creative.':'When creative approval is recorded, the package becomes available here.'),asAttributes('Show','queue',scopes,queueFilter))+
      panel('Approved creative packages',approved.length?approved.map(p=>summaryRow(p.title,p.platform+' · '+p.format+' · Version '+ctx.C.latest(p).number,(can('coordinate',p)||can('publish',p)?action('new-placement','Prepare placement',p.id):'')+contentLink(p.id))).join(''):empty('No approved packages','Open Review to check the current creative version.'))+
      (D.legacyCandidates(ctx.state,brand()).placements.length?panel('Earlier publishing records',D.legacyCandidates(ctx.state,brand()).placements.map(p=>summaryRow(p.title,p.publishing.state+' · '+p.publishing.date,action('legacy-placement','Bring into desk',p.id))).join('')):'')+
      (can('coordinate')?panel('Release controls',meta('A pause stops local release requests. Confirm cancellation for any schedule already accepted.'),action('pause','Manage pauses')):'');
  }
  function placementForm(id){
    const posts=ctx.scoped().filter(ctx.C.isApproved);if(!posts.length){ctx.toast('Approve a current creative version in Review first.');return;}
    const p=posts.find(v=>v.id===id)||posts[0];
    if(!can('coordinate',p))allow('publish',p);
    const platformAccount=currentBrand().name;
    const people=root.JMLGovernance?.eligiblePeople(ctx.state,brand(),'publish')||[],community=root.JMLGovernance?.eligiblePeople(ctx.state,brand())||[];
    const assigned=ctx.state.governance?.assignments.find(a=>a.brandId===brand()&&a.contentId===p.id&&a.kind==='publish'&&a.state!=='superseded');
    const defaultPublisher=assigned?.personId||(people.some(x=>x.id===ctx.ui.personId)?ctx.ui.personId:people.find(x=>!x.agencyAdmin)?.id||people[0]?.id);
    form('Prepare a placement','new-placement',select('Approved creative','contentId',posts.map(v=>[v.id,v.title+' · V'+ctx.C.latest(v).number]),p.id)+
      input('Destination platform','platform',p.platform)+input('Destination account','account',platformAccount)+select('Delivery method','mode',p.example||brand()==='demo'?[['simulation','Simulation']]:[['manual','Manual handoff'],['simulation','Simulation']])+
      input('Output format','format',p.format)+input('Planned local date and time','scheduledLocal',D.briefSchedule(p).local,'datetime-local')+input('Destination time zone','timezone',p.timezone||'UTC')+
      '<p class="full" data-placement-timing role="status"></p><div class="full" data-timing-change hidden>'+check('Approval covers this timing change from the creative brief.','timingChangeApproved')+'</div>'+
      (people.length?select('Assigned publisher','ownerPersonId',people.map(x=>[x.id,x.name]),defaultPublisher):input('Publisher','owner',actor()))+
      (community.length?select('Community handoff owner','communityOwnerPersonId',community.map(x=>[x.id,x.name]),community.find(x=>x.name===p.brief.approver)?.id):input('Community handoff owner','communityOwner',p.brief.approver||actor()))+
      input('Permission expiry (if applicable)','rightsUntil',p.brief.productionSpec?.rightsExpiry||'','date',false)+area('Finishing instructions, links and tags','nativeNotes','',false)+
      check('Release approval covers this destination and the selected creative and caption.','scopeApproved',true),'Save placement','','The saved package keeps the approved creative version and its assets in order.');
    updatePlacementTiming(document.querySelector('[data-rl-form="new-placement"]'));
  }
  function updatePlacementTiming(form,reset=false){
    if(!form)return;
    const post=ctx.scoped().find(p=>p.id===form.elements.contentId.value),f=Object.fromEntries(new FormData(form));
    const note=form.querySelector('[data-placement-timing]'),change=form.querySelector('[data-timing-change]'),approval=form.elements.timingChangeApproved;
    if(reset){approval.checked=false;form.elements.scopeApproved.checked=false;}
    try{
      const schedule=D.placementSchedule(post,f);
      note.textContent='Planned publication: '+f.scheduledLocal.replace('T',' at ')+' · '+f.timezone+' ('+utcDisplay(schedule.instant)+'). '+(schedule.changed?'Changed from creative brief: '+(schedule.approved.local.replace('T',' at ')||'no time set')+' · '+schedule.approved.timezone+'. Confirm approval for the new timing.':'Matches the creative brief timing.');
      change.hidden=!schedule.changed;approval.required=schedule.changed;
    }catch(error){note.textContent=error.message;change.hidden=true;approval.required=false;}
  }
  function placementDetail(id){
    const p=record('placements',id),v=ctx.state.posts.find(x=>x.id===p.contentId)?.versions.find(x=>x.id===p.versionId);
    const issues=['verified','cancelled'].includes(p.state)?[]:D.preflight(ctx.state,p);
    if(!can('coordinate',p)&&!publisher(p)&&!communityOwner(p))throw Error('This release is assigned to another person.');
    const editable=can('publish',p)&&publisher(p),h=p.handoff;
    let tools=action('manifest','Download manifest',id)+(h&&D.currentPackage(ctx.state,p)&&(editable||can('coordinate',p))?action('bundle','Download approved files (ZIP)',id):'');
    if(editable&&!p.receipt&&!['cancelled','verified'].includes(p.state)&&!issues.length)tools+=action('receive-package','Accept approved package',id,'primary');
    if(editable&&['ready','failed'].includes(p.state)&&!issues.length&&(!h||p.receipt))tools+=action('release-step',p.mode==='manual'?'Record handoff':'Simulate schedule',id+'|schedule','primary');
    if(editable&&p.state==='uncertain')tools+=action('release-step','Reconcile attempt',id+'|reconcile','primary');
    if(editable&&['handed-off','scheduled'].includes(p.state)&&D.currentPackage(ctx.state,p))tools+=action('release-step','Verify publication',id+'|verify','primary');
    if(editable&&(!['verified','cancelled','cancel-pending'].includes(p.state)||p.state==='cancel-pending'&&p.mode==='simulation'))tools+=action('release-step','Cancel placement',id+'|cancel');
    if(editable&&p.state==='cancel-pending'&&p.mode==='manual')tools+=action('release-step','Confirm cancellation',id+'|confirm-cancel');
    if(can('coordinate',p)&&!['cancelled','verified'].includes(p.state))tools+=action('placement-pause',D.read(ctx.state).pauses.some(r=>r.scope==='placement'&&r.target===id&&r.active)?'Resume placement':'Pause placement',id);
    if(p.state==='verified'&&communityOwner(p)&&!p.communityReceipt)tools+=action('receive-community','Accept community handoff',id,'primary');
    const assets=(h?.assets||v.assets).map((a,i)=>'<figure>'+(a.type==='video'?'<video controls preload="metadata" src="'+esc(root.JMLStorage.mediaURL(a.url))+'"></video>':'<img loading="lazy" src="'+esc(root.JMLStorage.mediaURL(a.url))+'" alt="'+esc(a.alt||a.name)+'">')+'<figcaption>'+esc((i+1)+'. '+a.name)+(h?.files?.[i]?'<small>SHA-256 '+esc(h.files[i].sha256)+'</small>':'')+'</figcaption></figure>').join('');
    const detail= '<div class="rl-controls">'+badge(modeText(p))+badge(stateName[p.state])+'</div><h3>'+esc(contentName(p.contentId))+'</h3>'+
      '<dl class="rl-grid">'+[['Destination',p.platform+' / '+p.account],['Planned',new Date(p.scheduledAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:p.timezone})+' · '+p.timezone],['Package','Creative V'+v.number+' · brief r'+p.briefRevision],['Release approver',p.approval.actor],['Publisher',p.owner],['Community handoff',p.communityOwner]].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>'+
      (h?'<p class="rl-handoff">'+esc(h.sender+' → '+h.recipient)+'<br><small>'+esc('Client approval '+h.decisionId+' · '+utcDisplay(h.decision.at))+'</small></p>':'')+
      '<h3>Exact approved caption</h3><pre class="rl-caption">'+esc(h?.caption||v.caption)+'</pre>'+(assets?'<h3>Approved files in release order</h3><div class="rl-assets">'+assets+'</div>':meta('Text-only release. The caption is the complete creative.'))+
      (p.receipt?meta('Publisher accepted · '+p.receipt.actor+' · '+utcDisplay(p.receipt.at)):meta('Waiting for '+p.owner+' to accept this exact package.'))+
      (p.communityReceipt?meta('Community handoff accepted · '+p.communityReceipt.actor+' · '+utcDisplay(p.communityReceipt.at)):'')+
      (p.nativeNotes?'<p>'+esc(p.nativeNotes)+'</p>':'')+(issues.length?'<div class="rl-message">'+esc(issues.join(' '))+'</div>':'')+
      (p.verification?'<p>Verified by '+esc(p.verification.actor)+' · '+esc(utcDisplay(p.verification.actualAt))+'<br>'+esc(p.verification.url||p.verification.note)+'</p>':'')+
      '<div class="rl-controls">'+tools+'</div><h3>Release history</h3>'+historyRows(p.attempts);
    show('Release placement',detail);
  }
  function stepForm(key){
    const [id,op]=key.split('|'),p=record('placements',id);
    allow('publish',p);if(!publisher(p))throw Error('Only the assigned publisher can operate this placement.');
    const titles={schedule:p.mode==='manual'?'Record manual handoff':'Simulate scheduling',cancel:'Cancel placement','confirm-cancel':'Confirm external cancellation',verify:p.mode==='manual'?'Verify live publication':'Verify simulated publication',reconcile:'Reconcile uncertain delivery'};
    let fields='';
    if(op==='schedule'){
      if(p.mode==='simulation')fields+=select('Simulated response','scenario',[['accept','Accepted'],['reject','Definitive rejection'],['timeout','Accepted, response timed out']]);
      fields+=check('I checked the account, approved files, caption, links, timing and native finishing tasks.','checked',true);
    }
    if(op==='cancel'&&p.mode==='simulation'&&['scheduled','uncertain','cancel-pending'].includes(p.state))fields+=select('Simulated response','scenario',[['accept','Cancellation confirmed'],['reject','Cancellation unconfirmed']]);
    if(op==='confirm-cancel')fields+=check('I checked the external account and confirmed cancellation.','checked',true);
    if(op==='verify'){
      if(p.mode==='manual')fields+=input('Live HTTPS post','url','','url')+timeField('Actual publication time','actualAt',new Date().toISOString())+area('Verification evidence','note');
      fields+=check('The destination, approved version and caption match.','checked',true);
    }
    form(titles[op],'release-step',fields,titles[op],key,contentName(p.contentId)+' · '+p.account+' · '+modeText(p));
  }
  function pauses(){
    const r=D.read(ctx.state).pauses;
    function toggle(scope,target,label){const active=r.some(v=>v.scope===scope&&v.target===target&&v.active&&(scope==='workspace'||v.brandId===brand()));return summaryRow(label,active?'Paused':'Releases allowed',action('toggle-pause',active?'Resume':'Pause',JSON.stringify([scope,target])));}
    show('Release pauses',meta('Existing external schedules still require cancellation confirmation.')+toggle('workspace','','All agency accounts')+toggle('brand','',currentBrand().name)+choices(items('placements').map(p=>p.account)).map(a=>toggle('destination',a,a)).join(''));
  }
  const fields=['account','source','metric','definition','unit','value','start','end','collectedAt','timezone','segment','aggregation','origin','contentId','placementId'];
  function defaults(origin){return D.observationDefaults(ctx.state,brand(),origin);}
  const evidenceOptions=()=>brand()==='demo'||currentBrand().example?[["fixture","Sample data"]]:[["recorded","Recorded data"],["fixture","Sample data"]];
  function defaultEvidenceOrigin(){return ctx.state.demoData?.accounts?.[brand()]?.groups?.learn&&!items('observations').some(o=>!o.supersededBy&&o.origin==='recorded')?'fixture':defaults().origin;}
  function evidenceRows(){const origin=evidenceFilter||defaultEvidenceOrigin();return items('observations').filter(o=>!o.supersededBy&&o.origin===origin);}
  function evidenceTable(rows){return rows.length?'<div class="table-wrap"><table><thead><tr><th>Metric</th><th>Account &amp; source</th><th>Window</th><th>Value</th></tr></thead><tbody>'+rows.map(o=>'<tr><td>'+esc(o.metric)+'<small>'+esc(o.definition)+'</small></td><td>'+esc(o.account)+'<small>'+esc(o.source+' · '+o.segment+' · '+o.aggregation)+'</small></td><td>'+esc(o.start)+'<small>through '+esc(o.end)+'</small></td><td>'+esc(number(o.value))+'<small>'+esc(o.unit)+'</small></td></tr>').join('')+'</tbody></table></div>':empty('No observations for this selection','Enter an observation, import a local export or load labeled sample data.');}
  function filteredEvidence(){
    const ui=ctx.ui, posts=new Map(ctx.scoped().map(p=>[p.id,p]));
    return evidenceRows().filter(o=>{
      const p=posts.get(o.contentId);
      return (!ui.learnAccount||o.account===ui.learnAccount)&&(!ui.learnMetric||o.metric===ui.learnMetric)&&(!ui.learnFrom||o.start>=ui.learnFrom)&&(!ui.learnTo||o.end<=ui.learnTo)&&(!ui.learnCampaign||p?.brief.campaign===ui.learnCampaign)&&(!ui.learnFormat||p?.format===ui.learnFormat)&&(!ui.learnObjective||p?.brief.objective===ui.learnObjective);
    });
  }
  function seriesSummary(rows){
    const grouped=new Map();
    for(const o of rows){
      const key=JSON.stringify([o.account,o.contentId,o.placementId,o.source,o.metric,o.unit,o.definition,o.segment,o.aggregation,o.timezone]);
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push(o);
    }
    const group=[...grouped.values()].sort((a,b)=>b.length-a.length)[0];
    if(!group?.length)return '';
    const ordered=group.slice().sort((a,b)=>b.end.localeCompare(a.end)).slice(0,6).reverse();
    if(ordered.length<2)return '';
    const max=Math.max(1,...ordered.map(o=>Math.abs(o.value||0)));
    return '<div class="rl-spark"><h3>'+esc(group[0].metric+' · '+group[0].account)+'</h3>'+meta(group[0].definition+' · '+group[0].source)+ordered.map(o=>'<div class="rl-spark-row"><span>'+esc(o.end)+'</span><div aria-hidden="true"><i style="width:'+Math.min(100,100*Math.abs(o.value||0)/max)+'%"></i></div><b>'+esc(number(o.value))+'</b></div>').join('')+'</div>';
  }
  function resultView(){
    const obs=evidenceRows(),rows=filteredEvidence(),accountFilter=ctx.ui.learnAccount||'',metricFilter=ctx.ui.learnMetric||'',from=ctx.ui.learnFrom||'',to=ctx.ui.learnTo||'';
    const filter=(label,name,values,current)=>'<label class="rl-select">'+label+'<select data-rl-change="'+name+'">'+option('','All')+values.map(v=>option(v,v,v===current)).join('')+'</select></label>';
    const batches=items('batches').slice().reverse(),s=getStrategy();
    return U.lead('What did the content achieve?','Record a placement once. Save its source counts together and calculate the agreed KPI automatically.',can('analyze')?action('measure-batch','Record results','','primary'):'')+savedResults()+(s.kpi?panel('Agreed measure',summaryRow(s.kpi,[s.definition,s.baseline&&'Baseline '+s.baseline,s.window,s.source].filter(Boolean).join(' · '))):'')+
      panel('Performance evidence',
        '<div class="rl-filters">'+asAttributes('Evidence','origin',['Recorded','Sample'],(evidenceFilter||defaultEvidenceOrigin())==='fixture'?'Sample':'Recorded')+
        filter('Destination','account',choices(obs.map(o=>o.account)),accountFilter)+filter('Metric','metric',choices(obs.map(o=>o.metric)),metricFilter)+
        '<label>From<input type="date" data-rl-change="from" value="'+esc(from)+'"></label><label>Through<input type="date" data-rl-change="to" value="'+esc(to)+'"></label></div>'+
        (obs.some(o=>o.contentId)?'<details class="rl-pad"><summary>Content filters</summary><div class="rl-filters">'+
          filter('Campaign','campaign',choices(ctx.scoped().map(p=>p.brief.campaign)),ctx.ui.learnCampaign)+filter('Objective','objective',choices(ctx.scoped().map(p=>p.brief.objective)),ctx.ui.learnObjective)+filter('Format','format',choices(ctx.scoped().map(p=>p.format)),ctx.ui.learnFormat)+'</div></details>':'')+
        seriesSummary(rows)+evidenceTable(rows.slice().reverse())+
        (rows.length?'<div class="rl-pad">'+meta(rows.length+' source observations · '+rows.filter(o=>o.value===null).length+' unknown values')+action('compare','Compare observations')+' '+action('rate','Calculate rate')+' '+action('export-evidence','Export evidence')+'</div>':''),
        '<div class="rl-controls">'+action('observe','Single measure')+action('import','Import file')+'</div>')+
      (D.legacyCandidates(ctx.state,brand()).metrics.length?panel('Earlier post observations',meta('Bring '+D.legacyCandidates(ctx.state,brand()).metrics.length+' saved post records into the shared evidence register.'),action('legacy-metrics','Bring in observations')):'')+
      U.optional('Evidence imports and sample data',panel('Evidence imports',batches.length?batches.map(b=>summaryRow(b.name,utcDisplay(b.at)+' · '+b.actor+' · '+b.count+' saved / '+b.duplicates+' duplicates / '+b.overlaps+' overlapping windows')).join(''):meta('Import history appears here after the first file or manual entry.'),action('fixture','Load sample evidence')));
  }
  function workList(){
    const list=items('work').filter(w=>can('coordinate',w)||can('analyze',w)||can('strategy',w)||(w.ownerPersonId?w.ownerPersonId===ctx.ui.personId:w.owner===actor())).slice().reverse();
    return proposalList()+panel('Growth and decisions',list.length?list.map(w=>summaryRow(w.title,w.owner+' · review '+w.due,action('work-item','Open',w.id),badge(w.kind)+' '+badge(w.status)+(w.origin==='fixture'?' '+badge('Sample data'):''))).join(''):empty('Start a growth decision','Record a finding, audience opportunity, experiment, watchlist, collaboration or community case.'),action('work-type','Add record','','primary'));
  }
  function resultText(c){return c.result===null?'Unavailable':c.result.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})+' '+c.definition.unit;}
  function savedResults(){
    const rows=items('calculations').slice().reverse();
    return panel('Measured outcomes',rows.length?'<div class="outcome-list">'+rows.map(c=>'<article class="outcome-row"><div>'+badge(kindText(c.origin))+'<h3>'+esc(c.definition.title)+'</h3><p class="task-outcome">'+esc(resultText(c))+'</p><p>'+esc(c.account+' · '+c.start+' – '+c.end)+'</p>'+meta(c.unavailable||(c.delta===null?'Baseline comparison unavailable':(c.delta>=0?'+':'')+c.delta.toFixed(1)+' versus baseline'))+'</div><div class="actions">'+action('calculation','Inspect result',c.id)+' '+(can('analyze')||can('coordinate')?action('report-from-result','Draft report',c.id):'')+'</div></article>').join('')+'</div>':empty('Turn evidence into the next test','Record a placement’s counts to calculate its agreed KPI, then draft a report.'),can('analyze')?action('calculate-kpi','Calculate from existing evidence'):'');
  }
  function kpiForm(){
    allow('analyze');
    const definitions=currentBrand().operations?.kpis||[],obs=evidenceRows();
    if(!definitions.length){ctx.toast('Save a KPI definition in Research & strategy first.');return;}
    if(!obs.length){ctx.toast('Add source observations first. Unknown and zero values can be recorded.');return;}
    form('Save a measured outcome','calculate-kpi',select('KPI definition and version','definitionId',definitions.map(d=>[d.id,d.title+' · v'+d.version]),getStrategy().kpiDefinitionId||definitions.at(-1).id)+select('Measure','numeratorId',[])+select('Compare with','denominatorId',[],'',false)+'<p class="full" data-kpi-guidance role="status"></p>','Save result','','Only matching measures, units, periods and evidence types are offered. Saved results keep this definition and these source values.');
    updateKpiChoices(document.querySelector('[data-rl-form="calculate-kpi"]'));
  }
  function updateKpiChoices(form){
    const f=form.elements,definition=currentBrand().operations.kpis.find(d=>d.id===f.definitionId.value);
    const choices=D.compatibleObservations(ctx.state,brand(),definition.id,evidenceFilter||defaultEvidenceOrigin(),f.numeratorId.value);
    const update=(select,rows)=>{const previous=select.value;select.innerHTML=rows.length?rows.map(o=>option(o.id,o.metric+' · '+number(o.value)+' '+o.unit+' · '+o.account+' · '+o.source+' · '+o.start+'–'+o.end)).join(''):option('','No compatible observations');if(rows.some(o=>o.id===previous))select.value=previous;};
    update(f.numeratorId,choices.primary);update(f.denominatorId,choices.comparison);
    f.numeratorId.parentElement.firstChild.textContent='Measure: '+definition.numerator+' ';
    f.denominatorId.parentElement.firstChild.textContent='Compare with: '+definition.denominator+' ';
    f.denominatorId.parentElement.hidden=!definition.denominator;f.denominatorId.required=!!definition.denominator;
    const ready=choices.primary.length&&(!definition.denominator||choices.comparison.length);
    form.querySelector('[type="submit"]').disabled=!ready;
    form.querySelector('[data-kpi-guidance]').textContent=ready?'Matching source observations are ready. Unknown values remain unknown.':'Add '+definition.numerator+(definition.denominator?' and '+definition.denominator:'')+' observations with the same source, account, content, distribution and '+definition.window+' window before saving this result.';
  }
  function calculationDetail(id){
    const c=record('calculations',id),base=c.baseline||{};
    show(c.definition.title,'<div class="rl-controls">'+badge(kindText(c.origin))+badge('Definition v'+c.definition.version)+'</div><h3 class="task-outcome">'+esc(resultText(c))+'</h3>'+meta(c.unavailable||'Formula: '+number(c.numerator.value)+(c.denominator?' ÷ '+number(c.denominator.value)+' × '+c.scale:''))+
      '<dl class="rl-grid">'+[['Baseline',c.baselineValue===null?'Not established':number(c.baselineValue)+' '+c.definition.unit],['Difference',c.delta===null?'Not comparable':(c.delta>=0?'+':'')+c.delta.toFixed(2)],['Baseline source',base.source||'Not recorded'],['Baseline scope',[base.window,base.sampleSize&&'n='+base.sampleSize,base.distribution].filter(Boolean).join(' · ')||'Not recorded']].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>'+evidenceTable([c.numerator,...(c.denominator?[c.denominator]:[])])+meta('Saved by '+c.actor+' · '+utcDisplay(c.createdAt))+
      meta(c.comparisonNote||'')+action('report-from-result','Draft report from this result',id,'primary')+((can('strategy')||can('coordinate'))?action('propose-next','Propose the next test',id,'primary'):'')+action('calculation-export','Export result',id));
  }
  function proposalList(){
    const rows=items('proposals').slice().reverse();
    return panel('Next-plan proposals',rows.length?rows.map(p=>summaryRow(p.title,p.kind+' · '+p.owner+' · review '+p.due,action('proposal','Review proposal',p.id),badge(p.status))).join(''):meta('Proposals made from a saved outcome appear here. Accepting one creates a draft or a planning request; approvals stay with their original versions.'));
  }
  function proposalDetail(id){
    const p=record('proposals',id),c=record('calculations',p.calculationId);
    const reviewer=p.ownerPersonId?p.ownerPersonId===ctx.ui.personId:p.owner===actor();
    show('Next-plan proposal',badge(p.status)+'<h3>'+esc(p.title)+'</h3><p>'+esc(p.detail)+'</p>'+meta(p.kind+' · '+p.owner+' · review '+p.due)+summaryRow(c.definition.title,resultText(c),action('calculation','Inspect source evidence',c.id))+
      (p.status==='Proposed'&&reviewer&&(can('strategy')||can('coordinate'))?action('proposal-decision','Record decision',p.id,'primary'):'')+(p.targetId&&p.kind==='content'?contentLink(p.targetId):'')+historyRows(p.decisions));
  }
  function reports(){
    const list=items('reports').filter(r=>can('coordinate',r)||can('analyze',r)||r.reviewer===actor()).slice().reverse();
    return panel('Reporting periods',list.length?list.map(r=>summaryRow(r.title,r.start+' – '+r.end+' · V'+r.version+' · '+kindText(r.origin),action('report-item','Open snapshot',r.id),badge(r.status))).join(''):empty('No report snapshots yet','Choose a period to freeze its records, findings and decisions.'),action('new-report','Create report','','primary'));
  }
  function learnView(){
    return ctx.heading('Performance and growth','Results & learning','Review sourced results, run growth experiments and prepare client reports.')+
      '<div class="rl-tabs" aria-label="Learning sections">'+['Results','Growth','Reports'].map(t=>'<button type="button" data-rl="learn-tab" data-key="'+t+'" aria-pressed="'+(learnTab===t)+'">'+t+'</button>').join('')+'</div>'+
      (learnTab==='Results'?resultView():learnTab==='Growth'?workList():reports());
  }
  function measurementForm(placementId=''){
    const placements=items('placements').filter(p=>p.state==='verified');
    if(!placements.length){ctx.toast('Verify a release first, or use Single measure for account-level evidence.');return;}
    const p=placements.find(p=>p.id===placementId)||placements.at(-1),post=ctx.scoped().find(x=>x.id===p.contentId),definition=currentBrand().operations?.kpis?.find(k=>k.id===post?.measurementDefinitionId);
    const day=ctx.C.localDate(p.timezone,p.verification?.actualAt||p.scheduledAt),days=Number(definition?.window?.match(/^(\d+)[ -]?day/i)?.[1]||7),end=ctx.C.addDays(day,days-1),primary=[...new Set([definition?.numerator,definition?.denominator,'views','saves','clicks'].filter(Boolean))];
    const count=(key)=>input(D.rawMeasures[key].label,'value-'+key,'','number',false).replace('<input ','<input '+(key==='netfollowers'?'':'min="0" ')+'placeholder="Unknown" ');
    // Render the complete form once with the selected placement's inherited values.
    form('Record placement results','measure-batch',
      U.section('Placement and reporting period','One source covers the counts below.',select('Placement','placementId',placements.map(p=>[p.id,contentName(p.contentId)+' · '+p.account+' · '+modeText(p)]),p.id)+input('Period start','start',day,'date')+input('Period end','end',end,'date')+input('Source export or evidence reference','source',p.mode==='simulation'?'Local sample data':''))+
      U.summary(p.mode==='simulation'?'Sample data':'Recorded performance',p.account+' · '+p.timezone+' · '+(definition?definition.title+' will be calculated from these counts.':'No agreed KPI is linked; the source counts will still be saved.'))+
      U.section('Measured values','Blank means unknown. Enter 0 only when the measured value is zero.','<div class="measurement-values full">'+primary.map(count).join('')+'</div>')+
      U.optional('Other measures and collection details','<div class="measurement-values full">'+Object.keys(D.rawMeasures).filter(k=>!primary.includes(k)).map(count).join('')+'</div>'+input('Collected on','collectedAt',p.mode==='simulation'&&today()<end?end:today(),'date')+select('Distribution','segment',['organic','paid','mixed'],(definition?.distribution||'Organic').toLowerCase())+select('Aggregation','aggregation',['period','lifetime'],'period')+check('Save corrected values as a new evidence revision.','replace')),
      'Save counts and calculate KPI','','The source observations and calculated result are saved together. Future reporting dates are not proof of measured results.');
    document.querySelector('[data-rl-form="measure-batch"]').dataset.primary=JSON.stringify(primary);
  }
  function manualObservation(){
    const d=defaults(evidenceFilter||defaultEvidenceOrigin()),posts=ctx.scoped(),key=Object.keys(D.rawMeasures).find(k=>D.rawMeasures[k].label===d.metric);
    const rawField=(label,name,value)=>input(label,name,value).replace('<input ','<input data-no-presets readonly ');
    form('Record an observation','observe',
      select('Data mode','origin',evidenceOptions(),d.origin)+'<p class="full" data-observation-mode role="status"></p>'+select('Raw measure','rawMeasure',[...Object.entries(D.rawMeasures).map(([key,m])=>[key,m.label]),['custom','Custom raw measure']],key)+
      input('Destination account','account',d.account)+input('Source reference','source',d.source)+rawField('Metric label','metric',d.metric)+rawField('Definition','definition',d.definition)+rawField('Unit','unit',d.unit)+input('Value (leave blank for unknown)','value','','number',false)+
      input('Period start','start',d.start,'date')+input('Period end','end',d.end,'date')+input('Collected','collectedAt',d.collectedAt,'date')+input('Time zone','timezone',d.timezone)+
      select('Distribution','segment',['organic','paid','mixed'],d.segment)+select('Aggregation','aggregation',['period','lifetime'])+
      select('Content scope','contentId',[['','Account-level observation'],...posts.map(p=>[p.id,p.title])],'',false)+select('Placement (optional)','placementId',[['','No placement'],...items('placements').map(p=>[p.id,p.account+' · '+contentName(p.contentId)])],'',false)+
      check('Save changed values as new evidence revisions.','replace'),'Save observation','','Enter platform counts here. Calculate rates and KPIs from these observations using Save KPI result. Date defaults use '+d.timezone+'.');
    updateObservationForm(document.querySelector('[data-rl-form="observe"]'),'rawMeasure');
  }
  function updateObservationForm(form,changed){
    const f=form.elements,measure=D.rawMeasures[f.rawMeasure.value];
    if(changed==='rawMeasure')for(const key of ['metric','definition','unit']){f[key].readOnly=!!measure;f[key].value=measure?(key==='metric'?measure.label:measure[key]):'';}
    if(changed==='placementId'&&f.placementId.value){const p=record('placements',f.placementId.value);f.account.value=p.account;f.contentId.value=p.contentId;f.timezone.value=p.timezone;if(p.mode==='simulation'){f.origin.value='fixture';changed='origin';}}
    if(changed==='contentId'&&ctx.scoped().find(p=>p.id===f.contentId.value)?.example){f.origin.value='fixture';changed='origin';}
    if(changed==='origin')f.source.value=f.origin.value==='fixture'?'Local sample data':'';
    form.querySelector('[data-observation-mode]').textContent=f.origin.value==='fixture'?'Sample data: fictional observations, kept separate from recorded performance.':'Recorded data: enter the actual export or evidence source. Sample sources are not prefilled.';
  }
  function importForm(){
    form('Import measurement evidence','input-file',
      '<label class="full">Evidence file<input type="file" name="file" required accept=".csv,.tsv,.json,application/json,text/csv"></label>'+
      select('CSV delimiter','delimiter',[[',','Comma'],[';','Semicolon'],['tab','Tab']])+select('Data mode for all rows','origin',evidenceOptions(),evidenceFilter||defaultEvidenceOrigin())+
      '<div class="full rl-controls">'+action('template','Download CSV example')+'</div>','Preview columns','','CSV files use one row per metric. JSON accepts an array of observations or an object containing rows.');
  }
  function importMap(){
    const keys=choices(pending.rows.flatMap(row=>Object.keys(row)));
    const defaultsRow=defaults(pending.origin);
    let columns='';
    for(const k of fields.filter(k=>k!=='origin'))columns+=select(k,'col-'+k,[['','Use default below'],...keys],keys.includes(k)?k:'',false);
    form('Map evidence columns','map-file',columns+'<h3 class="full">Defaults for unmapped columns</h3>'+
      ['account','source','metric','definition','unit','timezone'].map(k=>input(k,k,defaultsRow[k])).join('')+
      ['start','end','collectedAt'].map(k=>input(k,k,today(),'date')).join('')+
      select('Distribution','segment',['organic','paid','mixed'])+select('Aggregation','aggregation',['period','lifetime']),'Validate rows','',pending.name+' · '+pending.rows.length+' data rows');
  }
  function importPreview(){
    const r=pending.preview;
    form('Review import','apply-file',
      '<div class="full rl-import-summary"><strong>'+r.mapped.length+' observations ready</strong><p>'+r.errors.length+' invalid · '+r.duplicates+' identical · '+r.collisions.length+' changed values · '+r.overlaps.length+' overlapping windows</p></div>'+
      (r.errors.length?'<div class="rl-message full">'+r.errors.slice(0,12).map(v=>'Row '+v.row+' · '+esc(v.message)).join('<br>')+'<div>'+action('rejects','Download row errors')+'</div></div>':'')+
      (r.collisions.length?check('Preserve old values and add corrected evidence revisions.','replace',true):'')+
      '<div class="full">'+evidenceTable(r.mapped.slice(0,6).map(v=>v.row))+'</div>'+action('remap','Back to mapping'), 'Import evidence');
  }
  function learningForm(kind){
    const labels={
      'Experiment':['Hypothesis','Audience and expected behavior'],
      'Finding':['Observed result','Interpretation and limitations'],
      'Watchlist':['Watchlist name','Sources, collection cadence and coverage'],
      'Collaboration':['Partner or creator','Audience fit, proposed exchange, rights and authorization'],
      'Audience opportunity':['Opportunity','Audience, discovery path and proposed action'],
      'Community case':['Issue or theme','Client handoff, response target and escalation details']
    }[kind];
    const s=getStrategy(),observations=evidenceRows().slice(-50);
    form('New '+kind.toLowerCase(),'add-work',input(labels[0],'title')+input('Accountable owner','owner',actor())+input('Review date · '+(currentBrand().timezone||'local time'),'due',today(),'date')+
      area(labels[1],'detail')+input('Source URL, observation or evidence reference','evidence','','text',kind==='Finding'&&!observations.length)+
      select('Link a measurement','observationId',[['','No measurement'],...observations.map(o=>[o.id,o.metric+' · '+number(o.value)+' · '+o.end+' · '+o.source])],'',false)+
      (kind==='Experiment'?input('Main variable','variable')+input('Success measure','metric',s.kpi||'')+input('Baseline or comparison','baseline',s.baseline||'')+input('Observation window','window',s.window||''):'')+
      (brand()==='demo'?'':check('This record uses sample data.','fixture')),'Save record',kind);
  }
  function workDetail(id){
    const w=record('work',id);
    show(w.title,'<div class="rl-controls">'+badge(w.kind)+badge(w.status)+badge(kindText(w.origin))+'</div>'+
      meta(w.owner+' · review '+w.due)+'<p>'+esc(w.detail)+'</p>'+meta(w.evidence)+
      (w.kind==='Experiment'?'<dl class="rl-grid">'+[['Variable',w.variable],['Success measure',w.metric],['Comparison',w.baseline],['Window',w.window]].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>':'')+
      '<div class="rl-controls">'+action('work-decision','Record decision',id,'primary')+(w.kind==='Watchlist'?action('watch-run','Record collection',id):'')+'</div>'+
      (w.runs.length?'<h3>Collection runs</h3>'+w.runs.map(r=>summaryRow(r.signal,r.coverage+' · '+r.source+' · '+utcDisplay(r.at))).join(''):'')+
      '<h3>Decisions</h3>'+historyRows(w.decisions)+w.links.filter(key=>ctx.scoped().some(p=>p.id===key)).map(key=>'<a href="#content/'+encodeURIComponent(key)+'/brief">'+esc(contentName(key))+'</a>').join(' '));
  }
  function reportForm(resultId=''){
    const c=resultId?record('calculations',resultId):items('calculations').filter(c=>c.origin===(evidenceFilter||defaultEvidenceOrigin())).at(-1),end=c?.end||today(),start=c?.start||end.slice(0,8)+'01';
    const summary=c?c.definition.title+': '+resultText(c)+(c.baselineComparable&&c.delta!==null?'; baseline '+c.baselineValue+' '+c.definition.unit+', change '+(c.delta>=0?'+':'')+number(c.delta)+'.':'.'):'';
    const limits=c?[c.origin==='fixture'?'Sample data only; no real audience results.':'',c.unavailable,c.comparisonNote].filter(Boolean).join(' '):'';
    form('Draft a client report','report-create',
      (resultId?'<input type="hidden" name="calculationId" value="'+esc(resultId)+'">':'')+U.summary('Included automatically',start+' – '+end+' · '+(c?c.definition.title+' and its saved evidence.':'Observations and saved outcomes in this period.'))+
      U.section('The story and next decision','The measured results are included; add your interpretation.',area('What do the results tell us?','summary',summary)+area('What are the limits?','gaps',limits)+area('What should the client decide?','ask'))+
      U.optional('Report settings and private notes',input('Report title','title',currentBrand().name+' · Results '+end)+input('Reviewer','reviewer',actor())+input('Period start','start',start,'date')+input('Period end','end',end,'date')+select('Evidence set','origin',evidenceOptions(),c?.origin||evidenceFilter||defaultEvidenceOrigin())+area('Internal notes — not shared','internal','',false)),
      'Save report for review','',resultId?'Includes this saved result and its original source evidence. The report stays private until reviewed.':'Includes all matching results and observations in this reporting period. The report stays private until reviewed.');
  }
  function reportDetail(id,client=false){
    const r=record('reports',id);
    const narrative=(title,text)=>'<section class="report-narrative"><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p></section>';
    let body='<div class="rl-controls">'+badge('Version '+r.version)+badge(r.status)+badge(kindText(r.origin))+'</div>'+meta(r.start+' – '+r.end+' · '+r.actor)+
      ((r.calculations||[]).length?'<section class="report-narrative"><h3>Measured outcomes</h3>'+r.calculations.map(c=>'<div class="report-result"><strong>'+esc(c.definition.title)+'</strong><p class="task-outcome">'+esc(resultText(c))+'</p>'+meta('Baseline '+(c.baselineValue===null?'not established':c.baselineValue)+' · '+(c.delta===null?'Not comparable':'Change '+(c.delta>=0?'+':'')+number(c.delta))+' · definition v'+c.definition.version)+meta(c.account+' · '+c.source)+'</div>').join('')+'</section>':'')+
      narrative('What the results tell us',r.summary)+narrative('Coverage and limitations',r.gaps)+narrative('Decision needed',r.ask)+
      U.optional('Source evidence and delivered work','<div class="full">'+evidenceTable(r.observations)+'<h3>Delivered work</h3>'+(r.deliveries.length?r.deliveries.map(d=>meta(d.title+' · '+d.account+' · '+utcDisplay(d.actualAt))).join(''):meta('No verified placements in this period.'))+(r.findings.length?'<h3>Reviewed evidence</h3>'+r.findings.map(f=>summaryRow(f.title,f.detail+' · '+f.evidence)).join(''):'')+'</div>')+
      (!client&&r.internal?U.optional('Internal notes — not shared','<p class="full">'+esc(r.internal)+'</p>'):'');
    if(!client)body+='<div class="rl-controls">'+(r.status==='Draft'?action('report-review','Review snapshot',id,'primary'):action('report-feedback','Record client decision',id,'primary')+action('report-client','Client preview',id)+action('report-export','Export client report',id))+'</div>'+
      (r.feedback.length?'<h3>Client decisions</h3>'+r.feedback.map(f=>meta(f.note+' · '+f.actor+' · '+utcDisplay(f.at))).join(''):'');
    else body+='<div class="rl-controls">'+action('print-report','Print report',id)+'</div>';
    show(r.title,body);
  }
  function compareForm(rate=false){
    const obs=filteredEvidence().filter(o=>o.value!==null);
    if(obs.length<2){ctx.toast('Add two measured observations of the same evidence type first.');return;}
    const opts=obs.map(o=>[o.id,o.metric+' · '+number(o.value)+' '+o.unit+' · '+o.account+' · '+o.end]);
    form(rate?'Calculate a rate':'Compare two observations',rate?'calc-rate':'calc-compare',select(rate?'Measure to count':'Earlier measure','first',opts,opts[0][0])+select(rate?'Compare with':'Later measure','second',opts,opts[1][0]),rate?'Calculate rate':'Compare');
  }
  async function click(el){
    const cmd=el.dataset.rl,key=el.dataset.key;
    if(['pause','toggle-pause','placement-pause','legacy-placement'].includes(cmd))allow('coordinate');
    if(['measure-batch','observe','import','fixture','legacy-metrics','calculate-kpi'].includes(cmd))allow('analyze');
    if(['new-report','report-review','report-feedback'].includes(cmd)&&!can('coordinate'))allow('analyze');
    if(cmd==='learn-tab'){learnTab=key;ctx.render();return;}
    if(cmd==='new-placement')return placementForm(key);
    if(cmd==='placement')return placementDetail(key);
    if(cmd==='release-step')return stepForm(key);
    if(cmd==='pause')return pauses();
    if(cmd==='toggle-pause'||cmd==='placement-pause'){
      const [scope,target]=cmd==='placement-pause'?['placement',key]:JSON.parse(key);
      return emit((s,b,a)=>D.pause(s,b,scope,target,a),'Release controls saved.');
    }
    if(cmd==='legacy-placement'){
      const p=ctx.scoped().find(p=>p.id===key),q=p.publishing;
      form('Transfer historical release','legacy-placement',input('Original destination account','account',currentBrand().name)+input('Publisher','owner',actor())+input('Community handoff owner','communityOwner','Client community owner')+
        timeField('Resolved planned time','scheduledAt','')+input('Original destination time zone','timezone',q.timezone||p.timezone)+
        (q.state==='verified'?timeField('Actual publication time','actualAt',''):'')+check('I checked the original version, approval, account and timing against the saved record.','checked',true),'Transfer record',key,
        'Original log · '+q.state+' · '+q.date+' '+q.time+' '+q.timezone+(q.url?' · '+q.url:''));return;
    }
    if(cmd==='legacy-metrics'){
      const oldIds=new Set(D.legacyCandidates(ctx.state,brand()).metrics.map(r=>r.contentId));
      const platforms=choices(ctx.scoped().filter(p=>oldIds.has(p.id)).map(p=>p.platform));
      form('Transfer earlier observations','legacy-metrics',select('Original platform','platform',platforms)+input('Destination account for these prior rows','account',currentBrand().name)+input('Original reporting time zone','timezone',currentBrand().timezone||'UTC')+
        check('Treat each original window as a period count with unspecified distribution (mixed).','checked',true)+check('Accept changed values as new evidence revisions.','replace'),
        'Transfer observations','','Transfer up to 2,500 prior posts/windows for the chosen platform per batch. Each contributes separate impressions, reach, interactions and click records. Source, dates, missing values and provenance travel with each measurement.');return;
    }
    if(cmd==='manifest'||cmd==='bundle'){
      const p=record('placements',key);if(!can('coordinate',p)&&!publisher(p)&&!communityOwner(p))throw Error('This release is assigned to another person.');
      if(cmd==='manifest'){download(D.manifest(ctx.state,p),key+'-release.json');return;}
      if(!can('coordinate',p))allow('publish',p);
      const activeBrand=brand(),personId=ctx.ui.personId;
      el.disabled=true;el.textContent='Preparing approved files…';
      try{
        const prepared=await root.JMLReleaseFiles.prepare(p.handoff,url=>root.JMLStorage.mediaURL(url));
        if(activeBrand!==brand()||personId!==ctx.ui.personId)throw Error('The active account or person changed. Reopen this release.');
        await emit((s,b,a)=>D.sealHandoff(s,b,key,prepared.files,a,prepared.handoffId),'Approved file bundle prepared.');
        const blob=root.JMLReleaseFiles.bundle(D.manifest(ctx.state,record('placements',key)),prepared),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=p.contentId+'-v'+p.handoff.versionNumber+'-approved.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);placementDetail(key);
      }finally{el.disabled=false;el.textContent='Download approved files (ZIP)';}return;
    }
    if(cmd==='receive-package'){const p=record('placements',key);allow('publish',p);return emit((s,b,a)=>D.receiveHandoff(s,b,key,a,ctx.ui.personId),'Approved handoff accepted.');}
    if(cmd==='receive-community'){const p=record('placements',key);if(!communityOwner(p))throw Error('Only the assigned community owner can accept this handoff.');return emit((s,b,a)=>D.receiveCommunity(s,b,key,a,ctx.ui.personId),'Community handoff accepted.');}
    if(cmd==='calculate-kpi'||cmd==='rate')return kpiForm();
    if(cmd==='calculation')return calculationDetail(key);
    if(cmd==='calculation-export'){download(record('calculations',key),key+'.json');return;}
    if(cmd==='propose-next'){
      if(!can('strategy'))allow('coordinate');
      const c=record('calculations',key),people=root.JMLGovernance?.eligiblePeople(ctx.state,brand()).filter(p=>{const m=root.JMLGovernance.membership(ctx.state,{brand:brand(),personId:p.id});return m?.functions.some(f=>['account','strategy','operations'].includes(f));})||[];
      return form('Propose the next test','propose-next',select('Planning destination','kind',[['content','New content brief'],['strategy','Strategy revision'],['calendar','Next calendar']])+input('Proposed test','title')+area('Finding and specific next action','detail')+(people.length?select('Decision owner','ownerPersonId',people.map(p=>[p.id,p.name]),ctx.ui.personId):input('Decision owner','owner',actor()))+input('Review date · '+(currentBrand().timezone||'local time'),'due',today(),'date'),'Save proposal',key,c.definition.title+' · '+resultText(c));
    }
    if(cmd==='proposal')return proposalDetail(key);
    if(cmd==='proposal-decision')return form('Review next-plan proposal','proposal-decision',select('Decision','action',[['accept','Accept for planning'],['return','Return with feedback']])+area('Decision rationale','note'),'Record decision',key);
    if(cmd==='measure-batch')return measurementForm();
    if(cmd==='report-from-result'){if(!can('coordinate'))allow('analyze');return reportForm(key);}
    if(cmd==='observe')return manualObservation();
    if(cmd==='import'){pending=null;return importForm();}
    if(cmd==='remap')return importMap();
    if(cmd==='rejects'){download(pending.preview.errors,'measurement-import-errors.json');return;}
    if(cmd==='template'){
      const d=defaults(),row={...d,value:null};const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
      download(fields.join(',')+'\r\n'+fields.map(k=>quote(row[k])).join(',')+'\r\n','measurement-template.csv','text/csv');return;
    }
    if(cmd==='fixture'){
      const d=defaults();Object.assign(d,{origin:'fixture',source:'JML sample measurements',account:currentBrand().name+' sample',definition:'Unique accounts reached during the period',metric:'Reach',unit:'accounts'});
      const rows=[{...d,start:ctx.C.addDays(today(),-13),end:ctx.C.addDays(today(),-7),value:740},{...d,start:ctx.C.addDays(today(),-6),value:825},{...d,start:ctx.C.addDays(today(),-6),metric:'Interactions',definition:'Reactions, comments, shares and saves',unit:'interactions',value:58}];
      evidenceFilter='fixture';
      return emit((s,b,a)=>D.ingest(s,b,rows,{name:'Weekly reach and interactions sample',format:'fixture'},a),'Sample evidence is available.');
    }
    if(cmd==='export-evidence'){download({kind:'jml-observations',rows:filteredEvidence()},'measurement-evidence.json');return;}
    if(cmd==='compare')return compareForm(false);
    if(cmd==='work-type'){
      form('Choose a learning record','new-work-type',select('Type','kind',D.workTypes),'Continue');return;
    }
    if(cmd==='work-item')return workDetail(key);
    if(cmd==='work-decision'){
      const w=record('work',key);
      form('Review '+w.kind.toLowerCase(),'decision',select('Decision','decision',w.kind==='Community case'?['Resolve','Escalate','Test again']:['Continue','Improve','Test again','Retire'])+
        area('Observation, interpretation and next action','note')+check('Create a proposed content brief from this decision.','propose')+input('Proposed brief title','title',w.title,'text',false),'Save decision',key);return;
    }
    if(cmd==='watch-run'){
      form('Record collection run','run',input('Source or export','source')+input('Signal or recurring question','signal')+area('Coverage, exclusions and gaps','coverage')+check('Create an audience opportunity for this signal.','route'),'Save collection run',key);return;
    }
    if(cmd==='new-report')return reportForm();
    if(cmd==='report-item'||cmd==='report-client')return reportDetail(key,cmd==='report-client');
    if(cmd==='report-review'){
      const r=record('reports',key);
      form('Review report snapshot','approve-report',check('I checked period, sources, definitions, calculations and limitations.','checked',true),'Mark client ready',key,'Assigned reviewer · '+r.reviewer);return;
    }
    if(cmd==='report-feedback'){
      form('Record a client decision','feedback',area('Feedback and agreed decision','note')+input('Next action','title')+input('Owner','owner',actor())+input('Due date','due',today(),'date')+check('Create a proposed brief in Studio.','propose'),'Save decision',key);return;
    }
    if(cmd==='report-export'){
      const r=record('reports',key);requireApprovedReport(r);
      const clean={title:r.title,version:r.version,period:[r.start,r.end],evidenceType:r.origin,reviewedBy:r.approval,summary:r.summary,limitations:r.gaps,decisionRequested:r.ask,deliveries:r.deliveries,metrics:r.observations.map(o=>({account:o.account,source:o.source,metric:o.metric,definition:o.definition,value:o.value,unit:o.unit,start:o.start,end:o.end,segment:o.segment,aggregation:o.aggregation,timezone:o.timezone,collectedAt:o.collectedAt})),findings:r.findings.map(f=>({title:f.title,detail:f.detail,source:f.evidence}))};
      clean.calculations=(r.calculations||[]).map(c=>({id:c.id,title:c.definition.title,definitionId:c.definitionId,definitionVersion:c.definition.version,formula:{numerator:c.definition.numerator,denominator:c.definition.denominator,scale:c.scale},result:c.result,unavailable:c.unavailable,unit:c.definition.unit,baseline:c.baseline,delta:c.delta,evidenceIds:[c.numerator.id,...(c.denominator?[c.denominator.id]:[])],start:c.start,end:c.end}));
      download(clean,'client-report-v'+r.version+'.json');return;
    }
    if(cmd==='print-report'){requireApprovedReport(record('reports',key));window.print();}
  }
  function requireApprovedReport(r){if(r.status!=='Client ready')throw Error('Review this snapshot before exporting.');}
  async function submit(el){
    const cmd=el.dataset.rlForm,key=el.dataset.key;
    if(el.dataset.brand!==brand())throw Error('The active account changed. Reopen the form.');
    const fd=new FormData(el),f=Object.fromEntries(fd);
    for(const c of el.querySelectorAll('[type="checkbox"]'))f[c.name]=c.checked;
    if(['measure-batch','observe','input-file','map-file','apply-file','legacy-metrics','calculate-kpi'].includes(cmd))allow('analyze');
    if(['propose-next','proposal-decision','add-work','decision','run'].includes(cmd)&&!can('strategy')&&!can('analyze'))allow('coordinate');
    if(['report-create','approve-report','feedback'].includes(cmd)&&!can('analyze'))allow('coordinate');
    if(cmd==='legacy-placement')allow('coordinate');
    if(cmd==='legacy-placement'){f.scheduledAt=utc(f.scheduledAt);if(f.actualAt)f.actualAt=utc(f.actualAt);return emit((s,b,a)=>D.liftPlacement(s,b,key,f,a),'Historical record transferred.');}
    if(cmd==='legacy-metrics')return emit((s,b,a)=>D.liftMetrics(s,b,f,a),'Earlier observations transferred.');
    if(cmd==='new-placement'){
      const post=ctx.scoped().find(p=>p.id===f.contentId);if(!can('coordinate',post))allow('publish',post);
      if(f.ownerPersonId)f.owner=root.JMLGovernance.person(ctx.state,f.ownerPersonId)?.name;
      if(f.communityOwnerPersonId)f.communityOwner=root.JMLGovernance.person(ctx.state,f.communityOwnerPersonId)?.name;
      f.approver=ctx.C.latest(post).decisions.slice().reverse().find(d=>d.action==='approved')?.actor;
      return emit((s,b,a)=>D.createPlacement(s,b,f,a),'Placement prepared.');
    }
    if(cmd==='release-step'){const [id,step]=key.split('|'),p=record('placements',id);allow('publish',p);if(!publisher(p))throw Error('Only the assigned publisher can operate this placement.');if(f.actualAt)f.actualAt=utc(f.actualAt);return emit((s,b,a)=>D.advance(s,b,id,step,f,a),'Release history updated.');}
    if(cmd==='calculate-kpi')return emit((s,b,a)=>D.calculate(s,b,f,a),'Measured outcome saved.');
    if(cmd==='propose-next'){if(!can('strategy'))allow('coordinate');if(f.ownerPersonId)f.owner=root.JMLGovernance.person(ctx.state,f.ownerPersonId)?.name;return emit((s,b,a)=>D.proposeNext(s,b,key,f,a),'Next-plan proposal saved.');}
    if(cmd==='proposal-decision'){if(!can('strategy'))allow('coordinate');f.personId=ctx.ui.personId;return emit((s,b,a)=>D.decideProposal(s,b,key,f,a),'Planning decision saved.');}
    if(cmd==='measure-batch'){
      const primary=JSON.parse(el.dataset.primary||'[]');
      const values=Object.fromEntries(Object.entries(f).filter(([k,v])=>k.startsWith('value-')&&(v!==''||primary.includes(k.slice(6)))).map(([k,v])=>[k.slice(6),v]));
      let result;await emit((s,b,a)=>{result=D.recordMeasurements(s,b,f,values,a);},'Source counts saved.');
      if(result?.result)ctx.toast('Counts saved and '+resultText(result.result)+' calculated.');else ctx.toast('Counts saved. A KPI needs matching measures, period and distribution.');return;
    }
    if(cmd==='observe'){evidenceFilter=f.origin;return emit((s,b,a)=>D.ingest(s,b,[f],{name:f.source,format:'manual',replace:f.replace},a),'Observation saved.');}
    if(cmd==='input-file'){
      const file=fd.get('file');
      if(!file?.size||file.size>5*1024*1024)throw Error('Select a JSON or CSV file under 5 MB.');
      const source=await file.text();let rows;const jsonFormat=/\.json$/i.test(file.name)||/^[\s\uFEFF]*[\[{]/.test(source);
      if(jsonFormat){let parsed;try{parsed=JSON.parse(source.replace(/^\uFEFF/,''));}catch{throw Error('The file contains invalid JSON.');}rows=Array.isArray(parsed)?parsed:parsed.rows;}
      else rows=D.csvRows(source,f.delimiter==='tab'?'\t':f.delimiter);
      if(!Array.isArray(rows)||!rows.length||rows.length>10000||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Choose 1–10,000 measurement records.');
      pending={brand:brand(),name:file.name,format:jsonFormat?'json':'csv',rows,origin:f.origin};
      return importMap();
    }
    if(cmd==='map-file'){
      if(!pending||pending.brand!==brand())throw Error('Select the file again.');
      pending.mapping=Object.fromEntries(fields.filter(k=>k!=='origin').map(k=>[k,f['col-'+k]]));pending.defaults={...defaults(pending.origin),...Object.fromEntries(fields.filter(k=>k in f).map(k=>[k,f[k]])),origin:pending.origin};
      pending.input=pending.rows.map(r=>{
        const row=Object.fromEntries(fields.filter(k=>pending.mapping[k]).map(k=>[k,r[pending.mapping[k]]]));
        if(r.brandId)row.brandId=r.brandId;
        if(r.origin==='fixture'||r.origin==='sample')row.origin='fixture';
        return row;
      });
      pending.preview=D.preview(ctx.state,brand(),pending.input,pending.defaults);return importPreview();
    }
    if(cmd==='apply-file'){
      if(!pending||pending.brand!==brand())throw Error('Select the file again.');
      const p=pending;evidenceFilter=p.origin;
      await emit((s,b,a)=>D.ingest(s,b,p.input,{name:p.name,format:p.format,mapping:p.mapping,defaults:p.defaults,replace:f.replace},a),'Evidence import complete.');pending=null;return;
    }
    if(cmd==='new-work-type')return learningForm(f.kind);
    if(cmd==='add-work'){
      if(f.observationId){const o=record('observations',f.observationId);f.evidence=(f.evidence?f.evidence+' · ':'')+o.id+' · '+o.source;if(o.origin==='fixture')f.fixture=true;}
      return emit((s,b,a)=>D.addWork(s,b,{...f,kind:key},a),'Learning record saved.');
    }
    if(cmd==='decision')return emit((s,b,a)=>D.decideWork(s,b,key,f,a),'Decision recorded.');
    if(cmd==='run')return emit((s,b,a)=>D.watchRun(s,b,key,f,a),'Collection run recorded.');
    if(cmd==='report-create')return emit((s,b,a)=>D.snapshot(s,b,f,a),'Report snapshot created.');
    if(cmd==='approve-report')return emit((s,b,a)=>D.reportDecision(s,b,key,{action:'review'},a),'Report ready for client review.');
    if(cmd==='feedback')return emit((s,b,a)=>D.reportDecision(s,b,key,f,a),'Client decision and action recorded.');
    if(cmd==='calc-rate'||cmd==='calc-compare'){
      const a=record('observations',f.first),b=record('observations',f.second);
      if(a.id===b.id||a.origin!==b.origin||a.value===null||b.value===null)throw Error('Choose two distinct, measured observations with matching provenance.');
      const same=['account','contentId','placementId','segment','source','timezone','aggregation'].every(k=>a[k]===b[k]);
      if(!same)throw Error('Choose observations with matching source, destination, content, time zone, aggregation and distribution.');
      let text;
      if(cmd==='calc-rate'){
        if(a.start!==b.start||a.end!==b.end)throw Error('Both measures must cover the same reporting period.');
        text=b.value===0?'Unavailable · comparison measure is zero.':number(a.value)+' '+a.unit+' ÷ '+number(b.value)+' '+b.unit+' × 100 = '+(100*a.value/b.value).toFixed(2)+'%';
      }else{
        if(a.metric!==b.metric||a.unit!==b.unit||a.definition!==b.definition||a.end>=b.start||(Date.parse(a.end)-Date.parse(a.start)!==Date.parse(b.end)-Date.parse(b.start)))throw Error('Choose the same metric and definition in chronological, equally long, non-overlapping windows.');
        text=number(a.value)+' → '+number(b.value)+' '+a.unit+' · change '+number(b.value-a.value)+(a.value?' ('+((b.value-a.value)/a.value*100).toFixed(1)+'%)':'');
      }
      return show(cmd==='calc-rate'?'Calculated rate':'Period comparison','<h3>'+esc(text)+'</h3>'+evidenceTable([a,b]));
    }
  }
  function alertError(err){
    const field=document.querySelector('#modal[open] .rl-error');
    if(field){field.textContent=err.message;field.tabIndex=-1;field.focus();}
    else ctx.toast(err.message);
  }
  function install(){
    if(installed)return;installed=true;
    document.addEventListener('click',ev=>{
      const el=ev.target.closest('[data-rl]');if(!el||el.disabled)return;ev.preventDefault();
      Promise.resolve(click(el)).catch(alertError);
    });
    document.addEventListener('submit',ev=>{
      const el=ev.target.closest('[data-rl-form]');if(!el)return;ev.preventDefault();ev.stopImmediatePropagation();
      const b=el.querySelector('[type="submit"]');if(b)b.disabled=true;
      Promise.resolve(submit(el)).catch(alertError).finally(()=>{if(b)b.disabled=false;});
    },true);
    document.addEventListener('change',ev=>{
      if(ev.target.matches('[data-rl-form="new-placement"] [name="contentId"]')){
        const selected=ctx.scoped().find(p=>p.id===ev.target.value);
        if(selected){placementForm(selected.id);return;}
      }
      const batchForm=ev.target.closest('[data-rl-form="measure-batch"]');if(batchForm&&ev.target.name==='placementId'){measurementForm(ev.target.value);return;}
      const observationForm=ev.target.closest('[data-rl-form="observe"]');if(observationForm)updateObservationForm(observationForm,ev.target.name);
      const calculationForm=ev.target.closest('[data-rl-form="calculate-kpi"]');if(calculationForm&&['definitionId','numeratorId'].includes(ev.target.name))updateKpiChoices(calculationForm);
      const placementFormEl=ev.target.closest('[data-rl-form="new-placement"]');
      if(placementFormEl&&['scheduledLocal','timezone'].includes(ev.target.name))updatePlacementTiming(placementFormEl,true);
      const el=ev.target.closest('[data-rl-change]');if(!el)return;
      const field=el.dataset.rlChange;
      if(field==='queue')queueFilter=el.value;
      if(field==='origin')evidenceFilter=el.value==='Sample'?'fixture':'recorded';
      const prefs={objective:'learnObjective',campaign:'learnCampaign',format:'learnFormat',metric:'learnMetric',account:'learnAccount',from:'learnFrom',to:'learnTo'};
      if(prefs[field])ctx.ui[prefs[field]]=el.value;
      ctx.render();
    });
    document.addEventListener('input',ev=>{const form=ev.target.closest('[data-rl-form="new-placement"]');if(form&&['scheduledLocal','timezone'].includes(ev.target.name))updatePlacementTiming(form,true);});
  }
  function mount(context){ctx=context;install();}
  function view(context,section){
    ctx=context;
    if(lastBrand!==brand()){
      pending=null;queueFilter='All';evidenceFilter='';learnTab='Results';
      for(const k of ['learnMetric','learnFrom','learnTo','learnAccount','learnObjective','learnCampaign','learnFormat'])ctx.ui[k]='';
      lastBrand=brand();
    }
    return '<div class="rl-workspace">'+(section==='publish'?publishView():learnView())+'</div>';
  }
  root.JMLRelease={mount,view,validate:D.validate};
})(window);
