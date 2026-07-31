import {
  ExtractionQuotaError,
  type MessageRequest,
  type MessageResponse,
  type MessagesClient,
} from "./provider";

/**
 * Gemini adapter over the REST generateContent endpoint. Called through fetch rather
 * than the vendor SDK to avoid adding a dependency for one request shape.
 */
const GENERATE_CONTENT_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

const maxErrorDetailChars = 300;

type FetchImplementation = typeof fetch;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponseBody {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
}

function truncateDetail(detail: string): string {
  const collapsed = detail.replace(/\s+/g, " ").trim();
  return collapsed.length > maxErrorDetailChars
    ? `${collapsed.slice(0, maxErrorDetailChars)}…`
    : collapsed;
}

/** Translates one Anthropic-shaped content block into its Gemini equivalent. */
function toPart(block: Record<string, unknown>): GeminiPart {
  if (block.type === "text" && typeof block.text === "string") {
    return { text: block.text };
  }

  const source = block.source as { media_type?: unknown; data?: unknown } | undefined;
  const isAttachment = block.type === "image" || block.type === "document";
  if (isAttachment && typeof source?.data === "string" && typeof source.media_type === "string") {
    return { inlineData: { mimeType: source.media_type, data: source.data } };
  }

  throw new Error(
    `Gemini adapter cannot translate content block of type ${JSON.stringify(block.type)}`,
  );
}

function toParts(content: MessageRequest["messages"][number]["content"]): GeminiPart[] {
  return typeof content === "string" ? [{ text: content }] : content.map(toPart);
}

/**
 * Only STOP means the model finished on its own. Every other reason is passed through
 * verbatim so the caller's incomplete-response error names the actual cause.
 */
function toStopReason(finishReason: string | undefined): string | null {
  if (finishReason === undefined) return null;
  return finishReason === "STOP" ? "end_turn" : finishReason;
}

async function requestFailure(response: Response, model: string): Promise<Error> {
  const detail = truncateDetail(await response.text().catch(() => ""));

  if (response.status === 429) {
    return new ExtractionQuotaError(
      `Gemini quota exhausted for ${model}: ${detail}`,
    );
  }
  // A wrong or unavailable model id is the most likely misconfiguration, and the raw
  // 403/404 gives no hint about which env var to change.
  if (response.status === 403 || response.status === 404) {
    return new Error(
      `Gemini rejected model ${model} (HTTP ${response.status}). Set EXTRACTION_MODEL to a model your key can use: ${detail}`,
    );
  }
  return new Error(`Gemini request failed (HTTP ${response.status}): ${detail}`);
}

export function createGeminiClient(
  apiKey: string,
  fetchImplementation: FetchImplementation = fetch,
): MessagesClient {
  return {
    async create(request: MessageRequest): Promise<MessageResponse> {
      const response = await fetchImplementation(
        `${GENERATE_CONTENT_ENDPOINT}/${encodeURIComponent(request.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: request.messages.map((message) => ({
              role: message.role,
              parts: toParts(message.content),
            })),
            generationConfig: {
              maxOutputTokens: request.max_tokens,
              ...(request.temperature === undefined
                ? {}
                : { temperature: request.temperature }),
            },
          }),
        },
      );

      if (!response.ok) throw await requestFailure(response, request.model);

      const body = (await response.json()) as GeminiResponseBody;
      const candidate = body.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      return {
        content: parts
          .filter((part): part is { text: string } => typeof part.text === "string")
          .map((part) => ({ type: "text", text: part.text })),
        stop_reason: toStopReason(candidate?.finishReason),
      };
    },
  };
}
