// src/lib/workflow-manager.ts
import type {
  Workflow,
  WorkflowExecution,
  WorkflowExecutionStep,
  WorkflowStatus,
  WorkflowTrigger,
} from '../sidepanel/types';
import { WebpageMonitor, type ChangeDetectionResult } from './webpage-monitor';
import { logger } from './logger';

const STORAGE_KEY = 'anvora_workflows';
const MAX_HISTORY_PER_WORKFLOW = 20;

export class WorkflowManager {
  private static instance: WorkflowManager | null = null;
  private workflows: Map<string, Workflow> = new Map();
  private runningWorkflows: Set<string> = new Set();
  private isLoaded = false;
  private subscribers: Set<(workflows: Workflow[]) => void> = new Set();

  public onNotificationRequested?: (title: string, message: string, workflowId: string) => void;
  public onConsequentialApprovalNeeded?: (workflow: Workflow, step: any) => void;

  private constructor() {}

  public static getInstance(): WorkflowManager {
    if (!WorkflowManager.instance) {
      WorkflowManager.instance = new WorkflowManager();
    }
    return WorkflowManager.instance;
  }

  public subscribe(cb: (workflows: Workflow[]) => void): () => void {
    this.subscribers.add(cb);
    cb(this.listWorkflows());
    return () => this.subscribers.delete(cb);
  }

  private notifySubscribers() {
    const list = this.listWorkflows();
    for (const sub of this.subscribers) {
      try {
        sub(list);
      } catch (err) {
        logger.error('WorkflowManager', 'Subscriber threw an error', err);
      }
    }
  }

