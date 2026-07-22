import { useRef, useState } from 'react';
import {
  Upload,
  Download,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import type { TransactionInput } from '@shared/types';
import { batchCreateTransactions, type BatchImportResult } from '@/api/transactions';
import { parseTransactionsCsv, readFileAsText } from '@/lib/csv';

interface ImportTransactionsModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Stage = 'idle' | 'parsed' | 'importing' | 'done' | 'error';

interface ParsedData {
  transactions: TransactionInput[];
  errors: Array<{ row: number; message: string }>;
  fileName: string;
}

export default function ImportTransactionsModal({
  open,
  onClose,
  onSuccess,
}: ImportTransactionsModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setStage('idle');
    setParsed(null);
    setResult(null);
    setErrorMsg(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    try {
      const text = await readFileAsText(file);
      const r = parseTransactionsCsv(text);
      setParsed({ ...r, fileName: file.name });
      setStage('parsed');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '文件读取失败');
      setStage('error');
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setStage('importing');
    try {
      const res = await batchCreateTransactions(parsed.transactions);
      setResult(res);
      setStage('done');
      if (res.inserted > 0) {
        onSuccess?.();
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '导入失败');
      setStage('error');
    }
  };

  const downloadTemplate = () => {
    window.open('/templates/transactions_template.csv', '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="animate-fade-in-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:max-h-[90vh] md:max-w-lg md:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4 md:px-6">
          <h2 className="text-base font-semibold text-slate-900">批量导入账单</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-6"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {/* 顶部说明 + 下载模板 */}
          <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <div className="flex items-start gap-2">
              <FileText size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">使用说明</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-blue-600">
                  <li>下载模板，用 Excel/WPS 填写数据</li>
                  <li>分类与支付方式必须与管理页面配置的一致</li>
                  <li>保存为 CSV UTF-8 编码</li>
                  <li>点击下方区域上传文件</li>
                </ol>
              </div>
              <button
                onClick={downloadTemplate}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-blue-600 shadow-sm transition-colors hover:bg-blue-50"
              >
                <Download size={13} />
                下载模板
              </button>
            </div>
          </div>

          {/* 上传区域 */}
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
                <p className="text-sm font-medium text-slate-700">点击或拖拽 CSV 文件到这里</p>
                <p className="mt-1 text-xs text-slate-400">支持 .csv 格式，UTF-8 编码</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          )}

          {/* 错误提示 */}
          {stage === 'error' && errorMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">操作失败</p>
                <p className="mt-0.5 text-xs">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* 解析预览 */}
          {stage === 'parsed' && parsed && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={16} className="text-slate-500" />
                  <span className="font-medium text-slate-700">{parsed.fileName}</span>
                </div>
                <button
                  onClick={reset}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  title="重新选择"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <p className="text-xs text-emerald-600">可导入记录</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-700">
                    {parsed.transactions.length}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 px-4 py-3">
                  <p className="text-xs text-amber-600">解析错误</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-700">
                    {parsed.errors.length}
                  </p>
                </div>
              </div>

              {parsed.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                  <p className="mb-2 text-xs font-medium text-amber-700">
                    以下行将被跳过（{parsed.errors.length} 条）
                  </p>
                  <ul className="space-y-1 text-xs text-amber-700">
                    {parsed.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        <span className="font-medium">第 {e.row} 行：</span>
                        {e.message}
                      </li>
                    ))}
                    {parsed.errors.length > 20 && (
                      <li className="text-amber-600">
                        ...还有 {parsed.errors.length - 20} 条
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {parsed.transactions.length === 0 ? (
                <button
                  onClick={reset}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  重新选择文件
                </button>
              ) : (
                <button
                  onClick={handleImport}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  确认导入 {parsed.transactions.length} 条
                </button>
              )}
            </div>
          )}

          {/* 导入中 */}
          {stage === 'importing' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 size={28} className="animate-spin text-blue-600" />
              <p className="text-sm text-slate-500">正在导入，请稍候...</p>
            </div>
          )}

          {/* 完成状态 */}
          {stage === 'done' && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-2 py-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={28} />
                </div>
                <p className="text-base font-semibold text-slate-800">导入完成</p>
                <p className="text-sm text-slate-500">
                  成功导入{' '}
                  <span className="font-medium text-emerald-600">{result.inserted}</span> 条
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
                    {result.errors.slice(0, 30).map((e, i) => (
                      <li key={i}>
                        <span className="font-medium">第 {e.row} 行：</span>
                        {e.message}
                      </li>
                    ))}
                    {result.errors.length > 30 && (
                      <li className="text-rose-600">...还有 {result.errors.length - 30} 条</li>
                    )}
                  </ul>
                </div>
              )}

              <button
                onClick={handleClose}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                完成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
