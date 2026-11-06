export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type LanguageCode = 'en' | 'te' | 'hi';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeName: string;
  flagSymbol: string;
}

export type ActivityState =
  | 'understanding'
  | 'analyzing'
  | 'reading'
  | 'searching'
  | 'navigating'
  | 'executing'
  | 'waiting_confirmation'
  | 'completed'
  | 'failed';

export interface BrowserActivityStep {
  id: string;
  title: string;
  state: ActivityState;
  description: string;
  timestamp: string;
  detail?: string;
  durationMs?: number;
}

export interface ActionConfirmationData {
  id: string;
  title: string;
  actionType: 'submit_form' | 'export_data' | 'auto_fill' | 'navigate_checkout' | 'delete_data' | 'payment' | 'send_message' | 'sensitive_action';
  targetSelector?: string;
  description: string;
  payload: Record<string, string>;
  status: 'pending' | 'confirmed' | 'cancelled';
  impactLevel: 'low' | 'medium' | 'high';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  language?: LanguageCode;
  activityTimeline?: BrowserActivityStep[];
  pendingAction?: ActionConfirmationData;
  audioDuration?: string;
  isStreaming?: boolean;
}

export interface WebsiteContextData {
  id: string;
  domain: string;
  name: string;
  title: string;
  url: string;
  connectionState: 'connected' | 'syncing' | 'idle' | 'unsupported' | 'error';
  faviconChar: string;
  faviconBg: string;
  wordCount: number;
  formsCount: number;
  tablesCount: number;
  snippet: string;
}

export interface UserSettings {
  language: LanguageCode;
  speechSpeed: number; // 0.8 - 1.4
  textSize: 'normal' | 'medium' | 'large';
  highContrast: boolean;
  spokenResponses: boolean;
  handsFreeMode: boolean;
  soundEffects: boolean;
  geminiModel?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  visionEnabled?: boolean;
  memoryEnabled?: boolean;
}

export interface UserMemory {
  id: string;
  category: 'preference' | 'workflow' | 'project' | 'frequent_site' | 'completed_task';
  content: string;
  createdAt: number;
  updatedAt: number;
  source: 'explicit_user' | 'learned_task';
  pinned?: boolean;
}

export interface TaskContinuityState {
  id: string;
  directive: string;
  tabId?: number;
  url: string;
  title: string;
  status: 'in_progress' | 'paused' | 'completed' | 'interrupted' | 'failed';
  completedSteps: string[];
  pendingSteps: string[];
  lastResultSummary?: string;
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  title: string;
  date: string;
  timestamp: number;
  preview: string;
  messageCount: number;
  websiteTitle: string;
}

// ==========================================
// PHASE 7: WORKFLOW AUTOMATION & PROACTIVE INTELLIGENCE
// ==========================================

export type WorkflowStatus =
  | 'draft'
  | 'active'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_approval';

export type TriggerType =
  | 'one_time'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'interval'
  | 'content_change'
  | 'price_change'
  | 'announcement';

export type WorkflowConditionType =
  | 'price_below'
  | 'price_change'
  | 'text_contains'
  | 'element_exists'
  | 'content_diff'
  | 'availability_change'
  | 'always';

export interface WorkflowCondition {
  type: WorkflowConditionType;
  targetValue?: string | number;
  threshold?: number;
  currency?: string;
  selector?: string;
  lastKnownValue?: string | number;
  lastEvaluatedAt?: number;
}

export interface WorkflowTrigger {
  type: TriggerType;
  intervalMinutes?: number; // Minimum 1 minute (Chrome MV3 constraint)
  timeOfDay?: string;       // "HH:mm" 24h
  dayOfWeek?: number;       // 0-6 (Sun-Sat)
  dayOfMonth?: number;      // 1-31
  condition?: WorkflowCondition;
}

export type WorkflowStepAction =
  | 'navigate'
  | 'extract'
  | 'summarize'
  | 'notify'
  | 'click'
  | 'type'
  | 'custom_prompt';

export interface WorkflowStep {
  id: string;
  title: string;
  action: WorkflowStepAction;
  url?: string;
  selector?: string;
  text?: string;
  prompt?: string;
  isConsequential?: boolean; // If true, requires explicit user confirmation before executing
}

export interface WorkflowExecutionStep {
  stepId: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval';
  result?: string;
  error?: string;
  executedAt?: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'success' | 'failed' | 'cancelled' | 'waiting_approval';
  triggerSource: 'alarm' | 'manual' | 'voice' | 'page_change';
  steps: WorkflowExecutionStep[];
  detectedChange?: {
    summary: string;
    previousValue?: string;
    newValue?: string;
    changeType: 'price' | 'content' | 'announcement';
  };
  error?: string;
  retryAttempt?: number;
}

export interface WebpageSnapshot {
  id: string;
  workflowId: string;
  url: string;
  timestamp: number;
  contentHash: string;
  snippet: string;
  detectedPrice?: number;
  currency?: string;
  announcements?: string[];
  rawTextLength: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  targetUrls: string[];
  steps: WorkflowStep[];
  requiresApproval: boolean;
  notificationEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastExecutedAt?: number;
  nextScheduledAt?: number;
  executionHistory: WorkflowExecution[];
  consecutiveFailures: number;
  retryCount: number;
  maxRetries: number;
  lastSnapshot?: WebpageSnapshot;
}


