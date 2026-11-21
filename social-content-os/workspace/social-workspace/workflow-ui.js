/* Shared task hierarchy. Native disclosures preserve access to uncommon options. */
(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const section=(title,note,fields)=>'<fieldset class="task-section full"><legend>'+esc(title)+'</legend>'+(note?'<p class="task-note">'+esc(note)+'</p>':'')+'<div class="form-grid">'+fields+'</div></fieldset>';
  const optional=(title,fields,open=false)=>'<details class="task-options full"'+(open?' open':'')+'><summary>'+esc(title)+'</summary><div class="form-grid">'+fields+'</div></details>';
  const summary=(title,text)=>'<div class="task-summary full"><strong>'+esc(title)+'</strong><p>'+esc(text)+'</p></div>';
  const lead=(title,text,action='')=>'<section class="task-lead"><div><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p></div>'+action+'</section>';
  let installed=false;
  function init(){
    if(installed||typeof document==='undefined')return;installed=true;
    document.addEventListener('invalid',ev=>{let parent=ev.target.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}},true);
  }
  const api={section,optional,summary,lead,init};
  init();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.JMLWorkflowUI=api;
})(typeof window==='undefined'?globalThis:window);
