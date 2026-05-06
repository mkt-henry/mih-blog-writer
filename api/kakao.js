import { readAgencyConfig } from "../lib/agency.js";

export async function GET(request) {
  const config = await readAgencyConfig(request);
  return Response.redirect(config.kakaoUrl, 302);
}
