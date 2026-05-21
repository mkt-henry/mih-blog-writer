import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabase";
import { SESSION_COOKIE_NAME as COOKIE_NAME } from "./auth-constants";

export { SESSION_COOKIE_NAME } from "./auth-constants";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export type SessionUser = { id: string; username: string };

export async function createSession(userId: string, username: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const sb = supabaseAdmin();
  const { error } = await sb.from("app_sessions").insert({
    token,
    user_id: userId,
    expires_at: expiresAt,
  });
  if (error) throw error;

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  return token;
}

export async function verifySession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("app_sessions")
    .select("user_id, expires_at, app_users(username)")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  // Supabase JS join 결과는 객체 또는 배열일 수 있음
  const userJoin = data.app_users as { username?: string } | { username?: string }[] | null;
  const username = Array.isArray(userJoin) ? userJoin[0]?.username : userJoin?.username;
  if (!username) return null;
  return { id: data.user_id as string, username };
}

export async function verifySessionByToken(token: string): Promise<SessionUser | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("app_sessions")
    .select("user_id, expires_at, app_users(username)")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  const userJoin = data.app_users as { username?: string } | { username?: string }[] | null;
  const username = Array.isArray(userJoin) ? userJoin[0]?.username : userJoin?.username;
  if (!username) return null;
  return { id: data.user_id as string, username };
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    const sb = supabaseAdmin();
    await sb.from("app_sessions").delete().eq("token", token);
  }
  jar.delete(COOKIE_NAME);
}
