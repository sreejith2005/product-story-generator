"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

type RegeneratePieceButtonProps = {
  pieceId: string;
};

export function RegeneratePieceButton({ pieceId }: RegeneratePieceButtonProps) {
  const router = useRouter();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate(force = false) {
    setIsRegenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/pieces/${pieceId}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ force })
      });

      const payload = await response.json();

      if (response.status === 409 && payload.requiresConfirmation) {
        setNeedsConfirmation(true);
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not regenerate this draft.");
      }

      setNeedsConfirmation(false);
      router.refresh();
    } catch (regenerateError) {
      setError(regenerateError instanceof Error ? regenerateError.message : "Could not regenerate this draft.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={isRegenerating}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-stone bg-white px-4 text-sm font-semibold text-charcoal transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={isRegenerating ? "animate-spin" : ""} size={16} aria-hidden="true" />
        Regenerate
      </button>

      {needsConfirmation ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p>This piece has been edited or approved. Regenerating will overwrite the draft fields.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void regenerate(true)}
              disabled={isRegenerating}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              Overwrite draft
            </button>
            <button
              type="button"
              onClick={() => setNeedsConfirmation(false)}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
