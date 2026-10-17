"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { copyPlain } from "@/lib/clipboard";
import {
  CHANNEL_LABELS,
  alertText,
  channelLabel,
  embedColor,
  segments,
  stripMarkdown,
  type Alert,
  type AlertEmbed,
} from "@/lib/alert-format";

// 서버와 브라우저의 날짜 표기(ICU)가 달라 화면이 어긋나지 않게 직접 만든다: "10/17 09:25" (한국 시간)
const kst = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

function CopyButton({ text, label, small }: { text: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await copyPlain(text);
      setDone(true);
      toast.success("복사했습니다");
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error("복사하지 못했습니다");
    }
  }
  const Icon = done ? Check : Copy;
  if (small) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={label ?? "복사"}
        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <Icon className="h-3.5 w-3.5" />
      {done ? "복사됨" : (label ?? "복사")}
    </button>
  );
}

/** Discord 마크다운 한 줄: **굵게**, `코드`, 주소 링크. */
function Line({ text }: { text: string }) {
  if (!text) return <br />;
  return (
    <div className="whitespace-pre-wrap break-all">
      {segments(text).map((s, i) =>
        s.kind === "bold" ? (
          <strong key={i}>{s.text}</strong>
        ) : s.kind === "code" ? (
          <code key={i} className="rounded bg-gray-100 px-1 py-px text-[0.85em]">
            {s.text}
          </code>
        ) : s.kind === "link" ? (
          <a key={i} href={s.text} target="_blank" rel="noreferrer" className="text-[#00A8FC] hover:underline">
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((l, i) => (
        <Line key={i} text={l} />
      ))}
    </>
  );
}

/** 본문(content). 빈 줄로 나뉜 덩어리가 여럿이면(예: "키워드 섭외\n주소") 덩어리마다 복사 버튼을 단다. */
function Content({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  if (blocks.length < 3) return <Markdown text={text} />;
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={i} className="group flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <Markdown text={b} />
          </div>
          {i > 0 && <CopyButton text={stripMarkdown(b)} label="이 항목 복사" small />}
        </div>
      ))}
    </div>
  );
}

function Embed({ e }: { e: AlertEmbed }) {
  return (
    <div
      className="mt-1 max-w-full rounded border-l-4 bg-[#F2F3F5] px-3 py-2"
      style={{ borderLeftColor: embedColor(e.color) }}
    >
      {e.title &&
        (e.url ? (
          <a href={e.url} target="_blank" rel="noreferrer" className="font-semibold text-[#0068E0] hover:underline">
            {e.title}
          </a>
        ) : (
          <div className="font-semibold">{e.title}</div>
        ))}
      {e.description && (
        <div className="mt-1 text-sm">
          <Markdown text={e.description} />
        </div>
      )}
      {e.fields && e.fields.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
          {e.fields.map((f, i) => (
            <div key={i} className={f.inline ? "col-span-1 min-w-0" : "col-span-3 min-w-0"}>
              <div className="flex items-center gap-1 text-xs font-semibold text-gray-700">
                <span className="min-w-0 break-keep">{f.name}</span>
                <CopyButton text={stripMarkdown(f.value)} label={`${f.name} 복사`} small />
              </div>
              <div className="text-sm">
                <Markdown text={f.value} />
              </div>
            </div>
          ))}
        </div>
      )}
      {(e.footer?.text || e.timestamp) && (
        <div className="mt-2 text-[11px] text-gray-500">
          {e.footer?.text}
          {e.footer?.text && e.timestamp ? " · " : ""}
          {e.timestamp ? kst(e.timestamp) : ""}
        </div>
      )}
    </div>
  );
}

export default function AlertList({ alerts, channel }: { alerts: Alert[]; channel: string | null }) {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    setHash(h);
    if (h) document.getElementById(h)?.scrollIntoView({ block: "center" });
  }, []);

  const tab = (c: string | null, label: string) => (
    <Link
      key={c ?? "all"}
      href={c ? `/alerts?c=${c}` : "/alerts"}
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
        channel === c ? "bg-[color:var(--color-primary)] text-white" : "bg-white text-gray-600 border border-gray-200"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {tab(null, "전체")}
        {Object.entries(CHANNEL_LABELS).map(([c, label]) => tab(c, label))}
      </div>

      {alerts.length === 0 && <p className="py-10 text-center text-sm text-gray-500">아직 받은 알림이 없습니다.</p>}

      <ul className="space-y-2">
        {alerts.map((a) => {
          const text = alertText(a.payload);
          return (
            <li
              key={a.id}
              id={`a${a.id}`}
              className={`rounded-lg border bg-white p-3 ${
                hash === `a${a.id}` ? "border-[color:var(--color-primary)] ring-2 ring-blue-100" : "border-gray-200"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-primary)] text-[10px] font-bold text-white">
                  MIH
                </div>
                <span className="text-sm font-semibold">{channelLabel(a.channel)}</span>
                <span className="text-xs text-gray-500">{kst(a.created_at)}</span>
                <div className="flex-1" />
                <CopyButton text={text} label="전체 복사" />
              </div>
              <div className="pl-9 text-sm leading-relaxed text-gray-900">
                {a.payload.content && <Content text={a.payload.content} />}
                {(a.payload.embeds ?? []).map((e, i) => (
                  <Embed key={i} e={e} />
                ))}
                {a.images?.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {a.images.map((img, i) => (
                      <a key={i} href={img.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.name ?? "알림 사진"}
                          loading="lazy"
                          className="w-full rounded border border-gray-200"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
