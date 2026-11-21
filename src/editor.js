export const EDITOR_MARKUP = `
<section id="editorPanel" class="panel editor-panel" hidden>
  <div class="row space"><div><h2>AUDIO EDITOR <span style="color:#f15b9b">BETA</span></h2><p class="muted">Non-destructive browser editing · original file stays in the library</p></div><button type="button" class="secondary" id="closeEditor">Back to library</button></div>
  <div class="editor-toolbar row">
    <label style="display:inline">Load a local audio file <input type="file" id="editorFile" accept="audio/*" style="max-width:220px"></label>
    <button type="button" id="editorUndo" class="secondary" disabled>↶ Undo</button>
    <button type="button" id="editorPlay" disabled>▶ Play</button>
    <button type="button" id="editorStop" class="secondary" disabled>■ Stop</button>
    <button type="button" id="editorSelectAll" class="secondary" disabled>Select all</button>
  </div>
  <p id="editorFilename" class="muted">Open a recording from the library or select a local file.</p>
  <div class="wave-wrap"><canvas id="editorWave" width="1200" height="240" aria-label="Audio waveform. Drag to select a region" role="img"></canvas></div>
  <div class="row space"><span id="editorClock" class="muted">00:00.000 / 00:00.000</span><span id="editorRange" class="muted">Selection: none</span></div>
  <div class="row editor-actions">
    <button type="button" id="editorCut" class="secondary" disabled>Cut selection</button>
    <button type="button" id="editorTrim" class="secondary" disabled>Trim to selection</button>
    <button type="button" id="editorFadeIn" class="secondary" disabled>Fade in</button>
    <button type="button" id="editorFadeOut" class="secondary" disabled>Fade out</button>
    <label style="display:flex;align-items:center;gap:7px;margin:0">Gain <input id="editorGain" type="range" min="-18" max="12" step="1" value="0" style="width:125px;margin:0"><span id="editorGainValue">0 dB</span></label>
    <button type="button" id="editorApplyGain" class="secondary" disabled>Apply gain</button>
  </div>
  <div class="row space"><p id="editorStatus" class="muted" role="status">No audio loaded.</p><button id="editorExport" type="button" disabled>Export 24-bit / 48 kHz PCM WAV</button></div>
</section>`;
export const EDITOR_SCRIPT = `
(function(){
'use strict';
const $=id=>document.getElementById(id);
let context,buffer,history=[],currentSource=null,startedAt=0,playOffset=0,selection=null,dragging=false,fileName='edited-recording',playTimer=null;
const controls=['editorUndo','editorPlay','editorStop','editorSelectAll','editorCut','editorTrim','editorFadeIn','editorFadeOut','editorApplyGain','editorExport'];
const status=text=>$('editorStatus').textContent=text;
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
const fmt=n=>{n=Math.max(0,n||0);const m=Math.floor(n/60);return String(m).padStart(2,'0')+':'+String(Math.floor(n%60)).padStart(2,'0')+'.'+String(Math.floor(n%1*1000)).padStart(3,'0');};
function setEnabled(){for(const id of controls)$(id).disabled=!buffer; $('editorUndo').disabled=!history.length;}
function draw(){
 const canvas=$('editorWave'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.fillStyle='#0b121b';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#304252';ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
 if(!buffer)return;
 if(selection){const x1=selection[0]/buffer.duration*w,x2=selection[1]/buffer.duration*w;ctx.fillStyle='rgba(241,91,155,.23)';ctx.fillRect(x1,0,x2-x1,h);}
 const length=buffer.length,chs=buffer.numberOfChannels,step=Math.max(1,Math.ceil(length/w));ctx.strokeStyle='#63d6c5';
 for(let x=0;x<w;x++){const start=Math.floor(x*length/w),end=Math.min(length,start+step);let peak=0;
  for(let c=0;c<chs;c++){const data=buffer.getChannelData(c);for(let i=start;i<end;i+=Math.max(1,Math.ceil(step/150))){const a=Math.abs(data[i]);if(a>peak)peak=a;}}
  ctx.beginPath();ctx.moveTo(x,h/2-peak*(h/2-9));ctx.lineTo(x,h/2+peak*(h/2-9));ctx.stroke();
 }
 let t=playOffset;if(currentSource&&context)t=clamp(context.currentTime-startedAt,0,buffer.duration);
 ctx.strokeStyle='#f7c948';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(t/buffer.duration*w,0);ctx.lineTo(t/buffer.duration*w,h);ctx.stroke();ctx.lineWidth=1;
 $('editorClock').textContent=fmt(t)+' / '+fmt(buffer.duration);
 $('editorRange').textContent=selection?'Selection: '+fmt(selection[0])+' – '+fmt(selection[1]):'Selection: none';
}
async function ctxReady(resume=false){if(!context)context=new (window.AudioContext||window.webkitAudioContext)();if(resume&&context.state==='suspended')await context.resume();return context;}
function stop(){if(currentSource){try{currentSource.stop();}catch{}currentSource.disconnect();currentSource=null;}if(playTimer){clearInterval(playTimer);playTimer=null;}playOffset=0;draw();}
async function play(){if(!buffer)return;stop();const a=await ctxReady(true),source=a.createBufferSource();source.buffer=buffer;source.connect(a.destination);let from=selection?selection[0]:0;let duration=selection?selection[1]-selection[0]:buffer.duration;if(duration<=0)return;
 playOffset=from;startedAt=a.currentTime-from;currentSource=source;source.onended=()=>{if(currentSource===source){currentSource=null;playOffset=0;if(playTimer)clearInterval(playTimer);playTimer=null;draw();}};
 source.start(0,from,duration);playTimer=setInterval(draw,60);status('Playing selection or track');}
function decodePcmWav(bytes,audioContext) {
 const view=new DataView(bytes);
 const label=(at,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(view.getUint8(at+i))).join('');
 if(bytes.byteLength<44 || label(0,4)!=='RIFF' || label(8,4)!=='WAVE')throw Error('Not a standard RIFF/WAVE recording');
 let fmt=null,data=null,pos=12;
 while(pos+8<=bytes.byteLength){
  const id=label(pos,4), size=view.getUint32(pos+4,true),start=pos+8;
  if(start+size>bytes.byteLength)throw Error('Truncated WAV chunk '+id);
  if(id==='fmt '){
   if(size<16)throw Error('Invalid WAV format header');
   let code=view.getUint16(start,true);
   const channels=view.getUint16(start+2,true),rate=view.getUint32(start+4,true),bits=view.getUint16(start+14,true),align=view.getUint16(start+12,true);
   if(code===65534 && size>=40)code=view.getUint16(start+24,true); // WAVE_FORMAT_EXTENSIBLE subtype
   fmt={code,channels,rate,bits,align};
  }
  if(id==='data' && !data)data={start,size};
  pos=start+size+(size%2);
 }
 if(!fmt||!data)throw Error('Missing WAV format or data chunk');
 const {code,channels,rate,bits,align}=fmt;
 if(![1,3].includes(code)||![8,16,24,32].includes(bits)||channels<1||channels>8||rate<8000||rate>192000)throw Error('Unsupported WAV encoding: format '+code+', '+bits+'-bit, '+channels+' channels');
 if(code===3 && bits!==32)throw Error('Only 32-bit floating-point WAV is supported');
 if(align!==channels*(bits/8))throw Error('Unexpected WAV frame alignment');
 const frames=Math.floor(data.size/align);
 if(frames<1||frames>rate*3600)throw Error('WAV duration out of supported range');
 const out=audioContext.createBuffer(channels,frames,rate);
 for(let c=0;c<channels;c++){
  const dest=out.getChannelData(c);
  for(let i=0;i<frames;i++){
   const p=data.start+i*align+c*(bits/8);
   let v;
   if(code===3)v=view.getFloat32(p,true);
   else if(bits===8)v=(view.getUint8(p)-128)/128;
   else if(bits===16)v=view.getInt16(p,true)/32768;
   else if(bits===24){let n=view.getUint8(p)|(view.getUint8(p+1)<<8)|(view.getUint8(p+2)<<16);if(n&0x800000)n|=0xff000000;v=n/8388608;}
   else v=view.getInt32(p,true)/2147483648;
   dest[i]=Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;
  }
 }
 return out;
}
async function decodeMpegWavePayload(bytes, audioContext) {
 const v=new DataView(bytes), label=(p,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(v.getUint8(p+i))).join('');
 if(bytes.byteLength<44||label(0,4)!=='RIFF'||label(8,4)!=='WAVE')throw Error('Invalid WAVE header');
 let codec=null, payload=null, pos=12;
 while(pos+8<=bytes.byteLength){
  const id=label(pos,4), size=v.getUint32(pos+4,true),start=pos+8;
  if(size>bytes.byteLength-start)throw Error('Truncated WAVE '+id+' chunk');
  if(id==='fmt ' && size>=16)codec=v.getUint16(start,true);
  if(id==='data' && !payload)payload=bytes.slice(start,start+size);
  pos=start+size+(size&1);
 }
 if(codec!==80 && codec!==85)throw Error('Not an MPEG-encoded WAVE file');
 if(!payload || payload.byteLength<32)throw Error('Missing MPEG audio frames');
 status('MPEG audio detected inside WAV — trying native MPEG decoder…');
 try {return await audioContext.decodeAudioData(payload.slice(0));}
 catch {throw Error('This WAV contains MPEG-compressed audio (format '+codec+'). Your browser cannot decode the MPEG stream. Convert a COPY to 16-bit PCM WAV or MP3, then load that copy. The original is preserved in Cloudflare.');}
}
async function loadBlob(blob,name){
 stop();buffer=null;history=[];selection=null;setEnabled();draw();$('editorPanel').hidden=false;$('app').hidden=true;status('Decoding '+name+'…');try{
 const a=await ctxReady(false);const bytes=await blob.arrayBuffer();
 let decoded;try{decoded=await a.decodeAudioData(bytes.slice(0));}
 catch(nativeError){
  if(bytes.byteLength>=12&&new TextDecoder('ascii').decode(bytes.slice(0,4))==='RIFF'){
   status('Using compatible WAV decoder…');
   try{decoded=decodePcmWav(bytes,a);}catch(wavError){
    if(/Unsupported WAV encoding: format (80|85),/.test(wavError.message))decoded=await decodeMpegWavePayload(bytes,a);
    else throw wavError;
   }
  }else{throw Error('This file is not recognised as browser-decodable audio. Try the original Download button to inspect it.');}
 }
 if(!decoded?.length)throw Error('Empty recording');
 buffer=decoded;fileName=name||'audio';history=[];selection=null;$('editorFilename').textContent=fileName+' · '+decoded.numberOfChannels+' channel(s) · '+decoded.sampleRate+' Hz';setEnabled();draw();status('Ready — drag across the waveform to select audio');
 }catch(e){status('Cannot decode this recording: '+e.message);console.error('Willow Tree audio decode failed',e);}
}
function selectionSamples(){if(!buffer||!selection)return null;const a=clamp(Math.floor(selection[0]*buffer.sampleRate),0,buffer.length),b=clamp(Math.ceil(selection[1]*buffer.sampleRate),0,buffer.length);return b>a?[a,b]:null;}
function snapshot(){if(!buffer)return;history.push(buffer);if(history.length>10)history.shift();}
function makeBuffer(size){return context.createBuffer(buffer.numberOfChannels,size,buffer.sampleRate);}
function cut(trim){
 const r=selectionSamples();if(!r)return status('Drag to select an area first');
 const [a,b]=r,n=trim?b-a:buffer.length-(b-a);if(n<1)return status('Cannot remove the entire recording');
 const result=makeBuffer(n);
 for(let c=0;c<buffer.numberOfChannels;c++){const old=buffer.getChannelData(c),out=result.getChannelData(c);if(trim)out.set(old.subarray(a,b));else{out.set(old.subarray(0,a));out.set(old.subarray(b),a);}}
 stop();snapshot();buffer=result;selection=null;setEnabled();draw();status(trim?'Trimmed to selected region':'Removed selected region');
}
function apply(kind){
 const r=selectionSamples();if(!r)return status('Drag to select an area first');
 const [a,b]=r;const gain=Number($('editorGain').value),scale=Math.pow(10,gain/20);
 const out=makeBuffer(buffer.length);
 for(let c=0;c<buffer.numberOfChannels;c++){
  const src=buffer.getChannelData(c),dest=out.getChannelData(c);dest.set(src);
  for(let i=a;i<b;i++){let multiplier=1;if(kind==='in')multiplier=(i-a)/Math.max(1,b-a-1);if(kind==='out')multiplier=(b-1-i)/Math.max(1,b-a-1);if(kind==='gain')multiplier=scale;dest[i]=clamp(src[i]*multiplier,-1,1);}
 }
 stop();snapshot();buffer=out;setEnabled();draw();status(kind==='gain'?'Applied '+gain+' dB gain':'Applied fade '+kind);
}
async function render48kPcm() {
 if(!buffer)throw Error('No audio loaded');
 const channels=buffer.numberOfChannels;
 if(channels<1||channels>2)throw Error('This export currently supports mono or stereo audio only');
 const rate=48000;
 if(buffer.sampleRate===rate)return buffer;
 const length=Math.max(1,Math.round(buffer.duration*rate));
 const offline=new OfflineAudioContext(channels,length,rate);
 const source=offline.createBufferSource();
 source.buffer=buffer;source.connect(offline.destination);source.start(0);
 return await offline.startRendering();
}
function encodePcm24Wav(audio) {
 const channels=audio.numberOfChannels,frames=audio.length,rate=audio.sampleRate;
 if(rate!==48000)throw Error('Expected 48 kHz rendered audio');
 const dataBytes=frames*channels*3;
 if(dataBytes>250*1024*1024)throw Error('Export exceeds the 250 MiB safety limit');
 const bytes=44+dataBytes,array=new ArrayBuffer(bytes),view=new DataView(array);
 const write=(offset,str)=>{for(let i=0;i<str.length;i++)view.setUint8(offset+i,str.charCodeAt(i));};
 write(0,'RIFF');view.setUint32(4,bytes-8,true);write(8,'WAVE');write(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*channels*3,true);
 view.setUint16(32,channels*3,true);view.setUint16(34,24,true);write(36,'data');view.setUint32(40,dataBytes,true);
 const data=Array.from({length:channels},(_,c)=>audio.getChannelData(c));
 let pos=44;
 for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){
  const sample=data[c][i],v=clamp(Number.isFinite(sample)?sample:0,-1,1);
  const n=Math.round(v<0?v*8388608:v*8388607);
  view.setUint8(pos++,n&255);view.setUint8(pos++,(n>>8)&255);view.setUint8(pos++,(n>>16)&255);
 }
 return new Blob([array],{type:'audio/wav'});
}

const wave=$('editorWave');
const at=e=>{const box=wave.getBoundingClientRect();return clamp((e.clientX-box.left)/box.width,0,1)*(buffer?.duration||0);};
wave.addEventListener('pointerdown',e=>{if(!buffer)return;dragging=true;wave.setPointerCapture(e.pointerId);selection=[at(e),at(e)];draw();});
wave.addEventListener('pointermove',e=>{if(!dragging||!buffer)return;selection[1]=at(e);draw();});
const end=()=>{if(!dragging)return;dragging=false;selection.sort((a,b)=>a-b);if(selection[1]-selection[0]<.02)selection=null;draw();};
wave.addEventListener('pointerup',end);wave.addEventListener('pointercancel',end);
$('editorFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)loadBlob(f,f.name);});
$('closeEditor').onclick=()=>{stop();$('editorPanel').hidden=true;$('app').hidden=false;};
$('editorPlay').onclick=play;$('editorStop').onclick=stop;$('editorCut').onclick=()=>cut(false);$('editorTrim').onclick=()=>cut(true);
$('editorFadeIn').onclick=()=>apply('in');$('editorFadeOut').onclick=()=>apply('out');$('editorApplyGain').onclick=()=>apply('gain');
$('editorSelectAll').onclick=()=>{if(buffer){selection=[0,buffer.duration];draw();}};
$('editorUndo').onclick=()=>{if(!history.length)return;stop();buffer=history.pop();selection=null;setEnabled();draw();status('Undid last edit');};
$('editorGain').oninput=()=>{$('editorGainValue').textContent=$('editorGain').value+' dB';};
$('editorExport').onclick=async()=>{
 if(!buffer)return;
 const button=$('editorExport');button.disabled=true;status('Rendering 24-bit / 48 kHz PCM WAV…');
 try{
  const rendered=await render48kPcm(),blob=encodePcm24Wav(rendered);
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=fileName.replace(/\\.[^.]+$/,'').replace(/[^a-z0-9 _.-]/gi,'_')+'-24bit-48k-pcm.wav';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status('Exported 24-bit / 48 kHz PCM WAV. Original preserved in Cloudflare.');
 }catch(e){status('Export failed: '+e.message);}
 finally{button.disabled=!buffer;}
};
window.addEventListener('willow-editor-import',e=>{if(e.detail?.blob)loadBlob(e.detail.blob,e.detail.name);});
window.addEventListener('willow-editor-lock',()=>{stop();buffer=null;history=[];selection=null;fileName='edited-recording';$('editorPanel').hidden=true;setEnabled();draw();});
window.addEventListener('pagehide',stop);
draw();
})();
`;