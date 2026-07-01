import { NextResponse } from "next/server";

type ApiErrorPayload = {
  error: string;
  detail?: string;
};

export function jsonError(error: string, status: number, detail?: string) {
  const payload: ApiErrorPayload = detail ? { error, detail } : { error };
  return NextResponse.json(payload, { status });
}

export function getErrorDetail(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  return error instanceof Error ? error.message : "Unexpected server error.";
}

export function isMissingDatabaseConfig(error: unknown): boolean {
  const detail = getErrorDetail(error).toLowerCase();

  return (
    detail.includes("postgres_url") ||
    detail.includes("postgres_prisma_url") ||
    detail.includes("database_url") ||
    detail.includes("database is not configured") ||
    detail.includes("missing connection string") ||
    detail.includes("invalid connection string")
  );
}

export function isMissingStorageConfig(error: unknown): boolean {
  const detail = getErrorDetail(error).toLowerCase();

  return (
    detail.includes("supabase service role is not configured") ||
    detail.includes("storage upload failed") ||
    detail.includes("bucket not found") ||
    detail.includes("jewelry-images") ||
    detail.includes("storage not configured")
  );
}

export function databaseRouteError(error: unknown) {
  const detail = getErrorDetail(error);

  if (isMissingDatabaseConfig(error)) {
    return jsonError("Database not configured", 503, detail);
  }

  return jsonError("Database request failed", 500, detail);
}

export function uploadRouteError(error: unknown) {
  const detail = getErrorDetail(error);

  if (isMissingDatabaseConfig(error)) {
    return jsonError("Database not configured", 503, detail);
  }

  if (isMissingStorageConfig(error)) {
    return jsonError("Storage not configured or bucket missing — contact admin", 503, detail);
  }

  return jsonError("Upload failed", 500, detail);
}
