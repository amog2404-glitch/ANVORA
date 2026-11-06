// scratch/test-network-classifier.mjs
// Automated verification suite for ANVORA Network & Error Classification
// Tests accurate classification of offline vs rate-limit vs auth vs timeout vs provider down.

import { classifyProviderError, checkActualConnectivity } from '../src/lib/network-classifier.ts';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failed++;
  }
}

console.log('======================================================================');
console.log('ANVORA — CONNECTIVITY & PROVIDER ERROR CLASSIFICATION TEST SUITE');
console.log('======================================================================');

async function runTests() {
  // Test 1: Real offline state
  const offlineErr = new Error('Failed to fetch');
  // Mock offline by setting navigator.onLine
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true, writable: true });
  // Mock fetch to reject for generate_204 probe when offline
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const offlineResult = await classifyProviderError(offlineErr);
  assert(offlineResult.category === 'actual_offline', 'Detects genuine offline when navigator.onLine is false');
  assert(offlineResult.userMessage.includes('device appears to be offline'), 'Provides clear offline guidance');

  // Test 2: Transient network error while ONLINE (300 Mbps connection)
  // Must NEVER falsely say "No internet connection"
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true, writable: true });
  // Mock fetch to succeed for generate_204 probe
  globalThis.fetch = async () => ({ ok: true, status: 204 });
  const transientErr = new TypeError('Failed to fetch');
  const transientResult = await classifyProviderError(transientErr);
  assert(transientResult.category === 'network_degraded', 'Distinguishes network glitch from actual offline while user is online');
  assert(!transientResult.userMessage.toLowerCase().includes('device appears to be offline'), 'Does NOT claim device is offline when online');
  assert(transientResult.userMessage.includes('temporary network glitch'), 'Explains temporary AI provider network glitch');

  // Test 3: Invalid or unauthorized Gemini API key (401 / 403)
  const authErr401 = new Error('Gemini authorization error (401): API_KEY_INVALID');
  authErr401.status = 401;
  const authResult401 = await classifyProviderError(authErr401, 401);
  assert(authResult401.category === 'gemini_auth_error', 'Classifies HTTP 401 as gemini_auth_error');
  assert(authResult401.userMessage.includes('invalid or unauthorized'), 'Advises user to verify API key in Settings');
  assert(authResult401.canRetry === false, 'Non-retryable configuration error');

  const authErr403 = new Error('The caller does not have permission');
  const authResult403 = await classifyProviderError(authErr403, 403);
  assert(authResult403.category === 'gemini_auth_error', 'Classifies HTTP 403 as gemini_auth_error');

  // Test 4: Rate limit hit (429 / RESOURCE_EXHAUSTED)
  const rateLimitErr = new Error('ResourceExhausted: rate limit exceeded');
  const rateLimitResult = await classifyProviderError(rateLimitErr, 429);
  assert(rateLimitResult.category === 'gemini_rate_limit', 'Classifies HTTP 429 as gemini_rate_limit');
  assert(rateLimitResult.userMessage.includes('too many requests'), 'Informs user of high AI traffic');
  assert(rateLimitResult.canRetry === true, 'Rate limit error is retryable');

  // Test 5: Quota exhausted (distinct from rate limit)
  const quotaErr = new Error('You have exceeded your current quota, please check your plan and billing details');
  const quotaResult = await classifyProviderError(quotaErr);
  assert(quotaResult.category === 'gemini_quota_exhausted', 'Classifies quota exhaustion separately from temporary rate limit');
  assert(quotaResult.userMessage.includes('quota has been exhausted'), 'Directs user to check AI Studio plan');
  assert(quotaResult.canRetry === false, 'Quota exhaustion is not immediately retryable');

  // Test 6: Request timeout (AbortError / 408 / 504)
  const timeoutErr = new Error('The operation was aborted');
  timeoutErr.name = 'AbortError';
  const timeoutResult = await classifyProviderError(timeoutErr);
  assert(timeoutResult.category === 'request_timeout', 'Classifies AbortError as request_timeout');
  assert(timeoutResult.userMessage.includes('took too long'), 'Friendly timeout message');

  // Test 7: Gemini server unavailable (500 / 503)
  const server503Err = new Error('Service Unavailable');
  const server503Result = await classifyProviderError(server503Err, 503);
  assert(server503Result.category === 'gemini_unavailable', 'Classifies HTTP 503 as gemini_unavailable');
  assert(server503Result.userMessage.includes('temporarily unavailable'), 'Advises Gemini is temporarily unavailable');

  // Test 8: Missing API key
  const missingKeyErr = new Error('Gemini API key is missing. Please configure it in Settings.');
  const missingKeyResult = await classifyProviderError(missingKeyErr);
  assert(missingKeyResult.category === 'configuration_error', 'Classifies missing API key as configuration_error');

  // Test 9: Lightweight connectivity check probe
  const probeOnline = await checkActualConnectivity(500);
  assert(probeOnline === true, 'checkActualConnectivity succeeds and returns boolean');

  console.log('----------------------------------------------------------------------');
  console.log(`RESULTS: Passed: ${passed}, Failed: ${failed}`);
  console.log('----------------------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
