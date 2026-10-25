import { describe, expect, it } from "vitest";
import { isAndroid, secretAppIntent, serpPath } from "@/lib/secret-app";

describe("secret app links", () => {
  it("encodes the keyword and post for the /serp fallback", () => {
    expect(serpPath("김진주 섭외", "https://blog.naver.com/mih_agency/1")).toBe(
      "/serp?q=%EA%B9%80%EC%A7%84%EC%A3%BC%20%EC%84%AD%EC%99%B8&post=https%3A%2F%2Fblog.naver.com%2Fmih_agency%2F1",
    );
    expect(serpPath("a&b")).toBe("/serp?q=a%26b");
  });

  it("builds a Chrome intent that targets the app and falls back to /serp", () => {
    const url = secretAppIntent("민서 섭외", "https://blog.naver.com/mih_agency/2", "https://mih.bp-studio.com");
    expect(url.startsWith("intent://search?q=%EB%AF%BC%EC%84%9C%20%EC%84%AD%EC%99%B8&post=")).toBe(true);
    expect(url).toContain("#Intent;scheme=mihsecret;package=com.bpstudio.mih.secret;");
    // The fallback is URL-encoded once so ';' and '&' inside it cannot break the intent fields.
    const fallback = decodeURIComponent(url.match(/S\.browser_fallback_url=([^;]+);end$/)![1]);
    expect(fallback).toBe(`https://mih.bp-studio.com${serpPath("민서 섭외", "https://blog.naver.com/mih_agency/2")}`);
  });

  it("detects Android user agents only", () => {
    expect(isAndroid("Mozilla/5.0 (Linux; Android 14; SM-F956N) AppleWebKit/537.36")).toBe(true);
    expect(isAndroid("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(false);
    expect(isAndroid("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});
