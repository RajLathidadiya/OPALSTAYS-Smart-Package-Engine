// AI itinerary writer. Claude only gets customer-safe data (no costs, no
// markup, no profit) and only writes words: title, day stories, tips and
// alternatives. Times and prices always come from the rule engine.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { PackageOption, Settings, TripRequest } from "../engine/types";
import { customerSafePackage, type AiCopy, type CopyLanguage } from "./copy";

const AiCopySchema: z.ZodType<AiCopy> = z.object({
  title: z.string(),
  tagline: z.string(),
  overview: z.string(),
  days: z.array(z.object({ day: z.number(), heading: z.string(), story: z.string() })),
  highlights: z.array(z.string()),
  tips: z.array(z.string()),
  alternatives: z.array(z.string()),
});

const SYSTEM = `You write customer-facing travel package copy for OPALSTAYS, an Indian travel company.

You receive a package that a pricing and scheduling engine has already built: hotels, transport, and a day-by-day timetable.
Your job is the words only:
- A short, warm package title and a one-line tagline.
- An overview paragraph (3–4 sentences).
- For every day in the timetable, a heading and a 2–4 sentence story that follows that day's entries in order. Keep the same times and places; never add activities that are not in the timetable, never move or invent times.
- 4–6 highlights.
- 3–5 practical tips for these places and this season (clothing, weather, what to carry, local food to try, etiquette).
- 2–4 alternative ideas the customer could ask to add or swap (label them clearly as optional suggestions, "on request").

Never mention prices, costs, discounts, GST, or availability guarantees. Never promise that trains or hotels are confirmed.
Write in the requested language, in a friendly, trustworthy tone suited to Indian families and groups.`;

export async function writePackageCopy(opts: {
  apiKey: string;
  settings: Settings;
  option: PackageOption;
  request: TripRequest;
  language: CopyLanguage;
}): Promise<AiCopy> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });
  const input = customerSafePackage(opts.option, opts.request);

  const response = await client.beta.messages.parse({
    model: opts.settings.aiModel || "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.settings.aiEffort, format: betaZodOutputFormat(AiCopySchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Language: ${opts.language}\n\nPackage (JSON):\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("The AI declined this request. Use the standard description instead.");
  if (response.stop_reason === "max_tokens") throw new Error("The AI response was cut off. Try again.");
  if (!response.parsed_output) throw new Error("The AI did not return a valid package description.");
  return response.parsed_output;
}

/** Friendly message for common API errors. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Invalid Anthropic API key. Check it in Admin → Settings.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limit reached. Wait a minute and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the AI service. Check your internet connection.";
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status ?? "network"}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
