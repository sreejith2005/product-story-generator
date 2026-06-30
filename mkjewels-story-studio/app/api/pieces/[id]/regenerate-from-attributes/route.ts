import { NextResponse } from "next/server";
import { generateJewelryStoryFromAttributes } from "@/lib/ai/generateJewelryStory";
import { getPiece, setPieceDraft, updatePieceDraft } from "@/lib/pieces";

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
    motifs?: unknown;
    style?: string;
  };
  sku?: string | null;
  catalogRef?: string | null;
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
  const piece = await getPiece(params.id);

  if (!piece) {
    return NextResponse.json({ error: "Piece not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as RegenerateFromAttributesBody;
  const attributes = normalizeAttributes(body);

  if (!attributes) {
    return NextResponse.json({ error: "Category, material, and style are required." }, { status: 400 });
  }

  try {
    const story = await generateJewelryStoryFromAttributes(attributes);

    if (piece.status === "approved") {
      const updatedPiece = await updatePieceDraft(piece.id, {
        sku: body.sku ?? piece.sku,
        catalogRef: body.catalogRef ?? piece.catalog_ref,
        attributes,
        shortStory: story.shortStory,
        longStory: story.longStory
      });

      return NextResponse.json({ piece: updatedPiece, story });
    }

    await setPieceDraft(piece.id, story);

    const updatedPiece = await updatePieceDraft(piece.id, {
      sku: body.sku ?? piece.sku,
      catalogRef: body.catalogRef ?? piece.catalog_ref,
      attributes,
      shortStory: story.shortStory,
      longStory: story.longStory
    });

    return NextResponse.json({ piece: updatedPiece, story });
  } catch (error) {
    console.error("Text-only story regeneration failed", { pieceId: piece.id, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not regenerate stories." },
      { status: 500 }
    );
  }
}
