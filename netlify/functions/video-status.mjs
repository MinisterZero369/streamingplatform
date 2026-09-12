import { requireAdmin, jsonResponse } from './_auth.mjs';

export default async (request) => {
  if (request.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' }, { Allow: 'GET' });
  }

  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const uid = url.searchParams.get('uid');
    if (!uid) return jsonResponse(400, { error: 'uid required' });

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
    if (!accountId || !apiToken) {
      return jsonResponse(500, { error: 'Cloudflare Stream environment is not configured' });
    }

    const cf = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' } }
    );

    const raw = await cf.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { data = { raw: raw.slice(0, 1000) }; }

    return jsonResponse(cf.status, data);
  } catch (e) {
    console.error('video-status function error', e);
    return jsonResponse(e.statusCode || 500, { error: e.message || 'Unexpected error' });
  }
};
