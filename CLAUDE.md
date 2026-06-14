# 김비서 (Kim Secretary)

AI 기반 업무 관리 대시보드. 할 일·일정·프로젝트·매출 데이터를 한눈에 보여주는 정적 웹 애플리케이션.

---

## 🔖 세션 인계 (Claude가 먼저 읽을 것)

> 다른 기기(맥미니 등)에서 이어받은 Claude를 위한 현재 상태 요약. 사용자가 "이어서 해줘"라고 하면 아래를 읽고 바로 진행.

**완료된 것:**
- Google 로그인 게이트 (로컬 `server.mjs` 세션파일 / 배포 `middleware.js` Edge + 서명쿠키). 미로그인 시 전 HTML 페이지 차단 → 소개페이지(`/`)만 공개.
- 구글 캘린더 연동 (OAuth + refresh_token → `api/calendar.js` / 로컬 `/api/calendar`). 계정은 **jujumath21@gmail.com**.
- AI 아침 브리핑 / 데이터 분석+챗 / 회의록 분석 (Gemini, `scripts/*.mjs` → `*.json`).
- 배포: https://eunjuju.vercel.app (Vercel, GitHub `eunju5561-droid/eunjuju` main). `vercel --prod` 또는 main push로 재배포.

**이 기기에서 처음 켤 때 (한 번만):**
```bash
npm install
# 비밀값(.env.local 등)은 압축파일로 받아 프로젝트 폴더에 풀어둔 상태여야 함.
# 없다면: vercel login && vercel link && vercel env pull .env.local
npm run dev    # http://localhost:3000 → Google 로그인
```
자세한 절차: `맥미니-설정가이드.md`

**git에 없는 파일(직접 옮긴 압축파일에 들어있음):** `.env.local`, `.google-tokens.json`, `brief.json`, `analysis.json`, `meeting-result.json`, `calendar-data.json`. 이게 폴더에 있어야 정상 작동.

**데이터 갱신:** `npm run brief|analyze|meeting`, `npm run fetch:calendar` → 각 JSON 갱신 → 배포 반영은 `vercel --prod`.

**주의:** 비밀값은 코드에 하드코딩 금지(전부 `process.env`). 생성 JSON·`.env.local`은 gitignore됨(개인정보).

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 업무 대시보드 | 할 일 목록(체크박스·우선순위), 주간 일정 표, 프로젝트 진행률, 매출 요약을 2×2 카드 그리드로 표시 |
| 회의록 뷰어 | 회의 기본 정보·요약·액션 아이템 표·다음 일정을 카드 레이아웃으로 정리, 인쇄 지원 |
| 매출 차트 | Canvas 2D API로 구현한 날짜별 선 그래프 + 제품별 막대 그래프 (외부 라이브러리 없음) |
| 업무 프로세스 | 기획→제작→검토→배포→분석 5단계 워크플로 다이어그램 (SVG) |
| 사이트 분석 리포트 | subtrac.kr 직접 방문 분석 — 구조·디자인·기능·잘한점·개선점·종합점수 카드 |
| 다크/라이트 모드 | 전 페이지 공통 토글, localStorage 로 상태 유지, FOUC 방지 인라인 스크립트 |
| 탭 내비게이션 | 모든 페이지 상단에 공통 네비게이션 바, 현재 페이지 탭 강조 |
| /김비서 명령어 | Claude Code 커스텀 슬래시 명령어 — 데이터 읽기 → 대시보드 업데이트 → 오늘 브리핑 출력 |

---

## 파일 구조

```
워크숍-실습/
├── index.html              # 메인 소개 페이지 (히어로·기능 카드·CTA)
├── dashboard.html          # 업무 대시보드 (할 일·일정·프로젝트·매출)
├── meeting-result.html     # 회의록 뷰어
├── chart.html              # 매출 차트 (선 그래프 + 막대 그래프)
├── diagram.html            # 업무 프로세스 뷰어 (SVG 래퍼)
├── diagram.svg             # 업무 프로세스 플로우 다이어그램
├── report.html             # 사이트 분석 리포트 (subtrac.kr)
│
├── 김비서-데이터/           # 원본 데이터 파일
│   ├── 업무목록.csv         # 할 일·우선순위·담당자·마감일
│   ├── 주간일정.txt         # 요일별 주간 일정
│   ├── 프로젝트현황.csv     # 프로젝트명·진행률·예산·상태
│   ├── 매출데이터.csv       # 날짜·제품·수량·금액 거래 내역
│   └── 회의록.txt          # 마케팅팀 주간회의 회의록
│
├── 정리해줘/               # 용도별 분류 정리 폴더
│   ├── 보고서/             # 보고서 초안·수정·최종본
│   ├── 메모/               # 기획 메모·아이디어
│   ├── 업무/               # 할일·피드백·링크·영수증
│   └── 기타/               # 미분류 파일
│
├── .claude/
│   └── commands/
│       └── 김비서.md       # /김비서 커스텀 슬래시 명령어 정의
│
├── .gitignore
└── CLAUDE.md
```

---

## 사용 기술

### 프론트엔드
- **HTML5 / CSS3 / Vanilla JS** — 외부 프레임워크·라이브러리 없음
- **글래스모피즘 디자인** — `backdrop-filter: blur()` + 반투명 카드
- **CSS 커스텀 프로퍼티** — `:root` / `html.dark` 변수로 다크·라이트 테마 전환
- **Canvas 2D API** — chart.html 차트 직접 렌더링 (devicePixelRatio 레티나 대응)
- **SVG** — diagram.svg 워크플로 다이어그램 (마커·필터·그라디언트)
- **localStorage** — 테마 설정 페이지 간 공유

### 배포
- **GitHub** — `eunju5561-droid/eunjuju` 저장소
- **Vercel** — 정적 사이트 자동 배포 (`git push` → 자동 재배포)

### 개발 도구
- **Claude Code** — 전체 코드 생성 및 유지보수
- **Claude in Chrome MCP** — 실사이트(subtrac.kr) 직접 분석
- **GitHub CLI (`gh`)** — 저장소 관리
- **Vercel CLI** — 배포 자동화

---

## 개발 규칙

- 모든 링크·경로는 **상대경로** 사용 (Vercel 배포 호환)
- `dashboard.html` 수정 시 CSS 변수·네비게이션·다크모드 코드는 유지
- 새 페이지 추가 시 상단 탭 네비게이션(`.nav-tabs`) 동일하게 포함
- 데이터 업데이트는 `김비서-데이터/` 파일 수정 후 `/김비서` 명령어로 대시보드 갱신

---

## 빠른 시작

```bash
# 로컬 미리보기 (아무 파일이나 브라우저로 열기)
open index.html

# 변경사항 배포
git add .
git commit -m "변경 내용"
git push   # Vercel 자동 재배포
```
