import type { ListingGenerationProvider } from "../provider";
import type {
  ListingDraft,
  ListingGenerationInput,
  ListingGenerationSettings,
  ProductListingSource,
} from "../types";

const PROVIDER_ID = "heuristic-v1";
const DRAFT_VERSION = 1;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
  "your",
]);

const decodeHtmlEntities = (input: string) => {
  return input
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
};

const stripHtmlToText = (html: string) => {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<\s*\/h\d\s*>/gi, "\n")
    .replace(/<\s*li\s*>/gi, "- ")
    .replace(/<\s*\/li\s*>/gi, "\n");

  const noTags = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(noTags);
  return decoded
    .replace(/[\t\r]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const cleanupTitle = (title: string) => {
  let t = title
    .replace(/\s+/g, " ")
    .replace(/\[[^\]]{0,40}\]/g, " ")
    .replace(/\([^)]{0,40}\)/g, " ")
    .replace(/\b(202\d|new|hot|sale|best\s*seller|bestseller)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!t) t = title.trim();
  return t;
};

const titleCase = (input: string) => {
  const lower = input.toLowerCase();
  const small = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
  ]);
  return lower
    .split(/\s+/)
    .map((w, i) => {
      if (!w) return w;
      if (i !== 0 && small.has(w)) return w;
      return w[0]?.toUpperCase() + w.slice(1);
    })
    .join(" ");
};

const truncateAtWord = (input: string, max: number) => {
  if (input.length <= max) return input;
  const sliced = input.slice(0, max + 1);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace < Math.max(20, max - 20)) return input.slice(0, max).trim();
  return sliced.slice(0, lastSpace).trim();
};

const tokenize = (input: string) => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
};

const uniq = <T>(items: T[]) => {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it)) continue;
    seen.add(it);
    out.push(it);
  }
  return out;
};

const normalizeTag = (tag: string) => {
  const cleaned = tag.replaceAll(",", " ").replace(/\s+/g, " ").trim();
  return cleaned;
};

const isBannedTag = (tag: string) => {
  const t = tag.toLowerCase();
  return t.includes("listingmuse") || t.includes("generated") || t === "demo";
};

const suggestBullets = (
  product: ProductListingSource,
  settings: ListingGenerationSettings,
) => {
  const rawText = product.descriptionHtml
    ? stripHtmlToText(product.descriptionHtml)
    : "";

  const corpus = [product.title, ...(product.tags ?? []), rawText].join(" ");
  const tokens = tokenize(corpus);
  const freq = new Map<string, number>();
  for (const tok of tokens) {
    freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }

  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .filter((t) => t.length >= 4)
    .slice(0, 8);

  const generic = settings.tone === "conversion";
  const bullets: string[] = [];

  if (generic) {
    bullets.push("Clear, shopper-friendly product details");
  }

  if (top.length) {
    bullets.push(`Keywords shoppers search: ${top.slice(0, 3).join(", ")}`);
  }

  if (rawText) {
    const firstSentence = rawText.split(/(?<=[.!?])\s+/)[0] ?? "";
    const trimmed = truncateAtWord(firstSentence, 90);
    if (trimmed && trimmed.length >= 30) {
      bullets.push(trimmed.replace(/\s+/g, " "));
    }
  }

  bullets.push("Optimized for independent Shopify stores selling cross-border");
  bullets.push("Easy to edit tone, claims, and sizing before publishing");

  return uniq(bullets)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6);
};

const suggestTags = (product: ProductListingSource) => {
  const base = (product.tags ?? [])
    .map(normalizeTag)
    .filter(Boolean)
    .filter((t) => !isBannedTag(t));

  const rawText = product.descriptionHtml
    ? stripHtmlToText(product.descriptionHtml)
    : "";
  const corpus = [product.title, ...base, rawText].join(" ");
  const tokens = tokenize(corpus);

  const freq = new Map<string, number>();
  for (const tok of tokens) {
    freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }

  const suggested = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .filter((t) => t.length >= 4)
    .slice(0, 10)
    .map((t) => titleCase(t));

  const combined = uniq([...base, ...suggested]).filter((t) => !isBannedTag(t));
  return combined.slice(0, 15);
};

const buildOneLiner = (
  title: string,
  product: ProductListingSource,
  settings: ListingGenerationSettings,
) => {
  const rawText = product.descriptionHtml
    ? stripHtmlToText(product.descriptionHtml)
    : "";
  const first = rawText.split(/(?<=[.!?])\s+/)[0] ?? "";
  if (first && first.length >= 40) {
    return truncateAtWord(first, 160);
  }

  const base =
    settings.tone === "conversion"
      ? `A cleaner, more shopper-ready listing for ${title}.`
      : `Updated listing draft for ${title}.`;
  return base;
};

const buildDescriptionHtml = (
  title: string,
  bullets: string[],
  oneLiner: string,
) => {
  const safeTitle = title.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const li = bullets
    .map((b) => b.replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
    .map((b) => `<li>${b}</li>`)
    .join("");

  return [
    `<p><strong>${safeTitle}</strong></p>`,
    `<p>${oneLiner}</p>`,
    `<h2>Highlights</h2>`,
    `<ul>${li}</ul>`,
    `<h2>Notes</h2>`,
    `<p>Details like color, fit, and measurements can vary. If you have questions, message us before ordering.</p>`,
  ].join("\n");
};

const buildSeo = (title: string, oneLiner: string) => {
  const seoTitle = truncateAtWord(title, 60);
  const seoDesc = truncateAtWord(oneLiner, 155);
  return {
    title: seoTitle,
    description: seoDesc,
  };
};

export class HeuristicListingProvider implements ListingGenerationProvider {
  id = PROVIDER_ID;

  async generate(input: ListingGenerationInput): Promise<ListingDraft> {
    const cleanedTitle = titleCase(cleanupTitle(input.product.title));
    const bullets = suggestBullets(input.product, input.settings);
    const tags = suggestTags(input.product);
    const oneLiner = buildOneLiner(cleanedTitle, input.product, input.settings);
    const descriptionHtml = buildDescriptionHtml(
      cleanedTitle,
      bullets,
      oneLiner,
    );
    const seo = buildSeo(cleanedTitle, oneLiner);

    const images = input.product.imageUrl ? [input.product.imageUrl] : [];

    return {
      title: cleanedTitle,
      descriptionHtml,
      bulletPoints: bullets,
      tags,
      seo,
      images,
      meta: {
        providerId: PROVIDER_ID,
        settings: input.settings,
        version: DRAFT_VERSION,
      },
    };
  }
}
