// mobile menu
const burger=document.querySelector('.burger'),menu=document.querySelector('.nav ul');
burger?.addEventListener('click',()=>menu.classList.toggle('open'));
menu?.addEventListener('click',e=>{if(e.target.tagName==='A')menu.classList.remove('open')});

// ===== Meta Pixel (Meta Ads) =====
// TODO: coloque o ID do Pixel (so numeros) para ativar PageView, Lead e Contact.
const META_PIXEL_ID='';
if(META_PIXEL_ID){
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init',META_PIXEL_ID);fbq('track','PageView');
}
const track=(ev)=>{try{window.fbq&&fbq('track',ev)}catch{}};
document.querySelectorAll('[data-track]').forEach(a=>a.addEventListener('click',()=>track(a.dataset.track)));

// quote form
// TODO: troque FORM_ENDPOINT por um endpoint real (ex.: Formspree/Web3Forms) para receber os leads por e-mail.
const FORM_ENDPOINT='';
document.querySelectorAll('form[data-quote]').forEach(f=>{
  f.addEventListener('submit',async e=>{
    e.preventDefault();
    const ok=f.parentElement.querySelector('#form-ok')||document.getElementById('form-ok');
    const data=Object.fromEntries(new FormData(f));
    try{
      if(FORM_ENDPOINT){
        const r=await fetch(FORM_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)});
        if(!r.ok)throw new Error();
      }else{
        console.info('Quote request (no endpoint configured):',data);
      }
      track('Lead');f.reset();ok.style.display='block';
    }catch{
      alert('Sorry, something went wrong. Please call us instead.');
    }
  });
});
// before/after slider: two sweeps left<->right, then user control
(function(){
  const ba=document.getElementById('ba');if(!ba)return;
  const range=ba.querySelector('.ba-range');
  const set=v=>{ba.style.setProperty('--pos',v+'%');range.value=v};
  range.addEventListener('input',()=>{stop=true;set(range.value)});
  let stop=false;
  const keys=[[50,0],[8,900],[92,1500],[8,1500],[92,1500],[50,1000]]; // [target%, duration ms]
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce)return;
  let i=1,from=50,t0=null;
  const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  function step(ts){
    if(stop)return;
    if(t0===null)t0=ts;
    const [to,dur]=keys[i];const p=Math.min((ts-t0)/dur,1);
    set(from+(to-from)*ease(p));
    if(p>=1){from=to;i++;t0=null;if(i>=keys.length)return}
    requestAnimationFrame(step);
  }
  setTimeout(()=>requestAnimationFrame(step),700);
})();
document.getElementById('year').textContent=new Date().getFullYear();

// stats: zoom-in reveal, count-up and floating 3D slabs on scroll
(function(){
  const sec=document.getElementById('numbers');if(!sec)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce||!('IntersectionObserver' in window))return;
  document.documentElement.classList.add('anim');
  const stats=[...sec.querySelectorAll('.stat')];
  const ease=t=>1-Math.pow(1-t,3);
  stats.forEach(s=>{s.querySelector('b').textContent='0'+(s.dataset.suffix||'')});
  function count(s,delay){
    const el=s.querySelector('b'),to=+s.dataset.to,suf=s.dataset.suffix||'',dur=1500;
    setTimeout(()=>{const t0=performance.now();
      (function tick(now){const p=Math.min((now-t0)/dur,1);el.textContent=Math.round(to*ease(p))+suf;if(p<1)requestAnimationFrame(tick)})(t0)},delay);
  }
  new IntersectionObserver((es,ob)=>{es.forEach(e=>{if(e.isIntersecting){
    sec.classList.add('in');stats.forEach((s,i)=>count(s,i*220+150));ob.disconnect();}})},{threshold:.3}).observe(sec);
  // slabs tilt + drift with scroll position
  const img=sec.querySelector('.slabs img');let ticking=false;
  function upd(){ticking=false;const r=sec.getBoundingClientRect(),vh=innerHeight;
    const p=Math.max(0,Math.min(1,(vh-r.top)/(vh+r.height)));
    img.style.setProperty('--ry',(-16+p*30).toFixed(1)+'deg');
    img.style.setProperty('--rx',(5-p*8).toFixed(1)+'deg');
    img.style.setProperty('--ty',((0.5-p)*40).toFixed(0)+'px');}
  addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(upd)}},{passive:true});upd();
})();

