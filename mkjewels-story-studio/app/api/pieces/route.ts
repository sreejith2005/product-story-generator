import { NextResponse } from "next/server";
import { listPieces } from "@/lib/pieces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pieces = await listPieces();
    return NextResponse.json({ pieces });
  } catch (error) {
    console.error("Could not list pieces", error);
    return NextResponse.json({ error: "Could not load pieces." }, { status: 500 });
  }
}
