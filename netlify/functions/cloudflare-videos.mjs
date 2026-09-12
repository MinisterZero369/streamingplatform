import { requireAdmin, jsonResponse } from './_auth.mjs';

export default async (request) => {
  if (request.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' }, { Allow: 'GET' });
  }

  try {
    await requireAdmin(request);

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
    if (!accountId || !apiToken) {
      return jsonResponse(500, {
        error: 'Cloudflare Stream environment is not configured',
        missing: [
          !accountId ? 'CLOUDFLARE_ACCOUNT_ID' : null,
          !apiToken ? 'CLOUDFLARE_STREAM_API_TOKEN' : null
        ].filter(Boolean)
      });
    }

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream?limit=1000`;
    const cf = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json'
      }
    });

    const raw = await cf.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw: raw.slice(0, 1000) };
    }

    if (!cf.ok || data?.success === false) {
      console.error('Cloudflare Stream list failed', {
        status: cf.status,
        errors: data?.errors,
        messages: data?.messages
      });
      return jsonResponse(cf.status || 502, {
        error: 'Unable to load Cloudflare Stream library',
        cloudflareStatus: cf.status,
        cloudflareErrors: data?.errors || null,
        cloudflareMessages: data?.messages || null
      });
    }

    const rows = Array.isArray(data?.result) ? data.result : [];
    const videos = rows.map((v) => ({
      uid: v.uid,
      name: v.meta?.name || v.name || 'Untitled video',
      thumbnail: v.thumbnail || null,
      duration: Number(v.duration || 0),
      created: v.created || null,
      modified: v.modified || null,
      readyToStream: Boolean(v.readyToStream),
      state: v.status?.state || (v.readyToStream ? 'ready' : 'processing'),
      pctComplete: v.status?.pctComplete ?? null,
      preview: v.preview || null
    }));

    return jsonResponse(200, { videos, count: videos.length });
  } catch (e) {
    console.error('cloudflare-videos function error', e);
    return jsonResponse(e.statusCode || 500, {
      error: e.message || 'Unexpected error'
    });
  }
};
