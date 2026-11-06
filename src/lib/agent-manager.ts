// src/lib/agent-manager.ts
import { classifyTranscript } from './classifying';
import { determineNextAction } from './planning';
import { HistoryManager } from './history-manager';
import { logger } from './logger';
import { buildFullSystemPrompt } from './system-prompt';
import type { BackgroundContext } from './system-prompt';
import type { LLMConfig } from './litellm-client';
import { callGemini, cancelPendingGeminiCalls } from './litellm-client';
import { StateMachine } from './state-machine';
import type { AgentState, StateSnapshot, WaitReason } from './state-machine';
import { WorkerAgent } from './worker-agent';
import { MemoryManager } from './memory-manager';
import { WorkflowManager } from './workflow-manager';
import { parseWorkflowFromDirective, type ParsedWorkflowDraft } from './workflow-parser';
import type { BrowserActivityStep, ActionConfirmationData, ActivityState } from '../sidepanel/types';
import type { ActionResult } from './browser-action-types';
import { classifyFastPath, buildSearchUrl, type FastPathResult } from './fast-path-router';
import { startPerformanceTrace, type PerformanceTracker } from './performance-tracer';
import { classifyProviderError } from './network-classifier';

export interface AgentContext {
  url: string;
  title: string;
  semanticText: string;
  markersText: string;
  tabId?: number;
  domain?: string;
  wordCount?: number;
}

export type { AgentState, StateSnapshot };

export class AgentManager {
  private machine = new StateMachine();
  private history!: HistoryManager;
  private memoryManager = MemoryManager.getInstance();
  private workflowManager = WorkflowManager.getInstance();
  private pendingWorkflowDraft: ParsedWorkflowDraft | null = null;
  private llmConfig: LLMConfig | null = null;
  private bgCtx: BackgroundContext | null = null;
  private taskAbortController: AbortController | null = null;

  // Task-bound tab identifier to guarantee multi-step tasks do not jump tabs
  private taskBoundTabId: number | null = null;

  // Multi-step task tracking & confirmation state
  private activeTimelineSteps: BrowserActivityStep[] = [];
  private pendingConfirmationAction: {
    id: string;
    actionDef: any;
    taskSummary: string;
    signal: AbortSignal;
    ctx: any;
  } | null = null;
  
  // Callbacks
  public onStateChange?: (snap: StateSnapshot) => void;
  public onSpeak?: (text: string) => void;
  public onExecuteAction?: (action: any) => Promise<ActionResult | any>;
  public onGetContext?: (boundTabId?: number | null) => Promise<AgentContext | null>;
  public onGetScreenshot?: () => Promise<string | null>;
  public onProgressUpdate?: (steps: BrowserActivityStep[], pendingAction?: ActionConfirmationData, text?: string) => void;

  constructor() {
    // Wire state machine hooks
    this.machine.onChange = (snap) => this.onStateChange?.(snap);

    this.machine.onExitBusy = () => {
      // Auto-abort in-flight work when leaving EXECUTING/PLANNING
      if (this.taskAbortController) {
        this.taskAbortController.abort();
        this.taskAbortController = null;
      }
    };

    this.machine.onWaitTimeout = () => {
      this.onSpeak?.('ANVORA is standing by. Let me know when you are ready.');
    };
  }

  public async configure(config: LLMConfig, bgCtx?: BackgroundContext) {
    this.llmConfig = config;
    if (bgCtx) this.bgCtx = bgCtx;
    this.history = await HistoryManager.create();
    await this.memoryManager.load();
    await this.workflowManager.load();
  }

  public getState(): AgentState { return this.machine.current.state; }
  public getSnapshot(): StateSnapshot { return this.machine.current; }
  public getTransitionLog() { return this.machine.log; }
  public getBgCtx(): BackgroundContext | null { return this.bgCtx; }
  
  public async clearHistory() {
    // Abort any in-flight task
    if (this.taskAbortController) {
      this.taskAbortController.abort();
      this.taskAbortController = null;
    }
    this.taskBoundTabId = null;
    this.pendingConfirmationAction = null;
    this.pendingWorkflowDraft = null;
    cancelPendingGeminiCalls();
    await this.history.clear();
    this.machine.reset('Memory wiped.');
  }

