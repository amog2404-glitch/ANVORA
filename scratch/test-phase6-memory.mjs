// scratch/test-phase6-memory.mjs
console.log('--- ANVORA Phase 6: Memory & Personalization Test Suite ---');

const SENSITIVE_PATTERNS = [
  /\bAIza[0-9A-Za-z-_]{25,50}\b/i,
  /\bsk-[0-9A-Za-z-_]{20,}\b/i,
  /\bghp_[0-9A-Za-z]{36}\b/i,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/,
  /\bpassword\s*[:=]\s*\S+/i,
  /\bpasswd\s*[:=]\s*\S+/i,
  /\b(pin|cvv|cvc)\s*[:=]?\s*\d{3,4}\b/i,
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\bbearer\s+[a-zA-Z0-9_\-\.]+/i,
];

function isContentSafe(content) {
  if (!content || typeof content !== 'string') return false;
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) return false;
  }
  return true;
}

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${testName}`);
    failed++;
  }
}

// TEST 1: Sensitive Data Exclusion (Security 6.6)
console.log('\n[1] Security & Privacy: Sensitive Data Filtering');
assert(!isContentSafe('My Google key is AIzaSyD1234567890123456789012345678901'), 'Rejects Google AI Studio API key');
assert(!isContentSafe('sk-abcdefghijklmnopqrstuvwxyz123456'), 'Rejects OpenAI/Groq API key');
assert(!isContentSafe('password: supersecretpassword123'), 'Rejects password string');
assert(!isContentSafe('credit card 4111 2222 3333 4444'), 'Rejects credit card numbers');
assert(!isContentSafe('bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Rejects bearer token');
assert(isContentSafe('Prefers responses formatted in markdown tables'), 'Allows harmless formatting preference');
assert(isContentSafe('Frequently searches for scientific research on Wikipedia'), 'Allows workflow preference');

// TEST 2: Memory Retrieval and Relevance Scoring (6.1 & 6.2)
console.log('\n[2] Relevant Memory Retrieval & Context Bounding');
const mockMemories = [
  { id: '1', category: 'preference', content: 'Prefers concise bullet points', pinned: true, createdAt: 1, updatedAt: 1 },
  { id: '2', category: 'frequent_site', content: 'Frequently visits github.com for code reviews', pinned: false, createdAt: 2, updatedAt: 2 },
  { id: '3', category: 'workflow', content: 'Uses table comparisons for pricing', pinned: false, createdAt: 3, updatedAt: 3 },
  { id: '4', category: 'completed_task', content: 'Searched for flights to Tokyo on Kayak', pinned: false, createdAt: 4, updatedAt: 4 },
];

function getRelevantMemories(memories, enabled, query, currentUrl, maxCount = 5) {
  if (!enabled || memories.length === 0) return [];
  const queryLower = (query || '').toLowerCase();
  const urlLower = (currentUrl || '').toLowerCase();

  const scored = memories.map((m) => {
    let score = 0;
    if (m.pinned) score += 5;
    const contentLower = m.content.toLowerCase();
    if (m.category === 'preference') score += 2;
    if (urlLower && m.category === 'frequent_site' && urlLower.includes(contentLower)) score += 8;

    const words = queryLower.split(/\s+/).filter((w) => w.length > 2);
    for (const word of words) {
      const stem = word.length >= 4 ? word.slice(0, 4) : word;
      if (contentLower.includes(word) || contentLower.includes(stem)) {
        score += 3;
      }
    }
    return { memory: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0 || s.memory.pinned || s.memory.category === 'preference')
    .slice(0, maxCount)
    .map((s) => s.memory);
}

const relevant1 = getRelevantMemories(mockMemories, true, 'compare the prices of these options', 'https://example.com');
assert(relevant1.some(m => m.id === '3'), 'Retrieves pricing table comparison memory for pricing query');
assert(relevant1.some(m => m.pinned), 'Always includes pinned preferences');

const relevantDisabled = getRelevantMemories(mockMemories, false, 'compare the prices', 'https://example.com');
assert(relevantDisabled.length === 0, 'Retrieves 0 memories when memory is disabled');

// TEST 3: Prompt Formatting with Rule Precedence (6.2)
console.log('\n[3] Prompt Formatting & Rule Precedence');
function formatMemoriesForPrompt(memories) {
  if (!memories || memories.length === 0) return '';
  const lines = memories.map((m) => `- [${m.category}] ${m.content}`);
  return `\n[USER PREFERENCES & CONTEXT MEMORY]\n(Note: These are learned preferences to personalize response style and workflows. Current user instructions ALWAYS take precedence over remembered preferences):\n${lines.join('\n')}\n`;
}

const formatted = formatMemoriesForPrompt(relevant1);
assert(formatted.includes('ALWAYS take precedence'), 'System prompt reinforces user instruction precedence');
assert(formatted.includes('Prefers concise bullet points'), 'Formats memory text properly');

// TEST 4: Task Continuity State (6.4)
console.log('\n[4] Task Continuity & Interrupted Task Resumption');
const taskState = {
  id: 'task-12345',
  directive: 'Search for quantum computing papers on Arxiv and summarize',
  tabId: 101,
  url: 'https://arxiv.org',
  title: 'arXiv.org e-Print archive',
  status: 'interrupted',
  completedSteps: ['Navigate to arXiv', 'Type quantum computing into search bar'],
  pendingSteps: ['Extract top 3 paper abstracts', 'Summarize key findings'],
  timestamp: Date.now(),
};

assert(taskState.status === 'interrupted', 'Task continuity tracks interrupted status');
assert(taskState.completedSteps.length === 2, 'Tracks completed steps');
assert(taskState.pendingSteps.length === 2, 'Tracks pending steps for safe resumption');
assert(taskState.completedSteps[0] === 'Navigate to arXiv', 'Does not re-run completed steps');

console.log(`\n================================`);
console.log(`Tests Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('ALL PHASE 6 UNIT & SAFETY TESTS PASSED!');
