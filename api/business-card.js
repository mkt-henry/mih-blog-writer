import { readAgencyConfig } from "../lib/agency.js";

export async function GET(request) {
  const config = await readAgencyConfig(request);
  const image = await fetch(config.businessCardImageUrl, { cache: "no-store" });
  if (!image.ok) {
    return new Response("Business card image is unavailable.", { status: 502 });
  }

  return new Response(image.body, {
    status: 200,
    headers: {
      "content-type": image.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=60"
    }
  });
}
