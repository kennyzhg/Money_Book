import { getIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface CategoryIconProps {
  icon: string;
  tone?: 'income' | 'expense' | 'slate';
  size?: number;
  className?: string;
}

const toneMap = {
  income: 'bg-emerald-50 text-emerald-600',
  expense: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-100 text-slate-500',
} as const;

export default function CategoryIcon({
  icon,
  tone = 'slate',
  size = 16,
  className,
}: CategoryIconProps) {
  const Icon = getIcon(icon);
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        toneMap[tone],
        className,
      )}
    >
      <Icon size={size} />
    </span>
  );
}
