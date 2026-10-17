// 사이트 앱(PWA) 푸시 발송. mih_alerts 에 한 줄이 들어오면 트리거(20261017000000_app_alerts_push.sql)가
// 그 알림을 넘기고, 이 함수가 "알림 켜기"를 누른 기기 전부(mih_push_subscriptions)에 보낸다.
// 만료된 구독(404/410)은 지운다 — 앱을 지웠거나 알림을 끈 기기다.
//
// web-push 는 암호화·VAPID 서명만 쓰고(generateRequestDetails) 전송은 fetch 로 한다
// (라이브러리의 node https 경로를 Edge 런타임에서 태우지 않으려는 것, gvb send-push 와 같다).
//
// 배포: verify_jwt=true 그대로(--no-verify-jwt 붙이지 말 것). 게이트웨이가 서명을 확인하고,
// 여기서 한 번 더 service_role 인지 본다(공개 키로는 못 부른다).
// 비밀값: VAPID_PRIVATE_KEY (No.VI 금고 mih-vapid-private). SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 는 런타임 기본값.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { toPush } from "./message.ts";

/** 공개키는 비밀이 아니다. app/_components/PushToggle.tsx 의 VAPID_PUBLIC_KEY 와 같은 값이어야 한다. */
const VAPID_PUBLIC_KEY = "BB9tjodCgVI0cVtKb0Pttt3OXE3w5Jg7fZnAtH9WuiYwRNu_N0AtD0UwewFVkJZY5ai9t4s37G6IyJ6hHc2MOmU";
const SITE_URL = "https://mih.bp-studio.com";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function jwtRole(req: Request): string | null {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...(init.headers ?? {}) },
  });

Deno.serve(async (req) => {
  if (jwtRole(req) !== "service_role") {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!privateKey) return Response.json({ ok: false, error: "VAPID_PRIVATE_KEY 미설정" }, { status: 500 });

  const { id, channel, payload, images } = await req.json();
  const message = JSON.stringify(toPush(id ?? 0, channel ?? "", payload ?? {}, images ?? []));

  const res = await rest("mih_push_subscriptions?select=endpoint,p256dh,auth");
  if (!res.ok) return Response.json({ ok: false, error: `구독 조회 실패 ${res.status}` }, { status: 500 });
  const subs: { endpoint: string; p256dh: string; auth: string }[] = await res.json();

  const vapidDetails = { subject: SITE_URL, publicKey: VAPID_PUBLIC_KEY, privateKey };
  const gone: string[] = [];
  const failed: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      const r = webpush.generateRequestDetails(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message,
        { vapidDetails, TTL: 24 * 3600 },
      );
      const out = await fetch(r.endpoint, { method: r.method, headers: r.headers, body: r.body });
      if (out.status === 404 || out.status === 410) gone.push(s.endpoint);
      else if (!out.ok) failed.push(`${new URL(s.endpoint).host} ${out.status} ${(await out.text()).slice(0, 200)}`);
    } catch (e) {
      failed.push(`${new URL(s.endpoint).host} ${(e as Error).message}`);
    }
  }));
  for (const endpoint of gone) {
    await rest(`mih_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
  }

  const result = { ok: failed.length === 0, sent: subs.length - gone.length - failed.length, removed: gone.length, failed };
  if (failed.length > 0) console.error("send-push 일부 실패", failed);
  return Response.json(result, { status: failed.length > 0 ? 502 : 200 });
});
