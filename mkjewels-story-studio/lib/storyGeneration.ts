import { generateJewelryStory } from "@/lib/ai/generateJewelryStory";
import { getPiece, setPieceDraft, setPieceGenerationError, setPieceProcessing } from "@/lib/pieces";

function generationErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Story generation failed.";
}

export async function generateDraftForPiece(id: string): Promise<void> {
  const piece = await getPiece(id);

  if (!piece) {
    throw new Error("Piece not found.");
  }

  await setPieceProcessing(id);

  try {
    const story = await generateJewelryStory(piece.image_url);
    await setPieceDraft(id, story);
  } catch (error) {
    await setPieceGenerationError(id, generationErrorMessage(error));
  }
}
