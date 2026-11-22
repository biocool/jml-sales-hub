'use strict';
const modes=[...document.querySelectorAll('[data-mode]')];
const preferred=matchMedia('(prefers-color-scheme: dark)');
let explicitMode=null;
try { explicitMode=localStorage.getItem('jml-elia-card-theme'); } catch {}
function theme(mode,manual=false){
  const value=mode==='dark'?'dark':'light';
  document.documentElement.dataset.theme=value;
  modes.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===value)));
  if(manual){explicitMode=value;try{localStorage.setItem('jml-elia-card-theme',value)}catch{}}
}
theme(explicitMode||(preferred.matches?'dark':'light'));
modes.forEach(b=>b.addEventListener('click',()=>theme(b.dataset.mode,true)));
preferred.addEventListener('change', e=>{if(!explicitMode)theme(e.matches?'dark':'light')});
const header = document.querySelector('.mini');
const photo = document.querySelector('.portrait');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let frameQueued = false;
function paintHeader() {
  frameQueued = false;
  // Measure only the stable, in-flow photo; the fixed header cannot affect its geometry.
  const travel = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const finish = Math.min(Math.max(1, photo.offsetHeight - 60), Math.max(1, travel * .84));
  const start = Math.max(0, finish - Math.min(94, finish * .62));
  const input = Math.max(0, Math.min(1, (scrollY - start) / (finish - start)));
  const state = motion.matches ? (input >= 1 ? 1 : 0) : input * input * (3 - 2 * input);
  header.classList.toggle('active', state > 0);
  header.style.setProperty('--motion', state.toFixed(4));
}
function requestPaint() {
  if (!frameQueued) {
    frameQueued = true;
    requestAnimationFrame(paintHeader);
  }
}
window.addEventListener('scroll', requestPaint, {passive:true});
window.addEventListener('resize', requestPaint, {passive:true});
motion.addEventListener('change',requestPaint);
paintHeader();
