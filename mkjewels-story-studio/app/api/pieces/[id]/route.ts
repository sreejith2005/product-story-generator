import { NextResponse } from "next/server";
import { approvePiece, getPiece, revertPieceToDraft, updatePieceDraft, type PieceStoryUpdate } from "@/lib/pieces";

export const runtime = "nodejs";

type PieceRouteProps = {
  params: {
    id: string;
  };
};

type PieceAction = "save-draft" | "approve" | "revert-to-draft";

type PieceUpdateBody = {
  action?: PieceAction;
  sku?: string | null;
  catalogRef?: string | null;
  attributes?: {
    category?: string;
    material?: string;
    motifs?: unknown;
    style?: string;
  };
  shortStory?: string;
  longStory?: string;
};

function cleanText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUpdate(body: PieceUpdateBody): PieceStoryUpdate | null {
  const attributes = body.attributes;

  if (!attributes) {
    return null;
  }

  const motifs = Array.isArray(attributes.motifs)
    ? attributes.motifs.map((motif) => String(motif).trim()).filter(Boolean)
    : [];

  const update = {
    sku: cleanText(body.sku),
    catalogRef: cleanText(body.catalogRef),
    attributes: {
      category: cleanText(attributes.category) ?? "",
      material: cleanText(attributes.material) ?? "",
      motifs,
      style: cleanText(attributes.style) ?? ""
    },
    shortStory: cleanText(body.shortStory) ?? "",
    longStory: cleanText(body.longStory) ?? ""
  };

  if (!update.attributes.category || !update.attributes.material || !update.attributes.style) {
    return null;
  }

  return update;
}

export async function PATCH(request: Request, { params }: PieceRouteProps) {
  const piece = await getPiece(params.id);

  if (!piece) {
    return NextResponse.json({ error: "Piece not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as PieceUpdateBody;

  if (body.action === "revert-to-draft") {
    const updatedPiece = await revertPieceToDraft(piece.id);
    return NextResponse.json({ piece: updatedPiece });
  }

  const update = normalizeUpdate(body);

  if (!update) {
    return NextResponse.json(
      { error: "Category, material, style, short story, and long story are required." },
      { status: 400 }
    );
  }

  if (!update.shortStory || !update.longStory) {
    return NextResponse.json({ error: "Short Story and Long Story cannot be empty." }, { status: 400 });
  }

  const updatedPiece =
    body.action === "approve" ? await approvePiece(piece.id, update) : await updatePieceDraft(piece.id, update);

  return NextResponse.json({ piece: updatedPiece });
}
