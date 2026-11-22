// mobile menu
const burger=document.querySelector('.burger'),menu=document.querySelector('.nav ul');
burger?.addEventListener('click',()=>menu.classList.toggle('open'));
menu?.addEventListener('click',e=>{if(e.target.tagName==='A')menu.classList.remove('open')});

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
      f.reset();ok.style.display='block';
    }catch{
      alert('Sorry, something went wrong. Please call us instead.');
    }
  });
});
document.getElementById('year').textContent=new Date().getFullYear();
