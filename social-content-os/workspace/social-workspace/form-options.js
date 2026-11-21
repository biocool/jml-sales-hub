/* Explicit, reversible presets for structured fields. Stored values and domain validation stay unchanged. */
(function(root){
  'use strict';
  const CUSTOM='__jml_custom_choice__';
  const presets={
    timezone:['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','America/Toronto','America/Vancouver','America/Sao_Paulo','Europe/London','Europe/Paris','Europe/Berlin','Asia/Dubai','Asia/Tehran','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney','UTC'],
    channel:['Instagram','Facebook','LinkedIn','TikTok','YouTube','YouTube Shorts','X','Pinterest','Threads'],
    placement:['Instagram feed','Instagram Reels','Instagram Stories','Facebook feed','Facebook Reels','LinkedIn feed','TikTok feed','YouTube video','YouTube Shorts','X feed','Pinterest pin','Threads feed'],
    format:['Photo','Carousel','Story','Reel','Video','Short video','Text post','Document','Live video'],
    window:['24 hours after publication','48 hours after publication','7 days after publication','14 days after publication','28 days after publication','30 days after publication','Calendar week','Calendar month','Calendar quarter','Campaign period','Lifetime'],
    cadence:['Daily','Weekly','Every two weeks','Monthly','Quarterly','After each campaign','After each publication'],
    metric:['Views','Reach','Impressions','Saves','Shares','Comments','Likes','Clicks','Profile visits','Follows','Leads','Conversions'],
    unit:['accounts','views','impressions','saves','shares','comments','likes','clicks','followers','leads','conversions','percent','per 1,000 views','saves / 1,000 views','currency'],
    dataSource:['Manual platform export','Meta Business Suite export','Instagram Insights export','Facebook Insights export','LinkedIn Analytics export','TikTok Analytics export','YouTube Analytics export','GA4 export','CRM export','Manual evidence'],
    responsibility:['Account management','Strategy','Content operations','Copywriting','Design & video','Creative QA','Client approval','Publishing','Analytics','Community management'],
    aspect:['1:1','4:5','9:16','16:9','2:3'],dimensions:['1080 x 1080','1080 x 1350','1080 x 1920','1920 x 1080','1200 x 628'],
    runtime:['15','30','45','60','90','120'],slides:['1','2','3','4','5','6','7','8','9','10'],animation:['2D animation','3D animation','Stop motion','Frame-by-frame animation','Mixed media'],motion:['Kinetic typography','Infographic animation','Product motion','Logo animation','Mixed media']
  };
  // Keys are form identities, never a global match on ambiguous field names.
  const registry={
    'research:evidence':{channel:'channel',window:'window'},
    'research:kpi':{unit:'unit',window:'window',dataSource:'dataSource'},
    'research:strategy':{cadence:'cadence'},
    'research:angle':{platform:'channel',format:'format'},
    'research:promote':{owner:'people'},'research:adapt':{owner:'people'},
    'ops:strategy':{kpi:'metric',source:'dataSource',window:'window',cadence:'cadence'},
    'ops:watchlist':{owner:'people',cadence:'cadence'},'ops:campaign':{owner:'people'},'ops:slot':{owner:'people'},
    'ops:source-idea':{owner:'people',platform:'channel'},'ops:convert-slot':{owner:'people',platform:'channel'},
    'ops:route':{backupOwner:'people',placement:'placement',productionTimezone:'timezone'},
    'ops:edit-task':{owner:'people'},'ops:exception':{owner:'people'},
    'rl:new-placement':{platform:'channel',format:'format',timezone:'timezone',owner:'people',communityOwner:'people'},
    'rl:observe':{metric:'metric',unit:'unit',timezone:'timezone'},
    'rl:map-file':{metric:'metric',unit:'unit',timezone:'timezone'},
    'rl:add-work':{owner:'people',metric:'metric',window:'window'},'rl:report-create':{reviewer:'people'},
    'rl:legacy-placement':{owner:'people',communityOwner:'people',timezone:'timezone'},'rl:legacy-metrics':{timezone:'timezone'},
    'rl:propose-next':{owner:'people'},'rl:feedback':{owner:'people'},
    '#account-form':{timezone:'timezone'},'#brief-form':{platform:'channel',format:'format',timezone:'timezone',owner:'people',approver:'clientPeople',campaign:'campaigns',pillar:'pillars'},
    '#new-form':{platform:'channel',format:'format',owner:'people'},'#request-form':{owner:'people'},
    '#bulk-edit-form':{'Format':'format','Aspect ratio':'aspect','Dimensions (px)':'dimensions','Runtime (sec)':'runtime','Slide count':'slides'},
    '#briefForm':{animationMethod:'animation',motionStyle:'motion'},
    'planner:settings-team':{description:'responsibility'}
  };
  let context=null,sequence=0;const docs=new WeakMap(),frames=new WeakSet(),records=new WeakMap(),exportHooks=new WeakSet();
  function formKey(form){
    if(!form)return '';
    for(const [attr,prefix]of [['researchForm','research'],['opsForm','ops'],['rlForm','rl']])if(form.dataset[attr])return prefix+':'+form.dataset[attr];
    if(form.id==='settingsForm'&&form.elements.kind?.value==='team')return 'planner:settings-team';
    return '#'+form.id;
  }
  function optionsFor(kind,ctx=context){
    if(presets[kind])return presets[kind].slice();
    const state=ctx?.getState?.()||ctx?.state,brandId=ctx?.ui?.brand;if(!state||!brandId)return [];
    if(kind==='people'||kind==='clientPeople')return [...new Set((root.JMLGovernance?.eligiblePeople(state,brandId,kind==='clientPeople'?'client':undefined)||[]).map(p=>p.name))];
    const brand=state.brands.find(b=>b.id===brandId),archive=state.plannerArchive?.settings?.[brandId];
    if(kind==='campaigns')return [...new Set([...(brand?.operations?.campaigns||[]).map(x=>x.title),...(archive?.campaigns||[]).filter(x=>x.active!==false).map(x=>x.name)].filter(Boolean))];
    if(kind==='pillars')return [...new Set((archive?.pillars||[]).filter(x=>x.active!==false).map(x=>x.name).filter(Boolean))];
    return [];
  }
  function specification(form,name){return registry[formKey(form)]?.[name]||null;}
  function labelText(el){const label=el.labels?.[0]||el.closest('label');return (el.getAttribute('aria-label')||[...(label?.childNodes||[])].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim()||el.name||'Value').replace(/\s+/g,' ');}
  function putOption(select,value,label=value){const o=select.ownerDocument.createElement('option');o.value=value;o.textContent=label;select.append(o);}
  function refreshOptions(r){
    const value=r.custom?r.input.value:r.select.value,choices=optionsFor(r.kind),saved=r.originalChoices||[];
    const values=[...new Set([...choices,...saved].filter(x=>typeof x==='string'&&x!==''))];
    r.select.replaceChildren();putOption(r.select,'',r.required?'Choose an option':'Not set');for(const v of values)putOption(r.select,v);
    if(value&&!values.includes(value))putOption(r.select,value,value+' (saved value)');
    putOption(r.select,r.customValue,'Custom…');r.select.value=r.custom?r.customValue:value;
  }
  function emit(el,type){el.dispatchEvent(new el.ownerDocument.defaultView.Event(type,{bubbles:true}));}
  function mode(r,custom,notify=false){
    r.custom=custom;r.wrap.classList.toggle('is-custom',custom);r.input.hidden=!custom;r.input.required=custom&&r.required;r.select.required=!custom&&r.required;
    // Exactly one successful named control, including during Custom edits.
    r.select.removeAttribute('name');r.input.removeAttribute('name');(custom?r.input:r.select).name=r.name;
    if(r.originalId){r.select.id=custom?r.generatedId:r.originalId;r.input.id=custom?r.originalId:r.generatedId+'-custom';}
    if(!custom)r.input.value=r.select.value;
    if(notify){const canonical=custom?r.input:r.select;emit(!custom&&r.input.tagName==='TEXTAREA'?r.input:canonical,'input');if(custom)r.input.focus();}
  }
  function enhanceField(el,kind){
    if(records.has(el)||el.closest('.form-options')||el.hasAttribute('data-no-presets')||el.disabled||el.readOnly||!['INPUT','SELECT','TEXTAREA'].includes(el.tagName)||el.tagName==='INPUT'&&!['text',''].includes(el.type))return false;
    const doc=el.ownerDocument,originalSelect=el.tagName==='SELECT',value=el.value,name=el.name,required=el.required,originalId=el.id,label=labelText(el),originalAttrs={hidden:el.hidden,ariaLabel:el.getAttribute('aria-label'),ariaDescription:el.getAttribute('aria-describedby')},wrap=doc.createElement('span'),select=originalSelect?el:doc.createElement('select'),input=originalSelect?doc.createElement('input'):el;
    const originalChoices=originalSelect?[...el.options].map(o=>o.value):[];if(originalSelect)input.type='text';
    const marker=doc.createComment('form-options');el.before(marker);wrap.className='form-options';wrap.dataset.field=name;marker.replaceWith(wrap);wrap.append(select,input);
    // Studio JSON/example fills assign by ID. Keep those programmatic, possibly
    // unfamiliar values intact rather than letting native select.value erase them.
    const valueProperty=Object.getOwnPropertyDescriptor(doc.defaultView.HTMLSelectElement.prototype,'value');
    Object.defineProperty(select,'value',{configurable:true,get(){return valueProperty.get.call(this);},set(v){v=String(v??'');if(![...this.options].some(o=>o.value===v))putOption(this,v,v+' (saved value)');valueProperty.set.call(this,v);const r=records.get(this);if(r&&!r.custom&&v!==r.customValue)r.input.value=v;}});
    const generatedId='form-options-'+(++sequence);let customValue=CUSTOM;while([value,...originalChoices,...optionsFor(kind)].includes(customValue))customValue+='_';
    const r={wrap,select,input,kind,name,required,originalId,generatedId,originalChoices,originalAttrs,originalElement:el,customValue,custom:false,initial:value};
    records.set(select,r);records.set(input,r);select.dataset.formOptions='preset';select.dataset.customValue=customValue;input.dataset.formOptions='custom';select.setAttribute('aria-label',label);input.setAttribute('aria-label',label+' · custom value');
    for(const attr of ['aria-describedby','aria-required','form','autocomplete'])if(el.hasAttribute(attr)){select.setAttribute(attr,el.getAttribute(attr));input.setAttribute(attr,el.getAttribute(attr));}
    const note=doc.createElement('small');note.className='form-options-hint';note.id=generatedId+'-hint';note.textContent='Choose a preset or enter a custom value.';wrap.append(note);select.setAttribute('aria-describedby',[select.getAttribute('aria-describedby'),note.id].filter(Boolean).join(' '));
    putOption(select,value);select.value=value;refreshOptions(r);mode(r,false);
    select.addEventListener('change',()=>{mode(r,select.value===r.customValue,true);});
    r.form=el.form;r.resetHandler=()=>queueMicrotask(()=>{r.custom=false;select.value=r.initial;if(select.value!==r.initial){putOption(select,r.initial);select.value=r.initial;}mode(r,false);});r.form?.addEventListener('reset',r.resetHandler);
    return true;
  }
  function enhance(doc=root.document){
    if(!doc?.querySelectorAll)return 0;let count=0;
    for(const form of doc.querySelectorAll('form'))for(const el of form.querySelectorAll('input[name],select[name],textarea[name]')){const kind=specification(form,el.name);if(kind&&enhanceField(el,kind))count++;}
    for(const frame of doc.querySelectorAll('iframe'))attachFrame(frame);
    return count;
  }
  function attachFrame(frame){
    if(!frames.has(frame)){frames.add(frame);frame.addEventListener('load',()=>{try{install(frame.contentDocument);}catch{}});}
    try{if(frame.contentDocument?.readyState==='complete')install(frame.contentDocument);}catch{}
  }
  function installExportHook(doc){
    const win=doc.defaultView;if(exportHooks.has(doc)||!doc.querySelector('#briefForm')||typeof win.downloadHTML!=='function')return;
    const download=win.downloadHTML;exportHooks.add(doc);
    win.downloadHTML=function(...args){
      // The standalone Studio serializes live markup. Export its original
      // controls so the saved file needs neither this host nor injected scripts.
      for(const wrap of [...doc.querySelectorAll('.form-options')]){
        const r=records.get(wrap.querySelector('[data-form-options="preset"]'));if(!r)continue;
        const value=r.custom?r.input.value:r.select.value,el=r.originalElement;el.value=value;el.name=r.name;el.id=r.originalId;el.hidden=r.originalAttrs.hidden;el.required=r.required;
        for(const [attr,value]of [['aria-label',r.originalAttrs.ariaLabel],['aria-describedby',r.originalAttrs.ariaDescription]])if(value===null)el.removeAttribute(attr);else el.setAttribute(attr,value);
        el.removeAttribute('data-form-options');el.removeAttribute('data-custom-value');r.form?.removeEventListener('reset',r.resetHandler);records.delete(r.input);records.delete(r.select);wrap.replaceWith(el);
      }
      const style=doc.querySelector('[data-jml-form-options-style]');style?.remove();
      try{return download.apply(this,args);}finally{if(style)doc.head.append(style);enhance(doc);}
    };
  }
  function install(doc){
    if(!doc?.documentElement)return;if(docs.has(doc))return;
    const observer=new doc.defaultView.MutationObserver(records=>{if(records.some(r=>r.addedNodes.length))enhance(doc);});docs.set(doc,observer);observer.observe(doc.documentElement,{childList:true,subtree:true});
    if(doc!==root.document&&!doc.querySelector('[data-jml-form-options-style]')){const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('social-workspace/form-options.css',root.location.href).href;link.dataset.jmlFormOptionsStyle='';doc.head.append(link);}
    enhance(doc);installExportHook(doc);
  }
  function init(ctx){context=ctx||context;install(root.document);enhance(root.document);}
  const api={init,enhance,formKey,specification,optionsFor,presets,registry,CUSTOM};if(typeof module==='object'&&module.exports)module.exports=api;else root.JMLFormOptions=api;
})(typeof window==='undefined'?globalThis:window);
