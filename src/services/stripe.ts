import { supabase } from '../lib/supabase';
import { getProductByPriceId } from '../stripe-config';

export async function createCheckoutSession(priceId: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('You must be signed in to subscribe.');
  }

  const product = getProductByPriceId(priceId);
  // stripe-config uses 'schools' as tier; edge function expects 'starter' | 'school'
  const planName = product?.tier === 'schools' ? 'school' : 'starter';

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        price_id: priceId,
        plan_name: planName,
        success_url: `${window.location.origin}/checkout/success`,
        cancel_url: `${window.location.origin}/pricing`,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || 'Failed to create checkout session.');
  }

  const data = await response.json();

  if (!data.url) {
    throw new Error('No checkout URL returned.');
  }

  return data.url;
}

