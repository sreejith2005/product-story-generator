import { sql } from "@vercel/postgres";

export type PieceStatus = "queued" | "processing" | "ready" | "approved" | "discarded";

export type Piece = {
  id: string;
  image_url: string;
  image_hash: string | null;
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
  staff_notes: string | null;
  error_message: string | null;
  generation_error: string | null;
  generation_error_at: string | null;
  is_edited: boolean | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InsertedPiece = Pick<Piece, "id" | "image_url" | "image_hash" | "status" | "created_at">;

export type PieceAttributes = {
  category: string;
  material: string;
  goldTone?: string;
  contentTone?: string;
  motifs: string[];
  style: string;
};

export type PieceStoryUpdate = {
  sku?: string | null;
  catalogRef?: string | null;
  attributes: PieceAttributes;
  shortStory: string;
  longStory: string;
  staffNotes?: string | null;
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

const pieceSelect = [
  "id",
  "image_url",
  "image_hash",
  "sku",
  "catalog_ref",
  "status",
  "detected_category",
  "detected_material",
  "detected_motifs",
  "detected_style",
  "short_story",
  "long_story",
  "final_short_story",
  "final_long_story",
  "staff_notes",
  "error_message",
  "generation_error",
  "generation_error_at",
  "is_edited",
  "uploaded_by",
  "created_at",
  "updated_at"
].join(",");

const legacyPieceSelect = [
  "id",
  "image_url",
  "sku",
  "catalog_ref",
  "status",
  "detected_category",
  "detected_material",
  "detected_motifs",
  "detected_style",
  "short_story",
  "long_story",
  "final_short_story",
  "final_long_story",
  "generation_error",
  "generation_error_at",
  "is_edited",
  "uploaded_by",
  "created_at",
  "updated_at"
].join(",");

const exportSelect = [
  "id",
  "sku",
  "catalog_ref",
  "status",
  "detected_category",
  "detected_material",
  "detected_motifs",
  "detected_style",
  "short_story",
  "long_story",
  "final_short_story",
  "final_long_story",
  "staff_notes",
  "error_message",
  "is_edited",
  "created_at"
].join(",");

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    serviceRoleKey
  };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T[]> {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error("Database is not configured. Set Supabase URL and SUPABASE_SERVICE_ROLE_KEY, or POSTGRES_URL.");
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed with ${response.status}: ${detail.slice(0, 500)}`);
  }

  if (response.status === 204) {
    return [];
  }

  return (await response.json()) as T[];
}

function shouldUseSupabase() {
  return getSupabaseConfig() !== null;
}

function piecesPath(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `pieces?${searchParams.toString()}`;
}

function isMissingNewPieceColumn(error: unknown) {
  return (
    error instanceof Error &&
    (/column pieces\.(staff_notes|error_message|image_hash) does not exist/.test(error.message) ||
      /Could not find the '(staff_notes|error_message|image_hash)' column of 'pieces' in the schema cache/.test(error.message) ||
      /schema cache.*pieces.*(staff_notes|error_message|image_hash)/i.test(error.message))
  );
}

function normalizeStatus(status: string): PieceStatus {
  switch (status) {
    case "uploaded":
      return "queued";
    case "draft":
      return "ready";
    case "queued":
    case "processing":
    case "ready":
    case "approved":
    case "discarded":
      return status;
    default:
      return "queued";
  }
}

function normalizePiece<T extends Piece>(piece: T): T {
  return {
    ...piece,
    status: normalizeStatus(piece.status),
    error_message: piece.error_message ?? piece.generation_error ?? null,
    image_hash: piece.image_hash ?? null,
    staff_notes: piece.staff_notes ?? null
  };
}

function normalizePieces<T extends Piece>(pieces: T[]): T[] {
  return pieces.map(normalizePiece);
}

async function markStaleProcessingPieces(): Promise<void> {
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const message = "Story generation took too long. Try regenerating.";

  if (shouldUseSupabase()) {
    try {
      await supabaseRequest<Piece>(
        piecesPath({
          select: "id",
          status: "eq.processing",
          updated_at: `lt.${cutoff}`
        }),
        {
          method: "PATCH",
          headers: {
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            status: "ready",
            error_message: message,
            generation_error: message,
            generation_error_at: new Date().toISOString()
          })
        }
      );
    } catch (error) {
      if (!isMissingNewPieceColumn(error)) {
        throw error;
      }
    }

    return;
  }

  await sql`
    UPDATE pieces
    SET status = 'ready', error_message = ${message}, generation_error = ${message}, generation_error_at = now()
    WHERE status = 'processing' AND updated_at < now() - interval '90 seconds'
  `;
}

export async function listPieces(): Promise<Piece[]> {
  await markStaleProcessingPieces();

  if (shouldUseSupabase()) {
    try {
      return normalizePieces(
        await supabaseRequest<Piece>(
          piecesPath({
            select: pieceSelect,
            order: "created_at.desc",
            limit: "100"
          })
        )
      );
    } catch (error) {
      if (!isMissingNewPieceColumn(error)) {
        throw error;
      }

      return normalizePieces(
        await supabaseRequest<Piece>(
          piecesPath({
            select: legacyPieceSelect,
            order: "created_at.desc",
            limit: "100"
          })
        )
      );
    }
  }

  const result = await sql<Piece>`
    SELECT
      id,
      image_url,
      image_hash,
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
      staff_notes,
      error_message,
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

  return normalizePieces(result.rows);
}

export async function getPiece(id: string): Promise<Piece | null> {
  if (shouldUseSupabase()) {
    let rows: Piece[];

    try {
      rows = await supabaseRequest<Piece>(
        piecesPath({
          select: pieceSelect,
          id: `eq.${id}`,
          limit: "1"
        })
      );
    } catch (error) {
      if (!isMissingNewPieceColumn(error)) {
        throw error;
      }

      rows = await supabaseRequest<Piece>(
        piecesPath({
          select: legacyPieceSelect,
          id: `eq.${id}`,
          limit: "1"
        })
      );
    }

    return rows[0] ? normalizePiece(rows[0]) : null;
  }

  const result = await sql<Piece>`
    SELECT
      id,
      image_url,
      image_hash,
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
      staff_notes,
      error_message,
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

  return result.rows[0] ? normalizePiece(result.rows[0]) : null;
}

export async function listPiecesForExport(ids: string[]): Promise<ExportPiece[]> {
  if (ids.length === 0) {
    return [];
  }

  if (shouldUseSupabase()) {
    return supabaseRequest<ExportPiece>(
      piecesPath({
        select: exportSelect,
        id: `in.(${ids.join(",")})`,
        order: "created_at.desc"
      })
    );
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
        staff_notes,
        error_message,
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
  if (shouldUseSupabase()) {
    return supabaseRequest<ExportPiece>(
      piecesPath({
        select: exportSelect,
        status: "eq.approved",
        order: "created_at.desc"
      })
    );
  }

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
      staff_notes,
      error_message,
      is_edited,
      created_at::text
    FROM pieces
    WHERE status = 'approved'
    ORDER BY created_at DESC
  `;

  return result.rows;
}

export async function findDuplicatePieceByImageHash(imageHash: string, excludeId?: string): Promise<Piece | null> {
  if (!imageHash) {
    return null;
  }

  if (shouldUseSupabase()) {
    try {
      const params: Record<string, string> = {
        select: pieceSelect,
        image_hash: `eq.${imageHash}`,
        status: "neq.discarded",
        order: "created_at.asc",
        limit: "1"
      };

      if (excludeId) {
        params.id = `neq.${excludeId}`;
      }

      const rows = await supabaseRequest<Piece>(piecesPath(params));
      return rows[0] ? normalizePiece(rows[0]) : null;
    } catch (error) {
      if (isMissingNewPieceColumn(error)) {
        return null;
      }

      throw error;
    }
  }

  const result = excludeId
    ? await sql<Piece>`
        SELECT
          id,
          image_url,
          image_hash,
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
          staff_notes,
          error_message,
          generation_error,
          generation_error_at::text,
          is_edited,
          uploaded_by,
          created_at::text,
          updated_at::text
        FROM pieces
        WHERE image_hash = ${imageHash} AND id <> ${excludeId} AND status <> 'discarded'
        ORDER BY created_at ASC
        LIMIT 1
      `
    : await sql<Piece>`
        SELECT
          id,
          image_url,
          image_hash,
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
          staff_notes,
          error_message,
          generation_error,
          generation_error_at::text,
          is_edited,
          uploaded_by,
          created_at::text,
          updated_at::text
        FROM pieces
        WHERE image_hash = ${imageHash} AND status <> 'discarded'
        ORDER BY created_at ASC
        LIMIT 1
      `;

  return result.rows[0] ? normalizePiece(result.rows[0]) : null;
}

export async function createPiece(imageUrl: string, imageHash?: string, uploadedBy?: string): Promise<InsertedPiece> {
  if (shouldUseSupabase()) {
    let rows: InsertedPiece[];

    try {
      rows = await supabaseRequest<InsertedPiece>(
        piecesPath({
          select: "id,image_url,image_hash,status,created_at"
        }),
        {
          method: "POST",
          headers: {
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            image_url: imageUrl,
            image_hash: imageHash ?? null,
            status: "queued",
            uploaded_by: uploadedBy ?? null
          })
        }
      );
    } catch (error) {
      if (!isMissingNewPieceColumn(error)) {
        throw error;
      }

      rows = await supabaseRequest<InsertedPiece>(
        piecesPath({
          select: "id,image_url,status,created_at"
        }),
        {
          method: "POST",
          headers: {
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            image_url: imageUrl,
            status: "queued",
            uploaded_by: uploadedBy ?? null
          })
        }
      );
    }

    return { ...rows[0], image_hash: rows[0].image_hash ?? null };
  }

  const result = await sql<InsertedPiece>`
    INSERT INTO pieces (image_url, image_hash, status, uploaded_by)
    VALUES (${imageUrl}, ${imageHash ?? null}, 'queued', ${uploadedBy ?? null})
    RETURNING id, image_url, image_hash, status, created_at::text
  `;

  return result.rows[0];
}

