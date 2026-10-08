const $=id=>document.getElementById(id);
const file=$('file'),url=$('url'),extract=$('extract'),status=$('status'),statusText=$('statusText'),results=$('results');
const SPACE_ID='abidlabs/music-separation';
let currentFile=null, stemUrls=null,activeRequest=0,originalObjectUrl=null,localStemUrls=[],stemExtension='mp3',browserSeparator=null;
function busy(text){$('retrySeparation').classList.add('hidden');status.classList.add('is-processing');status.classList.remove('hidden');results.classList.add('hidden');$('localFallback').classList.add('hidden');statusText.textContent=text}
function done(){$('retrySeparation').classList.add('hidden');status.classList.remove('is-processing');status.classList.add('hidden');results.classList.remove('hidden')}
function fail(e){$('retrySeparation').classList.toggle('hidden',!currentFile);status.classList.remove('is-processing');status.classList.remove('hidden');results.classList.add('hidden');const message=e?.message||'Please try again.';const quota=/ZeroGPU quota|quota.*exceed|0s left/i.test(message);$('localFallback').classList.toggle('hidden',!quota);statusText.textContent=quota?'The free cloud processor has run out of GPU allowance. Your audio file is fine. You can try the alternative service below, or try again later.':'Separation failed: '+message}
function safe(s){return (s||'Unknown').replace(/[\\/:*?"<>|\x00-\x1f]/g,'').trim().replace(/\s+/g,' ').slice(0,100)||'Unknown'}
function base(){return [safe($('trackTitle').value),safe($('artist').value),safe($('production').value)].join(' - ')}
function filename(kind,ext){return base()+' ('+kind+').'+ext}
function extFrom(name){return (name?.split('.').pop()||'mp3').toLowerCase().replace(/[^a-z0-9]/g,'')||'mp3'}
function updateNames(){if(!currentFile)return;$('downloadOriginal').download=filename('Full Track',extFrom(currentFile.name));$('downloadVocals').download=filename('Vocals',stemExtension);$('downloadInstrumental').download=filename('Instrumental',stemExtension)}
['trackTitle','artist','production'].forEach(id=>$(id).addEventListener('input',updateNames));
function fileUrl(x){return typeof x==='string'?x:x?.url||x?.path||''}
async function separate(upload){
  const requestId=++activeRequest;
  busy('Connecting to the vocal separator…');
  const {Client,handle_file}=await import('https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js');
  const app=await Client.connect(SPACE_ID);
  busy('Uploading and separating your track. The free service may take several minutes…');
  const response=await app.predict('/inference',[handle_file(upload)]);
  if(requestId!==activeRequest)return;
  const stems=response?.data;
  if(!Array.isArray(stems)||stems.length<2)throw Error('The separator did not return vocals and instrumental');
  const a=fileUrl(stems[0]),b=fileUrl(stems[1]);if(!a||!b)throw Error('Missing audio download links');
  let vocalUrl=a,instUrl=b;
  const nameA=JSON.stringify(stems[0]).toLowerCase(),nameB=JSON.stringify(stems[1]).toLowerCase();
  if(nameA.includes('instrument')||nameA.includes('other')||nameB.includes('vocal')){vocalUrl=b;instUrl=a}
  stemExtension='mp3';stemUrls={vocals:vocalUrl,instrumental:instUrl};
  if(originalObjectUrl)URL.revokeObjectURL(originalObjectUrl);
  const originalUrl=URL.createObjectURL(upload);originalObjectUrl=originalUrl;
  for(const [id,link] of [['original',originalUrl],['vocals',vocalUrl],['instrumental',instUrl]]){$(id).src=link;$('download'+id[0].toUpperCase()+id.slice(1)).href=link}
  updateNames();done();
}

/* Browser fallback: runs entirely on the user's device, no cloud upload. */
async function browserSeparate(upload,requestId){
 busy('Loading the browser separator (first use downloads approximately 67 MB)…');
 const {createSeparator}=await import('https://esm.sh/web-audio-separation@0.3.1?bundle');
 if(requestId!==activeRequest)return;
 if(!browserSeparator){browserSeparator=createSeparator('UVR-MDX-NET-Voc_FT');await browserSeparator.loadModel()}
 if(requestId!==activeRequest)return;
 busy('Separating vocals in your browser. This can take several minutes…');
 const inputUrl=URL.createObjectURL(upload);
 let stems;
 try{stems=await browserSeparator.separate(inputUrl)}finally{URL.revokeObjectURL(inputUrl)}
 if(requestId!==activeRequest){if(Array.isArray(stems))stems.forEach(u=>{if(typeof u==='string'&&u.startsWith('blob:'))URL.revokeObjectURL(u)});return}
 if(!Array.isArray(stems)||stems.length<2)throw Error('Browser separator returned no audio stems');
 // Browser engine returns instrumental first, vocals second (verified by user listening).
 const [instUrl,vocalUrl]=stems;
 localStemUrls.forEach(u=>URL.revokeObjectURL(u));localStemUrls=[vocalUrl,instUrl];
 stemExtension='wav';stemUrls={vocals:vocalUrl,instrumental:instUrl};
 if(originalObjectUrl)URL.revokeObjectURL(originalObjectUrl);
 originalObjectUrl=URL.createObjectURL(upload);
 for(const [id,link] of [['original',originalObjectUrl],['vocals',vocalUrl],['instrumental',instUrl]]){$(id).src=link;$('download'+id[0].toUpperCase()+id.slice(1)).href=link}
 updateNames();done();
}
async function handleSeparationError(e,upload){
 console.warn('Cloud separation failed',e);
 const message=e?.message||'';
 if(/ZeroGPU quota|quota.*exceed|0s left/i.test(message)){
  const requestId=activeRequest;
  try{await browserSeparate(upload,requestId);return}catch(localError){
   console.error('Browser fallback failed',localError);
   if(requestId!==activeRequest)return;
   fail(new Error('Cloud quota exhausted, and browser processing could not start: '+(localError?.message||'unknown error')+'. Try the alternative website below.'));
   $('localFallback').classList.remove('hidden');return;
  }
 }
 if(upload===currentFile)fail(e);
}
$('retrySeparation').addEventListener('click',async()=>{if(!currentFile)return;try{await separate(currentFile)}catch(e){await handleSeparationError(e,currentFile)}});
file.addEventListener('change',async()=>{
 const chosen=file.files?.[0];if(!chosen)return;
 if(chosen.size>40*1024*1024){fail(new Error('Please choose an audio file smaller than 40 MB.'));file.value='';return}
 if(!chosen.type.startsWith('audio/')&&!/\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(chosen.name)){fail(new Error('Please choose an MP3, WAV, M4A, AAC, FLAC or OGG audio file.'));file.value='';return}
 ++activeRequest;
 if(typeof stopMix==='function')stopMix(true);
 results.classList.add('hidden');status.classList.add('hidden');
 currentFile=chosen;stemUrls=null;stemExtension='mp3';
 const guessed=chosen.name.replace(/\.[^.]+$/,'').replace(/^\d{1,3}[\s._-]+/,'').replace(/(?:[\s_-]+(?:edit|mixdown|final|master|copy))+$/ig,'').split(/\s+-\s+/);
 $('trackTitle').value=guessed[0]||'';$('artist').value=guessed.length>1?guessed[1]:'';$('production').value=guessed.length>2?guessed.slice(2).join(' - '):'';
 updateNames();if($('processingMode').value==='browser'){const requestId=++activeRequest;try{await browserSeparate(chosen,requestId)}catch(e){if(requestId===activeRequest){console.error('Browser separation failed',e);fail(new Error('Browser separation failed: '+(e?.message||'Unknown error')));$('localFallback').classList.remove('hidden')}}}else{try{await separate(chosen)}catch(e){await handleSeparationError(e,chosen)}}
});
/* Import a permitted direct audio file; do not scrape video sites or proxy arbitrary URLs. */
extract.addEventListener('click',async()=>{
 const raw=url.value.trim();if(!raw){url.focus();return}
 let target;try{target=new URL(raw)}catch(e){fail(new Error('Please enter a valid HTTPS audio-file link.'));return}
 if(target.protocol!=='https:'){fail(new Error('Please use a secure HTTPS audio-file link.'));return}
 if(/(^|\\.)(youtube\\.com|youtu\\.be|youtube-nocookie\\.com|music\\.youtube\\.com)$/i.test(target.hostname)){fail(new Error('YouTube video links cannot be imported directly. Please use an authorised audio file instead.'));return}
 const path=decodeURIComponent(target.pathname).split('/').pop()||'audio.mp3';
 if(!/\\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(path)){fail(new Error('The link must point directly to an MP3, WAV, M4A, AAC, FLAC or OGG file.'));return}
 extract.disabled=true;busy('Downloading authorised audio from the link…');
 try{
  const response=await fetch(target.href,{mode:'cors',credentials:'omit',redirect:'follow'});
  if(!response.ok)throw Error('The audio server returned HTTP '+response.status);
  const size=Number(response.headers.get('content-length')||0);
  if(size>40*1024*1024)throw Error('The audio file exceeds the 40 MB limit.');
  const blob=await response.blob();
  if(blob.size>40*1024*1024)throw Error('The audio file exceeds the 40 MB limit.');
  if(!blob.size)throw Error('The audio file is empty.');
  const imported=new File([blob],path,{type:blob.type||'audio/mpeg'});
  const transfer=new DataTransfer();transfer.items.add(imported);file.files=transfer.files;
  file.dispatchEvent(new Event('change',{bubbles:true}));
 }catch(e){fail(new Error('Could not import this audio link. The source may block browser downloads (CORS), or the file may be unavailable. '+(e?.message||'')))}
 finally{extract.disabled=false}
});
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
const ids=['original','vocals','instrumental'],waves={},waveStates={};let mixInterval=null;
const formatTime=t=>{t=Number.isFinite(t)?t:0;return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')};
function renderWave(id){
 const el=$('wave-'+id),ctx=el.getContext('2d'),w=el.width=Math.max(100,Math.round(el.clientWidth*devicePixelRatio)),h=el.height=92*devicePixelRatio;
 const samples=waves[id]||Array(160).fill(.06),master=$(typeof selectedStem==='function'?selectedStem():'original'),ratio=master.duration?master.currentTime/master.duration:0;
 ctx.fillStyle='#222229';ctx.fillRect(0,0,w,h);
 if(waveStates[id]!=='ready'){
  ctx.fillStyle='#d9d4df';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+Math.round(17*devicePixelRatio)+'px Arial, sans-serif';
  ctx.fillText(waveStates[id]==='error'?'PREVIEW UNAVAILABLE':'PROCESSING…',w/2,h/2);return;
 }
 samples.forEach((v,i)=>{let bh=Math.max(2,v*h*.86);ctx.fillStyle={original:'#f1c66a',vocals:'#9c83ff',instrumental:'#36e987'}[id];ctx.globalAlpha=i/samples.length<ratio?1:.48;ctx.fillRect(i*w/samples.length,(h-bh)/2,Math.max(1,w/samples.length-1),bh)});
 ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.fillRect(Math.min(w-2,w*ratio),0,2,h);
}
function updateMix(){ids.forEach(renderWave);const active=$(selectedStem()),master=$('original');$('mixClock').textContent=formatTime(active.currentTime)+' / '+formatTime(Number.isFinite(active.duration)?active.duration:master.duration)}
function selectedStem(){return ids.find(id=>$('stem-'+id).checked)||'original'}
function stopMix(reset=false){
 clearInterval(mixInterval);mixInterval=null;
 ids.forEach(id=>{const a=$(id);a.pause();if(reset)try{a.currentTime=0}catch(e){}});
 $('mixPlay').textContent='▶ Play';updateMix()
}
$('mixPlay').addEventListener('click',async()=>{
 if(mixInterval){stopMix();return}
 const id=selectedStem(),a=$(id),master=$('original');
 if(!a.src)return;
 const t=Number.isFinite(master.currentTime)?master.currentTime:0;
 try{
  ids.forEach(x=>{if(x!==id)$(x).pause()});
  if(id!=='original'&&Math.abs(a.currentTime-t)>.3)a.currentTime=t;
  a.muted=false;
  $('mixPlay').disabled=true;
  $('mixPlay').textContent='Loading…';
  await a.play();
  $('mixPlay').textContent='❚❚ Pause';
  mixInterval=setInterval(()=>{
   if(a.paused||a.ended){stopMix(a.ended);return}
   updateMix();
  },180);
 }catch(e){
  console.warn('Mixer playback failed',e);
  stopMix();
  alert('This track could not start playing. Please wait for it to load, or try downloading it.');
 }finally{$('mixPlay').disabled=false}
});
$('mixStop').addEventListener('click',()=>stopMix(true));
ids.forEach(id=>{
 $(id).addEventListener('ended',()=>{if(selectedStem()===id)stopMix(true)});
 $('stem-'+id).addEventListener('change',()=>{
  if($('stem-'+id).checked){
   ids.forEach(x=>{if(x!==id)$('stem-'+x).checked=false});
  }else if(!ids.some(x=>$('stem-'+x).checked))$('stem-'+id).checked=true;
  if(mixInterval)stopMix();
  updateMix();
 });
 $('wave-'+id).addEventListener('click',e=>{
  const d=$('original').duration;if(!d)return;
  const rect=e.target.getBoundingClientRect(),t=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*d;
  ids.forEach(x=>{try{$(x).currentTime=t}catch(e){}});
  updateMix();
 });
});
window.addEventListener('resize',()=>{if(!results.classList.contains('hidden'))updateMix()});
function peaksFor(buffer){const data=buffer.getChannelData(0),n=160,block=Math.ceil(data.length/n);return Array.from({length:n},(_,i)=>{let peak=0;for(let p=i*block;p<Math.min(data.length,(i+1)*block);p+=Math.max(1,Math.floor(block/100)))peak=Math.max(peak,Math.abs(data[p]));return Math.max(.02,peak)})}
async function analyseWave(id){
 waveStates[id]='loading';renderWave(id);
 try{const response=await fetch($(id).src);if(!response.ok)throw Error('fetch failed');const context=new (window.AudioContext||window.webkitAudioContext)(),buffer=await context.decodeAudioData(await response.arrayBuffer());waves[id]=peaksFor(buffer);waveStates[id]='ready';if(id==='original')$('detectedKey').textContent='Musical key: '+estimateKey(buffer);await context.close()}
 catch(e){console.warn('Analysis unavailable',id,e);waves[id]=Array(160).fill(.06);waveStates[id]='error';if(id==='original')$('detectedKey').textContent='Musical key: unavailable for this file'}
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
done=function(){ids.forEach(id=>{waveStates[id]='loading';delete waves[id]});oldDone();stopMix(true);$('stem-original').checked=true;$('stem-vocals').checked=false;$('stem-instrumental').checked=false;ids.forEach(id=>{$(id).muted=!$('stem-'+id).checked;analyseWave(id)});updateMix()};

/* Lyrics discovery options: avoid claiming unsupported automated transcription. */
$('findPublishedLyrics').addEventListener('click',()=>{const title=$('trackTitle').value.trim(),artist=$('artist').value.trim();if(!title){$('lyricsToolStatus').textContent='Enter the song title first (and artist if known).';$('trackTitle').focus();return}const query=[title,artist,'lyrics'].filter(Boolean).join(' ');window.open('https://www.google.com/search?q='+encodeURIComponent(query),'_blank','noopener,noreferrer');$('lyricsToolStatus').textContent='Lyrics search opened in a new tab. Copy any lyrics you are permitted to use into the box below.'});
$('transcribeLyrics').addEventListener('click',()=>{$('lyricsToolStatus').textContent=currentFile?'Automatic singing transcription needs a speech-recognition service and is not connected yet. You can paste or edit lyrics below.':'Upload an audio file first. Automatic transcription will need a speech-recognition service, which is not connected yet.'});

/* Free MusicBrainz metadata search (not audio fingerprint recognition). */
$('lookupTrack').addEventListener('click',async()=>{const title=$('trackTitle').value.trim(),artist=$('artist').value.trim(),output=$('lookupStatus');if(!title){output.textContent='Enter a song title, or upload a file with the title in its filename.';return}output.textContent='Searching MusicBrainz catalogue…';try{const q='recording:'+JSON.stringify(title)+(artist?' AND artist:'+JSON.stringify(artist):'');const endpoint='https://musicbrainz.org/ws/2/recording/?query='+encodeURIComponent(q)+'&fmt=json&limit=5';const response=await fetch(endpoint,{headers:{Accept:'application/json'}});if(!response.ok)throw Error('Catalogue lookup temporarily unavailable');const data=await response.json();const recording=(data.recordings||[]).find(x=>x.title&&x['artist-credit']?.length);if(!recording){output.textContent='No matching song found. You can still enter the details manually.';return}const performer=recording['artist-credit'].map(x=>typeof x==='string'?x:x.name||x.artist?.name||'').join('').trim();$('trackTitle').value=recording.title;if(performer)$('artist').value=performer;const release=recording.releases?.[0]?.title;if(release&&!$('production').value.trim())$('production').value=release;updateNames();output.textContent='Found a possible match in MusicBrainz. Please check the details; this is a title search, not Shazam-style audio recognition.'}catch(e){output.textContent='Song lookup unavailable right now. Please enter the details manually.'}});
