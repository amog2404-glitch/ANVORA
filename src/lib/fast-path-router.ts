// src/lib/fast-path-router.ts
// Deterministic local intent classification for simple browser commands.
// Bypasses the Gemini API entirely for navigation, search, tab management,
// and basic browser operations — making them near-instant.

import { logger } from './logger.ts';

// ─── Types ────────────────────────────────────────────────────────────────

export type FastPathAction =
  | { type: 'navigate'; url: string; description: string; newTab?: boolean }
  | { type: 'search'; engine: 'google' | 'youtube' | 'wikipedia'; query: string; description: string }
  | { type: 'youtube_play'; query: string; description: string }
  | { type: 'youtube_discover'; description: string }
  | { type: 'tab_new'; url?: string; description: string }
  | { type: 'tab_close'; description: string }
  | { type: 'tab_reload'; description: string }
  | { type: 'tab_next'; description: string }
  | { type: 'tab_prev'; description: string }
  | { type: 'go_back'; description: string }
  | { type: 'go_forward'; description: string }
  | { type: 'scroll_up'; description: string }
  | { type: 'scroll_down'; description: string }
  | null;

export interface FastPathResult {
  isFastPath: true;
  action: FastPathAction;
  acknowledgement: string; // Concise TTS feedback
}

export interface NotFastPathResult {
  isFastPath: false;
  reason: string;
}

export type RouterResult = FastPathResult | NotFastPathResult;

// ─── Well-known sites ─────────────────────────────────────────────────────

interface KnownSite {
  names: string[];
  url: string;
  label: string;
}

