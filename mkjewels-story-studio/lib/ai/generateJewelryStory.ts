import { cleanKnownAttributes, hasKnownAttributes, mergeGoldToneIntoMaterial, type KnownJewelryAttributes } from "@/lib/guidedAttributes";

export type JewelryStoryResult = {
  category: string;
  material: string;
  motifs: string[];
  style: string;
  shortStory: string;
  longStory: string;
};

type AiProvider = {
  generateJewelryStory(imageUrl: string, knownAttributes?: KnownJewelryAttributes, staffNotes?: string): Promise<JewelryStoryResult>;
  generateJewelryStoryFromAttributes(attributes: JewelryStoryAttributes, staffNotes?: string): Promise<JewelryStoryResult>;
};

type GeminiResponse = {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  steps?: Array<{
    type?: string;
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

export type JewelryStoryAttributes = {
  category: string;
  material: string;
  goldTone?: string;
  contentTone?: string;
  motifs: string[];
  style: string;
};

class MalformedJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedJsonError";
  }
}

const storySchema = {
  type: "object",
  properties: {
    category: {
      type: "string"
    },
    material: {
      type: "string",
      description: "Primary material plus visible gold tone when applicable, for example gold (yellow gold), mixed, CZ, diamond, or unclear."
    },
    motifs: {
      type: "array",
      items: { type: "string" }
    },
    style: {
      type: "string"
    },
    shortStory: {
      type: "string"
    },
    longStory: {
      type: "string"
    }
  },
  required: ["category", "material", "motifs", "style", "shortStory", "longStory"]
};

const brandInstruction = `MK Jewels has been a benchmark for design, craftsmanship, quality, and price since 1999.
India's leading manufacturer and retailer of real diamond, gold, and CZ jewelry, with 5000+ designs, an in-house manufacturing atelier, and showrooms in Mumbai and Ahmedabad.
Every piece blends handmade Indian craftsmanship with modern design. The brand voice is warm, premium but accessible (not elitist/exclusive), rooted in Indian tradition with a modern sensibility, and family-feeling - never overstated or generic AI-marketing-speak.
All gold is BIS hallmarked and diamonds are IGI certified; never claim certification details that aren't visually verifiable from the photo alone.`;

const analysisInstruction = `Analyze the jewelry image and return strict JSON only.

Identify:
- jewelry category: ring, necklace, earrings, bangle, bracelet, pendant, mangalsutra, chain, or other
- primary material: gold, diamond, CZ, mixed, or unclear
- apparent gold tone if visible: yellow gold, rose gold, white gold, or not applicable
- notable motifs that are actually visible: floral, peacock, leaf, geometric, antique/traditional, filigree, minimal, or other clear motifs; use an empty array if none are clear
- style: everyday wear, festive, bridal, statement, or unclear

Write two MKJewels story drafts grounded only in visually identifiable details. Do not invent carat weights, diamond counts, gemstone counts, exact purity, product price, certification specifics, collection names, or occasion claims that cannot be seen from the photo.
If a motif or detail is not clearly visible, do not fabricate it.
shortStory target: 40-60 words for product cards/social captions.
longStory target: roughly 6-7 sentences, about 150-220 words as a guide. Give it a natural arc: open on the visual impression, move into craftsmanship/material details, and close on an emotional or occasion-based note such as gifting, everyday elegance, or celebration only when genuinely fitting. Do not force a story onto a plain design.

Brand voice:
${brandInstruction}`;

const textOnlyStorySchema = {
  type: "object",
  properties: {
    shortStory: {
      type: "string"
    },
    longStory: {
      type: "string"
    }
  },
  required: ["shortStory", "longStory"]
};

const textOnlyInstruction = `Return strict JSON only.

Write two MKJewels story drafts from the staff-confirmed jewelry attributes below. This is a text-only rewrite, so do not infer any visual detail beyond the supplied attributes.
Do not invent carat weights, diamond counts, gemstone counts, exact purity, product price, certification specifics, collection names, or unsupported claims.
shortStory target: 40-60 words for product cards/social captions.
longStory target: roughly 6-7 sentences, about 150-220 words as a guide. Give it a natural arc: open on the visual impression, move into craftsmanship/material details, and close on an emotional or occasion-based note such as gifting, everyday elegance, or celebration only when genuinely fitting.

Brand voice:
${brandInstruction}`;

