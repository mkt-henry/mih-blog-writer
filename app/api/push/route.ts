import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guards";
import { supabaseAdmin } from "@/lib/supabase";

// 이 기기의 푸시 구독을 등록·해제한다. 알림이 쌓이면(mih_alerts) Supabase 함수 send-push 가 여기 등록된 기기에 보낸다.

type SubscriptionJson = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  if (g.perms.keywordOnly) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sub = (await req.json().catch(() => ({}))) as SubscriptionJson;
  const endpoint = sub.endpoint?.trim();
  if (!endpoint || !/^https:\/\//.test(endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const { error } = await supabaseAdmin()
    .from("mih_push_subscriptions")
    .upsert(
      {
        endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_id: g.user.id,
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      },
      { onConflict: "endpoint" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  const { error } = await supabaseAdmin().from("mih_push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
