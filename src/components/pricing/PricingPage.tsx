import React, { useState } from 'react';
import { ShieldCheck, Zap, ArrowRight, Check, X, Building2 } from 'lucide-react';
import { PricingToggle } from './PricingToggle';
import { PricingCard } from './PricingCard';
import { SignUpModal } from './SignUpModal';
import { getProductByTierAndInterval } from '../../stripe-config';
import { useSubscription } from '../../hooks/useSubscription';
import { useAuth } from '../../context/AuthContext';
import { createCheckoutSession } from '../../services/stripe';

const COMPARISON = [
  {
    without: 'Review CPOMS, ClassCharts and attendance separately each morning',
    with: 'One Morning Intelligence Briefing — ranked before the bell',
  },
  {
    without: 'Search multiple systems to build a picture of a student',
    with: 'One student profile — behaviour, attendance, welfare, actions in one place',
  },
  {
    without: 'Manually try to spot patterns across spreadsheets',
    with: 'Signal Queue identifies concerns automatically and prioritises them for you',
  },
  {
    without: 'Spend an hour building SLT briefing packs',
    with: 'Reports generated in minutes — ready to share',
  },
  {
    without: 'Only find out students are struggling when parents ring',
    with: 'Students already identified, prioritised and assigned before you ask',
  },
  {
    without: 'Chase actions across emails, sticky notes and spreadsheets',
    with: 'Central action management — assigned, tracked and reviewed in one place',
  },
  {
    without: 'EHCP reviews tracked in a highlighted spreadsheet cell',
    with: 'Upcoming reviews surfaced automatically — no near-misses',
  },
];

const TRUST_FEATURES = [
  'Everything in Professional',
  'Multi-school visibility',
  'Trust-wide analytics dashboard',
  'Dedicated account manager',
  'Custom data integrations',
  'On-site onboarding & training',
  'SLA-backed support',
  'Annual review & roadmap input',
];

