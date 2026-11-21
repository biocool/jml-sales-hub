/* Explicit client-facing projections of the local workspace. */
(function (root) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const C = common ? require('./core.js') : root.JMLCore;
  const O = common ? require('./operations.js') : root.JMLOps;
  const R = common ? require('./release-domain.js') : root.JMLReleaseDomain;
  const G = common ? require('./governance.js') : root.JMLGovernance;
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleAllowed = role => role === 'client' || role === 'viewer';
  const planLabels = {foundation:'Onboarding',strategy:'Strategy',calendar:'Calendar'};
  const statusLabels = {'in-review':'Awaiting review',approved:'Approved','changes-requested':'Changes requested',requested:'Input requested',received:'Response received',accepted:'Accepted'};
  const sameName = (a,b) => !!a?.trim() && a.trim() === b?.trim();
  const fail = message => { throw Error(message); };

  function shared(state,ui) {
    const brand = state.brands.find(b=>b.id===ui.brand);
    if(!brand || !roleAllowed(ui.role) || !ui.actor?.trim()) return {inputs:[],creatives:[],plans:[],reports:[]};
    const member=state.governance?G.membership(state,ui):null;
    if(state.governance&&!member)return {inputs:[],creatives:[],plans:[],reports:[]};
    const sharedReading=!!member?.shareClientMaterial;
    const ops = O.account(state,brand.id);
    const inputs=[],creatives=[],plans=[];
    for(const p of state.posts.filter(p=>p.brandId===brand.id)) {
      for(const request of p.requests) {
        if(sameName(request.owner,ui.actor) && ['requested','received','accepted'].includes(request.state)) {
          inputs.push({kind:'input',id:request.id,parent:p.id,title:request.title,postTitle:p.title,state:request.state,due:request.due,
            instructions:request.state==='accepted'?'':request.note});
        }
      }
      const v=C.latest(p);
      if(!v || (!sharedReading&&!sameName(p.brief.approver,ui.actor)) || v.briefRevision!==p.briefRevision || !['in-review','approved','changes-requested'].includes(v.state) || !C.qcKeys.every(k=>v.qc?.[k]===true))continue;
      creatives.push({kind:'creative',canAct:state.governance?G.can(state,ui,'approve',p):sameName(p.brief.approver,ui.actor),id:v.id,parent:p.id,title:p.title,version:v.number,state:v.state,caption:v.caption,platform:p.platform,format:p.format,date:p.date,
        assets:v.assets.filter(a=>C.safeMedia(a.url)).map(a=>({type:a.type,url:a.url,alt:a.alt})),
        decisions:v.decisions.map(d=>({state:d.action,actor:d.actor,at:d.at,note:d.comment}))});
    }
    if(sharedReading||sameName(ops.foundation.finalApprover,ui.actor)) {
      for(const [kind,key] of [['foundation','foundationVersions'],['strategy','strategies'],['calendar','calendars']]) {
        const v=ops[key]?.at(-1);
        if(!v)continue;
        const d=ops.decisions.find(d=>d.kind===kind && d.targetId===v.id);
        const body={};
        if(kind==='foundation') {for(const [field] of foundationFields)body[field]=v.body[field]||'';} else if(kind==='strategy') {
          for(const [field] of strategyFields)body[field]=v.body[field]||'';
        } else {
          body.start=v.body.start;body.end=v.body.end;
          body.entries=(v.body.entries||[]).map(x=>({title:x.title,date:x.date,time:x.time,timezone:x.timezone,platform:x.platform,format:x.format||'',objective:x.objective||'',angle:(ops.angles||[]).find(a=>a.id===x.angleId)?.title||'',kpi:(ops.kpis||[]).find(k=>k.id===x.measurementDefinitionId)?.title||x.measurementDefinitionId||''}));
          body.slots=(v.body.slots||[]).map(x=>({title:x.title,date:x.date}));
        }
        plans.push({kind,canAct:sameName(ops.foundation.finalApprover,ui.actor)&&(!state.governance||G.can(state,ui,'approve',{brandId:brand.id,id:brand.id})),id:v.id,title:planLabels[kind]+' plan',version:v.number,state:d?.decision||'in-review',body,
          decisions:d?[{state:d.decision,at:d.at,actor:d.actor,note:d.note}]:[]});
      }
    }
    const reports=(state.releaseLearning?.reports||[]).filter(r=>r.brandId===brand.id && r.status==='Client ready').slice().reverse().map(r=>({
      kind:'report',id:r.id,title:r.title,version:r.version,start:r.start,end:r.end,origin:r.origin,summary:r.summary,gaps:r.gaps,ask:r.ask,
      calculations:(r.calculations||[]).map(c=>({title:c.definition.title,version:c.definition.version,unit:c.definition.unit,value:c.result,unavailable:c.unavailable,baseline:c.baselineValue,delta:c.delta,comparable:c.baselineComparable,comparisonNote:c.comparisonNote,source:c.source,baselineSource:c.baseline?.source,start:c.start,end:c.end})),
      observations:r.observations.map(o=>({metric:o.metric,value:o.value,unit:o.unit,definition:o.definition,start:o.start,end:o.end,account:o.account})),
      deliveries:r.deliveries.map(d=>({title:d.title,platform:d.platform,account:d.account,at:d.actualAt})),
      findings:r.findings.map(f=>({title:f.title,detail:f.detail})),
      feedback:r.feedback.filter(f=>sameName(f.actor,ui.actor)).map(f=>({at:f.at,note:f.note}))}));
    inputs.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
    return {inputs,creatives,plans,reports};
  }

  const foundationFields=[['business','Business goals and offer'],['audience','Audience'],['scope','Scope'],['priorities','Priorities'],['brandBook','Brand guidance'],['media','Media readiness'],['access','Access readiness'],['communityOwner','Community owner'],['weeklyCapacity','Weekly capacity'],['responseDue','Response deadline'],['finalApprover','Named client approver']];
  const strategyFields=[['objective','Objective'],['audience','Audience and value proposition'],['channelRoles','Channel roles'],['pillars','Content pillars'],['growth','Growth approach'],['kpi','Agreed KPI'],['definition','Measurement definition'],['baseline','Baseline'],['target','Target'],['window','Measurement window'],['cadence','Review cadence']];
  function findItem(data,kind,id,parent='') {
    const collection={input:data.inputs,creative:data.creatives,foundation:data.plans,strategy:data.plans,calendar:data.plans,report:data.reports}[kind]||[];
    return collection.find(x=>x.kind===kind && x.id===id && (x.parent||'')===parent) || fail('This item is no longer shared with this profile.');
  }
  function perform(state,ui,command) {
    if(ui.role!=='client' || command.brand!==ui.brand || command.actor!==ui.actor)fail('This profile cannot change the shared item.');
    const {kind,id,parent='',outcome}=command, actor=ui.actor.trim(), note=String(command.note??'').trim();
    if(note.length>5000)fail('Use 5,000 characters or fewer.');
    const item=findItem(shared(state,ui),kind,id,parent);
    if(['creative','foundation','strategy','calendar'].includes(kind)&&item.canAct===false)fail('This decision belongs to the named approver. You can read the shared material.');
    if(state.governance&&['creative','foundation','strategy','calendar'].includes(kind))G.assert(state,ui,'approve',kind==='creative'?state.posts.find(p=>p.id===parent):{brandId:ui.brand,id:ui.brand});
    if(kind==='report') {
      if(outcome!=='feedback' || !note)fail('Enter the feedback you want to share.');
      const report=state.releaseLearning.reports.find(r=>r.id===id && r.brandId===ui.brand);
      R.reportDecision(state,ui.brand,id,{action:'feedback',title:'Follow up on '+report.title,note,owner:report.reviewer,due:C.addDays(C.now().slice(0,10),7),propose:false},actor);
      return;
    }
    if(kind==='input') {
      if(item.state!=='requested' || outcome!=='respond' || !note)fail('Enter a response for this open request.');
      const p=state.posts.find(p=>p.id===parent && p.brandId===ui.brand), r=p.requests.find(r=>r.id===id);
      r.state='received';
      const response=actor+' · '+C.now().slice(0,10)+'\n'+note;
      r.note=[r.note,response].filter(Boolean).join('\n\n');
      C.event(p,'Client input received',r.title+'\n'+note,actor);
      return;
    }
    if(item.state!=='in-review')fail('This version already has a decision.');
    if(kind==='creative') {
      const p=state.posts.find(p=>p.id===parent && p.brandId===ui.brand);
      C.decide(p,outcome,note,actor);
    } else {
      const ops=O.account(state,ui.brand);
      if(kind==='calendar' && outcome==='approved'){
        const v=ops.calendars.at(-1);
        if(JSON.stringify(O.calendarPackage(state,ui.brand,v.body))!==JSON.stringify(v.body))fail('The calendar changed after this version was shared. Ask the team for a fresh version.');
      }
      O.decision(ops,kind,id,outcome,actor,note);
    }
  }

  const openButton=(item,label) => '<button type="button" class="btn small" data-persona-open="'+escape(item.kind)+'" data-id="'+escape(item.id)+'" data-parent="'+escape(item.parent||'')+'">'+label+'</button>';
  const dateText = value => value ? String(value).slice(0,10) : '';
  function row(item,role) {
    const meta={input:[item.postTitle,item.due?'Due '+item.due:''],creative:[item.platform,item.format,'V'+item.version],foundation:['V'+item.version],strategy:['V'+item.version],calendar:[item.body?.start,item.body?.end,'V'+item.version],report:[item.start+' – '+item.end,'V'+item.version,item.origin==='fixture'?'Sample data':'Recorded data']}[item.kind];
    const action=role==='client' && item.kind==='input' && item.state==='requested'?'Respond':role==='client' && item.state==='in-review'?'Review':'View';
    return '<article class="rl-row"><div><h3>'+escape(item.title)+'</h3><p class="rl-meta">'+meta.filter(Boolean).map(escape).join(' · ')+'</p></div><div class="rl-controls">'+(item.state?'<span class="rl-badge">'+escape(statusLabels[item.state])+'</span>':'')+openButton(item,action)+'</div></article>';
  }
  function panel(title,items,role,empty) {
    return '<section class="rl-panel"><header><h2>'+title+'</h2><span class="count-note">'+items.length+'</span></header>'+(items.length?items.map(i=>row(i,role)).join(''):'<p class="muted">'+empty+'</p>')+'</section>';
  }
  function view(ctx) {
    const {ui}=ctx, data=shared(ctx.state,ui), brand=ctx.state.brands.find(b=>b.id===ui.brand);
    const role=ui.role, read=role==='viewer',route=ui.route;
    const reviewSection=['planning','inputs'].includes(ui.section)?ui.section:'client';
    const reviewTitles={client:'Creative review',planning:'Planning decisions',inputs:'Requested inputs'};
    const reviewDescriptions={client:'Inspect the exact creative versions shared with '+ui.actor+'.',planning:'Review the onboarding, strategy and calendar versions shared with '+ui.actor+'.',inputs:'Track the information and files requested from '+ui.actor+'.'};
    const title=route==='review'?reviewTitles[reviewSection]:{learn:'Shared reports',today:'Today'}[route]||'Today';
    const description=route==='review'?reviewDescriptions[reviewSection]:{learn:'Read the reports the team has released for '+(brand?.name||'this account')+'.',today:'Inputs, decisions and reports for '+ui.actor+'.'}[route]||'';
    let body='';
    if(route==='learn')body=panel('Client-ready reports',data.reports,role,'Reviewed reports will appear here.');
    else if(route==='review'){
      if(reviewSection==='planning')body=panel('Plan approvals',data.plans,role,'No current plan is shared with this person.');
      else if(reviewSection==='inputs')body=panel('Requested inputs',data.inputs.filter(x=>x.state!=='accepted'),role,'You have no outstanding input requests.');
      else body=panel('Creative versions',data.creatives,role,'No submitted creative is shared with this person.');
    }
    else {
      const waiting=[...data.plans,...data.creatives].filter(x=>x.state==='in-review');
      const activeInputs=data.inputs.filter(x=>x.state!=='accepted');
      body=panel('Requested inputs',activeInputs,role,'You have no outstanding input requests.')+panel(read?'Pending approvals':'Awaiting your review',waiting,role,'You have no pending approvals.');
      if(data.reports.length)body+=panel('Latest report',data.reports.slice(0,1),role,'');
    }
    return '<div class="persona-workspace">'+ctx.heading(read?'Read-only viewer · local preview':'Client reviewer · local preview',title,escape(description))+body+'</div>';
  }

  const fact=(label,value)=>value===undefined || value===null || value===''?'':'<div><dt>'+escape(label)+'</dt><dd>'+escape(value)+'</dd></div>';
  const para=(title,text)=>text?'<section class="persona-copy"><h3>'+escape(title)+'</h3><p>'+escape(text)+'</p></section>':'';
  function outcomeCards(calculations){
    const value=v=>Number(v).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1});
    return calculations.length?'<section class="persona-copy"><h3>Measured outcomes</h3>'+calculations.map(c=>'<article class="persona-copy"><h4>'+escape(c.title)+'</h4><p><strong>'+(c.value===null?'Unavailable':escape(value(c.value)+' '+c.unit))+'</strong></p><dl class="persona-facts">'+fact('Baseline',c.baseline==null?'Not established':value(c.baseline)+' '+c.unit)+fact('Change from baseline',c.comparable&&c.delta!=null?(c.delta>=0?'+':'')+value(c.delta)+' '+c.unit:'Not comparable')+fact('Measurement period',c.start+' – '+c.end)+fact('Source',c.source)+fact('Baseline source',c.baselineSource)+fact('Definition version','V'+c.version)+'</dl>'+para('Comparison and limitations',[c.unavailable,c.comparisonNote].filter(Boolean).join(' '))+'</article>').join('')+'</section>':'';
  }
  function details(item) {
    if(item.kind==='input')return '<dl class="persona-facts">'+fact('Requested for',item.postTitle)+fact('Due',item.due)+fact('Status',statusLabels[item.state])+'</dl>'+para('Request details',item.instructions);
    if(item.kind==='report') {
      const metrics=item.observations.map(o=>'<tr><th scope="row">'+escape(o.metric)+(o.definition?'<small>'+escape(o.definition)+'</small>':'')+'</th><td>'+(o.value===null?'Missing':escape(o.value)+' '+escape(o.unit))+'</td><td>'+escape(o.account)+'</td><td>'+escape(o.start)+' – '+escape(o.end)+'</td></tr>').join('');
      return '<p>'+escape(item.start)+' – '+escape(item.end)+' · V'+item.version+' · '+(item.origin==='fixture'?'Sample data':'Recorded data')+'</p>'+
        outcomeCards(item.calculations||[])+para('Findings',item.summary)+para('Limitations',item.gaps)+para('Decision requested',item.ask)+
        (metrics?'<div class="persona-table"><table><caption>Reported measurements</caption><thead><tr><th>Metric</th><th>Value</th><th>Account</th><th>Period</th></tr></thead><tbody>'+metrics+'</tbody></table></div>':'')+
        (item.deliveries.length?'<section class="persona-copy"><h3>Verified placements</h3><ul>'+item.deliveries.map(d=>'<li>'+escape([d.title,d.platform,d.account,dateText(d.at)].filter(Boolean).join(' · '))+'</li>').join('')+'</ul></section>':'')+
        item.findings.map(f=>para(f.title,f.detail)).join('')+
        item.feedback.map(f=>para('Your feedback · '+dateText(f.at),f.note)).join('');
    }
    let main='';
    if(item.kind==='creative') {
      main='<p>'+escape([item.platform,item.format,'V'+item.version,item.date].filter(Boolean).join(' · '))+'</p>'+
        (item.assets.length?'<div class="persona-media">'+item.assets.map((a,i)=>{
          const url=escape(root.JMLStorage?.mediaURL(a.url)||a.url),alt=escape(a.alt||'Creative '+(i+1));
          const media=a.type==='video'?'<video controls preload="metadata" src="'+url+'" aria-label="'+alt+'"></video>':'<img loading="lazy" src="'+url+'" alt="'+alt+'">';
          return '<figure>'+media+(item.assets.length>1?'<figcaption>Asset '+(i+1)+' of '+item.assets.length+'</figcaption>':'')+'</figure>';
        }).join('')+'</div>':'')+para('Submitted caption',item.caption);
    } else if(item.kind==='foundation') {main='<dl class="persona-facts">'+foundationFields.map(([k,l])=>fact(l,item.body[k])).join('')+'</dl>';
    } else if(item.kind==='strategy') {
      main='<dl class="persona-facts">'+strategyFields.map(([k,l])=>fact(l,item.body[k])).join('')+'</dl>';
    } else {
      const b=item.body;
      main='<p>'+escape(b.start)+' – '+escape(b.end)+'</p><div class="persona-table"><table><caption>Planned content and reserved slots</caption><thead><tr><th>Content</th><th>Channel / format</th><th>Purpose / KPI</th><th>Planned date</th></tr></thead><tbody>'+
        [...b.entries,...b.slots.map(s=>({...s,platform:'Reserved slot'}))].sort((a,b)=>a.date.localeCompare(b.date)).map(s=>'<tr><th scope="row">'+escape(s.title)+'</th><td>'+escape(s.platform)+(s.format?'<small>'+escape(s.format)+'</small>':'')+'</td><td>'+escape(s.objective||'')+'<small>'+escape(s.kpi||'')+'</small>'+(s.angle?'<small>'+escape(s.angle)+'</small>':'')+'</td><td>'+escape([s.date,s.time,s.timezone].filter(Boolean).join(' · '))+'</td></tr>').join('')+'</tbody></table></div>';
    }
    return main+item.decisions.map(d=>para(statusLabels[d.state]+' · '+d.actor+' · '+dateText(d.at),d.note||'Decision recorded.')).join('');
  }

  function actionForm(item,ui) {
    if(ui.role!=='client'||item.canAct===false)return '';
    const decision=item.state==='in-review',input=item.kind==='input' && item.state==='requested',report=item.kind==='report';
    if(!decision && !input && !report)return '';
    const prompt=decision?'Feedback':input?'Response or file reference':'Feedback for the team';
    const buttons=decision?'<button type="submit" class="btn primary" name="outcome" value="approved">Approve V'+item.version+'</button><button type="submit" class="btn" name="outcome" value="changes-requested">Request changes</button>':
      '<button type="submit" class="btn primary" name="outcome" value="'+(input?'respond':'feedback')+'">'+(input?'Send response':'Send feedback')+'</button>';
    return '<form data-persona-form="'+escape(item.kind)+'" data-id="'+escape(item.id)+'" data-parent="'+escape(item.parent||'')+'" data-brand="'+escape(ui.brand)+'" data-actor="'+escape(ui.actor)+'" class="persona-form">'+
      '<label>'+prompt+'<textarea name="note" maxlength="5000" rows="3" '+(decision?'':'required')+'></textarea></label>'+(decision?'<small>Describe the change when requesting a revision.</small>':'')+
      '<p class="form-error" role="alert"></p><div class="actions">'+buttons+'</div></form>';
  }

  let current,installed=false;
  function mount(ctx) {
    current=ctx;
    if(installed)return;
    installed=true;
    document.addEventListener('click',ev=>{
      const b=ev.target.closest('[data-persona-open]');
      if(!b || !roleAllowed(current.ui.role))return;
      try {
        const item=findItem(shared(current.state,current.ui),b.dataset.personaOpen,b.dataset.id,b.dataset.parent||'');
        current.showModal(escape(item.title),'<div class="modal-body persona-detail">'+details(item)+actionForm(item,current.ui)+'</div>');
      } catch(err){current.toast(err.message);}
    });
    document.addEventListener('submit',async ev=>{
      const f=ev.target.closest('form[data-persona-form]');
      if(!f)return;
      ev.preventDefault();ev.stopImmediatePropagation();
      const ctx=current;
      const command={kind:f.dataset.personaForm,id:f.dataset.id,parent:f.dataset.parent,actor:f.dataset.actor,brand:f.dataset.brand,note:f.elements.note.value,outcome:ev.submitter?.value};
      if(!command.outcome)return;
      const buttons=[...f.querySelectorAll('button')];
      buttons.forEach(b=>b.disabled=true);
      try {await ctx.commit(next=>perform(next,ctx.ui,command),'Saved to the account history.');}
      catch(err){const el=f.querySelector('[role="alert"]');el.textContent=err.message;el.tabIndex=-1;el.focus();}
      finally {buttons.forEach(b=>b.disabled=false);}
    },true);
  }
  const api={view,mount,shared,perform,outcomeCards};
  if(common)module.exports=api;else root.JMLPersonas=api;
})(typeof window!=='undefined'?window:globalThis);
