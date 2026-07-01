import { NextResponse } from "next/server";
import { databaseRouteError } from "@/lib/apiErrors";
import { listPieces } from "@/lib/pieces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pieces = await listPieces();
    return NextResponse.json({ pieces });
  } catch (error) {
    console.error("Could not list pieces", error);
    return databaseRouteError(error);
  }
}
