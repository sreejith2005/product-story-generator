export type JewelryStoryResult = {
  category: string;
  material: string;
  motifs: string[];
  style: string;
  shortStory: string;
  longStory: string;
};

type AiProvider = {
  generateJewelryStory(imageUrl: string): Promise<JewelryStoryResult>;
  generateJewelryStoryFromAttributes(attributes: JewelryStoryAttributes): Promise<JewelryStoryResult>;
};

export type JewelryStoryAttributes = {
  category: string;
  material: string;
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
      type: "string",
      enum: ["ring", "necklace", "earrings", "bangle", "bracelet", "pendant", "mangalsutra", "chain", "other"]
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
      type: "string",
      enum: ["everyday wear", "festive", "bridal", "statement", "unclear"]
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
longStory target: 120-180 words for product page descriptions.
The long story may include an imaginative narrative angle only when justified by an actually visible motif. Do not force a story onto a plain design.

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
longStory target: 120-180 words for product page descriptions.

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

async function callGemini(imageUrl: string, retryContext?: string): Promise<JewelryStoryResult> {
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
          text: retryContext ? `${analysisInstruction}\n\nPrevious JSON parse error: ${retryContext}. Return valid JSON only.` : analysisInstruction
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

  const payload = (await response.json()) as { output_text?: string };
  const outputText = payload.output_text;

  if (!outputText) {
    throw new MalformedJsonError("Gemini response did not include output_text.");
  }

  return parseStoryJson(outputText);
}

async function callGeminiTextOnly(
  attributes: JewelryStoryAttributes,
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
          text: `${retryContext ? `${textOnlyInstruction}\n\nPrevious JSON parse error: ${retryContext}. Return valid JSON only.` : textOnlyInstruction}

Staff-confirmed attributes:
category: ${attributes.category}
material: ${attributes.material}
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

  const payload = (await response.json()) as { output_text?: string };
  const outputText = payload.output_text;

  if (!outputText) {
    throw new MalformedJsonError("Gemini response did not include output_text.");
  }

  const draft = parseTextOnlyStoryJson(outputText);

  return {
    ...attributes,
    shortStory: draft.shortStory,
    longStory: draft.longStory
  };
}

const geminiProvider: AiProvider = {
  async generateJewelryStory(imageUrl: string) {
    try {
      return await callGemini(imageUrl);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof MalformedJsonError) {
        return callGemini(imageUrl, error.message);
      }

      throw error;
    }
  },
  async generateJewelryStoryFromAttributes(attributes: JewelryStoryAttributes) {
    try {
      return await callGeminiTextOnly(attributes);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof MalformedJsonError) {
        return callGeminiTextOnly(attributes, error.message);
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

export async function generateJewelryStory(imageUrl: string): Promise<JewelryStoryResult> {
  return getProvider().generateJewelryStory(imageUrl);
}

export async function generateJewelryStoryFromAttributes(
  attributes: JewelryStoryAttributes
): Promise<JewelryStoryResult> {
  return getProvider().generateJewelryStoryFromAttributes(attributes);
}
