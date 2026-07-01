import { NextResponse } from "next/server";
import { databaseRouteError } from "@/lib/apiErrors";
import { approvePiece, discardPiece, getPiece, updatePieceReady, updatePieceStaffNotes, type PieceStoryUpdate } from "@/lib/pieces";

export const runtime = "nodejs";

type PieceRouteProps = {
  params: {
    id: string;
  };
};

type PieceAction = "autosave" | "save-draft" | "approve" | "discard";

type PieceUpdateBody = {
  action?: PieceAction;
  sku?: string | null;
  catalogRef?: string | null;
  attributes?: {
    category?: string;
    material?: string;
    goldTone?: string;
    contentTone?: string;
    motifs?: unknown;
    style?: string;
  };
  shortStory?: string;
  longStory?: string;
  staffNotes?: string | null;
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
      goldTone: cleanText(attributes.goldTone) ?? "",
      contentTone: cleanText(attributes.contentTone) ?? "",
      motifs,
      style: cleanText(attributes.style) ?? ""
    },
    shortStory: cleanText(body.shortStory) ?? "",
    longStory: cleanText(body.longStory) ?? "",
    staffNotes: cleanText(body.staffNotes)
  };

  if (!update.attributes.category || !update.attributes.material || !update.attributes.style) {
    return null;
  }

  return update;
}

export async function PATCH(request: Request, { params }: PieceRouteProps) {
  try {
    const piece = await getPiece(params.id);

    if (!piece) {
      return NextResponse.json({ error: "Piece not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as PieceUpdateBody;

    if (body.action === "discard") {
      const updatedPiece = await discardPiece(piece.id);
      return NextResponse.json({ piece: updatedPiece });
    }

    const update = normalizeUpdate(body);

    if (!update) {
      if (body.action === "autosave" && "staffNotes" in body) {
        const updatedPiece = await updatePieceStaffNotes(piece.id, cleanText(body.staffNotes));
        return NextResponse.json({ piece: updatedPiece });
      }

      return NextResponse.json(
        { error: "Category, material, style, short story, and long story are required." },
        { status: 400 }
      );
    }

    if (!update.shortStory || !update.longStory) {
      return NextResponse.json({ error: "Short Story and Long Story cannot be empty." }, { status: 400 });
    }

    const updatedPiece =
      body.action === "approve" ? await approvePiece(piece.id, update) : await updatePieceReady(piece.id, update);

    return NextResponse.json({ piece: updatedPiece });
  } catch (error) {
    console.error("Could not update piece", { pieceId: params.id, error });
    return databaseRouteError(error);
  }
}
