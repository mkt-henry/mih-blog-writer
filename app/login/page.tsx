"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "로그인 실패");
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 24,
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--card-bg)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>메이드인헤븐 원고 관리</h1>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>아이디</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </label>
        {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "8px 12px",
            background: "var(--accent)",
            color: "var(--accent-fg)",
            border: 0,
            borderRadius: 6,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "확인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--fg)",
  fontSize: 14,
};
