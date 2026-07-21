import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useAuth, DEMO_PERSONAS } from '../context/AuthContext';
import {
  BookOpen, Check, ChevronRight, ArrowRight, X,
  User, Shield, Users, ClipboardList, Layers, BarChart3,
  StickyNote, Bell, Home, Eye, Minus,
} from 'lucide-react';

interface Step {
  id: number;
  role: string;
  roleColor: string;
  icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
  action?: { label: string; type: 'navigate' | 'role'; target: string; name?: string };
  checkFor: string;
  // CSS selector for the element to highlight on the current page
  highlightSelector?: string;
}

const STEPS: Step[] = [
  {
    id: 1, role: 'Teacher — Ms Okonkwo', roleColor: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: User,
    title: 'Log in as Teacher',
    description: 'Start as Ms Okonkwo, a classroom teacher. Teachers see only their students and can raise concerns — they never see the full safeguarding queue or whole-school data.',
    action: { label: 'Switch to Teacher', type: 'role', target: 'teacher' },
    checkFor: 'Dashboard shows "Staff Observation Portal" with Year 10 students only.',
    highlightSelector: '[data-tour="nav-dashboard"]',
  },
  {
    id: 2, role: 'Teacher — Ms Okonkwo', roleColor: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: StickyNote,
    title: 'Raise a concern for Oliver Brown',
    description: 'Click "Quick Note" in the sidebar. Select Oliver Brown, choose "Raise concern", write what you observed, and submit. The system routes it automatically.',
    action: { label: 'Open Quick Note', type: 'navigate', target: '/dashboard' },
    checkFor: 'After submitting: confirmation screen shows who received it (DSL or HOY) and why.',
    highlightSelector: '[data-tour="quick-note"]',
  },
  {
    id: 3, role: 'DSL — Mr Ahmed', roleColor: 'bg-red-100 text-red-800 border-red-200',
    icon: Shield,
    title: 'Switch to DSL',
    description: 'Now become Mr Ahmed, the Designated Safeguarding Lead. All safeguarding and urgent concerns raised by staff land here automatically.',
    action: { label: 'Switch to DSL', type: 'role', target: 'dsl' },
    checkFor: 'Notification bell shows an unread urgent notification for Oliver Brown.',
    highlightSelector: '[data-tour="notifications"]',
  },
  {
    id: 4, role: 'DSL — Mr Ahmed', roleColor: 'bg-red-100 text-red-800 border-red-200',
    icon: Bell,
    title: 'Check urgent notification',
    description: 'Open the Notifications bell at the bottom of the sidebar. The concern from Ms Okonkwo appears at the top — marked Urgent — with a direct link to Oliver\'s Actions tab.',
    action: { label: 'Go to Oliver\'s Actions', type: 'navigate', target: '/students/s1?tab=actions' },
    checkFor: 'Oliver\'s Actions tab is open. The DSL welfare review action shows as Urgent with Ms Okonkwo as creator.',
    highlightSelector: '[data-tour="notifications"]',
  },
  {
    id: 5, role: 'DSL — Mr Ahmed', roleColor: 'bg-red-100 text-red-800 border-red-200',
    icon: Home,
    title: 'Open Morning Briefing',
    description: 'The Morning Briefing is the DSL\'s daily starting point. All active actions are sorted by priority — urgent items always appear first.',
    action: { label: 'Go to Morning Briefing', type: 'navigate', target: '/dashboard' },
    checkFor: 'Oliver Brown appears in Active Actions with an Urgent badge at the top of the queue.',
    highlightSelector: '[data-tour="nav-dashboard"]',
  },
  {
    id: 6, role: 'DSL — Mr Ahmed', roleColor: 'bg-red-100 text-red-800 border-red-200',
    icon: ClipboardList,
    title: 'Review Oliver\'s action',
    description: 'Click the action card for Oliver Brown in the Morning Briefing. This opens his profile directly on the Actions tab, where you can update status, record an outcome, or escalate.',
    action: { label: 'Open Oliver\'s Actions tab', type: 'navigate', target: '/students/s1?tab=actions' },
    checkFor: 'Actions tab is active. Open action from Ms Okonkwo\'s concern visible with red Urgent priority.',
  },
  {
    id: 7, role: 'DSL — Mr Ahmed', roleColor: 'bg-red-100 text-red-800 border-red-200',
    icon: Eye,
    title: 'Open Oliver\'s full profile',
    description: 'Navigate to Oliver\'s full profile. The Actions tab is automatically highlighted because there is an open urgent action — no hunting required.',
    action: { label: 'Open Oliver\'s profile', type: 'navigate', target: '/students/s1' },
    checkFor: 'Actions tab has a pulsing red dot and is pre-selected. Badge shows number of open actions.',
    highlightSelector: 'button[class*="border-red"]',
  },
  {
    id: 8, role: 'DSL — Mr Ahmed', roleColor: 'bg-red-100 text-red-800 border-red-200',
    icon: Layers,
    title: 'Confirm chronology, action and signal',
    description: 'Check three places: (1) Signals tab — shows the escalation pattern. (2) Actions tab — shows the open action created by the concern. (3) Overview — chronology entry from Ms Okonkwo.',
    action: { label: 'View Signals tab', type: 'navigate', target: '/students/s1?tab=patterns' },
    checkFor: 'Signals tab: escalation pattern detected. Actions tab: open DSL action. Overview: chronology entry.',
  },
  {
    id: 9, role: 'Head of Year — Ms Harris', roleColor: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Users,
    title: 'Switch to Head of Year',
    description: 'Become Ms Harris, Head of Year 10. She sees her year group\'s pastoral picture and any HOY-routed actions from teacher concerns.',
    action: { label: 'Switch to Head of Year', type: 'role', target: 'head_of_year', name: 'Ms Harris (HOY Y10)' },
    checkFor: 'Dashboard shows Year 10 students. HOY-routed actions appear in Active Actions.',
    highlightSelector: '[data-tour="nav-dashboard"]',
  },
  {
    id: 10, role: 'Head of Year — Ms Harris', roleColor: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Layers,
    title: 'View pastoral queue',
    description: 'The Signal Queue is the HOY\'s primary working view — all Year 10 students requiring attention, sorted by urgency. Each card shows why the student appears and who owns the action.',
    action: { label: 'Go to Signal Queue', type: 'navigate', target: '/signal-queue' },
    checkFor: 'Urgent signals at the top. Students with open urgent actions highlighted above all others.',
    highlightSelector: '[data-tour="nav-signal-queue"]',
  },
  {
    id: 11, role: 'Headteacher — Mrs Clarke', roleColor: 'bg-slate-100 text-slate-800 border-slate-200',
    icon: BarChart3,
    title: 'Switch to Headteacher — whole-school view',
    description: 'Finally, become Mrs Clarke, the Headteacher. She sees the complete school picture: all year groups, all signals, intervention effectiveness, and the full Reports suite.',
    action: { label: 'Switch to Headteacher', type: 'role', target: 'admin' },
    checkFor: 'Dashboard shows whole-school Morning Briefing. Reports page accessible with all analytics, date range filter, and PDF/CSV export.',
    highlightSelector: '[data-tour="nav-reports"]',
  },
];

