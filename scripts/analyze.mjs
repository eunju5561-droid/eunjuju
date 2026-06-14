import { GoogleGenAI } from '@google/genai';
import { readFile, readdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
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

const dataDir = join(ROOT, '김비서-데이터');
let allData = '';
try {
  const files = (await readdir(dataDir)).filter(f => /\.csv$/i.test(f)).sort();
  if (!files.length) { console.log('❌ CSV 파일을 찾을 수 없습니다.'); process.exit(1); }
  for (const f of files) {
    const content = await readFile(join(dataDir, f), 'utf-8');
    allData += `\n\n=== ${f} ===\n${content}`;
    console.log(`📊 CSV 발견: ${f}`);
  }
} catch {
  console.log('❌ 김비서-데이터 폴더를 찾을 수 없습니다.');
  process.exit(1);
}

console.log('⏳ Gemini에게 데이터 분석 요청 중...');

const ai = new GoogleGenAI({ apiKey: API_KEY });
const res = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents:
    '다음 데이터를 분석해서 ① 핵심 인사이트 3가지 ② 이번 주 주의할 점 ③ 추천 액션을 한국어로 정리해줘.\n\n' +
    allData,
});

const updated_at = new Date().toISOString();
const newRecord = { updated_at, summary: res.text };

let records = [];
try {
  const existing = JSON.parse(await readFile(join(ROOT, 'analysis.json'), 'utf-8'));
  records = existing.records || (existing.summary ? [{ updated_at: existing.updated_at, summary: existing.summary }] : []);
} catch { /* 첫 실행 */ }

records.unshift(newRecord);
if (records.length > 10) records.length = 10;

await writeFile(join(ROOT, 'analysis.json'), JSON.stringify({ records }, null, 2), 'utf-8');

console.log('\n✅ 데이터 분석 완료!');
console.log(`   기록 수: ${records.length}개`);
console.log(`   업데이트: ${updated_at}\n`);