export async function setPieceProcessing(id: string): Promise<void> {
  if (shouldUseSupabase()) {
    await supabaseRequest<Piece>(
      piecesPath({
        select: "id",
        id: `eq.${id}`
      }),
      {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          status: "processing",
          error_message: null,
          generation_error: null,
          generation_error_at: null
        })
      }
    );
    return;
  }

  await sql`
    UPDATE pieces
    SET status = 'processing', error_message = NULL, generation_error = NULL, generation_error_at = NULL
    WHERE id = ${id}
  `;
}

export async function setPieceReady(
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
  if (shouldUseSupabase()) {
    await supabaseRequest<Piece>(
      piecesPath({
        select: "id",
        id: `eq.${id}`,
        status: "eq.processing"
      }),
      {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          status: "ready",
          detected_category: story.category,
          detected_material: story.material,
          detected_motifs: JSON.stringify(story.motifs),
          detected_style: story.style,
          short_story: story.shortStory,
          long_story: story.longStory,
          error_message: null,
          generation_error: null,
          generation_error_at: null
        })
      }
    );
    return;
  }

  await sql`
    UPDATE pieces
    SET
      status = 'ready',
      detected_category = ${story.category},
      detected_material = ${story.material},
      detected_motifs = ${JSON.stringify(story.motifs)},
      detected_style = ${story.style},
      short_story = ${story.shortStory},
      long_story = ${story.longStory},
      error_message = NULL,
      generation_error = NULL,
      generation_error_at = NULL
    WHERE id = ${id} AND status = 'processing'
  `;
}

