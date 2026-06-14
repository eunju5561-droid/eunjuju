import crypto from 'crypto';

const ONE_DAY = 24 * 60 * 60 * 1000;

/* 서명된 세션 토큰 생성 (payload.signature, base64url) */
export function signSession(secret, maxAgeMs = ONE_DAY) {
  const payload = Buffer
    .from(JSON.stringify({ exp: Date.now() + maxAgeMs }))
    .toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/* 세션 토큰 검증 */
export function verifySession(token, secret) {
  if (!token || !secret) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig !== expected) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now();
  } catch {
    return false;
  }
}

/* 요청 쿠키에서 session 값 추출 */
export function getSessionCookie(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}
