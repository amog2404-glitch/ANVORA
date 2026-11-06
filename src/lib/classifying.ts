// src/lib/classifying.ts
import { callGemini } from './litellm-client';
import type { LLMConfig } from './litellm-client';
import type { BackgroundContext } from './system-prompt';
import { buildBgCtxSummary } from './system-prompt';

export interface Classification {
  intent_evaluation: string;
  type: 'generic' | 'task' | 'confirmation' | 'cancellation' | 'workflow';
  ambiguity: 'clear' | 'ambiguous';
  scope: 'single' | 'multi-step';
  risk: 'low' | 'high';
  summary: string;
  clarification_question: string | null;
}

const CLASSIFIER_PROMPT = `
You are the intent classifier for ANVORA, an intelligent autonomous browser assistant. Return ONLY valid JSON, no markdown.

Page: {{url}} — "{{title}}"
Recent History:
{{history}}

User said: "{{transcript}}"

Analyze the user's intent across English, Hindi, and Telugu (including romanized/transliterated or code-mixed input like Hinglish or Tenglish) and return a JSON object with the following schema:
- "intent_evaluation": Your detailed internal analysis of the raw transcript. Evaluate if there are phonetic Speech-to-Text errors or multilingual code-switching. If the literal text makes no logical sense in the current environment but a phonetically similar phrase does, state the correction.
- "type": Must be "generic", "task", "confirmation", "cancellation", or "workflow".
- "ambiguity": Must be "clear" or "ambiguous".
- "scope": Must be "single" or "multi-step".
- "risk": Must be "low" or "high".
- "summary": A clean, direct one-sentence description in English of what the user wants to accomplish (for the browser action planner). (Auto-corrected if necessary. Empty string if generic/confirmation/cancellation). DO NOT prefix with "The user wants to".
- "clarification_question": Conversational question text if ambiguous (phrase this in the user's spoken language: English, Hindi, or Telugu), null otherwise.

Rules for "type":
- "confirmation": The user is answering "yes", "ha", "avunu", "sahi", "proceed", or confirming a previous question from the assistant in the history.
- "cancellation": The user is answering "no", "stop", "ruk", "vaddu", "nahin", or cancelling a previous action.
- "workflow": The user wants to create, schedule, monitor, pause, resume, cancel, or query recurring or conditional automated workflows (e.g., "check this website every morning", "monitor this price and notify me if below ₹5000", "pause my workflow", "what workflows are active", "cancel the monitoring task", "har subah is page ko check karo", "prati roju ee website chudu").
- "task": The user wants to perform an immediate action on the page, navigate, find information, ask questions about the active webpage content (e.g., "summarize this page", "what is this article about", "find the pricing"), or continue/resume/repeat a previous task ("continue where you stopped", "resume", "use the same format as last time", "do the same for the other website", "find the best source and compare").
- "generic": Small talk, conversational, or general knowledge questions not relating to the active webpage.

Continuity & Conversational References:
- If the user refers to past actions (e.g. "continue where you stopped", "resume", "same as before", "compare with the other one"), resolve the intent against the recent history and background task continuity to formulate a clear self-contained "summary" that the planner can execute without needing prior context.
- For comparisons ("find best source and compare with other"), specify a multi-step scope with clear comparative subgoals in the summary.

Risk Assessment:
- HIGH risk: financial transactions, sending emails/messages, account deletions, irreversible changes.
- LOW risk: Navigation (going to URLs), searching, clicking normal links, reading, media control.
- Ambiguous means proceeding would likely produce the WRONG outcome or you cannot confidently guess the typo. Ask a clarifying question if ambiguous.

Return EXACTLY this JSON structure:
{
  "intent_evaluation": "...",
  "type": "task",
  "ambiguity": "clear",
  "scope": "single",
  "risk": "low",
  "summary": "...",
  "clarification_question": null
}
`;

export async function classifyTranscript(
  transcript: string, 
  url: string, 
  title: string, 
  historySummary: string,
  config: LLMConfig,
  bgCtx: BackgroundContext | null,
  signal?: AbortSignal,
  isRetry = false
): Promise<Classification> {
  let prompt = CLASSIFIER_PROMPT
    .replace('{{url}}', () => url)
    .replace('{{title}}', () => title)
    .replace('{{history}}', () => historySummary)
    .replace('{{transcript}}', () => transcript);

  if (bgCtx) {
    prompt += buildBgCtxSummary(bgCtx);
  }

  const prefix = isRetry ? "Return ONLY raw JSON. No backticks. No explanation.\n\n" : "";

  let responseText = await callGemini(
    [{ role: 'user', content: prefix + prompt }],
    config,
    true,
    signal
  );
  
  try {
    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as Classification;
  } catch (err) {
    if (!isRetry) {
      return classifyTranscript(transcript, url, title, historySummary, config, bgCtx, signal, true);
    }
    throw new Error('Failed to parse classification JSON');
  }
}
