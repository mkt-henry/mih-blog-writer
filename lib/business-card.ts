import { AGENCIES, BUSINESS_CARD_LINK_URL, type AgencySlug } from "@/lib/agencies";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

export function buildBusinessCardHtml(agency: AgencySlug): string {
  const a = AGENCIES[agency];
  const img = `<img src="${a.businessCardImageUrl}" width="${a.businessCardWidth}">`;
  const linkUrl = BUSINESS_CARD_LINK_URL;
  const inner = linkUrl ? `<a href="${linkUrl}">${img}</a>` : img;
  return `<p align="center">${inner}</p>`;
}

export function mergeWithBusinessCard(originalHtml: string, cardHtml: string): string {
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
