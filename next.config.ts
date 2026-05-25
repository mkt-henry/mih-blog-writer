import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default config;
