import { GoogleGenAI } from '@google/genai';
import { readFile, readdir, writeFile } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env.local') });

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.log('\n❌ GEMINI_API_KEY가 설정되지 않았습니다.');
  console.log('   .env.local 에 GEMINI_API_KEY=키값 을 추가해주세요.\n');
  process.exit(1);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', '.claude', 'scripts']);

async function findMeetingFiles(dir) {
  let found = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      found = found.concat(await findMeetingFiles(join(dir, e.name)));
    } else if (/회의록/.test(e.name) && /\.(txt|md)$/i.test(e.name)) {
      found.push(join(dir, e.name));
    }
  }
  return found;
}

const files = await findMeetingFiles(ROOT);
if (!files.length) {
  console.log('❌ 회의록 파일을 찾을 수 없습니다 (파일명에 "회의록" 포함 필요).');
  process.exit(1);
}

let meetingText = '';
for (const f of files) {
  const content = await readFile(f, 'utf-8');
  meetingText += `\n\n=== ${basename(f)} ===\n${content}`;
  console.log(`📄 회의록 발견: ${basename(f)}`);
}

console.log('⏳ Gemini에게 회의록 분석 요청 중...');

const ai = new GoogleGenAI({ apiKey: API_KEY });
const res = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents:
    '다음 회의록을 분석해서 ① 액션아이템 목록(담당자·기한 포함) ② 핵심 결정사항 ③ 후속 메일 초안을 한국어로 작성해줘.\n\n' +
    meetingText,
});

const updated_at = new Date().toISOString();
const sources = files.map(f => basename(f));
const newRecord = { updated_at, sources, summary: res.text };

let records = [];
try {
  const existing = JSON.parse(await readFile(join(ROOT, 'meeting-result.json'), 'utf-8'));
  records = existing.records || (existing.summary ? [{ updated_at: existing.updated_at, sources: existing.sources || [], summary: existing.summary }] : []);
} catch { /* 첫 실행 */ }

records.unshift(newRecord);
if (records.length > 10) records.length = 10;

await writeFile(join(ROOT, 'meeting-result.json'), JSON.stringify({ records }, null, 2), 'utf-8');

console.log('\n✅ 회의록 분석 완료!');
console.log(`   기록 수: ${records.length}개`);
console.log(`   업데이트: ${updated_at}\n`);
