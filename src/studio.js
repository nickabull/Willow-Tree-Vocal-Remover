import { EDITOR_MARKUP, EDITOR_SCRIPT } from './editor.js';
export const STUDIO_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Willow Tree Audio Studio</title>
<style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#f3f4f7;background:#101722}
*{box-sizing:border-box}body{margin:0}.wrap{max-width:1100px;margin:auto;padding:24px}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #394352;padding-bottom:18px}
h1{margin:0;font-size:1.7rem}h2{font-size:1.2rem}.muted{color:#a9b6c8}main{display:grid;grid-template-columns:340px 1fr;gap:20px;margin-top:22px}.panel{background:#1b2635;border:1px solid #394352;border-radius:12px;padding:20px}
input,button{font:inherit}input{width:100%;padding:11px;border-radius:7px;border:1px solid #546177;background:#111b29;color:white;margin:8px 0 14px}button{background:#f7c948;color:#17202e;border:0;border-radius:7px;padding:10px 13px;font-weight:650;cursor:pointer}
button.secondary{background:#354354;color:#f3f4f7}button.warn{background:#7b3443;color:white}button:disabled{opacity:.5;cursor:not-allowed}
.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.row.space{justify-content:space-between}.entry{padding:15px 0;border-bottom:1px solid #394352}
.entry:last-child{border-bottom:0}.entry strong{overflow-wrap:anywhere}.entry small{display:block;color:#a9b6c8;margin:5px 0 10px}
label{display:block;font-size:.86rem;color:#c9d5e5}#message{min-height:24px;overflow-wrap:anywhere}.error{color:#ff9fae}.good{color:#94e4b6}
audio{width:100%;margin-top:10px}#empty{color:#a9b6c8;padding:35px;text-align:center}
@media(max-width:760px){main{grid-template-columns:1fr}.wrap{padding:14px}}
 .editor-panel{margin-top:22px}.editor-toolbar{padding:12px 0;border-bottom:1px solid #394352}.wave-wrap{border:1px solid #496071;border-radius:8px;overflow:hidden;margin:15px 0;background:#0b121b}.wave-wrap canvas{width:100%;height:240px;touch-action:none;display:block}.editor-actions{padding:12px 0;gap:8px}.editor-panel h2{margin-bottom:3px}
.brand-head{display:flex;align-items:center;gap:16px}.willow-logo{height:76px;width:76px;object-fit:contain;background:#000;border:1px solid #51515a;border-radius:12px;padding:2px}.panel{backdrop-filter:blur(8px)}body{background:linear-gradient(rgba(10,13,20,.91),rgba(10,13,20,.96)),url('https://raw.githubusercontent.com/nickabull/Willow-Tree-Vocal-Remover/main/willow-dance-background.jpg') center/cover fixed #101722}button{background:#ed5a98;color:#fff}button.secondary{background:#354354;color:#f3f4f7}@media(max-width:700px){.willow-logo{width:54px;height:54px}.brand-head{align-items:flex-start}}\n</style></head><body><div class="wrap">
<header><div class="brand-head"><img class="willow-logo" src="https://raw.githubusercontent.com/nickabull/Willow-Tree-Vocal-Remover/main/willow-original-optimized.svg" alt="Willow Tree original logo"><div><h1>WILLOW TREE <span style="color:#f15b9b">AUDIO STUDIO</span></h1><div class="muted">Private production library · dark editor preview</div></div></div><button id="logout" class="secondary" hidden>Lock</button></header>
<section class="panel" id="login" style="max-width:540px;margin:28px auto">
<h2>Unlock your library</h2><p class="muted">Enter the administrator token generated during deployment. It is held only in this page's memory and cleared when you close or reload the page.</p>
<label for="token">Administrator token</label><input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste token">
<button id="unlock">Unlock library</button></section>
${EDITOR_MARKUP}<main id="app" hidden>
<section class="panel"><h2>Upload audio</h2><p class="muted">Originals are preserved in private R2 storage. Maximum 20 MiB per upload for this first build.</p>
<label for="file">Recording</label><input id="file" type="file" accept=".mp3,.wav,.flac,.aif,.aiff,.m4a,.ogg">
<label for="title">Title</label><input id="title" maxlength="200" placeholder="Recording title">
<label for="artist">Artist / presenter</label><input id="artist" maxlength="200" placeholder="Optional">
<button id="upload">Upload original</button>
<hr style="border:0;border-top:1px solid #394352;margin:23px 0">
<strong>Coming next</strong><p class="muted">Waveform editor, multitrack sessions, and AI vocal / instrumental separation.</p></section>
<section class="panel"><div class="row space"><h2>Audio library</h2><div class="row"><button id="trash" class="secondary">View trash</button><button id="refresh" class="secondary">Refresh</button></div></div>
<label for="search">Search titles and artists</label><input id="search" placeholder="Search recordings">
<div id="message" role="status" aria-live="polite"></div><div id="items"></div><div id="empty" hidden>No recordings found.</div>
</section></main></div>
<script>
(()=>{'use strict';
let token='',isTrash=false,previewURL=null;
const $=id=>document.getElementById(id);
const message=(text,bad=false)=>{$('message').textContent=text;$('message').className=bad?'error':'good';};
async function api(path,options={}) {
  const headers=new Headers(options.headers||{}); headers.set('Authorization','Bearer '+token);
  const response=await fetch('/api'+path,{...options,headers,cache:'no-store'});
  if(!response.ok){let msg='HTTP '+response.status;try{msg=(await response.json()).error||msg;}catch{}throw Error(msg);}
  return response;
}
async function load(){
  const query=new URLSearchParams({q:$('search').value,trash:isTrash?'1':'0'});
  try{
    const data=await (await api('/assets?'+query)).json();
    const items=$('items');items.replaceChildren();
    $('empty').hidden=data.assets.length>0;
    for(const a of data.assets){
      const card=document.createElement('div');card.className='entry';
      const title=document.createElement('strong');title.textContent=a.title;
      const details=document.createElement('small');details.textContent=[a.artist,a.format,(a.bytes/1048576).toFixed(2)+' MiB',a.created_at].filter(Boolean).join(' · ');
      const controls=document.createElement('div');controls.className='row';
      const action=(label,klass,fn)=>{const b=document.createElement('button');b.textContent=label;b.className=klass;b.onclick=fn;controls.append(b);};
      if(!isTrash){
        action('Edit','secondary',async()=>{
          try{message('Loading into editor…');const blob=await (await api('/assets/'+a.id+'/download')).blob();
              window.dispatchEvent(new CustomEvent('willow-editor-import',{detail:{blob,name:a.title+'.'+a.format}}));message('Loaded in editor');}
          catch(e){message(e.message,true);}
        });
        action('Preview','secondary',async()=>{
          try {
            if(previewURL)URL.revokeObjectURL(previewURL);
            const blob=await (await api('/assets/'+a.id+'/download')).blob();
            previewURL=URL.createObjectURL(blob);
            const player=document.createElement('audio');player.controls=true;player.src=previewURL;
            const old=card.querySelector('audio');if(old)old.remove();card.append(player);await player.play().catch(()=>{});
          }catch(e){message(e.message,true);}
        });
        action('Download','secondary',async()=>{
          try{const blob=await (await api('/assets/'+a.id+'/download')).blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=a.title+'.'+a.format;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){message(e.message,true);}
        });
        action('Move to trash','warn',async()=>{
          if(!confirm('Move this recording to recoverable trash?'))return;
          try{await api('/assets/'+a.id,{method:'DELETE'});message('Moved to trash');await load();}catch(e){message(e.message,true);}
        });
      } else {
        action('Restore','secondary',async()=>{try{await api('/assets/'+a.id+'/restore',{method:'POST'});message('Recording restored');await load();}catch(e){message(e.message,true);}});
      }
      card.append(title,details,controls);items.append(card);
    }
  }catch(e){message(e.message,true);}
}
$('unlock').onclick=async()=>{
  token=$('token').value.trim();$('token').value='';
  if(!token)return;
  try{await api('/assets');$('login').hidden=true;$('app').hidden=false;$('logout').hidden=false;await load();}
  catch(e){token='';alert('Cannot unlock: '+e.message);}
};
$('logout').onclick=()=>{window.dispatchEvent(new Event('willow-editor-lock'));token='';if(previewURL)URL.revokeObjectURL(previewURL);$('items').replaceChildren();$('app').hidden=true;$('login').hidden=false;$('logout').hidden=true;};
$('upload').onclick=async()=>{
 const file=$('file').files[0];if(!file){message('Choose an audio file first',true);return;}
 if(file.size>20*1024*1024){message('The first version supports files up to 20 MiB',true);return;}
 const title=$('title').value.trim()||file.name;
 const headers={'Content-Type':file.type||'application/octet-stream','X-File-Name':file.name,'X-Audio-Title':title,'X-Audio-Artist':$('artist').value.trim()};
 $('upload').disabled=true;message('Uploading…');
 try{await api('/assets',{method:'POST',headers,body:file});$('file').value='';$('title').value='';$('artist').value='';message('Recording uploaded');await load();}
 catch(e){message(e.message,true);}finally{$('upload').disabled=false;}
};
$('refresh').onclick=load;
$('trash').onclick=()=>{isTrash=!isTrash;$('trash').textContent=isTrash?'View library':'View trash';load();};
let debounce; $('search').oninput=()=>{clearTimeout(debounce);debounce=setTimeout(load,250);};
window.addEventListener('pagehide',()=>{token='';if(previewURL)URL.revokeObjectURL(previewURL);});
})();
</script><script>${EDITOR_SCRIPT}</script></body></html>`;
