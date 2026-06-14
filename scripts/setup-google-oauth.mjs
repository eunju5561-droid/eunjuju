import http from 'http';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import dotenv from 'dotenv';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(__dirname, '..', '.env.local');
const CALLBACK_PORT = 3456;
const REDIRECT_URI = 'http://localhost:3000/auth/callback';

dotenv.config({ path: ENV_FILE });

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Google OAuth 클라이언트 정보가 없습니다.
  아래 단계를 따라 발급 후 .env.local에 입력하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1단계] GCP 콘솔 접속
  → https://console.cloud.google.com/

[2단계] OAuth 동의화면 설정 (처음 한 번만)
  → 왼쪽 메뉴 > API 및 서비스 > OAuth 동의화면
  → 외부 선택 → 만들기
  → 앱 이름·지원 이메일 입력 → 저장 후 계속
  → 범위 추가: Google Calendar API > .../auth/calendar.readonly
  → 테스트 사용자 추가: 본인 Gmail 주소 입력

[3단계] 데스크톱 앱 OAuth 클라이언트 발급
  → 왼쪽 메뉴 > API 및 서비스 > 사용자 인증 정보
  → 상단 "+ 사용자 인증 정보 만들기" > OAuth 클라이언트 ID
  → 애플리케이션 유형: 데스크톱 앱
  → 이름 입력 후 만들기

[4단계] .env.local에 값 입력
  GOOGLE_OAUTH_CLIENT_ID=발급된_클라이언트_ID
  GOOGLE_OAUTH_CLIENT_SECRET=발급된_클라이언트_보안_비밀

[5단계] 다시 실행
  npm run setup:google
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  process.exit(0);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/calendar.readonly'],
});

console.log('\n브라우저에서 Google 계정 연동을 진행합니다...');

// 브라우저 자동 열기
const opener =
  process.platform === 'darwin' ? `open "${authUrl}"` :
  process.platform === 'win32'  ? `start "" "${authUrl}"` :
                                   `xdg-open "${authUrl}"`;
exec(opener, err => {
  if (err) {
    console.log('\n브라우저를 직접 열고 아래 URL에 접속하세요:');
    console.log(authUrl);
  }
});

// 콜백 서버 (일회성)
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
  if (url.pathname !== '/callback') return;

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>인증이 취소되었습니다. 창을 닫아주세요.</h2>');
    server.close();
    console.error('\n인증이 취소되었습니다.');
    process.exit(1);
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>refresh_token을 받지 못했습니다. 창을 닫고 다시 시도하세요.</h2>');
      server.close();
      console.error('\nrefresh_token이 없습니다. GCP 콘솔에서 앱 액세스를 취소한 후 다시 실행하세요.');
      console.error('  https://myaccount.google.com/permissions');
      process.exit(1);
      return;
    }

    // .env.local에 GOOGLE_OAUTH_REFRESH_TOKEN 저장
    let envContent = await readFile(ENV_FILE, 'utf-8');

    if (envContent.includes('GOOGLE_OAUTH_REFRESH_TOKEN=')) {
      envContent = envContent.replace(
        /GOOGLE_OAUTH_REFRESH_TOKEN=.*/,
        `GOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}`
      );
    } else {
      envContent = envContent.trimEnd() + `\nGOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}\n`;
    }
    await writeFile(ENV_FILE, envContent);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>✅ Google Calendar 연동 완료!</h2>
        <p>이 창을 닫고 터미널로 돌아가세요.</p>
      </body></html>
    `);
    server.close();
    console.log('\n✅ 연동 완료! refresh_token이 .env.local에 저장되었습니다.');
    console.log('   이제 캘린더 데이터를 가져오려면:\n');
    console.log('   npm run fetch:calendar\n');
    process.exit(0);
  } catch (err) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>오류가 발생했습니다. 창을 닫고 다시 시도하세요.</h2>');
    server.close();
    console.error('\n토큰 교환 중 오류:', err.message);
    process.exit(1);
  }
});

server.listen(3000, () => {
  console.log('콜백 서버 대기 중 (포트 3000)...');
  console.log('Google 계정 선택 후 권한을 허용하면 자동으로 완료됩니다.\n');
});
