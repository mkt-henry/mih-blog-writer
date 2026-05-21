import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const username = (body.username || "").trim();
  const password = body.password || "";
  if (!username || !password) {
    return NextResponse.json({ error: "아이디/비밀번호를 입력하세요" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: user, error } = await sb
    .from("app_users")
    .select("id, username, password")
    .eq("username", username)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  if (!user || user.password !== password) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다" }, { status: 401 });
  }

  await createSession(user.id, user.username);
  return NextResponse.json({ ok: true, username: user.username });
}
