import type { ListingDraft, ListingGenerationInput } from "./types";

export interface ListingGenerationProvider {
  id: string;
  generate(input: ListingGenerationInput): Promise<ListingDraft>;
}
