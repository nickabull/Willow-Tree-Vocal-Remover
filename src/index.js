// Safe initial API: does not expose file uploads, downloads, or library data.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      try {
        const db = await env.DB.prepare('SELECT 1 AS ok').first();
        if (db?.ok !== 1 || !env.AUDIO) throw new Error('Binding unavailable');
        return Response.json({
          status: 'ok',
          service: 'willowtree-audio-api',
          database: true,
          storage_binding: true,
        });
      } catch {
        return Response.json({ status: 'error' }, { status: 503 });
      }
    }
    return new Response('Not found', { status: 404 });
  },
};
