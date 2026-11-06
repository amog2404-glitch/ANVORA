// src/lib/network-classifier.ts
// Accurate network and AI provider error classification for ANVORA.
// Prevents false "No internet connection" errors when the device is online
// and accurately distinguishes offline, timeout, auth, rate-limit, and server errors.

const debugLog = (comp: string, msg: string, data?: any) => {
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[DEBUG] [${comp}]`, msg, data || '');
  }
};

export type ClassifiedErrorCategory =
  | 'actual_offline'
  | 'gemini_auth_error'
  | 'gemini_rate_limit'
  | 'gemini_quota_exhausted'
  | 'gemini_unavailable'
  | 'request_timeout'
  | 'network_degraded'
  | 'configuration_error'
  | 'unknown';

export interface ClassifiedError {
  category: ClassifiedErrorCategory;
  userMessage: string;
  spokenMessage: string;
  canRetry: boolean;
  httpStatus?: number;
}

/**
 * Lightweight, non-blocking probe to verify actual internet connectivity.
 * Uses a 1.5s timeout and Google's standard generate_204 endpoint.
 * Returns true if the device can reach the internet, false if genuinely disconnected.
 */
export async function checkActualConnectivity(timeoutMs = 1500): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Google generate_204 returns empty body with HTTP 204 No Content instantly
    await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timer);
    return true;
  } catch (err) {
    // If Google 204 timed out or network error occurred, fall back to navigator.onLine
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
}

/**
 * Classifies an error from Gemini, Groq, or network calls into specific,
 * actionable categories with appropriate user messages.
 */
export async function classifyProviderError(
  err: any,
  status?: number
): Promise<ClassifiedError> {
  const errMsg = String(err?.message || err || '').toLowerCase();
  const errName = String(err?.name || '');
  const httpStatus = status || (typeof err?.status === 'number' ? err.status : undefined);

  debugLog('NetworkClassifier', 'Classifying error', {
    errMsg,
    errName,
    httpStatus,
  });

  // 1. Missing API Key configuration
  if (errMsg.includes('api key is missing') || errMsg.includes('missing api key')) {
    return {
      category: 'configuration_error',
      userMessage: 'Gemini API key is not configured. Please set your API key in Settings.',
      spokenMessage: 'Please set your Gemini API key in Settings.',
      canRetry: false,
      httpStatus,
    };
  }

  // 2. Authentication / Authorization Errors (400 / 401 / 403 / API_KEY_INVALID)
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    (httpStatus === 400 && (errMsg.includes('key') || errMsg.includes('auth') || errMsg.includes('credential'))) ||
    errMsg.includes('authorization error') ||
    errMsg.includes('api_key_invalid') ||
    errMsg.includes('api key not valid') ||
    errMsg.includes('unauthorized') ||
    errMsg.includes('permission denied')
  ) {
    return {
      category: 'gemini_auth_error',
      userMessage: 'Your Gemini API key appears to be invalid or unauthorized. Please verify your key in Settings.',
      spokenMessage: 'Your Gemini API key was rejected as invalid or unauthorized. Please check Settings.',
      canRetry: false,
      httpStatus: httpStatus || 401,
    };
  }

  // 3. Quota Exhaustion (distinct from temporary rate limits)
  if (
    errMsg.includes('quota exceeded') ||
    errMsg.includes('billing') ||
    errMsg.includes('exceeded your current quota') ||
    errMsg.includes('insufficient_quota')
  ) {
    return {
      category: 'gemini_quota_exhausted',
      userMessage: 'Your Gemini API quota has been exhausted. Please check your Google AI Studio plan.',
      spokenMessage: 'Your Gemini API quota has been exhausted. Please check your plan.',
      canRetry: false,
      httpStatus: httpStatus || 429,
    };
  }

  // 4. Rate Limiting (429 / RESOURCE_EXHAUSTED)
  if (
    httpStatus === 429 ||
    errMsg.includes('rate limit') ||
    errMsg.includes('resource_exhausted') ||
    errMsg.includes('too many requests')
  ) {
    return {
      category: 'gemini_rate_limit',
      userMessage: 'The AI service is receiving too many requests. Please try again shortly.',
      spokenMessage: 'The AI service is receiving too many requests. Please try again shortly.',
      canRetry: true,
      httpStatus: 429,
    };
  }

  // 5. Request Timeouts (AbortError / timeout)
  if (
    errName === 'AbortError' ||
    errMsg.includes('timeout') ||
    errMsg.includes('timed out') ||
    httpStatus === 408 ||
    httpStatus === 504
  ) {
    return {
      category: 'request_timeout',
      userMessage: 'The request took too long to complete. Please try again.',
      spokenMessage: 'The request took too long. Please try again.',
      canRetry: true,
      httpStatus: httpStatus || 408,
    };
  }

  // 6. Provider Server Errors (500, 502, 503)
  if (
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    errMsg.includes('service unavailable') ||
    errMsg.includes('bad gateway') ||
    errMsg.includes('internal server error')
  ) {
    return {
      category: 'gemini_unavailable',
      userMessage: 'Gemini is temporarily unavailable. Please try again shortly.',
      spokenMessage: 'Gemini is temporarily unavailable. Please try again.',
      canRetry: true,
      httpStatus: httpStatus || 503,
    };
  }

  // 7. Network / Fetch Failures: Check if user is ACTUALLY offline or if it's transient
  if (
    errMsg.includes('failed to fetch') ||
    errMsg.includes('network error') ||
    errMsg.includes('networkerror') ||
    errMsg.includes('fetch failed')
  ) {
    const isOnline = await checkActualConnectivity();
    if (!isOnline) {
      return {
        category: 'actual_offline',
        userMessage: 'Your device appears to be offline. Please check your internet connection.',
        spokenMessage: 'Your device appears to be offline.',
        canRetry: true,
        httpStatus,
      };
    }

    return {
      category: 'network_degraded',
      userMessage: 'Encountered a temporary network glitch while contacting the AI service. Please try again.',
      spokenMessage: 'A temporary network glitch occurred while contacting the AI service. Please try again.',
      canRetry: true,
      httpStatus,
    };
  }

  // 8. Default fallback
  return {
    category: 'unknown',
    userMessage: 'Encountered an issue processing that request. Please try again.',
    spokenMessage: 'I encountered an issue processing that. Please try again.',
    canRetry: true,
    httpStatus,
  };
}