  /**
   * Load all saved workflows from chrome.storage.local
   */
  public async load(): Promise<Workflow[]> {
    if (this.isLoaded && this.workflows.size > 0) {
      return this.listWorkflows();
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const stored = (result[STORAGE_KEY] as Workflow[]) || [];
        this.workflows.clear();
        for (const wf of stored) {
          this.workflows.set(wf.id, wf);
        }
      }
      this.isLoaded = true;
      this.notifySubscribers();
      return this.listWorkflows();
    } catch (err) {
      logger.error('WorkflowManager', 'Failed to load workflows from storage', err);
      this.isLoaded = true;
      return [];
    }
  }

  /**
   * Persist current workflows to chrome.storage.local
   */
  public async save(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = Array.from(this.workflows.values());
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
      }
      this.notifySubscribers();
    } catch (err) {
      logger.error('WorkflowManager', 'Failed to save workflows to storage', err);
    }
  }

  public listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  /**
   * Schedule Chrome Alarm for recurring or future execution
   */
  public async scheduleAlarm(workflow: Workflow): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;

    const alarmName = `anvora_wf_${workflow.id}`;
    await chrome.alarms.clear(alarmName);

    if (workflow.status !== 'active') return;

    const { trigger } = workflow;
    const now = Date.now();

    if (trigger.type === 'interval') {
      const minutes = Math.max(1, trigger.intervalMinutes || 60);
      chrome.alarms.create(alarmName, {
        delayInMinutes: minutes,
        periodInMinutes: minutes,
      });
      workflow.nextScheduledAt = now + minutes * 60 * 1000;
    } else if (trigger.type === 'daily') {
      const delayMinutes = this.calculateMinutesUntilTime(trigger.timeOfDay || '09:00');
      chrome.alarms.create(alarmName, {
        delayInMinutes: delayMinutes,
        periodInMinutes: 1440, // 24 hours
      });
      workflow.nextScheduledAt = now + delayMinutes * 60 * 1000;
    } else if (trigger.type === 'weekly') {
      const delayMinutes = this.calculateMinutesUntilWeekly(trigger.dayOfWeek ?? 1, trigger.timeOfDay || '09:00');
      chrome.alarms.create(alarmName, {
        delayInMinutes: delayMinutes,
        periodInMinutes: 10080, // 7 days
      });
      workflow.nextScheduledAt = now + delayMinutes * 60 * 1000;
    } else if (trigger.type === 'monthly') {
      const delayMinutes = this.calculateMinutesUntilMonthly(trigger.dayOfMonth ?? 1, trigger.timeOfDay || '09:00');
      chrome.alarms.create(alarmName, {
        delayInMinutes: delayMinutes,
        periodInMinutes: 43200, // 30 days
      });
      workflow.nextScheduledAt = now + delayMinutes * 60 * 1000;
    } else if (trigger.type === 'one_time') {
      const minutes = Math.max(1, trigger.intervalMinutes || 5);
      chrome.alarms.create(alarmName, {
        delayInMinutes: minutes,
      });
      workflow.nextScheduledAt = now + minutes * 60 * 1000;
    } else if (trigger.type === 'price_change' || trigger.type === 'content_change' || trigger.type === 'announcement') {
      // Condition-based polling: default to every 15 minutes unless specified
      const minutes = Math.max(1, trigger.intervalMinutes || 15);
      chrome.alarms.create(alarmName, {
        delayInMinutes: minutes,
        periodInMinutes: minutes,
      });
      workflow.nextScheduledAt = now + minutes * 60 * 1000;
    }
  }

  /**
   * Unregister Chrome Alarm
   */
  public async unregisterAlarm(workflowId: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;
    const alarmName = `anvora_wf_${workflowId}`;
    await chrome.alarms.clear(alarmName);
  }

  /**
   * Helper to calculate minutes from now until a specific "HH:mm" today or tomorrow
   */
  private calculateMinutesUntilTime(timeOfDay: string): number {
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

  /**
   * Helper to calculate minutes from now until day of week (0-6) and time
   */
  private calculateMinutesUntilWeekly(dayOfWeek: number, timeOfDay: string): number {
    const [h, m] = timeOfDay.split(':').map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(h || 9, m || 0, 0, 0);

    const currentDay = target.getDay();
    let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
    if (daysToAdd === 0 && target.getTime() <= now.getTime()) {
      daysToAdd = 7;
    }
    target.setDate(target.getDate() + daysToAdd);
    const diffMs = target.getTime() - now.getTime();
    return Math.max(1, Math.round(diffMs / 60000));
  }

  /**
   * Helper to calculate minutes from now until day of month (1-31) and time
   */
  private calculateMinutesUntilMonthly(dayOfMonth: number, timeOfDay: string): number {
    const [h, m] = timeOfDay.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), Math.min(28, dayOfMonth), h || 9, m || 0, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setMonth(target.getMonth() + 1);
    }
    const diffMs = target.getTime() - now.getTime();
    return Math.max(1, Math.round(diffMs / 60000));
  }

  /**
   * Create a new Workflow
   */
  public async createWorkflow(params: {
    name: string;
    description: string;
    trigger: WorkflowTrigger;
    targetUrls: string[];
    steps?: any[];
    requiresApproval?: boolean;
    notificationEnabled?: boolean;
    status?: WorkflowStatus;
  }): Promise<Workflow> {
    await this.load();

    // Guard against duplicate active workflows for identical target and name
    const existing = Array.from(this.workflows.values()).find(
      w => (w.status === 'active' || w.status === 'running') &&
           w.name.toLowerCase() === (params.name || '').trim().toLowerCase() &&
           w.targetUrls[0] === (params.targetUrls[0] || '').trim() &&
           w.trigger.type === params.trigger.type
    );
    if (existing) {
      logger.info('WorkflowManager', `Updating existing active workflow ${existing.id} instead of duplicating.`);
      const updated = await this.updateWorkflow(existing.id, {
        description: params.description.trim() || existing.description,
        trigger: params.trigger,
        requiresApproval: params.requiresApproval ?? existing.requiresApproval,
        notificationEnabled: params.notificationEnabled ?? existing.notificationEnabled,
      });
      return updated || existing;
    }

    const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const newWorkflow: Workflow = {
      id,
      name: params.name.trim() || 'Untitled Workflow',
      description: params.description.trim() || 'Custom browser automation workflow',
      status: params.status || 'active',
      trigger: params.trigger,
      targetUrls: params.targetUrls.filter(u => Boolean(u.trim())),
      steps: params.steps || [
        {
          id: `step-1`,
          title: 'Inspect Target Webpage',
          action: 'extract',
          url: params.targetUrls[0] || '',
        },
      ],
      requiresApproval: params.requiresApproval ?? false,
      notificationEnabled: params.notificationEnabled ?? true,
      createdAt: now,
      updatedAt: now,
      executionHistory: [],
      consecutiveFailures: 0,
      retryCount: 0,
      maxRetries: 3,
    };

    this.workflows.set(id, newWorkflow);
    await this.scheduleAlarm(newWorkflow);
    await this.save();

    logger.info('WorkflowManager', `Created workflow ${id} (${newWorkflow.name})`);
    return newWorkflow;
  }

  /**
   * Update an existing Workflow
   */
  public async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | null> {
    await this.load();
    const existing = this.workflows.get(id);
    if (!existing) return null;

    const updated: Workflow = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.workflows.set(id, updated);
    await this.scheduleAlarm(updated);
    await this.save();

    logger.info('WorkflowManager', `Updated workflow ${id}`);
    return updated;
  }

  /**
   * Pause a Workflow
   */
  public async pauseWorkflow(id: string): Promise<Workflow | null> {
    await this.unregisterAlarm(id);
    return this.updateWorkflow(id, { status: 'paused', nextScheduledAt: undefined });
  }

  /**
   * Resume a Workflow
   */
  public async resumeWorkflow(id: string): Promise<Workflow | null> {
    const updated = await this.updateWorkflow(id, { status: 'active', consecutiveFailures: 0 });
    if (updated) {
      await this.scheduleAlarm(updated);
    }
    return updated;
  }

  /**
   * Cancel a Workflow
   */
  public async cancelWorkflow(id: string): Promise<Workflow | null> {
    await this.unregisterAlarm(id);
    return this.updateWorkflow(id, { status: 'cancelled', nextScheduledAt: undefined });
  }

  /**
   * Delete a Workflow
   */
  public async deleteWorkflow(id: string): Promise<boolean> {
    await this.load();
    await this.unregisterAlarm(id);
    const deleted = this.workflows.delete(id);
    if (deleted) {
      await this.save();
      logger.info('WorkflowManager', `Deleted workflow ${id}`);
    }
    return deleted;
  }

  /**
   * Extract page content for a target URL
   */
  public async fetchPageContent(targetUrl: string): Promise<{ text: string; title: string }> {
    // 1. If tab is already open, extract from tab
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const tabs = await chrome.tabs.query({ url: targetUrl });
        if (tabs.length > 0 && tabs[0].id) {
          const tabId = tabs[0].id;
          const res = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({
              text: document.body?.innerText || '',
              title: document.title || '',
            }),
          });
          if (res?.[0]?.result?.text) {
            return res[0].result;
          }
        }
      } catch (_) {}
    }

    // 2. Otherwise perform background fetch if it's a standard web URL
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ANVORA-Agent/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      // Simple HTML to text converter for background execution
      const text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : targetUrl;

      return { text, title };
    } catch (err: any) {
      logger.warn('WorkflowManager', `Direct fetch failed for ${targetUrl}: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Execute a Workflow immediately
   */
  public async executeWorkflow(
    workflowId: string,
    triggerSource: 'alarm' | 'manual' | 'voice' | 'page_change' = 'manual'
  ): Promise<WorkflowExecution> {
    await this.load();
    const workflow = this.workflows.get(workflowId);

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Refuse execution of cancelled workflows
    if (workflow.status === 'cancelled') {
      logger.warn('WorkflowManager', `Workflow ${workflowId} is cancelled. Refusing execution.`);
      return {
        id: `cancelled-${Date.now()}`,
        workflowId,
        startTime: Date.now(),
        endTime: Date.now(),
        status: 'cancelled',
        triggerSource,
        steps: [],
        error: 'Execution refused: workflow is cancelled.',
      };
    }

    // Concurrency guard: avoid overlapping runs
    if (this.runningWorkflows.has(workflowId)) {
      logger.warn('WorkflowManager', `Workflow ${workflowId} is already running, skipping execution.`);
      return workflow.executionHistory[0] || {
        id: `skip-${Date.now()}`,
        workflowId,
        startTime: Date.now(),
        status: 'cancelled',
        triggerSource,
        steps: [],
        error: 'Execution skipped: workflow already running.',
      };
    }

    this.runningWorkflows.add(workflowId);
    workflow.status = 'running';
    this.notifySubscribers();

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      startTime: Date.now(),
      status: 'running',
      triggerSource,
      steps: [],
    };

    // Keep execution history bounded
    workflow.executionHistory.unshift(execution);
    if (workflow.executionHistory.length > MAX_HISTORY_PER_WORKFLOW) {
      workflow.executionHistory.pop();
    }

    try {
      // Step 1: Check consequential safety gates
      const hasConsequentialStep = workflow.steps.some(s => s.isConsequential);
      if (hasConsequentialStep && !workflow.requiresApproval) {
        // High-risk safety gate: require interactive user confirmation
        execution.status = 'waiting_approval';
        execution.endTime = Date.now();
        workflow.status = 'waiting_approval';

        const stepReq: WorkflowExecutionStep = {
          stepId: 'approval-gate',
          title: 'Approval Required',
          status: 'waiting_approval',
          result: 'Consequential action detected in workflow steps. Requires explicit confirmation.',
        };
        execution.steps.push(stepReq);

        this.onConsequentialApprovalNeeded?.(workflow, workflow.steps.find(s => s.isConsequential));
        await this.save();
        return execution;
      }

      // Step 2: Monitoring & Condition Evaluation
      const targetUrl = workflow.targetUrls[0];
      if (targetUrl) {
        const stepMonitoring: WorkflowExecutionStep = {
          stepId: 'step-monitor',
          title: `Inspect ${targetUrl}`,
          status: 'running',
          executedAt: Date.now(),
        };
        execution.steps.push(stepMonitoring);

        let content = { text: '', title: '' };
        try {
          content = await this.fetchPageContent(targetUrl);
        } catch (fetchErr: any) {
          stepMonitoring.status = 'failed';
          stepMonitoring.error = `Failed to access webpage: ${fetchErr?.message || 'Network error'}`;
          throw fetchErr;
        }

        const freshSnapshot = WebpageMonitor.createSnapshot(
          workflow.id,
          targetUrl,
          content.text,
          content.title
        );

        const evaluation: ChangeDetectionResult = WebpageMonitor.evaluateChange(
          freshSnapshot,
          workflow.lastSnapshot,
          workflow.trigger.condition,
          content.title,
          content.text
        );

        if (evaluation.isAccessBlocked) {
          stepMonitoring.status = 'failed';
          stepMonitoring.error = evaluation.blockReason || 'Access restricted';
          execution.status = 'failed';
          execution.error = evaluation.blockReason;
          workflow.consecutiveFailures++;
        } else {
          stepMonitoring.status = 'completed';
          stepMonitoring.result = evaluation.summary;
          workflow.lastSnapshot = freshSnapshot;
          workflow.consecutiveFailures = 0;

          if (evaluation.conditionMet || evaluation.hasChanged) {
            execution.detectedChange = {
              summary: evaluation.summary,
              previousValue: evaluation.previousValue,
              newValue: evaluation.newValue,
              changeType: evaluation.changeType || 'content',
            };

            // Trigger Chrome Notification if enabled
            if (workflow.notificationEnabled) {
              const notifTitle = `ANVORA: ${workflow.name}`;
              const notifMsg = evaluation.summary;
              this.sendChromeNotification(workflow.id, notifTitle, notifMsg);
              this.onNotificationRequested?.(notifTitle, notifMsg, workflow.id);
            }
          }
        }
      }

      // Mark successful execution
      execution.status = 'success';
      execution.endTime = Date.now();
      workflow.status = 'active';
      workflow.lastExecutedAt = Date.now();

    } catch (execErr: any) {
      logger.error('WorkflowManager', `Execution error in workflow ${workflowId}`, execErr);
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = execErr?.message || 'Workflow execution failed';
      workflow.consecutiveFailures++;

      if (workflow.consecutiveFailures >= workflow.maxRetries) {
        workflow.status = 'failed';
        this.sendChromeNotification(
          workflow.id,
          `ANVORA Alert: ${workflow.name} Paused`,
          `Workflow halted after ${workflow.consecutiveFailures} consecutive errors: ${execution.error}`
        );
      } else {
        workflow.status = 'active';
      }
    } finally {
      this.runningWorkflows.delete(workflowId);
      await this.scheduleAlarm(workflow);
      await this.save();
    }

    return execution;
  }

  /**
   * Native Chrome notification dispatcher
   */
  private sendChromeNotification(workflowId: string, title: string, message: string) {
    if (typeof chrome === 'undefined' || !chrome.notifications) return;

    try {
      chrome.notifications.create(`anvora_notif_${workflowId}_${Date.now()}`, {
        type: 'basic',
        iconUrl: 'public/icon.png',
        title,
        message,
        priority: 1,
      });
    } catch (err) {
      logger.warn('WorkflowManager', 'Failed to trigger Chrome notification', err);
    }
  }
}

