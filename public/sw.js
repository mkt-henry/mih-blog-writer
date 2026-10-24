// 설치형 앱(PWA)으로 만들기 위한 최소 서비스 워커.
//
// ⚠ **응답을 캐시하지 않는다.** 이 대시보드는 로그인해야 보이는 사내 데이터다.
// 페이지나 API 응답을 캐시에 담으면 로그아웃한 뒤에도, 다른 사람이 같은 기기를 써도
// 남의 원고가 그대로 보인다. 그래서 캐시는 **로그인과 무관한 아이콘 몇 개**로 제한한다.
//
// 브라우저가 "앱 설치"를 띄우려면 fetch 처리기가 있는 서비스 워커가 필요하다.
// 여기서는 그 조건만 채우고 나머지는 그대로 네트워크로 흘려보낸다.

const CACHE = "mih-static-v3";
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

// 사이트 알림 푸시(Supabase 함수 send-push 가 보낸다). 글자는 Discord 알림 제목·요약이고, 누르면 /alerts 의 그 알림으로 간다.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MIH 알림", body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/alerts" },
  };
  if (data.image) options.image = data.image;
  event.waitUntil(self.registration.showNotification(data.title || "MIH 알림", options));
});

// 브라우저가 구독을 바꾸거나 만료시키면 새 구독을 만들어 서버에 다시 올린다(그냥 두면 그 기기로는 알림이 끊긴다).
// 공개 키는 lib/push-client.ts 의 VAPID_PUBLIC_KEY 와 같은 값이다.
const VAPID_PUBLIC_KEY = "BB9tjodCgVI0cVtKb0Pttt3OXE3w5Jg7fZnAtH9WuiYwRNu_N0AtD0UwewFVkJZY5ai9t4s37G6IyJ6hHc2MOmU";

function keyBytes(base64url) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) })
      .then((sub) =>
        fetch("/api/push", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        }),
      )
      .catch(() => {}),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/alerts", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
