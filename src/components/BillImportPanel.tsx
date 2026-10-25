import { useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { AppConfig, Transaction } from '@shared/types';
import {
  BILL_SOURCE_LABEL,
  DEFAULT_PAYMENT_METHOD,
  billYears,
  parseBillFile,
  planBillImport,
  type BillRow,
  type ImportOutcome,
  type KeywordRule,
} from '@shared/billImport';
import { fetchConfig } from '@/api/config';
import {
  batchCreateTransactions,
  fetchTransactions,
  type BatchImportResult,
} from '@/api/transactions';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface BillImportPanelProps {
  onSuccess?: () => void;
  onClose: () => void;
}

type Stage = 'idle' | 'loading' | 'parsed' | 'importing' | 'done' | 'error';

interface LoadedBill {
  fileName: string;
  rows: BillRow[];
  config: AppConfig;
  existing: Transaction[];
}

// 本地补充规则（shared/billImport.local.ts，含隐私不入库；文件不存在时为空）
const localRuleModules = import.meta.glob<{ LOCAL_KEYWORD_RULES?: KeywordRule[] }>(
  '/shared/billImport.local.ts',
  { eager: true },
);
const LOCAL_RULES = Object.values(localRuleModules).flatMap((m) => m.LOCAL_KEYWORD_RULES ?? []);

/** 浏览器端 deflate-raw 解压（XLSX 内部为 ZIP 压缩） */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 备注去掉末尾的导入标签，预览时更易读 */
function displayNote(note?: string): string {
  return (note ?? '').replace(/\s*\[(alipay|wechat):[^\]]+\]$/, '');
}

/**
 * 支付宝 / 微信账单导入
 *
 * 解析、映射与去重全部复用 `shared/billImport.ts`（与命令行脚本同一套规则），
 * 本组件只负责读文件、拉取配置与已有交易、展示预览和提交。
 */
