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
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type OpenAIOutputContent = {
  type?: string;
  text?: string;
};

type OpenAIOutputItem = {
  content?: OpenAIOutputContent[];
};

type OpenAIResponse = {
  status?: string;
  incomplete_details?: {
    reason?: string;
  };
  output_text?: string;
  output?: OpenAIOutputItem[];
};

type OpenAIResponseInput =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_image";
      image_url: string;
    };

type GeminiPart = {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
};

type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  additionalProperties?: boolean;
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
  required: ["category", "material", "motifs", "style", "shortStory", "longStory"],
  additionalProperties: false
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
  required: ["shortStory", "longStory"],
  additionalProperties: false
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
  return (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").trim();
}

function getOpenAIModel() {
  return (process.env.OPENAI_MODEL ?? "gpt-4.1-mini").trim();
}

function inferMimeTypeFromUrl(imageUrl: string) {
  let pathname = "";

  try {
    pathname = new URL(imageUrl).pathname.toLowerCase();
  } catch {
    return null;
  }

  if (pathname.endsWith(".png")) {
    return "image/png";
  }

  if (pathname.endsWith(".webp")) {
    return "image/webp";
  }

  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return null;
}

function normalizeImageMimeType(contentType: string | null) {
  const mimeType = contentType?.split(";")[0]?.trim().toLowerCase();

  if (mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/jpeg") {
    return mimeType;
  }

  return null;
}

async function fetchImageForGemini(imageUrl: string) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Image fetch failed with ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const mimeType = inferMimeTypeFromUrl(imageUrl) ?? normalizeImageMimeType(response.headers.get("content-type")) ?? "image/jpeg";
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");

  return { mimeType, data };
}

async function fetchImageAsDataUrl(imageUrl: string) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Image fetch failed with ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const mimeType = inferMimeTypeFromUrl(imageUrl) ?? normalizeImageMimeType(response.headers.get("content-type")) ?? "image/jpeg";
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");

  return `data:${mimeType};base64,${data}`;
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
    throw new MalformedJsonError("AI returned JSON that does not match the story schema.");
  }

  return parsed;
}

function parseTextOnlyStoryJson(text: string): Pick<JewelryStoryResult, "shortStory" | "longStory"> {
  const parsed = JSON.parse(text);

  if (!isStoryDraft(parsed)) {
    throw new MalformedJsonError("AI returned JSON that does not match the text-only story schema.");
  }

  return parsed;
}

function cleanJsonText(text: string) {
  const cleanedText = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  const firstBrace = cleanedText.indexOf("{");
  const lastBrace = cleanedText.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleanedText.slice(firstBrace, lastBrace + 1);
  }

  return cleanedText;
}

function getResponseShape(value: unknown) {
  if (!value || typeof value !== "object") {
    return String(value);
  }

  return JSON.stringify(Object.keys(value));
}

function extractGeminiText(data: GeminiResponse) {
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

function extractOpenAIText(data: OpenAIResponse) {
  if (data.output_text) {
    return data.output_text;
  }

  return data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((text): text is string => Boolean(text));
}

function geminiEndpoint() {
  const model = encodeURIComponent(getGeminiModel().replace(/^models\//, ""));
  const apiKey = encodeURIComponent(process.env.GEMINI_API_KEY ?? "");

  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function toGeminiSchema(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    type: schema.type.toUpperCase(),
    properties: schema.properties
      ? Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]))
      : undefined,
    items: schema.items ? toGeminiSchema(schema.items) : undefined
  };
}

async function postGeminiGenerateContent(parts: GeminiPart[], schema: JsonSchema) {
  const response = await fetch(geminiEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(schema)
      },
      systemInstruction: {
        parts: [
          {
            text: brandInstruction
          }
        ]
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

  return rawText;
}

async function postOpenAIResponses(input: OpenAIResponseInput[], schema: JsonSchema, instruction: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: brandInstruction
            }
          ]
        },
        {
          role: "user",
          content: input
        }
      ],
      instructions: instruction,
      temperature: 0.7,
      max_output_tokens: 2400,
      text: {
        format: {
          type: "json_schema",
          name: "jewelry_story",
          schema,
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const payload = (await response.json()) as OpenAIResponse;

  if (payload.status === "incomplete") {
    throw new MalformedJsonError(`OpenAI response was incomplete: ${payload.incomplete_details?.reason ?? "unknown reason"}`);
  }

  const rawText = extractOpenAIText(payload);

  if (!rawText) {
    throw new MalformedJsonError(`OpenAI returned no text. Response shape: ${getResponseShape(payload)}`);
  }

  return rawText;
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

  const image = await fetchImageForGemini(imageUrl);
  const rawText = await postGeminiGenerateContent(
    [
      {
        inline_data: {
          mime_type: image.mimeType,
          data: image.data
        }
      },
      {
        text: buildVisionInstruction(knownAttributes, retryContext, staffNotes)
      }
    ],
    storySchema
  );

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

  const rawText = await postGeminiGenerateContent(
    [
      {
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
    textOnlyStorySchema
  );

  const draft = parseTextOnlyStoryJson(cleanJsonText(rawText));
  const material = mergeGoldToneIntoMaterial(attributes.material, attributes.goldTone);

  return {
    ...attributes,
    material,
    shortStory: draft.shortStory,
    longStory: draft.longStory
  };
}

async function callOpenAI(
  imageUrl: string,
  knownAttributes?: KnownJewelryAttributes,
  staffNotes?: string,
  retryContext?: string
): Promise<JewelryStoryResult> {
  const dataUrl = await fetchImageAsDataUrl(imageUrl);
  const rawText = await postOpenAIResponses(
    [
      {
        type: "input_image",
        image_url: dataUrl
      },
      {
        type: "input_text",
        text: buildVisionInstruction(knownAttributes, retryContext, staffNotes)
      }
    ],
    storySchema,
    analysisInstruction
  );

  return applyKnownAttributeFallbacks(parseStoryJson(cleanJsonText(rawText)), knownAttributes);
}

async function callOpenAITextOnly(
  attributes: JewelryStoryAttributes,
  staffNotes?: string,
  retryContext?: string
): Promise<JewelryStoryResult> {
  const rawText = await postOpenAIResponses(
    [
      {
        type: "input_text",
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
    textOnlyStorySchema,
    textOnlyInstruction
  );

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

const openaiProvider: AiProvider = {
  async generateJewelryStory(imageUrl: string, knownAttributes?: KnownJewelryAttributes, staffNotes?: string) {
    try {
      return await callOpenAI(imageUrl, knownAttributes, staffNotes);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof MalformedJsonError) {
        return callOpenAI(imageUrl, knownAttributes, staffNotes, error.message);
      }

      throw error;
    }
  },
  async generateJewelryStoryFromAttributes(attributes: JewelryStoryAttributes, staffNotes?: string) {
    try {
      return await callOpenAITextOnly(attributes, staffNotes);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof MalformedJsonError) {
        return callOpenAITextOnly(attributes, staffNotes, error.message);
      }

      throw error;
    }
  }
};

function getProvider(): AiProvider {
  switch (getProviderName()) {
    case "gemini":
      return geminiProvider;
    case "openai":
      return openaiProvider;
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
