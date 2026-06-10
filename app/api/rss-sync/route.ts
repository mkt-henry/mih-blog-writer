import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "env missing" }, { status: 500 });
  }

  const projectRef = new URL(url).host.split(".")[0];
  const fnUrl = `https://${projectRef}.functions.supabase.co/rss-sync`;

  try {
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    let json: string;
    try {
      JSON.parse(body);
      json = body;
    } catch {
      json = JSON.stringify({ error: body || `HTTP ${res.status}` });
    }
    return new NextResponse(json, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
