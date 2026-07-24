import { useEffect, useMemo, useState } from 'react';
import type { Transaction, TransactionType, IconItem } from '@shared/types';
import {
  fetchTransactionsPaginated,
  createTransaction,
  updateTransaction,
} from '@/api/transactions';
import {
  selectCategories,
  selectPaymentMethods,
  useConfigStore,
} from '@/store/configStore';
import {
  currentYear,
  formatCurrency,
  formatMonthLabel,
  formatYearLabel,
  getRecentYears,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/lib/useIsMobile';
import { useDeleteTransaction } from '@/lib/useDeleteTransaction';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Inbox,
  Upload,
  Filter,
  X,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Select from '@/components/Select';
import Pagination from '@/components/Pagination';
import TransactionFormModal from '@/components/TransactionFormModal';
import ImportTransactionsModal from '@/components/ImportTransactionsModal';
import CategoryIcon from '@/components/CategoryIcon';
import { getIcon } from '@/lib/icons';

/** 每页条数（与产品需求对齐：>40 条触发分页，每页 40 条） */
const PAGE_SIZE = 40;

export default function Transactions() {
  const config = useConfigStore((s) => s.config);
  const loadConfig = useConfigStore((s) => s.load);
  const paymentMethods = useMemo(() => selectPaymentMethods(config), [config]);
  const isMobile = useIsMobile();

  // 年份筛选：默认当前年
  const [year, setYear] = useState<string>(currentYear());
  // 月份筛选：默认空（"全部"）。空字符串 = 全年；非空 = 指定月份
  const [month, setMonth] = useState<string>('');
  const [type, setType] = useState<'' | TransactionType>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [category, setCategory] = useState<string>('');

  // 分类选项：根据已选 type 动态过滤；type=空时合并收入+支出两类
  const categoryOptions = useMemo(() => {
    if (type === 'income') return selectCategories(config, 'income');
    if (type === 'expense') return selectCategories(config, 'expense');
    return [
      ...selectCategories(config, 'income'),
      ...selectCategories(config, 'expense'),
    ];
  }, [config, type]);

  const [list, setList] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // 移动端筛选面板展开状态
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    loadConfig().catch(() => undefined);
  }, [loadConfig]);

  const reload = () => {
    setLoading(true);
    setError(null);
    fetchTransactionsPaginated({
      // month 优先：若设置了 month，后端会忽略 year（行为正确）
      year,
      month: month || undefined,
      type: type || undefined,
      paymentMethod: paymentMethod || undefined,
      category: category || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        setList(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, type, paymentMethod, category, page]);

  // 筛选条件（year/month/type/paymentMethod/category）变化时重置到第一页
  useEffect(() => {
    setPage(1);
  }, [year, month, type, paymentMethod, category]);

  const { deletingId, remove: handleDelete } = useDeleteTransaction({
    onSuccess: (id) => {
      setList((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    },
    onError: (msg) => setError(msg),
  });

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (tx: Transaction) => {
    setEditing(tx);
    setModalOpen(true);
  };

  // 年份选项：最近 6 年（当前年往前）
  const yearOptions = useMemo(() => getRecentYears(6), []);
  // 月份选项：1-12 月（固定），用户配合年份使用
  const monthOptions = useMemo(() => {
    const arr: string[] = [];
    for (let m = 1; m <= 12; m++) {
      arr.push(`${year}-${String(m).padStart(2, '0')}`);
    }
    return arr;
  }, [year]);

  // 注意：金额汇总应基于"全部匹配记录"，而非当前页
  // 由于分页后只拿到当前页 40 条，无法在客户端精确汇总全年/全月
  // 解决方案：这里展示"当前页汇总"，并加文案明确（避免数据误导）
  const { totalIncome, totalExpense } = list.reduce(
    (acc, t) => {
      if (t.type === 'income') acc.totalIncome += t.amount;
      else acc.totalExpense += t.amount;
      return acc;
    },
    { totalIncome: 0, totalExpense: 0 },
  );

  const hasFilter = Boolean(type || paymentMethod || category);
  const resetFilter = () => {
    setType('');
    setPaymentMethod('');
    setCategory('');
  };

  // 移动端：筛选摘要文案
  const filterSummary = [
    month ? formatMonthLabel(month) : formatYearLabel(year),
    type === 'expense' ? '支出' : type === 'income' ? '收入' : '',
    category,
    paymentMethod,
  ].filter(Boolean).join(' · ');

  const showPagination = total > PAGE_SIZE;
  // 空状态文案区分：当前页空 vs 整体无数据
  const isEmpty = !loading && list.length === 0;

  return (
    <div>
      <PageHeader
        title="全部账单"
        subtitle={`共 ${total} 条记录${total > PAGE_SIZE ? ` · 第 ${page}/${Math.ceil(total / PAGE_SIZE)} 页` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 md:flex-none"
            >
              <Upload size={16} />
              <span className="whitespace-nowrap">批量导入</span>
            </button>
            <button
              onClick={openCreate}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 md:flex-none"
            >
              <Plus size={16} />
              <span className="whitespace-nowrap">记一笔</span>
            </button>
          </div>
        }
      />

      {/* 筛选栏：桌面端完整展示；移动端显示摘要 + 抽屉式筛选 */}
      {isMobile ? (
        <div className="mb-4">
          <button
            onClick={() => setFilterOpen(true)}
            className={cn(
              'flex w-full items-center justify-between rounded-2xl bg-white p-3.5 shadow-sm ring-1 transition-colors',
              hasFilter || month ? 'ring-blue-200' : 'ring-slate-100',
            )}
          >
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <Filter size={15} className={hasFilter || month ? 'text-blue-600' : 'text-slate-400'} />
              <span className="truncate">{filterSummary || '全部记录（点击筛选）'}</span>
            </span>
            <span className="flex items-center gap-2">
              {(hasFilter || month) && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMonth('');
                    resetFilter();
                  }}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                >
                  清除
                </span>
              )}
              <span className="text-xs text-slate-400">展开</span>
            </span>
          </button>
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">年份</span>
            <Select value={year} onChange={setYear} className="w-28">
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {formatYearLabel(y)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">月份</span>
            <Select value={month} onChange={setMonth} className="w-36">
              <option value="">全年</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">类型</span>
            <Select value={type} onChange={(v) => setType(v as '' | TransactionType)} className="w-28">
              <option value="">全部</option>
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">支付方式</span>
            <Select
              value={paymentMethod}
              onChange={setPaymentMethod}
              className="w-36"
              leadingIcon={
                paymentMethod ? (
                  <PaymentMethodIcon
                    showName={false}
                    icon={
                      paymentMethods.find((p) => p.name === paymentMethod)?.icon ??
                      'smartphone'
                    }
                  />
                ) : null
              }
            >
              <option value="">全部</option>
              {paymentMethods.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">分类</span>
            <Select
              value={category}
              onChange={setCategory}
              className="w-32"
              leadingIcon={
                category ? (
                  <CategoryLeadingIcon
                    icon={
                      categoryOptions.find((c) => c.name === category)?.icon ?? 'circle'
                    }
                  />
                ) : null
              }
            >
              <option value="">全部</option>
              {categoryOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          {hasFilter && (
            <button
              onClick={resetFilter}
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
            >
              重置筛选
            </button>
          )}

          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="text-emerald-600">收入 {formatCurrency(totalIncome)}</span>
            <span className="text-rose-600">支出 {formatCurrency(totalExpense)}</span>
          </div>
        </div>
      )}

      {/* 移动端：汇总信息（独立一行） */}
      {isMobile && (
        <div className="mb-3 flex items-center justify-around rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-slate-100">
          <span className="text-slate-500">
            收入 <span className="tnum font-medium text-emerald-600">{formatCurrency(totalIncome)}</span>
          </span>
          <span className="h-3 w-px bg-slate-200" />
          <span className="text-slate-500">
            支出 <span className="tnum font-medium text-rose-600">{formatCurrency(totalExpense)}</span>
          </span>
        </div>
      )}

      {/* 顶部小提示：分页时金额汇总仅基于当前页 */}
      {showPagination && !isMobile && (
        <p className="mb-2 text-xs text-slate-400">
          * 数据较多已开启分页，顶部金额仅汇总当前页 {list.length} 条；如需完整统计请缩小筛选范围。
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
      )}

      {/* 列表区域 */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
            <Inbox size={36} className="text-slate-300" />
            <span className="text-sm">当前筛选条件下暂无记录</span>
          </div>
        ) : isMobile ? (
          // 移动端：卡片列表
          <MobileTransactionList
            list={list}
            config={config}
            paymentMethods={paymentMethods}
            onEdit={openEdit}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        ) : (
          // 桌面端：表格
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-6 py-3 font-medium">日期</th>
                  <th className="px-6 py-3 font-medium">分类</th>
                  <th className="px-6 py-3 font-medium">支付方式</th>
                  <th className="px-6 py-3 font-medium">备注</th>
                  <th className="px-6 py-3 text-right font-medium">金额</th>
                  <th className="px-6 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const catIcon =
                    config?.categories[t.type].find((c) => c.name === t.category)?.icon ??
                    'circle';
                  const payIcon =
                    paymentMethods.find((p) => p.name === t.paymentMethod)?.icon ?? 'circle';
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="whitespace-nowrap px-6 py-3 text-slate-600">{t.date}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <CategoryIcon
                            icon={catIcon}
                            tone={t.type === 'income' ? 'income' : 'expense'}
                            size={14}
                            className="h-7 w-7"
                          />
                          <span className="text-slate-700">{t.category}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <PaymentMethodIcon name={t.paymentMethod} icon={payIcon} />
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-6 py-3 text-slate-500">
                        {t.note || '-'}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-6 py-3 text-right font-medium tnum',
                          t.type === 'income' ? 'text-emerald-600' : 'text-slate-900',
                        )}
                      >
                        {t.type === 'income' ? '+' : '-'}
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(t)}
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
                            title="编辑"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            disabled={deletingId === t.id}
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
                            title="删除"
                          >
                            {deletingId === t.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页：仅当总条数 > 每页条数时显示 */}
        {showPagination && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
            className="border-t border-slate-100"
          />
        )}
      </div>

      <p className="mt-3 hidden text-xs text-slate-400 md:block">
        金额正负号表示收入 / 支出；点击行尾图标可编辑或删除。
      </p>

      <TransactionFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={async (input) => {
          if (editing) {
            await updateTransaction(editing.id, input);
          } else {
            await createTransaction(input);
          }
          reload();
        }}
      />

      <ImportTransactionsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={reload}
      />

      {/* 移动端：筛选抽屉 */}
      {isMobile && (
        <MobileFilterSheet
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          year={year}
          onYearChange={setYear}
          month={month}
          onMonthChange={setMonth}
          type={type}
          onTypeChange={(v) => {
            setType(v as '' | TransactionType);
            // 切换类型后，当前分类可能不属于新类型，清空避免失效
            setCategory('');
          }}
          category={category}
          onCategoryChange={setCategory}
          categoryOptions={categoryOptions}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          paymentMethods={paymentMethods}
          yearOptions={yearOptions}
          monthOptions={monthOptions}
          hasFilter={hasFilter || Boolean(month)}
          onReset={() => {
            setMonth('');
            resetFilter();
          }}
        />
      )}
    </div>
  );
}

/** 支付方式图标 + 可选名称（图标来自 config，反映用户在管理页面的自定义设置） */
function PaymentMethodIcon({
  icon,
  name,
  showName = true,
}: {
  icon: string;
  name?: string;
  showName?: boolean;
}) {
  const Icon = getIcon(icon);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} className="text-slate-400" />
      {showName && name && <span>{name}</span>}
    </span>
  );
}

/** 分类下拉框的 leading 图标（与支付方式风格保持一致，不带圆形背景容器） */
function CategoryLeadingIcon({ icon }: { icon: string }) {
  const Icon = getIcon(icon);
  return <Icon size={14} className="text-slate-400" />;
}

/* ============== 移动端：卡片列表 ============== */
interface MobileTransactionListProps {
  list: Transaction[];
  config: ReturnType<typeof useConfigStore.getState>['config'];
  paymentMethods: ReturnType<typeof selectPaymentMethods>;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function MobileTransactionList({
  list,
  config,
  paymentMethods,
  onEdit,
  onDelete,
  deletingId,
}: MobileTransactionListProps) {
  return (
    <ul className="divide-y divide-slate-50">
      {list.map((t) => {
        const catIcon =
          config?.categories[t.type].find((c) => c.name === t.category)?.icon ?? 'circle';
        const payIcon =
          paymentMethods.find((p) => p.name === t.paymentMethod)?.icon ?? 'circle';
        const PayIcon = getIcon(payIcon);
        return (
          <li key={t.id} className="flex items-start gap-3 p-3.5">
            <CategoryIcon
              icon={catIcon}
              tone={t.type === 'income' ? 'income' : 'expense'}
              size={16}
              className="h-10 w-10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-800">{t.category}</span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                    t.type === 'income'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-rose-50 text-rose-600',
                  )}
                >
                  {t.type === 'income' ? '收入' : '支出'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                <span className="tnum">{t.date}</span>
                <span className="inline-flex items-center gap-1">
                  <PayIcon size={11} />
                  {t.paymentMethod}
                </span>
                {t.note && <span className="truncate">· {t.note}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={cn(
                  'tnum text-sm font-semibold',
                  t.type === 'income' ? 'text-emerald-600' : 'text-slate-900',
                )}
              >
                {t.type === 'income' ? '+' : '-'}
                {formatCurrency(t.amount)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onEdit(t)}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
                  title="编辑"
                  aria-label="编辑"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => onDelete(t.id)}
                  disabled={deletingId === t.id}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
                  title="删除"
                  aria-label="删除"
                >
                  {deletingId === t.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ============== 移动端：筛选抽屉 ============== */
interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  year: string;
  onYearChange: (v: string) => void;
  month: string;
  onMonthChange: (v: string) => void;
  type: '' | TransactionType;
  onTypeChange: (v: '' | TransactionType) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  categoryOptions: IconItem[];
  paymentMethod: string;
  onPaymentMethodChange: (v: string) => void;
  paymentMethods: ReturnType<typeof selectPaymentMethods>;
  yearOptions: string[];
  monthOptions: string[];
  hasFilter: boolean;
  onReset: () => void;
}

function MobileFilterSheet({
  open,
  onClose,
  year,
  onYearChange,
  month,
  onMonthChange,
  type,
  onTypeChange,
  category,
  onCategoryChange,
  categoryOptions,
  paymentMethod,
  onPaymentMethodChange,
  paymentMethods,
  yearOptions,
  monthOptions,
  hasFilter,
  onReset,
}: MobileFilterSheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-in-up relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">筛选条件</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">年份</label>
            <Select value={year} onChange={onYearChange} className="w-full">
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {formatYearLabel(y)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">月份</label>
            <Select value={month} onChange={onMonthChange} className="w-full">
              <option value="">全年</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">类型</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: '', label: '全部' },
                { v: 'expense', label: '支出' },
                { v: 'income', label: '收入' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => onTypeChange(opt.v)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    type === opt.v
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">分类</label>
            <Select
              value={category}
              onChange={onCategoryChange}
              className="w-full"
              leadingIcon={
                category ? (
                  <CategoryLeadingIcon
                    icon={
                      categoryOptions.find((c) => c.name === category)?.icon ?? 'circle'
                    }
                  />
                ) : null
              }
            >
              <option value="">全部</option>
              {categoryOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">支付方式</label>
            <Select value={paymentMethod} onChange={onPaymentMethodChange} className="w-full">
              <option value="">全部</option>
              {paymentMethods.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-2 pt-2">
            {hasFilter && (
              <button
                onClick={onReset}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                重置
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-[2] rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              查看 {month ? formatMonthLabel(month) : formatYearLabel(year)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
