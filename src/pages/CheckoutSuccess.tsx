import React, { useEffect, useState } from 'react';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '../hooks/useSubscription';

export function CheckoutSuccess() {
  const navigate = useNavigate();
  const { loading, isActive, product } = useSubscription();
  const [secondsLeft, setSecondsLeft] = useState(8);

  // Poll until subscription activates (webhook may be slightly delayed)
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!loading && !isActive && attempts < 6) {
      const timer = setTimeout(() => setAttempts((a) => a + 1), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, isActive, attempts]);

  // Countdown auto-redirect
  useEffect(() => {
    if (loading || (!isActive && attempts < 6)) return;
    if (secondsLeft <= 0) {
      navigate('/dashboard');
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [loading, isActive, attempts, secondsLeft, navigate]);

  const stillPolling = !loading && !isActive && attempts < 6;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-emerald-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-100 bg-white p-10 shadow-xl text-center">
          {stillPolling ? (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Confirming your subscription…</h1>
              <p className="mt-3 text-sm text-gray-500">
                Your payment was received. We're activating your plan — this takes just a moment.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle className="h-9 w-9 text-emerald-500" />
              </div>

              <h1 className="text-2xl font-bold text-gray-900">You're all set!</h1>

              {product && (
                <div className="mt-4 inline-flex items-center rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {product.name}
                </div>
              )}

              <p className="mt-4 text-sm leading-relaxed text-gray-500">
                {product
                  ? product.description
                  : 'Your subscription is now active. Head to your dashboard to get started.'}
              </p>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="text-xs text-gray-400">
                  Redirecting automatically in {secondsLeft}s…
                </p>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          A receipt has been sent to your email address by Stripe.
        </p>
      </div>
    </div>
  );
}
