import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  keyword?: string | null;
  category?: string | null;
  notes?: string | null;
  instagram?: string | null;
  agency?: string | null;
  published_url?: string | null;
  is_active?: boolean;
};

function canManageKeywords(perms: Awaited<ReturnType<typeof loadPermissions>>): boolean {
  return !perms.keywordOnly && (perms.isAdmin || Object.values(perms.agencies).some((r) => r === "editor"));
}

function nullableText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function requiredText(value: string | null | undefined, label: string): string | NextResponse {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: `${label}은(는) 비울 수 없습니다.` }, { status: 400 });
  }
  return trimmed;
}

function nullableUrl(value: string | null | undefined, label: string): string | NextResponse | null {
  const trimmed = nullableText(value);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
    return trimmed;
  } catch {
    return NextResponse.json({ error: `${label} 형식이 올바르지 않습니다.` }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const perms = await loadPermissions(session.id, session.username);
  if (!canManageKeywords(perms)) {
    return NextResponse.json({ error: "no edit permission" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if ("keyword" in body) {
    const value = requiredText(body.keyword, "키워드");
    if (value instanceof NextResponse) return value;
    update.keyword = value;
  }
  if ("category" in body) {
    const value = requiredText(body.category, "분류");
    if (value instanceof NextResponse) return value;
    update.category = value;
  }
  if ("notes" in body) update.notes = body.notes ?? "";
  if ("agency" in body) update.agency = nullableText(body.agency);
  if ("instagram" in body) {
    const value = nullableUrl(body.instagram, "인스타그램 URL");
    if (value instanceof NextResponse) return value;
    update.instagram = value;
  }
  if ("published_url" in body) {
    const value = nullableUrl(body.published_url, "발행 URL");
    if (value instanceof NextResponse) return value;
    update.published_url = value;
  }
  if ("is_active" in body) update.is_active = !!body.is_active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("keywords").update(update).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const perms = await loadPermissions(session.id, session.username);
  if (!canManageKeywords(perms)) {
    return NextResponse.json({ error: "no edit permission" }, { status: 403 });
  }

  const { id } = await params;
  const sb = supabaseAdmin();
  const { error } = await sb.from("keywords").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
