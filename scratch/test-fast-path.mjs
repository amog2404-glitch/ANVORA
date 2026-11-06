// scratch/test-fast-path.mjs
// Unit & Integration tests for ANVORA Fast-Path Router & Performance Optimization

import assert from 'node:assert/strict';

console.log('='.repeat(70));
console.log('ANVORA — FAST-PATH ROUTER & PERFORMANCE VERIFICATION SUITE');
console.log('='.repeat(70));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

// ─── Mirror of fast-path-router.ts ────

const KNOWN_SITES = [
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

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[,!?;:'"…—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRawUrl(text) {
  const clean = text.trim();
  const urlPat = /^(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/\S*)?$/i;
  if (urlPat.test(clean)) {
    return clean.startsWith('http') ? clean : 'https://' + clean;
  }
  return null;
}

function containsComplexityMarkers(norm) {
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

function matchYouTubeCommand(norm) {
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

function matchNavigationIntent(raw) {
  const norm = normalize(raw);
  const newTab = /\b(in a?\s*new\s*tab|new\s*tab)\b/.test(norm);
  const cleaned = norm.replace(/\b(in a?\s*new\s*tab|new\s*tab)\b/g, '').trim();

  // First check known sites (including bare domain names like "reddit.com")
  for (const site of KNOWN_SITES) {
    if (site.names.some(n => cleaned === n || cleaned === n + '.com')) {
      return { url: site.url, label: site.label, newTab };
    }
  }

  const directRawUrl = extractRawUrl(cleaned);
  if (directRawUrl) {
    let label;
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

  if (!target) {
    const postfixMatch = cleaned.match(/^([a-z0-9.-]+)\s+(?:kholo|kholiye|open karo|open chey|open cheyyi)$/);
    if (postfixMatch && postfixMatch[1]) {
      target = postfixMatch[1];
    }
  }

  if (!target && !cleaned.includes(' ') && cleaned.length > 1) {
    target = cleaned;
  }

  if (!target) return null;

  target = target
    .replace(/\s+(for me|please|now|quickly|fast|immediately)\s*$/g, '')
    .trim();

  for (const site of KNOWN_SITES) {
    if (site.names.some(n => target === n || target === n + '.com')) {
      return { url: site.url, label: site.label, newTab };
    }
  }

  const rawUrl = extractRawUrl(target);
  if (rawUrl) {
    let label;
    try {
      label = new URL(rawUrl).hostname.replace(/^www\./, '');
    } catch {
      label = target;
    }
    return { url: rawUrl, label, newTab };
  }

  if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(target)) {
    return { url: `https://${target}`, label: target, newTab };
  }

  return null;
}

function matchSearchIntent(raw) {
  const norm = normalize(raw);
  const patterns = [
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

function matchTabManagement(norm) {
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

function buildSearchUrl(engine, query) {
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

function classifyFastPath(transcript) {
  const norm = normalize(transcript);
  if (norm.length < 2) return { isFastPath: false, reason: 'Too short' };
  if (containsComplexityMarkers(norm)) return { isFastPath: false, reason: 'Complex' };

  const ytResult = matchYouTubeCommand(norm);
  if (ytResult) return ytResult;

  if (/\b(?:and\s+(?:then\s+)?(?:open|go|play|search|find|navigate|click|type|scroll|download|extract))\b/i.test(norm)) {
    return { isFastPath: false, reason: 'Compound action' };
  }

  const tabAction = matchTabManagement(norm);
  if (tabAction) {
    return {
      isFastPath: true,
      action: tabAction,
      acknowledgement: tabAction.description + '.',
    };
  }

  const navResult = matchNavigationIntent(transcript);
  if (navResult) {
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

  const searchResult = matchSearchIntent(transcript);
  if (searchResult) {
    const engineLabel = searchResult.engine === 'youtube' ? 'YouTube'
      : searchResult.engine === 'wikipedia' ? 'Wikipedia' : 'Google';
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

  return { isFastPath: false, reason: 'No pattern matched' };
}

// ─── Tests ────────────────────────────────────────────────────────────────

// 1. Navigation Fast-Path
test('Navigation: "Open YouTube" routes directly without LLM', () => {
  const res = classifyFastPath('Open YouTube');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'navigate');
  assert.equal(res.action.url, 'https://www.youtube.com/');
  assert.equal(res.acknowledgement, 'Opening YouTube.');
});

test('Navigation: Natural phrasing "Can you open Google for me"', () => {
  const res = classifyFastPath('Can you open Google for me');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'navigate');
  assert.equal(res.action.url, 'https://www.google.com/');
});

test('Navigation: "Open GitHub in a new tab" sets tab_new', () => {
  const res = classifyFastPath('Open GitHub in a new tab');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'tab_new');
  assert.equal(res.action.url, 'https://github.com/');
  assert.equal(res.acknowledgement, 'Opening GitHub in a new tab.');
});

test('Navigation: Bare domain name "reddit.com"', () => {
  const res = classifyFastPath('reddit.com');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'navigate');
  assert.equal(res.action.url, 'https://www.reddit.com/');
});

test('Navigation: Arbitrary domain "visit example.org"', () => {
  const res = classifyFastPath('visit example.org');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'navigate');
  assert.equal(res.action.url, 'https://example.org');
});

// 2. Multilingual Navigation
test('Multilingual Hindi: "youtube kholo"', () => {
  const res = classifyFastPath('youtube kholo');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'navigate');
  assert.equal(res.action.url, 'https://www.youtube.com/');
});

test('Multilingual Telugu: "google open cheyyi"', () => {
  const res = classifyFastPath('google open cheyyi');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'navigate');
  assert.equal(res.action.url, 'https://www.google.com/');
});

// 3. Search Intent
test('Search: "Search YouTube for phonk music"', () => {
  const res = classifyFastPath('Search YouTube for phonk music');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'search');
  assert.equal(res.action.engine, 'youtube');
  assert.equal(res.action.query, 'phonk music');
  assert.equal(buildSearchUrl('youtube', res.action.query), 'https://www.youtube.com/results?search_query=phonk%20music');
});

test('Search: "Search Google for quantum computing"', () => {
  const res = classifyFastPath('Search Google for quantum computing');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'search');
  assert.equal(res.action.engine, 'google');
  assert.equal(res.action.query, 'quantum computing');
  assert.equal(buildSearchUrl('google', res.action.query), 'https://www.google.com/search?q=quantum%20computing');
});