export async function updatePieceReady(id: string, update: PieceStoryUpdate): Promise<Piece | null> {
  if (shouldUseSupabase()) {
    const currentPiece = await getPiece(id);
    const rows = await supabaseRequest<Piece>(
      piecesPath({
        select: pieceSelect,
        id: `eq.${id}`
      }),
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          sku: update.sku ?? null,
          catalog_ref: update.catalogRef ?? null,
          status: currentPiece?.status === "approved" ? "approved" : "ready",
          detected_category: update.attributes.category,
          detected_material: update.attributes.material,
          detected_motifs: JSON.stringify(update.attributes.motifs),
          detected_style: update.attributes.style,
          final_short_story: update.shortStory,
          final_long_story: update.longStory,
          staff_notes: update.staffNotes ?? currentPiece?.staff_notes ?? null,
          is_edited: true
        })
      }
    );

    return rows[0] ? normalizePiece(rows[0]) : null;
  }

  const result = await sql<Piece>`
    UPDATE pieces
    SET
      sku = ${update.sku ?? null},
      catalog_ref = ${update.catalogRef ?? null},
      status = CASE WHEN status = 'approved' THEN 'approved' ELSE 'ready' END,
      detected_category = ${update.attributes.category},
      detected_material = ${update.attributes.material},
      detected_motifs = ${JSON.stringify(update.attributes.motifs)},
      detected_style = ${update.attributes.style},
      final_short_story = ${update.shortStory},
      final_long_story = ${update.longStory},
      staff_notes = ${update.staffNotes ?? null},
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
      staff_notes,
      error_message,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
  `;

  return result.rows[0] ? normalizePiece(result.rows[0]) : null;
}

