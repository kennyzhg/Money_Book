import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Repeat, ShoppingBag, CreditCard } from 'lucide-react';
import type {
  Installment,
  InstallmentInput,
  FixedExpense,
  FixedExpenseInput,
  ShoppingPlan,
  ShoppingPlanInput,
  PlanPriority,
} from '@shared/types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import InstallmentCalculator from '@/components/planning/InstallmentCalculator';
import InstallmentFormModal from '@/components/planning/InstallmentFormModal';
import FixedExpenseFormModal from '@/components/planning/FixedExpenseFormModal';
import ShoppingPlanFormModal from '@/components/planning/ShoppingPlanFormModal';
import { useConfigStore } from '@/store/configStore';
import { formatCurrency, formatMonthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  fetchInstallments,
  createInstallment,
  updateInstallment,
  deleteInstallment,
  postInstallmentsMonthly,
} from '@/api/installments';
import {
  fetchFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
} from '@/api/fixedExpenses';
import {
  fetchShoppingPlans,
  createShoppingPlan,
  updateShoppingPlan,
  deleteShoppingPlan,
  markPlanPurchased,
} from '@/api/shoppingPlans';
import { currentMonth } from '@/lib/format';

type Tab = 'installments' | 'fixed' | 'plans';

export default function Planning() {
  const [tab, setTab] = useState<Tab>('installments');
  const { load: loadConfig } = useConfigStore();
  useEffect(() => {
    loadConfig().catch(() => undefined);
  }, [loadConfig]);

  return (
    <div>
      <PageHeader title="财务规划" subtitle="分期 · 固定支出 · 购物计划 —— 自动纳入每月预算" />

      <div className="mb-4 inline-flex w-full rounded-xl bg-slate-100 p-1 md:mb-6 md:w-auto">
        <TabButton active={tab === 'installments'} onClick={() => setTab('installments')} icon={<CreditCard size={15} />} label="分期计算器" />
        <TabButton active={tab === 'fixed'} onClick={() => setTab('fixed')} icon={<Repeat size={15} />} label="固定支出" />
        <TabButton active={tab === 'plans'} onClick={() => setTab('plans')} icon={<ShoppingBag size={15} />} label="购物计划" />
      </div>

      {tab === 'installments' && <InstallmentsTab />}
      {tab === 'fixed' && <FixedExpensesTab />}
      {tab === 'plans' && <ShoppingPlansTab />}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}
function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all md:flex-none',
        active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================
// 分期 Tab
// ============================================================
function InstallmentsTab() {
  const [list, setList] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Installment | null>(null);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setList(await fetchInstallments());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handlePost = async () => {
    setPosting(true);
    try {
      const r = await postInstallmentsMonthly(currentMonth());
      setToast(`已入账 ${r.inserted} 笔，跳过 ${r.skipped} 笔（已存在）`);
      setTimeout(() => setToast(null), 3500);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '入账失败');
    } finally {
      setPosting(false);
    }
  };

  const activeCount = list.filter((i) => i.status === 'active').length;

  return (
    <div className="space-y-4 md:space-y-6">
      <InstallmentCalculator />

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">分期记录</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              共 {list.length} 笔 · 进行中 {activeCount} 笔
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePost}
              disabled={posting || activeCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {posting ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
              本月自动入账
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus size={14} />
              新建分期
            </button>
          </div>
        </div>

        {toast && (
          <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{toast}</div>
        )}

        {loading ? (
          <div className="flex h-40 items-center justify-center text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={CreditCard} title="还没有分期记录" hint="新建一笔车贷/房贷/电子产品分期" />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((it) => (
              <InstallmentCard
                key={it.id}
                item={it}
                onEdit={() => {
                  setEditing(it);
                  setModalOpen(true);
                }}
                onDelete={async () => {
                  if (!window.confirm(`确定删除「${it.name}」？`)) return;
                  await deleteInstallment(it.id);
                  reload();
                }}
              />
            ))}
          </div>
        )}
      </div>

      <InstallmentFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={async (input) => {
          if (editing) await updateInstallment(editing.id, input);
          else await createInstallment(input);
          reload();
        }}
      />
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  car: '车贷',
  house: '房贷',
  electronics: '电子产品',
  other: '其他',
};
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-600',
  paid_off: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-rose-50 text-rose-600',
};
const STATUS_LABEL: Record<string, string> = {
  active: '进行中',
  paid_off: '已结清',
  cancelled: '已取消',
};

