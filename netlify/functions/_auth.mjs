export async function requireAdmin(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Missing bearer token'), { statusCode: 401 });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw Object.assign(new Error('Supabase server environment is not configured'), { statusCode: 500 });
  }

  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) {
    const detail = await userRes.text().catch(() => '');
    console.error('Supabase auth failed', userRes.status, detail.slice(0, 500));
    throw Object.assign(new Error('Invalid session'), { statusCode: 401 });
  }
  const user = await userRes.json();

  const profileRes = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${token}` } }
  );
  if (!profileRes.ok) {
    const detail = await profileRes.text().catch(() => '');
    console.error('Supabase profile lookup failed', profileRes.status, detail.slice(0, 500));
    throw Object.assign(new Error('Unable to verify profile'), { statusCode: 403 });
  }

  const rows = await profileRes.json();
  if (!rows[0] || rows[0].role !== 'admin') {
    throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
  }
  return user;
}

export function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}
