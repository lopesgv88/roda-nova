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
