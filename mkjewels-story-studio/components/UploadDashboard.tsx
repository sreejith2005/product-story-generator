"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { GuidedAttributeInput as InlineGuidedAttributeInput } from "@/components/GuidedAttributeInput";
import { PieceStatusBadge } from "@/components/PieceStatusBadge";
import { cleanKnownAttributes, guidedAttributeOptions, letAiDecideValue, type KnownJewelryAttributes } from "@/lib/guidedAttributes";
import type { Piece } from "@/lib/pieces";

type UploadDashboardProps = {
  initialPieces: Piece[];
};

type UploadNotice = {
  type: "success" | "error";
  message: string;
};

type UploadFileError = {
  fileName: string;
  error: string;
  detail?: string;
};

type PieceFilter = "all" | "ready" | "approved";
type ExportMode = "selected" | "approved";

const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxSize = 10 * 1024 * 1024;

function normalizeUploadedPiece(item: {
  id: string;
  url: string;
  image_hash?: string | null;
  status: Piece["status"];
  created_at: string;
}): Piece {
  return {
    id: item.id,
    image_url: item.url,
    image_hash: item.image_hash ?? null,
    status: item.status,
    created_at: item.created_at,
    updated_at: item.created_at,
    sku: null,
    catalog_ref: null,
    detected_category: null,
    detected_material: null,
    detected_motifs: null,
    detected_style: null,
    short_story: null,
    long_story: null,
    final_short_story: null,
    final_long_story: null,
    staff_notes: null,
    error_message: null,
    generation_error: null,
    generation_error_at: null,
    is_edited: false,
    uploaded_by: null
  };
}

