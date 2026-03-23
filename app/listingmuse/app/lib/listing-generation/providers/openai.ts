import type { ListingGenerationProvider } from "../provider";
import type { ListingDraft, ListingGenerationInput } from "../types";

const DRAFT_VERSION = 1;

const stripHtml = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const buildPrompt = (input: ListingGenerationInput) => {
  const descriptionText = stripHtml(input.product.descriptionHtml);
  return `You are an e-commerce listing editor for Shopify stores selling cross-border in English.
Return ONLY valid JSON, with no markdown fences and no commentary.

Required JSON schema:
{
  "title": string,
  "descriptionHtml": string,
  "bulletPoints": string[],
  "tags": string[],
  "seo": {
    "title": string,
    "description": string
  },
  "images": string[]
}

Rules:
- Output language: English
- Tone: ${input.settings.tone}
- Market: ${input.settings.market}
- Keep title concise and commercial
- descriptionHtml must be clean Shopify-safe HTML using <p>, <h2>, <ul>, <li>
- bulletPoints: 3 to 6 items
- tags: 3 to 12 concise tags
- seo.title <= 60 chars when possible
- seo.description <= 155 chars when possible
- Do not invent hard claims, certifications, materials, dimensions, or guarantees not supported by input
- If source data is weak, write conservative, broadly useful copy

Product input:
${JSON.stringify(
    {
      title: input.product.title,
      descriptionText,
      tags: input.product.tags ?? [],
      seo: input.product.seo ?? null,
      imageUrl: input.product.imageUrl ?? null,
    },
    null,
    2,
  )}`;
};

const parseListingDraft = (
  raw: unknown,
  providerId: string,
  settings: ListingGenerationInput["settings"],
): ListingDraft => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Model returned invalid JSON payload");
  }

  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const descriptionHtml = typeof obj.descriptionHtml === "string" ? obj.descriptionHtml.trim() : "";
  const bulletPoints = Array.isArray(obj.bulletPoints)
    ? obj.bulletPoints.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : [];
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : [];
  const images = Array.isArray(obj.images)
    ? obj.images.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : [];
  const seoObj = obj.seo && typeof obj.seo === "object" && !Array.isArray(obj.seo) ? obj.seo as Record<string, unknown> : {};
  const seoTitle = typeof seoObj.title === "string" ? seoObj.title.trim() : "";
  const seoDescription = typeof seoObj.description === "string" ? seoObj.description.trim() : "";

  if (!title || !descriptionHtml) {
    throw new Error("Model response is missing title or descriptionHtml");
  }

  return {
    title,
    descriptionHtml,
    bulletPoints,
    tags,
    seo: {
      title: seoTitle,
      description: seoDescription,
    },
    images,
    meta: {
      providerId,
      settings,
      version: DRAFT_VERSION,
    },
  };
};

export class OpenAiListingProvider implements ListingGenerationProvider {
  id = "openai-v1";

  async generate(input: ListingGenerationInput): Promise<ListingDraft> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    if (!apiKey) {
      throw new Error("OpenAI provider not configured: missing OPENAI_API_KEY");
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You produce structured Shopify listing drafts as strict JSON.",
          },
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI response did not include content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("OpenAI response was not valid JSON");
    }

    return parseListingDraft(parsed, this.id, input.settings);
  }
}

export class MiniMaxListingProvider implements ListingGenerationProvider {
  id = "minimax-v1";

  async generate(input: ListingGenerationInput): Promise<ListingDraft> {
    const apiKey = process.env.MINIMAX_API_KEY;
    const model = process.env.MINIMAX_MODEL || "MiniMax-Text-01";
    const baseUrl = process.env.MINIMAX_BASE_URL;

    if (!apiKey) {
      throw new Error("MiniMax provider not configured: missing MINIMAX_API_KEY");
    }
    if (!baseUrl) {
      throw new Error("MiniMax provider not configured: missing MINIMAX_BASE_URL");
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You produce structured Shopify listing drafts as strict JSON.",
          },
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MiniMax request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("MiniMax response did not include content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("MiniMax response was not valid JSON");
    }

    return parseListingDraft(parsed, this.id, input.settings);
  }
}
