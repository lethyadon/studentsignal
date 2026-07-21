import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getProductByPriceId, StripeProduct } from '../stripe-config';

export interface SubscriptionState {
  loading: boolean;
  isActive: boolean;
  status: string | null;
  priceId: string | null;
  product: StripeProduct | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}

const DEFAULT_STATE: SubscriptionState = {
  loading: true,
  isActive: false,
  status: null,
  priceId: null,
  product: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
};

const ACTIVE_STATUSES = ['active', 'trialing'];

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);

  useEffect(() => {
    let cancelled = false;

    async function fetchSubscription() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setState({ ...DEFAULT_STATE, loading: false });
        return;
      }

      const { data, error } = await supabase
        .from('stripe_user_subscriptions')
        .select('*')
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setState({ ...DEFAULT_STATE, loading: false });
        return;
      }

      const status = data.subscription_status ?? null;
      const priceId = data.price_id ?? null;
      const product = priceId ? (getProductByPriceId(priceId) ?? null) : null;
      const periodEnd = data.current_period_end
        ? new Date(data.current_period_end * 1000)
        : null;

      setState({
        loading: false,
        isActive: ACTIVE_STATUSES.includes(status ?? ''),
        status,
        priceId,
        product,
        cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
        currentPeriodEnd: periodEnd,
      });
    }

    fetchSubscription();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      setState(DEFAULT_STATE);
      fetchSubscription();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}
