import { generateJewelryStory } from "@/lib/ai/generateJewelryStory";
import type { KnownJewelryAttributes } from "@/lib/guidedAttributes";
import { getPiece, setPieceGenerationError, setPieceProcessing, setPieceReady } from "@/lib/pieces";

const generationTimeoutMs = 45_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Story generation timed out. Try regenerating."));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export function generationErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message;

    if (/timed out/i.test(message)) {
      return "Story generation took too long. Try regenerating.";
    }

    if (/Rate limit reached on AI API/i.test(message)) {
      return "Rate limit reached on AI API. Wait a moment and retry.";
    }

    if (/Invalid or missing OpenAI API key/i.test(message) || /OPENAI_API_KEY/.test(message)) {
      return "Invalid or missing OpenAI API key. Check your OPENAI_API_KEY env var.";
    }

    if (/OpenAI quota exceeded/i.test(message)) {
      return "OpenAI quota exceeded. Check your billing at platform.openai.com.";
    }

    if (/AI service temporarily unavailable/i.test(message)) {
      return "AI service temporarily unavailable. Retry in a few minutes.";
    }

    if (error instanceof SyntaxError || /MalformedJsonError|JSON|unreadable|no text|schema/i.test(`${error.name} ${message}`)) {
      return "AI returned an unreadable response. Try regenerating.";
    }

    if (/fetch failed|network|ECONN|ENOTFOUND|ETIMEDOUT|Could not reach/i.test(message)) {
      return "Could not reach AI service. Check internet connection.";
    }

    return `Unexpected error: ${message}`.slice(0, 500);
  }

  return "Unexpected error: Story generation failed.";
}

export async function generateDraftForPiece(
  id: string,
  knownAttributes?: KnownJewelryAttributes,
  staffNotes?: string
): Promise<void> {
  const piece = await getPiece(id);

  if (!piece) {
    throw new Error("Piece not found.");
  }

  await setPieceProcessing(id);

  try {
    const story = await withTimeout(generateJewelryStory(piece.image_url, knownAttributes, staffNotes), generationTimeoutMs);
    await setPieceReady(id, story);
  } catch (error) {
    await setPieceGenerationError(id, generationErrorMessage(error));
  }
}
