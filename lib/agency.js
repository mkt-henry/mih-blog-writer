import { put } from "@vercel/blob";
import { supabase } from "./db.js";

export const DEFAULT_CONFIG = {
  siteBaseUrl: "https://mih.bp-studio.com",
  kakaoUrl: "https://open.kakao.com/me/madeinheavenagency_",
  kakaoRedirectUrl: "https://mih.bp-studio.com/go/kakao",
  businessCardImageUrl: "",
  businessCardWidth: 544,
  updatedAt: null
};

export function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init.headers || {}) }
  });
}

export function getOrigin(request) {
  const configured = process.env.SITE_BASE_URL;
  if (configured) {
    try { return new URL(configured).origin; } catch {}
  }
  return new URL(request.url).origin;
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

export async function readAgencyConfig(slug, request) {
  try {
    const { data } = await supabase
      .from("agencies")
      .select("kakao_url, business_card_image_url, business_card_width, site_base_url, updated_at")
      .eq("slug", slug)
      .single();

    if (!data) return withDerivedUrls(DEFAULT_CONFIG, request);

    return withDerivedUrls(
      {
        kakaoUrl: data.kakao_url,
        businessCardImageUrl: data.business_card_image_url,
        businessCardWidth: data.business_card_width,
        siteBaseUrl: data.site_base_url || DEFAULT_CONFIG.siteBaseUrl,
        updatedAt: data.updated_at
      },
      request
    );
  } catch {
    return withDerivedUrls(DEFAULT_CONFIG, request);
  }
}

export async function saveAgencyConfig(slug, config) {
  const normalized = {
    ...DEFAULT_CONFIG,
    ...config,
    businessCardWidth: Number(config.businessCardWidth || DEFAULT_CONFIG.businessCardWidth),
    updatedAt: new Date().toISOString()
  };

  await supabase.from("agencies").update({
    kakao_url: normalized.kakaoUrl,
    business_card_image_url: normalized.businessCardImageUrl,
    business_card_width: normalized.businessCardWidth,
    updated_at: normalized.updatedAt
  }).eq("slug", slug);

  return normalized;
}

export async function uploadBusinessCardImage(slug, file) {
  const blob = await put(`agency/${slug}/business-card.png`, file, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: file.type,
    cacheControlMaxAge: 60
  });
  return blob.url;
}

export function isValidHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function requireAgencySlug(request) {
  const url = new URL(request.url);
  return (url.searchParams.get("agency") || "").trim();
}
