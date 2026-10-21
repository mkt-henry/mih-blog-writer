"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHANNEL_LABELS, alertText, channelLabel, type Alert } from "@/lib/alert-format";
import { Content, CopyButton, Embed, kst } from "@/app/_components/DiscordMessage";

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
