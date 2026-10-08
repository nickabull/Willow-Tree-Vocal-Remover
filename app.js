const $=id=>document.getElementById(id);
const file=$('file'),url=$('url'),extract=$('extract'),status=$('status'),statusText=$('statusText'),results=$('results');
const SPACE_ID='Politrees/audio-separator_UVR';
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
  const inputs=[handle_file(upload),'Mel-Roformer-Viperx-1143',256,false,8,0,'/tmp/audio-separator-models/','output','mp3',0.9,0.0,1,'NAME_(STEM)_MODEL','NAME_(STEM)_MODEL','NAME_(STEM)_MODEL','NAME_(STEM)_MODEL','NAME_(STEM)_MODEL','NAME_(STEM)_MODEL','NAME_(STEM)_MODEL'];
  const response=await app.predict('/roformer_separator',inputs);
  const stems=response?.data;
  if(!Array.isArray(stems)||stems.length<2)throw Error('The service did not return two stems');
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
 const guessed=chosen.name.replace(/\.[^.]+$/,'').split(/\s+-\s+/);
 $('trackTitle').value=guessed[0]||'';if(guessed.length>1)$('artist').value=guessed[1];if(guessed.length>2)$('production').value=guessed.slice(2).join(' - ');
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
$('downloadAll').addEventListener('click',async()=>{
 try{
  if(!currentFile||!stemUrls)throw Error('Upload and separate an audio file before downloading all tracks.');
  if(!window.JSZip)throw Error('ZIP library could not load.');
  note('Preparing ZIP. Downloading separated audio may take a moment…');
  const zip=new JSZip();
  zip.file(filename('Full Track',extFrom(currentFile.name)),currentFile);
  for(const [kind,link] of [['Vocals',stemUrls.vocals],['Instrumental',stemUrls.instrumental]]){
   const response=await fetch(link);if(!response.ok)throw Error('Could not download '+kind+' from the separator');
   zip.file(filename(kind,'mp3'),await response.blob());
  }
  zip.file(filename('Lyrics','docx'),await lyricsBlob());
  save(await zip.generateAsync({type:'blob'}),base()+' (All Files).zip');note('ZIP ready.');
 }catch(e){console.error(e);note(e.message+' You can also download each file individually.')}
});