function InstallmentCard({
  item,
  onEdit,
  onDelete,
}: {
  item: Installment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-slate-900">{item.name}</h4>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_STYLE[item.status])}>
              {STATUS_LABEL[item.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {KIND_LABEL[item.kind]} · {item.method === 'equal_payment' ? '等额本息' : '等额本金'} · 起始 {formatMonthLabel(item.startMonth)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconBtn onClick={onEdit} title="编辑"><Pencil size={14} /></IconBtn>
          <IconBtn onClick={onDelete} title="删除" danger><Trash2 size={14} /></IconBtn>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Metric label="本金" value={formatCurrency(item.principal)} />
        <Metric label="每月" value={formatCurrency(item.monthlyPayment)} tone="blue" />
        <Metric label="总利息" value={formatCurrency(item.totalInterest)} tone="amber" />
      </div>
    </div>
  );
}

// ============================================================
// 固定支出 Tab
// ============================================================
function FixedExpensesTab() {
  const [list, setList] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setList(await fetchFixedExpenses());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const totalMonthly = list.filter((f) => f.enabled).reduce((s, f) => s + f.amount, 0);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">每月固定支出</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            共 {list.length} 项 · 启用合计 <span className="tnum font-medium text-slate-600">{formatCurrency(totalMonthly)}</span> / 月
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus size={14} />
          添加固定支出
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={Repeat} title="还没有固定支出" hint="添加网费、水费、电费、物业费等" />
      ) : (
        <div className="divide-y divide-slate-100">
          {list.map((fx) => (
            <div key={fx.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{fx.name}</span>
                  {!fx.enabled && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">已停用</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {fx.category} · {fx.paymentMethod} · 生效自 {formatMonthLabel(fx.startMonth)}
                </p>
              </div>
              <span className="text-sm font-semibold tnum text-slate-900">{formatCurrency(fx.amount)}</span>
              <label className="inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={fx.enabled}
                  onChange={async () => {
                    await updateFixedExpense(fx.id, { enabled: !fx.enabled });
                    reload();
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
              <div className="flex items-center gap-1">
                <IconBtn onClick={() => { setEditing(fx); setModalOpen(true); }} title="编辑"><Pencil size={14} /></IconBtn>
                <IconBtn
                  onClick={async () => {
                    if (!window.confirm(`确定删除「${fx.name}」？`)) return;
                    await deleteFixedExpense(fx.id);
                    reload();
                  }}
                  title="删除"
                  danger
                >
                  <Trash2 size={14} />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      <FixedExpenseFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={async (input) => {
          if (editing) await updateFixedExpense(editing.id, input);
          else await createFixedExpense(input);
          reload();
        }}
      />
    </div>
  );
}

// ============================================================
// 购物计划 Tab
// ============================================================
const PRIORITY_STYLE: Record<PlanPriority, string> = {
  high: 'bg-rose-50 text-rose-600',
  medium: 'bg-amber-50 text-amber-600',
  low: 'bg-slate-100 text-slate-500',
};
const PRIORITY_LABEL: Record<PlanPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function ShoppingPlansTab() {
  const [list, setList] = useState<ShoppingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShoppingPlan | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setList(await fetchShoppingPlans());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 按月份分组
  const grouped = list.reduce<Record<string, ShoppingPlan[]>>((acc, p) => {
    (acc[p.planMonth] ??= []).push(p);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort().reverse();

  const nextMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">购物计划</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            共 {list.length} 项 · 自动纳入计划月份的预计支出
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus size={14} />
          添加计划
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="还没有购物计划" hint="添加下个月想买的物品及其预算" />
      ) : (
        <div className="space-y-5">
          {months.map((m) => (
            <div key={m}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {formatMonthLabel(m)}
                  {m === nextMonth && (
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">下月</span>
                  )}
                </h4>
                <span className="text-xs tnum text-slate-400">
                  合计 {formatCurrency(grouped[m].reduce((s, p) => s + p.estimatedCost, 0))}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {grouped[m].map((p) => (
                  <PlanCard
                    key={p.id}
                    item={p}
                    onEdit={() => { setEditing(p); setModalOpen(true); }}
                    onDelete={async () => {
                      if (!window.confirm(`确定删除「${p.name}」？`)) return;
                      await deleteShoppingPlan(p.id);
                      reload();
                    }}
                    onPurchase={async () => {
                      await markPlanPurchased(p.id, {});
                      reload();
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ShoppingPlanFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={async (input) => {
          if (editing) await updateShoppingPlan(editing.id, input);
          else await createShoppingPlan(input);
          reload();
        }}
      />
    </div>
  );
}

const PLAN_STATUS_STYLE: Record<string, string> = {
  planned: 'bg-blue-50 text-blue-600',
  purchased: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-rose-50 text-rose-600',
};
const PLAN_STATUS_LABEL: Record<string, string> = {
  planned: '计划中',
  purchased: '已购买',
  cancelled: '已取消',
};

function PlanCard({
  item,
  onEdit,
  onDelete,
  onPurchase,
}: {
  item: ShoppingPlan;
  onEdit: () => void;
  onDelete: () => void;
  onPurchase: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-slate-900">{item.name}</h4>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PRIORITY_STYLE[item.priority])}>
              {PRIORITY_LABEL[item.priority]}优先
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PLAN_STATUS_STYLE[item.status])}>
              {PLAN_STATUS_LABEL[item.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {item.category} · {item.paymentMethod}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tnum text-slate-900">
          {formatCurrency(item.actualCost ?? item.estimatedCost)}
        </span>
      </div>
      {item.note && <p className="mt-2 text-xs text-slate-500">{item.note}</p>}
      <div className="mt-3 flex items-center gap-2">
        {item.status === 'planned' && (
          <button
            onClick={onPurchase}
            className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-100"
          >
            标记已购
          </button>
        )}
        <IconBtn onClick={onEdit} title="编辑"><Pencil size={13} /></IconBtn>
        <IconBtn onClick={onDelete} title="删除" danger><Trash2 size={13} /></IconBtn>
      </div>
    </div>
  );
}

// ============================================================
// 共享小组件
// ============================================================
function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'blue' | 'amber' }) {
  const c = { slate: 'text-slate-700', blue: 'text-blue-700', amber: 'text-amber-700' }[tone];
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={cn('mt-0.5 text-xs font-semibold tnum', c)}>{value}</p>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100',
        danger ? 'hover:bg-rose-50 hover:text-rose-600' : 'hover:text-slate-600',
      )}
    >
      {children}
    </button>
  );
}