export function UploadDashboard({ initialPieces }: UploadDashboardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pieces, setPieces] = useState<Piece[]>(initialPieces);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const [fileErrors, setFileErrors] = useState<UploadFileError[]>([]);
  const [knownAttributes, setKnownAttributes] = useState<KnownJewelryAttributes>({
    category: letAiDecideValue,
    material: letAiDecideValue,
    goldTone: letAiDecideValue,
    style: letAiDecideValue,
    contentTone: letAiDecideValue
  });
  const [filter, setFilter] = useState<PieceFilter>("all");
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState<ExportMode | null>(null);
  const [generatingPieceId, setGeneratingPieceId] = useState<string | null>(null);

  const latestPiece = pieces.find((piece) => piece.status !== "discarded");

  const hasPieces = useMemo(() => pieces.length > 0, [pieces.length]);
  const hasProcessingPieces = useMemo(() => pieces.some((piece) => piece.status === "processing"), [pieces]);
  const filteredPieces = useMemo(() => {
    const visiblePieces = showDiscarded ? pieces : pieces.filter((piece) => piece.status !== "discarded");

    if (filter === "all") {
      return visiblePieces;
    }

    return visiblePieces.filter((piece) => piece.status === filter);
  }, [filter, pieces, showDiscarded]);

  const filterCounts = useMemo(
    () => ({
      all: pieces.length,
      ready: pieces.filter((piece) => piece.status === "ready").length,
      approved: pieces.filter((piece) => piece.status === "approved").length
    }),
    [pieces]
  );

  const refreshPieces = useCallback(async () => {
    const response = await fetch("/api/pieces", {
      cache: "no-store"
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { pieces?: Piece[] };

    if (Array.isArray(payload.pieces)) {
      setPieces(payload.pieces);
    }
  }, []);

  useEffect(() => {
    if (!hasProcessingPieces) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshPieces();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [hasProcessingPieces, refreshPieces]);

  useEffect(() => {
    setSelectedPieceIds((current) => {
      const validIds = new Set(pieces.map((piece) => piece.id));
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [pieces]);

  function toggleSelection(pieceId: string) {
    setSelectedPieceIds((current) => {
      const next = new Set(current);

      if (next.has(pieceId)) {
        next.delete(pieceId);
      } else {
        next.add(pieceId);
      }

      return next;
    });
  }

  const downloadExport = useCallback(async (body: Record<string, unknown>, mode: ExportMode) => {
    setExporting(mode);
    setNotice(null);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Export failed.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "mkjewels-stories.csv";
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setNotice({
        type: "success",
        message: mode === "approved" ? "Approved pieces exported." : "Selected pieces exported."
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Export failed."
      });
    } finally {
      setExporting(null);
    }
  }, []);

  function exportSelectedPieces() {
    void downloadExport({ ids: Array.from(selectedPieceIds) }, "selected");
  }

  function exportApprovedPieces() {
    void downloadExport({ status: "approved" }, "approved");
  }

  function updateKnownAttribute(field: keyof KnownJewelryAttributes, value: string) {
    setKnownAttributes((current) => ({ ...current, [field]: value }));
  }

  async function readJsonResponse(response: Response) {
    return (await response.json().catch(() => ({
      error: "Upload failed",
      detail: "Server returned an invalid response."
    }))) as {
      pieces?: Array<{
        id: string;
        url: string;
        image_hash?: string | null;
        status: Piece["status"];
        created_at: string;
        duplicateOf?: { id: string; status: Piece["status"]; created_at: string } | null;
      }>;
      errors?: UploadFileError[];
      error?: string;
      detail?: string;
    };
  }

  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const acceptedFiles = files.filter((file) => allowedTypes.includes(file.type) && file.size <= maxSize);
    const rejectedCount = files.length - acceptedFiles.length;

    if (acceptedFiles.length === 0) {
      setNotice({
        type: "error",
        message: "Choose JPG, PNG, or WEBP images under 10MB each."
      });
      return;
    }

    const formData = new FormData();
    acceptedFiles.forEach((file) => formData.append("files", file));
    formData.append("knownAttributes", JSON.stringify(cleanKnownAttributes(knownAttributes)));

    setIsUploading(true);
    setNotice(null);
    setFileErrors([]);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      const payload = await readJsonResponse(response);

      if (!response.ok) {
        setFileErrors(
          payload.errors?.length
            ? payload.errors
            : acceptedFiles.map((file) => ({
                fileName: file.name,
                error: payload.error ?? "Upload failed",
                detail: payload.detail
              }))
        );
        throw new Error(payload.error ? `Upload failed: ${payload.error} - contact admin` : "Upload failed.");
      }

      const uploadedPieces = Array.isArray(payload.pieces) ? payload.pieces.map(normalizeUploadedPiece) : [];

      if (uploadedPieces.length) {
        setPieces((current) => [...uploadedPieces, ...current]);
      }

      setFileErrors(payload.errors ?? []);
      setNotice({
        type: uploadedPieces.length ? "success" : "error",
        message: `${uploadedPieces.length} image${uploadedPieces.length === 1 ? "" : "s"} uploaded.${payload.errors?.length ? ` ${payload.errors.length} failed.` : ""}${rejectedCount ? ` ${rejectedCount} skipped.` : ""}`
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Upload failed."
      });
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }, [knownAttributes]);

  async function generatePiece(piece: Piece, forceDuplicate = false) {
    if (!knownAttributes.contentTone) {
      setNotice({ type: "error", message: "Select a content tone before generating the story." });
      return;
    }

    setGeneratingPieceId(piece.id);
    setNotice(null);

    try {
      const response = await fetch(`/api/pieces/${piece.id}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          knownAttributes: cleanKnownAttributes(knownAttributes),
          forceDuplicate
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        piece?: Piece;
        requiresDuplicateConfirmation?: boolean;
      };

      if (response.status === 409 && payload.requiresDuplicateConfirmation) {
        const shouldGenerate = window.confirm(
          payload.error ?? "This image has been uploaded already. Do you want to generate another story for it?"
        );

        if (shouldGenerate) {
          await generatePiece(piece, true);
        }

        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start story generation.");
      }

      if (payload.piece) {
        setPieces((current) => current.map((currentPiece) => (currentPiece.id === piece.id ? payload.piece! : currentPiece)));
      } else {
        await refreshPieces();
      }

      setNotice({ type: "success", message: payload.piece?.error_message ? "Story generation failed." : "Story generated." });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Could not start story generation."
      });
    } finally {
      setGeneratingPieceId(null);
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-serif text-4xl leading-tight text-charcoal sm:text-5xl">
              Upload jewelry pieces
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/68">
              Add product images for analysis and MKJewels story drafting.
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-gold px-5 text-sm font-semibold text-charcoal transition hover:bg-brand-black hover:text-gold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <ImagePlus size={17} aria-hidden="true" />}
            Add images
          </button>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void uploadFiles(event.dataTransfer.files);
          }}
          className={`rounded-lg border border-dashed px-6 py-10 text-center transition ${
            isDragging
              ? "border-gold bg-gold/8"
              : "border-stone bg-porcelain/76 hover:border-gold/70 hover:bg-white/70"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) {
                void uploadFiles(event.target.files);
              }
            }}
          />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-brand-black text-gold">
            {isUploading ? <Loader2 className="animate-spin" size={24} aria-hidden="true" /> : <UploadCloud size={24} aria-hidden="true" />}
          </div>
          <p className="mt-5 text-base font-semibold text-charcoal">
            Drop images here or click to browse
          </p>
          <p className="mt-2 text-sm text-ink/62">JPG, PNG, WEBP. Multiple files allowed. Max 10MB each.</p>
        </div>

        <div className="rounded-lg border border-stone/75 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-serif text-2xl text-charcoal">Guided attributes</h2>
              <p className="mt-1 text-sm text-ink/58">Optional. Leave blank to let AI decide from the image.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <InlineGuidedAttributeInput
              id="upload-category"
              label="Category"
              value={knownAttributes.category ?? ""}
              options={guidedAttributeOptions.category}
              onChange={(value) => updateKnownAttribute("category", value)}
            />
            <InlineGuidedAttributeInput
              id="upload-material"
              label="Material"
              value={knownAttributes.material ?? ""}
              options={guidedAttributeOptions.material}
              onChange={(value) => updateKnownAttribute("material", value)}
            />
            <InlineGuidedAttributeInput
              id="upload-gold-tone"
              label="Gold Tone"
              value={knownAttributes.goldTone ?? ""}
              options={guidedAttributeOptions.goldTone}
              onChange={(value) => updateKnownAttribute("goldTone", value)}
            />
            <InlineGuidedAttributeInput
              id="upload-style"
              label="Style"
              value={knownAttributes.style ?? ""}
              options={guidedAttributeOptions.style}
              onChange={(value) => updateKnownAttribute("style", value)}
            />
            <InlineGuidedAttributeInput
              id="upload-content-tone"
              label="Content tone"
              value={knownAttributes.contentTone ?? ""}
              options={guidedAttributeOptions.contentTone}
              emptyLabel="Select content tone"
              required
              onChange={(value) => updateKnownAttribute("contentTone", value)}
            />
          </div>
        </div>

        {notice ? (
          <p
            className={`rounded-md border px-4 py-3 text-sm ${
              notice.type === "success"
                ? "border-sage/25 bg-sage/10 text-sage"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {notice.message}
          </p>
        ) : null}

        {fileErrors.length ? (
          <div className="break-words rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">Some files could not be uploaded.</p>
            <ul className="mt-2 space-y-1">
              {fileErrors.map((fileError) => (
                <li key={`${fileError.fileName}-${fileError.error}`}>
                  <span className="font-semibold">{fileError.fileName}:</span> Upload failed: {fileError.error}
                  {fileError.error.toLowerCase().includes("not configured") ? " - contact admin" : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="font-serif text-2xl text-charcoal">Pieces</h2>
              <p className="mt-1 text-sm text-ink/58">{filteredPieces.length} shown, {pieces.length} total</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={exportApprovedPieces}
                disabled={filterCounts.approved === 0 || exporting !== null}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-stone bg-white px-4 text-sm font-semibold text-charcoal transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {exporting === "approved" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                Export All Approved
              </button>
              <button
                type="button"
                onClick={exportSelectedPieces}
                disabled={selectedPieceIds.size === 0 || exporting !== null}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-stone bg-white px-4 text-sm font-semibold text-charcoal transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {exporting === "selected" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                Export Selected
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid w-full grid-cols-3 rounded-md border border-stone/75 bg-white p-1 sm:inline-flex sm:w-auto">
              {(["all", "ready", "approved"] as const).map((filterOption) => (
                <button
                  key={filterOption}
                  type="button"
                  onClick={() => setFilter(filterOption)}
                  className={`h-9 rounded px-3 text-sm font-semibold capitalize transition ${
                    filter === filterOption
                      ? "bg-brand-black text-gold"
                      : "text-ink/66 hover:bg-cream hover:text-charcoal"
                  }`}
                >
                  {filterOption === "all" ? "All" : filterOption === "ready" ? "Ready for review" : "Approved"} ({filterCounts[filterOption]})
                </button>
              ))}
            </div>
            <label className="inline-flex h-9 items-center gap-2 rounded-md border border-stone/75 bg-white px-3 text-sm font-semibold text-ink/68">
              <input
                type="checkbox"
                checked={showDiscarded}
                onChange={(event) => setShowDiscarded(event.target.checked)}
                className="h-4 w-4 accent-gold"
              />
              Show discarded
            </label>
            {selectedPieceIds.size ? (
              <button
                type="button"
                onClick={() => setSelectedPieceIds(new Set())}
                className="text-sm font-semibold text-ink/58 transition hover:text-charcoal"
              >
                Clear {selectedPieceIds.size} selected
              </button>
            ) : null}
          </div>

          {hasPieces && filteredPieces.length ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPieces.map((piece) => (
                <div
                  key={piece.id}
                  className="group relative overflow-hidden rounded-lg border border-stone/75 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-soft"
                >
                  <label className="absolute left-3 top-3 z-10 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-stone/80 bg-white/92 shadow-sm transition hover:border-gold">
                    <input
                      type="checkbox"
                      checked={selectedPieceIds.has(piece.id)}
                      onChange={() => toggleSelection(piece.id)}
                      className="h-4 w-4 accent-gold"
                      aria-label={`Select ${piece.sku || `Piece ${piece.id.slice(0, 8)}`}`}
                    />
                  </label>
                  <Link href={`/piece/${piece.id}`} className="block">
                    <div className="relative aspect-[4/3] bg-cream">
                      <Image
                        src={piece.image_url}
                        alt="Uploaded jewelry piece"
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        className="object-cover transition duration-300 group-hover:scale-[1.025]"
                      />
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-1 text-sm font-semibold text-charcoal">
                          {piece.sku || `Piece ${piece.id.slice(0, 8)}`}
                        </p>
                        <PieceStatusBadge status={piece.status} hasError={Boolean(piece.error_message ?? piece.generation_error)} />
                      </div>
                      <p className="text-xs text-ink/55">
                        Uploaded {new Date(piece.created_at).toLocaleDateString()}
                      </p>
                      {piece.error_message ?? piece.generation_error ? (
                        <p
                          className="line-clamp-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-5 text-amber-900"
                          title={piece.error_message ?? piece.generation_error ?? undefined}
                        >
                          Warning: {piece.error_message ?? piece.generation_error}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          ) : hasPieces ? (
            <div className="rounded-lg border border-stone/75 bg-porcelain px-6 py-12 text-center">
              <p className="font-serif text-2xl text-charcoal">No {filter} pieces</p>
              <p className="mt-2 text-sm text-ink/60">
                Switch filters or show discarded pieces.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-stone/75 bg-porcelain px-6 py-12 text-center">
              <p className="font-serif text-2xl text-charcoal">No pieces uploaded yet</p>
              <p className="mt-2 text-sm text-ink/60">
                Upload jewelry photos to create persisted piece records.
              </p>
            </div>
          )}
        </div>
      </section>

      <aside className="h-fit rounded-lg border border-stone/75 bg-porcelain p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Preview</p>
        <h2 className="mt-3 font-serif text-3xl text-charcoal">Piece detail</h2>
        {latestPiece ? (
          <div className="mt-5 space-y-4">
            <div className="relative aspect-square overflow-hidden rounded-md bg-cream">
              <Image src={latestPiece.image_url} alt="Latest uploaded jewelry piece" fill className="object-cover" />
            </div>
            <PieceStatusBadge status={latestPiece.status} />
            <p className="text-sm leading-6 text-ink/65">
              Generate from the latest image using the guided attributes selected on this page.
            </p>
            <button
              type="button"
              onClick={() => void generatePiece(latestPiece)}
              disabled={generatingPieceId === latestPiece.id}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-stone bg-white px-4 text-sm font-semibold text-charcoal transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generatingPieceId === latestPiece.id ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              Generate story
            </button>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-ink/65">
            Upload an image to see the most recent piece here and open the review workflow.
          </p>
        )}
      </aside>
    </div>
  );
}

function LegacyGuidedAttributeInput({
  id,
  label,
  value,
  options,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">{label}</span>
      <input
        value={value}
        list={`${id}-options`}
        onChange={(event) => onChange(event.target.value)}
        placeholder="— Let AI Decide —"
        className="mt-2 h-11 w-full rounded-md border border-stone bg-white px-3 text-sm text-charcoal outline-none transition focus:border-gold"
      />
      <datalist id={`${id}-options`}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}
