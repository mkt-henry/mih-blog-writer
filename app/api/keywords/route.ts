import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기존 keywords.json 1:1 스키마. UI 호환을 위해 camelCase로 변환해서 응답.
type KeywordRow = {
  id: string;
  keyword: string;
  category: string;
  notes: string | null;
  instagram: string | null;
  agency: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
};

type KeywordWire = {
  id: string;
  keyword: string;
  category: string;
  notes: string;
  instagram?: string;
  agency?: string;
  publishedUrl?: string;
  createdAt: string;
  updatedAt?: string;
};

function toWire(r: KeywordRow): KeywordWire {
  const w: KeywordWire = {
    id: r.id,
    keyword: r.keyword,
    category: r.category,
    notes: r.notes || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (r.instagram) w.instagram = r.instagram;
  if (r.agency) w.agency = r.agency;
  if (r.published_url) w.publishedUrl = r.published_url;
  return w;
}

function fromWire(w: KeywordWire): Omit<KeywordRow, "created_at" | "updated_at"> & {
  created_at: string;
  updated_at: string;
} {
  const now = new Date().toISOString();
  return {
    id: w.id,
    keyword: w.keyword,
    category: w.category,
    notes: w.notes ?? "",
    instagram: w.instagram ?? null,
    agency: w.agency ?? null,
    published_url: w.publishedUrl ?? null,
    created_at: w.createdAt || now,
    updated_at: w.updatedAt || w.createdAt || now,
  };
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("keywords")
    .select("*")
    .order("category", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data as KeywordRow[]).map(toWire));
}

// 기존 dev-server.js POST와 호환: 전체 배열을 받아 DB를 일치시킨다.
// DB의 ID 셋에서 incoming에 없는 것은 삭제, incoming은 전부 upsert.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "키워드는 배열이어야 합니다" }, { status: 400 });
  }

  for (let i = 0; i < body.length; i++) {
    const item = body[i] as KeywordWire;
    if (!item || typeof item !== "object")
      return NextResponse.json({ error: `[${i}] 객체여야 합니다` }, { status: 400 });
    if (!item.id) return NextResponse.json({ error: `[${i}] id 누락` }, { status: 400 });
    if (!item.keyword) return NextResponse.json({ error: `[${i}] keyword 누락` }, { status: 400 });
    if (!item.category) return NextResponse.json({ error: `[${i}] category 누락` }, { status: 400 });
  }

  const incoming = (body as KeywordWire[]).map(fromWire);
  const sb = supabaseAdmin();

  // 1) DB의 현재 ID 집합 조회
  const { data: existing, error: selErr } = await sb.from("keywords").select("id");
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  const incomingIds = new Set(incoming.map((k) => k.id));
  const toDelete = (existing as { id: string }[])
    .filter((r) => !incomingIds.has(r.id))
    .map((r) => r.id);

  // 2) 삭제할 ID들 처리
  if (toDelete.length > 0) {
    const { error } = await sb.from("keywords").delete().in("id", toDelete);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 3) 전부 upsert
  if (incoming.length > 0) {
    const { error } = await sb.from("keywords").upsert(incoming, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: incoming.length, deleted: toDelete.length });
}
