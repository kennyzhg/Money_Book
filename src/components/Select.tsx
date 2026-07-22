import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  leadingIcon?: ReactNode;
  placeholder?: string;
  className?: string;
}

export default function Select({
  value,
  onChange,
  children,
  leadingIcon,
  placeholder,
  className,
}: SelectProps) {
  return (
    <div
      className={cn(
        'flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100',
        className,
      )}
    >
      {leadingIcon && <span className="text-slate-400">{leadingIcon}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full cursor-pointer appearance-none bg-transparent text-slate-700 outline-none"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
    </div>
  );
}
