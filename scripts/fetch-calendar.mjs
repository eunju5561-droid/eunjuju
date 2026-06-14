import { writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE    = join(__dirname, '..', '.env.local');
const TOKENS_FILE = join(__dirname, '..', '.google-tokens.json');
const OUTPUT      = join(__dirname, '..', 'calendar-data.json');

dotenv.config({ path: ENV_FILE });

// 토큰 파일(.google-tokens.json) 또는 .env.local의 refresh_token 중 하나를 사용
let clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()  || process.env.GOOGLE_CLIENT_ID?.trim();
let clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
let refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();

if (!refreshToken) {
  try {
    const saved = JSON.parse(await readFile(TOKENS_FILE, 'utf-8'));
    refreshToken = saved.refresh_token;
  } catch { /* 파일 없으면 무시 */ }
}

if (!clientId || !clientSecret || !refreshToken) {
  console.log(`
캘린더 연동 정보가 없습니다.
대시보드에서 "Google 캘린더 연결하기" 버튼을 클릭하거나:

  npm run dev  → http://localhost:3000/dashboard 접속 → 연결 버튼 클릭
`);
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
oauth2.setCredentials({ refresh_token: refreshToken });

console.log('Google Calendar에서 일정을 가져오는 중...');

try {
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const now      = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const resp = await calendar.events.list({
    calendarId:  'primary',
    timeMin:     now.toISOString(),
    timeMax:     weekLater.toISOString(),
    singleEvents: true,
    orderBy:     'startTime',
    maxResults:  20,
  });

  const events = (resp.data.items || []).map(e => ({
    id:       e.id,
    title:    e.summary || '(제목 없음)',
    start:    e.start.dateTime || e.start.date,
    end:      e.end?.dateTime  || e.end?.date,
    allDay:   !e.start.dateTime,
    location: e.location || '',
  }));

  const data = {
    updated_at: now.toISOString(),
    range: {
      from: now.toISOString(),
      to:   weekLater.toISOString(),
    },
    events,
  };

  await writeFile(OUTPUT, JSON.stringify(data, null, 2));
  console.log(`✅ ${events.length}개 일정 저장 완료 → calendar-data.json`);
  if (events.length === 0) {
    console.log('   (향후 7일 내 일정이 없습니다)');
  }
} catch (err) {
  console.error('캘린더 조회 실패:', err.message);
  if (err.message?.includes('invalid_grant')) {
    console.error('refresh_token이 만료되었습니다. 다시 실행하세요: npm run setup:google');
  }
  process.exit(1);
}
