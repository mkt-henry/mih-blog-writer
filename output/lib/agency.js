import { get, put } from "@vercel/blob";

export const CONFIG_PATH = "agency/config.json";
export const CARD_PATH = "agency/business-card.png";

export const DEFAULT_CONFIG = {
  siteBaseUrl: "https://mih.bp-studio.com",
  kakaoUrl: "https://open.kakao.com/me/madeinheavenagency_",
  kakaoRedirectUrl: "https://mih.bp-studio.com/go/kakao",
  businessCardImageUrl:
    "https://postfiles.pstatic.net/MjAyNjA0MjdfMjI5/MDAxNzc3MjY2OTMwMzM5.HjuCB-YNAAUD_tnIQyO9WIFNJPbjiDBrov_5qJb1bxYg.90kjnoxkHHnq4KbABGhEFfw0utkF0axA9fq1qSu6Oq8g.PNG/image.png?type=w773",
  businessCardWidth: 544,
  updatedAt: null
};

export function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

export function getOrigin(request) {
  const configured = process.env.SITE_BASE_URL || DEFAULT_CONFIG.siteBaseUrl;
  try {
    return new URL(configured).origin;
  } catch {
    return new URL(request.url).origin;
  }
}

export function withDerivedUrls(config, request) {
  const origin = getOrigin(request);
  const businessCardPublicUrl = `${origin}/assets/agency-card.png`;
  const businessCardVersion = config.updatedAt
    ? String(Date.parse(config.updatedAt) || "").replace(/\D/g, "")
    : "";
  const businessCardHtmlUrl = businessCardVersion
    ? `${businessCardPublicUrl}?v=${businessCardVersion}`
    : businessCardPublicUrl;
  return {
    ...DEFAULT_CONFIG,
    ...config,
    siteBaseUrl: origin,
    kakaoRedirectUrl: `${origin}/go/kakao`,
    businessCardPublicUrl,
    businessCardHtmlUrl,
    businessCardHtml: `<p align="center"><img src="${businessCardHtmlUrl}" width="${config.businessCardWidth || DEFAULT_CONFIG.businessCardWidth}"></p>`
  };
}

async function readBlobText(pathname) {
  const blob = await get(pathname, {
    access: "public"
  });

  if (!blob) return null;
  if (blob.stream) return new Response(blob.stream).text();
  if (typeof blob.text === "function") return blob.text();
  if (blob.body) return new Response(blob.body).text();
  const url = blob.url || blob.blob?.url;
  if (url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return response.text();
  }
  return null;
}

export async function readAgencyConfig(request) {
  try {
    const text = await readBlobText(CONFIG_PATH);
    if (!text) return withDerivedUrls(DEFAULT_CONFIG, request);
    const parsed = JSON.parse(text);
    return withDerivedUrls(parsed, request);
  } catch {
    return withDerivedUrls(DEFAULT_CONFIG, request);
  }
}

export async function saveAgencyConfig(config) {
  const normalized = {
    ...DEFAULT_CONFIG,
    ...config,
    businessCardWidth: Number(config.businessCardWidth || DEFAULT_CONFIG.businessCardWidth),
    updatedAt: new Date().toISOString()
  };

  await put(CONFIG_PATH, JSON.stringify(normalized, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });

  return normalized;
}

export function isValidHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
