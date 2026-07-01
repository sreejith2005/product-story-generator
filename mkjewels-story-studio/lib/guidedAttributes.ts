export type KnownJewelryAttributes = {
  category?: string;
  material?: string;
  goldTone?: string;
  style?: string;
  contentTone?: string;
};

export const letAiDecideValue = "";
export const defaultContentToneValue = "";

export const guidedAttributeOptions = {
  category: ["Ring", "Necklace", "Earrings", "Bangle", "Bracelet", "Pendant", "Mangalsutra", "Chain", "Other"],
  material: ["Gold", "Diamond", "CZ", "Mixed"],
  goldTone: ["Yellow", "Rose", "White", "N/A"],
  style: ["Everyday", "Festive", "Bridal", "Statement"],
  contentTone: ["Product description", "Story / narrative", "Feature highlights"]
} as const;

export function cleanKnownAttributes(attributes: KnownJewelryAttributes | null | undefined): KnownJewelryAttributes {
  if (!attributes) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(attributes)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
      .filter(([, value]) => value)
  ) as KnownJewelryAttributes;
}

export function hasKnownAttributes(attributes: KnownJewelryAttributes | null | undefined): boolean {
  return Object.keys(cleanKnownAttributes(attributes)).length > 0;
}

export function inferGoldToneFromMaterial(material: string | null | undefined): string {
  const normalized = (material ?? "").toLowerCase();

  if (normalized.includes("yellow")) {
    return "Yellow";
  }

  if (normalized.includes("rose")) {
    return "Rose";
  }

  if (normalized.includes("white")) {
    return "White";
  }

  if (normalized.includes("not applicable") || normalized === "n/a") {
    return "N/A";
  }

  return letAiDecideValue;
}

export function mergeGoldToneIntoMaterial(material: string, goldTone?: string): string {
  const cleanMaterial = material.trim();
  const cleanGoldTone = (goldTone ?? "").trim();

  if (!cleanMaterial || !cleanGoldTone || cleanGoldTone.toLowerCase() === "n/a") {
    return cleanMaterial;
  }

  if (cleanMaterial.toLowerCase().includes(cleanGoldTone.toLowerCase())) {
    return cleanMaterial;
  }

  if (cleanMaterial.toLowerCase() === "gold") {
    return `gold (${cleanGoldTone.toLowerCase()} gold)`;
  }

  return cleanMaterial;
}