const KNOWN_SITES: KnownSite[] = [
  { names: ['youtube', 'yt'], url: 'https://www.youtube.com/', label: 'YouTube' },
  { names: ['google'], url: 'https://www.google.com/', label: 'Google' },
  { names: ['gmail', 'email', 'mail'], url: 'https://mail.google.com/', label: 'Gmail' },
  { names: ['github', 'git hub'], url: 'https://github.com/', label: 'GitHub' },
  { names: ['wikipedia', 'wiki'], url: 'https://www.wikipedia.org/', label: 'Wikipedia' },
  { names: ['twitter', 'x.com', 'x'], url: 'https://x.com/', label: 'X (Twitter)' },
  { names: ['reddit'], url: 'https://www.reddit.com/', label: 'Reddit' },
  { names: ['linkedin'], url: 'https://www.linkedin.com/', label: 'LinkedIn' },
  { names: ['amazon'], url: 'https://www.amazon.in/', label: 'Amazon' },
  { names: ['flipkart'], url: 'https://www.flipkart.com/', label: 'Flipkart' },
  { names: ['instagram', 'insta'], url: 'https://www.instagram.com/', label: 'Instagram' },
  { names: ['facebook', 'fb'], url: 'https://www.facebook.com/', label: 'Facebook' },
  { names: ['whatsapp'], url: 'https://web.whatsapp.com/', label: 'WhatsApp' },
  { names: ['netflix'], url: 'https://www.netflix.com/', label: 'Netflix' },
  { names: ['spotify'], url: 'https://open.spotify.com/', label: 'Spotify' },
  { names: ['chatgpt', 'chat gpt'], url: 'https://chatgpt.com/', label: 'ChatGPT' },
  { names: ['stack overflow', 'stackoverflow'], url: 'https://stackoverflow.com/', label: 'Stack Overflow' },
  { names: ['google drive', 'drive'], url: 'https://drive.google.com/', label: 'Google Drive' },
  { names: ['google docs', 'docs'], url: 'https://docs.google.com/', label: 'Google Docs' },
  { names: ['google maps', 'maps'], url: 'https://maps.google.com/', label: 'Google Maps' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[,!?;:'"…—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRawUrl(text: string): string | null {
  const clean = text.trim();
  const urlPat = /^(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/\S*)?$/i;
  if (urlPat.test(clean)) {
    return clean.startsWith('http') ? clean : 'https://' + clean;
  }
  return null;
}

function containsComplexityMarkers(norm: string): boolean {
  // If it's literally just "next tab" or "switch to next tab", it's tab management, not a complexity marker
  if (/^(?:next\s+tab|switch\s+(?:to\s+)?(?:the\s+)?next\s+tab)$/i.test(norm)) {
    return false;
  }

  const complexPatterns = [
    /\b(?:and then|after that|also|finally|afterwards)\b/,
    /\b(?:compare|summarize|summarise|analyze|analyse|research|find the best|review|evaluate)\b/,
    /\b(?:fill in|fill out|submit|sign up|sign in|log in|login|register|checkout|check out|purchase|buy|pay|order)\b/,
    /\b(?:how to|what is|what are|explain|tell me about|describe)\b/,
    /\b(?:monitor|track|schedule|every day|every hour|workflow|automate|notify me)\b/,
  ];
  return complexPatterns.some(p => p.test(norm));
}

// ─── YouTube Specific Matchers ─────────────────────────────────────────────

function matchYouTubeCommand(norm: string): FastPathResult | null {
  if (
    /^(?:open\s+youtube\s+(?:and\s+)?play\s+(?:something|music|a\s+song|anything)|youtube\s+(?:par\s+)?kuch\s+chalao)$/i.test(norm)
  ) {
    return {
      isFastPath: true,
      action: {
        type: 'youtube_discover',
        description: 'Opening YouTube',
      },
      acknowledgement: 'Opening YouTube. What would you like to listen to?',
    };
  }

  const playPatterns = [
    /^(?:open\s+youtube\s+(?:and\s+)?play\s+)(.+)$/i,
    /^(?:play\s+)(.+?)(?:\s+on\s+youtube)$/i,
    /^(?:youtube\s+(?:par|pe)\s+)(.+?)(?:\s+chalao|\s+play\s+karo)$/i,
  ];

  for (const pat of playPatterns) {
    const m = norm.match(pat);
    if (m && m[1]) {
      const query = m[1].replace(/\s+(for me|please)\s*$/, '').trim();
      if (query && query !== 'something' && query !== 'anything') {
        return {
          isFastPath: true,
          action: {
            type: 'youtube_play',
            query,
            description: `Searching YouTube for "${query}"`,
          },
          acknowledgement: `Opening YouTube to find ${query}.`,
        };
      }
    }
  }

  return null;
}

// ─── Navigation intent matching ───────────────────────────────────────────

function matchNavigationIntent(raw: string): { url: string; label: string; newTab: boolean } | null {
  const norm = normalize(raw);
  const newTab = /\b(in a?\s*new\s*tab|new\s*tab)\b/.test(norm);
  const cleaned = norm.replace(/\b(in a?\s*new\s*tab|new\s*tab)\b/g, '').trim();

  // First check known sites (including bare domain names like "reddit.com")
  for (const site of KNOWN_SITES) {
    if (site.names.some(n => cleaned === n || cleaned === n + '.com')) {
      return { url: site.url, label: site.label, newTab };
    }
  }

  // Check direct domain or URL pattern e.g. "example.org", "https://example.com"
  const directRawUrl = extractRawUrl(cleaned);
  if (directRawUrl) {
    let label: string;
    try {
      label = new URL(directRawUrl).hostname.replace(/^www\./, '');
    } catch {
      label = cleaned;
    }
    return { url: directRawUrl, label, newTab };
  }

  const navPrefixes = [
    /^(?:open|go to|goto|navigate to|take me to|visit|launch|load|head to|bring up|pull up|show me|let'?s? go to|can you open|could you open|please open|open up|let'?s? open)\s+/,
    /^(?:kholo|kholiye|khol do|chalo|jao|dikha do|dikhao)\s+/,
    /^(?:open chey|open cheyyi|teruvu|chupinchu|vellu)\s+/,
  ];

  let target = '';
  for (const prefix of navPrefixes) {
    const match = cleaned.match(prefix);
    if (match) {
      target = cleaned.substring(match[0].length).trim();
      break;
    }
  }

  // Postfix navigation e.g. "youtube kholo", "google open cheyyi"
  if (!target) {
    const postfixMatch = cleaned.match(/^([a-z0-9.-]+)\s+(?:kholo|kholiye|open karo|open chey|open cheyyi)$/);
    if (postfixMatch && postfixMatch[1]) {
      target = postfixMatch[1];
    }
  }

  // Bare known site
  if (!target && !cleaned.includes(' ') && cleaned.length > 1) {
    target = cleaned;
  }

  if (!target) return null;

  target = target
    .replace(/\s+(for me|please|now|quickly|fast|immediately)\s*$/g, '')
    .trim();

  // 1. Check known sites
  for (const site of KNOWN_SITES) {
    if (site.names.some(n => target === n || target === n + '.com')) {
      return { url: site.url, label: site.label, newTab };
    }
  }

  // 2. Check if target is a raw URL
  const rawUrl = extractRawUrl(target);
  if (rawUrl) {
    let label: string;
    try {
      label = new URL(rawUrl).hostname.replace(/^www\./, '');
    } catch {
      label = target;
    }
    return { url: rawUrl, label, newTab };
  }

  // 3. Domain format e.g. example.org
  if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(target)) {
    return { url: `https://${target}`, label: target, newTab };
  }

  return null;
}

// ─── Search intent matching ───────────────────────────────────────────────

function matchSearchIntent(raw: string): { engine: 'google' | 'youtube' | 'wikipedia'; query: string } | null {
  const norm = normalize(raw);
  const patterns: Array<{ pat: RegExp; engine: 'google' | 'youtube' | 'wikipedia'; queryGroup: number }> = [
    { pat: /^(?:search\s+youtube\s+for|search\s+on\s+youtube\s+for|youtube\s+search|search\s+youtube|find\s+on\s+youtube|look\s+up\s+on\s+youtube)\s+(.+)/, engine: 'youtube', queryGroup: 1 },
    { pat: /^(?:search\s+google\s+for|search\s+on\s+google\s+for|google\s+search)\s+(.+)/, engine: 'google', queryGroup: 1 },
    { pat: /^(?:search\s+wikipedia\s+for|search\s+on\s+wikipedia\s+for|look\s+up\s+on\s+wikipedia|wikipedia\s+search)\s+(.+)/, engine: 'wikipedia', queryGroup: 1 },
    { pat: /^(?:search\s+for|search|look\s+up|look\s+for|find)\s+(.+)/, engine: 'google', queryGroup: 1 },
  ];

  for (const { pat, engine, queryGroup } of patterns) {
    const match = norm.match(pat);
    if (match && match[queryGroup]) {
      let query = match[queryGroup].trim();
      query = query
        .replace(/\s+on\s+(youtube|google|wikipedia)\s*$/i, '')
        .replace(/\s+(please|for me|now)\s*$/, '')
        .trim();
      if (query.length > 0) {
        return { engine, query };
      }
    }
  }

  return null;
}

// ─── Tab management matching ──────────────────────────────────────────────

function matchTabManagement(norm: string): FastPathAction | null {
  if (/^(?:open\s+)?(?:a\s+)?new\s+tab\s*$/.test(norm) || /^(?:naya\s+tab|kotha\s+tab)\s*(?:kholo|open\s+chey)?$/i.test(norm)) {
    return { type: 'tab_new', description: 'Opening a new tab' };
  }

  if (/^close\s+(?:this\s+|the\s+|current\s+)?tab\s*$/.test(norm) || /^(?:tab\s+band\s+karo|tab\s+close\s+chey)$/i.test(norm)) {
    return { type: 'tab_close', description: 'Closing current tab' };
  }

  if (/^(?:reload|refresh)(?:\s+this)?(?:\s+page|\s+tab)?\s*$/.test(norm) || /^(?:page\s+refresh\s+karo|page\s+reload\s+chey)$/i.test(norm)) {
    return { type: 'tab_reload', description: 'Refreshing the page' };
  }

  if (/^(?:next\s+tab|switch\s+(?:to\s+)?(?:the\s+)?next\s+tab|agla\s+tab)$/i.test(norm)) {
    return { type: 'tab_next', description: 'Switching to next tab' };
  }
  if (/^(?:previous\s+tab|prev\s+tab|switch\s+(?:to\s+)?(?:the\s+)?previous\s+tab|switch\s+(?:to\s+)?(?:the\s+)?prev\s+tab|pichla\s+tab)$/i.test(norm)) {
    return { type: 'tab_prev', description: 'Switching to previous tab' };
  }

  if (/^(?:go\s+back|back|navigate\s+back|peeche\s+jao|venakki\s+vellu)\s*$/i.test(norm)) {
    return { type: 'go_back', description: 'Going back' };
  }
  if (/^(?:go\s+forward|forward|navigate\s+forward|aage\s+jao|munduki\s+vellu)\s*$/i.test(norm)) {
    return { type: 'go_forward', description: 'Going forward' };
  }

  if (/^scroll\s+(?:down|page\s+down)\s*$/i.test(norm)) {
    return { type: 'scroll_down', description: 'Scrolling down' };
  }
  if (/^scroll\s+(?:up|page\s+up)\s*$/i.test(norm)) {
    return { type: 'scroll_up', description: 'Scrolling up' };
  }

  return null;
}

// ─── Search URL construction ──────────────────────────────────────────────

export function buildSearchUrl(engine: 'google' | 'youtube' | 'wikipedia', query: string): string {
  const encoded = encodeURIComponent(query);
  switch (engine) {
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${encoded}`;
    case 'google':
      return `https://www.google.com/search?q=${encoded}`;
    case 'wikipedia':
      return `https://en.wikipedia.org/w/index.php?search=${encoded}`;
  }
}

// ─── Main Router ──────────────────────────────────────────────────────────

export function classifyFastPath(transcript: string): RouterResult {
  const startMs = performance.now();
  const norm = normalize(transcript);

  if (norm.length < 2) {
    return { isFastPath: false, reason: 'Too short for fast-path' };
  }

  if (containsComplexityMarkers(norm)) {
    return { isFastPath: false, reason: 'Complex intent markers detected' };
  }

  // 1. YouTube specific commands
  const ytResult = matchYouTubeCommand(norm);
  if (ytResult) {
    logger.debug('FastPath', `Classified YouTube command in ${(performance.now() - startMs).toFixed(1)}ms`);
    return ytResult;
  }

  // Guard against compound actions containing "and"
  if (/\b(?:and\s+(?:then\s+)?(?:open|go|play|search|find|navigate|click|type|scroll|download|extract))\b/i.test(norm)) {
    return { isFastPath: false, reason: 'Compound action detected' };
  }

  // 2. Tab management and basic browser ops
  const tabAction = matchTabManagement(norm);
  if (tabAction) {
    logger.debug('FastPath', `Classified in ${(performance.now() - startMs).toFixed(1)}ms`, { action: tabAction.type });
    return {
      isFastPath: true,
      action: tabAction,
      acknowledgement: tabAction.description + '.',
    };
  }

  // 3. Navigation intent (checked before general search so "google open cheyyi" or "reddit.com" navigate)
  const navResult = matchNavigationIntent(transcript);
  if (navResult) {
    logger.debug('FastPath', `Classified navigation in ${(performance.now() - startMs).toFixed(1)}ms`, { url: navResult.url, label: navResult.label });
    return {
      isFastPath: true,
      action: {
        type: navResult.newTab ? 'tab_new' : 'navigate',
        url: navResult.url,
        description: navResult.newTab
          ? `Opening ${navResult.label} in a new tab`
          : `Opening ${navResult.label}`,
      },
      acknowledgement: navResult.newTab
        ? `Opening ${navResult.label} in a new tab.`
        : `Opening ${navResult.label}.`,
    };
  }

  // 4. Search intent
  const searchResult = matchSearchIntent(transcript);
  if (searchResult) {
    const engineLabel = searchResult.engine === 'youtube' ? 'YouTube'
      : searchResult.engine === 'wikipedia' ? 'Wikipedia' : 'Google';
    logger.debug('FastPath', `Classified search in ${(performance.now() - startMs).toFixed(1)}ms`, { engine: searchResult.engine, query: searchResult.query });
    return {
      isFastPath: true,
      action: {
        type: 'search',
        engine: searchResult.engine,
        query: searchResult.query,
        description: `Searching ${engineLabel} for "${searchResult.query}"`,
      },
      acknowledgement: `Searching ${engineLabel} for ${searchResult.query}.`,
    };
  }

  return { isFastPath: false, reason: 'No fast-path pattern matched' };
}
