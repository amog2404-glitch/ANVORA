// src/lib/workflow-parser.ts
import { callGemini } from './litellm-client';
import type { LLMConfig } from './litellm-client';
import type { TriggerType, WorkflowConditionType } from '../sidepanel/types';
import { logger } from './logger';

export interface ParsedWorkflowDraft {
  name: string;
  description: string;
  triggerType: TriggerType;
  intervalMinutes?: number;
  timeOfDay?: string;
  condition?: {
    type: WorkflowConditionType;
    threshold?: number;
    targetValue?: string;
    currency?: string;
  };
  targetUrl: string;
  isConsequential: boolean;
  missingInfo?: string | null;
}

const PARSER_PROMPT = `
You are the workflow parameter extractor for ANVORA, an autonomous browser assistant.
Return ONLY valid JSON, no markdown.

Active Webpage: {{url}} (Title: "{{title}}")
User instruction: "{{transcript}}"

Extract structured parameters for a proactive or recurring browser workflow.
Multilingual support: Understand English, Hindi, and Telugu (including Hinglish/Tenglish).

Schema:
{
  "name": "Short descriptive workflow title in English",
  "description": "Clear explanation of what this workflow monitors or automates",
  "triggerType": "one_time" | "daily" | "weekly" | "interval" | "content_change" | "price_change" | "announcement",
  "intervalMinutes": number or null, // e.g. 60 for every hour, 15 for 15 minutes, minimum 1
  "timeOfDay": "HH:mm" or null,      // 24h format, e.g. "09:00" for morning, "18:00" for evening
  "condition": {
    "type": "price_below" | "price_change" | "text_contains" | "content_diff" | "always",
    "threshold": number or null,     // numeric price threshold e.g. 5000 for ₹5,000
    "targetValue": string or null,   // string text condition
    "currency": string or null       // "INR", "USD", "EUR", etc.
  } or null,
  "targetUrl": "URL string to monitor (use the active webpage URL if the user refers to 'this page' or 'this website')",
  "isConsequential": boolean,        // true if the workflow entails purchasing, paying, deleting, form submission, or financial actions
  "missingInfo": string or null      // if critical information is missing (e.g. price threshold was not specified for a price drop alert), describe what is missing
}

Examples:
- "Check this website every morning for new announcements" -> triggerType: "daily", timeOfDay: "09:00", condition: { type: "content_diff" }, isConsequential: false
- "Monitor this product and notify me if its price drops below ₹5,000" -> triggerType: "price_change", intervalMinutes: 15, condition: { type: "price_below", threshold: 5000, currency: "INR" }, isConsequential: false
- "Every Monday, collect the latest updates from this site" -> triggerType: "weekly", timeOfDay: "09:00", condition: { type: "content_diff" }
- "Buy this item when price is below 3000" -> triggerType: "price_change", condition: { type: "price_below", threshold: 3000 }, isConsequential: true
`;

export async function parseWorkflowFromDirective(
  transcript: string,
  url: string,
  title: string,
  config: LLMConfig,
  signal?: AbortSignal
): Promise<ParsedWorkflowDraft> {
  const prompt = PARSER_PROMPT
    .replace('{{url}}', () => url || 'about:blank')
    .replace('{{title}}', () => title || 'Active Page')
    .replace('{{transcript}}', () => transcript);

  try {
    const rawResponse = await callGemini(
      [{ role: 'user', content: prompt }],
      config,
      true,
      signal
    );

    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      name: parsed.name || 'Automated Webpage Monitor',
      description: parsed.description || transcript,
      triggerType: parsed.triggerType || 'daily',
      intervalMinutes: typeof parsed.intervalMinutes === 'number' ? Math.max(1, parsed.intervalMinutes) : undefined,
      timeOfDay: parsed.timeOfDay || (parsed.triggerType === 'daily' ? '09:00' : undefined),
      condition: parsed.condition ? {
        type: parsed.condition.type || 'content_diff',
        threshold: typeof parsed.condition.threshold === 'number' ? parsed.condition.threshold : undefined,
        targetValue: parsed.condition.targetValue || undefined,
        currency: parsed.condition.currency || 'INR',
      } : undefined,
      targetUrl: parsed.targetUrl || url,
      isConsequential: Boolean(parsed.isConsequential),
      missingInfo: parsed.missingInfo || null,
    };
  } catch (err) {
    logger.error('WorkflowParser', 'Failed to parse workflow directive via LLM', err);
    // Fallback heuristic extraction
    const lower = transcript.toLowerCase();
    const isPrice = lower.includes('price') || lower.includes('₹') || lower.includes('rs') || lower.includes('cost');
    const isDaily = lower.includes('every morning') || lower.includes('daily') || lower.includes('har din') || lower.includes('prati roju');
    const hasSchedule = isDaily || lower.includes('every') || lower.includes('weekly') || lower.includes('monthly') || lower.includes('hour') || lower.includes('minute');
    const hasTargetMetric = isPrice || lower.includes('announcement') || lower.includes('update') || lower.includes('stock') || lower.includes('change') || lower.includes('summarize');

    const isAmbiguous = !hasSchedule || !hasTargetMetric;
    const missingInfo = isAmbiguous
      ? 'Please specify what you would like to monitor (such as price drops, new announcements, or content changes) and how often.'
      : null;

    return {
      name: isPrice ? 'Price Monitor' : 'Webpage Monitor',
      description: transcript,
      triggerType: isDaily ? 'daily' : (isPrice ? 'price_change' : 'daily'),
      intervalMinutes: isPrice ? 15 : 60,
      timeOfDay: isDaily ? '09:00' : undefined,
      condition: isPrice ? { type: 'price_change', currency: 'INR' } : { type: 'content_diff' },
      targetUrl: url,
      isConsequential: lower.includes('buy') || lower.includes('order') || lower.includes('pay'),
      missingInfo,
    };
  }
}

