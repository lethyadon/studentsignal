import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useGodMode } from './GodModeContext';
import { supabase } from '../lib/supabase';
import { getProductByPriceId } from '../stripe-config';

interface StripeSubRow {
  subscription_id: string | null;
  subscription_status: string | null;
  price_id: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean | null;
}

interface SubscriptionContextValue {
  stripeRow: StripeSubRow | null;
  subscriptionLoading: boolean;
  isSubscribed: boolean;
  isRestricted: boolean;
  effectivePlanName: 'starter' | 'schools' | null;
  refetch: () => void;
}

const ACTIVE_STATUSES     = ['active', 'trialing'];
const RESTRICTED_STATUSES = ['cancelled', 'unpaid', 'past_due', 'incomplete_expired'];

const SubscriptionContext = createContext<SubscriptionContextValue>({
  stripeRow: null,
  subscriptionLoading: true,
  isSubscribed: false,
  isRestricted: false,
  effectivePlanName: null,
  refetch: () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, demoMode, isSuperAdmin } = useAuth();
  const { tierOverride } = useGodMode();
  const [stripeRow, setStripeRow] = useState<StripeSubRow | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (demoMode || isSuperAdmin) {
      setStripeRow(null);
      setSubscriptionLoading(false);
      return;
    }
    if (!user) {
      setStripeRow(null);
      setSubscriptionLoading(false);
      return;
    }
    setSubscriptionLoading(true);
    const { data, error } = await supabase
      .from('stripe_user_subscriptions')
      .select('subscription_id, subscription_status, price_id, current_period_end, cancel_at_period_end')
      .maybeSingle();
    if (error) console.error('Failed to fetch subscription:', error.message);
    setStripeRow((data as StripeSubRow | null) ?? null);
    setSubscriptionLoading(false);
  }, [user, demoMode, isSuperAdmin]);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);

  const status = stripeRow?.subscription_status ?? null;
  const priceId = stripeRow?.price_id ?? null;
  const product = priceId ? getProductByPriceId(priceId) : null;

  const isSubscribed = demoMode || isSuperAdmin || ACTIVE_STATUSES.includes(status ?? '');
  const isRestricted = !demoMode && !isSuperAdmin && !!stripeRow && RESTRICTED_STATUSES.includes(status ?? '');

  const effectivePlanName: 'starter' | 'schools' | null = (() => {
    if (isSuperAdmin && tierOverride) return tierOverride;
    if (product?.tier === 'starter') return 'starter';
    if (product?.tier === 'schools') return 'schools';
    return null;
  })();

  return (
    <SubscriptionContext.Provider value={{ stripeRow, subscriptionLoading, isSubscribed, isRestricted, effectivePlanName, refetch: fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

