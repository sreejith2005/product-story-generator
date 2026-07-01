import { NextResponse } from "next/server";
import { databaseRouteError } from "@/lib/apiErrors";
import { listApprovedPiecesForExport, listPiecesForExport, type ExportPiece } from "@/lib/pieces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = [
  "id",
  "sku",
  "catalog_ref",
  "category",
  "material",
  "motifs",
  "style",
  "short_story",
  "long_story",
  "status",
  "created_at"
] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExportRequestBody = {
  ids?: unknown;
  status?: unknown;
};

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseMotifs(value: string | null): string {
  if (!value) {
    return "";
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean).join("; ");
    }
  } catch {
    return value;
  }

  return "";
}

function pieceToCsvRow(piece: ExportPiece): string[] {
  const useFinalStories = piece.is_edited === true;

  return [
    piece.id,
    piece.sku,
    piece.catalog_ref,
    piece.detected_category,
    piece.detected_material,
    parseMotifs(piece.detected_motifs),
    piece.detected_style,
    useFinalStories ? piece.final_short_story : piece.short_story,
    useFinalStories ? piece.final_long_story : piece.long_story,
    piece.status,
    piece.created_at
  ].map(csvCell);
}

function buildCsv(pieces: ExportPiece[]): string {
  const rows = [columns.join(","), ...pieces.map((piece) => pieceToCsvRow(piece).join(","))];
  return `${rows.join("\r\n")}\r\n`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ExportRequestBody;
    const exportApproved = body.status === "approved";
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];

    if (!exportApproved && ids.length === 0) {
      return NextResponse.json({ error: "Provide piece ids to export." }, { status: 400 });
    }

    if (!exportApproved && ids.some((id) => !uuidPattern.test(id))) {
      return NextResponse.json({ error: "One or more piece ids are invalid." }, { status: 400 });
    }

    const pieces = exportApproved ? await listApprovedPiecesForExport() : await listPiecesForExport(Array.from(new Set(ids)));
    const csv = buildCsv(pieces);
    const filename = exportApproved ? "mkjewels-approved-stories.csv" : "mkjewels-selected-stories.csv";

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Could not export pieces", error);
    return databaseRouteError(error);
  }
}
