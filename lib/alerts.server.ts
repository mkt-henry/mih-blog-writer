// 사이트 알림(mih_alerts) 쓰기 — 서버(Vercel 함수)에서 Discord 로 보내는 것과 같은 본문을 사이트에도 남긴다.
// 넣으면 DB 트리거가 앱을 설치한 기기에 푸시한다(supabase/migrations/20261017000000_app_alerts_push.sql).
//
// 사진은 Cloudflare R2(img.bp-studio.com)의 alerts/ 아래에 올리고 주소만 남긴다.
// R2_* 환경 변수가 없으면 사진 없이 글만 남긴다 — Supabase 저장소에는 올리지 않는다(전송량 한도, 2026-09-07 차단 사고).
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import type { AlertImage, AlertPayload } from "@/lib/alert-format";

export type AlertImageInput = { name: string; data: Uint8Array };

const R2_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;

function r2Ready(env: NodeJS.ProcessEnv = process.env): boolean {
  return R2_KEYS.every((k) => env[k]?.trim());
}

/** 휴대폰에서 읽을 만큼(가로 1080px) JPEG 로 줄여 R2 에 올리고 공개 주소를 돌려준다. */
async function uploadAlertImage(img: AlertImageInput): Promise<AlertImage> {
  const sharp = (await import("sharp")).default;
  const body = await sharp(img.data).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const key = `alerts/${day}/${randomUUID().slice(0, 8)}.jpg`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!, Key: key, Body: body, ContentType: "image/jpeg",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return { url: `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`, name: img.name };
}

export async function recordAlert(channel: string, payload: AlertPayload, images: AlertImageInput[] = []): Promise<void> {
  const uploaded: AlertImage[] = [];
  if (images.length > 0 && r2Ready()) {
    for (const img of images) uploaded.push(await uploadAlertImage(img));
  }
  const { error } = await supabaseAdmin().from("mih_alerts").insert({ channel, payload, images: uploaded });
  if (error) throw new Error(`사이트 알림 실패: ${error.message}`);
}
