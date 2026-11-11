import { generateResponse, GatewayError, PaymentRequiredError, RateLimitError } from "@lovable.dev/ai-gateway";
import {
  OUTLINE_ITEM_KINDS,
  OUTLINE_MAX_ITEMS_PER_SECTION,
  OUTLINE_MAX_SECTIONS,
  OUTLINE_TOOL_KEYS,
  parsePlaybookOutline,
  type OutlineInput,
  type OutlineSection,
} from "./playbook-outline";

const MODEL = "openai/gpt-6-astra";

export type OutlineResult = { ok: true; sections: OutlineSection[] } | { ok: false; error: string };

const INSTRUCTIONS = `You help creators on Doerly — a marketplace of practical know-how from people with first-hand experience — plan a playbook: one product that bundles guides, worksheets, spreadsheets, videos, links, short notes and calculators into ordered sections.
From the product description, audience and learning goals, return JSON {"sections": [...]}:
- 3–${OUTLINE_MAX_SECTIONS} sections in the order a buyer should work through them; each "title" is short (2–8 words), without numbering.
- Each section has 2–${OUTLINE_MAX_ITEMS_PER_SECTION} "items". Each item has:
  - "kind": one of ${OUTLINE_ITEM_KINDS.join(" | ")}. "note" = a short written explanation or steps; "file" = a document the creator should upload (guide, checklist, worksheet, spreadsheet, template); "video" = a demonstration worth filming; "link" = an outside resource worth pointing to; "tool" = a built-in calculator.
  - "title": specific and concrete (max 80 characters).
  - "description": for notes, 2–5 sentences of practical guidance written as the creator ("I") to the buyer ("you"); for other kinds, one or two sentences on what the creator should put there and why it helps.
  - "tool_key": for tools only, one of ${OUTLINE_TOOL_KEYS.join(" | ")} (profit = profit per unit and break-even; cashflow = monthly balance; budget = spending lines; crop_calendar = planting to harvest dates; materials = area-based quantities and cost); otherwise "none".
- Every section must clearly serve at least one of the learning goals; cover all goals.
Rules: base everything on the inputs. Never invent credentials, statistics, results, prices, guarantees or testimonials. No medical, legal or financial promises. Only suggest a tool when a calculation genuinely helps. Write in the same language as the description.`;

export async function draftPlaybookOutline(input: OutlineInput): Promise<OutlineResult> {
  try {
    const response = await generateResponse({
      model: MODEL,
      instructions: INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: `Product title: ${input.title || "(not set)"}\n\nDescription:\n"""\n${input.description}\n"""\n\nAudience:\n"""\n${input.audience || "(not given)"}\n"""\n\nLearning goals:\n"""\n${input.goals || "(not given)"}\n"""\n\nReturn JSON.`,
        },
      ],
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "playbook_outline",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["sections"],
            properties: {
              sections: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "items"],
                  properties: {
                    title: { type: "string" },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["kind", "title", "description", "tool_key"],
                        properties: {
                          kind: { type: "string", enum: [...OUTLINE_ITEM_KINDS] },
                          title: { type: "string" },
                          description: { type: "string" },
                          tool_key: { type: "string", enum: [...OUTLINE_TOOL_KEYS, "none"] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    let text = "";
    for (const item of response.output ?? []) {
      if (item.type !== "message") continue;
      for (const part of item.content) {
        if (part.type === "output_text") text += part.text;
        if (part.type === "refusal") return { ok: false, error: "The AI helper couldn’t plan an outline from this description." };
      }
    }
    const sections = parsePlaybookOutline(text);
    if (!sections) return { ok: false, error: "The AI helper returned an unusable outline. Please try again." };
    return { ok: true, sections };
  } catch (error) {
    if (error instanceof PaymentRequiredError) {
      return { ok: false, error: "The AI helper is out of credits right now. Please try again later." };
    }
    if (error instanceof RateLimitError) {
      return { ok: false, error: "The AI helper is busy. Please wait a minute and try again." };
    }
    if (error instanceof GatewayError) {
      console.error("playbook outline gateway error", error.code, error.ids);
      return { ok: false, error: "The AI helper isn’t available right now. Please try again shortly." };
    }
    throw error;
  }
}
