/* Offline application. External account adapters are intentionally absent. */
(async () => {
  'use strict';
  const C=window.JMLCore,S=window.JMLStorage,G=window.JMLGovernance,$=s=>document.querySelector(s);
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths={home:'M3 10 12 3l9 7v11H3Z M9 21v-8h6v8',calendar:'M8 2v4m8-4v4M3 10h18M4 4h16v17H4Z',files:'M4 3h10l6 6v12H4Z M14 3v6h6M8 13h8m-8 4h6',review:'M9 11l2 2 4-4M6 3h12v18H6Z',publish:'m3 11 18-8-8 18-2-8-8-2Zm8 2L21 3',chart:'M4 3v18h17M8 16v-5m5 5V7m5 9V4',plus:'M12 5v14M5 12h14',arrow:'M5 12h14m-5-5 5 5-5 5',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',down:'m6 9 6 6 6-6',up:'m6 15 6-6 6 6',check:'m5 12 4 4L19 6',close:'m6 6 12 12M6 18 18 6',search:'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',link:'m10 13 4-4M8 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l5-5a4 4 0 0 0-5-5l-2 2',menu:'M3 6h18M3 12h18M3 18h18',settings:'M12 3v3m0 12v3M3 12h3m12 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',database:'M3 5c0-4 18-4 18 0s-18 4-18 0Zm0 0v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0',alert:'M12 3 2 21h20L12 3Zm0 6v5m0 3v1',image:'M3 3h18v18H3Zm0 14 5-5 4 4 3-3 6 6M15 7h1',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',refresh:'M20 7V2m0 5h-5M4 17v5m0-5h5M4 8a8 8 0 0 1 14-3l2 2M4 17l2 2a8 8 0 0 0 14-3',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0'};
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.files}"/></svg>`;
  const labels={draft:'Draft','in-review':'In review','changes-requested':'Changes requested',approved:'Approved','revision-needed':'New version needed'};
  const pill=p=>`<span class="status ${C.status(p)}">${e(labels[C.status(p)])}</span>`;
  const btn=(text,action,style='',attrs='')=>`<button type="button" class="btn ${style}" data-action="${action}" ${attrs}>${text}</button>`;
  const empty=(title,description,action='')=>`<div class="empty">${icon('files')}<h2>${title}</h2><p>${description}</p>${action}</div>`;
  const dateLabel=(s,opts={month:'short',day:'numeric'})=>s?new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{...opts,timeZone:'UTC'}):'Date not set';
  const stamp=s=>new Date(s).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const modal=$('#modal');let state,ui={brand:localStorage.getItem('jml-published-workspace:jmlActiveBrand')||'brand_b4k',actor:'Workspace member',role:'agency',route:'today',post:null,tab:'brief',search:'',platform:'all',filter:'all',calendar:'month',anchor:today(),analytics:'sample',reviewFilter:'in-review'},dirty=false,busy=false,selectedVersion=null,slide=0,staged=[],uploading=false,returnFocus=null;
  const expandedNav=new Set();let renderedHash=location.hash,routeChange=0;
  try{Object.assign(ui,JSON.parse(localStorage.getItem('jml-published-workspace:jml-workspace-preferences')||'{}'));}catch{}
  function remember(){try{localStorage.setItem('jml-published-workspace:jml-workspace-preferences',JSON.stringify({brand:ui.brand,personId:ui.personId,actor:ui.actor,role:ui.role,calendar:ui.calendar,anchor:ui.anchor,analytics:ui.analytics}));}catch{}}
  const isPreview=()=>['client','viewer'].includes(ui.role);
  const previewRoutes=['today','review','learn'];
  const roleNames={agency:'Agency workspace',client:'Client reviewer',viewer:'Read-only viewer'};
  function suggestedReviewer(){
    return state.brands.find(b=>b.id===ui.brand)?.operations?.foundation?.finalApprover ||
      scoped().find(p=>C.status(p)==='in-review'&&p.brief.approver)?.brief.approver || 'Client reviewer';
  }
  function scoped(){return state.posts.filter(p=>p.brandId===ui.brand&&(!G||G.can(state,ui,'read',p)));}
  function post(){return state.posts.find(p=>p.id===ui.post);}
  function filtered(){return scoped().filter(p=>(ui.platform==='all'||p.platform===ui.platform)&&(ui.filter==='all'||C.status(p)===ui.filter)&&(!ui.search||[p.title,p.id,p.brief.caption,p.brief.owner].join(' ').toLowerCase().includes(ui.search.toLowerCase()))).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.title.localeCompare(b.title));}
  function thumb(p,cls='thumb',v=C.latest(p)){const a=v?.assets.find(a=>a.type==='image')||v?.assets[0];return a?a.type==='video'?`<video class="${cls}" src="${e(S.mediaURL(a.url))}" preload="metadata" muted aria-label="${e(a.alt||p.title)}"></video>`:`<img class="${cls}" src="${e(S.mediaURL(a.url))}" alt="${e(a.alt||p.title)}" loading="lazy">`:`<div class="no-art">${icon('image')}<span>Creative to come</span></div>`;}
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
  function showModal(title,body,actions=''){if(!modal.open)returnFocus=document.activeElement;modal.innerHTML=`<div class="modal-head"><h2 id="modal-title">${title}</h2>${btn(icon('close'),'close','icon-btn ghost','aria-label="Close dialog"')}</div>${body}${actions}`;if(!modal.open)modal.showModal();G?.decorate(ctx);window.JMLFormOptions?.init?.(ctx);}
  function closeModal(){modal.close();modal.innerHTML='';staged=[];uploading=false;returnFocus?.focus?.();}
  function error(message,target='#modal-error'){const el=$(target);if(el){el.textContent=message;el.tabIndex=-1;el.focus();}else toast(message);}
  async function commit(fn,message,options={}){
    if(busy)throw Error('A save is already in progress.');busy=true;
    try{const next=C.clone(state);fn(next);G?.migrate(next);if(options.restore)G?.assert(state,ui,'backup');else if(options.scopedRestore)G?.assertScopedRestore(state,next,ui,options.scopedRestore);else G?.authorizeMutation(state,next,ui);if(!options.restore&&!options.scopedRestore)G?.captureMutation(state,next,ui);next.workspaceId??=C.id('workspace');next.createdAt??=next.updatedAt||C.now();validateWorkspace(next);next.updatedAt=C.now();next.revision=state.revision+1;await S.write(next,state.revision,options.library);state=next;G?.syncContext(state,ui);changes?.postMessage(next.revision);
      if(!state.brands.some(b=>b.id===ui.brand))ui.brand=state.brands[0].id;
      if(options.render!==false){dirty=false;remember();if(modal.open)closeModal();render();}
      if(message)toast(message);}
    finally{busy=false;}
  }
  function get(next,id=ui.post){const p=next.posts.find(p=>p.id===id);if(!p)throw Error('This content item is no longer available.');return p;}
  const draftQueue=new Map();
  let draftTimer;
  let stagedBackup=null;
  let restoreRead=0;
  const changes=typeof BroadcastChannel==='function'?new BroadcastChannel('jml-social-workspace-changes'):null;
  changes?.addEventListener('message',async ev=>{
    if(!state||ev.data<=state.revision||busy)return;
    if(draftQueue.size||modal.open||document.querySelector('#brief-form,#planner-host')||document.activeElement?.matches('input,textarea,select')){
      toast('Another tab saved changes. Reload before submitting this form.');return;
    }
    try{const fresh=await S.read();if(fresh&&fresh.revision>state.revision){validateWorkspace(fresh);state=fresh;parseRoute();render();}}
    catch(err){toast(err.message);}
  });
  function draftKey(id){return 'jml-published-workspace:jml-brief-recovery:'+id;}
  function clearRecovery(){
    draftQueue.clear();
    for(const key of Object.keys(sessionStorage))if(key.startsWith('jml-published-workspace:jml-brief-recovery:'))sessionStorage.removeItem(key);
  }
  function removeRecovery(id){
    draftQueue.delete(id);
    try{sessionStorage.removeItem(draftKey(id));}catch{}
  }
  function pendingDraft(p){
    if(!p)return null;
    if(draftQueue.has(p.id))return draftQueue.get(p.id);
    try{
      const recovery=JSON.parse(sessionStorage.getItem(draftKey(p.id))||'null');
      if(Number.isInteger(recovery?.baseRevision)&&recovery.fields)return recovery;
    }catch{}
    return state.workingDrafts?.[p.id]||null;
  }
  function preserveDraft(){
    const form=$('#brief-form'),p=post();
    if(!form||!p)return true;
    const draft={baseRevision:p.briefRevision,actor:ui.actor,at:C.now(),fields:Object.fromEntries(new FormData(form))};
    draftQueue.set(p.id,draft);
    try{sessionStorage.setItem(draftKey(p.id),JSON.stringify(draft));}catch{}
    dirty=false;
    clearTimeout(draftTimer);draftTimer=setTimeout(writeDrafts,420);
    return true;
  }
  async function writeDrafts(){
    if(!draftQueue.size)return true;
    if(busy){draftTimer=setTimeout(writeDrafts,150);return false;}
    const pending=new Map(draftQueue);
    if([...pending].some(([id,draft])=>state.posts.find(p=>p.id===id)?.briefRevision!==draft.baseRevision)){
      toast('A brief changed in another revision. Review the recovered text before saving.');return false;
    }
    try{
      await commit(next=>{
        next.workingDrafts??={};
        for(const [id,draft] of pending){
          const p=next.posts.find(item=>item.id===id);
          if(!p||draft.baseRevision!==p.briefRevision)continue;
          next.workingDrafts[id]=draft;
        }
      },'',{render:false});
      for(const [id,draft] of pending)if(draftQueue.get(id)===draft)removeRecovery(id);
      if($('#dirty-label')&&!draftQueue.has(ui.post))$('#dirty-label').textContent='Working draft saved on this device';
      return true;
    }catch(err){
      if($('#dirty-label'))$('#dirty-label').textContent='Save failed · text retained in this tab';
      toast(err.message);return false;
    }
  }
  function restoreDraft(){
    const form=$('#brief-form'),p=post(),draft=pendingDraft(p);
    if(!form||!draft)return;
    const stale=draft.baseRevision!==p.briefRevision;
    if(!stale)for(const [name,value] of Object.entries(draft.fields)){
      const field=form.elements.namedItem(name);if(field)field.value=value;
    }
    const label=$('#dirty-label');
    label.textContent=stale?'Recovered text from revision '+draft.baseRevision+' · current revision '+p.briefRevision:'Working draft saved · current version '+p.briefRevision;
    if(stale){
      form.dataset.recoveryConflict='true';
      for(const field of form.querySelectorAll('input,select,textarea,button[type="submit"]'))field.disabled=true;
      label.insertAdjacentHTML('afterend',btn('Review recovered text','review-recovery','small'));
    }
    label.insertAdjacentHTML('afterend',btn('Discard draft','clear-draft','small'));
  }

  function validateWorkspace(data){
    C.validate(data);
    window.JMLRelease?.validate?.(data);
    window.JMLOps?.validate?.(data);
    window.JMLPlanner?.validate?.(data);
    window.JMLAgency.validate(data);window.JMLBriefTemplate.validate(data);
    JMLPromptJobs.validate(data);
    G?.validate(data);window.JMLBulk?.validate?.(data);window.JMLResearch?.validate?.(data);window.JMLDemo?.validate?.(data);
    return data;
  }
  async function prepareNavigation(){
    if(dirty&&!preserveDraft())return false;
    return (await window.JMLPlanner?.prepareNavigation?.())!==false;
  }
  async function navigate(hash){
    if(hash==='#main'){document.querySelector('#main')?.focus();return;}
    if(!await prepareNavigation())return;
    location.hash=hash;
  }
  function parseRoute(){
    G?.syncContext(state,ui);
    const [route='today', item='', tab='brief']=location.hash.slice(1).split('/');
    const aliases={calendar:'plan',workspace:'studio',publishing:'publish',analytics:'learn'};
    ui.route=aliases[route]||route||'today';
    ui.section=({calendar:'calendar',workspace:'library',publishing:'packages',analytics:'observations'})[route]||item;
    ui.post=null;
    if(!isPreview()&&['content','review'].includes(ui.route)&&item&&!(ui.route==='review'&&['internal','client','planning','inputs'].includes(item))){
      try{ui.post=decodeURIComponent(item);}catch{ui.post=null;}
    }
    ui.tab=tab;selectedVersion=null;slide=0;
    if(isPreview()){
      if(!previewRoutes.includes(ui.route))ui.route='today';
      ui.post=null;ui.section=ui.route==='review'&&['client','planning','inputs'].includes(item)?item:'';
    }else if(ui.post && post()){if(G&&!G.can(state,ui,'read',post())){ui.post=null;ui.route='today';toast('This item is outside your account or assignment access.');}else ui.brand=post().brandId;}
    if(!state.brands.some(b=>b.id===ui.brand))ui.brand=state.brands[0].id;
    G?.syncContext(state,ui);
    window.JMLNavigation?.activate(ctx,expandedNav);
    remember();
  }
  async function setBrand(id){
    if(!state.brands.some(b=>b.id===id)||id===ui.brand||G&&!G.membership(state,ui,id))return;
    if(!await prepareNavigation()){render();return;}
    ui.brand=id;G?.syncContext(state,ui);ui.search='';ui.filter='all';ui.platform='all';ui.post=null;
    remember();
    if(ui.route==='content')navigate('#studio/library');
    else if(ui.route==='review'&&ui.section&&!['internal','client','planning','inputs'].includes(ui.section))navigate('#review');
    else render();
  }
  const ctx={
    get state(){return state;}, getState:()=>state, ui,C,commit,render,navigate,toast,e,scoped,setBrand,
    showModal,closeModal,btn,heading,post,icon,download,formModal,input,textArea,selectField,today,prepareNavigation
  };
  function toggleMenu(open){
    const menu=$('.sidebar'),trigger=$('.menu-button');
    menu.classList.toggle('open',open);trigger.setAttribute('aria-expanded',String(open));
    if(open)menu.querySelector('.mobile-dismiss').focus();else trigger.focus();
  }
  document.addEventListener('keydown',ev=>{
    if(ev.key==='Escape' && $('.sidebar.open'))toggleMenu(false);
  });
  function heading(kicker,title,desc,actions=''){return `<header class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${desc}</p></div><div class="actions">${actions}</div></header>`;}
  function exampleNotice(){
    if(ui.brand!=='demo')return '';
    const cases=state.brands.find(b=>b.id==='demo')?.demoScenarios?.cases;
    const openCase=item=>{
      if(item.placementId)return '<button type="button" class="link-btn" data-rl="placement" data-key="'+e(item.placementId)+'">'+e(item.title)+'</button>';
      const route=item.batchId?'learn/results':item.view==='review'?'review/'+encodeURIComponent(item.contentId):item.contentId?'content/'+encodeURIComponent(item.contentId)+'/'+(item.requestId?'requests':'workflow'):'studio';
      return '<a class="link-btn" href="#'+route+'">'+e(item.title)+'</a>';
    };
    const controls=cases?'<details><summary>Explore sample scenarios</summary><ul>'+cases.map(item=>'<li>'+openCase(item)+'</li>').join('')+'</ul></details>':btn('Load sample scenarios','demo-scenarios','small');
    return '<div class="notice">'+icon('eye')+'<div><strong>Demo studio</strong><p>Try approvals, production routes, an uncertain release and incomplete measurements using example records.</p>'+controls+'</div></div>';
  }
  function filterBar(extra=''){return `<div class="toolbar"><div class="filter-group"><label class="search-box"><span class="hidden">Search content</span>${icon('search')}<input id="search" type="search" aria-label="Search content" placeholder="Search content, caption or owner" value="${e(ui.search)}"></label><select id="platform-filter" aria-label="Filter by platform"><option value="all">All platforms</option>${[...new Set(scoped().map(p=>p.platform))].sort().map(x=>`<option ${x===ui.platform?'selected':''}>${e(x)}</option>`).join('')}</select><select id="status-filter" aria-label="Filter by workflow status"><option value="all">All statuses</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${k===ui.filter?'selected':''}>${v}</option>`).join('')}</select></div>${extra}</div>`;}
  function row(p){return `<a href="#content/${encodeURIComponent(p.id)}/brief" class="list-row">${thumb(p,'row-img')}<div class="row-body"><strong>${e(p.title)}</strong><p>${e(p.platform)} · ${dateLabel(p.date)} · ${e(p.brief.owner||'Unassigned')}</p></div>${pill(p)}${icon('right')}</a>`;}
  function render(){
    const sidebarScroll=$('.sidebar')?.scrollTop||0;
    G?.syncContext(state,ui);
    if(G&&!G.membership(state,ui)){document.getElementById('app').innerHTML='<main class="page"><h1>No account access</h1><p>This person has no active brand membership. Select another preview person or ask an agency administrator to add access.</p><button class="btn" data-action="profile">Preview another person</button></main>';remember();return;}
    const brand=state.brands.find(b=>b.id===ui.brand)||state.brands[0];
    window.JMLAgency.applyTheme(brand);
    const active=ui.route==='content'?'studio':ui.route;
    const nav=[['today','Today','home'],['plan','Content Planner','calendar'],['studio','Studio','files'],['review','Review','review'],['publish','Publish','publish'],['learn','Learn','chart']].filter(([id])=>(!isPreview()||previewRoutes.includes(id))&&(!G||G.routeAllowed(state,ui,id)));
    let body;
    if(isPreview())body=(ui.route==='today'?(G?.view(ctx,'inbox')||'')+JMLAttention.view(ctx):'')+JMLPersonas.view(ctx);
    else if(G&&!G.routeAllowed(state,ui,ui.route,ui.section))body=heading('Workspace access','This work belongs to another function','Select an assigned task in Today or an available view.');
    else switch(ui.route){
      case 'content': body=contentView();break;
      case 'plan': {
        const section=['foundation','research','strategy','schedule','import',...(JMLPlanner.sections||[]).map(s=>s.key)].includes(ui.section)?ui.section:'calendar';
        body=(section==='foundation'?JMLBriefTemplate.link(ctx):'')+(['foundation','research','strategy'].includes(section)?(window.JMLResearch?.view(ctx,section)||JMLOps.view(ctx,'plan')):section==='import'?(window.JMLBulk?.view(ctx)||''):section==='schedule'?calendarView():JMLPlanner.markup(ctx,section));break;
      }
      case 'studio': {
        const section=ui.section==='library'?'library':'board';
        body=section==='board'?JMLOps.view(ctx,'board'):workspaceView();break;
      }
      case 'review': {const section=ui.post&&post()?'client':['internal','client','planning'].includes(ui.section)?ui.section:'internal';body=section==='internal'?internalQaView():section==='planning'?JMLOps.view(ctx,'review'):reviewView();break;}
      case 'publish': {
        const section=ui.section==='packages'?'packages':'desk';
        body=section==='desk'?JMLRelease.view(ctx,'publish'):publishingView();break;
      }
      case 'learn': {
        const section=ui.section==='observations'?'observations':'results';
        body=section==='results'?JMLRelease.view(ctx,'learn'):analyticsView();break;
      }
      case 'resources': body=JMLAgency.resources(ctx)+JMLPromptJobs.view(ctx);break;
      case 'accounts': body=ui.section==='people'?G.view(ctx):ui.section==='brief-template'?heading('Client accounts','Brand brief settings','Manage the social brief template for this account.')+JMLBriefTemplate.link(ctx):JMLAgency.accounts({...ctx,state:{...state,brands:G?G.brands(state,ui):state.brands}});break;
      default: body=(G?.view(ctx,'inbox')||'')+todayView()+JMLOps.view(ctx,'today')+'<div id="today-followup">'+JMLAttention.view(ctx)+'</div>';
    }
    body=(window.JMLDemo?.toolbar?.(ctx)||'')+body;
    $('#app').innerHTML=`<div class="shell"><aside class="sidebar" id="workspace-nav" aria-label="Workspace navigation"><button type="button" class="mobile-dismiss" data-action="menu" aria-label="Close navigation">${icon('close')}</button><div class="identity"><img src="social-workspace/jml-mark.svg" alt="Jay Marketing Lab"><div><small>JAY MARKETING LAB</small><strong>Social workspace</strong></div></div><div class="side-caption">Workspace</div>${JMLNavigation.main(ctx,expandedNav)}${JMLNavigation.bottom(ctx,expandedNav)}</aside><div class="main-shell"><div class="topbar"><div class="brand-select">${btn(icon('menu'),'menu','icon-btn ghost menu-button','aria-label="Toggle navigation" aria-expanded="false" aria-controls="workspace-nav"')}<span class="brand-avatar">${e(brand.initials)}</span><label><span>Client account</span><select id="brand-select" aria-label="Active workspace" ${(G?G.brands(state,ui):state.brands).length<2?'disabled':''}>${(G?G.brands(state,ui):state.brands).map(b=>`<option value="${e(b.id)}" ${b.id===ui.brand?'selected':''}>${e(b.name)}</option>`).join('')}</select></label></div><div class="top-actions"><span class="save-indicator">${icon('check')}Saved in this browser</span><button class="profile" data-action="profile" aria-label="Switch person: ${e(ui.actor)}" aria-haspopup="dialog"><span class="profile-copy"><span class="profile-purpose">Switch person</span><span class="profile-name">${e(ui.actor)}</span></span><span class="avatar">${e(ui.actor.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase())}</span>${icon('down')}</button></div></div><main id="main" class="page ${ui.route==='plan'&&body.includes('planner-host')?'planner-page':''}" tabindex="-1">${body}<footer class="screen-footer"><span>${e(brand.name)}</span><span>Stored on this device</span></footer></main></div></div>`;
    $('.sidebar').scrollTop=sidebarScroll;renderedHash=location.hash;
    if(isPreview()){JMLPersonas.mount(ctx);JMLRelease.mount(ctx);}
    else{
      JMLOps.mount(ctx);
      JMLRelease.mount(ctx);
      JMLPlanner.mount(ctx);
      JMLPromptJobs.mount(ctx);
    }
    if(ui.route==='content'&&ui.tab==='brief')restoreDraft();
    window.JMLBulk?.init?.(ctx);window.JMLResearch?.init?.(ctx);G?.decorate(ctx);window.JMLFormOptions?.init?.(ctx);window.JMLPlannerInsights?.init?.(ctx);remember();
    document.title=(nav.find(x=>x[0]===active)?.[1]||'Content')+' · '+brand.name+' · JML';
  }
  function todayView(){
    const all=scoped(),reviews=all.filter(p=>C.status(p)==='in-review'),approved=all.filter(C.isApproved),requests=all.flatMap(p=>p.requests.filter(r=>!['accepted','cancelled'].includes(r.state)).map(r=>({p,r}))),changes=all.filter(p=>['changes-requested','revision-needed'].includes(C.status(p))),upcoming=all.filter(p=>p.date>=today()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5),featured=reviews[0]||all.find(p=>C.latest(p))||all[0];
    return heading(dateLabel(today(),{weekday:'long',month:'long',day:'numeric'}),'Today at '+e(state.brands.find(b=>b.id===ui.brand).name),'Upcoming content, outstanding inputs and creative reviews.',btn(icon('plus')+' New content','new','primary'))+exampleNotice()+`<div class="stats">${[[all.length,'Content items','workspace','In this workspace'],[reviews.length,'Awaiting review','review','Ready for a decision'],[approved.length,'Approved creatives','publishing','Ready for publishing handoff'],[requests.length+changes.length,'Needs attention','attention','Open inputs and revisions']].map(([n,t,a,s])=>`<button class="stat" data-action="${a}"><span class="stat-label">${t}</span><b>${n.toString().padStart(2,'0')}</b><small>${s} ${icon('arrow')}</small></button>`).join('')}</div><div class="two-col"><section class="panel"><div class="panel-head"><h2>${reviews.length?'Next creative review':'Pick up where you left off'}</h2><a class="link-btn" href="#review">Review queue ${icon('arrow')}</a></div>${featured?`<div class="review-spotlight"><div>${thumb(featured)}</div><div>${pill(featured)}<h3>${e(featured.title)}</h3><p>${e(featured.platform)} · ${e(featured.format)}<br>${dateLabel(featured.date)} · Version ${C.latest(featured)?.number||'not uploaded'}</p><a class="btn primary" href="#${C.status(featured)==='in-review'?'review':'content'}/${encodeURIComponent(featured.id)}${C.status(featured)==='in-review'?'':'/versions'}">${C.status(featured)==='in-review'?'Review creative':'Open content'} ${icon('arrow')}</a></div></div>`:empty('Start your first content item','Capture an idea, then add a brief and creative version.',btn('New content','new','primary'))}</section><section class="panel" id="attention-queue" tabindex="-1"><div class="panel-head"><h2>Needs your attention</h2><span class="count-note">${requests.length+changes.length} OPEN</span></div>${changes.slice(0,3).map(row).join('')}${requests.slice(0,3).map(({p,r})=>`<a class="list-row" href="#content/${encodeURIComponent(p.id)}/requests">${icon('clock')}<div class="row-body"><strong>${e(r.title)}</strong><p>${e(r.owner)} · Due ${dateLabel(r.due)}</p></div>${icon('right')}</a>`).join('')}${!changes.length&&!requests.length?empty('Nothing blocking the next step','No open media requests or requested revisions.'):''}</section></div><section class="panel section-gap"><div class="panel-head"><h2>Coming up on the calendar</h2><a class="link-btn" href="#calendar">View calendar ${icon('arrow')}</a></div>${upcoming.length?upcoming.map(row).join(''):empty('Your calendar is open','Add a content item or set proposed dates for existing drafts.',`<a class="btn" href="#workspace">Browse content</a>`)}</section>`;
  }
  function calendarView(){
    const list=filtered(),d=new Date(ui.anchor+'T12:00:00Z'),y=d.getUTCFullYear(),m=d.getUTCMonth(),first=`${y}-${String(m+1).padStart(2,'0')}-01`;
    let cells='',visible=list;
    if(ui.calendar!=='list'){
      const start=ui.calendar==='week'?C.addDays(ui.anchor,-((d.getUTCDay()+6)%7)):C.addDays(first,-((new Date(first+'T12:00:00Z').getUTCDay()+6)%7));
      const days=ui.calendar==='week'?7:Math.ceil((((new Date(first+'T12:00:00Z').getUTCDay()+6)%7)+new Date(Date.UTC(y,m+1,0)).getUTCDate())/7)*7;
      for(let i=0;i<days;i++){const day=C.addDays(start,i),items=list.filter(p=>p.date===day);cells+=`<div class="day-cell ${day.slice(0,7)!==first.slice(0,7)?'outside':''} ${day===today()?'is-today':''}"><div class="day-number"><b>${ui.calendar==='week'?dateLabel(day,{weekday:'short',day:'numeric'}):Number(day.slice(-2))}</b><button data-action="new" data-date="${day}" aria-label="Add content on ${day}">+</button></div>${items.map(p=>`<a class="calendar-item ${C.status(p)}" href="#content/${encodeURIComponent(p.id)}/brief">${ui.calendar==='week'?thumb(p):''}<small>${e(p.time)} · ${e(p.platform)}</small>${e(p.title)}</a>`).join('')}</div>`;}
    }
    return heading('Plan / calendar','Content schedule','Select a date or open a content item to edit its brief.',btn(icon('plus')+' New content','new','primary'))+filterBar(`<span class="count-note">${list.length} MATCHING ITEMS</span>`)+`<div class="toolbar"><div class="calendar-nav">${btn(icon('left'),'prev','icon-btn','aria-label="Previous period"')}<h2>${ui.calendar==='week'?dateLabel(ui.anchor,{month:'long',day:'numeric',year:'numeric'}):dateLabel(first,{month:'long',year:'numeric'})}</h2>${btn(icon('right'),'next','icon-btn','aria-label="Next period"')}${btn('Today','calendar-today','small')}</div><div class="segmented" aria-label="Calendar view">${['month','week','list'].map(x=>btn(x[0].toUpperCase()+x.slice(1),'calendar-mode',x===ui.calendar?'active':'',`data-mode="${x}" aria-pressed="${ui.calendar===x}"`)).join('')}</div></div>${ui.calendar==='list'?contentTable(visible):`<div class="calendar ${ui.calendar==='week'?'is-week':''}"><div class="weekday-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<span>${x}</span>`).join('')}</div><div class="${ui.calendar==='week'?'week-grid':'month-grid'}">${cells}</div></div>`}${list.some(p=>!p.date)?`<section class="panel section-gap"><div class="panel-head"><h2>Without a date</h2><span class="count-note">${list.filter(p=>!p.date).length} ITEMS</span></div>${list.filter(p=>!p.date).map(row).join('')}</section>`:''}<p class="source-note">Times use each content item’s saved time zone. Proposed calendar dates do not create a publishing schedule.</p>`;
  }
  function contentTable(items){return items.length?`<div class="table-wrap"><table><thead><tr><th>Content</th><th>Platform</th><th>Proposed date</th><th>Owner</th><th>Status</th></tr></thead><tbody>${items.map(p=>`<tr><td><a href="#content/${encodeURIComponent(p.id)}/brief">${e(p.title)}</a><small>${e(p.id)}</small></td><td>${e(p.platform)}<small>${e(p.format)}</small></td><td>${dateLabel(p.date)}<small>${e(p.time)} · ${e(p.timezone)}</small></td><td>${e(p.brief.owner||'Unassigned')}</td><td>${pill(p)}</td></tr>`).join('')}</tbody></table></div>`:empty('No matching content','Try another filter or add your first idea.',btn('Clear filters','clear'))}
  function workspaceView(){const items=filtered();return heading('Create / content workspace','Content library','Open a brief, compare creative versions or check a media request.',btn(icon('plus')+' New content','new','primary'))+filterBar(`<span class="count-note">${items.length} CONTENT ITEMS</span>`)+(items.length?`<div class="gallery">${items.map(p=>`<a class="content-card" href="#content/${encodeURIComponent(p.id)}/brief"><div class="card-cover">${thumb(p)}${pill(p)}</div><div class="card-copy"><div class="meta">${e(p.platform.toUpperCase())} / ${e(p.format.toUpperCase())}</div><h2>${e(p.title)}</h2><div class="card-footer"><span>${dateLabel(p.date)}</span><span>${C.latest(p)?'V'+C.latest(p).number:'No files yet'} ${icon('arrow')}</span></div></div></a>`).join('')}</div>`:empty('A place for your next idea','Create a brief and upload the first version, or clear the current filters.',btn('New content','new','primary')+' '+btn('Clear filters','clear')));}
  function input(label,name,value,type='text',full=false){return `<label class="${full?'full':''}">${label}<input name="${name}" type="${type}" value="${e(value)}" ${['title'].includes(name)?'required':''}></label>`;}
  function textArea(label,name,value,full=true,rows=4){return `<label class="${full?'full':''}">${label}<textarea name="${name}" rows="${rows}">${e(value)}</textarea></label>`;}
  function selectField(label,name,values,value){return `<label>${label}<select name="${name}">${[...new Set([...values,value].filter(Boolean))].map(v=>`<option ${v===value?'selected':''}>${e(v)}</option>`).join('')}</select></label>`;}
  function contentView(){const p=post();if(!p)return empty('Content not found','This record may belong to a different backup.',`<a href="#workspace" class="btn">Back to content</a>`);return `<div class="breadcrumbs"><a href="#workspace">Content workspace</a>${icon('right')}<span>${e(p.id)}</span>${p.example?'<span class="badge-example">EXAMPLE</span>':''}</div><header class="page-heading content-heading"><div><div class="eyebrow">${e(p.platform)} / ${e(p.format)}</div><h1>${e(p.title)}</h1><p>${pill(p)} <span class="muted"> · ${dateLabel(p.date)} · ${e(p.brief.owner||'Owner not assigned')}</span></p></div><div class="actions">${btn(icon('upload')+' Upload version','upload-version','primary')}</div></header>${G?.content(ctx,p)||''}${ui.tab==='versions'?versionsView(p):ui.tab==='workflow'?JMLOps.view(ctx,'workflow'):ui.tab==='history'?(G?G.view(ctx,'history'):JMLOps.view(ctx,'history')+historyView(p)):ui.tab==='requests'?requestsView(p):briefView(p)+(window.JMLBulk?.content?.(ctx,p)||'')+(window.JMLResearch?.content?.(ctx,p)||'')}`;}
  function briefView(p){const b=p.brief,gaps=C.readiness(p);return `<div class="workspace-grid"><form id="brief-form" class="panel"><div class="panel-head"><h2>The creative brief</h2><span class="count-note">REVISION ${p.briefRevision}</span></div><div class="panel-body"><div class="form-section"><h3>What are we making?</h3><div class="form-grid">${input('Content title','title',p.title,'text',true)}${selectField('Platform','platform',['Instagram','Facebook','LinkedIn','TikTok','YouTube'],p.platform)}${selectField('Format','format',['Photo','Carousel','Story','Reel','Video','Text post','Document'],p.format)}${JMLBriefTemplate.existingNative(p,'objective')?textArea('Objective','objective',b.objective):''}${JMLBriefTemplate.existingNative(p,'audience')?input('Audience','audience',b.audience):''}${JMLBriefTemplate.existingNative(p,'cta')?input('Call to action','cta',b.cta):''}${input('Content pillar','pillar',b.pillar)}${input('Campaign','campaign',b.campaign)}</div></div><div class="form-section"><h3>Copy and creative direction</h3><div class="form-grid">${JMLBriefTemplate.existingNative(p,'caption')?textArea('Working caption','caption',b.caption,true,7):''}${JMLBriefTemplate.existingNative(p,'direction')?textArea('Visual direction and reference notes','direction',b.direction):''}${textArea('Slide copy or video script','slideCopy',b.slideCopy)}</div></div><div class="form-section"><h3>People and timing</h3><div class="form-grid">${input('Content owner','owner',b.owner)}${input('Final approver','approver',b.approver)}${input('Proposed publication date','date',p.date,'date')}${input('Local publication time','time',p.time,'time')}${selectField('Time zone','timezone',['America/Los_Angeles','America/New_York','Europe/London','Asia/Tehran','UTC'],p.timezone)}</div></div>${JMLBriefTemplate.editFields(ctx,p)}<div id="brief-error" class="form-error" role="alert"></div></div><div class="form-footer"><small id="dirty-label">All changes saved</small><button class="btn primary" type="submit">${icon('check')}Save brief version</button></div></form><aside class="side-info"><section class="panel"><div class="panel-head"><h2>Ready for review?</h2></div><div class="panel-body"><p>${gaps.length?`${gaps.length} item${gaps.length===1?'':'s'} to resolve before submitting creative.`:'The brief is ready. Upload and check the creative before submission.'}</p><ul class="checklist">${gaps.length?gaps.map(g=>`<li>${icon('alert')}<span>${e(g)}</span></li>`).join(''):`<li>${icon('check')}<span>Current brief approved and inputs resolved.</span></li>`}</ul>${p.planApproval?.revision===p.briefRevision?`<div class="notice success"><div><strong>${p.planApproval.kind==='production-readiness'?'Production brief accepted':'Plan approved'}</strong><br>${e(p.planApproval.actor)} · ${stamp(p.planApproval.at)}</div></div>`:btn('Approve current plan','approve-plan','',dirty?'disabled':'')}<p class="source-note">${p.planApproval?.kind==='production-readiness'?'Operations accepted this production brief against the approved calendar. Calendar approval and final creative approval are separate decisions.':'Plan approval covers this brief revision. The finished creative requires a separate decision.'}</p><div class="next-step"><a href="#content/${encodeURIComponent(p.id)}/versions" class="link-btn">Open creative versions ${icon('arrow')}</a></div></div></section><section class="panel section-gap"><div class="panel-head"><h2>Source record</h2></div><div class="panel-body"><p class="source-note">${e(p.source)}</p><p class="source-note">Date provenance: ${e(p.dateNote||'Proposed in this workspace')}</p>${p.sources.filter(s=>/^https?:\/\//.test(s)).map((s,i)=>`<a class="link-btn" href="${e(s)}" target="_blank" rel="noopener">Source ${i+1} ${icon('arrow')}</a>`).join('')}</div></section></aside></div>`;}
  function mediaPreview(p,v){if(v&&p.format==='Text post'&&!v.assets.length)return `<article class="text-post-preview"><header><strong>${e(state.brands.find(b=>b.id===p.brandId)?.name||'Content')}</strong><span>${e(p.platform)} · Text post</span></header><div class="caption">${e(v.caption)}</div><footer>Version ${v.number} · No attachment required</footer></article>`;if(!v?.assets.length)return empty('No creative uploaded','Upload images or video to create the first version.');slide=Math.min(slide,v.assets.length-1);const a=v.assets[slide];return `<div class="media-stage">${a.type==='video'?`<video src="${e(S.mediaURL(a.url))}" controls preload="metadata" aria-label="${e(a.alt||a.name)}"></video>`:`<img src="${e(S.mediaURL(a.url))}" alt="${e(a.alt||a.name)}">`}</div><div class="media-controls">${btn(icon('left'),'slide-prev','icon-btn ghost',`aria-label="Previous asset" ${slide===0?'disabled':''}`)}<span>${slide+1} / ${v.assets.length} · ${a.type==='video'?'VIDEO':'IMAGE'}</span>${btn(icon('right'),'slide-next','icon-btn ghost',`aria-label="Next asset" ${slide===v.assets.length-1?'disabled':''}`)}</div>`;}
  function versionsView(p){const v=p.versions.find(v=>v.id===selectedVersion)||C.latest(p);if(!v)return `<section class="panel">${empty('The brief is ready for a creative version','Upload images or video, save the exact caption, and keep the whole package together.',btn(icon('upload')+' Upload first version','upload-version','primary'))}</section>`;return `<div class="toolbar"><div class="version-select"><label>Viewing version<select id="version-select">${p.versions.slice().reverse().map(x=>`<option value="${x.id}" ${x.id===v.id?'selected':''}>Version ${x.number} · ${labels[x.state]||x.state}</option>`).join('')}</select></label><span class="count-note">${stamp(v.createdAt)}</span></div><div class="actions">${p.versions.length>1?btn(icon('eye')+' Compare versions','compare'):''}${btn(icon('plus')+' Create revision','upload-version')}</div></div>${v.briefRevision!==p.briefRevision?`<div class="notice warning">${icon('alert')}<div>This version uses brief revision ${v.briefRevision}. Create a new creative version against the current brief (${p.briefRevision}) before review.</div></div>`:''}<div class="version-layout"><section class="panel"><div class="panel-head"><h2>Version ${v.number} preview</h2><span class="count-note">${p.format==='Text post'&&!v.assets.length?'TEXT ONLY':v.assets.length+' FILES'}</span></div>${mediaPreview(p,v)}</section><div><section class="panel"><div class="panel-head"><h2>Caption snapshot</h2><span class="status ${v.state}">${e(labels[v.state])}</span></div><div class="panel-body"><div class="caption">${e(v.caption)}</div><div class="definition">${e(v.note)}<br>Saved by ${e(v.creator)} · Brief revision ${v.briefRevision}</div></div></section>${v.id===C.latest(p).id?`<section class="panel section-gap"><div class="panel-head"><h2>Internal quality check</h2></div><div class="panel-body">${v.state==='draft'?`<p>Check the actual files and copy before sending this version to your reviewer.</p><form id="qc-form"><div class="qc-checks">${C.qcKeys.map((k,i)=>`<label><input type="checkbox" name="${k}">${C.qcLabels[i]}</label>`).join('')}</div><div class="form-error" id="qc-error" role="alert"></div><button class="btn primary" type="submit">Send for review ${icon('arrow')}</button></form>`:`<p>${v.state==='approved'?'This creative version has been approved.':v.state==='in-review'?'This version is waiting for a review decision.':'Save a new version to address the requested changes.'}</p><a class="btn" href="#review/${encodeURIComponent(p.id)}">View review and feedback ${icon('arrow')}</a>`}</div></section>`:''}</div></div>`;}
  function historyView(p){return `<section class="panel"><div class="panel-head"><h2>A record of the work</h2><span class="count-note">${p.history.length} EVENTS</span></div><div class="panel-body history">${p.history.slice().reverse().map(h=>`<article class="history-event"><h3>${e(h.action)}</h3><p>${e(h.detail)}</p><small>${e(h.actor)} · ${stamp(h.at)}</small></article>`).join('')}</div></section>`;}
  function requestsView(p){return `<div class="toolbar"><p>Track the inputs needed for this content item.</p>${btn(icon('plus')+' Add media request','request','primary')}</div>${p.requests.length?`<section class="panel">${p.requests.map(r=>`<div class="list-row"><div class="row-body"><strong>${e(r.title)}</strong><p>${e(r.owner)} · Due ${dateLabel(r.due)} · ${e(r.state)}</p><p>${e(r.note)}</p></div>${!['accepted','cancelled'].includes(r.state)?btn('Update','request-update','small',`data-request="${e(r.id)}"`):'<span class="status">'+e(r.state)+'</span>'}</div>`).join('')}</section>`:`<section class="panel">${empty('All the inputs, accounted for','Add a request when a photo, video, caption, or reference is still needed. No message is sent to the owner.')}</section>`}`;}
  function internalQaView(){const items=scoped().filter(p=>{const v=C.latest(p);return v?.state==='draft'&&v.briefRevision===p.briefRevision&&(!G||G.can(state,ui,'qa',p)||G.can(state,ui,'coordinate',p));});return heading('Review / Internal QA','Internal quality review','Check the current files, caption and production requirements before client submission.')+'<section class="panel">'+(items.length?items.map(p=>'<article class="list-row"><div class="row-body"><strong>'+e(p.title)+'</strong><p>V'+C.latest(p).number+' · '+e(p.production?.qcReviewer||'Reviewer not assigned')+(C.latest(p).internalFailure?' · Correction requested':'')+'</p></div><a class="btn small" href="#content/'+encodeURIComponent(p.id)+'/versions">Open exact version</a></article>').join(''):'<p class="panel-body">No current creative drafts await internal QA.</p>')+'</section>'; }
  function reviewView(){
    const queue=scoped().filter(p=>ui.reviewFilter==='all'?p.versions.length:C.status(p)===ui.reviewFilter);
    const p=post()||queue[0],v=p?C.latest(p):null;
    return heading('Decide / review','Creative review','Review the submitted files and caption, then record your decision.')+`<div class="toolbar"><div class="segmented">${[['in-review','Awaiting review'],['changes-requested','Changes requested'],['all','All versions']].map(([k,l])=>btn(l,'review-filter',k===ui.reviewFilter?'active':'',`data-filter="${k}" aria-pressed="${ui.reviewFilter===k}"`)).join('')}</div><span class="count-note">${queue.length} ITEMS</span></div>${!v?`<section class="panel">${empty('Nothing waiting here','Complete the internal checklist in Creative versions to send content for review.',`<a href="#workspace" class="btn">Open content workspace</a>`)}</section>`:`<div class="review-grid"><aside class="panel review-queue"><div class="panel-head"><h2>Review queue</h2></div>${queue.map(x=>`<a href="#review/${encodeURIComponent(x.id)}" class="queue-item ${p.id===x.id?'active':''}">${pill(x)}<h3>${e(x.title)}</h3><small>${e(x.platform)} · V${C.latest(x)?.number||1}</small></a>`).join('')}${!queue.length?'<p class="panel-body muted">No other items in this filter.</p>':''}</aside><div><div class="toolbar"><div><div class="eyebrow">${e(p.platform)} / VERSION ${v.number}${p.example?' / EXAMPLE':''}</div><h2>${e(p.title)}</h2></div><a class="link-btn" href="#content/${encodeURIComponent(p.id)}/versions">Open workspace ${icon('arrow')}</a></div><div class="version-layout"><section class="panel">${mediaPreview(p,v)}</section><section class="panel"><div class="panel-head"><h2>Caption & decision</h2>${pill(p)}</div><div class="panel-body"><div class="caption">${e(v.caption)}</div>${C.status(p)==='in-review'?`<form id="decision-form" data-post="${e(p.id)}" class="decision-form"><label>Reviewer name<input name="actor" required value="${e(ui.actor==='Workspace member'?p.brief.approver:ui.actor)}"></label><label>Feedback<textarea name="comment" placeholder="Explain the change or add an approval note."></textarea><span class="hint">Required when requesting changes.</span></label><div class="form-error" id="decision-error" role="alert"></div><div class="actions"><button class="btn primary" type="submit" name="decision" value="approved">${icon('check')}Approve V${v.number}</button><button class="btn" type="submit" name="decision" value="changes-requested">Request changes</button></div><p class="source-note">Records a local decision for version ${v.number} and brief revision ${v.briefRevision}. Nothing is published.</p></form>`:`<div class="next-step"><p>${C.isApproved(p)?'This exact version is approved for handoff.':C.status(p)==='changes-requested'?'The creator needs to save a revision before the next review.':'This version has not been submitted against the current brief.'}</p><a href="#content/${encodeURIComponent(p.id)}/versions" class="link-btn">Return to creative versions ${icon('arrow')}</a></div>`}</div></section></div><section class="panel section-gap"><div class="panel-head"><h2>Review history</h2>${p.versions.length>1?btn('Compare versions','compare','small',`data-post="${e(p.id)}"`):''}</div>${p.versions.flatMap(x=>x.decisions.map(d=>({...d,number:x.number}))).reverse().map(d=>`<div class="list-row"><div class="row-body"><strong>V${d.number} · ${d.action==='approved'?'Approved':'Changes requested'}</strong><p>${e(d.comment||'Approved without additional comments.')}</p><p>${e(d.actor)} · ${stamp(d.at)}</p></div></div>`).join('')||'<p class="panel-body muted">No creative review decisions recorded.</p>'}</section></div></div>`}`;
  }
  function publishingView(){const all=scoped(),ready=all.filter(C.isApproved),held=all.filter(p=>p.publishing.state==='on-hold'),log=all.filter(p=>p.publishing.state!=='not-queued');const pubLabel={planned:'Local plan', 'handed-off':'Handed off',verified:'Manually verified','on-hold':'On hold','not-queued':'Ready for handoff'};return heading('Deliver / publishing','Approved packages','Prepare the package, record the handoff, and verify the live post.')+`<div class="connection-strip"><div class="connection-label">${icon('publish')}<div><h3>Publishing connections are not set up</h3><p>Plan locally and export approved packages. Publishing remains a manual step.</p></div></div><span class="status">Offline prototype</span></div>${held.length?`<div class="notice warning">${icon('alert')}<div><strong>${held.length} handoff${held.length===1?' is':'s are'} on hold.</strong> Content changed after planning. Review the latest version before resuming.</div></div>`:''}<section class="panel"><div class="panel-head"><h2>Approved and ready</h2><span class="count-note">${ready.length} ITEMS</span></div>${ready.length?ready.map(p=>`<div class="list-row">${thumb(p,'row-img')}<div class="row-body"><strong>${e(p.title)}</strong><p>${e(p.platform)} · V${C.latest(p).number} · ${dateLabel(p.publishing.date||p.date)} · ${e(p.timezone)}</p><p>${pubLabel[p.publishing.state]||e(p.publishing.state)}${p.example?' · Example content':''}</p></div><div class="actions">${btn(icon('download')+' Package','package','small',`data-post="${e(p.id)}"`)}${'<a class="btn small" href="#publish/desk">Publishing desk</a>'}</div></div>`).join(''):empty('Approved creative will appear here','Complete creative approval in Review before preparing a publishing package.',`<a class="btn" href="#review">Open review</a>`)}</section><section class="panel section-gap"><div class="panel-head"><h2>Publishing log</h2><span class="count-note">MANUALLY MAINTAINED</span></div>${log.length?`<div class="table-wrap"><table><thead><tr><th>Content</th><th>Recorded version</th><th>Planned / actual time</th><th>State</th><th>Evidence</th></tr></thead><tbody>${log.map(p=>`<tr><td><a href="#content/${encodeURIComponent(p.id)}/history">${e(p.title)}</a><small>${e(p.platform)}${p.example?' · Example':''}</small></td><td>V${p.versions.find(v=>v.id===p.publishing.versionId)?.number||'—'}${p.publishing.versionId!==C.latest(p)?.id?'<small>Newer version exists</small>':''}</td><td>${dateLabel(p.publishing.date)} · ${e(p.publishing.time)}<small>${e(p.publishing.timezone)}</small></td><td><span class="status">${e(pubLabel[p.publishing.state])}</span></td><td>${/^https:\/\//.test(p.publishing.url)?`<a href="${e(p.publishing.url)}" target="_blank" rel="noopener">Live post ${icon('arrow')}</a>`:'Not recorded'}<small>${e(p.publishing.note)}</small></td></tr>`).join('')}</tbody></table></div>`:empty('No publishing activity yet','Saving a local plan does not schedule a post on a social account.')}</section>`;}
  function analyticsRows(){const ids=new Set(scoped().map(p=>p.id));return state.analytics.filter(r=>ids.has(r.contentId)&&(ui.analytics==='sample'?r.origin==='sample':r.origin!=='sample'));}
  function analyticsView(){
    const rows=analyticsRows(),findings=state.findings.filter(f=>f.brandId===ui.brand);
    const n=v=>v===null?'—':Number(v).toLocaleString();
    const filters=['real','sample'].map(mode=>btn(mode==='real'?'Imported & manual':'Illustrative examples','analytics-mode',ui.analytics===mode?'active':'',`data-mode="${mode}" aria-pressed="${ui.analytics===mode}"`)).join('');
    const list=rows.map(r=>`<tr><td>${e(state.posts.find(p=>p.id===r.contentId)?.title)}<small>${e(r.source)}</small></td><td>${e(r.start)} – ${e(r.end)}</td>${['impressions','reach','interactions','clicks'].map(k=>'<td>'+n(r[k])+'</td>').join('')}</tr>`).join('');
    return heading('Learn','Earlier post observations','Post-level measurements from earlier versions of the workspace.', '<a class="btn primary" href="#learn/results">Open results & growth</a>')+
      '<div class="toolbar"><div class="segmented">'+filters+'</div>'+btn('Export these observations','export-metrics')+'</div>'+
      (rows.length?'<div class="table-wrap"><table><thead><tr><th>Content and source</th><th>Reporting period</th><th>Impressions</th><th>Reach</th><th>Interactions</th><th>Clicks</th></tr></thead><tbody>'+list+'</tbody></table></div>':empty('No earlier observations for this account','Record or import measurements in Results & growth.'))+
      (findings.length?'<section class="panel section-gap"><div class="panel-head"><h2>Earlier learning notes</h2></div>'+findings.map(f=>`<article class="learning-note"><strong>${e(f.observation)}</strong><p>${e(f.evidence)}</p><small>${e(f.action)} · ${e(f.owner)} · ${dateLabel(f.due)}</small></article>`).join('')+'</section>':'');
  }
  function formModal(title,formId,body,submitLabel='Save',attrs=''){showModal(title,`<form id="${formId}" ${attrs}><div class="modal-body">${body}<div id="modal-error" class="form-error" role="alert"></div></div><div class="modal-actions">${btn('Cancel','close')}<button class="btn primary" type="submit">${submitLabel}</button></div></form>`);}
  function newModal(date=''){formModal('Start a content item','new-form',`<p>An idea can start small. Fill out the brief when you’re ready to develop it.</p><div class="form-grid">${input('Title','title','','text',true)}${selectField('Platform','platform',['Instagram','Facebook','LinkedIn','YouTube','TikTok'],'Instagram')}${selectField('Format','format',['Photo','Carousel','Story','Reel','Video','Text post','Document'],'Photo')}${input('Proposed date (optional)','date',date,'date')}${input('Content owner','owner',ui.actor)}</div>${JMLBriefTemplate.newFields(ctx)}`,'Create content');document.getElementById('new-form').dataset.brand=ui.brand;}
  function uploadModal(){const p=post();if(!p)return;staged=C.clone(C.latest(p)?.assets||[]);formModal('Save a new creative version','upload-form',`<p>Each version preserves its files and caption. Start with the previous files, replace them, or add more.</p><label class="upload-zone" id="drop-zone">${icon('upload')}<strong>Drop images or video here</strong><input id="asset-files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"><span>PNG, JPG, WebP, GIF, MP4 or WebM · Up to 30 MB each</span></label><div id="upload-list" class="upload-list"></div><div class="form-grid">${textArea('Exact caption for this version','caption',C.latest(p)?.caption||p.brief.caption,true,6)}${textArea('What changed?','note','',true,2)}</div>`,'Save version');renderStaged();}
  function renderStaged(){const el=$('#upload-list');if(!el)return;el.innerHTML=staged.map((a,i)=>`<div class="upload-item">${a.type==='video'?`<video src="${e(S.mediaURL(a.url))}" preload="metadata" muted></video>`:`<img src="${e(S.mediaURL(a.url))}" alt="Preview of ${e(a.name)}">`}<div><div class="filename">${i+1}. ${e(a.name)}</div><input data-alt="${i}" value="${e(a.alt)}" aria-label="Alt text for ${e(a.name)}" placeholder="Describe the image or video"></div><div class="actions">${btn(icon('up'),'asset-up','small',`data-index="${i}" aria-label="Move file ${i+1} up" ${i===0?'disabled':''}`)}${btn(icon('down'),'asset-down','small',`data-index="${i}" aria-label="Move file ${i+1} down" ${i===staged.length-1?'disabled':''}`)}${btn(icon('close'),'asset-remove','small',`data-index="${i}" aria-label="Remove file ${i+1}"`)}</div></div>`).join('')||'<p class="source-note">No files attached. Text posts can be saved without an image.</p>';}
  async function readFiles(files){
    if(uploading)return;uploading=true;const save=$('#upload-form button[type=submit]');if(save){save.disabled=true;save.textContent='Reading files…';}
    try{const next=[];for(const f of Array.from(files)){
      if(!['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm'].includes(f.type))throw Error(f.name+': choose a supported image or video file.');
      if(f.size>30*1024*1024)throw Error(f.name+' exceeds the 30 MB file limit.');
      const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read '+f.name));reader.readAsDataURL(f);});
      next.push({id:C.id('asset'),name:f.name,type:f.type.startsWith('video')?'video':'image',alt:'',url});
    }
    if(JSON.stringify(state).length+JSON.stringify(staged).length+JSON.stringify(next).length>100*1024*1024)throw Error('This prototype supports a 100 MB JSON workspace. Try smaller media files.');
    staged.push(...next);renderStaged();$('#modal-error').textContent='';
    }catch(err){error(err.message);}finally{uploading=false;if(save){save.disabled=false;save.textContent='Save version';}}
  }
  let comparisonPostId;
  function compareModal(p){
    const vs=p.versions;if(vs.length<2)return;comparisonPostId=p.id;
    function picker(label,selected){return '<label>'+label+'<select data-compare-selector>'+vs.map(v=>'<option value="'+e(v.id)+'" '+(v.id===selected?'selected':'')+'>Version '+v.number+'</option>').join('')+'</select></label>';}
    showModal('Compare creative versions','<div class="modal-body"><div class="form-grid">'+picker('Earlier version',vs.at(-2).id)+picker('Compare with',vs.at(-1).id)+'</div><div class="comparison" id="comparison-results"></div></div>');
    renderCompare();
  }
  function renderCompare(){
    const p=state.posts.find(x=>x.id===comparisonPostId);
    $('#comparison-results').innerHTML=Array.from(modal.querySelectorAll('[data-compare-selector]')).map(select=>{
      const v=p.versions.find(x=>x.id===select.value);
      return '<article><h3>Version '+v.number+'</h3><p class="source-note">'+stamp(v.createdAt)+' · Brief '+v.briefRevision+'</p>'+
      v.assets.map((a,i)=>'<figure>'+(a.type==='image'?'<img loading="lazy" src="'+e(S.mediaURL(a.url))+'" alt="'+e(a.alt||a.name)+'">':'<video controls preload="metadata" src="'+e(S.mediaURL(a.url))+'"></video>')+'<figcaption>'+String(i+1)+' · '+e(a.name)+'</figcaption></figure>').join('')+
      '<div class="caption">'+e(v.caption)+'</div><p>'+e(v.note)+'</p></article>';
    }).join('');
  }
  function requestModal(r){formModal(r?'Update media request':'Request an input','request-form',`<p>This is a local task record. No message will be sent.</p><div class="form-grid">${input('What is needed?','title',r?.title||'','text',true)}${input('Responsible person','owner',r?.owner||'')}${input('Due date','due',r?.due||today(),'date')}${r?selectField('Status','state',['requested','received','accepted','cancelled'],r.state):''}${textArea('Capture instructions, file reference or response','note',r?.note||'')}</div>`,'Save request',r?`data-request="${e(r.id)}"`:'');}
  function dataModal(){
    stagedBackup=null;restoreRead++;
    const report=state.plannerArchive?.report;
    const migration=report ? '<p>First calendar import · '+e(report.added)+' added, '+e(report.matched)+' existing records matched, '+e(report.decisions)+' plan decisions read, '+e(report.skipped)+' skipped.</p>' : '';
    const count=state.posts.reduce((n,p)=>n+p.versions.length,0);
    const sections='<div class="data-section"><h3>Back up your workspace</h3><p id="storage-usage"></p><p>'+state.posts.length+' content items · '+count+' creative versions. JSON includes briefs, history and uploaded files. The portable backup also includes the prepared artwork.</p>'+
      btn(icon('download')+' Export JSON','export-workspace')+' '+btn('Export portable backup','portable')+' '+btn('Export pre-migration backup','export-migration-backup')+migration+'</div>'+
      '<div class="data-section"><h3>Restore or import</h3><p>A workspace backup restores all accounts. A JSON export from the original Content Planner imports just that calendar.</p><label class="file-import">Workspace backup or calendar JSON<input id="workspace-file" type="file" accept=".jmlpack,application/json,.json" required></label><p id="restore-preview" role="status">Choose a file to preview its contents.</p><div id="calendar-conflicts"></div><label id="replace-confirmation" class="check-inline" style="margin-top:15px"><input name="replace" type="checkbox" required>I have exported anything I want to keep.</label></div>'+
      '<div class="data-section"><h3>Start over</h3><p>Reset this prototype to its prepared source content and example workflow.</p>'+btn('Reset prototype data','reset','danger')+'</div>';
    formModal('Workspace & backups','import-workspace-form',sections,'Restore backup');
    $('#import-workspace-form button[type=submit]').disabled=true;
    if(navigator.storage?.estimate)navigator.storage.estimate().then(({usage,quota})=>{
      const label=$('#storage-usage');
      if(label&&Number.isFinite(usage)&&Number.isFinite(quota))label.textContent='Local site storage uses '+(usage/1048576).toFixed(1)+' MB of '+Math.round(quota/1048576).toLocaleString()+' MB available to this site.';
    }).catch(()=>{});
  }
  function download(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  document.addEventListener('click',async ev=>{
    const disclosure=ev.target.closest('[data-nav-toggle]');
    if(disclosure){const key=disclosure.dataset.navToggle,panel=document.getElementById(disclosure.getAttribute('aria-controls'));if(!panel)return;const open=!expandedNav.has(key);if(open)expandedNav.add(key);else expandedNav.delete(key);panel.hidden=!open;disclosure.setAttribute('aria-expanded',String(open));if(disclosure.hasAttribute('aria-label'))disclosure.setAttribute('aria-label',disclosure.getAttribute('aria-label').replace(/^(Expand|Collapse)/,open?'Collapse':'Expand'));return;}
    const link=ev.target.closest('a[href^="#"]');if(link){ev.preventDefault();if(modal.open)closeModal();navigate(link.getAttribute('href'));return;}
    const b=ev.target.closest('[data-action],[data-research-action]');if(!b||b.disabled)return;const action=b.dataset.action||b.dataset.researchAction;
    try{
      if(G&&await G.action(ctx,action,b))return;
      if(await window.JMLDemo?.action?.(ctx,action,b))return;
      if(window.JMLBulk?.action&&await JMLBulk.action(ctx,action,b))return;
      if(window.JMLResearch?.action&&await JMLResearch.action(ctx,action,b))return;
      if(isPreview()&&!['profile','close','menu'].includes(action))return;
      if(['data','portable','export-workspace','export-migration-backup','reset'].includes(action))G?.assert(state,ui,'backup');
      if(['new','upload-version'].includes(action))G?.assert(state,ui,action==='new'?'edit':'produce',post());
      if(['workspace','calendar','review','publishing'].includes(action)){navigate('#'+action);return;}
      if(action==='attention'){
        const target=document.querySelector('#attention-queue');
        if(target){target.scrollIntoView({block:'center'});target.focus();}return;
      }
      if(action==='close'){closeModal();return;}
      if(action==='menu'){toggleMenu(!$('.sidebar').classList.contains('open'));return;}
      if(JMLBriefTemplate.action(ctx,action,b))return;
      if(window.JMLAgency.handles(action)){await window.JMLAgency.action(ctx,action,b);return;}
      if(action==='new'){newModal(b.dataset.date||'');return;}
      if(action==='profile'){
        if(G){G.profile(ctx);return;}
        const options=Object.entries(roleNames).map(([id,label])=>`<option value="${id}" ${id===ui.role?'selected':''}>${label}</option>`).join('');
        formModal('Local role preview','profile-form',`<p>Preview what a team member or client can see for ${e(state.brands.find(b=>b.id===ui.brand).name)}. Actions use the name below and save on this device.</p><label>Workspace role<select name="role">${options}</select></label>${input('Activity name','actor',ui.actor)}`,'Apply role');return;
      }
      if(action==='data'){dataModal();return;}
      if(action==='demo-scenarios'&&ui.brand==='demo'){
        await commit(next=>JMLScenarios.prepare(next),'Example scenarios are ready in Demo studio.');return;
      }
      if(action==='clear'){ui.search='';ui.filter='all';ui.platform='all';render();return;}
      if(action==='calendar-mode'){ui.calendar=b.dataset.mode;remember();render();return;}
      if(action==='calendar-today'){ui.anchor=today();remember();render();return;}
      if(action==='prev'||action==='next'){const n=action==='prev'?-1:1;if(ui.calendar==='week')ui.anchor=C.addDays(ui.anchor,n*7);else{const d=new Date(ui.anchor+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);ui.anchor=d.toISOString().slice(0,10);}remember();render();return;}
      if(action==='approve-plan'){if(dirty||pendingDraft(post())){toast('Save your brief before approving it.');return;}formModal('Approve the current plan','plan-form',`<p>This records approval of brief revision ${post().briefRevision}. Final creative approval is a separate step.</p>${input('Approver name','actor',ui.actor)}`,'Approve plan');return;}
      if(action==='upload-version'){uploadModal();return;}
      if(action==='asset-remove'){staged.splice(Number(b.dataset.index),1);renderStaged();return;}
      if(action==='asset-up'||action==='asset-down'){const i=Number(b.dataset.index),j=i+(action==='asset-up'?-1:1);[staged[i],staged[j]]=[staged[j],staged[i]];renderStaged();return;}
      if(action==='slide-prev'||action==='slide-next'){slide+=action==='slide-prev'?-1:1;render();return;}
      if(action==='clear-draft'){const id=ui.post;await commit(next=>{if(next.workingDrafts)delete next.workingDrafts[id];},'Working draft discarded.');removeRecovery(id);render();return;}
      if(action==='review-recovery'){
        const draft=pendingDraft(post()),form=$('#brief-form');
        if(!draft||!form)return;
        const differences=Object.entries(draft.fields).flatMap(([key,value])=>{
          const field=form.elements.namedItem(key);
          if(!field||field.value===value)return [];
          const label=field.labels?.[0]?.childNodes[0]?.textContent||key;
          return '<section class="data-section"><h3>'+e(label)+'</h3><p>Current version</p><pre class="recovery-copy">'+e(field.value||'Empty')+'</pre><p>Recovered draft</p><pre class="recovery-copy">'+e(value||'Empty')+'</pre></section>';
        });
        showModal('Review recovered brief','<div class="modal-body"><p>Applying the recovered text creates a working draft against revision '+post().briefRevision+'. Save a brief version when you have finished editing.</p>'+differences.join('')+'</div>',
          '<div class="modal-actions">'+btn('Download recovered text','export-recovery')+btn('Use recovered draft','apply-recovery','primary')+'</div>');return;
      }
      if(action==='export-recovery'){const draft=pendingDraft(post());if(draft)download(draft,'recovered-brief-'+post().id+'.json');return;}
      if(action==='apply-recovery'){
        const p=post(),draft=pendingDraft(p),form=$('#brief-form');
        if(!p||!draft||!form)return;
        closeModal();for(const field of form.elements)field.disabled=false;
        for(const [key,value] of Object.entries(draft.fields)){
          const field=form.elements.namedItem(key);if(field)field.value=value;
        }
        preserveDraft();if(await writeDrafts())render();return;
      }
      if(action==='compare'){compareModal(state.posts.find(p=>p.id===(b.dataset.post||ui.post)));return;}
      if(action==='request'){requestModal();return;}
      if(action==='request-update'){requestModal(post().requests.find(r=>r.id===b.dataset.request));return;}
      if(action==='review-filter'){ui.reviewFilter=b.dataset.filter;ui.post=null;if(location.hash!=='#review')location.hash='#review';else render();return;}
      if(action==='package'){const p=state.posts.find(p=>p.id===b.dataset.post);download(C.packageFor(p),p.id+'-v'+C.latest(p).number+'-publishing.json');toast('Publishing manifest exported with approved caption and files.');return;}
      if(action==='analytics-mode'){ui.analytics=b.dataset.mode;remember();render();return;}
      if(action==='export-metrics'){download({kind:'jml-analytics',schemaVersion:1,rows:analyticsRows()},'jml-'+ui.brand+'-analytics.json');return;}
      if(action==='portable'){if(!await writeDrafts())throw Error('Finish saving the working draft before exporting.');b.disabled=true;try{await JMLMemory.exportPortable(state,(n,total)=>{b.textContent='Packing media '+n+' / '+total;});toast('Portable backup downloaded.');}finally{b.textContent='Export portable backup';b.disabled=false;}return;}
      if(action==='export-migration-backup'){G?.assert(state,ui,'backup');const saved=await S.migrationBackup();if(!saved)throw Error('No pre-migration backup was needed on this installation.');download(saved,'jml-before-people-migration.json');return;}
      if(action==='export-workspace'){if(!await writeDrafts())throw Error('Finish saving the working draft before exporting.');download(state,'jml-workspace-'+today()+'.json');toast('Complete JSON backup exported.');return;}
      if(action==='reset'){closeModal();formModal('Reset this prototype?','reset-form',`<p>This deletes local prototype edits and uploaded versions, then restores the source content and demo workflow. Export your current memory before resetting.</p>${btn('Export a backup first','export-workspace')}<label style="margin-top:20px">Type RESET to continue<input name="confirmation" required pattern="RESET" autocomplete="off"></label>`,'Reset prototype');return;}
    }catch(err){error(err.message,modal.open?'#modal-error':'#page-error');}
  });
  document.addEventListener('input',ev=>{
    if(isPreview())return;
    if(ev.target.matches('#search')){ui.search=ev.target.value;const caret=ev.target.selectionStart;render();$('#search').focus();try{$('#search').setSelectionRange(caret,caret);}catch{}return;}
    if(ev.target.closest('#brief-form')){dirty=true;preserveDraft();const el=$('#dirty-label');el.textContent='Saving working draft…';el.classList.add('dirty');return;}
    if(ev.target.dataset.alt!==undefined)staged[Number(ev.target.dataset.alt)].alt=ev.target.value;
  });
  document.addEventListener('change',async ev=>{
    const target=ev.target;
    if(target.id==='gov-history-filter'){document.querySelectorAll('.governance-event').forEach(el=>el.hidden=target.value!=='all'&&el.dataset.eventSource!==target.value);return;}
    try{if(await G?.change?.(ctx,ev))return;if(await window.JMLBulk?.change?.(ctx,ev))return;if(await window.JMLResearch?.change?.(ctx,target))return;}catch(err){error(err.message);return;}
    if(target.matches('#profile-form select[name="role"]')){
      const actor=$('#profile-form [name="actor"]');
      actor.value=target.value==='agency'?(sessionStorage.getItem('jml-published-workspace:jml-agency-actor')||'Workspace member'):suggestedReviewer();
      return;
    }
    if(target.id==='workspace-file'){
      const read=++restoreRead, file=target.files[0], panel=$('#restore-preview');
      const submit=$('#import-workspace-form button[type=submit]'),confirmation=$('#replace-confirmation');
      stagedBackup=null;submit.disabled=true;submit.textContent='Restore backup';
      confirmation.style.display='';confirmation.querySelector('input').required=true;confirmation.querySelector('input').checked=false;
      $('#calendar-conflicts').replaceChildren();
      if(!file){panel.textContent='Choose a backup file.';return;}
      panel.textContent='Checking records and media…';
      try{
        const incoming=await JMLMemory.readBackup(file);
        if(read!==restoreRead||!target.isConnected)return;
        if(incoming?.calendar_items!==undefined){
          const result=JMLPlanner.previewTransfer(state,incoming,C);
          const name=state.brands.find(b=>b.id===incoming.brand_id)?.name;
          stagedBackup={kind:'calendar',file,incoming,revision:state.revision};
          const conflicts=result.conflicts||[];
          const settings=result.settings||{added:0,conflicts:[]};
          panel.textContent=name+' calendar · '+result.added+' new · '+result.updated+' updated · '+result.unchanged+' unchanged · '+settings.added+' new settings. Only this account is included.';
          if(conflicts.length||settings.conflicts.length){
            const details=document.createElement('details'),summary=document.createElement('summary');
            summary.textContent='Review conflicting edits ('+(conflicts.length+settings.conflicts.length)+')';details.append(summary);
            const help=document.createElement('p');help.textContent='Local edits are kept by default. Select a record to apply its imported fields.';details.append(help);
            for(const [group,entries] of [['replaceIds',conflicts],['replaceSettings',settings.conflicts]]){
              for(const conflict of entries){
                const label=document.createElement('label'),check=document.createElement('input');
                label.className='check-inline';check.type='checkbox';check.name=group;check.value=conflict.id;
                label.append(check,document.createTextNode((conflict.title||conflict.id)+' · '+conflict.fields.join(', ')));details.append(label);
              }
            }
            $('#calendar-conflicts').append(details);
          }
          confirmation.style.display='none';confirmation.querySelector('input').required=false;
          submit.textContent='Import calendar';submit.disabled=false;return;
        }
        validateWorkspace(incoming);
        const media=await JMLMemory.checkLibrary(incoming);
        if(read!==restoreRead||!target.isConnected)return;
        stagedBackup={kind:'workspace',file,incoming,library:media.library,revision:state.revision};$('#import-workspace-form button[type=submit]').disabled=false;
        panel.textContent=incoming.brands.length+' accounts · '+incoming.posts.length+' content items · '+incoming.posts.reduce((n,p)=>n+p.versions.length,0)+' creative versions. '+media.description+' Applying this backup replaces '+state.posts.length+' current content items.';
      }catch(err){if(read===restoreRead&&target.isConnected){panel.textContent='Cannot restore this file. '+err.message;}}
      return;
    }
    if(target.matches('[data-compare-selector]')){renderCompare();return;}
    if(target.id==='asset-files'){await readFiles(target.files);return;}
    if(target.id==='brand-select'){await setBrand(target.value);return;}
    if(target.id==='platform-filter'){ui.platform=target.value;render();return;}
    if(target.id==='status-filter'){ui.filter=target.value;render();return;}
    if(target.id==='version-select'){selectedVersion=target.value;slide=0;render();}
  });
  document.addEventListener('dragover',ev=>{if(ev.target.closest('#drop-zone')){ev.preventDefault();$('#drop-zone').classList.add('dragging');}});
  document.addEventListener('dragleave',ev=>{if(ev.target.closest('#drop-zone'))$('#drop-zone').classList.remove('dragging');});
  document.addEventListener('drop',async ev=>{if(ev.target.closest('#drop-zone')){ev.preventDefault();$('#drop-zone').classList.remove('dragging');await readFiles(ev.dataTransfer.files);}});
  document.addEventListener('submit',async ev=>{
    if(ev.target.id.startsWith('demo-')){ev.preventDefault();try{await window.JMLDemo?.submit?.(ctx,ev);}catch(err){error(err.message);}return;}
    if(ev.target.id.startsWith('governance-')||ev.target.hasAttribute('data-research-form')||ev.target.id.startsWith('bulk-')){ev.preventDefault();try{if(await G?.submit(ctx,ev))return;if(await window.JMLBulk?.submit?.(ctx,ev))return;await window.JMLResearch?.submit?.(ctx,ev.target);}catch(err){error(err.message);}return;}
    if(!ev.target.matches('#brief-form,#profile-form,#new-form,#plan-form,#upload-form,#qc-form,#decision-form,#request-form,#import-workspace-form,#reset-form,#account-form,#resource-form,#social-template-form'))return;
    ev.preventDefault();const form=ev.target,data=Object.fromEntries(new FormData(form)),button=ev.submitter;let errorTarget='#modal-error';if(button)button.disabled=true;
    try{
      if(isPreview()&&form.id!=='profile-form')return;
      if(form.id==='social-template-form'){await JMLBriefTemplate.submit(ctx,form,data);return;}
      if(window.JMLAgency.isForm(form.id)){await window.JMLAgency.submit(ctx,form,data);return;}
      if(form.id==='profile-form'){
        if(!data.actor.trim()||!Object.hasOwn(roleNames,data.role))throw Error('Choose a role and enter your activity name.');
        if(ui.role==='agency')sessionStorage.setItem('jml-published-workspace:jml-agency-actor',ui.actor);
        const changedRole=ui.role!==data.role;
        ui.role=data.role;ui.actor=data.actor.trim();remember();closeModal();
        if(changedRole){history.replaceState(null,'','#today');parseRoute();}render();return;
      }
      if(form.id==='new-form'){if(form.dataset.brand!==ui.brand)throw Error('Reopen New content for the selected brand.');G?.assert(state,ui,'edit');const p=C.makePost({...data,brandId:ui.brand,example:ui.brand==='demo',timezone:state.brands.find(b=>b.id===ui.brand).timezone});if(!p.title.trim())throw Error('Enter a title.');JMLBriefTemplate.start(ctx,p,form,data);await commit(next=>next.posts.push(p),'Content created.');navigate('#content/'+encodeURIComponent(p.id)+'/brief');return;}
      if(form.id==='brief-form'){
        clearTimeout(draftTimer);
        errorTarget='#brief-error';if(!data.title.trim())throw Error('Enter a title.');
        const current=post();
        const fields={...data,brief:{...Object.fromEntries(['objective','audience','cta','pillar','campaign','owner','approver','direction','slideCopy','caption'].filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]])),...JMLBriefTemplate.update(current,data)}};
        const id=ui.post;
        await commit(next=>{C.saveBrief(get(next,id),fields,ui.actor);if(next.workingDrafts)delete next.workingDrafts[id];},'Brief version saved.');
        removeRecovery(id);render();return;
      }
      if(form.id==='plan-form'){await commit(next=>C.approvePlan(get(next),ui.actor),'Plan approval recorded locally.');return;}
      if(form.id==='upload-form'){if(uploading)throw Error('Wait for the file reads to finish.');if(JSON.stringify(state).length+JSON.stringify(staged).length>100*1024*1024)throw Error('This version would exceed the 100 MB workspace limit. Use smaller files.');const pId=ui.post;await commit(next=>C.addVersion(get(next),{caption:data.caption,note:data.note,assets:staged},ui.actor),'New version saved. Previous versions are preserved.');navigate('#content/'+encodeURIComponent(pId)+'/versions');return;}
      if(form.id==='qc-form'){errorTarget='#qc-error';const checks=Object.fromEntries(C.qcKeys.map(k=>[k,data[k]==='on']));await commit(next=>C.submit(get(next),ui.actor,checks),'Creative sent to the local review queue.');return;}
      if(form.id==='decision-form'){errorTarget='#decision-error';await commit(next=>C.decide(get(next,form.dataset.post),button.value,data.comment,ui.actor),button.value==='approved'?'Creative approval recorded.':'Feedback saved. A new revision is needed.');return;}
      if(form.id==='request-form'){if(!data.title.trim()||!data.owner.trim()||!data.due)throw Error('Add the requested input, responsible person and due date.');await commit(next=>{const p=get(next);if(form.dataset.request){const r=p.requests.find(r=>r.id===form.dataset.request);Object.assign(r,data);C.event(p,'Media request updated',r.title+' · '+r.state,ui.actor);}else{p.requests.push({id:C.id('request'),title:data.title,owner:data.owner,due:data.due,note:data.note,state:'requested'});C.event(p,'Media requested',data.title+' · '+data.owner,ui.actor);}},'Media request saved locally.');return;}
      if(form.id==='import-workspace-form'){
        if(!stagedBackup||stagedBackup.file!==$('#workspace-file').files[0])throw Error('Choose a valid backup and wait for its preview.');
        const {incoming,library,kind,revision}=stagedBackup;
        if(state.revision!==revision)throw Error('The workspace changed after the preview. Select the file again to check it against the latest records.');
        if(kind==='calendar'){
          const selected=new FormData(form),options={replaceIds:selected.getAll('replaceIds'),replaceSettings:selected.getAll('replaceSettings')};
          await commit(next=>JMLPlanner.applyTransfer(next,incoming,C,ui.actor,options),'Calendar import complete.');
          setBrand(incoming.brand_id);navigate('#plan/calendar');return;
        }
        if(!data.replace)throw Error('Confirm that you have backed up the current workspace.');
        await commit(next=>{Object.keys(next).forEach(k=>delete next[k]);Object.assign(next,incoming,{revision});},'Workspace backup restored.',{library,restore:true});
        clearRecovery();ui.brand=state.brands[0].id;navigate('#today');render();return;
      }
      if(form.id==='reset-form'){if(data.confirmation!=='RESET')throw Error('Type RESET to continue.');await commit(next=>{const fresh=C.seed(window.JML_SEED,today());const previous=next.revision;Object.keys(next).forEach(k=>delete next[k]);Object.assign(next,fresh,{revision:previous});},'Prototype restored.',{library:new Map(),restore:true});clearRecovery();ui.brand='demo';navigate('#today');render();return;}
    }catch(err){error(err.message,errorTarget);}finally{if(button?.isConnected)button.disabled=false;}
  });
  modal.addEventListener('cancel',()=>{staged=[];uploading=false;});
  window.addEventListener('hashchange',async()=>{const change=++routeChange;if(!await prepareNavigation()){if(change===routeChange)history.replaceState(null,'',renderedHash||'#today');return;}if(change!==routeChange)return;dirty=false;parseRoute();render();window.scrollTo(0,0);});
  window.addEventListener('beforeunload',ev=>{if(dirty){ev.preventDefault();ev.returnValue='';}});
  function refreshFollowup(){
    const panel=$('#today-followup');
    if(!panel||document.hidden||modal.open||panel.contains(document.activeElement))return;
    const updated=JMLAttention.view(ctx);
    if(panel.innerHTML!==updated)panel.innerHTML=updated;
  }
  setInterval(refreshFollowup,60000);
  document.addEventListener('visibilitychange',refreshFollowup);
  try{
    await S.open();state=await S.read();if(!state){
      const seed=C.seed(window.JML_SEED,today());
      try{await S.write(seed,null);state=seed;}
      catch(err){state=await S.read();if(!state)throw err;}
    }
    if(G&&!state.governance)await S.preserveBeforeMigration(state);if(G?.migrate(state)){validateWorkspace(state);const previous=state.revision;state.revision++;await S.write(state,previous);}G?.syncContext(state,ui);validateWorkspace(state);const entryBrand=new URLSearchParams(location.search).get('brand');if(!isPreview()&&state.brands.some(b=>b.id===entryBrand)&&(!G||G.membership(state,ui,entryBrand)))ui.brand=entryBrand;parseRoute();render();
  }catch(err){$('#app').innerHTML=`<div class="boot"><h1>Your workspace could not open.</h1><p>${e(err.message)}</p><p style="margin-top:20px">Your stored data has not been reset. Try a regular browser window or reload this page.</p><a class="btn" href="content-planner.html" style="margin-top:20px">Open original planner</a></div>`;}
})();
