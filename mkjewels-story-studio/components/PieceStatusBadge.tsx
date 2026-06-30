import type { PieceStatus } from "@/lib/pieces";
import { Loader2 } from "lucide-react";

const labels: Record<PieceStatus, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  draft: "Draft Ready",
  approved: "Approved"
};

const styles: Record<PieceStatus, string> = {
  uploaded: "border-brand-line bg-brand-ivory text-ink/80",
  processing: "border-gold/45 bg-brand-champagne text-[#6b4610]",
  draft: "border-brand-line bg-white text-charcoal",
  approved: "border-sage/25 bg-[#e8f6ef] text-sage"
};

type PieceStatusBadgeProps = {
  status: PieceStatus;
};

export function PieceStatusBadge({ status }: PieceStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status === "processing" ? <Loader2 className="animate-spin" size={12} aria-hidden="true" /> : null}
      {labels[status]}
    </span>
  );
}
