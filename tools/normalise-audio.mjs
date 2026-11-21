#!/usr/bin/env node
/**
 * Willow Tree / Bull's Hits media normaliser (local processing prototype).
 * Converts ONE local input into a separate 24-bit/48 kHz signed PCM WAV
 * and a JSON report. No Cloudflare access, writes or uploads.
 *
 * Usage: node tools/normalise-audio.mjs INPUT_FILE OUTPUT_DIRECTORY
 * Requires ffmpeg and ffprobe installed on the machine.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, writeFile, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const MAX_INPUT_BYTES=1024*1024*1024; // conservative 1 GiB local pilot limit
const MAX_DURATION_SECONDS=60*60; // 1 hour pilot limit
const MAX_PROCESS_SECONDS=180000;
const log = (...parts)=>console.error(...parts);

async function command(exe,args,timeoutMs=MAX_PROCESS_SECONDS) {
 return await new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{stdio:['ignore','pipe','pipe'],shell:false});
  let stdout='',stderr='',ended=false;
  const timeout=setTimeout(()=>{child.kill('SIGKILL');},timeoutMs);
  child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>1024*1024)child.kill('SIGKILL');});
  child.stderr.on('data',chunk=>{stderr+=chunk.toString();if(stderr.length>1024*1024)child.kill('SIGKILL');});
  child.on('error',e=>{if(!ended){ended=true;clearTimeout(timeout);reject(e);}});
  child.on('close',code=>{if(ended)return;ended=true;clearTimeout(timeout);if(code===0)resolve({stdout,stderr});else reject(new Error(exe+' exited '+code+': '+stderr.slice(-900)));});
 });
}
async function sha256(file) {
 return await new Promise((resolve,reject)=>{
  const hash=createHash('sha256');const stream=createReadStream(file);
  stream.on('data',c=>hash.update(c));stream.on('error',reject);
  stream.on('end',()=>resolve(hash.digest('hex')));
 });
}
function validateProbe(probe) {
 const audio=probe.streams?.find(s=>s.codec_type==='audio');
 if(!audio)throw Error('No decodable audio stream identified');
 const seconds=Number(probe.format?.duration??audio.duration);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>MAX_DURATION_SECONDS)throw Error('Invalid or overlong audio duration');
 if(![1,2].includes(Number(audio.channels)))throw Error('Only mono/stereo supported in pilot');
 return {audio,duration_seconds:seconds};
}
async function verifyPcmOutput(filename, expectedChannels) {
 // Use FFprobe rather than assuming a particular RIFF fmt chunk layout:
 // 24-bit WAV can use either classic PCM or WAVE_FORMAT_EXTENSIBLE.
 const probe=JSON.parse((await command('ffprobe',[
   '-v','error','-select_streams','a:0','-show_entries',
   'stream=codec_name,sample_rate,channels,bits_per_raw_sample',
   '-of','json',filename
 ],30000)).stdout);
 const stream=probe.streams?.[0];
 if(!stream||stream.codec_name!=='pcm_s24le'||Number(stream.sample_rate)!==48000||
    Number(stream.channels)!==expectedChannels||Number(stream.bits_per_raw_sample)!==24) {
   throw Error('Output validation failed: expected signed 24-bit / 48 kHz PCM WAV; found '+JSON.stringify(stream||null));
 }
 return {channels:Number(stream.channels),sample_rate:48000,bits_per_sample:24};
}
async function main(){
 const input=process.argv[2],directory=process.argv[3];
 if(!input||!directory)throw Error('Usage: node tools/normalise-audio.mjs INPUT_FILE OUTPUT_DIRECTORY');
 const source=path.resolve(input),destination=path.resolve(directory);
 if(source===destination)throw Error('Output directory must not be input path');
 const s=await stat(source);if(!s.isFile()||s.size<32||s.size>MAX_INPUT_BYTES)throw Error('Input is empty or exceeds 1 GiB pilot limit');
 await mkdir(destination,{recursive:true});
 const digest=await sha256(source);
 const output=path.join(destination,digest.slice(0,24)+'-pcm24-48k.wav');
 const report=path.join(destination,digest.slice(0,24)+'-report.json');
 // Do not overwrite an existing derivative or report. Keep originals untouched.
 for(const candidate of [output,report]){try{await stat(candidate);throw Error('Output already exists: '+candidate);}catch(e){if(e.code!=='ENOENT')throw e;}}
 const probed=JSON.parse((await command('ffprobe',['-v','error','-show_format','-show_streams','-of','json',source],30000)).stdout);
 const {audio,duration_seconds}=validateProbe(probed);
 log('Identified:',audio.codec_name,'container:',probed.format?.format_name,'channels:',audio.channels);
 const tmp=output+'.partial-'+process.pid;
 try{
  await command('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-i',source,
    '-map','0:a:0','-vn','-sn','-dn','-ac',String(audio.channels),'-ar','48000',
    '-c:a','pcm_s24le','-f','wav','-y',tmp],MAX_PROCESS_SECONDS);
  const fmt=await verifyPcmOutput(tmp,Number(audio.channels));
  const outStat=await stat(tmp);
  const convertedHash=await sha256(tmp);
  const fs=await import('node:fs/promises');
  await fs.rename(tmp,output);
  const result={
    schema:'willowtree.audio.normalisation.v1',status:'ok',
    original:{filename:path.basename(source),bytes:s.size,sha256:digest,
      container:probed.format?.format_name??null,codec:audio.codec_name??null,
      channels:Number(audio.channels),sample_rate:Number(audio.sample_rate)||null,duration_seconds},
    derivative:{filename:path.basename(output),bytes:outStat.size,sha256:convertedHash,
      codec:'pcm_s24le',sample_rate:48000,bit_depth:24,channels:fmt.channels,
      duration_seconds,kind:'pcm_working_copy'},
    transcoder:{tool:'ffmpeg',processing:'local',note:'Conversion cannot restore fidelity already lost in lossy sources'}
  };
  await writeFile(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({output,report,result},null,2)+'\n');
 }catch(e){await unlink(tmp).catch(()=>{});throw e;}
}
main().catch(error=>{log('NORMALISATION FAILED:',error.message);process.exitCode=1;});
