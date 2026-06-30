import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createPiece, setPieceProcessing } from "@/lib/pieces";
import { generateDraftForPiece } from "@/lib/storyGeneration";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxSize = 10 * 1024 * 1024;

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: "No image files were provided." }, { status: 400 });
  }

  if (files.length > 20) {
    return NextResponse.json({ error: "Upload up to 20 images at a time." }, { status: 400 });
  }

  const pieces = [];

  for (const file of files) {
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: `${file.name} must be JPG, PNG, or WEBP.` }, { status: 400 });
    }

    if (file.size > maxSize) {
      return NextResponse.json({ error: `${file.name} is larger than 10MB.` }, { status: 400 });
    }

    const blob = await put(`pieces/${Date.now()}-${safeFilename(file.name)}`, file, {
      access: "public",
      addRandomSuffix: true
    });

    const piece = await createPiece(blob.url);
    await setPieceProcessing(piece.id);
    void generateDraftForPiece(piece.id).catch((error) => {
      console.error("Story generation failed after upload", { pieceId: piece.id, error });
    });

    pieces.push({
      id: piece.id,
      url: piece.image_url,
      status: "processing",
      created_at: piece.created_at
    });
  }

  return NextResponse.json({ pieces });
}
