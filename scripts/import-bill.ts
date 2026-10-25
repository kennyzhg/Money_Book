/**
 * 支付宝 / 微信账单导入脚本（命令行）
 *
 * 解析、映射与去重规则见 `shared/billImport.ts`（与网页「批量导入 → 支付宝 / 微信账单」共用）。
 * 本脚本只负责读文件、调用 API 和输出报告；默认只预览，加 --commit 才真正写入。
 *
 * 用法：
 *   npm run import:bill -- <账单文件> [--commit] [--no-fuzzy] [--include-refunds]
 *
 * 环境变量（自动读取项目根目录 .env）：
 *   AGENT_API_TOKEN   必填，Bearer Token
 *   MONEY_BOOK_URL    服务地址，默认 http://127.0.0.1:${PORT:-3001}
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import type { AppConfig, Transaction, TransactionInput } from '../shared/types.ts';
import {
  BILL_SOURCE_LABEL,
  DEFAULT_PAYMENT_METHOD,
  billYears,
  parseBillFile,
  planBillImport,
  type KeywordRule,
} from '../shared/billImport.ts';

/** 本地补充规则（shared/billImport.local.ts，含隐私不入库；文件不存在时为空） */
async function loadLocalRules(): Promise<KeywordRule[]> {
  const file = path.resolve(import.meta.dirname, '../shared/billImport.local.ts');
  if (!fs.existsSync(file)) return [];
  const mod = (await import(pathToFileURL(file).href)) as { LOCAL_KEYWORD_RULES?: KeywordRule[] };
  return mod.LOCAL_KEYWORD_RULES ?? [];
}

function createClient(baseUrl: string, token: string) {
  return async function request<T>(method: string, urlPath: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}/api/v1${urlPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as { success: boolean; data: T; message: string } | null;
    if (!res.ok || !json?.success) {
      throw new Error(`${method} ${urlPath} 失败：HTTP ${res.status} ${json?.message ?? ''}`);
    }
    return json.data;
  };
}

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const files = argv.filter((a) => !a.startsWith('--'));
  return {
    file: files[0],
    commit: flags.has('--commit'),
    fuzzy: !flags.has('--no-fuzzy'),
    includeRefunds: flags.has('--include-refunds'),
  };
}

function fmt(tx: TransactionInput): string {
  const sign = tx.type === 'income' ? '+' : '-';
  return `${tx.date}  ${sign}${tx.amount.toFixed(2).padStart(9)}  ${tx.category}/${tx.paymentMethod}  ${tx.note ?? ''}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('用法：npm run import:bill -- <支付宝 CSV / 微信 XLSX> [--commit] [--no-fuzzy] [--include-refunds]');
    process.exit(1);
  }

  dotenv.config({ path: path.resolve(import.meta.dirname, '../.env'), quiet: true });
  const token = process.env.AGENT_API_TOKEN;
  if (!token) {
    console.error('[import] 未配置 AGENT_API_TOKEN（见 README「API Token（AI Agent 接入）」）');
    process.exit(1);
  }
  const baseUrl = (process.env.MONEY_BOOK_URL || `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/$/, '');
  const request = createClient(baseUrl, token);

  const rows = await parseBillFile(args.file, fs.readFileSync(args.file), async (data) => zlib.inflateRawSync(data));
  const sourceName = BILL_SOURCE_LABEL[rows[0]?.source ?? 'alipay'];
  console.log(`[import] ${path.basename(args.file)}（${sourceName}）：共 ${rows.length} 条交易记录`);
  if (rows.length === 0) return;

  const config = await request<AppConfig>('GET', '/config');
  const existing: Transaction[] = [];
  for (const year of billYears(rows)) {
    existing.push(...(await request<Transaction[]>('GET', `/transactions?year=${year}`)));
  }
  const plan = planBillImport(rows, config, existing, {
    fuzzy: args.fuzzy,
    includeRefunds: args.includeRefunds,
    localRules: await loadLocalRules(),
  });

  // ---------------- 报告 ----------------
  console.log(`\n待导入 ${plan.toImport.length} 条：`);
  plan.toImport.forEach((o) => console.log(`  ${fmt(o.tx)}${o.fallback ? '  ⚠兜底分类' : ''}`));

  if (plan.fuzzyMatched.length > 0) {
    console.log(`\n疑似已手工记账，跳过 ${plan.fuzzyMatched.length} 条（--no-fuzzy 可强制导入）：`);
    plan.fuzzyMatched.forEach((f) =>
      console.log(`  ${fmt(f.outcome.tx)}\n      ↳ 已有 ${f.existing.code}  ${f.existing.category}/${f.existing.paymentMethod}  ${f.existing.note ?? ''}`),
    );
  }

  if (plan.skipped.length > 0) {
    console.log(`\n跳过 ${plan.skipped.length} 条：`);
    plan.skipByReason.forEach(({ reason, count }) => console.log(`  ${reason} × ${count}`));
    plan.attention.forEach((s) =>
      console.log(`    第 ${s.row.line} 行  ${s.row.time}  ${s.row.direction} ${s.row.amount}  ${s.row.counterparty} · ${s.row.description}  [${s.reason}]`),
    );
  }

  if (plan.unknownPayments.length > 0) {
    console.log(`\n⚠ 以下付款方式未配置映射，已归为「${DEFAULT_PAYMENT_METHOD[plan.source]}」：${plan.unknownPayments.join('、')}`);
  }
  if (plan.fallbackCategories.length > 0) {
    console.log(`⚠ 以下来源分类走了兜底分类：${plan.fallbackCategories.join('、')}`);
  }

  if (!args.commit) {
    console.log(`\n[import] 预览模式，未写入。确认无误后加 --commit 执行导入`);
    return;
  }
  if (plan.toImport.length === 0) {
    console.log(`\n[import] 没有需要导入的记录`);
    return;
  }

  const result = await request<{ inserted: number; errors: Array<{ row: number; message: string }> }>(
    'POST',
    '/transactions/batch',
    { transactions: plan.toImport.map((o) => o.tx) },
  );
  console.log(`\n[import] 导入完成：成功 ${result.inserted} 条，失败 ${result.errors.length} 条`);
  result.errors.forEach((e) => {
    // 服务端行号按「CSV 表头 + 1」计算，换算回待导入列表下标
    const o = plan.toImport[e.row - 2];
    console.log(`  ${o ? fmt(o.tx) : `#${e.row}`}  → ${e.message}`);
  });
  if (result.errors.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`[import] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
