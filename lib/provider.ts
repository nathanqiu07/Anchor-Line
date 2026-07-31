/**
 * Provider-agnostic message contract. Extraction is written against this shape so another
 * provider is an adapter rather than a rewrite of the pipeline. The field names follow the
 * Anthropic wire format because that is what the pipeline was built on; adapters translate
 * outward from it.
 */
export interface MessageRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: Array<{
    role: "user";
    content: string | Array<Record<string, unknown>>;
  }>;
}

export interface MessageResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
}

export interface MessagesClient {
  create(request: MessageRequest): Promise<MessageResponse>;
}

/**
 * The provider refused on quota, so the same request will fail again. Extraction must
 * surface this instead of spending its corrective retry on an exhausted quota.
 */
export class ExtractionQuotaError extends Error {
  readonly name = "ExtractionQuotaError";

  constructor(message = "Extraction provider quota exhausted") {
    super(message);
  }
}
