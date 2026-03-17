export type TargetLanguage = "en";

export type TargetMarket = "cross-border";

export type ListingTone = "conversion" | "neutral";

export type ListingGenerationSettings = {
  language: TargetLanguage;
  market: TargetMarket;
  tone: ListingTone;
};

export type ProductListingSource = {
  id?: string | null;
  title: string;
  descriptionHtml?: string | null;
  tags?: string[];
  seo?: { title?: string | null; description?: string | null } | null;
  imageUrl?: string | null;
};

export type ListingDraft = {
  title: string;
  descriptionHtml: string;
  bulletPoints: string[];
  tags: string[];
  seo: {
    title: string;
    description: string;
  };
  images: string[];
  meta: {
    providerId: string;
    settings: ListingGenerationSettings;
    version: number;
  };
};

export type ListingGenerationInput = {
  product: ProductListingSource;
  settings: ListingGenerationSettings;
};
