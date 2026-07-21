export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  shortName: string;
  tier: 'starter' | 'schools';
  tagline: string;
  description: string;
  price: number;
  currencySymbol: string;
  currency: string;
  mode: 'subscription';
  interval: 'month' | 'year';
  features: string[];
  valueComparison: string;
  popular?: boolean;
}

export const STRIPE_PRODUCTS: StripeProduct[] = [
  {
    id: 'prod_Uq12ZrW0VxNPZS',
    priceId: 'price_1TqL0fAKhcMEN4QaIkgk4MQ0',
    name: 'Student Signal Essentials',
    shortName: 'Essentials',
    tier: 'starter',
    tagline: 'Perfect for small schools and pilot deployments.',
    description: 'Everything a pastoral team needs to act on their data from day one.',
    price: 199.0,
    currencySymbol: '£',
    currency: 'gbp',
    mode: 'subscription',
    interval: 'month',
    features: [
      'Morning Intelligence Briefing',
      'Signal Queue',
      'Student Risk Scoring',
      'AI Summaries (Basic)',
      'Student Actions',
      'Communications Log',
      'Reports & Exports',
      'CSV Import',
      'Up to 25 Staff Users',
      'Email Support',
    ],
    valueComparison: 'Around £6.60 per school day',
  },
  {
    id: 'prod_Uq13A4O1787Slm',
    priceId: 'price_1TqL1nAKhcMEN4QacLRLq5Nl',
    name: 'Student Signal Essentials - Annual',
    shortName: 'Essentials',
    tier: 'starter',
    tagline: 'Perfect for small schools and pilot deployments.',
    description: 'Everything a pastoral team needs to act on their data from day one.',
    price: 1995.0,
    currencySymbol: '£',
    currency: 'gbp',
    mode: 'subscription',
    interval: 'year',
    features: [
      'Morning Intelligence Briefing',
      'Signal Queue',
      'Student Risk Scoring',
      'AI Summaries (Basic)',
      'Student Actions',
      'Communications Log',
      'Reports & Exports',
      'CSV Import',
      'Up to 25 Staff Users',
      'Email Support',
    ],
    valueComparison: '≈ £166/month · less than £6 per school day',
  },
  {
    id: 'prod_Uq15GdyWL8kdvM',
    priceId: 'price_1TqL2yAKhcMEN4Qa3Db0bB52',
    name: 'Student Signal Professional',
    shortName: 'Professional',
    tier: 'schools',
    tagline: 'The complete leadership platform for schools that want to lead.',
    description: 'Every feature, unlimited scale — built for schools that demand more.',
    price: 399.0,
    currencySymbol: '£',
    currency: 'gbp',
    mode: 'subscription',
    interval: 'month',
    popular: true,
    features: [
      'Everything in Essentials, plus:',
      'Unlimited Staff & Students',
      'Role-Based Dashboards',
      'Staff Insights',
      'Careers Intelligence',
      'Success Monitoring',
      'API Integrations',
      'Priority Support',
      'Early Access Features',
      'Advanced Analytics',
      'Multi-year Trend Analysis',
      'Custom Reports',
      'Whole-school Intelligence Dashboard',
    ],
    valueComparison: 'Less than 2 days\' supply teacher cover per month',
  },
  {
    id: 'prod_Uq15RSw7cNOb2z',
    priceId: 'price_1TqL3hAKhcMEN4Qazb2dafqz',
    name: 'Student Signal Professional - Annual',
    shortName: 'Professional',
    tier: 'schools',
    tagline: 'The complete leadership platform for schools that want to lead.',
    description: 'Every feature, unlimited scale — built for schools that demand more.',
    price: 3995.0,
    currencySymbol: '£',
    currency: 'gbp',
    mode: 'subscription',
    interval: 'year',
    popular: true,
    features: [
      'Everything in Essentials, plus:',
      'Unlimited Staff & Students',
      'Role-Based Dashboards',
      'Staff Insights',
      'Careers Intelligence',
      'Success Monitoring',
      'API Integrations',
      'Priority Support',
      'Early Access Features',
      'Advanced Analytics',
      'Multi-year Trend Analysis',
      'Custom Reports',
      'Whole-school Intelligence Dashboard',
    ],
    valueComparison: '≈ £333/month · less than 2 days\' supply cover',
  },
];

export function getProductByPriceId(priceId: string): StripeProduct | undefined {
  return STRIPE_PRODUCTS.find((p) => p.priceId === priceId);
}

export function getProductByTierAndInterval(
  tier: 'starter' | 'schools',
  interval: 'month' | 'year'
): StripeProduct | undefined {
  return STRIPE_PRODUCTS.find((p) => p.tier === tier && p.interval === interval);
}

