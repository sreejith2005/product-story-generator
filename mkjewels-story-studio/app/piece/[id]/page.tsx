import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { PieceDetailEditor } from "@/components/PieceDetailEditor";
import { getPiece } from "@/lib/pieces";

export const dynamic = "force-dynamic";

type PiecePageProps = {
  params: {
    id: string;
  };
};

export default async function PiecePage({ params }: PiecePageProps) {
  const piece = await getPiece(params.id);

  if (!piece) {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink/70 hover:text-charcoal">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to dashboard
        </Link>

        <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
          <div className="relative min-h-[320px] overflow-hidden rounded-lg border border-stone/75 bg-cream shadow-sm sm:min-h-[420px] lg:sticky lg:top-8 lg:h-[calc(100vh-8rem)]">
            <Image
              src={piece.image_url}
              alt="Uploaded jewelry piece"
              fill
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="object-contain"
              priority
            />
          </div>

          <PieceDetailEditor initialPiece={piece} />
        </section>
      </div>
    </main>
  );
}
