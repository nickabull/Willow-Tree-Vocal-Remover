const $=id=>document.getElementById(id);
const file=$('file'),url=$('url'),extract=$('extract'),status=$('status'),statusText=$('statusText'),results=$('results');
const SPACE_ID='abidlabs/music-separation';
let currentFile=null, stemUrls=null;
function busy(text){status.classList.remove('hidden');results.classList.add('hidden');statusText.textContent=text}
function done(){status.classList.add('hidden');results.classList.remove('hidden')}
function fail(e){status.classList.remove('hidden');results.classList.add('hidden');statusText.textContent='Separation failed: '+(e?.message||'Please try again.')}
function safe(s){return (s||'Unknown').replace(/[\\/:*?"<>|\x00-\x1f]/g,'').trim().replace(/\s+/g,' ').slice(0,100)||'Unknown'}
function base(){return [safe($('trackTitle').value),safe($('artist').value),safe($('production').value)].join(' - ')}
function filename(kind,ext){return base()+' ('+kind+').'+ext}
function extFrom(name){return (name?.split('.').pop()||'mp3').toLowerCase().replace(/[^a-z0-9]/g,'')||'mp3'}
function updateNames(){if(!currentFile)return;$('downloadOriginal').download=filename('Full Track',extFrom(currentFile.name));$('downloadVocals').download=filename('Vocals','mp3');$('downloadInstrumental').download=filename('Instrumental','mp3')}
['trackTitle','artist','production'].forEach(id=>$(id).addEventListener('input',updateNames));
function fileUrl(x){return typeof x==='string'?x:x?.url||x?.path||''}
async function separate(upload){
  busy('Connecting to the vocal separator…');
  const {Client,handle_file}=await import('https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js');
  const app=await Client.connect(SPACE_ID);
  busy('Uploading and separating your track. The free service may take several minutes…');
  const response=await app.predict('/inference',[handle_file(upload)]);
  const stems=response?.data;
  if(!Array.isArray(stems)||stems.length<2)throw Error('The separator did not return vocals and instrumental');
  const a=fileUrl(stems[0]),b=fileUrl(stems[1]);if(!a||!b)throw Error('Missing audio download links');
  let vocalUrl=a,instUrl=b;
  const nameA=JSON.stringify(stems[0]).toLowerCase(),nameB=JSON.stringify(stems[1]).toLowerCase();
  if(nameA.includes('instrument')||nameA.includes('other')||nameB.includes('vocal')){vocalUrl=b;instUrl=a}
  stemUrls={vocals:vocalUrl,instrumental:instUrl};
  const originalUrl=URL.createObjectURL(upload);
  for(const [id,link] of [['original',originalUrl],['vocals',vocalUrl],['instrumental',instUrl]]){$(id).src=link;$('download'+id[0].toUpperCase()+id.slice(1)).href=link}
  updateNames();done();
}
file.addEventListener('change',async()=>{
 const chosen=file.files?.[0];if(!chosen)return;
 currentFile=chosen;stemUrls=null;
 const guessed=chosen.name.replace(/\.[^.]+$/,'').replace(/^\d{1,3}[\s._-]+/,'').replace(/(?:[\s_-]+(?:edit|mixdown|final|master|copy))+$/ig,'').split(/\s+-\s+/);
 $('trackTitle').value=guessed[0]||'';$('artist').value=guessed.length>1?guessed[1]:'';$('production').value=guessed.length>2?guessed.slice(2).join(' - '):'';
 updateNames();try{await separate(chosen)}catch(e){console.error(e);fail(e)}
});
extract.addEventListener('click',()=>{if(!url.value.trim()){url.focus();return}status.classList.remove('hidden');statusText.textContent='YouTube-link processing is not yet available. Please upload an audio file.'});
async function lyricsBlob(){
 if(!window.docx)throw Error('Word document library could not load; check your connection.');
 const {Document,Paragraph,TextRun,Packer}=window.docx;
 const title=[$('trackTitle').value,$('artist').value,$('production').value].map(s=>s.trim());
 const lines=$('lyricsText').value.split(/\r?\n/);
 const children=[...title.map((s,i)=>new Paragraph({children:[new TextRun({text:s||'Unknown',bold:i===0,size:i===0?32:22})],spacing:{after:120}})),new Paragraph({text:''}),...lines.map(line=>new Paragraph({text:line,spacing:{after:60}}))];
 return Packer.toBlob(new Document({sections:[{children}]}));
}
function save(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)}
function note(s){$('downloadStatus').textContent=s}
$('downloadLyrics').addEventListener('click',async()=>{try{note('Creating Word document…');save(await lyricsBlob(),filename('Lyrics','docx'));note('Word document ready.')}catch(e){note(e.message)}});
/* Waveform and synchronised playback */
const ids=['original','vocals','instrumental'],waves={};let mixInterval=null;
const formatTime=t=>{t=Number.isFinite(t)?t:0;return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')};
function renderWave(id){
 const el=$('wave-'+id),ctx=el.getContext('2d'),w=el.width=Math.max(100,Math.round(el.clientWidth*devicePixelRatio)),h=el.height=92*devicePixelRatio;
 const samples=waves[id]||Array(160).fill(.06),master=$('original'),ratio=master.duration?master.currentTime/master.duration:0;
 ctx.fillStyle='#222229';ctx.fillRect(0,0,w,h);
 samples.forEach((v,i)=>{let bh=Math.max(2,v*h*.86);ctx.fillStyle={original:'#f1c66a',vocals:'#9c83ff',instrumental:'#36e987'}[id];ctx.globalAlpha=i/samples.length<ratio?1:.48;ctx.fillRect(i*w/samples.length,(h-bh)/2,Math.max(1,w/samples.length-1),bh)});
 ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.fillRect(Math.min(w-2,w*ratio),0,2,h);
}
function updateMix(){ids.forEach(renderWave);$('mixClock').textContent=formatTime($('original').currentTime)+' / '+formatTime($('original').duration)}
function stopMix(reset=false){clearInterval(mixInterval);mixInterval=null;ids.forEach(id=>{$(id).pause();if(reset)$(id).currentTime=0});$('mixPlay').textContent='▶ Play';updateMix()}
$('mixPlay').addEventListener('click',async()=>{
 if(mixInterval){stopMix();return}
 if(!$('original').src)return;
 const t=$('original').currentTime;
 try{await Promise.all(ids.map(async id=>{const a=$(id);a.muted=!$('stem-'+id).checked;a.currentTime=t;await a.play()}));
 $('mixPlay').textContent='❚❚ Pause';mixInterval=setInterval(()=>{const now=$('original').currentTime;for(const id of ['vocals','instrumental'])if(Math.abs($(id).currentTime-now)>.25)$(id).currentTime=now;updateMix()},90)
 }catch(e){console.warn('Mixer playback failed',e);stopMix()}
});
$('mixStop').addEventListener('click',()=>stopMix(true));
$('original').addEventListener('ended',()=>stopMix(true));
ids.forEach(id=>{
 $('stem-'+id).addEventListener('change',()=>{
 if(id==='original'&&$('stem-original').checked){$('stem-vocals').checked=false;$('stem-instrumental').checked=false}
 else if(id!=='original'&&$('stem-'+id).checked)$('stem-original').checked=false;
 ids.forEach(x=>$(x).muted=!$('stem-'+x).checked);updateMix()
 });
 $('wave-'+id).addEventListener('click',e=>{const d=$('original').duration;if(!d)return;const rect=e.target.getBoundingClientRect(),t=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*d;ids.forEach(x=>$(x).currentTime=t);updateMix()})
});
window.addEventListener('resize',()=>{if(!results.classList.contains('hidden'))updateMix()});
function peaksFor(buffer){const data=buffer.getChannelData(0),n=160,block=Math.ceil(data.length/n);return Array.from({length:n},(_,i)=>{let peak=0;for(let p=i*block;p<Math.min(data.length,(i+1)*block);p+=Math.max(1,Math.floor(block/100)))peak=Math.max(peak,Math.abs(data[p]));return Math.max(.02,peak)})}
async function analyseWave(id){
 try{const response=await fetch($(id).src);if(!response.ok)throw Error('fetch failed');const context=new (window.AudioContext||window.webkitAudioContext)(),buffer=await context.decodeAudioData(await response.arrayBuffer());waves[id]=peaksFor(buffer);if(id==='original')$('detectedKey').textContent='Musical key: '+estimateKey(buffer);await context.close()}
 catch(e){console.warn('Analysis unavailable',id,e);waves[id]=Array(160).fill(.06);if(id==='original')$('detectedKey').textContent='Musical key: unavailable for this file'}
 updateMix()
}
/* Approximate key from pitch-class energy. A guide, not a definitive musicological result. */
function estimateKey(buffer){
 const data=buffer.getChannelData(0),sr=buffer.sampleRate,energy=Array(12).fill(0),N=4096,hop=Math.max(N,Math.floor(data.length/18)),notes=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
 const bins=[];for(let midi=48;midi<=83;midi++){const f=440*Math.pow(2,(midi-69)/12);bins.push({pc:midi%12,omega:2*Math.PI*f/sr})}
 for(let start=0;start+N<data.length;start+=hop){for(const b of bins){let a=0,c=0;for(let k=0;k<N;k+=2){const s=data[start+k]*(.5-.5*Math.cos(2*Math.PI*k/N));a+=s*Math.cos(b.omega*k);c+=s*Math.sin(b.omega*k)}energy[b.pc]+=Math.sqrt(a*a+c*c)}}
 const major=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],minor=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
 let best=-Infinity,result='Unknown';
 for(let root=0;root<12;root++)for(const [label,profile] of [['major',major],['minor',minor]]){let score=0;for(let i=0;i<12;i++)score+=energy[(root+i)%12]*profile[i];if(score>best){best=score;result=notes[root]+' '+label}}
 return result+' (estimate)';
}
const oldDone=done;
done=function(){oldDone();stopMix(true);$('stem-original').checked=false;$('stem-vocals').checked=true;$('stem-instrumental').checked=true;ids.forEach(id=>{$(id).muted=!$('stem-'+id).checked;analyseWave(id)});updateMix()};
