import { NextResponse } from "next/server";
import { generateJewelryStoryFromAttributes } from "@/lib/ai/generateJewelryStory";
import { databaseRouteError } from "@/lib/apiErrors";
import { mergeGoldToneIntoMaterial } from "@/lib/guidedAttributes";
import { generationErrorMessage } from "@/lib/storyGeneration";
import { getPiece, setPieceGenerationError, setPieceReady, updatePieceReady } from "@/lib/pieces";

export const runtime = "nodejs";

type RegenerateFromAttributesRouteProps = {
  params: {
    id: string;
  };
};

type RegenerateFromAttributesBody = {
  attributes?: {
    category?: string;
    material?: string;
    goldTone?: string;
    contentTone?: string;
    motifs?: unknown;
    style?: string;
  };
  sku?: string | null;
  catalogRef?: string | null;
  staffNotes?: string | null;
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeAttributes(body: RegenerateFromAttributesBody) {
  const attributes = body.attributes;

  if (!attributes) {
    return null;
  }

  const normalized = {
    category: cleanText(attributes.category),
    material: cleanText(attributes.material),
    goldTone: cleanText(attributes.goldTone),
    contentTone: cleanText(attributes.contentTone),
    motifs: Array.isArray(attributes.motifs)
      ? attributes.motifs.map((motif) => String(motif).trim()).filter(Boolean)
      : [],
    style: cleanText(attributes.style)
  };

  if (!normalized.category || !normalized.material || !normalized.style) {
    return null;
  }

  return normalized;
}

export async function POST(request: Request, { params }: RegenerateFromAttributesRouteProps) {
  try {
    const piece = await getPiece(params.id);

    if (!piece) {
      return NextResponse.json({ error: "Piece not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as RegenerateFromAttributesBody;
    const attributes = normalizeAttributes(body);

    if (!attributes) {
      return NextResponse.json({ error: "Category, material, and style are required." }, { status: 400 });
    }

    const staffNotes = cleanText(body.staffNotes);
    const story = await generateJewelryStoryFromAttributes(attributes, staffNotes);
    const updateAttributes = {
      ...attributes,
      material: mergeGoldToneIntoMaterial(story.material || attributes.material, attributes.goldTone)
    };

    if (piece.status === "approved") {
      const updatedPiece = await updatePieceReady(piece.id, {
        sku: body.sku ?? piece.sku,
        catalogRef: body.catalogRef ?? piece.catalog_ref,
        attributes: updateAttributes,
        shortStory: story.shortStory,
        longStory: story.longStory,
        staffNotes: body.staffNotes ?? piece.staff_notes
      });

      return NextResponse.json({ piece: updatedPiece, story });
    }

    await setPieceReady(piece.id, story);

    const updatedPiece = await updatePieceReady(piece.id, {
      sku: body.sku ?? piece.sku,
      catalogRef: body.catalogRef ?? piece.catalog_ref,
      attributes: updateAttributes,
      shortStory: story.shortStory,
      longStory: story.longStory,
      staffNotes: body.staffNotes ?? piece.staff_notes
    });

    return NextResponse.json({ piece: updatedPiece, story });
  } catch (error) {
    console.error("Text-only story regeneration failed", { pieceId: params.id, error });
    const message = generationErrorMessage(error);

    try {
      await setPieceGenerationError(params.id, message);
    } catch {
      return databaseRouteError(error);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
