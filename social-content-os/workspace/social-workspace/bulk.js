/* Bulk intake UI. All writes use the host workspace transaction and permission boundary. */
(function(root){
  'use strict';
  const D=root.JMLBulkDomain,C=root.JMLCore;
  let pending=null,raw='',mode='calendar',scope='',epoch=0,errorText='';
  const context=ctx=>ctx.ui.brand+'::'+(ctx.ui.personId||ctx.ui.actor);
  function reset(ctx){if(scope!==context(ctx)){scope=context(ctx);pending=null;raw='';errorText='';epoch++;}}
  const allowed=ctx=>!root.JMLGovernance||root.JMLGovernance.can(ctx.state,ctx.ui,'import');
  const assert=ctx=>root.JMLGovernance?.assert(ctx.state,ctx.ui,'import');
  const label=ctx=>ctx.state.brands.find(b=>b.id===ctx.ui.brand)?.name||'';
  function opts(ctx,selected){return '<option value="">Choose the assigned person</option>'+D.people(ctx.state,ctx.ui.brand).map(p=>'<option value="'+ctx.e(p.id)+'" '+(p.id===selected?'selected':'')+'>'+ctx.e(D.personName(p))+'</option>').join('');}
  function result(ctx){return !pending?[]:pending.kind==='calendar'?D.previewCalendar(ctx.state,pending.brandId,pending.table,pending.map,pending.ownerId):D.previewBriefs(ctx.state,pending.brandId,pending.rows);}
  function selected(ctx){return result(ctx).filter(r=>!r.errors.length&&!pending.excluded.includes(r.index));}
  function view(ctx){
    reset(ctx);const e=ctx.e;
    let html=ctx.heading('PLAN / BULK INTAKE','Bring a whole calendar into focus.','Review the rows, attach the briefs, then assign the work. Every imported item starts as a draft.',ctx.btn('Export account CSV','bulk-export','')+'<a class="btn" href="#plan/calendar">Open calendar</a>');
    html+='<div class="bulk-flow"><div><span>01</span><strong>Calendar CSV</strong><p>Proposed posts, dates, copy and owners.</p></div><div><span>02</span><strong>Creative briefs XLSX</strong><p>Attach video and graphic production details by Content ID.</p></div><div><span>03</span><strong>Review & produce</strong><p>Use the existing brief, review and release workflow.</p></div></div>';
    if(!allowed(ctx))return html+'<div class="panel"><p>Your current account responsibilities do not include bulk import. An operations owner can prepare the drafts.</p></div>';
    html+='<section class="panel bulk-intake"><div class="bulk-section-head"><div><h2>Import into '+e(label(ctx))+'</h2><p class="muted">Calendar records and briefs stay within this account.</p></div><div class="segmented" aria-label="Import type">'+ctx.btn('Calendar CSV','bulk-mode','','data-mode="calendar" aria-pressed="'+(mode==='calendar')+'"')+ctx.btn('Creative briefs XLSX','bulk-mode','','data-mode="briefs" aria-pressed="'+(mode==='briefs')+'"')+'</div></div>';
    html+='<p id="bulk-error" class="bulk-error" role="alert" tabindex="-1">'+e(errorText)+'</p>';
    if(mode==='calendar')html+='<div class="bulk-file-line"><label class="field">Choose a calendar CSV<input id="bulk-csv" type="file" accept=".csv,text/csv"></label><div class="actions">'+ctx.btn('Load Northstar sample','bulk-sample','','data-kind="calendar"')+'<a href="social-workspace/examples/Northstar-Coffee-90-Day-Content-Calendar.csv" download>Download example</a></div></div><details '+(!raw?'':'open')+'><summary>Paste or edit CSV text</summary><label class="field" for="bulk-raw">Calendar data<textarea id="bulk-raw" rows="6" maxlength="1000000" spellcheck="false">'+e(raw)+'</textarea></label></details><div class="bulk-toolbar">'+ctx.btn('Map columns & preview','bulk-map','primary')+'<span class="muted">Up to 500 rows. Nothing is scheduled by an import.</span></div>';
    else html+='<div class="bulk-file-line"><label class="field">Choose creative briefs workbook<input id="bulk-xlsx" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><div class="actions">'+ctx.btn('Load Northstar sample','bulk-sample','','data-kind="briefs"')+'<a href="social-workspace/examples/Northstar-Coffee-Bulk-Creative-Briefs.xlsx" download>Download example</a></div></div><p class="source-note">Use Video Briefs and Graphic Briefs worksheets. Import the calendar first. Suggested owners and worksheet status remain source notes; existing assignments and approval gates are preserved.</p>';
    html+='<div id="bulk-preview">'+previewHTML(ctx)+'</div></section>';
    const batches=(ctx.state.importBatches||[]).filter(x=>x.brandId===ctx.ui.brand).slice().reverse().slice(0,8);
    html+='<section class="panel bulk-history"><h2>Import history</h2>'+(batches.length?'<div class="bulk-table-scroll"><table><thead><tr><th>Source</th><th>Imported</th><th>By / when</th></tr></thead><tbody>'+batches.map(b=>'<tr><td>'+e(b.fileName)+'<small>'+e(b.kind==='calendar'?'Calendar drafts':'Attached briefs')+'</small></td><td>'+b.imported+' of '+b.rowCount+'<small>'+b.skipped+' skipped</small></td><td>'+e(b.actor)+'<small>'+e(new Date(b.at).toLocaleString())+'</small></td></tr>').join('')+'</tbody></table></div>':'<p class="muted">Completed imports will appear here with their source file, row counts and actor.</p>')+'</section>';
    if(!ctx.state.brands.some(b=>b.id==='brand_northstar'))html+='<p class="source-note">The supplied examples belong to fictional Northstar Coffee. <a href="#accounts/people">Open People & access</a> to load its sample team before importing.</p>';
    return html;
  }
  function previewHTML(ctx){
    if(!pending)return '';const e=ctx.e,rows=result(ctx),valid=rows.filter(r=>!r.errors.length),chosen=selected(ctx);let html='';
    if(pending.kind==='calendar'){
      html+='<h3>Column mapping</h3><div class="bulk-map">'+Object.entries(D.fields).map(([key,name])=>'<label>'+e(name)+'<select data-bulk-map="'+key+'"><option value="-1">Not supplied</option>'+pending.table.headers.map((h,i)=>'<option value="'+i+'" '+(pending.map[key]===i?'selected':'')+'>'+e(h)+'</option>').join('')+'</select></label>').join('')+'</div>';
      if(pending.map.owner<0)html+='<label class="field bulk-owner">Default assignee<select id="bulk-owner">'+opts(ctx,pending.ownerId)+'</select><small>Explicitly choose a person in this account. The source file will not grant access.</small></label>';
    }
    html+='<div class="bulk-section-head"><div><h3>Review '+rows.length+' rows</h3><p class="muted">'+valid.length+' valid · '+(rows.length-valid.length)+' blocked · '+chosen.length+' selected</p></div><div class="actions">'+ctx.btn('Select valid','bulk-select','','data-selection="all"')+ctx.btn('Clear selection','bulk-select','','data-selection="none"')+ctx.btn('Download validation report','bulk-errors','')+'</div></div>';
    if(ctx.state.revision!==pending.revision)html+='<p class="bulk-error">The workspace has changed. '+ctx.btn('Refresh preview','bulk-refresh','small')+' before confirming.</p>';
    html+='<div class="bulk-table-scroll" tabindex="0" aria-label="Import validation rows"><table><thead><tr><th scope="col">Include</th><th scope="col">Content</th><th scope="col">Destination / timing</th><th scope="col">Validation</th></tr></thead><tbody>'+rows.map(r=>{
      const id=pending.kind==='calendar'?r.value.externalId:r.values['Content ID'],title=pending.kind==='calendar'?r.value.title:r.values['Working title'];
      const detail=pending.kind==='calendar'?r.value.platform+' · '+r.value.publishAt+' · '+r.value.timezone:r.kind+' brief · '+r.sheet+' row '+r.line;
      return '<tr class="'+(r.errors.length?'bulk-blocked':'')+'"><td><input type="checkbox" data-bulk-row="'+r.index+'" aria-label="Include '+e(id||'row '+(r.index+1))+'" '+(r.errors.length?'disabled':pending.excluded.includes(r.index)?'':'checked')+'></td><td><strong>'+e(id)+'</strong><br>'+e(title)+'<small>Source row '+(r.row||r.line)+'</small><details><summary>Inspect source fields</summary><dl class="bulk-fields">'+Object.entries(r.raw||r.values).map(([k,v])=>'<dt>'+e(k)+'</dt><dd>'+e(v)+'</dd>').join('')+'</dl></details></td><td>'+e(detail)+(pending.kind==='calendar'?'<small>'+e(r.ownerName||'Assignee needed')+'</small>':'')+'</td><td>'+(r.errors.length?'<strong>Blocked</strong><ul>'+r.errors.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>':'<span class="bulk-ready">Ready</span>')+(r.warnings.length?'<ul>'+r.warnings.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>':'')+'</td></tr>';
    }).join('')+'</tbody></table></div><div class="bulk-toolbar">'+ctx.btn('Review '+chosen.length+' '+(pending.kind==='calendar'?'drafts':'briefs'),'bulk-review','primary',(!chosen.length||ctx.state.revision!==pending.revision?'disabled':''))+'<span class="muted">'+(rows.length-chosen.length)+' rows will remain unchanged.</span></div>';return html;
  }
  function refresh(ctx){const host=document.querySelector('#bulk-preview');if(host)host.innerHTML=previewHTML(ctx);}
  function fail(ctx,error){errorText=error.message||String(error);const el=document.querySelector('#bulk-error,#bulk-edit-error');if(el){el.textContent=errorText;el.focus();}else ctx.toast(errorText);}
  async function hash(bytes){if(!globalThis.crypto?.subtle)return '';return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function load(ctx,file,kind){
    assert(ctx);reset(ctx);const ticket=++epoch,at=context(ctx);pending=null;errorText='';refresh(ctx);
    if(file.size>(kind==='calendar'?1000000:5000000))throw Error(kind==='calendar'?'CSV limit is 1 MB.':'XLSX limit is 5 MB.');
    ctx.toast('Reading '+file.name+' locally…');const buffer=await file.arrayBuffer(),fileHash=await hash(buffer);
    const parsed=kind==='calendar'?new TextDecoder().decode(buffer):await root.JMLBulkWorkbook.parse(buffer);
    if(ticket!==epoch||at!==context(ctx)||ctx.ui.route!=='plan'||ctx.ui.section!=='import')return;
    if(kind==='calendar'){raw=parsed;mode='calendar';const table=D.parseCSV(raw);pending={kind,brandId:ctx.ui.brand,revision:ctx.state.revision,table,map:D.autoMap(table.headers),ownerId:'',excluded:[],fileName:file.name,fileHash};}
    else{mode='briefs';pending={kind,brandId:ctx.ui.brand,revision:ctx.state.revision,rows:parsed,excluded:[],fileName:file.name,fileHash};}
    ctx.render();ctx.toast('File read. Review mappings, matches and row details.');
  }
  function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function csvCell(value){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function exportCSV(ctx){
    root.JMLGovernance?.assert(ctx.state,ctx.ui,'export');
    const headers=['content_id','title','platform','publish_at','timezone','format','owner','caption','cta','objective','visual_direction','dimensions','reference_link'];
    const rows=ctx.scoped().map(p=>[p.externalId||p.id,p.title,p.platform,p.date+(p.time?' '+p.time:''),p.timezone,p.format,p.brief.owner,p.brief.caption,p.brief.cta,p.brief.objective,p.brief.direction,p.brief.creativeBrief?.values['Dimensions (px)']||p.brief.importedPlanning?.dimensions||'',p.brief.importedPlanning?.reference||'']);
    const text='\uFEFF'+[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');download(label(ctx).replace(/[^a-z0-9]+/gi,'-')+'-calendar.csv',text,'text/csv;charset=utf-8');
  }
  async function action(ctx,action,el){
    if(!action.startsWith('bulk-'))return false;reset(ctx);
    try{
      if(action==='bulk-export'){exportCSV(ctx);return true;}
      if(action==='bulk-studio'){const p=ctx.state.posts.find(p=>p.id===el.dataset.id&&p.brandId===ctx.ui.brand);if(p)root.JMLBriefStudio.open(ctx,p);return true;}
      if(action==='bulk-edit'){const p=ctx.state.posts.find(p=>p.id===el.dataset.id&&p.brandId===ctx.ui.brand);if(!p)return true;root.JMLGovernance?.assert(ctx.state,ctx.ui,'edit',p);const b=p.brief.creativeBrief,locked=['Content ID','Brand','Channel','Timezone','Publish date/time'];
        ctx.showModal('Edit '+ctx.e(p.externalId||p.title)+' creative brief','<form id="bulk-edit-form" data-post="'+ctx.e(p.id)+'" data-revision="'+p.briefRevision+'"><p>Saving creates a brief revision. Previously saved versions stay in History.</p><p id="bulk-edit-error" role="alert" tabindex="-1" class="bulk-error"></p>'+Object.entries(b.values).map(([k,v])=>'<label class="field">'+ctx.e(k)+'<textarea name="'+ctx.e(k)+'" rows="'+(v.length>150?4:2)+'" maxlength="12000" '+(locked.includes(k)?'readonly':'')+' '+(D.required(b.kind).includes(k)?'required':'')+'>'+ctx.e(v)+'</textarea></label>').join('')+'<button class="btn primary" type="submit">Save brief revision</button></form>');return true;}
      assert(ctx);
      if(action==='bulk-mode'){mode=el.dataset.mode;pending=null;errorText='';epoch++;ctx.render();return true;}
      if(action==='bulk-map'){raw=document.querySelector('#bulk-raw')?.value||raw;const table=D.parseCSV(raw);pending={kind:'calendar',brandId:ctx.ui.brand,revision:ctx.state.revision,table,map:D.autoMap(table.headers),ownerId:pending?.ownerId||'',excluded:[],fileName:pending?.fileName||'Pasted CSV',fileHash:''};errorText='';ctx.render();return true;}
      if(action==='bulk-sample'){const kind=el.dataset.kind,name=kind==='calendar'?'Northstar-Coffee-90-Day-Content-Calendar.csv':'Northstar-Coffee-Bulk-Creative-Briefs.xlsx',at=context(ctx),ticket=++epoch;const res=await fetch('social-workspace/examples/'+name);if(!res.ok)throw Error('Example file could not be opened.');const blob=await res.blob();if(at!==context(ctx)||ticket!==epoch)return true;await load(ctx,new File([blob],name),kind);return true;}
      if(!pending)throw Error('Choose a file and preview it first.');
      if(action==='bulk-select'){pending.excluded=el.dataset.selection==='none'?result(ctx).map(r=>r.index):[];refresh(ctx);return true;}
      if(action==='bulk-refresh'){pending.revision=ctx.state.revision;refresh(ctx);return true;}
      if(action==='bulk-errors'){download('import-validation.json',JSON.stringify({file:pending.fileName,brandId:pending.brandId,checkedAt:C.now(),rows:result(ctx).map(r=>({row:r.row||r.line,contentId:r.value?.externalId||r.values['Content ID'],errors:r.errors,warnings:r.warnings}))},null,2),'application/json');return true;}
      if(action==='bulk-review'){
        const chosen=selected(ctx);if(!chosen.length)throw Error('Select at least one valid row.');if(ctx.state.revision!==pending.revision)throw Error('Refresh the preview before confirming.');
        ctx.showModal('Confirm '+(pending.kind==='calendar'?'calendar import':'brief attachment'),'<p><strong>'+chosen.length+' '+(pending.kind==='calendar'?'drafts will be added':'briefs will be attached')+'</strong> in '+ctx.e(label(ctx))+'.</p><p>'+ctx.e(pending.fileName)+' · '+(result(ctx).length-chosen.length)+' rows skipped. No approval or scheduled release will be created.</p><p>Suggested workbook owners remain notes. Saved content versions and history are retained.</p><p id="bulk-confirm-error" role="alert" tabindex="-1" class="bulk-error"></p><div class="actions">'+ctx.btn('Confirm '+chosen.length+' '+(pending.kind==='calendar'?'drafts':'briefs'),'bulk-confirm','primary')+ctx.btn('Keep reviewing','close','')+'</div>');return true;
      }
      if(action==='bulk-confirm'){
        const selection=selected(ctx).map(r=>r.index),saved=pending;if(!selection.length)throw Error('There are no valid selected rows.');
        await ctx.commit(next=>{assert(ctx);if(saved.brandId!==ctx.ui.brand)throw Error('Destination account changed.');if(saved.kind==='calendar')D.importCalendar(next,saved,selection,ctx.ui.actor,ctx.ui);else D.importBriefs(next,saved,selection,ctx.ui.actor);},selection.length+(saved.kind==='calendar'?' draft posts imported.':' creative briefs attached.'));
        pending=null;raw='';errorText='';epoch++;ctx.render();return true;
      }
    }catch(error){const modal=document.querySelector('#bulk-confirm-error');if(modal){modal.textContent=error.message;modal.focus();}else fail(ctx,error);}return true;
  }
  async function change(ctx,event){
    const el=event.target;if(!el.matches('#bulk-csv,#bulk-xlsx,#bulk-owner,[data-bulk-map],[data-bulk-row]'))return false;reset(ctx);
    try{
      if(el.id==='bulk-csv'||el.id==='bulk-xlsx'){if(el.files?.[0])await load(ctx,el.files[0],el.id==='bulk-csv'?'calendar':'briefs');return true;}
      assert(ctx);if(!pending)return true;
      if(el.id==='bulk-owner')pending.ownerId=el.value;
      if(el.dataset.bulkMap)pending.map[el.dataset.bulkMap]=Number(el.value);
      if(el.dataset.bulkRow!==undefined){const i=Number(el.dataset.bulkRow);pending.excluded=pending.excluded.filter(n=>n!==i);if(!el.checked)pending.excluded.push(i);}
      refresh(ctx);
    }catch(error){fail(ctx,error);}return true;
  }
  async function submit(ctx,event){
    const f=event.target;if(f.id!=='bulk-edit-form')return false;event.preventDefault();const p=ctx.state.posts.find(p=>p.id===f.dataset.post&&p.brandId===ctx.ui.brand);
    try{if(!p)throw Error('This brief is unavailable.');root.JMLGovernance?.assert(ctx.state,ctx.ui,'edit',p);const values=Object.fromEntries(new FormData(f));await ctx.commit(next=>{const target=next.posts.find(x=>x.id===p.id);if(target.briefRevision!==Number(f.dataset.revision))throw Error('This brief has changed. Reopen the latest version.');D.editBrief(target,values,ctx.ui.actor);},'Creative brief revision saved.');}catch(error){fail(ctx,error);}return true;
  }
  function content(ctx,p){
    const b=p.brief.creativeBrief;const studio=(!root.JMLGovernance||root.JMLGovernance.can(ctx.state,ctx.ui,'edit',p))?ctx.btn('Open full Creative Brief Studio','bulk-studio','','data-id="'+ctx.e(p.id)+'"'):'';if(!b)return '<section class="panel bulk-attached"><h2>Creative Brief Studio</h2><p>Build the full strategy, production and delivery brief. Save into this content record’s version history.</p>'+studio+'</section>';
    return '<section class="panel bulk-attached"><div class="bulk-section-head"><div><div class="eyebrow">PRODUCTION DETAIL / '+ctx.e(b.kind)+'</div><h2>Attached creative brief</h2><p class="muted">'+ctx.e(p.externalId||p.id)+' · brief revision '+p.briefRevision+'</p></div>'+((!root.JMLGovernance||root.JMLGovernance.can(ctx.state,ctx.ui,'edit',p))?ctx.btn('Edit detailed brief','bulk-edit','','data-id="'+ctx.e(p.id)+'"'):'')+studio+'</div><details><summary>Read all production and delivery fields</summary><dl class="bulk-fields">'+Object.entries(b.values).map(([k,v])=>'<dt>'+ctx.e(k)+'</dt><dd>'+ctx.e(v||'Not provided')+'</dd>').join('')+'</dl></details><p class="source-note">Source owner: '+ctx.e(b.values['Suggested owner'])+' · Source status: '+ctx.e(b.values.Status)+'. Active assignments and approvals are managed in the workflow.</p></section>';
  }
  function init(ctx){reset(ctx);const t=document.querySelector('#bulk-raw');if(t)t.addEventListener('input',()=>{raw=t.value;pending=null;epoch++;refresh(ctx);});}
  root.JMLBulk={view,action,change,submit,content,init,validate:D.validate};
})(window);
