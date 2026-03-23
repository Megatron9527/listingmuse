import type { ListingGenerationProvider } from "./provider";
import { HeuristicListingProvider } from "./providers/heuristic";
import { MiniMaxListingProvider, OpenAiListingProvider } from "./providers/openai";

export const getListingGenerationProvider = (): ListingGenerationProvider => {
  const provider = process.env.LISTINGMUSE_GENERATION_PROVIDER?.toLowerCase();
  const openAiBaseUrl = process.env.OPENAI_BASE_URL?.toLowerCase() || "";

  if (provider === "openai") return new OpenAiListingProvider();
  if (provider === "minimax") return new MiniMaxListingProvider();
  if (openAiBaseUrl.includes("minimax")) return new MiniMaxListingProvider();
  return new HeuristicListingProvider();
};

export * from "./types";
export * from "./provider";
