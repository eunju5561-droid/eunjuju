// Vercel Edge Middleware — 로그인 안 된 사용자를 소개 페이지로 보냄.
// 서명된 세션 쿠키(HMAC-SHA256)를 Web Crypto로 검증한다.

export const config = {
  // 보호할 페이지 (index/소개 페이지와 정적 자산·API는 제외)
  matcher: [
    '/dashboard',
    '/dashboard.html',
    '/chart',
    '/chart.html',
    '/diagram',
    '/diagram.html',
    '/meeting-result',
    '/meeting-result.html',
    '/report',
    '/report.html',
  ],
};

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64url(buf) {
  let s = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifySession(token, secret) {
  if (!token || !secret) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  if (bytesToB64url(mac) !== sig) return false;

  try {
    const json = new TextDecoder().decode(b64urlToBytes(payload));
    const { exp } = JSON.parse(json);
    return exp > Date.now();
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? match[1] : null;
}

export default async function middleware(request) {
  const token = getCookie(request, 'session');
  const ok = await verifySession(token, process.env.SESSION_SECRET);
  if (ok) return; // 통과

  // 미로그인 → 소개 페이지로
  const url = new URL('/', request.url);
  return Response.redirect(url, 302);
}
