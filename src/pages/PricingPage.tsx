import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Check, ChevronRight, Shield, Users, BarChart3, BookOpen,
  Phone, Star, ArrowLeft, X, Send, Building2, Zap,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface Plan {
  id: 'starter' | 'school' | 'trust';
  name: string;
  icon: React.ReactNode;
  tagline: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  monthlyPriceId: string;
  yearlyPriceId: string;
  features: string[];
  highlighted: boolean;
  cta: string;
  badge?: string;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    icon: <Zap className="w-5 h-5" />,
    tagline: 'For single schools getting started with pastoral intelligence',
    monthlyPrice: 199,
    yearlyPrice: 1995,
    monthlyPriceId: import.meta.env.VITE_STRIPE_STARTER_MONTHLY_PRICE_ID || '',
    yearlyPriceId: import.meta.env.VITE_STRIPE_STARTER_YEARLY_PRICE_ID || '',
    features: [
      'Up to 500 students',
      'Signal queue & risk scoring',
      'Pastoral interventions tracker',
      'Communication log',
      'Basic reporting & exports',
      'Email support',
    ],
    highlighted: false,
    cta: 'Start with Starter',
  },
  {
    id: 'school',
    name: 'School',
    icon: <BookOpen className="w-5 h-5" />,
    tagline: 'For schools that want the full pastoral picture',
    monthlyPrice: 399,
    yearlyPrice: 3995,
    monthlyPriceId: import.meta.env.VITE_STRIPE_SCHOOL_MONTHLY_PRICE_ID || '',
    yearlyPriceId: import.meta.env.VITE_STRIPE_SCHOOL_YEARLY_PRICE_ID || '',
    features: [
      'Unlimited students',
      'Everything in Starter',
      'SEND & safeguarding tools',
      'Careers destination tracking',
      'Staff development insights',
      'MIS integrations (Arbor, SIMS, Bromcom)',
      'Advanced analytics & PDF reports',
      'Priority support',
    ],
    highlighted: true,
    cta: 'Start with School',
    badge: 'Most popular',
  },
  {
    id: 'trust',
    name: 'Trust / MAT',
    icon: <Building2 className="w-5 h-5" />,
    tagline: 'Cross-school visibility for multi-academy trusts',
    monthlyPrice: null,
    yearlyPrice: null,
    monthlyPriceId: '',
    yearlyPriceId: '',
    features: [
      'Multiple schools',
      'Everything in School',
      'Trust-wide dashboards',
      'Cross-school benchmarking',
      'Dedicated onboarding & training',
      'SLA-backed support',
      'Custom contracts',
    ],
    highlighted: false,
    cta: 'Contact sales',
  },
];

