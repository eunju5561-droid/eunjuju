import { google } from 'googleapis';
import { verifySession, getSessionCookie } from './_session.js';

export default async function handler(req, res) {
  // 로그인 세션 검증
  if (!verifySession(getSessionCookie(req), process.env.SESSION_SECRET)) {
    res.status(401).json({ error: 'NOT_LOGGED_IN' });
    return;
  }

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    res.status(500).json({ error: 'NOT_CONNECTED' });
    return;
  }

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });

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

    res.status(200).json({ events });
  } catch {
    res.status(500).json({ error: '캘린더 조회 중 오류가 발생했습니다.' });
  }
}