  public async handleTranscript(transcript: string) {
    logger.info('AgentManager', 'Handling transcript', { transcript });

    const snap = this.machine.current;

    // Fast path: if waiting for a reply, route through handleReply
    if (snap.state === 'WAITING_FOR_REPLY') {
      return this.handleReply(transcript, snap);
    }

    // Guard: if busy, interrupt gracefully
    if (snap.state !== 'IDLE') {
      cancelPendingGeminiCalls();
      // onExitBusy will fire automatically and abort the controller
      this.machine.transition('IDLE', { message: 'Interrupted by new input', pendingTask: null });
    }

    // Reset task-bound tab and pending action for new independent requests
    this.taskBoundTabId = null;
    this.pendingConfirmationAction = null;

    // Fresh abort controller for this task
    const currentAbortController = new AbortController();
    this.taskAbortController = currentAbortController;

    if (!this.llmConfig || !this.llmConfig.geminiApiKey) {
      this.machine.transition('IDLE', { message: 'Error: Missing API Key in Settings' });
      this.onSpeak?.('Please configure your Gemini API Key in the settings menu.');
      return;
    }

    const lowerTranscript = transcript.toLowerCase().trim();

    // Phase 6: Explicit User Memory Commands
    if (lowerTranscript.startsWith('remember that ') || lowerTranscript.startsWith('remember ') || lowerTranscript.startsWith('save preference ')) {
      if (!this.memoryManager.isEnabled()) {
        this.machine.transition('IDLE', { message: 'Memory disabled' });
        const msg = 'Memory is currently disabled in your settings. Please enable memory in settings to save preferences.';
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
        return;
      }

      const memoryContent = transcript.replace(/^(remember\s+that\s+|remember\s+|save\s+preference\s+)/i, '').trim();
      if (!memoryContent || memoryContent.length < 3) {
        this.machine.transition('IDLE', { message: 'Memory too short' });
        const msg = 'Please specify what you would like me to remember.';
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
        return;
      }

      const added = await this.memoryManager.addMemory(memoryContent, 'preference', 'explicit_user', true);
      this.machine.transition('IDLE', { message: 'Memory saved' });
      if (added) {
        const msg = `I've remembered that: ${memoryContent}`;
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
      } else {
        const msg = "I couldn't save that memory. Sensitive information such as passwords, credentials, tokens, or adversarial directives cannot be stored.";
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
      }
      return;
    }

    if (lowerTranscript === 'forget all memories' || lowerTranscript === 'clear all memories' || lowerTranscript === 'clear my memory') {
      await this.memoryManager.clearAllMemories();
      this.machine.transition('IDLE', { message: 'Memories cleared' });
      const msg = "I've cleared all stored preferences and memories.";
      this.onSpeak?.(msg);
      await this.history.addTurn('assistant', msg, this.llmConfig);
      return;
    }

    // Phase 7: Workflow Quick Voice Commands (Multilingual EN / HI / TE)
    if (
      lowerTranscript === 'what workflows are active' ||
      lowerTranscript === 'what workflows are currently active' ||
      lowerTranscript === 'active workflows' ||
      lowerTranscript === 'list workflows' ||
      lowerTranscript === 'show my workflows' ||
      lowerTranscript.includes('kaun se workflow') ||
      lowerTranscript.includes('em workflows unnai')
    ) {
      await this.workflowManager.load();
      const allWfs = this.workflowManager.listWorkflows();
      const activeWfs = allWfs.filter(w => w.status === 'active' || w.status === 'running');

      this.machine.transition('IDLE', { message: 'Workflows listed.' });
      let msg = '';
      if (activeWfs.length === 0) {
        msg = 'You currently have no active workflows. You can ask me to monitor a website or check prices anytime.';
      } else {
        const wfDescriptions = activeWfs.map(w => `"${w.name}" (${w.trigger.type})`).join(', ');
        msg = `You have ${activeWfs.length} active workflow${activeWfs.length > 1 ? 's' : ''}: ${wfDescriptions}.`;
      }
      this.onSpeak?.(msg);
      await this.history.addTurn('assistant', msg, this.llmConfig);
      return;
    }

    // Pause workflow voice command
    if (
      lowerTranscript.startsWith('pause workflow') ||
      lowerTranscript.startsWith('pause my workflow') ||
      lowerTranscript === 'pause monitoring' ||
      lowerTranscript === 'pause the monitoring task'
    ) {
      await this.workflowManager.load();
      const allWfs = this.workflowManager.listWorkflows();
      const targetWf = allWfs.find(w => w.status === 'active' || w.status === 'running');
      if (targetWf) {
        await this.workflowManager.pauseWorkflow(targetWf.id);
        this.machine.transition('IDLE', { message: 'Workflow paused.' });
        const msg = `Paused workflow "${targetWf.name}". You can resume it anytime.`;
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
      } else {
        this.machine.transition('IDLE', { message: 'No active workflow to pause.' });
        const msg = 'There are no active workflows to pause.';
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
      }
      return;
    }

    // Resume workflow voice command
    if (
      lowerTranscript.startsWith('resume workflow') ||
      lowerTranscript.startsWith('resume my workflow') ||
      lowerTranscript === 'resume monitoring' ||
      lowerTranscript === 'resume the monitoring task'
    ) {
      await this.workflowManager.load();
      const allWfs = this.workflowManager.listWorkflows();
      const targetWf = allWfs.find(w => w.status === 'paused');
      if (targetWf) {
        await this.workflowManager.resumeWorkflow(targetWf.id);
        this.machine.transition('IDLE', { message: 'Workflow resumed.' });
        const msg = `Resumed workflow "${targetWf.name}". It is now active according to schedule.`;
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
      } else {
        this.machine.transition('IDLE', { message: 'No paused workflow to resume.' });
        const msg = 'There are no paused workflows to resume.';
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
      }
      return;
    }

    // Cancel workflow voice command
    if (
      lowerTranscript.startsWith('cancel workflow') ||
      lowerTranscript.startsWith('cancel the workflow') ||
      lowerTranscript === 'cancel monitoring task' ||
      lowerTranscript === 'cancel the monitoring task'
    ) {
      await this.workflowManager.load();
      const allWfs = this.workflowManager.listWorkflows();
      const targetWf = allWfs.find(w => w.status === 'active' || w.status === 'running' || w.status === 'paused');
      if (targetWf) {
        await this.workflowManager.cancelWorkflow(targetWf.id);
        this.machine.transition('IDLE', { message: 'Workflow cancelled.' });
        const msg = `Cancelled workflow "${targetWf.name}".`;
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
      } else {
        this.machine.transition('IDLE', { message: 'No workflow to cancel.' });
        const msg = 'There are no active or paused workflows to cancel.';
        this.onSpeak?.(msg);
        await this.history.addTurn('assistant', msg, this.llmConfig);
      }
      return;
    }

    // ─── FAST-PATH COMMAND ROUTING ─────────────────────────────────────────────
    // Deterministically inspect simple navigation, search, and tab commands.
    // Bypasses Gemini API completely for <50ms execution.
    const perfTracker: PerformanceTracker = startPerformanceTrace(transcript);
    const fastPathResult = classifyFastPath(transcript);

    if (fastPathResult.isFastPath && fastPathResult.action) {
      perfTracker.markIntentClassified(true);
      perfTracker.markGeminiComplete(0); // Gemini skipped
      logger.info('AgentManager', 'Executing via Fast-Path Router (bypassing Gemini)', {
        action: fastPathResult.action,
        acknowledgement: fastPathResult.acknowledgement,
      });

      await this.executeFastPath(fastPathResult, perfTracker);
      return;
    }

    perfTracker.markIntentClassified(false);

    this.machine.transition('CLASSIFYING', { message: 'Understanding your request...' });
    
    // Add user message to history
    await this.history.addTurn('user', transcript, this.llmConfig);

    try {
      const ctx = (await this.onGetContext?.()) || { url: '', title: '', semanticText: '', markersText: '' };
      if (ctx.tabId) {
        this.taskBoundTabId = ctx.tabId;
      }

      // Phase 6: Task Continuity Check for "continue where you stopped" / "resume"
      const lastContinuity = await this.memoryManager.getLastTaskContinuity();
      if (/^(continue\s+where\s+you\s+stopped|continue\s+task|resume\s+task|resume|continue)$/i.test(lowerTranscript)) {
        if (lastContinuity && (lastContinuity.status === 'interrupted' || lastContinuity.status === 'paused')) {
          let resumeCtx = ctx;

          // Re-verify task-bound tab state if specified in saved continuity
          if (lastContinuity.tabId && this.onGetContext) {
            const checkCtx = await this.onGetContext(lastContinuity.tabId);
            if (checkCtx) {
              resumeCtx = checkCtx;
              this.taskBoundTabId = lastContinuity.tabId;
            } else {
              this.machine.transition('IDLE', { message: 'Previous task tab is unavailable.' });
              const msg = 'The browser tab for your previous task is no longer open. Would you like me to start the task on your current page?';
              this.onSpeak?.(msg);
              await this.history.addTurn('assistant', msg, this.llmConfig);
              return;
            }
          }

          this.machine.transition('PLANNING', { message: 'Resuming interrupted task...' });
          this.onSpeak?.(`Resuming your task: ${lastContinuity.directive}`);
          await this.executeTask(
            `Resume and complete remaining steps for: ${lastContinuity.directive}. Already completed: ${lastContinuity.completedSteps.join(', ')}`,
            currentAbortController.signal,
            resumeCtx
          );
          return;
        } else {
          this.machine.transition('IDLE', { message: 'No interrupted task found.' });
          this.onSpeak?.('There are no interrupted tasks to resume.');
          return;
        }
      }

      // Phase 6: Relevant Memory Retrieval & Context Enrichment
      const relevantMemories = this.memoryManager.getRelevantMemories(transcript, ctx.url);
      const memoriesSummary = this.memoryManager.formatMemoriesForPrompt(relevantMemories);
      let lastTaskContinuitySummary = '';
      if (lastContinuity && (lastContinuity.status === 'interrupted' || lastContinuity.status === 'paused')) {
        lastTaskContinuitySummary = `[INTERRUPTED TASK CONTINUITY AVAILABLE]\nPrevious task: "${lastContinuity.directive}" on ${lastContinuity.url}\nCompleted steps: ${lastContinuity.completedSteps.join(' -> ')}\nRemaining steps: ${lastContinuity.pendingSteps.join(', ') || 'Pending completion'}`;
      }

      const enrichedBgCtx: BackgroundContext = {
        ...(this.bgCtx || { name: '', role: '', preferences: [], shortcuts: {}, frequentSites: [] }),
        memoriesSummary,
        lastTaskContinuitySummary,
      };
      
      const historyStr = JSON.stringify(this.history.getHistory().slice(-4));
      const classification = await classifyTranscript(
        transcript, ctx.url, ctx.title, historyStr, this.llmConfig, enrichedBgCtx, currentAbortController.signal
      );
      logger.info('AgentManager', 'Classification result', classification);

      if (classification.type === 'cancellation') {
        this.taskBoundTabId = null;
        this.pendingConfirmationAction = null;
        this.machine.transition('IDLE', { message: 'Task cancelled.', pendingTask: null });
        this.onSpeak?.('Understood. Task cancelled.');
        await this.history.addTurn('assistant', 'Action cancelled by user.', this.llmConfig);

      } else if (classification.type === 'confirmation') {
        if (classification.ambiguity === 'ambiguous') {
          const q = classification.clarification_question || "I'm not sure if you want to proceed. Please say yes to confirm or no to cancel.";
          this.machine.transition('WAITING_FOR_REPLY', {
            message: 'Waiting for clarification...',
            pendingTask: snap.pendingTask,
            waitReason: snap.waitReason || 'confirmation',
          });
          this.onSpeak?.(q);
          await this.history.addTurn('assistant', q, this.llmConfig);
          return;
        }

        if (this.pendingConfirmationAction) {
          await this.confirmPendingAction();
        } else {
          // Check if there is an unhandled pending task before dropping
          const pending = snap.pendingTask || this.machine.current.pendingTask;
          if (pending) {
            this.machine.transition('PLANNING', { message: 'Planning execution...', pendingTask: null, waitReason: null });
            await this.executeTask(pending, currentAbortController.signal, ctx);
          } else {
            this.taskBoundTabId = null;
            this.machine.transition('IDLE', { message: 'ANVORA is ready.' });
            this.onSpeak?.('Understood.');
          }
        }

      } else if (classification.type === 'generic') {
        this.taskBoundTabId = null;
        this.pendingConfirmationAction = null;
        this.machine.transition('RESPONDING', { message: 'Replying...', pendingTask: null });
        try {
          const sysPrompt = buildFullSystemPrompt(this.bgCtx);
          const historyMsgs = this.history.getHistory().map((h: any) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content }));
          const llmMessages: any = [
            { role: 'system', content: sysPrompt },
            ...historyMsgs,
            { role: 'user', content: transcript }
          ];
          let responseText = await callGemini(llmMessages, this.llmConfig, false, currentAbortController.signal);
          this.onSpeak?.(responseText);
          await this.history.addTurn('assistant', responseText, this.llmConfig);
        } catch(e) {
          this.onSpeak?.("I am ANVORA, your autonomous browser assistant. How can I help you on this page?");
        }
        this.machine.transition('IDLE', { message: 'ANVORA is ready.' });

      } else if (classification.type === 'workflow') {
        this.taskBoundTabId = null;
        this.pendingConfirmationAction = null;

        // Parse workflow draft from user directive
        const draft = await parseWorkflowFromDirective(
          transcript, ctx.url, ctx.title, this.llmConfig, currentAbortController.signal
        );

        if (draft.missingInfo) {
          this.machine.transition('WAITING_FOR_REPLY', {
            message: 'Waiting for workflow details...',
            pendingTask: transcript,
            waitReason: 'clarification' as WaitReason,
          });
          const q = `To set up this workflow, I need one detail: ${draft.missingInfo}`;
          this.onSpeak?.(q);
          await this.history.addTurn('assistant', q, this.llmConfig);
          return;
        }

        this.pendingWorkflowDraft = draft;

        const schedDesc = draft.triggerType === 'daily'
          ? `daily at ${draft.timeOfDay || '09:00'}`
          : (draft.triggerType === 'interval'
              ? `every ${draft.intervalMinutes || 60} minutes`
              : (draft.triggerType === 'price_change'
                  ? `every 15 minutes for price changes`
                  : `${draft.triggerType}`));

        const confirmationMsg = `I've prepared a workflow: "${draft.name}" to run ${schedDesc} on ${draft.targetUrl || 'the active webpage'}. Should I activate this workflow?`;

        this.machine.transition('WAITING_FOR_REPLY', {
          message: 'Waiting for workflow confirmation...',
          pendingTask: 'CONFIRM_WORKFLOW_CREATION',
          waitReason: 'confirmation' as WaitReason,
        });

        this.onSpeak?.(confirmationMsg);
        await this.history.addTurn('assistant', confirmationMsg, this.llmConfig);
        return;

      } else {
        // classification.type === 'task'
        if (classification.ambiguity === 'ambiguous') {
          const q = classification.clarification_question || "Could you please clarify what you would like me to do?";
          this.machine.transition('WAITING_FOR_REPLY', {
            message: 'Waiting for clarification...',
            pendingTask: classification.summary,
            waitReason: 'clarification' as WaitReason,
          });
          this.onSpeak?.(q);
          await this.history.addTurn('assistant', q, this.llmConfig);

        } else if (classification.risk === 'high') {
          const c = `Just to confirm, you want me to ${classification.summary.toLowerCase()}. Should I proceed?`;
          this.machine.transition('WAITING_FOR_REPLY', {
            message: 'Waiting for confirmation...',
            pendingTask: classification.summary,
            waitReason: 'confirmation' as WaitReason,
          });
          this.onSpeak?.(c);
          await this.history.addTurn('assistant', c, this.llmConfig);

        } else {
          this.machine.transition('PLANNING', { message: 'Analysing the webpage...', pendingTask: null });
          await this.executeTask(classification.summary, currentAbortController.signal, ctx);
        }
      }
    } catch (err: any) {
      this.taskBoundTabId = null;
      this.pendingConfirmationAction = null;
      logger.error('AgentManager', 'handleTranscript failed: ' + (err.stack || err.message || JSON.stringify(err)));
      console.error('handleTranscript failed explicitly:', err);
      this.machine.transition('RECOVERING', { message: 'Encountered an issue' });
      
      const classified = await classifyProviderError(err);
      this.onSpeak?.(classified.spokenMessage);
      try {
        await this.history.addTurn('assistant', classified.userMessage, this.llmConfig || undefined);
      } catch (_) {}
      this.broadcastProgress(classified.userMessage);
      this.machine.transition('IDLE', { message: 'ANVORA is ready.' });
    }
  }

  /**
   * Fast-path handler when ANVORA is in WAITING_FOR_REPLY.
   * Routes unambiguous spoken confirmation directly to confirmPendingAction,
   * handles spoken cancellation, requests clarification on ambiguous replies,
   * and invalidates pending confirmations if a new task is spoken.
   */
  private async handleReply(transcript: string, snap: StateSnapshot) {
    if (!this.llmConfig || !this.llmConfig.geminiApiKey) return;

    const currentAbortController = new AbortController();
    this.taskAbortController = currentAbortController;

    await this.history.addTurn('user', transcript, this.llmConfig);

    try {
      const ctx = (await this.onGetContext?.(this.taskBoundTabId)) || (await this.onGetContext?.()) || { url: '', title: '', semanticText: '', markersText: '' };
      const historyStr = JSON.stringify(this.history.getHistory().slice(-4));

      // Transition out of WAITING_FOR_REPLY into CLASSIFYING
      this.machine.transition('CLASSIFYING', { message: 'Understanding response...' });

      const classification = await classifyTranscript(
        transcript, ctx.url, ctx.title, historyStr, this.llmConfig, this.bgCtx, currentAbortController.signal
      );
      logger.info('AgentManager', 'Reply classification', classification);

      if (classification.type === 'cancellation') {
        if (snap.pendingTask === 'CONFIRM_WORKFLOW_CREATION') {
          this.pendingWorkflowDraft = null;
          this.machine.transition('IDLE', { message: 'Workflow setup cancelled.', pendingTask: null, waitReason: null });
          this.onSpeak?.('Workflow creation cancelled.');
          await this.history.addTurn('assistant', 'Workflow creation cancelled by user.', this.llmConfig);
          return;
        }

        if (this.pendingConfirmationAction) {
          this.cancelPendingAction();
        } else {
          this.taskBoundTabId = null;
          this.machine.transition('IDLE', { message: 'Task cancelled.', pendingTask: null, waitReason: null });
          this.onSpeak?.('Task cancelled.');
        }
        await this.history.addTurn('assistant', 'Action cancelled by user.', this.llmConfig);

      } else if (classification.type === 'confirmation') {
        if (classification.ambiguity === 'ambiguous') {
          const q = classification.clarification_question || "I'm not sure if you want to proceed. Please say yes to confirm or no to cancel.";
          this.machine.transition('WAITING_FOR_REPLY', {
            message: 'Waiting for clarification...',
            pendingTask: snap.pendingTask,
            waitReason: snap.waitReason || 'confirmation',
          });
          this.onSpeak?.(q);
          await this.history.addTurn('assistant', q, this.llmConfig);
          return;
        }

        // Check for hesitation/ambiguity even if classified as confirmation
        if (this.pendingConfirmationAction || snap.pendingTask === 'CONFIRM_WORKFLOW_CREATION') {
          const lower = transcript.toLowerCase().trim();
          const isHesitant = /\b(maybe|perhaps|not sure|wait|hold on|confused|doubt|thinking|i guess)\b/i.test(lower);
          if (isHesitant) {
            const prompt = "I detected hesitation. Please say yes to confirm, or say cancel.";
            this.machine.transition('WAITING_FOR_REPLY', {
              message: 'Waiting for clarification...',
              pendingTask: snap.pendingTask,
              waitReason: snap.waitReason || 'confirmation',
            });
            this.onSpeak?.(prompt);
            await this.history.addTurn('assistant', prompt, this.llmConfig);
            return;
          }
        }

        if (snap.pendingTask === 'CONFIRM_WORKFLOW_CREATION' && this.pendingWorkflowDraft) {
          const draft = this.pendingWorkflowDraft;
          this.pendingWorkflowDraft = null;
          const created = await this.workflowManager.createWorkflow({
            name: draft.name,
            description: draft.description,
            trigger: {
              type: draft.triggerType,
              intervalMinutes: draft.intervalMinutes,
              timeOfDay: draft.timeOfDay,
              condition: draft.condition,
            },
            targetUrls: [draft.targetUrl || ctx.url || 'about:blank'],
            requiresApproval: draft.isConsequential,
            status: 'active',
          });

          this.machine.transition('IDLE', { message: `Workflow "${created.name}" active.`, pendingTask: null, waitReason: null });
          const confirmText = `Workflow "${created.name}" is now active and scheduled. I will monitor it and notify you when conditions are met.`;
          this.onSpeak?.(confirmText);
          await this.history.addTurn('assistant', confirmText, this.llmConfig);
          return;
        }

        if (this.pendingConfirmationAction) {
          // Unambiguous spoken confirmation: route directly to confirmPendingAction
          // to preserve exact pending action ID and original parameters
          await this.confirmPendingAction();
        } else if (snap.pendingTask) {
          // User confirmed the pending task — execute it
          const taskToExecute = snap.pendingTask;
          this.machine.transition('PLANNING', { message: 'Executing confirmed task...', pendingTask: null, waitReason: null });
          await this.executeTask(taskToExecute, currentAbortController.signal, ctx);
        } else {
          this.taskBoundTabId = null;
          this.machine.transition('IDLE', { message: 'ANVORA is ready.' });
          this.onSpeak?.('Understood.');
        }

      } else if (classification.type === 'task') {
        // User provided a new task instead of confirming — invalidate pending confirmation and bound tab
        this.pendingConfirmationAction = null;
        this.taskBoundTabId = null;
        this.machine.transition('PLANNING', { message: 'Planning new task...', pendingTask: null, waitReason: null });
        await this.executeTask(classification.summary, currentAbortController.signal, ctx);

      } else {
        // Ambiguous, generic or unexpected utterance
        if (this.pendingConfirmationAction) {
          // Do NOT authorize high-risk execution without clear affirmative approval
          const prompt = "Please confirm if you want me to proceed with the action, or say cancel.";
          this.machine.transition('WAITING_FOR_REPLY', {
            message: 'Waiting for confirmation...',
            pendingTask: snap.pendingTask,
            waitReason: snap.waitReason || 'confirmation',
          });
          this.onSpeak?.(prompt);
          await this.history.addTurn('assistant', prompt, this.llmConfig);
        } else {
          this.taskBoundTabId = null;
          this.machine.transition('IDLE', { message: 'ANVORA is ready.', pendingTask: null, waitReason: null });
          this.onSpeak?.('Understood.');
        }
      }
    } catch (err: any) {
      this.taskBoundTabId = null;
      this.pendingConfirmationAction = null;
      logger.error('AgentManager', 'handleReply failed', err);
      this.machine.transition('RECOVERING', { message: 'Encountered an issue' });
      
      const classified = await classifyProviderError(err);
      this.onSpeak?.(classified.spokenMessage);
      try {
        await this.history.addTurn('assistant', classified.userMessage, this.llmConfig || undefined);
      } catch (_) {}
      this.broadcastProgress(classified.userMessage);
      this.machine.transition('IDLE', { message: 'ANVORA is ready.' });
    }
  }

  private broadcastProgress(text?: string, pendingAction?: ActionConfirmationData) {
    this.onProgressUpdate?.(this.activeTimelineSteps, pendingAction, text);
  }

  public async confirmPendingAction(actionId?: string) {
    if (!this.pendingConfirmationAction) return;
    if (actionId && this.pendingConfirmationAction.id !== actionId) return;

    const { actionDef, taskSummary, signal, ctx } = this.pendingConfirmationAction;
    this.pendingConfirmationAction = null;

    logger.info('AgentManager', 'Action confirmed by user, continuing task', { action: actionDef.action });

    const confirmStep = this.activeTimelineSteps.find(s => s.state === 'waiting_confirmation');
    if (confirmStep) {
      confirmStep.state = 'completed';
      confirmStep.title = `Confirmed: ${confirmStep.title}`;
    }
    this.broadcastProgress('Executing confirmed action...');

    this.machine.transition('PLANNING', { message: 'Executing confirmed action...', pendingTask: null, waitReason: null });
    await this.executeTask(taskSummary, signal, ctx, actionDef);
  }

  public cancelPendingAction(actionId?: string) {
    if (!this.pendingConfirmationAction) return;
    if (actionId && this.pendingConfirmationAction.id !== actionId) return;

    this.pendingConfirmationAction = null;
    this.taskBoundTabId = null;
    logger.info('AgentManager', 'Action cancelled by user');

    const confirmStep = this.activeTimelineSteps.find(s => s.state === 'waiting_confirmation');
    if (confirmStep) {
      confirmStep.state = 'failed';
      confirmStep.title = `Cancelled: ${confirmStep.title}`;
      confirmStep.description = 'Action cancelled by user.';
    }
    this.broadcastProgress('Action cancelled by user.');
    this.machine.transition('IDLE', { message: 'Action cancelled.', pendingTask: null, waitReason: null });
    this.onSpeak?.('Action cancelled.');
  }

  public cancelCurrentTask(reason = 'Task cancelled by user') {
    if (this.taskAbortController) {
      this.taskAbortController.abort();
      this.taskAbortController = null;
    }
    cancelPendingGeminiCalls();
    this.pendingConfirmationAction = null;
    this.taskBoundTabId = null;

    const inFlight = this.activeTimelineSteps.find(s => s.state === 'executing' || s.state === 'navigating' || s.state === 'searching' || s.state === 'reading');
    if (inFlight) {
      inFlight.state = 'failed';
      inFlight.description = reason;
    }

    // Phase 6: Save interrupted task continuity so user can resume later
    if (this.activeTimelineSteps.length > 0) {
      this.memoryManager.saveTaskContinuity({
        id: `task-${Date.now()}`,
        directive: this.activeTimelineSteps[0]?.description || 'Cancelled task',
        tabId: this.taskBoundTabId || undefined,
        url: '',
        title: '',
        status: 'interrupted',
        completedSteps: this.activeTimelineSteps.filter(s => s.state === 'completed').map(s => s.title),
        pendingSteps: [reason],
        timestamp: Date.now()
      }).catch(() => {});
    }

    this.broadcastProgress(reason);
    this.machine.transition('IDLE', { message: reason, pendingTask: null, waitReason: null });
    this.onSpeak?.('Task cancelled.');
  }

  private async executeTask(
    taskSummary: string,
    signal: AbortSignal,
    initialCtx?: AgentContext | null,
    resumedAction?: any
  ) {
    if (!this.llmConfig || !this.llmConfig.geminiApiKey) return;

    // Establish task-bound tab ID from initial context or active tab
    if (!this.taskBoundTabId && initialCtx?.tabId) {
      this.taskBoundTabId = initialCtx.tabId;
    }
    if (!this.taskBoundTabId && this.onGetContext) {
      const activeCtx = await this.onGetContext();
      if (activeCtx?.tabId) {
        this.taskBoundTabId = activeCtx.tabId;
      }
    }

    // Initialize timeline if not already started
    if (this.activeTimelineSteps.length === 0 || !this.activeTimelineSteps.some(s => s.state === 'executing')) {
      this.activeTimelineSteps = [
        {
          id: `step-init-${Date.now()}`,
          title: 'Understanding Directive',
          state: 'understanding',
          description: taskSummary,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      ];
      this.broadcastProgress('Starting autonomous execution...');
    }

    let stepCount = 0;
    let consecutiveFailures = 0;
    const maxSteps = 12;

    while (stepCount < maxSteps) {
      if (signal.aborted) break;
      stepCount++;

      let action: any;
      let currentCtx: AgentContext | null = initialCtx || null;

      if (resumedAction && stepCount === 1) {
        // Verify task-bound tab still exists before executing resumed action
        if (this.taskBoundTabId && this.onGetContext) {
          const checkCtx = await this.onGetContext(this.taskBoundTabId);
          if (!checkCtx) {
            const closedTabStep: BrowserActivityStep = {
              id: `step-tab-closed-${Date.now()}`,
              title: 'Task Tab Unavailable',
              state: 'failed',
              description: 'The tab associated with this task has been closed or is unavailable. Task stopped.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            this.activeTimelineSteps.push(closedTabStep);
            this.broadcastProgress('Task-bound tab closed.');
            this.machine.transition('RECOVERING', { message: 'Task-bound tab closed.', stepCount });
            this.onSpeak?.('The tab associated with this task has been closed or is unavailable. Task has been stopped.');
            await this.history.addTurn('assistant', 'Task stopped: The target tab was closed or is unavailable.', this.llmConfig);
            this.taskBoundTabId = null;
            break;
          }
        }
        // Use explicitly confirmed action directly with exact original parameters
        action = resumedAction;
        resumedAction = null;
      } else {
        this.machine.transition('PLANNING', {
          message: `Planning step ${stepCount}...`,
          stepCount,
          consecutiveFailures,
        });

        const ctx = (stepCount === 1 && initialCtx) ? initialCtx : await this.onGetContext?.(this.taskBoundTabId);
        currentCtx = ctx || null;
        if (!ctx || signal.aborted) {
          if (!ctx && this.taskBoundTabId) {
            const closedTabStep: BrowserActivityStep = {
              id: `step-tab-closed-${Date.now()}`,
              title: 'Task Tab Unavailable',
              state: 'failed',
              description: 'The tab associated with this task has been closed or is unavailable. Task stopped.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            this.activeTimelineSteps.push(closedTabStep);
            this.broadcastProgress('Task-bound tab closed.');
            this.machine.transition('RECOVERING', { message: 'Task-bound tab closed.', stepCount });
            this.onSpeak?.('The tab associated with this task has been closed or is unavailable. Task has been stopped.');
            await this.history.addTurn('assistant', 'Task stopped: The target tab was closed or is unavailable.', this.llmConfig);
          }
          this.taskBoundTabId = null;
          break;
        }

        if (!this.taskBoundTabId && ctx.tabId) {
          this.taskBoundTabId = ctx.tabId;
        }

        const recentHistoryStr = JSON.stringify(this.history.getHistory().slice(-10));
        
        // Phase 6: Enrich background context with memories relevant to this step & URL
        const stepMemories = this.memoryManager.getRelevantMemories(taskSummary, ctx.url);
        const enrichedBgCtx: BackgroundContext = {
          ...(this.bgCtx || { name: '', role: '', preferences: [], shortcuts: {}, frequentSites: [] }),
          memoriesSummary: this.memoryManager.formatMemoriesForPrompt(stepMemories),
        };

        // Step 1: text-only plan
        action = await determineNextAction(
          taskSummary, ctx.url, ctx.title, ctx.semanticText, ctx.markersText,
          recentHistoryStr, this.llmConfig, enrichedBgCtx, signal
        );

        // Step 2: if planner says it needs a screenshot, re-plan with vision model
        if (action.needs_screenshot && this.onGetScreenshot && this.llmConfig.visionEnabled) {
          this.machine.transition('PLANNING', { message: 'Inspecting screen visually...', stepCount });
          logger.info('AgentManager', `Step ${stepCount}: vision re-plan requested`);
          const screenshot = await this.onGetScreenshot();
          if (screenshot) {
            action = await determineNextAction(
              taskSummary, ctx.url, ctx.title, ctx.semanticText, ctx.markersText,
              recentHistoryStr, this.llmConfig, enrichedBgCtx, signal,
              false, screenshot
            );
          }
        }
      }

      if (signal.aborted) break;

      // Handle terminal actions
      if (action.action === 'done') {
        const finalStep: BrowserActivityStep = {
          id: `step-done-${Date.now()}`,
          title: 'Task Successfully Completed',
          state: 'completed',
          description: action.thought || action.reason || 'All actions verified and complete.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        this.activeTimelineSteps.push(finalStep);
        this.broadcastProgress('Task completed.');
        this.machine.transition('COMPLETE', { message: 'Task completed.', stepCount });
        this.onSpeak?.(action.thought || action.reason || `Task completed.`);
        await this.history.addTurn('assistant', `Task completed: ${action.thought || action.reason}`, this.llmConfig);
        
        // Phase 6: Save task continuity and learn frequent site
        this.memoryManager.saveTaskContinuity({
          id: `task-${Date.now()}`,
          directive: taskSummary,
          tabId: this.taskBoundTabId || undefined,
          url: currentCtx?.url || '',
          title: currentCtx?.title || '',
          status: 'completed',
          completedSteps: this.activeTimelineSteps.map(s => s.title),
          pendingSteps: [],
          lastResultSummary: action.thought || action.reason || 'All actions verified and complete.',
          timestamp: Date.now()
        }).catch(() => {});

        if (currentCtx?.url && currentCtx?.domain && !currentCtx.url.startsWith('chrome://') && !currentCtx.url.includes('login') && !currentCtx.url.includes('auth')) {
          const cleanTitle = (currentCtx.title || '').replace(/[\r\n\t]/g, ' ').slice(0, 40).trim();
          const memoryText = cleanTitle 
            ? `Frequently visited site: ${currentCtx.domain} (${cleanTitle})`
            : `Frequently visited site: ${currentCtx.domain}`;
          this.memoryManager.addMemory(memoryText, 'frequent_site', 'learned_task').catch(() => {});
        }

        this.taskBoundTabId = null;
        break;
      }

      if (action.action === 'fail') {
        const failStep: BrowserActivityStep = {
          id: `step-fail-${Date.now()}`,
          title: 'Action Unachievable',
          state: 'failed',
          description: action.reason || 'Could not complete requested action.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        this.activeTimelineSteps.push(failStep);
        this.broadcastProgress('Task failed.');
        this.machine.transition('RECOVERING', { message: 'Task could not be completed.', stepCount });
        this.onSpeak?.(`I couldn't complete that action: ${action.reason}`);
        await this.history.addTurn('assistant', `Task failed: ${action.reason}`, this.llmConfig);

        // Phase 6: Save interrupted task continuity for potential resumption
        this.memoryManager.saveTaskContinuity({
          id: `task-${Date.now()}`,
          directive: taskSummary,
          tabId: this.taskBoundTabId || undefined,
          url: currentCtx?.url || '',
          title: currentCtx?.title || '',
          status: 'interrupted',
          completedSteps: this.activeTimelineSteps.filter(s => s.state === 'completed').map(s => s.title),
          pendingSteps: [action.reason || 'Failed action'],
          timestamp: Date.now()
        }).catch(() => {});

        this.taskBoundTabId = null;
        break;
      }

      if (action.action === 'answer') {
        const answerStep: BrowserActivityStep = {
          id: `step-answer-${Date.now()}`,
          title: 'Grounded Answer Formulated',
          state: 'completed',
          description: action.thought || 'Answer synthesized from active page content.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        this.activeTimelineSteps.push(answerStep);
        this.broadcastProgress(action.text || action.thought || 'Answer ready.');
        this.machine.transition('COMPLETE', { message: 'Task completed.', stepCount });
        this.onSpeak?.(action.text || action.thought || action.reason);
        await this.history.addTurn('assistant', `Answered user: ${action.text}`, this.llmConfig);

        // Phase 6: Save task continuity
        this.memoryManager.saveTaskContinuity({
          id: `task-${Date.now()}`,
          directive: taskSummary,
          tabId: this.taskBoundTabId || undefined,
          url: currentCtx?.url || '',
          title: currentCtx?.title || '',
          status: 'completed',
          completedSteps: this.activeTimelineSteps.map(s => s.title),
          pendingSteps: [],
          lastResultSummary: action.text || action.thought || 'Answer ready.',
          timestamp: Date.now()
        }).catch(() => {});

        this.taskBoundTabId = null;
        break;
      }

      if (action.action === 'spawn_worker' && action.text) {
        this.machine.transition('WAITING_FOR_WORKER', {
          message: 'Delegating to background worker...',
          stepCount,
          consecutiveFailures,
        });
        this.onSpeak?.(action.thought || "Delegating research to a background worker. One moment...");
        
        const worker = new WorkerAgent(`worker-${stepCount}`, this.llmConfig, this.bgCtx);
        worker.onExecuteAction = this.onExecuteAction;
        worker.onGetContext = this.onGetContext;
        worker.onGetScreenshot = this.onGetScreenshot;
        worker.onStateChange = (snap) => {
          logger.info(`AgentManager`, `Worker state: ${snap.state} - ${snap.message}`);
        };
        
        await worker.init();
        const workerResult = await worker.executeTask(action.text, signal);
        
        await this.history.addTurn('assistant', `[INTERNAL SYSTEM LOG] Worker reported:\n${workerResult}`, this.llmConfig);
        
        stepCount--;
        continue;
      }

      // Check high risk actions requiring explicit user confirmation
      const isHighRisk = action.risk_level === 'high' ||
        (action.action === 'click' && action.reason?.toLowerCase().includes('delete')) ||
        (action.action === 'click' && action.reason?.toLowerCase().includes('pay')) ||
        (action.action === 'click' && action.reason?.toLowerCase().includes('buy')) ||
        (action.action === 'type' && (action.reason?.toLowerCase().includes('password') || action.reason?.toLowerCase().includes('credit')));

      if (isHighRisk && !resumedAction) {
        const confirmationId = `confirm-${Date.now()}`;
        const confData: ActionConfirmationData = {
          id: confirmationId,
          title: action.step_title || `Confirm ${action.action}`,
          actionType: 'sensitive_action',
          description: `ANVORA requires your confirmation to execute ${action.action}: ${action.thought || action.reason}`,
          payload: {
            Action: action.action,
            Target: String(action.target_id || action.url || 'Active Webpage'),
            Details: action.text || action.url || action.reason || 'Consequential operation',
          },
          status: 'pending',
          impactLevel: 'high',
        };

        const currentCtx = await this.onGetContext?.(this.taskBoundTabId);
        this.pendingConfirmationAction = {
          id: confirmationId,
          actionDef: action,
          taskSummary,
          signal,
          ctx: currentCtx,
        };

        this.activeTimelineSteps.push({
          id: `step-conf-${Date.now()}`,
          title: `Approval Required: ${action.step_title || action.action}`,
          state: 'waiting_confirmation',
          description: `Awaiting your approval before proceeding with this high-risk action.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });

        this.machine.transition('WAITING_FOR_REPLY', {
          message: 'Waiting for confirmation...',
          pendingTask: taskSummary,
          waitReason: 'confirmation',
        });

        this.broadcastProgress('Awaiting user confirmation...', confData);
        this.onSpeak?.(`Just to confirm, I am about to ${action.thought || action.reason}. Should I proceed?`);
        return; // Pause execution until user confirms!
      }

      // Map activity state for UI display
      let activityState: ActivityState = 'executing';
      if (action.action === 'navigate') activityState = 'navigating';
      else if (action.action === 'type' && (action.reason?.toLowerCase().includes('search') || action.text?.toLowerCase().includes('search'))) activityState = 'searching';
      else if (action.action === 'extract') activityState = 'reading';

      const currentStep: BrowserActivityStep = {
        id: `step-${stepCount}-${Date.now()}`,
        title: action.step_title || (
          action.action === 'navigate' ? 'Navigating to Webpage' :
          action.action === 'type' ? 'Entering Query' :
          action.action === 'click' ? 'Clicking Element' :
          action.action === 'extract' ? 'Reading Content' : 'Executing Action'
        ),
        state: activityState,
        description: action.thought || action.reason,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      this.activeTimelineSteps.push(currentStep);
      this.broadcastProgress(`Step ${stepCount}: ${currentStep.title}`);

      this.onSpeak?.(action.thought || action.reason);
      this.machine.transition('EXECUTING', {
        message: `Executing: ${action.action}`,
        stepCount,
        consecutiveFailures,
      });

      // Target the task-bound tab for every action (navigation, click, type, extract, etc.)
      if (this.taskBoundTabId) {
        action.targetTabId = this.taskBoundTabId;
      }

      let rawResult: any = false;
      try {
        rawResult = await this.onExecuteAction?.(action);
      } catch (err) {
        logger.error('AgentManager', 'onExecuteAction threw an error', err);
      }
      
      const isSuccess = typeof rawResult === 'object' && rawResult !== null
        ? (rawResult.success !== false && rawResult.status !== 'FAILED')
        : Boolean(rawResult);

      if (!isSuccess) {
        currentStep.state = 'failed';
        consecutiveFailures++;
        
        if (consecutiveFailures >= 3) {
          this.machine.transition('RECOVERING', {
            message: 'Task stopped after multiple attempts',
            stepCount,
            consecutiveFailures,
          });
          this.onSpeak?.("I couldn't interact with this webpage after multiple attempts. You might need to refresh the tab.");
          await this.history.addTurn('assistant', '[INTERNAL SYSTEM LOG] Task aborted due to repeated execution failures. Instruct the user to refresh the tab.', this.llmConfig);
          this.broadcastProgress('Task halted due to execution failure.');
          this.taskBoundTabId = null;
          break;
        }

        // Bounded error recovery: refresh page context and re-try
        this.activeTimelineSteps.push({
          id: `step-rec-${Date.now()}`,
          title: 'Re-synchronizing Page Context',
          state: 'analyzing',
          description: `Action unconfirmed (${rawResult?.message || 'Element interaction failed'}). Refreshing interactive elements to recalculate path...`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        this.broadcastProgress('Recovering and recalculating next step...');

        this.machine.transition('REPLANNING', {
          message: 'Action unconfirmed, recalculating...',
          stepCount,
          consecutiveFailures,
        });
        await this.history.addTurn('assistant', `[INTERNAL SYSTEM LOG] Failed to execute: ${action.action}. Error: ${rawResult?.message || 'Element interaction failed'}. Note: Context has been refreshed.`, this.llmConfig);
      } else {
        currentStep.state = 'completed';
        consecutiveFailures = 0;
        this.broadcastProgress(`Completed: ${currentStep.title}`);

        // If the task explicitly opened a new tab, adopt that tab as the new task-bound tab
        if (action.action === 'new_tab' && rawResult?.data?.tabId) {
          this.taskBoundTabId = rawResult.data.tabId;
        }

        const resultDataStr = rawResult?.data ? `\nExtracted Data:\n${typeof rawResult.data === 'string' ? rawResult.data.substring(0, 3000) : JSON.stringify(rawResult.data)}` : '';
        await this.history.addTurn('assistant', `[INTERNAL SYSTEM LOG] Successfully executed: ${action.action} on target ${action.target_id || ''} with text/url ${action.text || action.url || ''}. Reason: ${action.reason}${resultDataStr}`, this.llmConfig);
      }
    }
    
    if (stepCount >= maxSteps) {
      this.onSpeak?.('I reached the step limit before completing the task.');
      this.broadcastProgress('Step limit reached.');
      this.taskBoundTabId = null;
    }

    if (!this.pendingConfirmationAction) {
      this.taskBoundTabId = null;
    }

    this.machine.transition('IDLE', { message: 'ANVORA is ready.', stepCount: 0, consecutiveFailures: 0 });
  }

  /**
   * Fast-Path Execution Engine:
   * Directly dispatches deterministic commands to Chrome Native APIs
   * without calling the Gemini API, while providing immediate voice and UI feedback.
   */
  private async executeFastPath(
    result: FastPathResult,
    perfTracker: PerformanceTracker
  ): Promise<void> {
    const action = result.action;
    if (!action) return;

    // Immediately speak acknowledgement concurrently
    this.onSpeak?.(result.acknowledgement);

    // Initial timeline progress step
    const stepId = `step-fast-${Date.now()}`;
    const initialStep: BrowserActivityStep = {
      id: stepId,
      title: action.description,
      state: 'executing',
      description: action.description,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    this.activeTimelineSteps = [initialStep];
    this.broadcastProgress(action.description);
    this.machine.transition('EXECUTING', { message: action.description, stepCount: 1 });

    try {
      let browserActionPayload: any = null;

      switch (action.type) {
        case 'navigate':
          browserActionPayload = {
            action: 'navigate',
            url: action.url,
            fastPath: true,
          };
          break;

        case 'tab_new':
          browserActionPayload = {
            action: 'new_tab',
            url: action.url || 'https://www.google.com/',
          };
          break;

        case 'search': {
          const searchUrl = buildSearchUrl(action.engine, action.query);
          browserActionPayload = {
            action: 'navigate',
            url: searchUrl,
            fastPath: true,
          };
          break;
        }

        case 'youtube_play': {
          const ytSearchUrl = buildSearchUrl('youtube', action.query);
          browserActionPayload = {
            action: 'navigate',
            url: ytSearchUrl,
            fastPath: true,
          };
          break;
        }

        case 'youtube_discover': {
          browserActionPayload = {
            action: 'navigate',
            url: 'https://www.youtube.com/',
            fastPath: true,
          };
          break;
        }

        case 'tab_close':
          browserActionPayload = { action: 'close_tab' };
          break;

        case 'tab_reload':
          browserActionPayload = { action: 'reload' };
          break;

        case 'tab_next':
          browserActionPayload = { action: 'switch_tab_relative', direction: 'next' };
          break;

        case 'tab_prev':
          browserActionPayload = { action: 'switch_tab_relative', direction: 'prev' };
          break;

        case 'go_back':
          browserActionPayload = { action: 'go_back' };
          break;

        case 'go_forward':
          browserActionPayload = { action: 'go_forward' };
          break;

        case 'scroll_down':
          browserActionPayload = { action: 'scroll_down' };
          break;

        case 'scroll_up':
          browserActionPayload = { action: 'scroll_up' };
          break;
      }

      if (browserActionPayload && this.onExecuteAction) {
        await this.onExecuteAction(browserActionPayload);
        perfTracker.markTabOperationComplete();
      }

      initialStep.state = 'completed';
      initialStep.title = `Completed: ${action.description}`;
      this.broadcastProgress(`Completed: ${action.description}`);

      await this.history.addTurn(
        'assistant',
        `[FAST PATH] ${result.acknowledgement}`,
        this.llmConfig || undefined
      );

      this.machine.transition('COMPLETE', { message: 'Action completed.', stepCount: 1 });
      perfTracker.completeTrace();
    } catch (err: any) {
      logger.error('AgentManager', 'Fast path execution error', err);
      initialStep.state = 'failed';
      initialStep.description = err?.message || 'Fast path execution failed.';
      this.broadcastProgress('Operation encountered an issue.');
      this.machine.transition('RECOVERING', { message: 'Fast path action error.' });
      this.onSpeak?.(`Couldn't complete that action: ${err?.message || 'unknown error'}`);
    }

    this.machine.transition('IDLE', { message: 'ANVORA is ready.', stepCount: 0 });
  }
}
