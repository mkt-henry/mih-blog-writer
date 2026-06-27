export type AgencyInfo = {
  name: string;
  short: string;
  blogSlug: string;
  businessCardImageUrl: string;
  businessCardWidth: number;
};

export type AgencySlug = "mih_speaker" | "mih_casting" | "mih_agency" | "other";

export const AGENCIES: Record<AgencySlug, AgencyInfo> = {
  mih_speaker: {
    name: "MIH Speaker",
    short: "mih_speaker",
    blogSlug: "mih_speaker",
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
    short: "other",
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
