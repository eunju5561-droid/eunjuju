const CACHE = 'kimsecretary-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/meeting-result.html',
  '/chart.html',
  '/diagram.html',
  '/diagram.svg',
  '/report.html',
  '/manifest.json',
  '/icon.svg',
];

/* ── 설치: 핵심 파일 미리 캐시 ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

/* ── 활성화: 이전 캐시 정리 ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── 요청: 캐시 우선, 없으면 네트워크 → 캐시 저장 ── */
self.addEventListener('fetch', e => {
  /* GET 요청만 처리 */
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request)
        .then(res => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