export default function BillImportPanel({ onSuccess, onClose }: BillImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [bill, setBill] = useState<LoadedBill | null>(null);
  const [fuzzy, setFuzzy] = useState(true);
  const [includeRefunds, setIncludeRefunds] = useState(false);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [submitted, setSubmitted] = useState<ImportOutcome[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const plan = useMemo(
    () => (bill ? planBillImport(bill.rows, bill.config, bill.existing, { fuzzy, includeRefunds, localRules: LOCAL_RULES }) : null),
    [bill, fuzzy, includeRefunds],
  );

  const totals = useMemo(() => {
    const sum = { income: 0, expense: 0 };
    plan?.toImport.forEach((o) => (sum[o.tx.type] += o.tx.amount));
    return sum;
  }, [plan]);

  const reset = () => {
    setStage('idle');
    setBill(null);
    setResult(null);
    setSubmitted([]);
    setErrorMsg(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    setStage('loading');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rows = await parseBillFile(file.name, bytes, inflateRaw);
      if (rows.length === 0) throw new Error('账单中没有交易记录');
      // 每次都取最新配置与已有交易，保证映射和去重基于当前数据
      const config = await fetchConfig();
      const existing = (
        await Promise.all(billYears(rows).map((year) => fetchTransactions({ year })))
      ).flat();
      setBill({ fileName: file.name, rows, config, existing });
      setStage('parsed');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '文件读取失败');
      setStage('error');
    }
  };

  const handleImport = async () => {
    if (!plan || plan.toImport.length === 0) return;
    setStage('importing');
    try {
      const items = plan.toImport;
      const res = await batchCreateTransactions(items.map((o) => o.tx));
      setSubmitted(items);
      setResult(res);
      setStage('done');
      if (res.inserted > 0) onSuccess?.();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '导入失败');
      setStage('error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <div className="flex items-start gap-2">
          <FileText size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">导出账单后直接上传原始文件</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-blue-600">
              <li>
                支付宝：我的 → 账单 → 右上角「…」→ 开具交易流水证明 → 用于个人对账，解压邮件附件得到 CSV
              </li>
              <li>
                微信：我 → 服务 → 钱包 → 账单 → 下载账单 → 用于个人对账，用公众号提供的密码解压得到 XLSX
              </li>
              <li>同一份账单可重复上传，已导入的记录会自动跳过</li>
            </ul>
          </div>
        </div>
      </div>

      {(stage === 'idle' || stage === 'error') && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Upload size={22} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">点击或拖拽账单文件到这里</p>
            <p className="mt-1 text-xs text-slate-400">支付宝 .csv / 微信 .xlsx，自动识别来源</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {stage === 'error' && errorMsg && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">操作失败</p>
            <p className="mt-0.5 text-xs">{errorMsg}</p>
          </div>
        </div>
      )}

      {(stage === 'loading' || stage === 'importing') && (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <Loader2 size={28} className="animate-spin text-blue-600" />
          <p className="text-sm text-slate-500">
            {stage === 'loading' ? '正在解析账单并比对已有记录...' : '正在导入，请稍候...'}
          </p>
        </div>
      )}

      {stage === 'parsed' && bill && plan && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <FileText size={16} className="shrink-0 text-slate-500" />
              <span className="shrink-0 rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                {BILL_SOURCE_LABEL[plan.source]}
              </span>
              <span className="truncate font-medium text-slate-700">{bill.fileName}</span>
            </div>
            <button
              onClick={reset}
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              title="重新选择"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-emerald-50 px-3 py-3">
              <p className="text-xs text-emerald-600">待导入</p>
              <p className="tnum mt-1 text-2xl font-semibold text-emerald-700">{plan.toImport.length}</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-3">
              <p className="text-xs text-amber-600">疑似已记账</p>
              <p className="tnum mt-1 text-2xl font-semibold text-amber-700">{plan.fuzzyMatched.length}</p>
            </div>
            <div className="rounded-xl bg-slate-100 px-3 py-3">
              <p className="text-xs text-slate-500">跳过</p>
              <p className="tnum mt-1 text-2xl font-semibold text-slate-700">{plan.skipped.length}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            账单共 {plan.total} 条
            {plan.alreadyImported > 0 && `，其中 ${plan.alreadyImported} 条此前已导入`}
            {plan.skipByReason
              .filter((s) => s.reason !== '已导入')
              .map((s) => `；${s.reason} ${s.count} 条`)
              .join('')}
          </p>

          <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={fuzzy}
                onChange={(e) => setFuzzy(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>
                跳过疑似已手工记账的记录
                <span className="block text-xs text-slate-400">同日期、同收支类型、同金额且非导入的已有记录</span>
              </span>
            </label>
            {plan.source === 'alipay' && (
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={includeRefunds}
                  onChange={(e) => setIncludeRefunds(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>
                  退款按「收入 / 退款」导入
                  <span className="block text-xs text-slate-400">
                    默认跳过：全额退款的原交易已关闭，再记退款会多出一笔收入
                  </span>
                </span>
              </label>
            )}
          </div>

          {(plan.unknownPayments.length > 0 || plan.fallbackCategories.length > 0) && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div className="space-y-1">
                {plan.unknownPayments.length > 0 && (
                  <p>
                    以下付款方式未识别，已归为「{DEFAULT_PAYMENT_METHOD[plan.source]}」：
                    {plan.unknownPayments.join('、')}
                  </p>
                )}
                {plan.fallbackCategories.length > 0 && (
                  <p>以下分类走了兜底分类：{plan.fallbackCategories.join('、')}</p>
                )}
              </div>
            </div>
          )}

          {plan.toImport.length > 0 && (
            <div className="rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs">
                <span className="font-medium text-slate-700">待导入明细</span>
                <span className="tnum text-slate-500">
                  {totals.expense > 0 && (
                    <span className="text-rose-600">支出 {formatCurrency(totals.expense)}</span>
                  )}
                  {totals.expense > 0 && totals.income > 0 && ' · '}
                  {totals.income > 0 && (
                    <span className="text-emerald-600">收入 {formatCurrency(totals.income)}</span>
                  )}
                </span>
              </div>
              <ul className="max-h-64 divide-y divide-slate-50 overflow-y-auto">
                {plan.toImport.map((o) => (
                  <li key={o.row.orderNo} className="flex items-center gap-3 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-700">{displayNote(o.tx.note)}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        <span className="tnum">{o.tx.date.slice(5)}</span> · {o.tx.category} ·{' '}
                        {o.tx.paymentMethod}
                        {o.fallback && <span className="text-amber-600"> · 兜底分类</span>}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'tnum shrink-0 text-sm font-semibold',
                        o.tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600',
                      )}
                    >
                      {o.tx.type === 'income' ? '+' : '-'}
                      {formatCurrency(o.tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.fuzzyMatched.length > 0 && (
            <details className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
              <summary className="cursor-pointer text-xs font-medium text-amber-700">
                疑似已手工记账，将跳过 {plan.fuzzyMatched.length} 条（取消上方勾选可强制导入）
              </summary>
              <ul className="mt-2 space-y-2 text-xs text-amber-700">
                {plan.fuzzyMatched.map(({ outcome, existing }) => (
                  <li key={outcome.row.orderNo}>
                    <p>
                      <span className="tnum">{outcome.tx.date}</span> {formatCurrency(outcome.tx.amount)} ·{' '}
                      {displayNote(outcome.tx.note)}
                    </p>
                    <p className="text-amber-600">
                      ↳ 已有 {existing.code} · {existing.category} · {existing.paymentMethod}
                      {existing.note && ` · ${existing.note}`}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {plan.attention.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3" open>
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                需要留意的跳过项 {plan.attention.length} 条
              </summary>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                {plan.attention.map((s) => (
                  <li key={`${s.row.line}`}>
                    <span className="font-medium">第 {s.row.line} 行</span>{' '}
                    <span className="tnum">{s.row.time.slice(0, 10)}</span> {s.row.direction}{' '}
                    {s.row.amount} · {s.row.counterparty}
                    {s.row.description && ` · ${s.row.description}`}
                    <span className="text-amber-600">（{s.reason}）</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {plan.toImport.length === 0 ? (
            <button
              onClick={reset}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              没有需要导入的记录，重新选择文件
            </button>
          ) : (
            <button
              onClick={handleImport}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              确认导入 {plan.toImport.length} 条
            </button>
          )}
        </div>
      )}

      {stage === 'done' && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center gap-2 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={28} />
            </div>
            <p className="text-base font-semibold text-slate-800">导入完成</p>
            <p className="text-sm text-slate-500">
              成功导入 <span className="font-medium text-emerald-600">{result.inserted}</span> 条
              {result.errors.length > 0 && (
                <>
                  ，失败 <span className="font-medium text-rose-600">{result.errors.length}</span> 条
                </>
              )}
            </p>
          </div>

          {result.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50/50 p-3">
              <p className="mb-2 text-xs font-medium text-rose-700">失败明细</p>
              <ul className="space-y-1 text-xs text-rose-700">
                {result.errors.map((e, i) => {
                  // 服务端行号按「CSV 表头 + 1」计算，换算回提交列表下标
                  const o = submitted[e.row - 2];
                  return (
                    <li key={i}>
                      <span className="font-medium">
                        {o ? `${o.tx.date} ${formatCurrency(o.tx.amount)} ${displayNote(o.tx.note)}` : `第 ${e.row} 条`}：
                      </span>
                      {e.message}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            完成
          </button>
        </div>
      )}
    </div>
  );
}
