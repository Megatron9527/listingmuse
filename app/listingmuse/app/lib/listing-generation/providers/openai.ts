import type { ListingGenerationProvider } from "../provider";
import type { ListingDraft, ListingGenerationInput } from "../types";

export class OpenAiListingProvider implements ListingGenerationProvider {
  id = "openai-v1";

  async generate(input: ListingGenerationInput): Promise<ListingDraft> {
    void input;
    throw new Error("OpenAI provider not configured");
  }
}
