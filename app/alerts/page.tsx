import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import { CHANNEL_LABELS, type Alert } from "@/lib/alert-format";
import AlertList from "./AlertList";
import PushToggle from "@/app/_components/PushToggle";

export const dynamic = "force-dynamic";

const PAGE = 60;

// Discord 로 나가는 알림(신규 원고·발행 현황·검색 노출·예약 발행·검색 캡처)을 같은 모양으로 모아 보고 복사한다.
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (perms.keywordOnly) redirect("/keywords");

  const { c } = await searchParams;
  const channel = c && CHANNEL_LABELS[c] ? c : null;

  let q = supabaseAdmin()
    .from("mih_alerts")
    .select("id,channel,payload,images,created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (channel) q = q.eq("channel", channel);
  const { data, error } = await q;
  const alerts = (data ?? []) as Alert[];

  return (
    <main className="mx-auto max-w-2xl px-3 py-4 pb-16">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="whitespace-nowrap text-lg font-bold">알림</h1>
        <div className="flex-1" />
        <PushToggle />
      </div>
      <p className="mb-3 text-xs text-gray-500">디스코드와 같은 알림 · 최근 {PAGE}건 · 복사 버튼을 누르면 글자를 그대로 복사합니다</p>
      {error && <p className="mb-3 text-sm text-red-600">알림을 불러오지 못했습니다: {error.message}</p>}
      <AlertList alerts={alerts} channel={channel} />
    </main>
  );
}
