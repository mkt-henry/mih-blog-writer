import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/cron/naver-search-screenshots": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default config;
