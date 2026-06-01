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
    name: "메이드인헤븐 스피커",
    short: "mih_speaker",
    blogSlug: "mih_speaker",
    businessCardImageUrl:
      "https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/agency/mih_speaker/business-card.png",
    businessCardWidth: 544,
  },
  mih_casting: {
    name: "메이드인헤븐 캐스팅",
    short: "mih_casting",
    blogSlug: "mih_casting",
    businessCardImageUrl:
      "https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/agency/mih_casting/business-card.png",
    businessCardWidth: 544,
  },
  mih_agency: {
    name: "메이드인헤븐 에이전시",
    short: "mih_agency",
    blogSlug: "mih_agency",
    businessCardImageUrl:
      "https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/agency/mih_agency/business-card.png",
    businessCardWidth: 544,
  },
  other: {
    name: "other",
    short: "other",
    blogSlug: "kyh620303",
    businessCardImageUrl:
      "https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/agency/kyh620303/business-card.jpg",
    businessCardWidth: 544,
  },
};

export const AGENCY_SLUGS = Object.keys(AGENCIES) as AgencySlug[];

export const KAKAO_URL = "https://open.kakao.com/o/snG6VXti";
export const BUSINESS_CARD_LINK_URL = "tel:01054881456";

export function isAgencySlug(s: string): s is AgencySlug {
  return s in AGENCIES;
}
