import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';

interface SummaryCardProps {
  label: string;
  amount: number;
  icon: LucideIcon;
  tone?: 'blue' | 'emerald' | 'rose';
  hint?: string;
}

const toneMap = {
  blue: {
    iconWrap: 'bg-blue-50 text-blue-600',
    amount: 'text-blue-700',
    ring: 'ring-blue-100',
  },
  emerald: {
    iconWrap: 'bg-emerald-50 text-emerald-600',
    amount: 'text-emerald-700',
    ring: 'ring-emerald-100',
  },
  rose: {
    iconWrap: 'bg-rose-50 text-rose-600',
    amount: 'text-rose-700',
    ring: 'ring-rose-100',
  },
} as const;

export default function SummaryCard({
  label,
  amount,
  icon: Icon,
  tone = 'blue',
  hint,
}: SummaryCardProps) {
  const t = toneMap[tone];
  return (
    <div
      className={cn(
        'animate-fade-in-up rounded-2xl bg-white p-4 shadow-sm ring-1 transition-shadow hover:shadow-md md:p-6',
        t.ring,
      )}
    >
      <div className="flex items-start justify-between">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl md:h-11 md:w-11',
            t.iconWrap,
          )}
        >
          <Icon size={18} className="md:size-[22px]" />
        </div>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      <p className="mt-3 text-xs text-slate-500 md:mt-4 md:text-sm">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tnum tracking-tight md:text-3xl',
          t.amount,
        )}
      >
        {formatCurrency(amount)}
      </p>
    </div>
  );
}
