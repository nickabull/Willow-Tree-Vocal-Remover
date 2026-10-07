const file=document.querySelector('#file'),url=document.querySelector('#url'),extract=document.querySelector('#extract'),status=document.querySelector('#status'),statusText=document.querySelector('#statusText'),results=document.querySelector('#results');
const original=document.querySelector('#original'),vocals=document.querySelector('#vocals'),instrumental=document.querySelector('#instrumental');
const dOriginal=document.querySelector('#downloadOriginal'),dVocals=document.querySelector('#downloadVocals'),dInstrumental=document.querySelector('#downloadInstrumental');

const SPACE='https://politrees-audio-separator-uvr.hf.space';

function busy(text){status.classList.remove('hidden');results.classList.add('hidden');statusText.textContent=text}
function done(){status.classList.add('hidden');results.classList.remove('hidden')}
function fail(e){status.classList.remove('hidden');results.classList.add('hidden');statusText.textContent='That one did not separate successfully. '+(e?.message||'Please try again.')}
function setAudio(el,link,download){el.src=link;download.href=link;download.setAttribute('download','')}

async function uploadToSpace(upload){
  const fd=new FormData();
  fd.append('files',upload);
  const r=await fetch(SPACE+'/upload',{method:'POST',body:fd});
  if(!r.ok) throw new Error('Upload failed');
  const data=await r.json();
  return Array.isArray(data)?data[0]:data;
}

async function callRoformer(path){
  const payload={data:[
    {path:path,orig_name:file.files[0]?.name||'track'},
    'Mel-Roformer-Viperx-1143',
    256,
    false,
    8,
    0,
    '/tmp/audio-separator-models/',
    'output',
    'mp3',
    0.9,
    0.0,
    1,
    'NAME_(STEM)_MODEL',
    'NAME_(STEM)_MODEL',
    'NAME_(STEM)_MODEL',
    'NAME_(STEM)_MODEL',
    'NAME_(STEM)_MODEL',
    'NAME_(STEM)_MODEL',
    'NAME_(STEM)_MODEL'
  ]};

  const start=await fetch(SPACE+'/gradio_api/call/roformer_separator',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  if(!start.ok) throw new Error('Separation service is unavailable');
  const job=await start.json();
  if(!job.event_id) throw new Error('No processing job was created');

  const stream=await fetch(SPACE+'/gradio_api/call/roformer_separator/'+job.event_id);
  if(!stream.ok) throw new Error('Processing failed');
  const text=await stream.text();

  let result=null;
  for(const line of text.split('\n')){
    if(!line.startsWith('data: ')) continue;
    try{
      const parsed=JSON.parse(line.slice(6));
      if(Array.isArray(parsed) && parsed.length>=2) result=parsed;
    }catch{}
  }
  if(!result) throw new Error('No stems were returned');
  return result;
}

function fileUrl(x){
  if(!x) return '';
  if(typeof x==='string'){
    if(x.startsWith('http')) return x;
    return SPACE+'/gradio_api/file='+encodeURIComponent(x);
  }
  if(x.url) return x.url;
  if(x.path) return SPACE+'/gradio_api/file='+encodeURIComponent(x.path);
  return '';
}

async function separate(upload){
  busy('Uploading your track…');
  const remote=await uploadToSpace(upload);
  busy('Separating vocals — this can take a few minutes on the free service…');
  const stems=await callRoformer(remote);

  const a=fileUrl(stems[0]),b=fileUrl(stems[1]);
  if(!a||!b) throw new Error('The service did not return two playable stems');

  const nameA=JSON.stringify(stems[0]).toLowerCase();
  const nameB=JSON.stringify(stems[1]).toLowerCase();
  let vocalUrl=a,instUrl=b;
  if(nameA.includes('instrument')||nameA.includes('other')){vocalUrl=b;instUrl=a}
  if(nameB.includes('vocal')){vocalUrl=b;instUrl=a}

  const local=URL.createObjectURL(upload);
  setAudio(original,local,dOriginal);
  setAudio(vocals,vocalUrl,dVocals);
  setAudio(instrumental,instUrl,dInstrumental);
  done();
}

file.addEventListener('change',async()=>{
  const chosen=file.files[0];
  if(!chosen)return;
  try{await separate(chosen)}catch(e){console.error(e);fail(e)}
});

extract.addEventListener('click',()=>{
  if(!url.value.trim()){url.focus();return}
  busy('YouTube-link processing is coming next. For now, use Upload Audio below.');
  setTimeout(()=>status.classList.add('hidden'),4500);
});