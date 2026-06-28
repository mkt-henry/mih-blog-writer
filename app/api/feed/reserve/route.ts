import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 계정별 공개 피드(AccountFeed)에서 "발행 예약 완료(숨김)" 체크박스를 토글한다.
// 피드 자체가 인증 없는 공개 페이지(OpenClaw 발행용)이므로 이 라우트도 공개다.
// reserved_at은 되돌릴 수 있는 저위험 플래그라 공개 토글을 허용한다.
//   reserved=true  → reserved_at = now()  (피드에서 숨김)
//   reserved=false → reserved_at = null   (다시 노출)
type Body = { id?: string; reserved?: boolean };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const reserved = body.reserved === true;

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("articles")
    .update({ reserved_at: reserved ? new Date().toISOString() : null })
    .eq("id", id)
    .is("published_at", null); // 이미 발행된 원고는 건드리지 않음

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, reserved });
}
