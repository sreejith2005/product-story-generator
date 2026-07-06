import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getErrorDetail, isMissingDatabaseConfig, isMissingStorageConfig, jsonError } from "@/lib/apiErrors";
import { createPiece, findDuplicatePieceByImageHash } from "@/lib/pieces";
import { getSupabaseServiceRoleClient } from "@/lib/supabase";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxSize = 10 * 1024 * 1024;

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function storagePathForFile(file: File) {
  return `pieces/${Date.now()}-${safeFilename(file.name)}`;
}

function imageHashForBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function uploadFailureStatus(error: unknown) {
  return isMissingDatabaseConfig(error) || isMissingStorageConfig(error) ? 503 : 500;
}

function uploadFailureTitle(error: unknown) {
  if (isMissingDatabaseConfig(error)) {
    return "Database not configured";
  }

  if (isMissingStorageConfig(error)) {
    return "Storage not configured or bucket missing — contact admin";
  }

  return "Upload failed";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "No image files were provided." }, { status: 400 });
    }

    if (files.length > 20) {
      return NextResponse.json({ error: "Upload up to 20 images at a time." }, { status: 400 });
    }

    const pieces = [];
    const errors: Array<{ fileName: string; error: string; detail?: string }> = [];

    for (const file of files) {
      if (!allowedTypes.has(file.type)) {
        errors.push({ fileName: file.name, error: "Upload failed", detail: "File must be JPG, PNG, or WEBP." });
        continue;
      }

      if (file.size > maxSize) {
        errors.push({ fileName: file.name, error: "Upload failed", detail: "File is larger than 10MB." });
        continue;
      }

      try {
        const supabase = getSupabaseServiceRoleClient();
        const path = storagePathForFile(file);
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const imageHash = imageHashForBuffer(fileBuffer);
        const duplicatePiece = await findDuplicatePieceByImageHash(imageHash);
        const { error: storageError } = await supabase.storage
          .from("jewelry-images")
          .upload(path, fileBuffer, {
            contentType: file.type,
            upsert: false
          });

        if (storageError) {
          throw new Error(`Supabase storage upload failed: ${storageError.message}`);
        }

        const { data: publicUrlData } = supabase.storage.from("jewelry-images").getPublicUrl(path);

        const piece = await createPiece(publicUrlData.publicUrl, imageHash);

        pieces.push({
          id: piece.id,
          url: piece.image_url,
          image_hash: piece.image_hash,
          status: piece.status,
          created_at: piece.created_at,
          duplicateOf: duplicatePiece
            ? {
                id: duplicatePiece.id,
                status: duplicatePiece.status,
                created_at: duplicatePiece.created_at
              }
            : null
        });
      } catch (error) {
        console.error("Upload failed for file", { fileName: file.name, error });
        errors.push({
          fileName: file.name,
          error: uploadFailureTitle(error),
          detail: getErrorDetail(error)
        });
      }
    }

    if (pieces.length === 0 && errors.length > 0) {
      const firstError = errors[0];
      const status = uploadFailureStatus(firstError.detail ?? firstError.error);
      return NextResponse.json(
        {
          error: firstError.error,
          detail: firstError.detail,
          errors
        },
        { status }
      );
    }

    return NextResponse.json({ pieces, errors });
  } catch (error) {
    console.error("Upload route failed", error);
    return jsonError(uploadFailureTitle(error), uploadFailureStatus(error), getErrorDetail(error));
  }
}
