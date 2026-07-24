import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}

/** 空状态占位（与 Dashboard/Transactions 视觉一致） */
export default function EmptyState({ icon: Icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon size={22} />
      </span>
      <div>
        <p className="text-sm font-medium text-slate-600">{title}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
