import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  X,
  Workflow as WorkflowIcon,
  Play,
  Pause,
  Trash2,
  Clock,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Plus,
} from 'lucide-react';
import type { Workflow, TriggerType, WorkflowConditionType } from '../types';
import { WorkflowManager } from '../../lib/workflow-manager';
import { parseWorkflowFromDirective } from '../../lib/workflow-parser';

interface WorkflowDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTabUrl?: string;
  activeTabTitle?: string;
  geminiApiKey?: string;
  geminiModel?: string;
}

export const WorkflowDrawer: FC<WorkflowDrawerProps> = ({
  isOpen,
  onClose,
  activeTabUrl = '',
  activeTabTitle = '',
  geminiApiKey = '',
  geminiModel = 'gemini-3.1-flash-lite',
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'history'>('list');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);

  // Form State for Create
  const [nlPrompt, setNlPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState(activeTabUrl || '');
  const [triggerType, setTriggerType] = useState<TriggerType>('daily');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [conditionType, setConditionType] = useState<WorkflowConditionType>('content_diff');
  const [priceThreshold, setPriceThreshold] = useState<number | ''>('');
  const [currency, setCurrency] = useState('INR');
  const [isConsequential, setIsConsequential] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [createSuccessMessage, setCreateSuccessMessage] = useState('');

  const workflowManager = WorkflowManager.getInstance();

  useEffect(() => {
    if (isOpen) {
      workflowManager.load().then((wfs) => setWorkflows(wfs));
      const unsubscribe = workflowManager.subscribe((wfs) => setWorkflows([...wfs]));
      if (activeTabUrl && !targetUrl) {
        setTargetUrl(activeTabUrl);
      }
      return () => unsubscribe();
    }
  }, [isOpen, activeTabUrl]);

  const handleRunNow = async (id: string) => {
    setExecutingId(id);
    try {
      await workflowManager.executeWorkflow(id, 'manual');
      setWorkflows(workflowManager.listWorkflows());
    } catch (err) {
      console.error('Failed to run workflow:', err);
    } finally {
      setExecutingId(null);
    }
  };

  const handleTogglePause = async (wf: Workflow) => {
    if (wf.status === 'paused') {
      await workflowManager.resumeWorkflow(wf.id);
    } else {
      await workflowManager.pauseWorkflow(wf.id);
    }
    setWorkflows(workflowManager.listWorkflows());
  };

  const handleDelete = async (id: string) => {
    await workflowManager.deleteWorkflow(id);
    setWorkflows(workflowManager.listWorkflows());
  };

  const handleApproveAction = async (wf: Workflow) => {
    // Approve consequential workflow run
    await workflowManager.updateWorkflow(wf.id, { requiresApproval: true, status: 'active' });
    await workflowManager.executeWorkflow(wf.id, 'manual');
    setWorkflows(workflowManager.listWorkflows());
  };

  const handleRejectAction = async (wf: Workflow) => {
    await workflowManager.updateWorkflow(wf.id, { status: 'cancelled' });
    setWorkflows(workflowManager.listWorkflows());
  };

  const handleAiParse = async () => {
    if (!nlPrompt.trim()) return;
    setIsAiGenerating(true);

    try {
      const draft = await parseWorkflowFromDirective(
        nlPrompt,
        activeTabUrl,
        activeTabTitle,
        { geminiApiKey, geminiModel }
      );

      setName(draft.name);
      setDescription(draft.description);
      setTriggerType(draft.triggerType);
      if (draft.intervalMinutes) setIntervalMinutes(draft.intervalMinutes);
      if (draft.timeOfDay) setTimeOfDay(draft.timeOfDay);
      if (draft.targetUrl) setTargetUrl(draft.targetUrl);
      if (draft.condition) {
        setConditionType(draft.condition.type);
        if (draft.condition.threshold !== undefined) setPriceThreshold(draft.condition.threshold);
        if (draft.condition.currency) setCurrency(draft.condition.currency);
      }
      setIsConsequential(draft.isConsequential);
    } catch (err) {
      console.error('AI parse failed:', err);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleCreateWorkflow = async () => {
    if (!name.trim()) return;

    await workflowManager.createWorkflow({
      name: name.trim(),
      description: description.trim() || 'Automated browser workflow',
      trigger: {
        type: triggerType,
        intervalMinutes: triggerType === 'interval' ? Math.max(1, intervalMinutes) : (triggerType === 'price_change' ? 15 : undefined),
        timeOfDay: triggerType === 'daily' ? timeOfDay : undefined,
        condition: {
          type: conditionType,
          threshold: typeof priceThreshold === 'number' ? priceThreshold : undefined,
          currency,
        },
      },
      targetUrls: [targetUrl.trim() || activeTabUrl || 'about:blank'],
      requiresApproval: isConsequential,
      notificationEnabled,
      status: 'active',
    });

    setWorkflows(workflowManager.listWorkflows());
    setCreateSuccessMessage(`Workflow "${name}" created and scheduled!`);
    setTimeout(() => {
      setCreateSuccessMessage('');
      setActiveTab('list');
      setName('');
      setDescription('');
      setNlPrompt('');
    }, 1500);
  };

  if (!isOpen) return null;

  const allHistory = workflows.flatMap((w) =>
    (w.executionHistory || []).map((e) => ({ ...e, workflowName: w.name }))
  ).sort((a, b) => b.startTime - a.startTime);

  const waitingApprovalList = workflows.filter((w) => w.status === 'waiting_approval');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/25 backdrop-blur-xs transition-opacity duration-300">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md apple-glass-sheet shadow-2xl flex flex-col h-full border-l border-white/60 text-[#1D1D26]">
          {/* Header */}
          <div className="p-4 border-b border-white/40 flex items-center justify-between bg-white/20">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7772E8] to-[#544EC3] text-white flex items-center justify-center shadow-xs">
                <WorkflowIcon className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-[#1D1D26]">Workflow Automation</h2>
                <p className="text-[10px] text-[#777784] font-medium">Proactive & Scheduled Intelligence</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg apple-glass-control flex items-center justify-center text-[#5D5D70] hover:text-[#1D1D26] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex p-2 bg-white/10 border-b border-white/30 gap-1 text-[11px] font-semibold">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-white/80 shadow-xs text-[#524BC0]'
                  : 'text-[#5D5D70] hover:text-[#1D1D26]'
              }`}
            >
              <span>Active</span>
              {workflows.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-[#EAE8FF] text-[#524BC0] font-bold">
                  {workflows.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-white/80 shadow-xs text-[#524BC0]'
                  : 'text-[#5D5D70] hover:text-[#1D1D26]'
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Create New</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white/80 shadow-xs text-[#524BC0]'
                  : 'text-[#5D5D70] hover:text-[#1D1D26]'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>History</span>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {/* Safety Approval Gate Alert if any waiting */}
            {waitingApprovalList.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Consequential Action Requires Approval</span>
                </div>
                {waitingApprovalList.map((wf) => (
                  <div key={wf.id} className="text-[10.5px] p-2 rounded-lg bg-white/40 space-y-1.5">
                    <p className="font-semibold">{wf.name}</p>
                    <p className="text-[10px] text-amber-800">
                      This workflow reached a step requiring explicit authorization before proceeding.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleApproveAction(wf)}
                        className="px-2.5 py-1 rounded-md bg-amber-600 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                      >
                        Approve & Execute
                      </button>
                      <button
                        onClick={() => handleRejectAction(wf)}
                        className="px-2.5 py-1 rounded-md bg-white/70 text-[#5D5D70] font-semibold text-[10px] cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 1: ACTIVE WORKFLOWS LIST */}
            {activeTab === 'list' && (
              <div className="space-y-3">
                {workflows.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <div className="w-12 h-12 rounded-2xl apple-glass-card mx-auto flex items-center justify-center text-[#7772E8]">
                      <WorkflowIcon className="w-6 h-6" />
                    </div>
                    <p className="font-bold text-sm text-[#1D1D26]">No Active Workflows</p>
                    <p className="text-[11px] text-[#777784] max-w-xs mx-auto">
                      Create recurring tasks or tell ANVORA: "Check this website every morning" or "Monitor this product price".
                    </p>
                    <button
                      onClick={() => setActiveTab('create')}
                      className="mt-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#7772E8] to-[#544EC3] text-white font-bold text-xs shadow-xs cursor-pointer"
                    >
                      Create First Workflow
                    </button>
                  </div>
                ) : (
                  workflows.map((wf) => {
                    const isRunning = executingId === wf.id || wf.status === 'running';
                    return (
                      <div
                        key={wf.id}
                        className="p-3 rounded-2xl apple-glass-card border border-white/60 space-y-2.5 transition-all shadow-xs"
                      >
                        {/* Title & Status Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-xs text-[#1D1D26]">{wf.name}</h3>
                            <p className="text-[10px] text-[#777784] line-clamp-1">{wf.description}</p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider shrink-0 ${
                              wf.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30'
                                : wf.status === 'running'
                                ? 'bg-indigo-500/15 text-indigo-700 ring-1 ring-indigo-500/30 animate-pulse'
                                : wf.status === 'paused'
                                ? 'bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30'
                                : wf.status === 'waiting_approval'
                                ? 'bg-red-500/15 text-red-700 ring-1 ring-red-500/30'
                                : 'bg-gray-500/15 text-gray-700'
                            }`}
                          >
                            {wf.status.toUpperCase()}
                          </span>
                        </div>

                        {/* Schedule & Target Details */}
                        <div className="grid grid-cols-2 gap-1.5 text-[9.5px] text-[#5D5D70] bg-white/30 p-2 rounded-xl">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#7772E8]" />
                            <span className="capitalize">
                              {wf.trigger.type === 'daily'
                                ? `Daily at ${wf.trigger.timeOfDay || '09:00'}`
                                : wf.trigger.type === 'interval'
                                ? `Every ${wf.trigger.intervalMinutes || 60}m`
                                : wf.trigger.type === 'price_change'
                                ? `Price < ${wf.trigger.condition?.currency || '₹'}${wf.trigger.condition?.threshold || ''}`
                                : wf.trigger.type}
                            </span>
                          </div>
                          {wf.nextScheduledAt && (
                            <div className="text-right">
                              Next: {new Date(wf.nextScheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                          <div className="col-span-2 truncate flex items-center gap-1">
                            <ExternalLink className="w-2.5 h-2.5 text-[#777784] shrink-0" />
                            <span className="truncate">{wf.targetUrls[0] || 'Active tab'}</span>
                          </div>
                        </div>

                        {/* Last Run Summary if available */}
                        {wf.lastSnapshot && (
                          <div className="text-[9px] text-[#777784] border-t border-white/40 pt-1.5 flex justify-between">
                            <span>Baseline recorded</span>
                            <span>{new Date(wf.lastSnapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleRunNow(wf.id)}
                              disabled={isRunning}
                              className="px-2.5 py-1 rounded-lg apple-glass-control flex items-center gap-1 text-[10px] font-semibold text-[#524BC0] hover:text-[#1D1D26] cursor-pointer"
                              title="Execute workflow immediately"
                            >
                              <Play className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
                              <span>{isRunning ? 'Running...' : 'Run Now'}</span>
                            </button>

                            <button
                              onClick={() => handleTogglePause(wf)}
                              className="px-2 py-1 rounded-lg apple-glass-control flex items-center gap-1 text-[10px] text-[#5D5D70] hover:text-[#1D1D26] cursor-pointer"
                              title={wf.status === 'paused' ? 'Resume workflow' : 'Pause workflow'}
                            >
                              {wf.status === 'paused' ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                              <span>{wf.status === 'paused' ? 'Resume' : 'Pause'}</span>
                            </button>
                          </div>

                          <button
                            onClick={() => handleDelete(wf.id)}
                            className="p-1 rounded-lg text-[#777784] hover:text-red-600 transition-colors cursor-pointer"
                            title="Delete workflow"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: CREATE WORKFLOW */}
            {activeTab === 'create' && (
              <div className="space-y-3.5">
                {/* Natural Language Prompt Assistant */}
                <div className="p-3 rounded-2xl bg-gradient-to-br from-[#7772E8]/10 via-[#C4B5FD]/10 to-transparent border border-[#7772E8]/20 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#524BC0]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Natural Language Assistant</span>
                  </div>
                  <p className="text-[10px] text-[#5D5D70]">
                    Describe your automated task in English, Hindi, or Telugu:
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={nlPrompt}
                      onChange={(e) => setNlPrompt(e.target.value)}
                      placeholder="e.g. Check price every 15 mins and alert if below 5000"
                      className="flex-1 apple-glass-card p-2 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60"
                    />
                    <button
                      onClick={handleAiParse}
                      disabled={isAiGenerating || !nlPrompt.trim()}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#7772E8] to-[#544EC3] text-white font-bold text-[10.5px] shrink-0 disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      {isAiGenerating ? 'Drafting...' : 'Auto Fill'}
                    </button>
                  </div>
                </div>

                {/* Form fields */}
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#777784] block mb-1">
                      Workflow Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Morning Tech Updates"
                      className="w-full apple-glass-card p-2 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#777784] block mb-1">
                      Target Webpage URL
                    </label>
                    <input
                      type="text"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full apple-glass-card p-2 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-[#777784] block mb-1">
                        Trigger Schedule
                      </label>
                      <select
                        value={triggerType}
                        onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                        className="w-full apple-glass-card p-2 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60"
                      >
                        <option value="daily">Daily</option>
                        <option value="interval">Interval (Minutes)</option>
                        <option value="price_change">Price Drop Alert</option>
                        <option value="content_change">Content Change</option>
                        <option value="announcement">New Announcements</option>
                      </select>
                    </div>

                    {triggerType === 'daily' && (
                      <div>
                        <label className="text-[10px] font-bold uppercase text-[#777784] block mb-1">
                          Time (24h)
                        </label>
                        <input
                          type="time"
                          value={timeOfDay}
                          onChange={(e) => setTimeOfDay(e.target.value)}
                          className="w-full apple-glass-card p-2 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60"
                        />
                      </div>
                    )}

                    {triggerType === 'interval' && (
                      <div>
                        <label className="text-[10px] font-bold uppercase text-[#777784] block mb-1">
                          Interval (Min)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={intervalMinutes}
                          onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                          className="w-full apple-glass-card p-2 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60"
                        />
                      </div>
                    )}

                    {triggerType === 'price_change' && (
                      <div>
                        <label className="text-[10px] font-bold uppercase text-[#777784] block mb-1">
                          Target Max Price (₹)
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. 5000"
                          value={priceThreshold}
                          onChange={(e) => setPriceThreshold(e.target.value ? Number(e.target.value) : '')}
                          className="w-full apple-glass-card p-2 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60"
                        />
                      </div>
                    )}
                  </div>

                  {/* Safety & Notifications options */}
                  <div className="space-y-2 pt-2 border-t border-white/40">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationEnabled}
                        onChange={(e) => setNotificationEnabled(e.target.checked)}
                        className="rounded-md text-[#7772E8]"
                      />
                      <span className="text-[11px] font-medium text-[#1D1D26]">
                        Send desktop notifications when condition met
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isConsequential}
                        onChange={(e) => setIsConsequential(e.target.checked)}
                        className="rounded-md text-amber-600"
                      />
                      <span className="text-[11px] font-medium text-[#1D1D26]">
                        Requires explicit user approval before execution (Consequential)
                      </span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  {createSuccessMessage ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-800 text-center font-bold text-xs flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{createSuccessMessage}</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateWorkflow}
                      disabled={!name.trim()}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#7772E8] to-[#544EC3] text-white font-bold text-xs shadow-md shadow-[#7772E8]/20 disabled:opacity-50 cursor-pointer"
                    >
                      Save and Schedule Workflow
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: EXECUTION HISTORY */}
            {activeTab === 'history' && (
              <div className="space-y-2.5">
                {allHistory.length === 0 ? (
                  <div className="text-center py-10 text-[#777784]">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-xs">No Execution Logs Yet</p>
                    <p className="text-[10px]">Executions will appear here when scheduled alarms or triggers run.</p>
                  </div>
                ) : (
                  allHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl apple-glass-card border border-white/60 space-y-1 text-[10.5px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#1D1D26]">{item.workflowName}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-md text-[8.5px] font-bold ${
                            item.status === 'success'
                              ? 'bg-emerald-500/15 text-emerald-700'
                              : item.status === 'failed'
                              ? 'bg-rose-500/15 text-rose-700'
                              : 'bg-amber-500/15 text-amber-700'
                          }`}
                        >
                          {item.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="text-[9.5px] text-[#777784] flex justify-between">
                        <span>Trigger: {item.triggerSource}</span>
                        <span>{new Date(item.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>

                      {item.detectedChange && (
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-900 text-[9.5px]">
                          <strong>Change:</strong> {item.detectedChange.summary}
                        </div>
                      )}

                      {item.error && (
                        <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-800 text-[9.5px]">
                          <strong>Error:</strong> {item.error}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
