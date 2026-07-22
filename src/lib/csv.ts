import type { TransactionInput, TransactionType } from '@shared/types';

/**
 * 极简 CSV 解析器（无第三方依赖）
 * - 支持引号包裹（含逗号、换行）
 * - 支持转义双引号 ("")
 * - 自动去掉 BOM
 * - 自动处理 \r\n / \r / \n 换行
 */
function parseCsv(text: string): string[][] {
  // 去除 BOM
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  // 处理最后一行（无换行结尾）
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** 标准化类型字段：支持中英文 */
function normalizeType(raw: string): TransactionType | null {
  const t = raw.trim().toLowerCase();
  if (t === 'income' || t === '收入') return 'income';
  if (t === 'expense' || t === '支出') return 'expense';
  return null;
}

/** 标准化金额：去掉货币符号和千分位 */
function normalizeAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[¥$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

export interface ParseResult {
  transactions: TransactionInput[];
  errors: Array<{ row: number; message: string }>;
}

/** 表头中文名 → 字段名 */
const HEADER_MAP: Record<string, keyof TransactionInput> = {
  日期: 'date',
  date: 'date',
  类型: 'type',
  type: 'type',
  分类: 'category',
  category: 'category',
  金额: 'amount',
  amount: 'amount',
  支付方式: 'paymentMethod',
  'payment method': 'paymentMethod',
  paymentmethod: 'paymentMethod',
  备注: 'note',
  note: 'note',
};

/**
 * 把 CSV 文本转换为 TransactionInput 数组
 * 表头可以是中文或英文
 */
export function parseTransactionsCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  const errors: ParseResult['errors'] = [];
  const transactions: TransactionInput[] = [];

  if (rows.length === 0) {
    return { transactions, errors: [{ row: 0, message: 'CSV 为空' }] };
  }

  // 解析表头
  const header = rows[0].map((h) => h.trim());
  const fieldIndexes: Partial<Record<keyof TransactionInput, number>> = {};
  header.forEach((h, idx) => {
    const key = HEADER_MAP[h.toLowerCase()] ?? HEADER_MAP[h];
    if (key !== undefined) {
      fieldIndexes[key] = idx;
    }
  });

  const required: Array<keyof TransactionInput> = [
    'date',
    'type',
    'category',
    'amount',
    'paymentMethod',
  ];
  const missingHeader = required.filter((k) => fieldIndexes[k] === undefined);
  if (missingHeader.length > 0) {
    return {
      transactions,
      errors: [
        {
          row: 1,
          message: `表头缺少字段：${missingHeader.join(', ')}（应为：日期,类型,分类,金额,支付方式,备注）`,
        },
      ],
    };
  }

  // 解析数据行
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rowNum = i + 1;

    const date = (cells[fieldIndexes.date!] ?? '').trim();
    const typeRaw = (cells[fieldIndexes.type!] ?? '').trim();
    const category = (cells[fieldIndexes.category!] ?? '').trim();
    const amountRaw = (cells[fieldIndexes.amount!] ?? '').trim();
    const paymentMethod = (cells[fieldIndexes.paymentMethod!] ?? '').trim();
    const note = fieldIndexes.note !== undefined ? (cells[fieldIndexes.note] ?? '').trim() : '';

    if (!date && !typeRaw && !category && !amountRaw && !paymentMethod) {
      continue; // 空行跳过
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ row: rowNum, message: `日期格式错误：${date}（应为 YYYY-MM-DD）` });
      continue;
    }
    const type = normalizeType(typeRaw);
    if (!type) {
      errors.push({
        row: rowNum,
        message: `类型字段错误：${typeRaw}（应为 income/expense 或 收入/支出）`,
      });
      continue;
    }
    const amount = normalizeAmount(amountRaw);
    if (amount === null || amount <= 0) {
      errors.push({ row: rowNum, message: `金额错误：${amountRaw}（必须为正数）` });
      continue;
    }
    if (!category) {
      errors.push({ row: rowNum, message: '分类不能为空' });
      continue;
    }
    if (!paymentMethod) {
      errors.push({ row: rowNum, message: '支付方式不能为空' });
      continue;
    }

    transactions.push({
      date,
      type,
      category,
      amount,
      paymentMethod,
      ...(note ? { note } : {}),
    });
  }

  return { transactions, errors };
}

/** 读取文件为文本（UTF-8） */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}
