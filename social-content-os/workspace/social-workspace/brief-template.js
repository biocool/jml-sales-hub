/* Brand-local schemas and post snapshots; no server or external uploads. */
window.JMLBriefTemplate=(()=>{
  'use strict';
  const types={text:'Short text',textarea:'Long text',url:'Reference URL',date:'Date'};
  const definitions=[
    ['objective','Objective','textarea','What should change after this post?'],
    ['audience','Audience','text','Who is it for?'],
    ['message','Key message','textarea','One thing the audience should remember.'],
    ['caption','Working caption','textarea','Include the hook and relevant disclosures.'],
    ['cta','Call to action','text','What should the audience do next?'],
    ['direction','Visual direction','textarea','Describe the layout, reference or art direction.'],
    ['sourceUrl','Evidence or source URL','url','A source for a factual claim or creative reference.'],
    ['success','Success measure','text','One useful measure tied to the objective.'],
    ['accessibility','Accessibility and rights','textarea','Alt text, captions, credits or approval to reuse.'],
  ];
  const native=new Set(['objective','audience','cta','pillar','campaign','owner','approver','direction','slideCopy','caption']);
  const builtin=Object.fromEntries(definitions.map(x=>[x[0],x[2]]));
  const defaults=()=>definitions.map(([id,label,type,help])=>({id,label,type,help,required:false}));
  const active=ctx=>ctx.state.brands.find(b=>b.id===ctx.ui.brand);
  const safeUrl=x=>{try{return /^https?:$/.test(new URL(x).protocol);}catch{return false;}};
  const hex=x=>/^#[0-9a-f]{6}$/i.test(x);
  const validFile=(x,kind)=>!!x&&typeof x.name==='string'&&!!x.name&&x.name.length<=255&&typeof x.data==='string'&&
    (kind==='logo'?/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/:/^data:application\/pdf;base64,[A-Za-z0-9+/]+=*$/).test(x.data)&&x.data.length<=(kind==='logo'?700000:2800000);
  function validFields(fields){
    if(!Array.isArray(fields)||fields.length<1||fields.length>30)return false;
    const ids=new Set(),labels=new Set();
    return fields.every(f=>{
      if(!f||!(/^(?:custom_[a-z0-9_-]+|[a-zA-Z]+)$/.test(f.id))||ids.has(f.id)||!Object.hasOwn(types,f.type)||typeof f.label!=='string'||!f.label.trim()||f.label.length>80||labels.has(f.label.trim().toLowerCase())||typeof f.help!=='string'||f.help.length>220||typeof f.required!=='boolean'||(!f.id.startsWith('custom_')&&builtin[f.id]!==f.type))return false;
      ids.add(f.id);labels.add(f.label.trim().toLowerCase());return true;
    });
  }
  function validate(doc){
    for(const b of doc.brands){
      const t=b.socialBriefTemplate;
      if(t!==undefined&&(!t||!Number.isInteger(t.version)||t.version<1||!validFields(t.fields)))throw Error('Invalid social brief template for '+b.name+'.');
      const a=b.socialBriefBrand;
      if(a!==undefined&&(!a||typeof a.voice!=='string'||a.voice.length>1500||a.logo!=null&&!validFile(a.logo,'logo')||a.book!=null&&!validFile(a.book,'book')))throw Error('Invalid brand assets for '+b.name+'.');
    }
    for(const p of doc.posts){
      const t=p.brief.socialTemplate;
      if(t!==undefined&&(!t||t.brandId!==p.brandId||!Number.isInteger(t.version)||t.version<1||!validFields(t.fields)||!t.answers||Object.keys(t.answers).some(k=>!t.fields.some(f=>f.id===k&&!native.has(k))||typeof t.answers[k]!=='string'||t.answers[k].length>12000)))throw Error('Invalid brand template snapshot on a content brief.');
    }
  }
  function renderFields(ctx,fields,brief={},extra={}){
    const {e}=ctx;
    return fields.map(f=>{
      const id='social-field-'+f.id,name='social_'+f.id,value=native.has(f.id)?brief[f.id]:extra[f.id],required=f.required?' required':'';
      const attr=' id="'+id+'" name="'+name+'"'+required+(f.help?' aria-describedby="'+id+'-help"':'');
      const control=f.type==='textarea'?'<textarea'+attr+' rows="3" maxlength="12000">'+e(value||'')+'</textarea>':'<input'+attr+' type="'+f.type+'" maxlength="12000" value="'+e(value||'')+'">';
      return '<div class="sbt-field"><label for="'+id+'">'+e(f.label)+(f.required?' <span class="sbt-required">(required)</span>':'')+'</label>'+control+(f.help?'<small id="'+id+'-help">'+e(f.help)+'</small>':'')+'</div>';
    }).join('');
  }
  function brandBanner(ctx,b,version){
    const a=b.socialBriefBrand||{}, {e}=ctx;
    return '<div class="sbt-banner">'+(a.logo?'<img src="'+e(a.logo.data)+'" alt="'+e(b.name)+' logo">':'')+'<div><strong>'+e(b.name)+'</strong>'+(version?' <small>· Template v'+version+'</small>':'')+(a.voice?'<p><b>Brand voice:</b> '+e(a.voice)+'</p>':'')+'</div>'+(a.book?'<a class="btn" href="'+e(a.book.data)+'" download="'+e(a.book.name)+'">Download brand book</a>':'')+'</div>';
  }
  function newFields(ctx){
    const b=active(ctx),t=b.socialBriefTemplate;
    return t?brandBanner(ctx,b,t.version)+'<fieldset class="sbt-fields" data-template-version="'+t.version+'"><legend>Social brief</legend>'+renderFields(ctx,t.fields)+'</fieldset>':'';
  }
  function extract(fields,data){
    const values={},answers={};
    for(const f of fields){
      const value=String(data['social_'+f.id]||'').trim();
      if(f.required&&!value)throw Error('Complete the required field: '+f.label+'.');
      if(value.length>12000||f.type==='url'&&value&&!safeUrl(value)||f.type==='date'&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Enter a valid value for '+f.label+'.');
      (native.has(f.id)?values:answers)[f.id]=value;
    }
    return {values,answers};
  }
  function start(ctx,p,form,data){
    const brand=active(ctx),t=brand.socialBriefTemplate;
    if(!t)return;
    if(Number(form.querySelector('[data-template-version]')?.dataset.templateVersion)!==t.version)throw Error('The brand template changed. Reopen New content to use the current version.');
    const {values,answers}=extract(t.fields,data);
    Object.assign(p.brief,values);
    adopt(ctx.state,p,answers);
  }
  function adopt(state,p,answers={}){
    const template=state.brands.find(b=>b.id===p.brandId)?.socialBriefTemplate;
    if(template&&!p.brief.socialTemplate)p.brief.socialTemplate={brandId:p.brandId,version:template.version,fields:template.fields.map(f=>({...f})),answers:{...answers}};
  }
  function missing(p){
    const t=p.brief.socialTemplate;if(!t)return [];
    return t.fields.filter(f=>f.required&&!String(native.has(f.id)?p.brief[f.id]||'':t.answers[f.id]||'').trim()).map(f=>f.label+' is required by the brand brief');
  }
  function editFields(ctx,p){
    const t=p.brief.socialTemplate;if(!t)return '';
    const b=ctx.state.brands.find(x=>x.id===p.brandId);
    return '<div class="form-section"><h3>Brand social brief</h3>'+brandBanner(ctx,b,t.version)+'<div class="sbt-fields">'+renderFields(ctx,t.fields,p.brief,t.answers)+'</div></div>';
  }
  function update(p,data){
    const t=p.brief.socialTemplate;if(!t)return {};
    const {values,answers}=extract(t.fields,data);
    return {...values,socialTemplate:{...t,answers}};
  }
  function existingNative(p,id){
    return !p.brief.socialTemplate?.fields.some(f=>f.id===id);
  }
  function allowed(ctx){return !window.JMLGovernance||JMLGovernance.can(ctx.state,ctx.ui,'admin');}
  function link(ctx){return allowed(ctx)?'<div class="sbt-entry"><h2>Social brief template</h2><p>Set the brand voice, references and fields for briefs created in this account.</p>'+ctx.btn('Open template builder','social-template-open','primary')+'</div>':'';}
  function settings(ctx){
    if(!allowed(ctx))throw Error('Only a workspace administrator can change a brand template.');
    const b=active(ctx),a=b.socialBriefBrand||{},t=b.socialBriefTemplate,{e,input,textArea}=ctx;
    const [primary,accent]=JMLAgency.colors(b);
    ctx.formModal('Social Brief Template Builder','social-template-form',
      '<p>Brand settings for <strong>'+e(b.name)+'</strong>. Saved in this browser only; not shared with teammates.</p>'+
      '<details open><summary>Brand details &amp; references</summary><div class="form-grid">'+input('Brand name','name',b.name,'text',true)+input('Time zone','timezone',b.timezone,'text',true)+textArea('Brand description','description',b.description||'')+textArea('Voice and writing rules','voice',a.voice||'')+input('Primary color','primary',b.primary||primary,'color')+input('Accent color','accent',b.accent||accent,'color')+
      '<label>Logo <small>(PNG, JPG, WebP · 500 KB max)</small><input type="file" name="logoFile" accept=".png,.jpg,.jpeg,.webp"><span>'+e(a.logo?.name||'No logo uploaded')+'</span></label><label>Brand book <small>(PDF · 2 MB max)</small><input type="file" name="bookFile" accept=".pdf"><span>'+e(a.book?.name||'No brand book uploaded')+'</span></label>'+
      (a.logo?'<label><input type="checkbox" name="removeLogo"> Remove saved logo</label>':'')+(a.book?'<label><input type="checkbox" name="removeBook"> Remove saved brand book</label>':'')+
      '</div></details><h3 class="sbt-subtitle">Brief fields</h3><p>Use Move up or Move down to change the order, including with a keyboard. Required fields must be filled in when starting a brief. Existing briefs keep their original template.</p><ol class="sbt-order"></ol><div class="sbt-actions"><button class="btn" type="button" data-action="social-template-add">Add custom field</button><button class="btn" type="button" data-action="social-template-reset">Restore starter fields</button><button class="btn" type="button" data-action="social-template-preview">Preview brief form</button></div><p class="sbt-live" aria-live="polite"></p><section class="sbt-preview" hidden></section>',
      'Save brand template','data-brand="'+e(b.id)+'" data-base="'+(t?.version||0)+'"');
    const form=document.getElementById('social-template-form');
    paint(ctx,form,ctx.C.clone(t?.fields||defaults()));
  }
  const collect=form=>Array.from(form.querySelectorAll('.sbt-row'),row=>({id:row.dataset.field,label:row.querySelector('.sbt-label').value.trim(),type:row.querySelector('.sbt-type').value,help:row.querySelector('.sbt-help').value.trim(),required:row.querySelector('.sbt-req').checked}));
  function paint(ctx,form,fields,focus){
    const {e}=ctx;
    form.querySelector('.sbt-order').innerHTML=fields.map((f,i)=>
      '<li class="sbt-row" data-field="'+e(f.id)+'"><div class="sbt-row-fields"><label>Field label<input class="sbt-label" maxlength="80" required value="'+e(f.label)+'"></label><label>Type<select class="sbt-type" '+(Object.hasOwn(builtin,f.id)?'disabled':'')+'>'+Object.entries(types).map(([v,l])=>'<option value="'+v+'" '+(v===f.type?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label class="sbt-help-wrap">Helper text<input class="sbt-help" maxlength="220" value="'+e(f.help)+'"></label></div><div class="sbt-actions"><label class="sbt-check"><input type="checkbox" class="sbt-req" '+(f.required?'checked':'')+'> Required</label>'+[['up','Move up',!i],['down','Move down',i===fields.length-1],['remove','Remove',fields.length===1]].map(([v,l,d])=>'<button type="button" class="btn small" data-action="social-template-'+v+'" aria-label="'+l+' '+e(f.label||'field')+'" '+(d?'disabled':'')+'>'+l+'</button>').join('')+'</div></li>').join('');
    if(focus){
      const row=Array.from(form.querySelectorAll('.sbt-row')).find(r=>r.dataset.field===focus);row?.querySelector('.sbt-label').focus();
    }
    form.querySelector('.sbt-preview').hidden=true;
  }
  function action(ctx,action,b){
    if(!action.startsWith('social-template-'))return false;
    if(action==='social-template-open'){settings(ctx);return true;}
    const form=b.closest('#social-template-form');if(!form)return false;
    const fields=collect(form),mode=action.slice('social-template-'.length),id=b.closest('.sbt-row')?.dataset.field,i=fields.findIndex(f=>f.id===id);
    if(mode==='preview'){
      if(!validFields(fields))throw Error('Give each field a unique, nonblank label.');
      const dest=form.querySelector('.sbt-preview');
      dest.innerHTML='<h3>New brief preview</h3><p>Showing the order and requirements for '+ctx.e(form.elements.name.value)+'.</p><fieldset class="sbt-fields" disabled>'+renderFields(ctx,fields)+'</fieldset>';
      dest.hidden=false;dest.scrollIntoView({block:'nearest'});return true;
    }
    if(mode==='reset'){paint(ctx,form,defaults());form.querySelector('.sbt-live').textContent='Starter fields restored in this draft. Save to apply.';return true;}
    if(mode==='add'){
      if(fields.length>=30)throw Error('Each template supports up to 30 fields.');
      const id=ctx.C.id('custom').replace('custom-','custom_');fields.push({id,label:'',type:'text',help:'',required:false});paint(ctx,form,fields,id);return true;
    }
    if(i<0)return true;
    if(mode==='remove')fields.splice(i,1);
    if(mode==='up'&&i>0)[fields[i-1],fields[i]]=[fields[i],fields[i-1]];
    if(mode==='down'&&i<fields.length-1)[fields[i+1],fields[i]]=[fields[i],fields[i+1]];
    paint(ctx,form,fields,mode==='remove'?fields[Math.min(i,fields.length-1)]?.id:id);
    form.querySelector('.sbt-live').textContent=mode==='remove'?'Field removed from this draft.':'Moved to position '+(fields.findIndex(f=>f.id===id)+1)+' of '+fields.length+'.';
    return true;
  }
  async function readFile(file,kind){
    const max=kind==='logo'?512000:2097152;
    if(!file?.name)return null;
    if(!file.size||file.size>max||file.name.length>255)throw Error('Use a smaller '+(kind==='logo'?'logo (500 KB max).':'brand book (2 MB max).'));
    const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer()),sig=String.fromCharCode(...bytes);
    const mime=kind==='book'?(sig.startsWith('%PDF-')?'application/pdf':''):(sig.startsWith('\x89PNG\r\n\x1a\n')?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':sig.startsWith('RIFF')&&sig.slice(8)==='WEBP'?'image/webp':'');
    if(!mime)throw Error(kind==='logo'?'Choose a valid PNG, JPEG or WebP logo.':'Choose a valid PDF brand book.');
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read '+file.name+'.'));reader.onload=()=>resolve({name:file.name,data:reader.result});reader.readAsDataURL(new Blob([file],{type:mime}));
    });
  }
  async function submit(ctx,form,data){
    if(!allowed(ctx)||form.dataset.brand!==ctx.ui.brand)throw Error('Reopen the builder for the active brand.');
    const b=active(ctx),fields=collect(form),base=Number(form.dataset.base),name=data.name.trim(),timezone=data.timezone.trim(),voice=data.voice.trim();
    if(!validFields(fields))throw Error('Give each field a unique, nonblank label and keep at least one field.');
    if(!name||voice.length>1500||!hex(data.primary)||!hex(data.accent))throw Error('Enter the brand name and colors. Keep brand voice within 1,500 characters.');
    try{Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw Error('Enter a valid time zone, for example America/Los_Angeles.');}
    const profile=b.socialBriefBrand||{},[logo,book]=await Promise.all([readFile(data.logoFile,'logo'),readFile(data.bookFile,'book')]);
    if(!form.isConnected||ctx.ui.brand!==b.id)throw Error('The builder closed before saving. Reopen it and try again.');
    await ctx.commit(next=>{
      const brand=next.brands.find(item=>item.id===b.id);
      if((brand.socialBriefTemplate?.version||0)!==base)throw Error('This template changed while editing. Reopen the builder.');
      if(next.brands.some(x=>x.id!==b.id&&x.name.toLowerCase()===name.toLowerCase()))throw Error('An account with this name already exists.');
      Object.assign(brand,{name,timezone,description:data.description.trim(),initials:name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(),primary:data.primary,accent:data.accent,
        socialBriefBrand:{voice,logo:logo||(data.removeLogo?null:profile.logo)||null,book:book||(data.removeBook?null:profile.book)||null},
        socialBriefTemplate:{version:base+1,fields}});
    },'Social brief template saved for '+name+'.');
  }
  return {validate, link, action, submit, newFields, start, editFields, update, existingNative, active, adopt, missing};
})();
