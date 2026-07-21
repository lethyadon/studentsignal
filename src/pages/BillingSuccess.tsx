import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, AlertCircle, ArrowRight, Shield } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';

export default function BillingSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { isSubscribed, subscriptionLoading, refetch } = useSubscription();
  const { user } = useAuth();

  const [pollCount, setPollCount] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const MAX_POLLS = 10;

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }

    if (isSubscribed) {
      const t = setTimeout(() => navigate('/dashboard'), 2000);
      return () => clearTimeout(t);
    }

    if (pollCount >= MAX_POLLS) {
      setTimedOut(true);
      return;
    }

    if (!subscriptionLoading) {
      const t = setTimeout(() => {
        refetch();
        setPollCount(c => c + 1);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [isSubscribed, subscriptionLoading, pollCount, user, navigate, refetch]);

  if (isSubscribed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-10 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Payment successful</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Your subscription is now active. Redirecting you to the dashboard&hellip;
          </p>
          <button onClick={() => navigate('/dashboard')} className="w-full btn-primary py-3 flex items-center justify-center gap-2">
            Go to dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-10 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-9 h-9 text-amber-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Almost there</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Your payment was received. It can take a moment for your subscription to activate. Try accessing the dashboard — if you still see this page, please refresh in a minute.
          </p>
          {sessionId && (
            <p className="text-xs text-slate-400 mb-5">Session: {sessionId.slice(0, 24)}…</p>
          )}
          <button onClick={() => navigate('/dashboard')} className="w-full btn-primary py-3 flex items-center justify-center gap-2 mb-3">
            Try dashboard <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={() => { setTimedOut(false); setPollCount(0); refetch(); }} className="text-sm text-teal-700 hover:text-teal-900 font-semibold">
            Check again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-10 text-center">
        <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <Shield className="w-8 h-8 text-teal-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Activating your subscription</h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          Payment received. We're confirming your subscription — this only takes a moment.
        </p>
        <div className="flex items-center justify-center gap-3 text-teal-700">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold">Confirming payment&hellip;</span>
        </div>
        <div className="mt-6 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-1000"
            style={{ width: `${Math.min(100, (pollCount / MAX_POLLS) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

