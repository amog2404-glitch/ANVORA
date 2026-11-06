// src/lib/performance-tracer.ts
import { logger } from './logger';

export interface PerformanceTrace {
  command: string;
  startTime: number;
  transcriptReceivedMs: number;
  intentClassificationMs: number;
  isFastPath: boolean;
  geminiRequestMs: number;
  chromeTabOperationMs: number;
  navigationInitiatedMs: number;
  totalDispatchMs: number;
}

export class PerformanceTracker {
  private startTime: number;
  private command: string;
  private isFastPath = false;
  private intentClassificationMs = 0;
  private geminiRequestMs = 0;
  private chromeTabOperationMs = 0;
  private navigationInitiatedMs = 0;

  constructor(command: string) {
    this.command = command;
    this.startTime = performance.now();
  }

  public markIntentClassified(isFastPath: boolean): number {
    this.isFastPath = isFastPath;
    this.intentClassificationMs = Math.round(performance.now() - this.startTime);
    return this.intentClassificationMs;
  }

  public markGeminiComplete(durationMs?: number): number {
    if (durationMs !== undefined) {
      this.geminiRequestMs = Math.round(durationMs);
    } else {
      this.geminiRequestMs = Math.round(performance.now() - this.startTime - this.intentClassificationMs);
    }
    return this.geminiRequestMs;
  }

  public markTabOperationComplete(): number {
    this.chromeTabOperationMs = Math.round(performance.now() - this.startTime);
    this.navigationInitiatedMs = this.chromeTabOperationMs;
    return this.chromeTabOperationMs;
  }

  public completeTrace(): PerformanceTrace {
    const totalDispatchMs = Math.round(performance.now() - this.startTime);
    const trace: PerformanceTrace = {
      command: this.command,
      startTime: this.startTime,
      transcriptReceivedMs: 0,
      intentClassificationMs: this.intentClassificationMs,
      isFastPath: this.isFastPath,
      geminiRequestMs: this.geminiRequestMs,
      chromeTabOperationMs: this.chromeTabOperationMs,
      navigationInitiatedMs: this.navigationInitiatedMs,
      totalDispatchMs,
    };

    this.logTrace(trace);
    return trace;
  }

  private logTrace(trace: PerformanceTrace): void {
    const geminiStatus = trace.isFastPath 
      ? 'SKIPPED — FAST PATH (0 ms)' 
      : `${trace.geminiRequestMs} ms`;

    logger.info('PerfTracer', `[COMMAND DISPATCH SUMMARY] "${trace.command}"`, {
      intentClassification: `${trace.intentClassificationMs} ms ${trace.isFastPath ? '(FAST PATH)' : '(LLM)'}`,
      geminiRequest: geminiStatus,
      chromeTabOperation: `${trace.chromeTabOperationMs} ms`,
      totalDispatch: `${trace.totalDispatchMs} ms`,
    });

    // Console output for development visibility
    if (typeof console !== 'undefined' && console.debug) {
      console.debug(
        `%c[ANVORA PERF] Command: "${trace.command}"\n` +
        `  • Intent Classification: ${trace.intentClassificationMs} ms ${trace.isFastPath ? '[FAST PATH]' : '[GEMINI]'}\n` +
        `  • Gemini Request: ${geminiStatus}\n` +
        `  • Chrome Tab Operation: ${trace.chromeTabOperationMs} ms\n` +
        `  • Navigation Initiated: ${trace.navigationInitiatedMs} ms\n` +
        `  • Total Command Dispatch: ${trace.totalDispatchMs} ms`,
        'color: #6366f1; font-weight: bold;'
      );
    }
  }
}

export function startPerformanceTrace(command: string): PerformanceTracker {
  return new PerformanceTracker(command);
}

