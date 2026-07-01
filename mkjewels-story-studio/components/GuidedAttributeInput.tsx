"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { letAiDecideValue } from "@/lib/guidedAttributes";

const customSelectValue = "__custom__";

type GuidedAttributeInputProps = {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
};

export function GuidedAttributeInput({
  id,
  label,
  value,
  options,
  onChange,
  emptyLabel = "Let AI Decide"
}: GuidedAttributeInputProps) {
  const isPreset = useMemo(() => !value || options.includes(value), [options, value]);
  const [isCustom, setIsCustom] = useState(Boolean(value && !isPreset));

  useEffect(() => {
    setIsCustom(Boolean(value && !options.includes(value)));
  }, [options, value]);

  function cancelCustom() {
    onChange(letAiDecideValue);
    setIsCustom(false);
  }

  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">{label}</span>
      <span className="mt-2 flex min-h-11 gap-2">
        {isCustom ? (
          <>
            <input
              id={id}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={`Custom ${label.toLowerCase()}`}
              className="h-11 min-w-0 flex-1 rounded-md border border-gold/60 bg-white px-3 text-sm text-charcoal outline-none transition focus:border-gold"
            />
            <button
              type="button"
              onClick={cancelCustom}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-stone bg-white text-ink/65 transition hover:border-gold hover:text-charcoal"
              aria-label={`Cancel custom ${label}`}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </>
        ) : (
          <select
            id={id}
            value={value || letAiDecideValue}
            onChange={(event) => {
              if (event.target.value === customSelectValue) {
                onChange("");
                setIsCustom(true);
                return;
              }

              onChange(event.target.value);
            }}
            className="h-11 w-full rounded-md border border-stone bg-white px-3 text-sm text-charcoal outline-none transition focus:border-gold"
          >
            <option value={letAiDecideValue}>- {emptyLabel} -</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={customSelectValue}>Custom...</option>
          </select>
        )}
      </span>
      {isCustom ? (
        <button
          type="button"
          onClick={cancelCustom}
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-ink/55 transition hover:text-charcoal"
        >
          <ArrowLeft size={12} aria-hidden="true" />
          Back to presets
        </button>
      ) : null}
    </label>
  );
}
