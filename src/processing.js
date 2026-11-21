/**
 * Private normalisation processor API.
 * The processor secret is separate from the browser admin token.
 * Pilot limit: complete derivatives <= 90 MiB uploaded through the Worker.
 * Durable large-file transfer should later use scoped, presigned R2 URLs.
 */
const LIMIT=90*1024*1024;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(status,error)=>json({error},status);
const isId=x=>/^[0-9a-f-]{36}$/.test(x||'');
async function authorised(request,secret){
 const value=request.headers.get('Authorization')||'';
 if(!secret||secret.length<32||!value.startsWith('Bearer '))return false;
 const a=new TextEncoder().encode(value.slice(7)),b=new TextEncoder().encode(secret);
 if(a.length!==b.length||a.length<32)return false;
 const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',a),crypto.subtle.digest('SHA-256',b)]);
 return [...new Uint8Array(x)].every((v,i)=>v===new Uint8Array(y)[i]);
}
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
function inspectWav(arrayBuffer){
 const b=new DataView(arrayBuffer);
 const text=(at,len)=>String.fromCharCode(...new Uint8Array(arrayBuffer,at,len));
 if(b.byteLength<44||text(0,4)!=='RIFF'||text(8,4)!=='WAVE')throw Error('Not a RIFF WAV');
 let pos=12,fmt=null,hasData=false;
 while(pos+8<=b.byteLength){
  const name=text(pos,4),size=b.getUint32(pos+4,true),start=pos+8;
  if(size>b.byteLength-start)throw Error('Truncated WAV chunk');
  if(name==='fmt '){
   if(size<16)throw Error('WAV format chunk too short');
   const raw=b.getUint16(start,true);
   const code=raw===65534&&size>=40?b.getUint16(start+24,true):raw;
   fmt={code,channels:b.getUint16(start+2,true),rate:b.getUint32(start+4,true),bits:b.getUint16(start+14,true),align:b.getUint16(start+12,true)};
  }
  if(name==='data'&&size>0)hasData=true;
  pos=start+size+(size%2);
 }
 if(!fmt||!hasData||fmt.code!==1||![1,2].includes(fmt.channels)||fmt.rate!==48000||
  fmt.bits!==24||fmt.align!==fmt.channels*3)throw Error('Expected mono/stereo signed 24-bit 48 kHz PCM WAV');
 return fmt;
}
export async function handleProcessor(request,env){
 if(!(await authorised(request,env.PROCESSOR_API_TOKEN)))return fail(401,'Unauthorised processor');
 const parts=new URL(request.url).pathname.split('/').filter(Boolean);
 const method=request.method;
 if(parts.length===3&&parts[2]==='claim'&&method==='POST'){
  const claimed=await env.DB.prepare(`UPDATE normalisation_jobs SET status='processing',
      attempts=attempts+1, leased_until=datetime('now','+10 minutes'),updated_at=datetime('now'),last_error=NULL
      WHERE id=(SELECT id FROM normalisation_jobs
        WHERE (status='pending' OR (status='processing' AND leased_until < datetime('now')))
        AND attempts<3 ORDER BY created_at LIMIT 1)
      RETURNING id,original_asset_id,attempts,leased_until`).first();
  return json({job:claimed||null});
 }
 if(parts.length===5&&parts[2]==='jobs'&&isId(parts[3])){
  const id=parts[3];
  const job=await env.DB.prepare('SELECT * FROM normalisation_jobs WHERE id=?').bind(id).first();
  if(!job)return fail(404,'Job not found');
  if(job.status!=='processing'||!job.leased_until||job.leased_until<=new Date().toISOString().slice(0,19).replace('T',' '))return fail(409,'Job is not leased');
  const original=await env.DB.prepare('SELECT * FROM audio_assets WHERE id=?').bind(job.original_asset_id).first();
  if(!original||original.deleted_at)return fail(404,'Original unavailable');
  if(parts[4]==='original'&&method==='GET'){
    const item=await env.AUDIO.get(original.object_key);
    if(!item)return fail(404,'Original missing in R2');
    return new Response(item.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}});
  }
  if(parts[4]==='failed'&&method==='POST'){
    const payload=await request.json().catch(()=>({}));
    const reason=String(payload.error||'Conversion failed').slice(0,500);
    await env.DB.prepare(`UPDATE normalisation_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,
      leased_until=NULL,last_error=?,updated_at=datetime('now') WHERE id=? AND status='processing'`).bind(reason,id).run();
    return json({status:'recorded'});
  }
  if(parts[4]==='complete'&&method==='POST'){
    const bytes=Number(request.headers.get('content-length'));
    if(!Number.isFinite(bytes)||bytes<44||bytes>LIMIT)return fail(413,'Derivative must be a nonempty WAV <=90 MiB');
    const buffer=await request.arrayBuffer();
    if(buffer.byteLength!==bytes)return fail(400,'Incomplete upload');
    let fmt;try{fmt=inspectWav(buffer)}catch(e){return fail(415,e.message)}
    // Verify metadata from the bytes, never trust client-provided audio format assertions.
    const digest=hex(await crypto.subtle.digest('SHA-256',buffer));
    const derivativeId=crypto.randomUUID(),key='working-copies/'+derivativeId+'.wav';
    await env.AUDIO.put(key,buffer,{httpMetadata:{contentType:'audio/wav'},customMetadata:{sourceAssetId:original.id,sha256:digest}});
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO audio_assets
           (id,title,artist,category,object_key,format,bytes,parent_asset_id)
           VALUES (?,?,?,?,?,?,?,?)`).bind(derivativeId,original.title,original.artist,'pcm_working_copy',key,'wav',buffer.byteLength,original.id),
        env.DB.prepare(`UPDATE normalisation_jobs SET status='complete',derived_asset_id=?,leased_until=NULL,
          updated_at=datetime('now') WHERE id=? AND status='processing'`).bind(derivativeId,id),
        env.DB.prepare(`INSERT INTO audit_events (actor,action,resource_type,resource_id,detail_json)
           VALUES ('audio-processor','normalise','audio_asset',?,?)`).bind(original.id,JSON.stringify({derived_asset_id:derivativeId,sha256:digest,format:'pcm_s24le',sample_rate:fmt.rate,bit_depth:fmt.bits,channels:fmt.channels}))
      ]);
    }catch(e){await env.AUDIO.delete(key);throw e}
    return json({status:'complete',derived_asset_id:derivativeId,sha256:digest});
  }
 }
 return fail(404,'Processor endpoint not found');
}
