// 브라우저 쪽 푸시 구독 공용 코드. PushToggle(알림 켜기 버튼)과 ServiceWorker(앱을 열 때 재등록)가 같이 쓴다.

/** VAPID 공개 키. 짝인 비밀 키는 Supabase 함수 send-push 의 VAPID_PRIVATE_KEY 에만 있다. public/sw.js 에도 같은 값이 있다. */
export const VAPID_PUBLIC_KEY = "BB9tjodCgVI0cVtKb0Pttt3OXE3w5Jg7fZnAtH9WuiYwRNu_N0AtD0UwewFVkJZY5ai9t4s37G6IyJ6hHc2MOmU";

export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function saveSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error(String(res.status));
}

/**
 * 알림을 허용한 기기면 앱을 열 때마다 구독을 서버에 다시 올린다.
 *
 * 버튼 상태("알림 끄기")는 이 기기의 구독만 보고 정하는데, 서버 쪽 구독 목록은 따로 비워질 수 있다
 * (send-push 가 404/410 으로 지운 경우, 등록 요청이 실패한 경우). 그러면 버튼은 켜져 보이는데
 * 알림은 한 건도 안 온다(2026-10-24 구독 0건 상태로 발견). 열 때마다 맞춰 두면 이 어긋남이 남지 않는다.
 * 구독이 사라졌으면(브라우저가 만료시킴) 새로 만든다. 권한을 묻는 창은 띄우지 않는다.
 */
export async function resyncPushSubscription(reg: ServiceWorkerRegistration): Promise<void> {
  if (!("PushManager" in window) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  await saveSubscription(sub);
}
