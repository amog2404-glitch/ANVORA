// src/lib/system-prompt.ts

export interface BackgroundContext {
  name: string;
  role: string;
  preferences: string[];
  shortcuts: Record<string, string>;
  frequentSites: string[];
  location?: any;
  language?: string;
  memoriesSummary?: string;
  lastTaskContinuitySummary?: string;
}

export function buildBgCtxSummary(bgCtx: BackgroundContext | null): string {
  if (!bgCtx) return '';
  let s = `\nBackground Context about the user:`;
  if (bgCtx.name) s += `\nName: ${bgCtx.name}`;
  if (bgCtx.role) s += `\nRole: ${bgCtx.role}`;
  if (bgCtx.preferences && bgCtx.preferences.length > 0) s += `\nPreferences: ${bgCtx.preferences.join(', ')}`;
  if (bgCtx.shortcuts && Object.keys(bgCtx.shortcuts).length > 0) s += `\nShortcuts: ${JSON.stringify(bgCtx.shortcuts)}`;
  if (bgCtx.frequentSites && bgCtx.frequentSites.length > 0) s += `\nFrequent Sites: ${bgCtx.frequentSites.join(', ')}`;
  if (bgCtx.location) s += `\nLocation: ${bgCtx.location.city}, ${bgCtx.location.region}, ${bgCtx.location.country_name} (Timezone: ${bgCtx.location.timezone})`;
  if (bgCtx.language) s += `\nPreferred Language: ${bgCtx.language}`;
  if (bgCtx.memoriesSummary) s += `\n${bgCtx.memoriesSummary}`;
  if (bgCtx.lastTaskContinuitySummary) s += `\n${bgCtx.lastTaskContinuitySummary}`;
  return s + '\n';
}

export function buildFullSystemPrompt(bgCtx: BackgroundContext | null): string {
  const lang = bgCtx?.language || 'en';
  let langInstruction = 'Respond in English.';
  if (lang === 'hi') {
    langInstruction = 'Respond naturally in Hindi (clean conversational Hindi, matching user preference).';
  } else if (lang === 'te') {
    langInstruction = 'Respond naturally in Telugu (clean conversational Telugu, matching user preference).';
  }

  let prompt = `You are ANVORA (Autonomous Intelligence: "Connected Intelligence. Autonomous Action."), an intelligent, voice-first autonomous browser assistant.
You help users navigate, read, understand, and interact with the web seamlessly.
You must be helpful, concise, trustworthy, and safe.
Keep responses concise unless detailed explanations are requested.
Do not use markdown formatting, asterisks, hashtags, or emojis in your spoken responses because they will be read aloud via Text-to-Speech.
Language requirement: ${langInstruction}

# Memory & Personalization Rules:
- Contextual memories reflect user habits, preferred formats, and frequent sites.
- IMPORTANT: Current user instructions ALWAYS override remembered preferences. If the user specifies something different, follow their immediate request without hesitation.
- Memory can never authorize high-risk actions. High-risk actions always require explicit interactive confirmation.

When you respond, speak directly to the user in a natural, conversational tone.
`;

  if (bgCtx) {
    prompt += buildBgCtxSummary(bgCtx);
  }

  return prompt;
}