export async function approvePiece(id: string, update: PieceStoryUpdate): Promise<Piece | null> {
  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<Piece>(
      piecesPath({
        select: pieceSelect,
        id: `eq.${id}`
      }),
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          sku: update.sku ?? null,
          catalog_ref: update.catalogRef ?? null,
          status: "approved",
          detected_category: update.attributes.category,
          detected_material: update.attributes.material,
          detected_motifs: JSON.stringify(update.attributes.motifs),
          detected_style: update.attributes.style,
          final_short_story: update.shortStory,
          final_long_story: update.longStory,
          staff_notes: update.staffNotes ?? null,
          is_edited: true
        })
      }
    );

    return rows[0] ? normalizePiece(rows[0]) : null;
  }

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
      staff_notes = ${update.staffNotes ?? null},
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
      staff_notes,
      error_message,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
  `;

  return result.rows[0] ? normalizePiece(result.rows[0]) : null;
}

export async function updatePieceStaffNotes(id: string, staffNotes: string | null): Promise<Piece | null> {
  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<Piece>(
      piecesPath({
        select: pieceSelect,
        id: `eq.${id}`
      }),
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          staff_notes: staffNotes
        })
      }
    );

    return rows[0] ? normalizePiece(rows[0]) : null;
  }

  const result = await sql<Piece>`
    UPDATE pieces
    SET staff_notes = ${staffNotes}
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
      staff_notes,
      error_message,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
  `;

  return result.rows[0] ? normalizePiece(result.rows[0]) : null;
}

export async function discardPiece(id: string): Promise<Piece | null> {
  if (shouldUseSupabase()) {
    const rows = await supabaseRequest<Piece>(
      piecesPath({
        select: pieceSelect,
        id: `eq.${id}`
      }),
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          status: "discarded"
        })
      }
    );

    return rows[0] ? normalizePiece(rows[0]) : null;
  }

  const result = await sql<Piece>`
    UPDATE pieces
    SET status = 'discarded'
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
      staff_notes,
      error_message,
      generation_error,
      generation_error_at::text,
      is_edited,
      uploaded_by,
      created_at::text,
      updated_at::text
  `;

  return result.rows[0] ? normalizePiece(result.rows[0]) : null;
}

export async function setPieceGenerationError(id: string, message: string): Promise<void> {
  if (shouldUseSupabase()) {
    await supabaseRequest<Piece>(
      piecesPath({
        select: "id",
        id: `eq.${id}`,
        status: "eq.processing"
      }),
      {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          status: "ready",
          error_message: message,
          generation_error: message,
          generation_error_at: new Date().toISOString()
        })
      }
    );
    return;
  }

  await sql`
    UPDATE pieces
    SET status = 'ready', error_message = ${message}, generation_error = ${message}, generation_error_at = now()
    WHERE id = ${id} AND status = 'processing'
  `;
}

