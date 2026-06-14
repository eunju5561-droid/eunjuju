import { google } from 'googleapis';
import { signSession } from '../_session.js';

function redirectUri(req) {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/auth/callback`;
}

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('인증 코드가 없습니다.');
    return;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('SESSION_SECRET이 설정되지 않았습니다.');
    return;
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri(req)
    );
    // 로그인 검증만 목적 — 토큰 교환이 성공하면 본인 인증 완료로 간주
    await oauth2.getToken(code);

    const token = signSession(secret);
    res.writeHead(302, {
      Location: '/dashboard',
      'Set-Cookie': `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`,
    });
    res.end();
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('로그인에 실패했습니다. 다시 시도해주세요.');
  }
}
