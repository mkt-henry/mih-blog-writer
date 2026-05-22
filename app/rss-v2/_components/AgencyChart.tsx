"use client";

import type { DailyBucket } from "@/lib/rss-stats";

type Props = { daily: DailyBucket[] };

const COLORS = {
  mih_speaker: "#1565C0",
  mih_casting: "#7B1FA2",
  mih_agency: "#2E7D32",
};

export default function AgencyChart({ daily }: Props) {
  if (daily.length === 0) return <div className="text-xs text-gray-400">데이터 없음</div>;

  const max = Math.max(10, ...daily.map((d) => d.mih_speaker + d.mih_casting + d.mih_agency));
  const W = 800;
  const H = 200;
  const PAD = { top: 10, right: 10, bottom: 24, left: 30 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const bw = innerW / daily.length;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0, max / 2, max].map((v) => {
          const y = PAD.top + innerH - (v / max) * innerH;
          return (
            <g key={v}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#eef0f3" />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="10" fill="#aaa">{Math.round(v)}</text>
            </g>
          );
        })}
        {daily.map((d, i) => {
          const x = PAD.left + i * bw + bw * 0.15;
          const w = bw * 0.7;
          const total = d.mih_speaker + d.mih_casting + d.mih_agency;
          if (total === 0) return null;
          const speakerH = (d.mih_speaker / max) * innerH;
          const castingH = (d.mih_casting / max) * innerH;
          const agencyH = (d.mih_agency / max) * innerH;
          const speakerY = PAD.top + innerH - speakerH;
          const castingY = speakerY - castingH;
          const agencyY = castingY - agencyH;
          return (
            <g key={d.date}>
              <rect x={x} y={agencyY} width={w} height={agencyH} fill={COLORS.mih_agency} />
              <rect x={x} y={castingY} width={w} height={castingH} fill={COLORS.mih_casting} />
              <rect x={x} y={speakerY} width={w} height={speakerH} fill={COLORS.mih_speaker} />
            </g>
          );
        })}
        {daily.map((d, i) => {
          if (i % Math.ceil(daily.length / 14) !== 0) return null;
          const x = PAD.left + i * bw + bw / 2;
          const label = d.date.slice(5);
          return <text key={d.date} x={x} y={H - 8} textAnchor="middle" fontSize="9" fill="#aaa">{label}</text>;
        })}
      </svg>
      <div className="flex gap-3 text-[10px] text-gray-600 justify-center mt-1">
        {(["mih_speaker", "mih_casting", "mih_agency"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS[k] }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
