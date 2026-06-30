"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Copy, Loader2, Plus, RefreshCw, Save, Undo2, X } from "lucide-react";
import { PieceStatusBadge } from "@/components/PieceStatusBadge";
import type { Piece, PieceAttributes } from "@/lib/pieces";

type PieceDetailEditorProps = {
  initialPiece: Piece;
};

type Notice = {
  type: "success" | "error";
  message: string;
};

const categoryOptions = ["ring", "necklace", "earrings", "bangle", "bracelet", "pendant", "mangalsutra", "chain", "other"];
const materialOptions = ["gold", "gold (yellow gold)", "gold (rose gold)", "gold (white gold)", "diamond", "CZ", "mixed", "unclear"];
const styleOptions = ["everyday wear", "festive", "bridal", "statement", "unclear"];

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

function optionsWithCurrent(options: string[], current: string) {
  if (!current || options.includes(current)) {
    return options;
  }

  return [current, ...options];
}

export function PieceDetailEditor({ initialPiece }: PieceDetailEditorProps) {
  const router = useRouter();
  const [piece, setPiece] = useState(initialPiece);
  const [sku, setSku] = useState(initialPiece.sku ?? "");
  const [catalogRef, setCatalogRef] = useState(initialPiece.catalog_ref ?? "");
  const [category, setCategory] = useState(initialPiece.detected_category ?? "other");
  const [material, setMaterial] = useState(initialPiece.detected_material ?? "unclear");
  const [style, setStyle] = useState(initialPiece.detected_style ?? "unclear");
  const [motifs, setMotifs] = useState<string[]>(() => parseMotifs(initialPiece.detected_motifs));
  const [motifInput, setMotifInput] = useState("");
  const [shortStory, setShortStory] = useState(
    initialPiece.is_edited && initialPiece.final_short_story ? initialPiece.final_short_story : initialPiece.short_story ?? ""
  );
  const [longStory, setLongStory] = useState(
    initialPiece.is_edited && initialPiece.final_long_story ? initialPiece.final_long_story : initialPiece.long_story ?? ""
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copiedField, setCopiedField] = useState<"short" | "long" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const attributes: PieceAttributes = useMemo(
    () => ({
      category,
      material,
      motifs,
      style
    }),
    [category, material, motifs, style]
  );

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
      setNotice({ type: "error", message: "Clipboard permission was denied." });
    }
  }

  async function persist(action: "save-draft" | "approve" | "revert-to-draft") {
    if (action === "save-draft") {
      setIsSaving(true);
    } else if (action === "approve") {
      setIsApproving(true);
    } else {
      setIsReverting(true);
    }

    setNotice(null);

    try {
      const response = await fetch(`/api/pieces/${piece.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          sku,
          catalogRef,
          attributes,
          shortStory,
          longStory
        })
      });

      const payload = (await response.json()) as { piece?: Piece; error?: string };

      if (!response.ok || !payload.piece) {
        throw new Error(payload.error ?? "Could not save this piece.");
      }

      setPiece(payload.piece);
      setNotice({
        type: "success",
        message:
          action === "approve"
            ? "Piece approved."
            : action === "revert-to-draft"
              ? "Piece reverted to draft."
              : "Draft saved."
      });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not save this piece." });
    } finally {
      setIsSaving(false);
      setIsApproving(false);
      setIsReverting(false);
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
          attributes
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
      }

      setNotice({ type: "success", message: "Stories regenerated from current attributes." });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not regenerate stories." });
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
        </div>
        <PieceStatusBadge status={piece.status} />
      </div>

      {notice ? (
        <p
          className={`mt-5 rounded-md border px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border-sage/25 bg-sage/10 text-sage"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </p>
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

      <section className="mt-7 border-t border-stone/70 pt-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h2 className="font-serif text-2xl text-charcoal">Detected attributes</h2>
          <button
            type="button"
            onClick={() => void regenerateFromAttributes()}
            disabled={isRegenerating}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone bg-white px-4 text-sm font-semibold text-charcoal transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={isRegenerating ? "animate-spin" : ""} size={16} aria-hidden="true" />
            Regenerate from current attributes
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 w-full rounded-md border border-stone bg-white px-3 text-sm capitalize text-charcoal outline-none transition focus:border-gold"
            >
              {optionsWithCurrent(categoryOptions, category).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Material">
            <select
              value={material}
              onChange={(event) => setMaterial(event.target.value)}
              className="h-11 w-full rounded-md border border-stone bg-white px-3 text-sm text-charcoal outline-none transition focus:border-gold"
            >
              {optionsWithCurrent(materialOptions, material).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Motifs">
            <div className="rounded-md border border-stone bg-white p-2 focus-within:border-gold">
              <div className="flex flex-wrap gap-2">
                {motifs.map((motif) => (
                  <span
                    key={motif}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-xs font-semibold text-charcoal"
                  >
                    {motif}
                    <button
                      type="button"
                      onClick={() => setMotifs((current) => current.filter((item) => item !== motif))}
                      className="text-ink/55 transition hover:text-charcoal"
                      aria-label={`Remove ${motif}`}
                    >
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
                <button
                  type="button"
                  onClick={addMotif}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand-black text-gold transition hover:bg-ink"
                  aria-label="Add motif"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </Field>
          <Field label="Style">
            <select
              value={style}
              onChange={(event) => setStyle(event.target.value)}
              className="h-11 w-full rounded-md border border-stone bg-white px-3 text-sm text-charcoal outline-none transition focus:border-gold"
            >
              {optionsWithCurrent(styleOptions, style).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="mt-7 space-y-5 border-t border-stone/70 pt-6">
        <StoryTextarea
          label="Short Story"
          value={shortStory}
          copied={copiedField === "short"}
          rows={5}
          onChange={setShortStory}
          onCopy={() => void copyText("short", shortStory)}
        />
        <StoryTextarea
          label="Long Story"
          value={longStory}
          copied={copiedField === "long"}
          rows={9}
          onChange={setLongStory}
          onCopy={() => void copyText("long", longStory)}
        />
      </section>

      {piece.generation_error ? (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Generation failed: {piece.generation_error}
        </p>
      ) : null}

      <div className="mt-7 flex flex-col gap-3 border-t border-stone/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void persist("save-draft")}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-stone bg-white px-5 text-sm font-semibold text-charcoal transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => void persist("approve")}
            disabled={isApproving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gold px-5 text-sm font-semibold text-charcoal transition hover:bg-brand-black hover:text-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isApproving ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <BadgeCheck size={16} aria-hidden="true" />}
            Approve
          </button>
        </div>

        {piece.status === "approved" ? (
          <button
            type="button"
            onClick={() => void persist("revert-to-draft")}
            disabled={isReverting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-ink/68 transition hover:bg-stone/25 hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReverting ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <Undo2 size={15} aria-hidden="true" />}
            Revert to Draft
          </button>
        ) : null}
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
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-stone bg-white px-3 text-xs font-semibold text-charcoal transition hover:border-gold"
        >
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
