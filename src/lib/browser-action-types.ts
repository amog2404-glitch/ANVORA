// src/lib/browser-action-types.ts

export type BrowserActionType =
  | 'click'
  | 'type'
  | 'press_enter'
  | 'press_key'
  | 'scroll_down'
  | 'scroll_up'
  | 'extract'
  | 'navigate'
  | 'go_back'
  | 'wait'
  | 'done'
  | 'fail'
  | 'list_tabs'
  | 'switch_tab'
  | 'close_tab'
  | 'new_tab'
  | 'answer'
  | 'media'
  | 'spawn_worker';

export type VerificationStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'PARTIAL'
  | 'TIMED_OUT'
  | 'REQUIRES_USER_ACTION';

export type ActionRiskLevel = 'low' | 'moderate' | 'high';

export interface ActionVerificationDetails {
  elementFound?: boolean;
  valueVerified?: boolean;
  scrollDelta?: number;
  urlChanged?: boolean;
  currentUrl?: string;
  extractedContent?: string;
  timedOut?: boolean;
  domChanged?: boolean;
  tabChanged?: boolean;
}

export interface ActionResult {
  success: boolean;
  status: VerificationStatus;
  message: string;
  data?: any;
  verification?: ActionVerificationDetails;
}

export interface TaskPlanStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  action: BrowserActionType;
  targetId?: number;
  text?: string;
  url?: string;
  tabId?: number;
  submit?: boolean;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'waiting_confirmation';
  result?: string;
  error?: string;
  risk: ActionRiskLevel;
  startTime?: number;
  endTime?: number;
}

