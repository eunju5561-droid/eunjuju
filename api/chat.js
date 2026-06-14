import { GoogleGenAI } from '@google/genai';
import { verifySession, getSessionCookie } from './_session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 로그인 세션 검증
  if (!verifySession(getSessionCookie(req), process.env.SESSION_SECRET)) {
    return res.status(401).json({ error: 'NOT_LOGGED_IN' });
  }

  const { message, context } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY가 서버에 설정되지 않았습니다.' });
  }
  if (!message) {
    return res.status(400).json({ error: '메시지를 입력해주세요.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `다음은 내 업무 데이터입니다:\n${context || '(데이터 없음)'}\n\n질문: ${message}\n\n데이터를 바탕으로 한국어로 답해줘.`,
    });
    return res.status(200).json({ answer: result.text });
  } catch {
    return res.status(500).json({ error: '분석 중 오류가 발생했습니다.' });
  }
}
