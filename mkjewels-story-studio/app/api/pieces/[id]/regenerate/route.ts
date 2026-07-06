import { NextResponse } from "next/server";
import { databaseRouteError } from "@/lib/apiErrors";
import { cleanKnownAttributes, type KnownJewelryAttributes } from "@/lib/guidedAttributes";
import { getPiece, setPieceProcessing } from "@/lib/pieces";
import { generateDraftForPiece } from "@/lib/storyGeneration";

export const runtime = "nodejs";

type RegenerateRouteProps = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: RegenerateRouteProps) {
  try {
    const piece = await getPiece(params.id);

    if (!piece) {
      return NextResponse.json({ error: "Piece not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
      knownAttributes?: KnownJewelryAttributes;
      staffNotes?: string;
    };
    const requiresConfirmation = piece.is_edited === true || piece.status === "approved";

    if (requiresConfirmation && !body.force) {
      return NextResponse.json(
        {
          error: "This piece has been edited or approved. Confirm before overwriting the draft.",
          requiresConfirmation: true
        },
        { status: 409 }
      );
    }

    await setPieceProcessing(piece.id);
    void generateDraftForPiece(piece.id, cleanKnownAttributes(body.knownAttributes), body.staffNotes).catch((error) => {
      console.error("Story regeneration failed", { pieceId: piece.id, error });
    });

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("Could not start story regeneration", { pieceId: params.id, error });
    return databaseRouteError(error);
  }
}