test('Search: "Search Wikipedia for Artificial Intelligence"', () => {
  const res = classifyFastPath('Search Wikipedia for Artificial Intelligence');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'search');
  assert.equal(res.action.engine, 'wikipedia');
  assert.equal(res.action.query.toLowerCase(), 'artificial intelligence');
});

// 4. Tab & Browser Operations
test('Tab: "Open a new tab"', () => {
  const res = classifyFastPath('Open a new tab');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'tab_new');
});

test('Tab: "Close this tab"', () => {
  const res = classifyFastPath('Close this tab');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'tab_close');
});

test('Tab: "Reload this page"', () => {
  const res = classifyFastPath('Reload this page');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'tab_reload');
});

test('Tab: "Switch to next tab"', () => {
  const res = classifyFastPath('Switch to next tab');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'tab_next');
});

test('Browser: "Go back"', () => {
  const res = classifyFastPath('Go back');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'go_back');
});

test('Browser: "Scroll down"', () => {
  const res = classifyFastPath('Scroll down');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'scroll_down');
});

// 5. YouTube Specific Scenarios
test('YouTube Command C: "Open YouTube and play something" (Discovery mode)', () => {
  const res = classifyFastPath('Open YouTube and play something');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'youtube_discover');
  assert.ok(res.acknowledgement.includes('What would you like to listen to'));
});

test('YouTube Command D: "Play Bohemian Rhapsody on YouTube"', () => {
  const res = classifyFastPath('Play Bohemian Rhapsody on YouTube');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'youtube_play');
  assert.equal(res.action.query.toLowerCase(), 'bohemian rhapsody');
});

test('YouTube Command: "Open YouTube and play relaxing jazz"', () => {
  const res = classifyFastPath('Open YouTube and play relaxing jazz');
  assert.equal(res.isFastPath, true);
  assert.equal(res.action.type, 'youtube_play');
  assert.equal(res.action.query.toLowerCase(), 'relaxing jazz');
});

// 6. Complex Tasks Bypass to Gemini (isFastPath: false)
test('Complex task bypass: "Find the 3 best laptops and compare them"', () => {
  const res = classifyFastPath('Find the 3 best laptops and compare them');
  assert.equal(res.isFastPath, false);
});

test('Complex task bypass: "Summarize this page"', () => {
  const res = classifyFastPath('Summarize this page');
  assert.equal(res.isFastPath, false);
});

test('Complex task bypass: "Find the latest AI agent announcements and summarize the three most important ones"', () => {
  const res = classifyFastPath('Find the latest AI agent announcements and summarize the three most important ones');
  assert.equal(res.isFastPath, false);
});

test('Performance: Local classification latency is under 5ms', () => {
  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    classifyFastPath('Open YouTube');
    classifyFastPath('Search YouTube for lofi beats');
    classifyFastPath('Close tab');
  }
  const avg = (performance.now() - start) / 150;
  console.log(`     Average classification time: ${avg.toFixed(3)} ms`);
  assert.ok(avg < 5, `Expected <5ms, got ${avg.toFixed(3)}ms`);
});

console.log('\n' + '-'.repeat(70));
console.log(`RESULTS: Passed: ${passed}, Failed: ${failed}`);
console.log('-'.repeat(70));

process.exit(failed > 0 ? 1 : 0);
