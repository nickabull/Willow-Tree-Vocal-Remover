const file=document.querySelector('#file'),url=document.querySelector('#url'),extract=document.querySelector('#extract'),status=document.querySelector('#status'),statusText=document.querySelector('#statusText'),results=document.querySelector('#results');
const original=document.querySelector('#original'),vocals=document.querySelector('#vocals'),instrumental=document.querySelector('#instrumental');
const dOriginal=document.querySelector('#downloadOriginal'),dVocals=document.querySelector('#downloadVocals'),dInstrumental=document.querySelector('#downloadInstrumental');

const SPACE_ID='Politrees/audio-separator_UVR';

function busy(text){status.classList.remove('hidden');results.classList.add('hidden');statusText.textContent=text}
function done(){status.classList.add('hidden');results.classList.remove('hidden')}
function fail(e){status.classList.remove('hidden');results.classList.add('hidden');statusText.textContent='That one did not separate successfully. '+(e?.message||'Please try again.')}
function setAudio(el,link,download){el.src=link;download.href=link;download.setAttribute('download','')}

function fileUrl(x){
  if(!x) return '';
  if(typeof x==='string') return x;
  return x.url || x.path || '';
}

async function separate(upload){
  busy('Connecting to the vocal separator…');

  const { Client, handle_file } = await import('https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js');
  const app = await Client.connect(SPACE_ID);

  busy('Uploading your track…');

  const inputs = [
    handle_file(upload),
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
  ];

  busy('Separating vocals — this can take a few minutes on the free service…');

  const result = await app.predict('/roformer_separator', inputs);
  const stems = result?.data;

  if(!Array.isArray(stems) || stems.length < 2) throw new Error('No stems were returned');

  const a=fileUrl(stems[0]), b=fileUrl(stems[1]);
  if(!a || !b) throw new Error('The service did not return two playable stems');

  const nameA=JSON.stringify(stems[0]).toLowerCase();
  const nameB=JSON.stringify(stems[1]).toLowerCase();
  let vocalUrl=a, instUrl=b;

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