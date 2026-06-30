import { AppHeader } from "@/components/AppHeader";
import { UploadDashboard } from "@/components/UploadDashboard";
import { listPieces, type Piece } from "@/lib/pieces";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let pieces: Piece[] = [];
  let dbError: string | null = null;

  try {
    pieces = await listPieces();
  } catch (error) {
    dbError = error instanceof Error ? error.message : "Could not load pieces.";
  }

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        {dbError ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Database is not ready: {dbError}
          </div>
        ) : null}
        <UploadDashboard initialPieces={pieces} />
      </div>
    </main>
  );
}
