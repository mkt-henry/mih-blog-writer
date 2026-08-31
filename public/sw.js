// 설치형 앱(PWA)으로 만들기 위한 최소 서비스 워커.
//
// ⚠ **응답을 캐시하지 않는다.** 이 대시보드는 로그인해야 보이는 사내 데이터다.
// 페이지나 API 응답을 캐시에 담으면 로그아웃한 뒤에도, 다른 사람이 같은 기기를 써도
// 남의 원고가 그대로 보인다. 그래서 캐시는 **로그인과 무관한 아이콘 몇 개**로 제한한다.
//
// 브라우저가 "앱 설치"를 띄우려면 fetch 처리기가 있는 서비스 워커가 필요하다.
// 여기서는 그 조건만 채우고 나머지는 그대로 네트워크로 흘려보낸다.

const CACHE = "mih-static-v1";
const STATIC = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 아이콘만 캐시에서 먼저 준다. 그 밖에는 손대지 않는다.
  if (STATIC.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