// video cards (bathroom + kitchen): fade in from the left; the video starts only once the card has fully appeared and is 100% on screen;
// it pauses when the card leaves the screen and everything replays on the next visit.
function initVideoCard(id){
  const card=document.getElementById(id);if(!card)return;
  const vid=card.querySelector('video'),wrap=card.querySelector('.ba3d');if(!vid||!wrap)return;
  vid.muted=true;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce||!('IntersectionObserver' in window)){vid.controls=true;return;}
  let started=false,active=false,faded=false,full=false,playing=false,timers=[];
  const clear=()=>{timers.forEach(clearTimeout);timers=[]};
  function play(tries){const p=vid.play();if(p&&p.catch)p.catch(err=>{
    if(err&&err.name==='AbortError'&&tries>0&&active){setTimeout(()=>play(tries-1),150);}
    else if(err&&err.name==='NotAllowedError'){vid.controls=true;}});}
  function tryPlay(){if(active&&faded&&full&&!playing){playing=true;play(2);}}
  // start fetching shortly before the card is reached (never after playback has begun)
  new IntersectionObserver((es,ob)=>{es.forEach(e=>{if(e.isIntersecting){ob.disconnect();if(!started&&!active){started=true;vid.preload='auto';vid.load();}}})},{rootMargin:'700px 0px'}).observe(wrap);
  // 1) appear: simple fade-in once a part of the card shows
  new IntersectionObserver(es=>{es.forEach(e=>{
    if(e.isIntersecting&&!active){active=true;started=true;card.classList.add('in');
      timers.push(setTimeout(()=>{faded=true;tryPlay()},900));
      timers.push(setTimeout(()=>card.classList.add('text-in'),700));}
    else if(!e.isIntersecting&&active){active=false;faded=false;full=false;playing=false;clear();vid.pause();card.classList.remove('in','text-in');}
  })},{threshold:[0,.05]}).observe(wrap);
  // 2) "100% visible": the whole video frame is on screen, clear of the sticky header and bottom bar
  const steps=[];for(let i=0;i<=20;i++)steps.push(i/20);
  new IntersectionObserver(es=>{es.forEach(e=>{
    const room=innerHeight-152,h=e.boundingClientRect.height,need=h>room?Math.max(.5,room/h*.9):.98;
    full=e.intersectionRatio>=need;tryPlay();
  })},{rootMargin:'-64px 0px -88px 0px',threshold:steps}).observe(wrap);
}
initVideoCard('bathCard');initVideoCard('kitchenCard');

// preparation video: fade in from the left, plays only while on screen
(function(){
  const box=document.querySelector('.prep-vid');if(!box)return;
  const vid=box.querySelector('video');vid.muted=true;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce||!('IntersectionObserver' in window)){vid.controls=true;return;}
  let started=false,active=false;
  function play(n){const p=vid.play();if(p&&p.catch)p.catch(e=>{if(e&&e.name==='AbortError'&&n>0&&active)setTimeout(()=>play(n-1),150);else if(e&&e.name==='NotAllowedError')vid.controls=true;});}
  new IntersectionObserver((es,ob)=>{es.forEach(e=>{if(e.isIntersecting){ob.disconnect();if(!started&&!active){started=true;vid.preload='auto';vid.load();}}})},{rootMargin:'700px 0px'}).observe(box);
  new IntersectionObserver(es=>{es.forEach(e=>{
    if(e.isIntersecting&&e.intersectionRatio>=.5&&!active){active=true;started=true;box.classList.add('in');setTimeout(()=>{if(active)play(2)},700);}
    else if(!e.isIntersecting&&active){active=false;vid.pause();box.classList.remove('in');}
  })},{threshold:[0,.5]}).observe(box);
})();
