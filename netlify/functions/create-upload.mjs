import { requireAdmin, jsonResponse } from './_auth.mjs';

export default async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, { Allow: 'POST' });
  }

  try {
    const user = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const { size, name, maxDurationSeconds = 14400, requireSignedURLs = false } = body;
    if (!Number.isFinite(size) || size <= 0) {
      return jsonResponse(400, { error: 'Valid file size required' });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
    if (!accountId || !apiToken) {
      return jsonResponse(500, { error: 'Cloudflare Stream environment is not configured' });
    }

    const b64 = (v) => Buffer.from(String(v)).toString('base64');
    const metadata = [
      `name ${b64(name || 'video')}`,
      `requiresignedurls ${b64(requireSignedURLs ? 'true' : 'false')}`,
      `maxdurationseconds ${b64(maxDurationSeconds)}`
    ].join(',');

    const cf = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream?direct_user=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': String(size),
          'Upload-Metadata': metadata,
          'Upload-Creator': user.id
        }
      }
    );

    if (!cf.ok) {
      const text = await cf.text();
      console.error('Cloudflare upload provisioning failed', cf.status, text.slice(0, 1000));
      return jsonResponse(cf.status, {
        error: 'Cloudflare upload provisioning failed',
        details: text.slice(0, 1000)
      });
    }

    const uploadURL = cf.headers.get('location');
    const uid = cf.headers.get('stream-media-id') || cf.headers.get('stream-mediaid') || null;
    if (!uploadURL) {
      return jsonResponse(502, { error: 'Cloudflare did not return an upload URL' });
    }

    return jsonResponse(200, { uploadURL, uid });
  } catch (e) {
    console.error('create-upload function error', e);
    return jsonResponse(e.statusCode || 500, { error: e.message || 'Unexpected error' });
  }
};
