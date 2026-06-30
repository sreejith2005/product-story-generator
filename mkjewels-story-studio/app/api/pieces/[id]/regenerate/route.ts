import { NextResponse } from "next/server";
import { getPiece, setPieceProcessing } from "@/lib/pieces";
import { generateDraftForPiece } from "@/lib/storyGeneration";

export const runtime = "nodejs";

type RegenerateRouteProps = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: RegenerateRouteProps) {
  const piece = await getPiece(params.id);

  if (!piece) {
    return NextResponse.json({ error: "Piece not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
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
  void generateDraftForPiece(piece.id).catch((error) => {
    console.error("Story regeneration failed", { pieceId: piece.id, error });
  });

  return NextResponse.json({ status: "processing" });
}
