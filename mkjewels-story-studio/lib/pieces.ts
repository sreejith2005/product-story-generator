import { sql } from "@vercel/postgres";

export type PieceStatus = "uploaded" | "processing" | "draft" | "approved";

export type Piece = {
  id: string;
  image_url: string;
  sku: string | null;
  catalog_ref: string | null;
  status: PieceStatus;
  detected_category: string | null;
  detected_material: string | null;
  detected_motifs: string | null;
  detected_style: string | null;
  short_story: string | null;
  long_story: string | null;
  final_short_story: string | null;
  final_long_story: string | null;
  generation_error: string | null;
  generation_error_at: string | null;
  is_edited: boolean | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InsertedPiece = Pick<Piece, "id" | "image_url" | "status" | "created_at">;

export type PieceAttributes = {
  category: string;
  material: string;
  motifs: string[];
  style: string;
};

export type PieceStoryUpdate = {
  sku?: string | null;
  catalogRef?: string | null;
  attributes: PieceAttributes;
  shortStory: string;
  longStory: string;
};

export type ExportPiece = Pick<
  Piece,
  | "id"
  | "sku"
  | "catalog_ref"
  | "status"
  | "detected_category"
  | "detected_material"
  | "detected_motifs"
  | "detected_style"
  | "short_story"
  | "long_story"
  | "final_short_story"
  | "final_long_story"
  | "is_edited"
  | "created_at"
>;

export async function listPieces(): Promise<Piece[]> {
  const result = await sql<Piece>`
    SELECT
      id,
      image_url,
      sku,
      catalog_ref,
      status,
      detected_category,
      detected_material,
      detected_motifs,
      detected_style,
      short_story,
      long_story,
      final_short_story,
      final_long_story,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
    FROM pieces
    ORDER BY created_at DESC
    LIMIT 100
  `;

  return result.rows;
}

export async function getPiece(id: string): Promise<Piece | null> {
  const result = await sql<Piece>`
    SELECT
      id,
      image_url,
      sku,
      catalog_ref,
      status,
      detected_category,
      detected_material,
      detected_motifs,
      detected_style,
      short_story,
      long_story,
      final_short_story,
      final_long_story,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
    FROM pieces
    WHERE id = ${id}
    LIMIT 1
  `;

  return result.rows[0] ?? null;
}

export async function listPiecesForExport(ids: string[]): Promise<ExportPiece[]> {
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
  const result = await sql.query<ExportPiece>(
    `
      SELECT
        id,
        sku,
        catalog_ref,
        status,
        detected_category,
        detected_material,
        detected_motifs,
        detected_style,
        short_story,
        long_story,
        final_short_story,
        final_long_story,
        is_edited,
        created_at::text
      FROM pieces
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC
    `,
    ids
  );

  return result.rows;
}

export async function listApprovedPiecesForExport(): Promise<ExportPiece[]> {
  const result = await sql<ExportPiece>`
    SELECT
      id,
      sku,
      catalog_ref,
      status,
      detected_category,
      detected_material,
      detected_motifs,
      detected_style,
      short_story,
      long_story,
      final_short_story,
      final_long_story,
      is_edited,
      created_at::text
    FROM pieces
    WHERE status = 'approved'
    ORDER BY created_at DESC
  `;

  return result.rows;
}

export async function createPiece(imageUrl: string, uploadedBy?: string): Promise<InsertedPiece> {
  const result = await sql<InsertedPiece>`
    INSERT INTO pieces (image_url, status, uploaded_by)
    VALUES (${imageUrl}, 'uploaded', ${uploadedBy ?? null})
    RETURNING id, image_url, status, created_at::text
  `;

  return result.rows[0];
}

export async function setPieceProcessing(id: string): Promise<void> {
  await sql`
    UPDATE pieces
    SET status = 'processing', generation_error = NULL, generation_error_at = NULL
    WHERE id = ${id}
  `;
}

export async function setPieceDraft(
  id: string,
  story: {
    category: string;
    material: string;
    motifs: string[];
    style: string;
    shortStory: string;
    longStory: string;
  }
): Promise<void> {
  await sql`
    UPDATE pieces
    SET
      status = 'draft',
      detected_category = ${story.category},
      detected_material = ${story.material},
      detected_motifs = ${JSON.stringify(story.motifs)},
      detected_style = ${story.style},
      short_story = ${story.shortStory},
      long_story = ${story.longStory},
      generation_error = NULL,
      generation_error_at = NULL
    WHERE id = ${id}
  `;
}

export async function updatePieceDraft(id: string, update: PieceStoryUpdate): Promise<Piece | null> {
  const result = await sql<Piece>`
    UPDATE pieces
    SET
      sku = ${update.sku ?? null},
      catalog_ref = ${update.catalogRef ?? null},
      status = CASE WHEN status = 'approved' THEN 'approved' ELSE 'draft' END,
      detected_category = ${update.attributes.category},
      detected_material = ${update.attributes.material},
      detected_motifs = ${JSON.stringify(update.attributes.motifs)},
      detected_style = ${update.attributes.style},
      final_short_story = ${update.shortStory},
      final_long_story = ${update.longStory},
      is_edited = true
    WHERE id = ${id}
    RETURNING
      id,
      image_url,
      sku,
      catalog_ref,
      status,
      detected_category,
      detected_material,
      detected_motifs,
      detected_style,
      short_story,
      long_story,
      final_short_story,
      final_long_story,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
  `;

  return result.rows[0] ?? null;
}

export async function approvePiece(id: string, update: PieceStoryUpdate): Promise<Piece | null> {
  const result = await sql<Piece>`
    UPDATE pieces
    SET
      sku = ${update.sku ?? null},
      catalog_ref = ${update.catalogRef ?? null},
      status = 'approved',
      detected_category = ${update.attributes.category},
      detected_material = ${update.attributes.material},
      detected_motifs = ${JSON.stringify(update.attributes.motifs)},
      detected_style = ${update.attributes.style},
      final_short_story = ${update.shortStory},
      final_long_story = ${update.longStory},
      is_edited = true
    WHERE id = ${id}
    RETURNING
      id,
      image_url,
      sku,
      catalog_ref,
      status,
      detected_category,
      detected_material,
      detected_motifs,
      detected_style,
      short_story,
      long_story,
      final_short_story,
      final_long_story,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
  `;

  return result.rows[0] ?? null;
}

export async function revertPieceToDraft(id: string): Promise<Piece | null> {
  const result = await sql<Piece>`
    UPDATE pieces
    SET status = 'draft'
    WHERE id = ${id}
    RETURNING
      id,
      image_url,
      sku,
      catalog_ref,
      status,
      detected_category,
      detected_material,
      detected_motifs,
      detected_style,
      short_story,
      long_story,
      final_short_story,
      final_long_story,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
  `;

  return result.rows[0] ?? null;
}

export async function setPieceGenerationError(id: string, message: string): Promise<void> {
  await sql`
    UPDATE pieces
    SET status = 'uploaded', generation_error = ${message}, generation_error_at = now()
    WHERE id = ${id}
  `;
}
