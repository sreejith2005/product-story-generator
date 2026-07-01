"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, Check, Copy, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { GuidedAttributeInput } from "@/components/GuidedAttributeInput";
import { PieceStatusBadge } from "@/components/PieceStatusBadge";
import { guidedAttributeOptions, inferGoldToneFromMaterial } from "@/lib/guidedAttributes";
import type { Piece, PieceAttributes } from "@/lib/pieces";

type PieceDetailEditorProps = {
  initialPiece: Piece;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function parseMotifs(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function wordCount(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function PieceDetailEditor({ initialPiece }: PieceDetailEditorProps) {
  const router = useRouter();
  const [piece, setPiece] = useState(initialPiece);
  const [sku, setSku] = useState(initialPiece.sku ?? "");
  const [catalogRef, setCatalogRef] = useState(initialPiece.catalog_ref ?? "");
  const [category, setCategory] = useState(initialPiece.detected_category ?? "Other");
  const [material, setMaterial] = useState(initialPiece.detected_material ?? "Unclear");
  const [goldTone, setGoldTone] = useState(() => inferGoldToneFromMaterial(initialPiece.detected_material));
  const [style, setStyle] = useState(initialPiece.detected_style ?? "Unclear");
  const [contentTone, setContentTone] = useState("");
  const [motifs, setMotifs] = useState<string[]>(() => parseMotifs(initialPiece.detected_motifs));
  const [motifInput, setMotifInput] = useState("");
  const [shortStory, setShortStory] = useState(
    initialPiece.is_edited && initialPiece.final_short_story ? initialPiece.final_short_story : initialPiece.short_story ?? ""
  );
  const [longStory, setLongStory] = useState(
    initialPiece.is_edited && initialPiece.final_long_story ? initialPiece.final_long_story : initialPiece.long_story ?? ""
  );
  const [staffNotes, setStaffNotes] = useState(initialPiece.staff_notes ?? "");
  const [notesOpen, setNotesOpen] = useState(Boolean(initialPiece.staff_notes));
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerateNotes, setRegenerateNotes] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"short" | "long" | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const didMountRef = useRef(false);

  const attributes: PieceAttributes = useMemo(
    () => ({
      category,
      material,
      goldTone,
      contentTone,
      motifs,
      style
    }),
    [category, contentTone, goldTone, material, motifs, style]
  );

  const errorMessage = piece.error_message ?? piece.generation_error;
  const isProcessed = piece.status !== "processing" && piece.status !== "queued";

  function addMotif() {
    const nextMotif = motifInput.trim();

    if (!nextMotif) {
      return;
    }

    setMotifs((current) => (current.includes(nextMotif) ? current : [...current, nextMotif]));
    setMotifInput("");
  }

  async function copyText(field: "short" | "long", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1400);
    } catch {
      setNotice("Clipboard permission was denied.");
    }
  }

  const patchPiece = useCallback(async (action: "autosave" | "approve" | "discard") => {
    const body =
      action === "discard"
        ? { action }
        : {
            action,
            sku,
            catalogRef,
            attributes,
            shortStory,
            longStory,
            staffNotes
          };

    const response = await fetch(`/api/pieces/${piece.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = (await response.json()) as { piece?: Piece; error?: string };

    if (!response.ok || !payload.piece) {
      throw new Error(payload.error ?? "Could not save this piece.");
    }

    setPiece(payload.piece);
    router.refresh();
    return payload.piece;
  }, [attributes, catalogRef, longStory, piece.id, router, shortStory, sku, staffNotes]);

  const autosave = useCallback(async () => {
    setSaveState("saving");

    try {
      await patchPiece("autosave");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [patchPiece]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void autosave();
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [autosave]);

  async function approve() {
    setIsApproving(true);
    setNotice(null);

    try {
      await patchPiece("approve");
      setNotice("Piece approved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not approve this piece.");
    } finally {
      setIsApproving(false);
    }
  }

  async function discard() {
    setIsDiscarding(true);
    setNotice(null);

    try {
      await patchPiece("discard");
      setNotice("Piece discarded.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not discard this piece.");
    } finally {
      setIsDiscarding(false);
    }
  }

  async function regenerateFromAttributes() {
    setIsRegenerating(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/pieces/${piece.id}/regenerate-from-attributes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sku,
          catalogRef,
          attributes,
          staffNotes: regenerateNotes.trim()
        })
      });

      const payload = (await response.json()) as {
        piece?: Piece;
        story?: { shortStory: string; longStory: string };
        error?: string;
      };

      if (!response.ok || !payload.story) {
        throw new Error(payload.error ?? "Could not regenerate stories.");
      }

      setShortStory(payload.story.shortStory);
      setLongStory(payload.story.longStory);

      if (payload.piece) {
        setPiece(payload.piece);
        setCategory(payload.piece.detected_category ?? category);
        setMaterial(payload.piece.detected_material ?? material);
        setStyle(payload.piece.detected_style ?? style);
        setGoldTone(inferGoldToneFromMaterial(payload.piece.detected_material) || goldTone);
      }

      setRegenerateOpen(false);
      setRegenerateNotes("");
      setSaveState("saved");
      setNotice("Stories regenerated.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not regenerate stories.");
      router.refresh();
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-stone/75 bg-porcelain p-5 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="font-serif text-4xl text-charcoal">Piece detail</h1>
          <p className="mt-2 text-sm text-ink/58">ID {piece.id}</p>
          <p className="mt-2 text-xs font-semibold text-ink/50">
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "error" ? "Autosave failed" : "Autosaves edits"}
          </p>
        </div>
        <PieceStatusBadge status={piece.status} hasError={Boolean(errorMessage)} />
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Generation failed</p>
              <p className="mt-1 leading-5">{errorMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRegenerateOpen(true)}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-950 transition hover:border-amber-500"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Retry generation
          </button>
        </div>
      ) : null}

      {notice ? (
        <p className="mt-5 rounded-md border border-stone/75 bg-white px-4 py-3 text-sm text-ink/75">{notice}</p>
      ) : null}

      <section className="mt-7 grid gap-4 sm:grid-cols-2">
        <Field label="SKU">
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder="Optional"
            className="h-11 w-full rounded-md border border-stone bg-white px-3 text-sm text-charcoal outline-none transition focus:border-gold"
          />
        </Field>
        <Field label="Catalog Ref">
          <input
            value={catalogRef}
            onChange={(event) => setCatalogRef(event.target.value)}
            placeholder="Optional"
            className="h-11 w-full rounded-md border border-stone bg-white px-3 text-sm text-charcoal outline-none transition focus:border-gold"
          />
        </Field>
      </section>

      {isProcessed ? (
        <section className="mt-7 rounded-md border border-gold/30 bg-white p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold text-charcoal">Regenerate story</h2>
              <p className="mt-1 text-xs text-ink/55">Use current attributes and optional direction.</p>
            </div>
            <button
              type="button"
              onClick={() => setRegenerateOpen((current) => !current)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-black px-4 text-sm font-semibold text-gold transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Regenerate story
            </button>
          </div>
          {regenerateOpen ? (
            <div className="mt-4 flex flex-col gap-3">
              <input
                value={regenerateNotes}
                onChange={(event) => setRegenerateNotes(event.target.value)}
                placeholder="Any specific direction? (optional)"
                className="h-11 w-full rounded-md border border-stone bg-white px-3 text-sm text-charcoal outline-none transition focus:border-gold"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void regenerateFromAttributes()}
                  disabled={isRegenerating}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-gold px-4 text-sm font-semibold text-charcoal transition hover:bg-brand-black hover:text-gold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isRegenerating ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => setRegenerateOpen(false)}
                  className="h-10 rounded-md border border-stone bg-white px-4 text-sm font-semibold text-charcoal transition hover:border-gold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-7 border-t border-stone/70 pt-6">
        <h2 className="font-serif text-2xl text-charcoal">Detected attributes</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <GuidedAttributeInput id="detail-category" label="Category" value={category} options={guidedAttributeOptions.category} onChange={setCategory} />
          <GuidedAttributeInput id="detail-material" label="Material" value={material} options={guidedAttributeOptions.material} onChange={setMaterial} />
          <GuidedAttributeInput id="detail-gold-tone" label="Gold Tone" value={goldTone} options={guidedAttributeOptions.goldTone} onChange={setGoldTone} />
          <GuidedAttributeInput id="detail-style" label="Style" value={style} options={guidedAttributeOptions.style} onChange={setStyle} />
          <GuidedAttributeInput
            id="detail-content-tone"
            label="Content tone"
            value={contentTone}
            options={guidedAttributeOptions.contentTone}
            emptyLabel="Use description"
            onChange={setContentTone}
          />
          <Field label="Motifs">
            <div className="rounded-md border border-stone bg-white p-2 focus-within:border-gold">
              <div className="flex flex-wrap gap-2">
                {motifs.map((motif) => (
                  <span key={motif} className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-xs font-semibold text-charcoal">
                    {motif}
                    <button type="button" onClick={() => setMotifs((current) => current.filter((item) => item !== motif))} className="text-ink/55 transition hover:text-charcoal" aria-label={`Remove ${motif}`}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={motifInput}
                  onChange={(event) => setMotifInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addMotif();
                    }
                  }}
                  placeholder="Add motif"
                  className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm text-charcoal outline-none"
                />
                <button type="button" onClick={addMotif} className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand-black text-gold transition hover:bg-ink" aria-label="Add motif">
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </Field>
        </div>
      </section>

      <section className="mt-7 space-y-5 border-t border-stone/70 pt-6">
        <StoryTextarea label="Short Story" value={shortStory} copied={copiedField === "short"} rows={5} onChange={setShortStory} onCopy={() => void copyText("short", shortStory)} />
        <StoryTextarea label="Long Story" value={longStory} copied={copiedField === "long"} rows={9} onChange={setLongStory} onCopy={() => void copyText("long", longStory)} />
      </section>

      <section className="mt-7 border-t border-stone/70 pt-6">
        {notesOpen ? (
          <Field label="Request changes note">
            <textarea
              value={staffNotes}
              onChange={(event) => setStaffNotes(event.target.value)}
              rows={4}
              placeholder="Jot down what should change before regenerating."
              className="w-full resize-y rounded-md border border-stone/75 bg-white p-3 text-sm leading-6 text-ink/78 outline-none transition focus:border-gold"
            />
          </Field>
        ) : (
          <button type="button" onClick={() => setNotesOpen(true)} className="text-sm font-semibold text-ink/65 transition hover:text-charcoal">
            Add note
          </button>
        )}
      </section>

      <div className="mt-7 flex flex-col gap-3 border-t border-stone/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => void approve()}
          disabled={isApproving || isDiscarding}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-gold px-5 text-sm font-semibold text-charcoal transition hover:bg-brand-black hover:text-gold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isApproving ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <BadgeCheck size={16} aria-hidden="true" />}
          Approve
        </button>

        <button type="button" onClick={() => void discard()} disabled={isDiscarding} className="text-sm font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60">
          {isDiscarding ? "Discarding..." : "Discard piece"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function StoryTextarea({
  label,
  value,
  rows,
  copied,
  onChange,
  onCopy
}: {
  label: string;
  value: string;
  rows: number;
  copied: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-charcoal">{label}</h3>
        <button type="button" onClick={onCopy} className="inline-flex h-9 items-center gap-2 rounded-md border border-stone bg-white px-3 text-xs font-semibold text-charcoal transition hover:border-gold">
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="mt-2 w-full resize-y rounded-md border border-stone/75 bg-white p-4 text-sm leading-6 text-ink/78 outline-none transition focus:border-gold"
      />
      <p className="mt-2 text-xs text-ink/50">{wordCount(value)} words</p>
    </section>
  );
}
