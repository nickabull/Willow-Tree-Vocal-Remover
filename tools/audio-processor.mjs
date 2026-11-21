#!/usr/bin/env node
/**
 * Willow Tree/Bull's Hits private audio conversion runner.
 * Opt-in operator deployment: runs on dedicated Node+FFmpeg host with a
 * PROCESSOR_API_TOKEN secret; never exposes that secret to browser clients.
 * Needs Worker migration 0003 and the processor API deployed first.
 */
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const endpoint=process.env.WILLOW_API_BASE_URL;
const secret=process.env.PROCESSOR_API_TOKEN;
const once=process.argv.includes('--once');
if(!endpoint||!/^https:\/\//.test(endpoint)||!secret||secret.length<32){
 console.error('Set WILLOW_API_BASE_URL=https://... and PROCESSOR_API_TOKEN securely in environment');
 process.exit(2);
}
const base=endpoint.replace(/\/$/,'');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let stopping=false;
process.on('SIGTERM',()=>{stopping=true});
process.on('SIGINT',()=>{stopping=true});
async function api(route,opts={}){
 const headers=new Headers(opts.headers||{});
 headers.set('Authorization','Bearer '+secret);
 const response=await fetch(base+'/api/processing/'+route,{...opts,headers,signal:AbortSignal.timeout(240000)});
 if(!response.ok)throw Error('Processor API '+response.status+': '+(await response.text()).slice(0,300));
 return response;
}
async function ffmpeg(input,output){
 return await new Promise((resolve,reject)=>{
  const args=['-nostdin','-hide_banner','-loglevel','error','-i',input,'-map','0:a:0',
   '-vn','-sn','-dn','-ac','2','-ar','48000','-c:a','pcm_s24le','-f','wav','-y',output];
  const child=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe'],shell:false});
  let error='',finished=false;
  const timeout=setTimeout(()=>child.kill('SIGKILL'),180000);
  child.stderr.on('data',chunk=>{error+=chunk.toString();if(error.length>8192)child.kill('SIGKILL')});
  child.on('error',e=>{if(!finished){finished=true;clearTimeout(timeout);reject(e)}});
  child.on('close',code=>{if(finished)return;finished=true;clearTimeout(timeout);
   if(code===0)resolve();else reject(Error('FFmpeg failed ('+code+'): '+error.slice(-600)))});
 });
}
async function probe(output){
 const {execFile}=await import('node:child_process');
 const {promisify}=await import('node:util');
 const {stdout}=await promisify(execFile)('ffprobe',['-v','error','-select_streams','a:0',
  '-show_entries','stream=codec_name,sample_rate,channels,bits_per_raw_sample','-of','json',output],
  {timeout:30000,maxBuffer:500000});
 const p=JSON.parse(stdout),s=p.streams?.[0];
 if(!s||s.codec_name!=='pcm_s24le'||+s.sample_rate!==48000||+s.channels!==2||+s.bits_per_raw_sample!==24)throw Error('Output did not verify as stereo PCM24/48k');
}
async function processJob(job){
 const folder=await mkdtemp(path.join(tmpdir(),'willow-audio-'));
 try{
  const input=path.join(folder,'original-audio'),output=path.join(folder,'working-copy.wav');
  const res=await api('jobs/'+job.id+'/original');
  const blob=await res.arrayBuffer();
  if(blob.byteLength<32||blob.byteLength>20*1024*1024)throw Error('Source outside pilot limit');
  await writeFile(input,Buffer.from(blob),{mode:0o600});
  await ffmpeg(input,output);
  await probe(output);
  const bytes=await readFile(output);
  if(bytes.length>90*1024*1024)throw Error('PCM derivative exceeds Worker pilot limit (90 MiB)');
  const done=await api('jobs/'+job.id+'/complete',{
   method:'POST',headers:{'Content-Type':'audio/wav','Content-Length':String(bytes.length)},body:bytes
  });
  const info=await done.json();
  console.log('Normalised',job.original_asset_id,'=>',info.derived_asset_id);
 }catch(error){
  console.error('Normalisation failed',job.id,error.message);
  try{await api('jobs/'+job.id+'/failed',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({error:error.message})});
  }catch(e){console.error('Failure reporting also failed:',e.message)}
 }finally{await rm(folder,{recursive:true,force:true})}
}
do{
 try{
  const r=await api('claim',{method:'POST'}),{job}=await r.json();
  if(job)await processJob(job);
  else if(!once)await wait(10000);
 }catch(error){console.error('Processor polling failed:',error.message);if(!once)await wait(20000)}
}while(!once&&!stopping);
