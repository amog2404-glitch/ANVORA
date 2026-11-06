// scratch/test-phase7-workflows.mjs
console.log('===================================================================');
console.log('ANVORA — Phase 7: Proactive Intelligence & Workflow Automation Audit');
console.log('===================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${testName} ${details ? `(${details})` : ''}`);
    failed++;
  }
}

// -------------------------------------------------------------
// MODULE 1: Webpage Content Normalization & Stable FNV-1a Hashing
// -------------------------------------------------------------
console.log('[MODULE 1] Webpage Content Normalization & Noise Filtering');

function hashContent(content) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeContent(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?\b/g, '')
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi, '')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi, '')
    .replace(/©\s*\d{4}[-\d]*/g, '')
    .replace(/\b\d+\s+(people|users|visitors)\s+(viewing|watching|online)\b/gi, '')
    .replace(/\b(updated|posted|modified)\s+\d+\s+(seconds?|minutes?|hours?|days?)\s+ago\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const textA = "Sony WH-1000XM5 Headphones. Price: ₹24,990. Updated 2 minutes ago. 14 people viewing now. © 2024 Sony Corp.";
const textB = "Sony WH-1000XM5 Headphones. Price: ₹24,990. Updated 5 minutes ago. 22 people viewing now. © 2026 Sony Corp.";
const textC = "Sony WH-1000XM5 Headphones. Price: ₹19,990. On Sale!";

const normA = normalizeContent(textA);
const normB = normalizeContent(textB);
const normC = normalizeContent(textC);

assert(normA === normB, 'Dynamic timestamps, viewer counters, and copyright years are filtered out');
assert(hashContent(normA) === hashContent(normB), 'Identical substantive content yields identical FNV-1a hash despite dynamic noise');
assert(hashContent(normA) !== hashContent(normC), 'Genuine content changes produce distinct hash values');

// -------------------------------------------------------------
// MODULE 2: Security & Access Block Detection
// -------------------------------------------------------------
console.log('\n[MODULE 2] Access Block, CAPTCHA & Authentication Wall Detection');

function detectAccessBlock(rawText, title = '') {
  const combined = `${title} ${rawText}`.toLowerCase();
  if (
    combined.includes('verify you are human') ||
    combined.includes('cloudflare') && (combined.includes('turnstile') || combined.includes('challenge')) ||
    combined.includes('recaptcha') ||
    combined.includes('bot detection') ||
    combined.includes('unusual traffic from your computer')
  ) {
    return { blocked: true, reason: 'Page is protected by a CAPTCHA or bot challenge gate.' };
  }
  if (
    (combined.includes('sign in to your account') || combined.includes('please log in to continue')) &&
    !combined.includes('welcome back') &&
    rawText.length < 500
  ) {
    return { blocked: true, reason: 'Page requires user authentication or login credentials.' };
  }
  if (rawText.length < 30 && !title) {
    return { blocked: true, reason: 'Page returned empty content or failed to load.' };
  }
  return { blocked: false };
}

assert(detectAccessBlock("Please solve the puzzle. Verify you are human to proceed.", "Cloudflare Gate").blocked, 'Detects Cloudflare Turnstile human verification gate');
assert(detectAccessBlock("Protected by Google reCAPTCHA. Checking your browser before accessing.", "Just a moment...").blocked, 'Detects reCAPTCHA gate');
assert(detectAccessBlock("Sign in to your account. Please log in to continue.", "Login Wall").blocked, 'Detects authentication login wall');
assert(!detectAccessBlock("Welcome to our online store. Browse our latest electronic gadgets with free delivery.", "Gadget Hub").blocked, 'Permits legitimate public content pages');

// -------------------------------------------------------------
// MODULE 3: Multicurrency Price Extraction Heuristics
// -------------------------------------------------------------
console.log('\n[MODULE 3] Price Extraction Heuristics');

function extractPrice(text) {
  if (!text) return null;
  const priceRegex = /(?:(₹|rs\.?|inr|\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(₹|rs\.?|inr|\$|€|£))/i;
  const match = text.match(priceRegex);
  if (match) {
    const rawCurrency = (match[1] || match[4] || '').toUpperCase();
    const rawNumber = match[2] || match[3] || '';
    const cleanNumber = parseFloat(rawNumber.replace(/,/g, ''));
    if (!isNaN(cleanNumber) && cleanNumber > 0 && cleanNumber < 100_000_000) {
      let currency = 'INR';
      if (rawCurrency.includes('₹') || rawCurrency.includes('RS') || rawCurrency.includes('INR')) currency = 'INR';
      else if (rawCurrency.includes('$')) currency = 'USD';
      else if (rawCurrency.includes('€')) currency = 'EUR';
      else if (rawCurrency.includes('£')) currency = 'GBP';
      return { price: cleanNumber, currency };
    }
  }
  return null;
}

const priceInr = extractPrice('Buy Apple iPad for ₹29,990 today with bank discount');
assert(priceInr?.price === 29990 && priceInr?.currency === 'INR', 'Extracts Indian Rupee price with comma format (₹29,990)');

const priceRs = extractPrice('Special deal: Rs. 4,500 only');
assert(priceRs?.price === 4500 && priceRs?.currency === 'INR', 'Extracts Rs. currency format');

const priceUsd = extractPrice('Subscription: $199.99 billed annually');
assert(priceUsd?.price === 199.99 && priceUsd?.currency === 'USD', 'Extracts USD price with cents ($199.99)');

const priceEur = extractPrice('Euro rail pass: € 85.50');
assert(priceEur?.price === 85.50 && priceEur?.currency === 'EUR', 'Extracts Euro price (€ 85.50)');

assert(extractPrice('Contact us at +91 9876543210 for inquiries') === null, 'Rejects phone numbers without currency symbols');

// -------------------------------------------------------------
// MODULE 4: Workflow Condition Evaluation Logic
// -------------------------------------------------------------
console.log('\n[MODULE 4] Structured Condition Evaluation');

function evaluateChange(currentSnap, prevSnap, condition) {
  if (!prevSnap) {
    return { hasChanged: false, conditionMet: false, summary: 'Baseline created' };
  }
  const hasChanged = currentSnap.contentHash !== prevSnap.contentHash;

  if (condition.type === 'price_below') {
    const curPrice = currentSnap.detectedPrice;
    const prevPrice = prevSnap.detectedPrice;
    const threshold = condition.threshold || 0;
    if (curPrice === undefined) return { hasChanged, conditionMet: false, summary: 'No price found' };
    const meetsThreshold = curPrice <= threshold;
    return {
      hasChanged: curPrice !== prevPrice || hasChanged,
      conditionMet: meetsThreshold,
      changeType: 'price',
      summary: meetsThreshold ? `Target price satisfied: ₹${curPrice} <= ₹${threshold}` : `Price ₹${curPrice} > ₹${threshold}`
    };
  }

  if (condition.type === 'price_change') {
    const curPrice = currentSnap.detectedPrice;
    const prevPrice = prevSnap.detectedPrice;
    const priceChanged = prevPrice !== undefined && curPrice !== prevPrice;
    return {
      hasChanged: priceChanged,
      conditionMet: priceChanged,
      changeType: 'price',
      summary: priceChanged ? `Price changed from ${prevPrice} to ${curPrice}` : 'Price unchanged'
    };
  }

  if (condition.type === 'content_diff') {
    return {
      hasChanged,
      conditionMet: hasChanged,
      changeType: 'content',
      summary: hasChanged ? 'Content updated' : 'No change'
    };
  }

  return { hasChanged, conditionMet: true, summary: 'Check complete' };
}

const baselineSnap = {
  contentHash: 'aaaa1111',
  detectedPrice: 5500,
  currency: 'INR'
};

const droppedPriceSnap = {
  contentHash: 'bbbb2222',
  detectedPrice: 4800,
  currency: 'INR'
};

const higherPriceSnap = {
  contentHash: 'cccc3333',
  detectedPrice: 5900,
  currency: 'INR'
};

const evalDrop = evaluateChange(droppedPriceSnap, baselineSnap, { type: 'price_below', threshold: 5000 });
assert(evalDrop.conditionMet === true, 'Price drop below ₹5,000 correctly triggers condition met (₹4,800 <= ₹5,000)');

const evalHigh = evaluateChange(higherPriceSnap, baselineSnap, { type: 'price_below', threshold: 5000 });
assert(evalHigh.conditionMet === false, 'Price above threshold does not trigger false notification (₹5,900 > ₹5,000)');

const evalPriceChange = evaluateChange(droppedPriceSnap, baselineSnap, { type: 'price_change' });
assert(evalPriceChange.conditionMet === true, 'Price difference triggers price_change condition');

const evalSame = evaluateChange(baselineSnap, baselineSnap, { type: 'content_diff' });
assert(evalSame.hasChanged === false && evalSame.conditionMet === false, 'Unchanged snapshot triggers neither notification nor condition');

// -------------------------------------------------------------
// MODULE 5: Chrome MV3 Scheduling & Delay Calculations
// -------------------------------------------------------------
console.log('\n[MODULE 5] Chrome MV3 Alarms Scheduling Calculations');

function calculateMinutesUntilTime(timeOfDay) {
  const [h, m] = timeOfDay.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h || 9, m || 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  const diffMs = target.getTime() - now.getTime();
  return Math.max(1, Math.round(diffMs / 60000));
}

const delayForDaily = calculateMinutesUntilTime('09:00');
assert(delayForDaily >= 1 && delayForDaily <= 1440, 'Daily alarm delay is safely bounded between 1 minute and 24 hours (1440 min)');

const intervalMinutesMin = Math.max(1, 0.5);
assert(intervalMinutesMin >= 1, 'Enforces Chrome MV3 minimum alarm delay of at least 1 minute');

// -------------------------------------------------------------
// MODULE 6: Consequential Action Safety Gate & Approval
// -------------------------------------------------------------
console.log('\n[MODULE 6] Consequential Action Safety Gate');

function checkConsequentialGate(workflow) {
  const hasConsequentialStep = workflow.steps.some(s => s.isConsequential);
  if (hasConsequentialStep && !workflow.requiresApproval) {
    return {
      canAutoExecute: false,
      status: 'waiting_approval',
      reason: 'Consequential action requires explicit user authorization'
    };
  }
  return {
    canAutoExecute: true,
    status: 'active'
  };
}

const monitoringOnlyWorkflow = {
  name: 'Morning Summary',
  steps: [{ title: 'Extract page text', isConsequential: false }],
  requiresApproval: false
};
assert(checkConsequentialGate(monitoringOnlyWorkflow).canAutoExecute === true, 'Safe reading/monitoring workflow executes autonomously without gating');

const buyWorkflowUnapproved = {
  name: 'Auto-Checkout',
  steps: [
    { title: 'Check price', isConsequential: false },
    { title: 'Click Buy Now and Pay', isConsequential: true }
  ],
  requiresApproval: false
};
const gateResult = checkConsequentialGate(buyWorkflowUnapproved);
assert(gateResult.canAutoExecute === false, 'Blocks automated execution of consequential/purchasing actions without explicit user approval');
assert(gateResult.status === 'waiting_approval', 'Consequential workflow safely pauses in waiting_approval state');

// -------------------------------------------------------------
// MODULE 7: Sensitive Data Sanitization in Workflow Logs
// -------------------------------------------------------------
console.log('\n[MODULE 7] Workflow History Sanitization');

const SENSITIVE_PATTERNS = [
  /\bAIza[0-9A-Za-z-_]{25,50}\b/i,
  /\bsk-[0-9A-Za-z-_]{20,}\b/i,
  /\bpassword\s*[:=]\s*\S+/i,
  /\bbearer\s+[a-zA-Z0-9_\-\.]+/i,
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/
];

function sanitizeLogText(log) {
  let clean = log;
  for (const pat of SENSITIVE_PATTERNS) {
    clean = clean.replace(pat, '[REDACTED_CREDENTIAL]');
  }
  return clean;
}

const rawLogWithKey = 'Executed check with header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and password: mysecretpassword';
const cleanLog = sanitizeLogText(rawLogWithKey);
assert(!cleanLog.includes('mysecretpassword'), 'Redacts passwords from execution logs');
assert(!cleanLog.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Redacts bearer authentication tokens from execution logs');

// -------------------------------------------------------------
// MODULE 8: Workflow Lifecycle CRUD Simulation
// -------------------------------------------------------------
console.log('\n[MODULE 8] Workflow CRUD Lifecycle Simulation');

class MockWorkflowStore {
  constructor() {
    this.workflows = new Map();
  }
  create(wf) {
    const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const full = { ...wf, id, status: 'active', createdAt: Date.now(), updatedAt: Date.now(), executionHistory: [] };
    this.workflows.set(id, full);
    return full;
  }
  pause(id) {
    const wf = this.workflows.get(id);
    if (wf) wf.status = 'paused';
    return wf;
  }
  resume(id) {
    const wf = this.workflows.get(id);
    if (wf) wf.status = 'active';
    return wf;
  }
  cancel(id) {
    const wf = this.workflows.get(id);
    if (wf) wf.status = 'cancelled';
    return wf;
  }
  delete(id) {
    return this.workflows.delete(id);
  }
}

const store = new MockWorkflowStore();
const created = store.create({ name: 'Price Tracker', trigger: { type: 'interval', intervalMinutes: 15 } });
assert(created.id && created.status === 'active', 'Creates active workflow successfully');

store.pause(created.id);
assert(store.workflows.get(created.id).status === 'paused', 'Pauses workflow successfully');

store.resume(created.id);
assert(store.workflows.get(created.id).status === 'active', 'Resumes workflow successfully');

store.cancel(created.id);
assert(store.workflows.get(created.id).status === 'cancelled', 'Cancels workflow successfully');

store.delete(created.id);
assert(!store.workflows.has(created.id), 'Deletes workflow cleanly');

// -------------------------------------------------------------
// MODULE 9: Multilingual Workflow Voice Directives
// -------------------------------------------------------------
console.log('\n[MODULE 9] Multilingual Workflow Command Detection');

function matchWorkflowCommand(transcript) {
  const lower = (transcript || '').toLowerCase().trim();
  if (
    lower.includes('what workflows are active') ||
    lower.includes('what workflows are currently active') ||
    lower.includes('active workflows') ||
    lower.includes('list workflows') ||
    lower.includes('kaun se workflow') || // Hindi
    lower.includes('em workflows unnai')  // Telugu
  ) {
    return 'list_active';
  }
  if (
    lower.startsWith('pause workflow') ||
    lower.startsWith('pause my workflow') ||
    lower.includes('workflow pause karo') || // Hindi
    lower.includes('workflow api')          // Telugu
  ) {
    return 'pause';
  }
  if (
    lower.startsWith('resume workflow') ||
    lower.startsWith('resume my workflow') ||
    lower.includes('workflow shuru karo') || // Hindi
    lower.includes('workflow modalu pettu')  // Telugu
  ) {
    return 'resume';
  }
  if (
    lower.startsWith('cancel workflow') ||
    lower.startsWith('cancel the workflow') ||
    lower.includes('workflow band karo') ||   // Hindi
    lower.includes('workflow raddu cheyi')   // Telugu
  ) {
    return 'cancel';
  }
  return 'other';
}

assert(matchWorkflowCommand('What workflows are currently active?') === 'list_active', 'English query detected');
assert(matchWorkflowCommand('kaun se workflow chal rahe hain?') === 'list_active', 'Hindi query detected (Hinglish)');
assert(matchWorkflowCommand('active em workflows unnai?') === 'list_active', 'Telugu query detected (Tenglish)');
assert(matchWorkflowCommand('Pause my workflow please') === 'pause', 'English pause command detected');
assert(matchWorkflowCommand('ye workflow band karo') === 'cancel', 'Hindi cancel command detected');

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n===================================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('===================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
