import {
  json,
  readAgencyConfig,
  saveAgencyConfig,
  uploadBusinessCardImage,
  requireAgencySlug,
  isValidHttpsUrl,
  withDerivedUrls
} from "../lib/agency.js";

export async function GET(request) {
  const slug = requireAgencySlug(request);
  if (!slug) return json({ error: "agency param required" }, { status: 400 });
  const config = await readAgencyConfig(slug, request);
  return json(config);
}

export async function PUT(request) {
  const slug = requireAgencySlug(request);
  if (!slug) return json({ error: "agency param required" }, { status: 400 });

  const current = await readAgencyConfig(slug, request);
  const body = await request.json();
  const next = {
    ...current,
    kakaoUrl: String(body.kakaoUrl || current.kakaoUrl).trim(),
    businessCardImageUrl: String(body.businessCardImageUrl || current.businessCardImageUrl).trim(),
    businessCardWidth: Number(body.businessCardWidth || current.businessCardWidth || 544),
    rssUrl: typeof body.rssUrl === "string" ? body.rssUrl.trim() : (current.rssUrl || "")
  };

  const validation = validateConfig(next);
  if (validation) return validation;

  const saved = await saveAgencyConfig(slug, next);
  return json(withDerivedUrls(saved, request));
}

export async function POST(request) {
  const slug = requireAgencySlug(request);
  if (!slug) return json({ error: "agency param required" }, { status: 400 });

  const current = await readAgencyConfig(slug, request);
  const form = await request.formData();
  const rssRaw = form.get("rssUrl");
  const next = {
    ...current,
    kakaoUrl: String(form.get("kakaoUrl") || current.kakaoUrl).trim(),
    businessCardImageUrl: String(form.get("businessCardImageUrl") || current.businessCardImageUrl).trim(),
    businessCardWidth: Number(form.get("businessCardWidth") || current.businessCardWidth || 544),
    rssUrl: typeof rssRaw === "string" ? rssRaw.trim() : (current.rssUrl || "")
  };

  const file = form.get("businessCardImage");
  if (file && file.size > 0) {
    const allowedTypes = new Set(["image/png", "image/jpeg"]);
    if (!allowedTypes.has(file.type)) {
      return json({ error: "Business card image must be a PNG or JPG file." }, { status: 400 });
    }
    if (file.size > 3 * 1024 * 1024) {
      return json({ error: "Business card image must be 3MB or smaller." }, { status: 400 });
    }
    next.businessCardImageUrl = await uploadBusinessCardImage(slug, file);
  }

  const validation = validateConfig(next);
  if (validation) return validation;

  const saved = await saveAgencyConfig(slug, next);
  return json(withDerivedUrls(saved, request));
}

function validateConfig(config) {
  if (!isValidHttpsUrl(config.kakaoUrl)) {
    return json({ error: "Open chat URL must start with https://." }, { status: 400 });
  }
  if (!String(config.kakaoUrl).startsWith("https://open.kakao.com/")) {
    return json({ error: "Open chat URL must be an open.kakao.com address." }, { status: 400 });
  }
  if (!isValidHttpsUrl(config.businessCardImageUrl)) {
    return json({ error: "Business card image URL must start with https://." }, { status: 400 });
  }
  if (!Number.isFinite(config.businessCardWidth) || config.businessCardWidth < 200 || config.businessCardWidth > 900) {
    return json({ error: "Business card image width must be a number between 200 and 900." }, { status: 400 });
  }
  if (config.rssUrl) {
    try {
      const u = new URL(config.rssUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        return json({ error: "RSS URL must start with http:// or https://." }, { status: 400 });
      }
    } catch {
      return json({ error: "RSS URL must be a valid URL." }, { status: 400 });
    }
  }
  return null;
}
