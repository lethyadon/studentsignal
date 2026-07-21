import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePriorityBar } from '../context/PriorityBarContext';
import NotificationCenter, { useNotificationCount } from './NotificationCenter';
import {
  AlertTriangle, Eye, TrendingUp, ClipboardList, RotateCcw,
  Bell, Search, X, User, ChevronRight, Zap,
} from 'lucide-react';

interface MetricTileProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  urgentDot?: boolean;
  valueColor: string;
  onClick: () => void;
}

function MetricTile({ label, value, icon, urgentDot, valueColor, onClick }: MetricTileProps) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-start gap-1 px-4 py-3 rounded-xl border border-white/10 transition-all shrink-0 min-w-[100px] text-left hover:bg-white/10 hover:border-white/20"
    >
      {urgentDot && Number(value) > 0 && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-400 animate-pulse" />
      )}
      <div className="text-slate-400 group-hover:text-slate-200 transition-colors">
        {icon}
      </div>
      <div className={`text-2xl font-black leading-none tracking-tight ${valueColor}`}>
        {value}
      </div>
      <div className="text-[11px] font-semibold leading-tight text-slate-400 group-hover:text-slate-300 transition-colors whitespace-nowrap">
        {label}
      </div>
    </button>
  );
}

export default function GlobalPriorityBar() {
  const navigate = useNavigate();
  const {
    redCount, amberCount, greenCount,
    openActionsCount, reviewsDueCount, urgentCount,
    myQueueCount, students, interventions,
  } = usePriorityBar();
  const notifCount = useNotificationCount();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setSearchQuery('');
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchResults = searchQuery.trim().length < 2 ? [] : (() => {
    const term = searchQuery.toLowerCase();
    const studentResults = students
      .filter(s => s.name.toLowerCase().includes(term))
      .slice(0, 5)
      .map(s => ({ type: 'student' as const, id: s.id, label: s.name, sub: `${s.year_group} · ${s.signal_category || 'no signal'}` }));

    const actionResults = interventions
      .filter(i => {
        const student = students.find(s => s.id === i.student_id);
        return i.action_type.toLowerCase().includes(term) ||
          (student?.name || '').toLowerCase().includes(term) ||
          (i.assigned_to || '').toLowerCase().includes(term);
      })
      .slice(0, 4)
      .map(i => {
        const student = students.find(s => s.id === i.student_id);
        return {
          type: 'action' as const,
          id: i.id,
          label: i.action_type,
          sub: `${student?.name || '—'} · ${i.status.replace(/_/g, ' ')} · ${i.assigned_to || 'unassigned'}`,
          studentId: i.student_id,
        };
      });

    return [...studentResults, ...actionResults];
  })();

  // Each tile always navigates to its dedicated destination page with a URL param.
  // Pages read those params and apply the filter on mount.
  const tiles = [
    {
      key: 'red',
      label: 'Red Priority',
      value: redCount,
      icon: <AlertTriangle className="w-4 h-4" />,
      valueColor: 'text-red-400',
      activeBg: 'bg-red-500/20',
      urgentDot: true,
      onClick: () => navigate('/signal-queue?priority=red'),
    },
    {
      key: 'amber',
      label: 'Amber Watchlist',
      value: amberCount,
      icon: <Eye className="w-4 h-4" />,
      valueColor: 'text-amber-400',
      activeBg: 'bg-amber-500/20',
      urgentDot: false,
      onClick: () => navigate('/signal-queue?priority=amber'),
    },
    {
      key: 'green',
      label: 'Positive Progress',
      value: greenCount,
      icon: <TrendingUp className="w-4 h-4" />,
      valueColor: 'text-emerald-400',
      activeBg: 'bg-emerald-500/20',
      urgentDot: false,
      onClick: () => navigate('/success-stories?type=positive_progress'),
    },
    {
      key: 'actions',
      label: 'Open Actions',
      value: openActionsCount,
      icon: <ClipboardList className="w-4 h-4" />,
      valueColor: 'text-sky-400',
      activeBg: 'bg-sky-500/20',
      urgentDot: false,
      onClick: () => navigate('/interventions?status=open'),
    },
    {
      key: 'reviews',
      label: 'Reviews Due',
      value: reviewsDueCount,
      icon: <RotateCcw className="w-4 h-4" />,
      valueColor: 'text-orange-400',
      activeBg: 'bg-orange-500/20',
      urgentDot: reviewsDueCount > 0,
      onClick: () => navigate('/reviews?filter=due'),
    },
    ...(urgentCount > 0 ? [{
      key: 'urgent',
      label: 'Urgent',
      value: urgentCount,
      icon: <Zap className="w-4 h-4" />,
      valueColor: 'text-red-400',
      activeBg: 'bg-red-500/20',
      urgentDot: true,
      onClick: () => navigate('/interventions?priority=urgent'),
    }] : []),
    {
      key: 'my-queue',
      label: 'My Queue',
      value: myQueueCount,
      icon: <User className="w-4 h-4" />,
      valueColor: 'text-teal-400',
      activeBg: 'bg-teal-500/20',
      urgentDot: false,
      onClick: () => navigate('/interventions?mine=true'),
    },
  ];

  return (
    <div className="bg-slate-900 rounded-2xl mb-6 px-5 py-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Today's Priorities</span>

        <div className="flex items-center gap-2">
          {/* Quick search */}
          <div ref={searchRef} className="relative">
            <button
              onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => inputRef.current?.focus(), 50); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                showSearch
                  ? 'bg-white/15 border-white/25 text-white'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
            </button>
            {showSearch && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search students, actions, staff..."
                    className="flex-1 text-sm outline-none text-slate-800 placeholder:text-slate-400"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')}>
                      <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                    </button>
                  )}
                </div>
                {searchQuery.trim().length >= 2 ? (
                  searchResults.length === 0 ? (
                    <div className="px-4 py-5 text-xs text-slate-400 text-center">No results for "{searchQuery}"</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto">
                      {searchResults.map((r, idx) => (
                        <button
                          key={`${r.type}-${r.id}-${idx}`}
                          onClick={() => {
                            if (r.type === 'student') navigate(`/students/${r.id}`);
                            else navigate(`/students/${r.studentId}?tab=actions&highlight=${r.id}`);
                            setShowSearch(false);
                            setSearchQuery('');
                          }}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0"
                        >
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${r.type === 'student' ? 'bg-teal-50' : 'bg-blue-50'}`}>
                            {r.type === 'student'
                              ? <User className="w-3.5 h-3.5 text-teal-600" />
                              : <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{r.label}</p>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">{r.sub}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1" />
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="px-4 py-4 text-xs text-slate-400">
                    <p className="font-medium text-slate-600 mb-1.5">Quick search</p>
                    <div className="space-y-1">
                      <p>Student name → opens profile</p>
                      <p>Action type → opens in drawer</p>
                      <p>Staff name → filters actions</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notifications bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                showNotifications
                  ? 'bg-white/15 border-white/25 text-white'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Alerts</span>
              {notifCount > 0 && (
                <span className="min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 z-50">
                <NotificationCenter onClose={() => setShowNotifications(false)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics tiles row — horizontal scroll on mobile */}
      <div className="flex items-start gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {tiles.map(tile => (
          <MetricTile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            icon={tile.icon}
            urgentDot={tile.urgentDot}
            valueColor={tile.valueColor}
            onClick={tile.onClick}
          />
        ))}
      </div>
    </div>
  );
}

