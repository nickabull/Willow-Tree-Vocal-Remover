const file=document.querySelector('#file'),url=document.querySelector('#url'),extract=document.querySelector('#extract'),status=document.querySelector('#status'),statusText=document.querySelector('#statusText'),results=document.querySelector('#results');
const original=document.querySelector('#original'),vocals=document.querySelector('#vocals'),instrumental=document.querySelector('#instrumental');
const dOriginal=document.querySelector('#downloadOriginal'),dVocals=document.querySelector('#downloadVocals'),dInstrumental=document.querySelector('#downloadInstrumental');
const SPACE='https://la44578-vocal-separation.hf.space';
function busy(text){status.classList.remove('hidden');results.classList.add('hidden');statusText.textContent=text}
function done(){status.classList.add('hidden');results.classList.remove('hidden')}
function fail(e){status.classList.remove('hidden');statusText.textContent='That one did not separate successfully. '+(e?.message||'Please try another file.')}
function setAudio(el,link,download){el.src=link;download.href=link;download.setAttribute('download','')}
async function separate(upload){
  busy('Uploading your track…');
  const fd=new FormData();fd.append('files',upload);
  const up=await fetch(SPACE+'/upload',{method:'POST',body:fd});
  if(!up.ok)throw new Error('Upload failed');
  const uploaded=await up.json();
  const path=Array.isArray(uploaded)?uploaded[0]:uploaded;
  busy('Separating vocals — this can take a minute…');
  const join=await fetch(SPACE+'/gradio_api/call/separate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:[{path:path},'Mel-RoFormer']})});
  if(!join.ok)throw new Error('Separation service unavailable');
  const job=await join.json();
  const event=await fetch(SPACE+'/gradio_api/call/separate/'+job.event_id);
  if(!event.ok)throw new Error('Processing failed');
  const text=await event.text();
  const lines=text.split('\n');let payload=null;
  for(let i=0;i<lines.length;i++)if(lines[i].startsWith('data: ')){try{const x=JSON.parse(lines[i].slice(6));if(Array.isArray(x)&&x.length>=2)payload=x}catch{}}
  if(!payload)throw new Error('No stems returned');
  const toUrl=x=>x?.url||(x?.path?SPACE+'/gradio_api/file='+encodeURIComponent(x.path):'');
  const v=toUrl(payload[0]),inst=toUrl(payload[1]);
  if(!v||!inst)throw new Error('No audio returned');
  const local=URL.createObjectURL(upload);setAudio(original,local,dOriginal);setAudio(vocals,v,dVocals);setAudio(instrumental,inst,dInstrumental);done();
}
file.addEventListener('change',async()=>{const chosen=file.files[0];if(!chosen)return;try{await separate(chosen)}catch(e){fail(e)}});
extract.addEventListener('click',()=>{if(!url.value.trim()){url.focus();return}busy('YouTube links are next. For this first live test, use Upload Audio below.');setTimeout(()=>status.classList.add('hidden'),5000)});