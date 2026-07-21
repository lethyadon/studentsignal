import React from 'react';
import { Check, Loader2, Shield, TrendingUp, Zap, Star } from 'lucide-react';
import type { StripeProduct } from '../../stripe-config';

interface PricingCardProps {
  product: StripeProduct;
  isCurrentPlan?: boolean;
  isLoading?: boolean;
  onGetStarted: (priceId: string) => void;
}

const TIER_STYLES = {
  starter: {
    iconBg: 'bg-teal-600',
    nameColor: 'text-teal-700',
    border: 'border-teal-200',
    accent: 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-500',
    checkColor: 'text-teal-600',
    headerBg: 'bg-teal-600',
    Icon: Shield,
  },
  schools: {
    iconBg: 'bg-slate-800',
    nameColor: 'text-slate-900',
    border: 'border-slate-800',
    accent: 'bg-slate-800 hover:bg-slate-900 focus:ring-slate-700',
    checkColor: 'text-emerald-600',
    headerBg: 'bg-slate-800',
    Icon: TrendingUp,
  },
};

export function PricingCard({
  product,
  isCurrentPlan = false,
  isLoading = false,
  onGetStarted,
}: PricingCardProps) {
  const styles = TIER_STYLES[product.tier];
  const Icon = styles.Icon;

  const priceDisplay =
    product.interval === 'year'
      ? `£${product.price.toLocaleString('en-GB')}`
      : `£${product.price.toLocaleString('en-GB')}`;

  const intervalLabel = product.interval === 'year' ? '/ year' : '/ month';
  const billingLabel  = product.interval === 'year' ? 'Billed annually' : 'Billed monthly';

  return (
    <div className={`relative flex flex-col rounded-2xl border-2 bg-white shadow-sm transition-shadow hover:shadow-md ${styles.border}`}>
      {/* Most Popular badge */}
      {product.popular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-white text-xs font-bold shadow-sm">
            <Star className="h-3 w-3 fill-current" />
            Most Popular
          </span>
        </div>
      )}
      {/* Trial badge for non-popular */}
      {!product.popular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-600 text-white text-xs font-bold shadow-sm">
            <Zap className="h-3 w-3" />
            14-day free trial
          </span>
        </div>
      )}

      {/* Header */}
      <div className="p-8 pb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.iconBg} shadow-sm`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className={`text-xl font-bold ${styles.nameColor}`}>{product.shortName}</h3>
            <p className="mt-0.5 text-sm leading-snug text-slate-500">{product.tagline}</p>
          </div>
        </div>

        {/* Price */}
        <div className="mb-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-bold tracking-tight text-slate-900">{priceDisplay}</span>
            <span className="text-base font-medium text-slate-400">{intervalLabel}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{billingLabel}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{product.valueComparison}</p>
          <p className="mt-1 text-xs text-teal-600 font-semibold">No charge for 14 days · Cancel anytime</p>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-slate-100" />

        {/* Features */}
        <ul className="mb-8 flex-1 space-y-2.5">
          {product.features.map((feature) => {
            const isSectionHeader = feature.endsWith(', plus:') || feature.endsWith(', plus');
            if (isSectionHeader) {
              return (
                <li key={feature} className="pt-1 pb-0.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{feature}</span>
                </li>
              );
            }
            return (
              <li key={feature} className="flex items-center gap-3">
                <Check className={`h-4 w-4 shrink-0 ${styles.checkColor}`} />
                <span className="text-sm text-slate-700">{feature}</span>
              </li>
            );
          })}
        </ul>

        {/* CTA */}
        {isCurrentPlan ? (
          <div className="flex items-center justify-center rounded-xl bg-slate-100 px-6 py-3.5 text-sm font-semibold text-slate-500">
            Current Plan
          </div>
        ) : (
          <button
            onClick={() => onGetStarted(product.priceId)}
            disabled={isLoading}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${styles.accent}`}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting to checkout…
              </>
            ) : (
              'Start 14-day free trial'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

