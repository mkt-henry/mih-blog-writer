import { put } from "@vercel/blob";
import {
  CARD_PATH,
  json,
  readAgencyConfig,
  saveAgencyConfig,
  isValidHttpsUrl,
  withDerivedUrls
} from "../lib/agency.js";

export async function GET(request) {
  const config = await readAgencyConfig(request);
  return json(config);
}

export async function PUT(request) {
  const current = await readAgencyConfig(request);
  const body = await request.json();
  const next = {
    ...current,
    kakaoUrl: String(body.kakaoUrl || current.kakaoUrl).trim(),
    businessCardImageUrl: String(body.businessCardImageUrl || current.businessCardImageUrl).trim(),
    businessCardWidth: Number(body.businessCardWidth || current.businessCardWidth || 544)
  };

  const validation = validateConfig(next);
  if (validation) return validation;

  const saved = await saveAgencyConfig(next);
  return json(withDerivedUrls(saved, request));
}

export async function POST(request) {
  const current = await readAgencyConfig(request);
  const form = await request.formData();
  const next = {
    ...current,
    kakaoUrl: String(form.get("kakaoUrl") || current.kakaoUrl).trim(),
    businessCardImageUrl: String(form.get("businessCardImageUrl") || current.businessCardImageUrl).trim(),
    businessCardWidth: Number(form.get("businessCardWidth") || current.businessCardWidth || 544)
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

    const blob = await put(CARD_PATH, file, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: file.type,
      cacheControlMaxAge: 60
    });
    next.businessCardImageUrl = blob.url;
  }

  const validation = validateConfig(next);
  if (validation) return validation;

  const saved = await saveAgencyConfig(next);
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
  return null;
}
