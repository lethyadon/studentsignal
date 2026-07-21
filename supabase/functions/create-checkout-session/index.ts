import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: { name: 'Student Signal', version: '1.0.0' },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { price_id, plan_name, success_url, cancel_url } = await req.json();
    if (!price_id || !plan_name || !success_url || !cancel_url) {
      return json({ error: 'Missing required fields: price_id, plan_name, success_url, cancel_url' }, 400);
    }
    if (!['starter', 'school'].includes(plan_name)) {
      return json({ error: 'plan_name must be starter or school' }, 400);
    }

    // Get school_id from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', user.id)
      .maybeSingle();
    const schoolId = profile?.school_id ?? null;

    // Get or create Stripe customer
    let customerId: string;
    const { data: existingCustomer } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingCustomer?.customer_id) {
      customerId = existingCustomer.customer_id;
    } else {
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      const { error: insertErr } = await supabase.from('stripe_customers').insert({
        user_id: user.id,
        customer_id: stripeCustomer.id,
      });
      if (insertErr) {
        await stripe.customers.del(stripeCustomer.id).catch(() => {});
        return json({ error: 'Failed to save customer mapping' }, 500);
      }
      customerId = stripeCustomer.id;
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: price_id, quantity: 1 }],
      mode: 'subscription',
      subscription_data: { trial_period_days: 14 },
      success_url,
      cancel_url,
      metadata: { userId: user.id, plan_name },
    });

    // Upsert pending subscription record
    await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        school_id: schoolId,
        stripe_customer_id: customerId,
        stripe_subscription_id: null,
        plan_name,
        status: 'pending',
      },
      { onConflict: 'user_id' },
    );

    return json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('create-checkout-session error:', err.message);
    return json({ error: err.message }, 500);
  }
});