export default function PricingPage() {
  const { user, demoMode } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [salesName, setSalesName] = useState('');
  const [salesEmail, setSalesEmail] = useState('');
  const [salesSchool, setSalesSchool] = useState('');
  const [salesMessage, setSalesMessage] = useState('');
  const [salesSent, setSalesSent] = useState(false);

  async function handleCheckout(plan: Plan) {
    if (plan.id === 'trust') { setShowSalesModal(true); return; }
    if (!user && !demoMode) { navigate('/auth?redirect=/pricing'); return; }

    const priceId = billing === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
    if (!priceId) {
      setError('Price not configured. Please contact support.');
      return;
    }

    setLoadingPlan(plan.id);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { navigate('/auth?redirect=/pricing'); return; }

      const origin = window.location.origin;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          price_id: priceId,
          plan_name: plan.id,
          success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/pricing`,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to create checkout session');
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoadingPlan(null);
    }
  }

  function handleSalesSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalesSent(true);
  }

  const annualSaving = (plan: Plan) => {
    if (!plan.monthlyPrice || !plan.yearlyPrice) return 0;
    return plan.monthlyPrice * 12 - plan.yearlyPrice;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">Student Signal</span>
          </div>
          {!user && !demoMode && (
            <button onClick={() => navigate('/auth')} className="text-sm font-semibold text-teal-700 hover:text-teal-900">
              Sign in
            </button>
          )}
          {(user || demoMode) && (
            <button onClick={() => navigate('/dashboard')} className="text-sm font-semibold text-teal-700 hover:text-teal-900">
              Dashboard
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-bold px-3 py-1.5 rounded-full border border-teal-200 mb-4">
            <Star className="w-3.5 h-3.5" />
            Trusted by schools across England
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            One platform. Every student. Full pastoral intelligence from first signal to positive outcome.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billing === 'monthly' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${billing === 'yearly' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Annual
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${billing === 'yearly' ? 'bg-teal-400 text-slate-900' : 'bg-teal-100 text-teal-700'}`}>
                Best value
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="max-w-lg mx-auto mb-6 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            <X className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map(plan => {
            const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
            const saving = annualSaving(plan);
            const isLoading = loadingPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border transition-all ${
                  plan.highlighted
                    ? 'bg-slate-900 border-slate-800 shadow-2xl shadow-slate-900/20 scale-[1.02]'
                    : 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-teal-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest shadow">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="p-7 flex-1">
                  {/* Plan header */}
                  <div className={`flex items-center gap-2.5 mb-4 ${plan.highlighted ? 'text-white' : 'text-slate-800'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${plan.highlighted ? 'bg-teal-500' : 'bg-teal-50 text-teal-600'}`}>
                      {plan.icon}
                    </div>
                    <span className="font-bold text-lg">{plan.name}</span>
                  </div>

                  <p className={`text-sm leading-relaxed mb-6 ${plan.highlighted ? 'text-slate-400' : 'text-slate-500'}`}>
                    {plan.tagline}
                  </p>

                  {/* Price */}
                  {price !== null ? (
                    <div className="mb-1">
                      <div className="flex items-end gap-1">
                        <span className={`text-4xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                          £{price.toLocaleString()}
                        </span>
                        <span className={`text-sm pb-1.5 ${plan.highlighted ? 'text-slate-400' : 'text-slate-400'}`}>
                          /{billing === 'yearly' ? 'year' : 'month'}
                        </span>
                      </div>
                      {billing === 'yearly' && saving > 0 && (
                        <p className={`text-xs font-semibold mt-0.5 ${plan.highlighted ? 'text-teal-400' : 'text-teal-600'}`}>
                          Save £{saving} vs monthly
                        </p>
                      )}
                      {billing === 'monthly' && (
                        <p className={`text-xs mt-0.5 ${plan.highlighted ? 'text-slate-500' : 'text-slate-400'}`}>
                          £{plan.yearlyPrice?.toLocaleString()}/yr billed annually
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mb-1">
                      <span className={`text-2xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                        Custom pricing
                      </span>
                      <p className={`text-xs mt-1 ${plan.highlighted ? 'text-slate-500' : 'text-slate-400'}`}>
                        Tailored to your trust size
                      </p>
                    </div>
                  )}

                  {/* Features */}
                  <ul className="mt-7 space-y-3">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check className={`w-4 h-4 shrink-0 mt-0.5 ${plan.highlighted ? 'text-teal-400' : 'text-teal-500'}`} />
                        <span className={`text-sm ${plan.highlighted ? 'text-slate-300' : 'text-slate-600'}`}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <div className="px-7 pb-7">
                  <button
                    onClick={() => handleCheckout(plan)}
                    disabled={isLoading}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${
                      plan.highlighted
                        ? 'bg-teal-500 hover:bg-teal-400 text-white shadow-lg shadow-teal-500/25'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isLoading ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : null}
                    {isLoading ? 'Redirecting...' : plan.cta}
                    {!isLoading && <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust signals */}
        <div className="mt-14 grid sm:grid-cols-3 gap-6 text-center">
          {[
            { icon: <Shield className="w-5 h-5 text-teal-600" />, title: 'GDPR compliant', desc: 'UK data residency, DPA 2018 compliant, no data sharing with third parties' },
            { icon: <Users className="w-5 h-5 text-teal-600" />, title: 'Secure by design', desc: 'Role-based access, audit logging, and data encrypted at rest and in transit' },
            { icon: <BarChart3 className="w-5 h-5 text-teal-600" />, title: '30-day free trial', desc: 'Full access for 30 days. No credit card required to start your trial' },
          ].map(item => (
            <div key={item.title} className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                {item.icon}
              </div>
              <div className="text-sm font-bold text-slate-800 mb-1">{item.title}</div>
              <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Contact Sales Modal */}
      {showSalesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Contact sales</h2>
                <p className="text-sm text-slate-500 mt-0.5">Tell us about your trust and we'll be in touch</p>
              </div>
              <button onClick={() => { setShowSalesModal(false); setSalesSent(false); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {salesSent ? (
              <div className="px-6 py-10 text-center">
                <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-teal-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Message sent</h3>
                <p className="text-sm text-slate-500">We'll be in touch within one business day to discuss your requirements.</p>
                <button onClick={() => { setShowSalesModal(false); setSalesSent(false); }} className="mt-6 text-sm font-semibold text-teal-700 hover:text-teal-900">
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSalesSubmit} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Your name</label>
                  <input value={salesName} onChange={e => setSalesName(e.target.value)} required placeholder="e.g. Sarah Clarke" className="input-premium w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Work email</label>
                  <input type="email" value={salesEmail} onChange={e => setSalesEmail(e.target.value)} required placeholder="you@school.org.uk" className="input-premium w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Trust / MAT name</label>
                  <input value={salesSchool} onChange={e => setSalesSchool(e.target.value)} required placeholder="e.g. Greenfield MAT" className="input-premium w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">How can we help?</label>
                  <textarea value={salesMessage} onChange={e => setSalesMessage(e.target.value)} rows={3} placeholder="Tell us about your schools and what you're looking for..." className="input-premium w-full resize-none" />
                </div>
                <button type="submit" className="w-full flex items-center justify-center gap-2 btn-primary py-3">
                  <Send className="w-4 h-4" />
                  Send message
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