export function PricingPage() {
  const [interval, setInterval] = useState<'month' | 'year'>('year');
  const { product: currentProduct } = useSubscription();
  const { user } = useAuth();

  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [pendingPriceId, setPendingPriceId] = useState<string | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const essentialsProduct  = getProductByTierAndInterval('starter', interval);
  const professionalProduct = getProductByTierAndInterval('schools', interval);

  async function proceedToCheckout(priceId: string) {
    setCheckoutError(null);
    setLoadingPriceId(priceId);
    try {
      const url = await createCheckoutSession(priceId);
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoadingPriceId(null);
    }
  }

  function handleGetStarted(priceId: string) {
    if (user) {
      proceedToCheckout(priceId);
    } else {
      setPendingPriceId(priceId);
      setShowSignUp(true);
    }
  }

  async function handleSignedUp() {
    setShowSignUp(false);
    if (pendingPriceId) {
      await proceedToCheckout(pendingPriceId);
      setPendingPriceId(null);
    }
  }

  const pendingProduct = pendingPriceId
    ? (essentialsProduct?.priceId === pendingPriceId ? essentialsProduct : professionalProduct)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-100">
            <Zap className="h-3 w-3" />
            UK schools · GDPR compliant · No lock-in
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Straightforward pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-500">
            Start free for 14 days — no charge until your trial ends. Every plan includes onboarding support and school invoicing on request.
          </p>
        </div>

        {/* Toggle */}
        <div className="mb-10 flex justify-center">
          <PricingToggle interval={interval} onChange={setInterval} />
        </div>

        {/* Error */}
        {checkoutError && (
          <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 text-center">
            {checkoutError}
          </div>
        )}

        {/* Cards — 3 column grid */}
        <div className="grid gap-6 md:grid-cols-3 items-start">
          {/* Essentials */}
          {essentialsProduct && (
            <PricingCard
              product={essentialsProduct}
              isCurrentPlan={currentProduct?.priceId === essentialsProduct.priceId}
              isLoading={loadingPriceId === essentialsProduct.priceId}
              onGetStarted={handleGetStarted}
            />
          )}
          {/* Professional */}
          {professionalProduct && (
            <PricingCard
              product={professionalProduct}
              isCurrentPlan={currentProduct?.priceId === professionalProduct.priceId}
              isLoading={loadingPriceId === professionalProduct.priceId}
              onGetStarted={handleGetStarted}
            />
          )}
          {/* Trust — contact us */}
          <div className="relative flex flex-col rounded-2xl border-2 border-slate-200 bg-slate-50 shadow-sm">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500 text-white text-xs font-bold shadow-sm">
                <Building2 className="h-3 w-3" />
                Multi-school
              </span>
            </div>
            <div className="p-8 pb-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-600 shadow-sm">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-700">Trust</h3>
                  <p className="mt-0.5 text-sm leading-snug text-slate-500">For multi-academy trusts and federations.</p>
                </div>
              </div>
              <div className="mb-6">
                <p className="text-3xl font-bold text-slate-700">Custom</p>
                <p className="text-xs text-slate-400 mt-1">Pricing based on number of schools</p>
                <p className="text-xs text-slate-400 mt-1">Consolidated invoicing available</p>
              </div>
              <div className="my-6 border-t border-slate-200" />
              <ul className="mb-8 space-y-2.5">
                {TRUST_FEATURES.map((f, i) => (
                  <li key={f} className="flex items-center gap-3">
                    <Check className={`h-4 w-4 shrink-0 ${i === 0 ? 'text-slate-400' : 'text-slate-500'}`} />
                    <span className={`text-sm ${i === 0 ? 'text-slate-500 font-medium' : 'text-slate-600'}`}>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="mailto:hello@studentsignal.co.uk?subject=Trust%20Enquiry"
                className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white bg-slate-600 hover:bg-slate-700 transition-colors"
              >
                Contact us
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Implementation support */}
        <div className="mt-8 flex items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <Zap className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">One-time implementation support available</span>
            {' '}— £750 one-off. We help configure your first upload and onboard your team.
          </span>
        </div>

        {/* ── Why schools choose Student Signal ─────────────────────────────── */}
        <div className="mt-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Why schools choose Student Signal</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">The same pastoral workload. A completely different morning.</p>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-2 gap-0 rounded-t-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-800 px-6 py-4">
              <p className="text-sm font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2">
                <X className="w-4 h-4 text-red-400" />
                Without Student Signal
              </p>
            </div>
            <div className="bg-teal-600 px-6 py-4">
              <p className="text-sm font-bold text-teal-100 uppercase tracking-wide flex items-center gap-2">
                <Check className="w-4 h-4 text-white" />
                With Student Signal
              </p>
            </div>
          </div>

          {/* Rows */}
          <div className="border border-t-0 border-slate-200 rounded-b-2xl overflow-hidden divide-y divide-slate-100">
            {COMPARISON.map(({ without, with: withText }, i) => (
              <div key={i} className="grid grid-cols-2 gap-0">
                <div className="px-6 py-4 bg-slate-50">
                  <p className="text-sm text-slate-600 leading-relaxed">{without}</p>
                </div>
                <div className="px-6 py-4 bg-teal-50/40">
                  <p className="text-sm text-teal-800 font-medium leading-relaxed">{withText}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trust footer */}
        <div className="mt-10 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <ShieldCheck className="h-4 w-4" />
            Secure payments via Stripe · All prices in GBP · School invoices available on request
          </div>
          <p className="text-xs text-slate-400">Cancel anytime. No hidden fees. UK data residency.</p>
        </div>
      </div>

      {/* Sign-up modal */}
      {showSignUp && pendingProduct && (
        <SignUpModal
          planName={`${pendingProduct.shortName} ${pendingProduct.interval === 'year' ? 'Annual' : 'Monthly'}`}
          onSuccess={handleSignedUp}
          onCancel={() => { setShowSignUp(false); setPendingPriceId(null); }}
        />
      )}
    </div>
  );
}