function getProviderName() {
  return (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
}

function getGeminiModel() {
  return (process.env.GEMINI_MODEL ?? "gemini-3.5-flash").trim();
}

function inferMimeType(imageUrl: string) {
  const pathname = new URL(imageUrl).pathname.toLowerCase();

  if (pathname.endsWith(".png")) {
    return "image/png";
  }

  if (pathname.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

function isJewelryStoryResult(value: unknown): value is JewelryStoryResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<JewelryStoryResult>;

  return (
    typeof candidate.category === "string" &&
    typeof candidate.material === "string" &&
    Array.isArray(candidate.motifs) &&
    candidate.motifs.every((motif) => typeof motif === "string") &&
    typeof candidate.style === "string" &&
    typeof candidate.shortStory === "string" &&
    typeof candidate.longStory === "string"
  );
}

function isStoryDraft(value: unknown): value is Pick<JewelryStoryResult, "shortStory" | "longStory"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<JewelryStoryResult>;

  return typeof candidate.shortStory === "string" && typeof candidate.longStory === "string";
}

function parseStoryJson(text: string): JewelryStoryResult {
  const parsed = JSON.parse(text);

  if (!isJewelryStoryResult(parsed)) {
    throw new MalformedJsonError("Gemini returned JSON that does not match the story schema.");
  }

  return parsed;
}

function parseTextOnlyStoryJson(text: string): Pick<JewelryStoryResult, "shortStory" | "longStory"> {
  const parsed = JSON.parse(text);

  if (!isStoryDraft(parsed)) {
    throw new MalformedJsonError("Gemini returned JSON that does not match the text-only story schema.");
  }

  return parsed;
}

function cleanJsonText(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
}

function getResponseShape(value: unknown) {
  if (!value || typeof value !== "object") {
    return String(value);
  }

  return JSON.stringify(Object.keys(value));
}

function extractGeminiText(data: GeminiResponse) {
  const modelOutputText = data?.steps
    ?.find((step) => step.type === "model_output")
    ?.content?.find((part) => part.text)?.text;

  return data?.text ?? data?.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text ?? modelOutputText;
}

function buildToneInstruction(contentTone?: string) {
  const tone = (contentTone ?? "").trim();
  const normalized = tone.toLowerCase();

  if (!tone || normalized === "product description") {
    return "";
  }

  if (normalized === "story / narrative") {
    return "\n\nContent tone: Story / narrative. Open with a scene or moment, build a brief narrative around who might wear the piece and when, and close with an emotional note while staying grounded in visible details.";
  }

  if (normalized === "feature highlights") {
    return "\n\nContent tone: Feature highlights. Identify 2-3 standout visual or design features. Make the short story a single flowing highlight sentence and expand each feature briefly in the long story.";
  }

  return `\n\nWrite in the following tone/style: ${tone}`;
}

function buildStaffNotesInstruction(staffNotes?: string) {
  const notes = (staffNotes ?? "").trim();
  return notes ? `\n\nAdditional direction from staff: ${notes}. Please incorporate this into the story.` : "";
}

function buildVisionInstruction(knownAttributes?: KnownJewelryAttributes, retryContext?: string, staffNotes?: string) {
  const cleanedAttributes = cleanKnownAttributes(knownAttributes);
  const hasConfirmedAttributes = hasKnownAttributes(cleanedAttributes);
  const retryInstruction = retryContext ? `\n\nPrevious JSON parse error: ${retryContext}. Return valid JSON only.` : "";
  const toneInstruction = buildToneInstruction(cleanedAttributes.contentTone);
  const staffNotesInstruction = buildStaffNotesInstruction(staffNotes);

  if (!hasConfirmedAttributes) {
    return `${analysisInstruction}${toneInstruction}${staffNotesInstruction}${retryInstruction}`;
  }

  const confirmedLines = [
    cleanedAttributes.category ? `category: ${cleanedAttributes.category}` : null,
    cleanedAttributes.material ? `material: ${cleanedAttributes.material}` : null,
    cleanedAttributes.goldTone ? `gold tone: ${cleanedAttributes.goldTone}` : null,
    cleanedAttributes.contentTone ? `content tone: ${cleanedAttributes.contentTone}` : null,
    cleanedAttributes.style ? `style: ${cleanedAttributes.style}` : null
  ].filter(Boolean);

  return `${analysisInstruction}${toneInstruction}${staffNotesInstruction}

Staff-confirmed attributes below are ground truth. Use these exact confirmed values instead of re-deriving them from the image. Use vision only to detect remaining unset attributes, visible motifs, and other visual details that are actually clear.
If material and gold tone are both confirmed, reflect both in the material field when applicable.

Confirmed attributes:
${confirmedLines.join("\n")}${retryInstruction}`;
}

function applyKnownAttributeFallbacks(story: JewelryStoryResult, knownAttributes?: KnownJewelryAttributes): JewelryStoryResult {
  const cleanedAttributes = cleanKnownAttributes(knownAttributes);

  if (!hasKnownAttributes(cleanedAttributes)) {
    return story;
  }

  const nextStory = { ...story };

  if (cleanedAttributes.category) {
    nextStory.category = cleanedAttributes.category;
  }

  if (cleanedAttributes.material) {
    nextStory.material = mergeGoldToneIntoMaterial(cleanedAttributes.material, cleanedAttributes.goldTone);
  } else if (cleanedAttributes.goldTone) {
    nextStory.material = mergeGoldToneIntoMaterial(nextStory.material, cleanedAttributes.goldTone);
  }

  if (cleanedAttributes.style) {
    nextStory.style = cleanedAttributes.style;
  }

  return nextStory;
}

async function callGemini(
  imageUrl: string,
  knownAttributes?: KnownJewelryAttributes,
  staffNotes?: string,
  retryContext?: string
): Promise<JewelryStoryResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      model: getGeminiModel(),
      input: [
        {
          type: "text",
          text: buildVisionInstruction(knownAttributes, retryContext, staffNotes)
        },
        {
          type: "image",
          uri: imageUrl,
          mime_type: inferMimeType(imageUrl)
        }
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: storySchema
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed with ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const rawText = extractGeminiText(payload);

  if (!rawText) {
    throw new MalformedJsonError(`Gemini returned no text. Response shape: ${getResponseShape(payload)}`);
  }

  return applyKnownAttributeFallbacks(parseStoryJson(cleanJsonText(rawText)), knownAttributes);
}

async function callGeminiTextOnly(
  attributes: JewelryStoryAttributes,
  staffNotes?: string,
  retryContext?: string
): Promise<JewelryStoryResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      model: getGeminiModel(),
      input: [
        {
          type: "text",
          text: `${textOnlyInstruction}${buildToneInstruction(attributes.contentTone)}${buildStaffNotesInstruction(staffNotes)}${retryContext ? `\n\nPrevious JSON parse error: ${retryContext}. Return valid JSON only.` : ""}

Staff-confirmed attributes:
category: ${attributes.category}
material: ${attributes.material}
gold tone: ${attributes.goldTone || "not specified"}
content tone: ${attributes.contentTone || "Product description"}
motifs: ${attributes.motifs.length ? attributes.motifs.join(", ") : "none"}
style: ${attributes.style}`
        }
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: textOnlyStorySchema
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed with ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const rawText = extractGeminiText(payload);

  if (!rawText) {
    throw new MalformedJsonError(`Gemini returned no text. Response shape: ${getResponseShape(payload)}`);
  }

  const draft = parseTextOnlyStoryJson(cleanJsonText(rawText));
  const material = mergeGoldToneIntoMaterial(attributes.material, attributes.goldTone);

  return {
    ...attributes,
    material,
    shortStory: draft.shortStory,
    longStory: draft.longStory
  };
}

const geminiProvider: AiProvider = {
  async generateJewelryStory(imageUrl: string, knownAttributes?: KnownJewelryAttributes, staffNotes?: string) {
    try {
      return await callGemini(imageUrl, knownAttributes, staffNotes);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof MalformedJsonError) {
        return callGemini(imageUrl, knownAttributes, staffNotes, error.message);
      }

      throw error;
    }
  },
  async generateJewelryStoryFromAttributes(attributes: JewelryStoryAttributes, staffNotes?: string) {
    try {
      return await callGeminiTextOnly(attributes, staffNotes);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof MalformedJsonError) {
        return callGeminiTextOnly(attributes, staffNotes, error.message);
      }

      throw error;
    }
  }
};

function getProvider(): AiProvider {
  switch (getProviderName()) {
    case "gemini":
      return geminiProvider;
    default:
      throw new Error(`Unsupported AI_PROVIDER: ${getProviderName()}`);
  }
}

export async function generateJewelryStory(
  imageUrl: string,
  knownAttributes?: KnownJewelryAttributes,
  staffNotes?: string
): Promise<JewelryStoryResult> {
  return getProvider().generateJewelryStory(imageUrl, knownAttributes, staffNotes);
}

export async function generateJewelryStoryFromAttributes(
  attributes: JewelryStoryAttributes,
  staffNotes?: string
): Promise<JewelryStoryResult> {
  return getProvider().generateJewelryStoryFromAttributes(attributes, staffNotes);
}
