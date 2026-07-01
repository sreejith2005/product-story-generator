import { generateJewelryStory } from "@/lib/ai/generateJewelryStory";
import type { KnownJewelryAttributes } from "@/lib/guidedAttributes";
import { getPiece, setPieceGenerationError, setPieceProcessing, setPieceReady } from "@/lib/pieces";

export function generationErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message;

    if (/Gemini request failed with 429/.test(message)) {
      return "Rate limit reached on AI API. Wait a moment and retry.";
    }

    if (/Gemini request failed with (401|403)/.test(message) || /GEMINI_API_KEY/.test(message)) {
      return "Invalid or missing Gemini API key. Check your GEMINI_API_KEY env var.";
    }

    if (/Gemini request failed with (500|503)/.test(message)) {
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
    const story = await generateJewelryStory(piece.image_url, knownAttributes, staffNotes);
    await setPieceReady(id, story);
  } catch (error) {
    await setPieceGenerationError(id, generationErrorMessage(error));
  }
}