// Inject/remove a glowing highlight ring on a DOM element
let _cleanupHighlight: (() => void) | null = null;

function applyHighlight(selector: string) {
  _cleanupHighlight?.();
  _cleanupHighlight = null;

  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  el.style.outline = '3px solid #0d9488';
  el.style.outlineOffset = '3px';
  el.style.borderRadius = '8px';
  el.style.boxShadow = '0 0 0 6px rgba(13,148,136,0.18)';
  el.style.transition = 'outline 0.2s, box-shadow 0.2s';

  _cleanupHighlight = () => {
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.boxShadow = '';
  };
}

function clearHighlight() {
  _cleanupHighlight?.();
  _cleanupHighlight = null;
}

export default function DemoGuide() {
  const { demoMode, enableDemo } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from the header bar
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    };
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newX = dragRef.current.origX + dx;
      const newY = dragRef.current.origY + dy;
      // Clamp to viewport
      const panelW = panelRef.current?.offsetWidth || 320;
      const panelH = panelRef.current?.offsetHeight || 400;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - panelW, newX)),
        y: Math.max(0, Math.min(window.innerHeight - panelH, newY)),
      });
    }
    function onMouseUp() {
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  // Apply highlight whenever step changes or panel opens
  useEffect(() => {
    if (!open || minimized) { clearHighlight(); return; }
    if (!step.highlightSelector) { clearHighlight(); return; }

    // Delay slightly so navigation/render can settle
    highlightTimer.current = setTimeout(() => applyHighlight(step.highlightSelector!), 350);
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      clearHighlight();
    };
  }, [open, minimized, currentStep]);

  // Re-apply after route change (the element may have just rendered)
  useEffect(() => {
    if (!open || minimized || !step.highlightSelector) return;
    const t = setTimeout(() => applyHighlight(step.highlightSelector!), 600);
    return () => clearTimeout(t);
  }, [open]);

  if (!demoMode) return null;

  function handleAction() {
    if (!step.action) return;
    if (step.action.type === 'navigate') {
      navigate(step.action.target);
    } else if (step.action.type === 'role') {
      const persona = step.action.name
        ? DEMO_PERSONAS.find(p => p.name === step.action!.name)
        : DEMO_PERSONAS.find(p => p.role === step.action!.target);
      if (persona) {
        flushSync(() => { enableDemo(persona.role, persona.name); });
        navigate('/dashboard');
      }
      if (!isLast) setTimeout(() => setCurrentStep(c => c + 1), 450);
    }
  }

  function goToStep(idx: number) {
    setCurrentStep(idx);
    setMinimized(false);
  }

  return (
    <>
      {/* Collapsed trigger tab — on the left so it never overlaps the right-side student drawer */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMinimized(false); }}
          className="fixed bottom-24 left-0 z-50 flex items-center gap-1.5 bg-teal-600 text-white px-3 py-2.5 rounded-r-xl shadow-lg text-[11px] font-bold hover:bg-teal-700 transition-colors"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.05em' }}
          title="Open Demo Guide"
        >
          <BookOpen className="w-3.5 h-3.5 rotate-90" />
          DEMO GUIDE
        </button>
      )}

      {/* Expanded / minimized panel — bottom-left so it doesn't block the right-side student drawer */}
      {open && (
        <div
          ref={panelRef}
          className={`fixed z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-[max-height] duration-200 ${minimized ? 'max-h-14' : 'max-h-[88vh]'}`}
          style={pos ? { left: pos.x, top: pos.y, bottom: 'auto' } : { bottom: '24px', left: '16px' }}
        >
          {/* Header — always visible, drag handle */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shrink-0 select-none cursor-grab active:cursor-grabbing"
            onMouseDown={onMouseDown}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-teal-400" />
              <span className="text-sm font-bold">Demo Walkthrough</span>
              <span className="text-[10px] font-bold bg-teal-500 px-1.5 py-0.5 rounded-full">
                {currentStep + 1}/{STEPS.length}
              </span>
              {minimized && (
                <span className="text-[10px] text-slate-400 ml-1 truncate max-w-[120px]">{step.title}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized(m => !m)}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                title={minimized ? 'Expand' : 'Minimise'}
              >
                {minimized ? <ChevronRight className="w-4 h-4 rotate-90" /> : <Minus className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { setOpen(false); clearHighlight(); }}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Step list — scrollable */}
              <div className="flex-1 overflow-y-auto">
                {STEPS.map((s, idx) => {
                  const Icon = s.icon;
                  const isDone = idx < currentStep;
                  const isCurrent = idx === currentStep;

                  return (
                    <div
                      key={s.id}
                      onClick={() => goToStep(idx)}
                      className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${isCurrent ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}
                    >
                      <div className="flex items-start gap-3 px-4 py-3">
                        {/* Step indicator */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-black border-2 transition-all ${
                          isDone ? 'bg-emerald-500 border-emerald-500 text-white'
                            : isCurrent ? 'bg-teal-600 border-teal-600 text-white'
                            : 'bg-white border-slate-200 text-slate-400'
                        }`}>
                          {isDone ? <Check className="w-3 h-3" /> : s.id}
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border mb-1 ${s.roleColor}`}>
                            {s.role}
                          </span>
                          <div className={`text-xs font-semibold leading-tight ${isCurrent ? 'text-slate-900' : isDone ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                            {s.title}
                          </div>

                          {/* Full content for active step only */}
                          {isCurrent && (
                            <div className="mt-2 space-y-3">
                              <p className="text-[11px] text-slate-600 leading-relaxed">{s.description}</p>

                              {/* What to check */}
                              <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Eye className="w-3 h-3 text-teal-600" />
                                  <span className="text-[9px] font-bold text-teal-700 uppercase tracking-wider">What to check</span>
                                </div>
                                <p className="text-[11px] text-teal-800 leading-relaxed">{s.checkFor}</p>
                              </div>

                              {/* Highlight hint */}
                              {s.highlightSelector && (
                                <div className="flex items-center gap-1.5 text-[10px] text-teal-600 font-medium">
                                  <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse inline-block" />
                                  Relevant element highlighted on screen
                                </div>
                              )}

                              {/* Action button */}
                              {s.action && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleAction(); }}
                                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700 transition-colors shadow-sm"
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                  {s.action.label}
                                  <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {isCurrent && !s.action && <ChevronRight className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer nav */}
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0">
                <button
                  onClick={() => goToStep(Math.max(0, currentStep - 1))}
                  disabled={isFirst}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                {isLast ? (
                  <button
                    onClick={() => { setCurrentStep(0); setOpen(false); clearHighlight(); }}
                    className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                  >
                    Done
                  </button>
                ) : (
                  <button
                    onClick={() => goToStep(Math.min(STEPS.length - 1, currentStep + 1))}
                    className="flex-1 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition-colors"
                  >
                    Next step
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

