import type { PieceStatus } from "@/lib/pieces";
import { AlertTriangle, Loader2 } from "lucide-react";

const labels: Record<PieceStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  ready: "Ready for review",
  approved: "Approved",
  discarded: "Discarded"
};

const styles: Record<PieceStatus, string> = {
  queued: "border-brand-line bg-brand-ivory text-ink/80",
  processing: "border-gold/45 bg-brand-champagne text-[#6b4610]",
  ready: "border-brand-line bg-white text-charcoal",
  approved: "border-sage/25 bg-[#e8f6ef] text-sage",
  discarded: "border-red-200 bg-red-50 text-red-700"
};

type PieceStatusBadgeProps = {
  status: PieceStatus;
  hasError?: boolean;
};

export function PieceStatusBadge({ status, hasError = false }: PieceStatusBadgeProps) {
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
        <AlertTriangle size={12} aria-hidden="true" />
        Generation failed
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status === "processing" ? <Loader2 className="animate-spin" size={12} aria-hidden="true" /> : null}
      {labels[status]}
    </span>
  );
}
