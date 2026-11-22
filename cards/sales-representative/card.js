'use strict';
// iOS Messages uses a different separator than the standard SMS URI.
const textLink = document.getElementById('text');
const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (textLink && appleMobile) {
  textLink.setAttribute('href',textLink.getAttribute('href').replace('?body=','&body='));
}
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
  if (document.documentElement.classList.contains('intro-collapse')) {
    header.classList.add('active');
    header.style.setProperty('--motion','1');
    document.documentElement.style.setProperty('--elia-mini-height',header.offsetHeight+'px');
    return;
  }
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

const root = document.documentElement;
const portrait = photo.querySelector(':scope > img');
const miniPortrait = header.querySelector('img');
let introWaiting = false;
let introTimeout;
let onPortraitLoad;
const earlyInputs = ['pointerdown','wheel','touchstart','keydown','focusin'];
function cancelIntro(){
  introWaiting = false;
  clearTimeout(introTimeout);
  if(onPortraitLoad) portrait.removeEventListener("load",onPortraitLoad);
  earlyInputs.forEach(name=>window.removeEventListener(name,cancelIntro,true));
  window.removeEventListener('scroll',cancelIntro,true);
  document.removeEventListener('visibilitychange',cancelIntro);
}
function compactIntro(){
  if(!introWaiting) return;
  cancelIntro();
  if(Math.abs(scrollY)>=2 || document.hidden) return;
  if (!motion.matches && (!portrait.complete || !portrait.naturalWidth)) return;
  const opening = portrait.getBoundingClientRect();
  const canAnimate = !motion.matches && opening.width > 0 && opening.height > 0 && typeof portrait.animate === 'function';
  root.classList.add('intro-collapse');
  paintHeader();
  if(!canAnimate) return;
  const ending = miniPortrait.getBoundingClientRect();
  if(!ending.width || !ending.height) return;
  root.classList.add('intro-moving');
  const flight = portrait.cloneNode(false);
  flight.className = 'intro-flight';
  flight.alt = '';
  flight.setAttribute('aria-hidden','true');
  flight.removeAttribute('width');
  flight.removeAttribute('height');
  document.body.append(flight);
  const frame = (rect, radius, position, border) => ({
    top:rect.top+'px', left:rect.left+'px', width:rect.width+'px', height:rect.height+'px',
    borderRadius:radius, objectPosition:position, border
  });
  const timing = {duration:1120,easing:'cubic-bezier(.22,.82,.24,1)',fill:'both'};
  const move = flight.animate([frame(opening,'0px','50% 40%','0 solid transparent'),frame(ending,'.34rem','50% 42%','1px solid #b8e000')],timing);
  photo.animate([{height:opening.height+'px'},{height:'0px'}],timing);
  const profile=document.querySelector('.profile');
  profile.animate([{opacity:.55},{opacity:1}],{duration:1040,easing:'ease-out'});
  const cleanup = () => {flight.remove();root.classList.remove('intro-moving');};
  move.finished.then(cleanup,cleanup);
}
function beginIntro(){
  if (document.hidden || Math.abs(scrollY)>=2) return;
  introWaiting = true;
  earlyInputs.forEach(name=>window.addEventListener(name,cancelIntro,{capture:true,passive:true}));
  window.addEventListener('scroll',cancelIntro,{capture:true,passive:true});
  document.addEventListener('visibilitychange',cancelIntro,{once:true});
  if (portrait.complete || motion.matches) introTimeout=setTimeout(compactIntro,1000);
  else {
    onPortraitLoad=()=>{
      if(!introWaiting)return;
      clearTimeout(introTimeout);
      introTimeout=setTimeout(compactIntro,1000);
    };
    portrait.addEventListener('load',onPortraitLoad,{once:true});
    introTimeout=setTimeout(cancelIntro,5000);
  }
}
beginIntro();
