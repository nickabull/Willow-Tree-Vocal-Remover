import { STUDIO_HTML } from './studio.js';
const MAX_BYTES = 20 * 1024 * 1024;
const SUPPORTED = {
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
  aiff: 'audio/aiff', aif: 'audio/aiff', m4a: 'audio/mp4', ogg: 'audio/ogg'
};
const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
const fail = (status, message) => json({ error: message }, status);
const clean = value => typeof value === 'string' ? value.trim() : '';
const allowed = (s, max) => s.length > 0 && s.length <= max;
const isId = s => /^[0-9a-f-]{36}$/.test(s || '');
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
async function bearerMatches(request, expected) {
  const supplied = request.headers.get('authorization') || '';
  if (!supplied.startsWith('Bearer ') || !expected) return false;
  const a = new TextEncoder().encode(supplied.slice(7));
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length || a.length < 32) return false;
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', a), crypto.subtle.digest('SHA-256', b)]);
  return hex(ha) === hex(hb);
}
function pathParts(url) {
  return new URL(url).pathname.split('/').filter(Boolean);
}
async function audit(db, action, id, detail = {}) {
  await db.prepare('INSERT INTO audit_events (actor, action, resource_type, resource_id, detail_json) VALUES (?, ?, ?, ?, ?)')
    .bind('initial-admin', action, 'audio_asset', id, JSON.stringify(detail)).run();
}
function safeRow(row) {
  if (!row) return null;
  const { object_key, ...publicRow } = row;
  return publicRow;
}
async function handleApi(request, env) {
  if (!env.ADMIN_API_TOKEN || env.ADMIN_API_TOKEN.length < 32) return fail(503, 'Audio Library is locked until an admin token is configured');
  if (!(await bearerMatches(request, env.ADMIN_API_TOKEN))) return fail(401, 'Unauthorised');
  const url = new URL(request.url);
  const parts = pathParts(request.url);
  const method = request.method;

  if (parts.length === 2 && parts[1] === 'assets' && method === 'GET') {
    const q = clean(url.searchParams.get('q') || '').slice(0, 100);
    const trash = url.searchParams.get('trash') === '1';
    const offset = Math.min(100000, Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0));
    const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    const result = await env.DB.prepare(`SELECT id,title,artist,category,format,duration_ms,bytes,parent_asset_id,created_at,deleted_at
      FROM audio_assets WHERE deleted_at IS ${trash ? 'NOT NULL' : 'NULL'} AND (title LIKE ? ESCAPE '\\' OR COALESCE(artist,'') LIKE ? ESCAPE '\\')
      ORDER BY created_at DESC LIMIT 50 OFFSET ?`).bind(pattern, pattern, offset).all();
    return json({ assets: result.results || [], limit: 50, offset });
  }

  if (parts.length === 2 && parts[1] === 'assets' && method === 'POST') {
    // Single raw audio file per request. Uploads >20 MiB will require resumable uploads in a later version.
    const rawSize = Number(request.headers.get('content-length'));
    if (!Number.isFinite(rawSize) || rawSize < 1 || rawSize > MAX_BYTES) return fail(413, 'Content-Length required; maximum 20 MiB');
    const name = clean(request.headers.get('x-file-name') || '');
    const title = clean(request.headers.get('x-audio-title') || name);
    const artist = clean(request.headers.get('x-audio-artist') || '');
    if (!allowed(name, 200) || !allowed(title, 200) || artist.length > 200 || name.includes('/') || name.includes('\\')) return fail(400, 'Invalid file name or metadata');
    const ext = name.split('.').pop().toLowerCase();
    if (!SUPPORTED[ext]) return fail(415, 'Unsupported audio format');
    const contentType = (request.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (![SUPPORTED[ext], 'application/octet-stream', ...(ext === 'wav' ? ['audio/x-wav', 'audio/wave'] : [])].includes(contentType)) return fail(415, 'Invalid content type');
    const body = await request.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_BYTES || body.byteLength !== rawSize) return fail(413, 'Invalid audio size');
    const id = crypto.randomUUID();
    const objectKey = 'originals/' + id + '.' + ext;
    await env.AUDIO.put(objectKey, body, { httpMetadata: { contentType: SUPPORTED[ext] }, customMetadata: { originalName: name } });
    try {
      await env.DB.prepare('INSERT INTO audio_assets (id,title,artist,category,object_key,format,bytes) VALUES (?,?,?,?,?,?,?)')
        .bind(id, title, artist || null, 'original', objectKey, ext, body.byteLength).run();
      await audit(env.DB, 'upload', id, { filename: name, bytes: body.byteLength });
    } catch (error) {
      await env.AUDIO.delete(objectKey);
      throw error;
    }
    return json({ id, title, artist, bytes: body.byteLength, format: ext }, 201);
  }

  if (parts.length === 3 && parts[1] === 'assets' && isId(parts[2])) {
    const id = parts[2];
    const row = await env.DB.prepare('SELECT * FROM audio_assets WHERE id=?').bind(id).first();
    if (!row) return fail(404, 'Asset not found');
    if (method === 'GET') return json({ asset: safeRow(row) });
    if (method === 'DELETE') {
      if (row.deleted_at) return fail(409, 'Already in trash');
      await env.DB.prepare("UPDATE audio_assets SET deleted_at=datetime('now') WHERE id=? AND deleted_at IS NULL").bind(id).run();
      await audit(env.DB, 'trash', id);
      return json({ status: 'trashed', id });
    }
  }

  if (parts.length === 4 && parts[1] === 'assets' && isId(parts[2])) {
    const id = parts[2];
    const row = await env.DB.prepare('SELECT * FROM audio_assets WHERE id=?').bind(id).first();
    if (!row) return fail(404, 'Asset not found');
    if (parts[3] === 'restore' && method === 'POST') {
      if (!row.deleted_at) return fail(409, 'Asset is not in trash');
      await env.DB.prepare('UPDATE audio_assets SET deleted_at=NULL WHERE id=?').bind(id).run();
      await audit(env.DB, 'restore', id);
      return json({ status: 'restored', id });
    }
    if (parts[3] === 'download' && method === 'GET') {
      if (row.deleted_at) return fail(404, 'Asset is in trash');
      const object = await env.AUDIO.get(row.object_key);
      if (!object) return fail(404, 'Object missing from storage');
      const headers = new Headers({
        'Content-Type': SUPPORTED[row.format] || 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="audio-' + id + '.' + row.format + '"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (object.size) headers.set('Content-Length', String(object.size));
      return new Response(object.body, { headers });
    }
  }

  if (parts.length === 2 && parts[1] === 'audit' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT id,actor,action,resource_type,resource_id,detail_json,created_at FROM audit_events ORDER BY id DESC LIMIT 100').all();
    return json({ events: rows.results || [] });
  }
  return fail(404, 'Not found');
}
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/health' && request.method === 'GET') {
      try {
        const db = await env.DB.prepare('SELECT 1 AS ok').first();
        if (db?.ok !== 1 || !env.AUDIO) throw new Error('Bindings unavailable');
        return json({ status:'ok', service:'willowtree-audio-api', database:true, storage_binding:true,
          library_locked: !env.ADMIN_API_TOKEN });
      } catch { return json({ status:'error' }, 503); }
    }
    if (pathname === '/studio' && request.method === 'GET') {
      return new Response(STUDIO_HTML, { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src blob:; img-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      } });
    }
    if (pathname.startsWith('/api/')) {
      try { return await handleApi(request, env); }
      catch (error) { console.error('Audio API failure', error); return fail(500, 'Internal server error'); }
    }
    return new Response('Not found', { status: 404 });
  }
};
