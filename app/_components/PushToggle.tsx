"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { VAPID_PUBLIC_KEY, keyBytes, resyncPushSubscription, saveSubscription } from "@/lib/push-client";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** 이 기기에 알림(푸시) 켜기·끄기. iOS 는 홈 화면에 추가한 앱에서만 푸시를 받을 수 있다. */
export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
      // "알림 끄기"로 보이는 기기는 서버 목록에도 꼭 있게 다시 올린다.
      if (sub) await resyncPushSubscription(reg).catch(() => {});
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        toast.error("알림 권한이 허용되지 않았습니다");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
      await saveSubscription(sub);
      setState("on");
      toast.success("이 기기에서 알림을 받습니다");
    } catch {
      toast.error("알림을 켜지 못했습니다");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("이 기기 알림을 껐습니다");
    } catch {
      toast.error("알림을 끄지 못했습니다");
    } finally {
      setBusy(false);
    }
  }

  const base = "flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium disabled:opacity-50";
  if (state === "loading") return null;
  if (state === "unsupported") return <span className="text-[11px] text-gray-400">이 브라우저는 알림을 못 받습니다</span>;
  if (state === "ios-install")
    return (
      <span className="text-right text-[11px] leading-tight text-gray-500">
        아이폰은 공유 → 홈 화면에 추가 후<br />앱에서 알림을 켜세요
      </span>
    );
  if (state === "denied")
    return <span className="text-[11px] text-gray-500">알림이 차단됨 · 브라우저 설정에서 허용하세요</span>;
  if (state === "on")
    return (
      <button type="button" disabled={busy} onClick={disable} className={`${base} border-gray-300 bg-white text-gray-700`}>
        <BellOff className="h-3.5 w-3.5" />
        알림 끄기
      </button>
    );
  return (
    <button
      type="button"
      disabled={busy}
      onClick={enable}
      className={`${base} border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white`}
    >
      <Bell className="h-3.5 w-3.5" />
      알림 켜기
    </button>
  );
}
