import http from 'http';
import { readFile, writeFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';
import crypto from 'crypto';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

const PORT = 3000;
const TOKENS_FILE = join(__dirname, '.google-tokens.json');
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
};

/* ── 세션 (파일 영속) ── */
const SESSIONS_FILE = join(__dirname, '.sessions.json');
let sessions = new Set();
try {
  sessions = new Set(JSON.parse(await readFile(SESSIONS_FILE, 'utf-8')));
} catch { /* 첫 실행 */ }

async function saveSessions() {
  await writeFile(SESSIONS_FILE, JSON.stringify([...sessions])).catch(() => {});
}

function makeSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function getSessionId(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

function isLoggedIn(req) {
  return sessions.has(getSessionId(req));
}

/* ── Google OAuth2 ── */
// GOOGLE_CLIENT_* 또는 GOOGLE_OAUTH_CLIENT_* 중 있는 값을 사용
// (vercel env pull 로 받은 .env.local 에는 GOOGLE_OAUTH_* 가 들어있음)
function makeOAuth2() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    REDIRECT_URI
  );
}

async function loadTokens() {
  try {
    return JSON.parse(await readFile(TOKENS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  /* ────────────────────────────────────────
     GET /auth/google  →  Google 로그인 시작
  ──────────────────────────────────────── */
  if (req.method === 'GET' && url.pathname === '/auth/google') {
    const oauth2 = makeOAuth2();
    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  /* ────────────────────────────────────────
     GET /auth/callback  →  토큰 저장 + 세션 발급
  ──────────────────────────────────────── */
  if (req.method === 'GET' && url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code');
    if (!code) { json(res, 400, { error: '인증 코드가 없습니다.' }); return; }
    try {
      const oauth2 = makeOAuth2();
      const { tokens } = await oauth2.getToken(code);
      await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2));

      // 세션 발급
      const sid = makeSessionId();
      sessions.add(sid);
      await saveSessions();

      res.writeHead(302, {
        Location: '/dashboard',
        'Set-Cookie': `session=${sid}; HttpOnly; Path=/; Max-Age=86400`,
      });
      res.end();
    } catch {
      json(res, 500, { error: '토큰 수령에 실패했습니다.' });
    }
    return;
  }

  /* ────────────────────────────────────────
     GET /auth/logout
  ──────────────────────────────────────── */
  if (req.method === 'GET' && url.pathname === '/auth/logout') {
    const sid = getSessionId(req);
    if (sid) { sessions.delete(sid); await saveSessions(); }
    res.writeHead(302, {
      Location: '/auth/google',
      'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0',
    });
    res.end();
    return;
  }

  /* ────────────────────────────────────────
     GET /api/calendar
  ──────────────────────────────────────── */
  if (req.method === 'GET' && url.pathname === '/api/calendar') {
    if (!isLoggedIn(req)) { json(res, 401, { error: 'NOT_LOGGED_IN' }); return; }
    const tokens = await loadTokens();
    if (!tokens) { json(res, 401, { error: 'NOT_CONNECTED' }); return; }
    try {
      const oauth2 = makeOAuth2();
      oauth2.setCredentials(tokens);
      oauth2.on('tokens', async t => {
        const updated = { ...tokens, ...t };
        await writeFile(TOKENS_FILE, JSON.stringify(updated, null, 2)).catch(() => {});
      });
      const calendar = google.calendar({ version: 'v3', auth: oauth2 });
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const resp = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: weekLater.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20,
      });
      const events = (resp.data.items || []).map(e => ({
        id: e.id,
        title: e.summary || '(제목 없음)',
        start: e.start.dateTime || e.start.date,
        end:   e.end?.dateTime  || e.end?.date,
        allDay: !e.start.dateTime,
        location: e.location || '',
      }));
      json(res, 200, { events });
    } catch {
      json(res, 500, { error: '캘린더 조회 중 오류가 발생했습니다.' });
    }
    return;
  }

  /* ────────────────────────────────────────
     GET /api/calendar/status
  ──────────────────────────────────────── */
  if (req.method === 'GET' && url.pathname === '/api/calendar/status') {
    const tokens = await loadTokens();
    json(res, 200, { connected: !!tokens });
    return;
  }

  /* ────────────────────────────────────────
     POST /api/chat
  ──────────────────────────────────────── */
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (!isLoggedIn(req)) { json(res, 401, { error: 'NOT_LOGGED_IN' }); return; }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { message, context } = JSON.parse(body);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) { json(res, 500, { error: 'GEMINI_API_KEY가 서버에 설정되지 않았습니다.' }); return; }
        const ai = new GoogleGenAI({ apiKey });
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `다음은 내 업무 데이터입니다:\n${context || '(데이터 없음)'}\n\n질문: ${message}\n\n데이터를 바탕으로 한국어로 답해줘.`,
        });
        json(res, 200, { answer: result.text });
      } catch {
        json(res, 500, { error: '분석 중 오류가 발생했습니다.' });
      }
    });
    return;
  }

  /* ────────────────────────────────────────
     정적 파일 서빙 (HTML은 로그인 필요)
  ──────────────────────────────────────── */
  let urlPath = url.pathname;
  if (urlPath === '/') urlPath = '/index.html';
  if (!extname(urlPath)) urlPath += '.html';

  // index.html(소개 페이지)은 공개, 나머지 HTML 페이지는 로그인 필요
  const PUBLIC_PAGES = ['/index.html'];
  if (extname(urlPath) === '.html' && !PUBLIC_PAGES.includes(urlPath) && !isLoggedIn(req)) {
    res.writeHead(302, { Location: '/auth/google' });
    res.end();
    return;
  }

  try {
    const content = await readFile(join(__dirname, urlPath));
    res.writeHead(200, { 'Content-Type': MIME[extname(urlPath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 김비서 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   대시보드: http://localhost:${PORT}/dashboard`);
  console.log('   Ctrl+C 로 종료\n');
});
