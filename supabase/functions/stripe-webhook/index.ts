import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'Student Signal', version: '1.0.0' },
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('No signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message);
    return new Response(`Signature verification failed: ${err.message}`, { status: 400 });
  }

  EdgeRuntime.waitUntil(handleEvent(event));
  return Response.json({ received: true });
});

async function handleEvent(event: Stripe.Event) {
  const obj = event?.data?.object as any;
  if (!obj) return;

  const customerId: string | null =
    typeof obj.customer === 'string' ? obj.customer : null;

  if (!customerId) {
    console.warn(`No customer on event ${event.type}`);
    return;
  }

  if (event.type === 'payment_intent.succeeded' && obj.invoice === null) return;

  const isSubscription =
    event.type !== 'checkout.session.completed' || obj.mode === 'subscription';

  if (isSubscription) {
    await syncCustomerFromStripe(customerId);
  } else if (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') {
    const { error } = await supabase.from('stripe_orders').insert({
      checkout_session_id: obj.id,
      payment_intent_id: obj.payment_intent,
      customer_id: customerId,
      amount_subtotal: obj.amount_subtotal,
      amount_total: obj.amount_total,
      currency: obj.currency,
      payment_status: obj.payment_status,
      status: 'completed',
    });
    if (error) console.error('Error inserting order:', error);
  }
}

async function syncCustomerFromStripe(customerId: string) {
  try {
    // ── 1. Sync stripe_subscriptions (Bolt template table) ───────────────────
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      await supabase.from('stripe_subscriptions').upsert(
        { customer_id: customerId, status: 'not_started' },
        { onConflict: 'customer_id' },
      );
      return;
    }

    const sub = subscriptions.data[0];

    await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: customerId,
        subscription_id: sub.id,
        price_id: sub.items.data[0].price.id,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: sub.cancel_at_period_end,
        ...(sub.default_payment_method && typeof sub.default_payment_method !== 'string'
          ? {
              payment_method_brand: sub.default_payment_method.card?.brand ?? null,
              payment_method_last4: sub.default_payment_method.card?.last4 ?? null,
            }
          : {}),
        status: sub.status,
      },
      { onConflict: 'customer_id' },
    );

    // ── 2. Sync Student Signal subscriptions table ────────────────────────────
    const statusMap: Record<string, string> = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      canceled: 'cancelled',
      unpaid: 'unpaid',
      incomplete: 'incomplete',
      incomplete_expired: 'incomplete_expired',
      paused: 'cancelled',
    };
    const mappedStatus = statusMap[sub.status] ?? sub.status;
    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    const { data: customerRow } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', customerId)
      .maybeSingle();

    if (!customerRow?.user_id) {
      console.warn(`No user mapping for customer ${customerId}`);
      return;
    }

    const priceId = sub.items.data[0].price.id;
    let planName: string | null = null;
    const starterMonthly = Deno.env.get('STRIPE_STARTER_MONTHLY_PRICE_ID');
    const starterYearly  = Deno.env.get('STRIPE_STARTER_YEARLY_PRICE_ID');
    const schoolMonthly  = Deno.env.get('STRIPE_SCHOOL_MONTHLY_PRICE_ID');
    const schoolYearly   = Deno.env.get('STRIPE_SCHOOL_YEARLY_PRICE_ID');

    if (priceId === starterMonthly || priceId === starterYearly) planName = 'starter';
    else if (priceId === schoolMonthly || priceId === schoolYearly) planName = 'school';

    if (!planName) {
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('plan_name')
        .eq('user_id', customerRow.user_id)
        .maybeSingle();
      planName = existing?.plan_name ?? 'starter';
    }

    await supabase.from('subscriptions').upsert(
      {
        user_id: customerRow.user_id,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        plan_name: planName,
        status: mappedStatus,
        current_period_end: periodEnd,
      },
      { onConflict: 'user_id' },
    );

    console.info(`Synced subscription for user ${customerRow.user_id}: ${mappedStatus}`);
  } catch (err) {
    console.error(`Failed to sync customer ${customerId}:`, err);
    throw err;
  }
}

