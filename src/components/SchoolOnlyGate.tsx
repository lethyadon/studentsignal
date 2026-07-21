import { useNavigate } from 'react-router-dom';
import { Lock, Check, ArrowRight, Sparkles } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';

interface SchoolOnlyGateProps {
  featureName: string;
  featureDescription: string;
  highlights: string[];
  children: React.ReactNode;
}

const SCHOOL_ADDS = [
  'Unlimited Staff & Students',
  'Role-Based Dashboards',
  'Staff Insights',
  'Careers Intelligence',
  'Success Monitoring',
  'API Integrations',
  'Advanced Analytics',
  'Multi-year Trend Analysis',
  'Custom Reports',
  'Whole-school Intelligence Dashboard',
  'Priority Support',
  'Early Access Features',
];

export function SchoolOnlyGate({
  featureName,
  featureDescription,
  highlights,
  children,
}: SchoolOnlyGateProps) {
  const { effectivePlanName } = useSubscription();
  const { demoMode, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  // Only gate confirmed Essentials subscribers — demo, super admin, and no-sub users see everything
  const isStarterLocked = !demoMode && !isSuperAdmin && effectivePlanName === 'starter';

  if (!isStarterLocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-lg">

        {/* Badge */}
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 text-white text-xs font-bold">
            <Sparkles className="w-3 h-3" />
            Professional plan feature
          </span>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 shadow-sm text-center">
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Lock className="w-7 h-7 text-slate-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">{featureName}</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            {featureDescription}
          </p>

          {/* What you get */}
          <div className="text-left bg-slate-50 rounded-xl p-5 mb-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              What you get on Professional
            </p>
            <ul className="space-y-2">
              {highlights.map(h => (
                <li key={h} className="flex items-center gap-2.5 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-teal-500 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
          </div>

          {/* All school adds */}
          <div className="text-left bg-teal-50 rounded-xl p-5 mb-8 border border-teal-100">
            <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3">
              Everything else in Professional
            </p>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
              {SCHOOL_ADDS.map(f => (
                <div key={f} className="flex items-center gap-1.5 text-xs text-teal-700">
                  <Check className="w-3 h-3 shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate('/pricing')}
            className="flex w-full items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition-colors"
          >
            Upgrade to Professional
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-slate-400 mt-3">
            14-day free trial available · Cancel anytime
          </p>
        </div>

        {/* Price reminder */}
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-400">
            Professional from <span className="font-semibold text-slate-600">£399/month</span> or{' '}
            <span className="font-semibold text-slate-600">£3,995/year</span>
          </p>
        </div>
      </div>
    </div>
  );
}

