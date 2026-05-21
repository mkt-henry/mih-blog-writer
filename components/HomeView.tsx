"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AGENCIES,
  AGENCY_SLUGS,
  type AgencySlug,
  BUSINESS_CARD_LINK_URL,
} from "@/lib/agencies";

export type ManuscriptSummary = {
  id: string;
  publish_date: string;
  agency: AgencySlug;
  slug: string;
  person_name: string;
  title: string;
  source_path: string | null;
};

type RssEntry = { items: { title: string; link: string }[]; error: string | null };

type Props = {
  manuscripts: ManuscriptSummary[];
  generatedAt: string;
};

function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

function buildBusinessCardHtml(agency: AgencySlug) {
  const a = AGENCIES[agency];
  const img = `<img src="${a.businessCardImageUrl}" width="${a.businessCardWidth}">`;
  const linkUrl = BUSINESS_CARD_LINK_URL;
  const inner = linkUrl ? `<a href="${linkUrl}">${img}</a>` : img;
  return `<p align="center">${inner}</p>`;
}

function mergeWithBusinessCard(originalHtml: string, cardHtml: string) {
  if (!cardHtml) return originalHtml;
  if (!originalHtml) return cardHtml;
  const m = originalHtml.match(/<a\s[^>]*href=["']https:\/\/open\.kakao\.com\//i);
  if (m && typeof m.index === "number") {
    const pStart = originalHtml.lastIndexOf("<p ", m.index);
    if (pStart !== -1) {
      return originalHtml.slice(0, pStart) + cardHtml + "\n" + originalHtml.slice(pStart);
    }
  }
  return `${originalHtml}\n${cardHtml}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

export default function HomeView({ manuscripts, generatedAt }: Props) {
  const [tab, setTab] = useState<"all" | AgencySlug>("all");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedHtml, setSelectedHtml] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [rss, setRss] = useState<Record<string, RssEntry> | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);

  // 탭 변경 시 달력 월 초기화 (해당 에이전시 최신 원고가 있는 달로)
  useEffect(() => {
    const list = tab === "all" ? manuscripts : manuscripts.filter((m) => m.agency === tab);
    const dates = list.map((m) => m.publish_date).sort();
    if (dates.length) {
      const latest = dates[dates.length - 1];
      setCalYear(parseInt(latest.slice(0, 4), 10));
      setCalMonth(parseInt(latest.slice(5, 7), 10) - 1);
    }
    setRangeStart(null);
    setRangeEnd(null);
    setSelectedId(null);
    setSelectedHtml(null);
  }, [tab, manuscripts]);

  // RSS 비동기 로드 (탭 카운트)
  useEffect(() => {
    fetch("/api/rss")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRss(d))
      .catch(() => {});
  }, []);

  // 선택된 원고 본문 로드
  useEffect(() => {
    if (!selectedId) {
      setSelectedHtml(null);
      return;
    }
    setLoadingHtml(true);
    let cancelled = false;
    fetch(`/api/manuscripts/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSelectedHtml(typeof d.html_content === "string" ? d.html_content : null);
      })
      .catch(() => {
        if (!cancelled) setSelectedHtml(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingHtml(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const todayObj = new Date();
  const todayStr = fmtDate(todayObj.getFullYear(), todayObj.getMonth() + 1, todayObj.getDate());

  function normRange() {
    if (!rangeStart) return { s: null as string | null, e: null as string | null };
    if (!rangeEnd) return { s: rangeStart, e: rangeStart };
    return rangeStart <= rangeEnd
      ? { s: rangeStart, e: rangeEnd }
      : { s: rangeEnd, e: rangeStart };
  }

  function dateMatches(date: string) {
    if (!rangeStart) return true;
    const { s, e } = normRange();
    return date >= (s as string) && date <= (e as string);
  }

  const filteredManuscripts = useMemo(
    () =>
      manuscripts.filter(
        (m) => (tab === "all" || m.agency === tab) && dateMatches(m.publish_date)
      ),
    [manuscripts, tab, rangeStart, rangeEnd]
  );

  const datesForCurrentAgency = useMemo(
    () => new Set((tab === "all" ? manuscripts : manuscripts.filter((m) => m.agency === tab)).map((m) => m.publish_date)),
    [manuscripts, tab]
  );

  const selected = useMemo(
    () => manuscripts.find((m) => m.id === selectedId) || null,
    [manuscripts, selectedId]
  );

  const previewSrcDoc = useMemo(() => {
    if (!selected) {
      return '<!doctype html><body style="font-family:sans-serif;padding:40px;color:#999;display:grid;place-items:center;height:100%;margin:0">왼쪽에서 원고를 선택하세요</body>';
    }
    if (loadingHtml || selectedHtml == null) {
      return '<!doctype html><body style="font-family:sans-serif;padding:40px;color:#999;display:grid;place-items:center;height:100%;margin:0">불러오는 중...</body>';
    }
    const card = buildBusinessCardHtml(selected.agency);
    const merged = mergeWithBusinessCard(selectedHtml, card);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
body { margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",Arial,sans-serif; color:#222; background:#fff; line-height:1.6; }
img { max-width:100%; height:auto; }
hr { border:none; border-top:1px solid #e0e0e0; margin:20px 0; }
</style></head><body>${merged}</body></html>`;
  }, [selected, selectedHtml, loadingHtml]);

  // ---- 달력 렌더 ----
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const { s: rs, e: re } = normRange();

  function onDayClick(dateStr: string) {
    if (!datesForCurrentAgency.has(dateStr)) return;
    if (!rangeStart || rangeEnd) {
      setRangeStart(dateStr);
      setRangeEnd(null);
    } else if (dateStr === rangeStart) {
      setRangeStart(null);
    } else {
      setRangeEnd(dateStr);
    }
    setSelectedId(null);
  }

  const tabCount = (slug: "all" | AgencySlug) => {
    const ms = slug === "all" ? manuscripts.length : manuscripts.filter((m) => m.agency === slug).length;
    if (slug === "all" || !rss) return `(${ms})`;
    const entry = rss[slug];
    const n = entry && !entry.error ? entry.items.length : null;
    return n == null ? `(${ms})` : `(${ms}/${n})`;
  };

  async function onCopyTitle() {
    if (!selected) return;
    setCopyState("preparing");
    const ok = await copyToClipboard(selected.title);
    setCopyState(ok ? "ok" : "fail");
    setTimeout(() => setCopyState(null), 1500);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gridTemplateRows: "100vh",
        background: "#f5f6f8",
        color: "#222",
      }}
    >
      <aside
        style={{
          background: "#fff",
          borderRight: "1px solid #e3e5ea",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px 8px", gap: 8 }}>
          <h1 style={{ fontSize: 16, margin: 0, flex: 1 }}>모아보기</h1>
          <a href="/keywords" style={linkChipStyle}>키워드 관리</a>
          <a href="/rss" style={linkChipStyle}>발행 현황</a>
          <form action="/api/auth/logout" method="POST" onSubmit={async (e) => {
            e.preventDefault();
            await fetch("/api/auth/logout", { method: "POST" });
            location.href = "/login";
          }}>
            <button type="submit" style={{ ...linkChipStyle, background: "none", border: "1px solid #d8dbe1", cursor: "pointer" }}>로그아웃</button>
          </form>
        </div>
        <div style={tabsStyle}>
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            전체 <span style={tabCtStyle}>{tabCount("all")}</span>
          </TabButton>
          {AGENCY_SLUGS.map((slug) => (
            <TabButton key={slug} active={tab === slug} onClick={() => setTab(slug)}>
              {AGENCIES[slug].blogSlug} <span style={tabCtStyle}>{tabCount(slug)}</span>
            </TabButton>
          ))}
        </div>

        <div style={{ padding: "10px 16px 12px", borderBottom: "1px solid #eef0f3" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#777", flex: 1 }}>기간 필터</span>
            <button
              onClick={() => {
                setRangeStart(null);
                setRangeEnd(null);
                setSelectedId(null);
              }}
              style={{
                fontSize: 11,
                color: "#1565C0",
                background: "none",
                border: "1px solid #c5d5ef",
                borderRadius: 4,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              전체
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <button onClick={() => { let y=calYear,m=calMonth-1; if(m<0){m=11;y--} setCalYear(y); setCalMonth(m); }} style={calArrowStyle}>‹</button>
            <span style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{calYear}년 {calMonth + 1}월</span>
            <button onClick={() => { let y=calYear,m=calMonth+1; if(m>11){m=0;y++} setCalYear(y); setCalMonth(m); }} style={calArrowStyle}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 1, marginBottom: 6 }}>
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <div key={d} style={{ fontSize: 10, color: "#aaa", textAlign: "center", padding: "3px 0 5px" }}>{d}</div>
            ))}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const dateStr = fmtDate(calYear, calMonth + 1, d);
              const hasData = datesForCurrentAgency.has(dateStr);
              const isStart = dateStr === rs;
              const isEnd = dateStr === re;
              const inRange = rs && re && dateStr > rs && dateStr < re;
              const isToday = dateStr === todayStr;
              return (
                <div
                  key={d}
                  onClick={() => onDayClick(dateStr)}
                  style={{
                    fontSize: 12,
                    textAlign: "center",
                    padding: "5px 0",
                    cursor: hasData ? "pointer" : "default",
                    color: isStart || isEnd ? "#fff" : !hasData ? "#d0d0d0" : isToday ? "#1565C0" : inRange ? "#1a3a6b" : "#333",
                    fontWeight: isStart || isEnd || isToday ? 600 : 400,
                    background: isStart || isEnd ? "#1565C0" : inRange ? "#dce8fa" : "transparent",
                    borderRadius: isStart && !isEnd ? "4px 0 0 4px" : isEnd && !isStart ? "0 4px 4px 0" : 4,
                  }}
                >
                  {d}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "#888", textAlign: "center", minHeight: 14 }}>
            {!rangeStart ? "전체 일자" : !rangeEnd ? rangeStart : `${rs} ~ ${re}`}
          </div>
        </div>

        <div style={{ padding: "8px 20px", fontSize: 11, color: "#888", borderBottom: "1px solid #eef0f3" }}>
          {filteredManuscripts.length}개 원고 · {!rangeStart ? "전체 일자" : !rangeEnd ? rangeStart : `${rs} ~ ${re}`} · 데이터 {generatedAt.slice(0, 10)}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {filteredManuscripts.length === 0 && (
            <div style={{ padding: 40, color: "#999", fontSize: 14, textAlign: "center" }}>
              {!rangeStart ? "등록된 원고가 없습니다." : "선택한 기간에 해당하는 원고가 없습니다."}
            </div>
          )}
          {filteredManuscripts.map((item) => {
            const active = selectedId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  background: active ? "#e8f0fe" : "transparent",
                  padding: "10px 20px",
                  font: "inherit",
                  cursor: "pointer",
                  borderLeft: `3px solid ${active ? "#1565C0" : "transparent"}`,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{item.slug}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2, lineHeight: 1.4 }}>{item.title}</div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{item.publish_date}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <main style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <header
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #e3e5ea",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 14, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {selected ? selected.title : "왼쪽에서 원고를 선택하세요"}
            </h2>
            <div style={{ fontSize: 11, color: "#999", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {selected
                ? `${selected.agency} · ${selected.source_path || `${selected.publish_date}/${selected.agency}/${selected.slug}`}`
                : "발행 계정 탭을 누르고 원고를 클릭하면 미리보기가 나옵니다."}
            </div>
          </div>
          <button onClick={onCopyTitle} disabled={!selected} style={primaryBtn(selected !== null)}>
            {copyState === "ok" ? "복사됨" : copyState === "fail" ? "복사 실패" : copyState === "preparing" ? "준비 중..." : "제목 복사"}
          </button>
        </header>
        <iframe srcDoc={previewSrcDoc} sandbox="allow-same-origin" style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} />
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        padding: "6px 10px",
        border: `1px solid ${active ? "#1565C0" : "#d8dbe1"}`,
        background: active ? "#1565C0" : "#fff",
        color: active ? "#fff" : "#444",
        borderRadius: 6,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const tabsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  padding: "0 16px 12px",
  borderBottom: "1px solid #eef0f3",
};

const tabCtStyle: React.CSSProperties = { color: "#999", fontWeight: 500 };

const linkChipStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textDecoration: "none",
  padding: "3px 8px",
  border: "1px solid #d8dbe1",
  borderRadius: 5,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const calArrowStyle: React.CSSProperties = {
  background: "none",
  border: 0,
  fontSize: 16,
  cursor: "pointer",
  color: "#555",
  padding: "2px 8px",
  borderRadius: 4,
  lineHeight: 1.4,
};

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    border: `1px solid ${enabled ? "#1565C0" : "#d6d8de"}`,
    background: enabled ? "#1565C0" : "#d6d8de",
    color: "#fff",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    flexShrink: 0,
  };
}
