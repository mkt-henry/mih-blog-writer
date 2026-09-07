export type AgencyInfo = {
  name: string;
  /** 대시보드 탭·배지·차트 범례에 쓰는 짧은 표시 이름. 내부 슬러그와 다를 수 있다. */
  short: string;
  blogSlug: string;
  businessCardImageUrl: string;
  businessCardWidth: number;
};

export type AgencySlug = "mih_speaker" | "mih_casting" | "mih_agency" | "other";

export const AGENCIES: Record<AgencySlug, AgencyInfo> = {
  // 표시 이름은 `influence`, 실제 발행 블로그 주소는 `gdfdhzgfgfhgdj` 다.
  // 내부 슬러그 `mih_speaker` 는 바꾸지 않는다 — articles.agency CHECK 제약, 과거 발행 331건,
  // keywords 3,008건, output/ 경로, 공개 피드 URL(/mih_speaker), 그리고 이미 배포된
  // 엣지 함수(rss-sync / discord-notify)가 전부 이 값에 묶여 있다.
  // 예전 발행 블로그 blog.naver.com/mih_speaker 는 2026-08-22 로 운영 종료했고
  // 검색 노출 집계에만 남긴다(lib/naver-search/exposure.ts).
  // 2026-09-07 부로 강연 전용이 아니라 일반 섭외 계정이다.
  mih_speaker: {
    name: "influence",
    short: "influence",
    blogSlug: "gdfdhzgfgfhgdj",
    businessCardImageUrl:
      "https://djtmniygzdbavxwrppxb.supabase.co/storage/v1/object/public/article-images/agency/mih_speaker/business-card.jpg",
    businessCardWidth: 544,
  },
  mih_casting: {
    name: "MIH Casting",
    short: "mih_casting",
    blogSlug: "mih_casting",
    businessCardImageUrl:
      "https://djtmniygzdbavxwrppxb.supabase.co/storage/v1/object/public/article-images/agency/mih_casting/business-card.jpg",
    businessCardWidth: 544,
  },
  mih_agency: {
    name: "MIH Agency",
    short: "mih_agency",
    blogSlug: "mih_agency",
    businessCardImageUrl:
      "https://djtmniygzdbavxwrppxb.supabase.co/storage/v1/object/public/article-images/agency/mih_agency/business-card.jpg",
    businessCardWidth: 544,
  },
  other: {
    name: "kyh620303",
    short: "kyh620303",
    blogSlug: "kyh620303",
    businessCardImageUrl:
      "https://djtmniygzdbavxwrppxb.supabase.co/storage/v1/object/public/article-images/agency/kyh620303/business-card.jpg",
    businessCardWidth: 544,
  },
};

export const AGENCY_SLUGS = Object.keys(AGENCIES) as AgencySlug[];

export const KAKAO_URL = "https://open.kakao.com/o/snG6VXti";
export const BUSINESS_CARD_LINK_URL = "tel:01054881456";

export function isAgencySlug(s: string): s is AgencySlug {
  return s in AGENCIES;
}
