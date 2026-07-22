import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { StatItem } from '@shared/types';
import { formatCompact, formatCurrency } from '@/lib/format';
import { getIcon } from '@/lib/icons';
import { BarChart3 } from 'lucide-react';

interface PaymentBarChartProps {
  data: StatItem[];
}

export default function PaymentBarChart({ data }: PaymentBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
        <BarChart3 size={36} className="text-slate-300" />
        <span className="text-sm">本月暂无支付方式数据</span>
      </div>
    );
  }

  const chartData = data.map((d) => ({ name: d.name, value: d.value, icon: d.icon }));

  return (
    <div className="space-y-4">
      <div className="h-56 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatCompact(v)}
              width={56}
            />
            <Tooltip
              cursor={{ fill: '#f8fafc' }}
              formatter={(v: number) => [formatCurrency(v), '支出']}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="url(#barFill)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 md:gap-x-6">
        {chartData.map((d) => {
          const Icon = getIcon(d.icon);
          return (
            <span key={d.name} className="inline-flex min-w-0 items-center gap-1.5">
              <Icon size={14} className="shrink-0 text-slate-400" />
              <span className="truncate">{d.name}</span>
              <span className="tnum font-medium text-slate-700">{formatCurrency(d.value)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
