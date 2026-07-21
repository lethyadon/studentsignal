import React from 'react';
import { Sparkles } from 'lucide-react';
import { useSubscription } from '../../hooks/useSubscription';

interface SubscriptionBadgeProps {
  className?: string;
}

export function SubscriptionBadge({ className = '' }: SubscriptionBadgeProps) {
  const { loading, isActive, product } = useSubscription();

  if (loading || !isActive || !product) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-200 ${className}`}
    >
      <Sparkles className="h-3 w-3" />
      {product.shortName}
      {product.interval === 'year' ? ' · Annual' : ''}
    </span>
  );
}
