/**
 * 支付宝 / 微信账单导入：解析、映射与去重（前后端通用，无平台依赖）
 *
 * 网页「批量导入 → 支付宝 / 微信账单」与命令行 `scripts/import-bill.ts` 共用本模块，
 * 映射规则只在这里维护，避免两端口径不一致。
 *
 * 支持的文件（按表头自动识别来源）：
 *   - 支付宝：App「我的 → 账单 → … → 开具交易流水证明 → 用于个人对账」导出的 CSV（GBK）
 *   - 微信：  App「我 → 服务 → 钱包 → 账单 → 下载账单 → 用于个人对账」导出的 XLSX（或旧版 CSV）
 *
 * 处理规则：
 *   - 过滤：不计收支 / 中性交易、交易关闭 / 全额退款、退款单本身、分期付款
 *     微信部分退款（「已退款(￥x)」）按扣减后的净额入账
 *   - 映射：关键词规则 > 来源分类 → 本系统分类；收/付款方式 → 本系统支付方式（按实际扣款来源）
 *   - 去重：
 *     - 精确：备注内嵌 `[alipay:<交易订单号>]` / `[wechat:<交易单号>]` 标签，已存在则跳过
 *     - 模糊：同日期 + 同类型 + 同金额、且不带导入标签的已有记录，视为手工已记，默认跳过
 */
import type { AppConfig, Transaction, TransactionInput, TransactionType } from './types.ts';
import { parseCsv } from './csv.ts';

export type BillSource = 'alipay' | 'wechat';

export const BILL_SOURCE_LABEL: Record<BillSource, string> = {
  alipay: '支付宝',
  wechat: '微信',
};

// ====================================================================
// 映射规则（按需修改）
// ====================================================================

export interface KeywordRule {
  pattern: RegExp;
  type: TransactionType;
  category: string;
}

/**
 * 精确关键词：匹配「交易对方 + 商品说明」，优先级高于来源分类。按顺序取第一个命中
 *
 * 分类判定顺序：精确关键词 → 来源分类（{@link CATEGORY_MAP}）→ 泛化关键词（{@link GENERIC_KEYWORD_RULES}）→ 兜底分类
 */
const KEYWORD_RULES: KeywordRule[] = [
  // B 站「充电」是会员订阅，须排在充电桩规则之前
  { pattern: /哔哩哔哩|爱奇艺|腾讯视频|优酷|芒果TV/, type: 'expense', category: '娱乐' },
  { pattern: /瑞幸|luckin|星巴克|库迪|咖啡|奶茶|喜茶|蜜雪|霸王茶姬|茶百道|古茗|沪上阿姨|书亦|1点点|一点点|甘茶度|卡旺卡/i, type: 'expense', category: '咖啡奶茶' },
  { pattern: /二锅头|白酒|啤酒|黄酒|香烟|茅台|五粮液/, type: 'expense', category: '烟酒' },
  { pattern: /加油|中石化|中石油|中国石化|中国石油|壳牌/, type: 'expense', category: '加油' },
  // 商品说明只有车牌号的，是商场停车缴费
  { pattern: /停车|[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{5,6}/, type: 'expense', category: '停车费' },
  { pattern: /充电|特来电|星星充电|快电|蔚来能源/, type: 'expense', category: '充电桩' },
  { pattern: /电费|水费|燃气|话费|宽带|中国移动|中国联通|中国电信|国家电网/, type: 'expense', category: '水电话费' },
  { pattern: /药房|药店|医药|医院|诊所/, type: 'expense', category: '医疗' },
  { pattern: /OpenAI|ChatGPT|Anthropic|Claude|DeepSeek|月之暗面|Kimi|智谱|通义|豆包/i, type: 'expense', category: '大模型' },
  { pattern: /App Store|iCloud|Apple Music|苹果/i, type: 'expense', category: '软件服务' },
];

/**
 * 泛化关键词：仅在来源分类映射不到时生效（主要服务于没有消费分类的微信账单）。
 * 不能排在来源分类之前，否则会覆盖支付宝自带的分类（如「淘宝闪购」外卖被「淘宝」误判为购物）。
 */
const GENERIC_KEYWORD_RULES: KeywordRule[] = [
  { pattern: /黄焖鸡|拌粉|早点|老乡鸡|水饺|饺子|汤包|包子|花甲|麻辣烫|烧烤|小吃|餐厅|饭店|食堂|快餐|水果|果业/, type: 'expense', category: '餐饮' },
  { pattern: /拼多多|淘宝|京东|天猫|便利店|超市|平价|三只松鼠|眼镜|安德利|云猫寄售/, type: 'expense', category: '购物' },
  // 收款码为个人姓名的商户规则含真实姓名，不入库：见 billImport.local.example.ts，经 BillImportOptions.localRules 传入
  { pattern: /红包|赢积分/, type: 'income', category: '微信红包' },
];

/** 来源分类 → 本系统分类（支付宝用「交易分类」，微信用「交易类型」） */
const CATEGORY_MAP: Record<BillSource, Record<TransactionType, Record<string, string>>> = {
  alipay: {
    expense: {
      餐饮美食: '餐饮',
      交通出行: '交通',
      爱车养车: '交通',
      日用百货: '购物',
      服饰装扮: '购物',
      数码电器: '购物',
      美容美发: '购物',
      家居家装: '购物',
      母婴亲子: '购物',
      运动户外: '购物',
      宠物: '购物',
      休闲娱乐: '娱乐',
      文化休闲: '娱乐',
      酒店旅游: '娱乐',
      住房物业: '居住',
      充值缴费: '水电话费',
      医疗健康: '医疗',
      教育培训: '教育',
      转账红包: '转账',
    },
    income: {
      投资理财: '投资收益',
    },
  },
  wechat: {
    expense: {
      转账: '转账',
      微信红包: '转账',
    },
    income: {
      微信红包: '微信红包',
    },
  },
};

/** 映射不到时的兜底分类；若系统中不存在该分类，对应行会跳过并在报告中列出 */
const FALLBACK_CATEGORY: Record<TransactionType, string> = {
  expense: '其他',
  income: '其他收入',
};

/** 收/付款方式 → 本系统支付方式（银行卡按发卡行识别）。按顺序取第一个命中 */
const PAYMENT_RULES: Array<{ pattern: RegExp; paymentMethod: string }> = [
  { pattern: /花呗/, paymentMethod: '花呗' },
  { pattern: /农业银行|农行/, paymentMethod: '农行卡' },
  { pattern: /民生/, paymentMethod: '民生信用卡' },
  { pattern: /中国银行|中行/, paymentMethod: '中行信用卡' },
  { pattern: /农商|农村商业|农村信用|农信|农金/, paymentMethod: '安徽农金' },
];
/** 钱包余额支付，以及未识别的付款方式，归为来源对应的支付方式 */
const WALLET_PATTERN = /^$|余额|余利宝|零钱/;
export const DEFAULT_PAYMENT_METHOD: Record<BillSource, string> = {
  alipay: '支付宝',
  wechat: '微信',
};

// ====================================================================
// 文件解析
// ====================================================================

export interface BillRow {
  source: BillSource;
  /** 文件中的行号（从 1 开始，含头部说明行） */
  line: number;
  time: string;
  /** 支付宝「交易分类」/ 微信「交易类型」 */
  category: string;
  counterparty: string;
  description: string;
  direction: string;
  amount: number;
  payment: string;
  status: string;
  orderNo: string;
}

type Column = Exclude<keyof BillRow, 'source' | 'line'>;

/** 各来源的列名（含新旧版本别名） */
const COLUMN_ALIASES: Record<BillSource, Record<Column, string[]>> = {
  alipay: {
    time: ['交易时间', '交易创建时间', '付款时间'],
    category: ['交易分类'],
    counterparty: ['交易对方'],
    description: ['商品说明', '商品名称'],
    direction: ['收/支'],
    amount: ['金额', '金额（元）', '金额(元)'],
    payment: ['收/付款方式'],
    status: ['交易状态'],
    orderNo: ['交易订单号', '交易号'],
  },
  wechat: {
    time: ['交易时间'],
    category: ['交易类型'],
    counterparty: ['交易对方'],
    description: ['商品'],
    direction: ['收/支'],
    amount: ['金额(元)', '金额（元）'],
    payment: ['支付方式'],
    status: ['当前状态'],
    orderNo: ['交易单号'],
  },
};

/** 解压 deflate-raw 数据（Node 传 zlib.inflateRawSync，浏览器传 DecompressionStream 实现） */
export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>;

/** 支付宝 CSV 默认 GBK；带 BOM 或能按 UTF-8 严格解码则视为 UTF-8 */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gbk').decode(bytes);
  }
}

/** 最小 ZIP 读取：解析中央目录，支持 store / deflate 两种压缩方式 */
async function readZip(bytes: Uint8Array, inflateRaw: InflateRaw): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 XLSX 文件（若是加密压缩包，请先用微信支付公众号提供的密码解压）');

  const utf8 = new TextDecoder('utf-8');
  const entries = new Map<string, Uint8Array>();
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const dataStart =
      localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + compSize);
    entries.set(name, method === 8 ? await inflateRaw(data) : data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 拼接 <si> / <is> 内所有 <t> 文本（富文本会拆成多段） */
function xmlText(fragment: string): string {
  return [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
}

/** 读取 XLSX 第一个工作表为二维数组，下标与 Excel 行号对齐（rows[0] 为第 1 行） */
async function parseXlsx(bytes: Uint8Array, inflateRaw: InflateRaw): Promise<string[][]> {
  const zip = await readZip(bytes, inflateRaw);
  const utf8 = new TextDecoder('utf-8');
  const sharedEntry = zip.get('xl/sharedStrings.xml');
  const sharedXml = sharedEntry ? utf8.decode(sharedEntry) : '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1]));
  const sheetName = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error('XLSX 中没有工作表');
  const sheetXml = utf8.decode(zip.get(sheetName)!);

  const rows: string[][] = [];
  for (const rm of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number(/\br="(\d+)"/.exec(rm[1])?.[1]);
    const cells: string[] = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cm[1])?.[1] ?? '';
      const col = [...ref].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const type = /\bt="(\w+)"/.exec(cm[1])?.[1];
      const body = cm[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = xmlText(body);
      else if (v !== undefined) value = decodeXml(v);
      cells[col] = value;
    }
    rows[rowNum - 1] = Array.from(cells, (c) => c ?? '');
  }
  return Array.from(rows, (r) => r ?? []);
}

/** 来源用 "/" 表示空值，且单元格常带尾随制表符 */
function clean(v: string | undefined): string {
  const s = (v ?? '').trim();
  return s === '/' ? '' : s;
}

/** Excel 日期序列数（1900 日期系统）→ "YYYY-MM-DD HH:mm:ss"；已是文本则原样返回 */
function normalizeTime(raw: string): string {
  if (!/^\d+(\.\d+)?$/.test(raw)) return raw;
  const ms = Math.round((Number(raw) - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** 解析账单文件（.csv / .xlsx），按表头识别来源 */
export async function parseBillFile(
  fileName: string,
  bytes: Uint8Array,
  inflateRaw: InflateRaw,
): Promise<BillRow[]> {
  const rows = /\.xlsx$/i.test(fileName) ? await parseXlsx(bytes, inflateRaw) : parseCsv(decodeText(bytes));

  const headerIdx = rows.findIndex((r) => COLUMN_ALIASES.alipay.time.includes(clean(r[0])));
  if (headerIdx < 0) {
    throw new Error('未找到「交易时间」表头，请确认是支付宝或微信导出的交易明细');
  }
  const header = rows[headerIdx].map(clean);
  const source: BillSource = header.includes('交易单号') ? 'wechat' : 'alipay';
  const aliases = COLUMN_ALIASES[source];
  const col = {} as Record<Column, number>;
  for (const [key, names] of Object.entries(aliases)) {
    col[key as Column] = header.findIndex((h) => names.includes(h));
  }
  const missing = (['time', 'direction', 'amount', 'orderNo'] as const).filter((k) => col[k] < 0);
  if (missing.length > 0) {
    throw new Error(`表头缺少必要列：${missing.map((k) => aliases[k][0]).join(', ')}`);
  }

  const result: BillRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (k: Column) => (col[k] >= 0 ? clean(r[col[k]]) : '');
    const time = normalizeTime(get('time'));
    // 文件尾部可能还有说明文字，只保留以日期开头的数据行
    if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(time)) continue;
    result.push({
      source,
      line: i + 1,
      time,
      category: get('category'),
      counterparty: get('counterparty'),
      description: get('description'),
      direction: get('direction'),
      amount: Number(get('amount').replace(/[¥￥,\s]/g, '')),
      payment: get('payment'),
      status: get('status'),
      orderNo: get('orderNo'),
    });
  }
  return result;
}

/** "2026-10-01 12:34:56" / "2026/10/1 12:34" → "2026-10-01" */
function toDate(time: string): string {
  const [y, m, d] = time.split(/[\sT]/)[0].split(/[-/]/);
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ====================================================================
// 映射
// ====================================================================

export interface ImportOutcome {
  kind: 'import';
  row: BillRow;
  tx: TransactionInput;
  /** 使用了兜底分类 */
  fallback: boolean;
  /** 付款方式未识别，归为来源默认支付方式 */
  unknownPayment: boolean;
}
export interface SkipOutcome {
  kind: 'skip';
  row: BillRow;
  reason: string;
}
type Outcome = ImportOutcome | SkipOutcome;

export interface BillImportOptions {
  /** 跳过与手工记录同日期 + 同类型 + 同金额的条目（默认 true） */
  fuzzy?: boolean;
  /** 支付宝退款按「收入 / 退款」导入（默认 false：跳过并列出） */
  includeRefunds?: boolean;
  /** 本地补充的泛化关键词（billImport.local.ts，不入库），排在内置泛化关键词之后 */
  localRules?: KeywordRule[];
}

/** 单次映射的上下文 */
interface MapContext {
  config: AppConfig;
  includeRefunds: boolean;
  genericRules: KeywordRule[];
}

const keyOf = (row: Pick<BillRow, 'source' | 'orderNo'>) => `${row.source}:${row.orderNo}`;

function mapRow(row: BillRow, ctx: MapContext): Outcome {
  return row.source === 'wechat' ? mapWechatRow(row, ctx) : mapAlipayRow(row, ctx);
}

function mapAlipayRow(row: BillRow, ctx: MapContext): Outcome {
  if (row.direction === '不计收支' || row.direction === '') {
    if (ctx.includeRefunds && /退款/.test(row.status)) {
      // 退款通常记在「不计收支」下，按收入 / 退款入账
      return toImport(row, 'income', row.amount, ctx, '退款');
    }
    return { kind: 'skip', row, reason: /退款/.test(row.status) ? '退款（需人工确认）' : '不计收支' };
  }
  if (/关闭|失败|撤销/.test(row.status)) {
    return { kind: 'skip', row, reason: `交易状态：${row.status}` };
  }
  if (/退款/.test(row.status) && !ctx.includeRefunds) {
    return { kind: 'skip', row, reason: '退款（需人工确认）' };
  }
  return mapCommon(row, ctx);
}

function mapWechatRow(row: BillRow, ctx: MapContext): Outcome {
  if (row.direction === '') return { kind: 'skip', row, reason: '中性交易' };
  // 退款单本身不入账：原交易已标注「已全额退款」或「已退款(￥x)」，在原交易上处理
  if (/退款/.test(row.category)) return { kind: 'skip', row, reason: '退款单（已在原交易扣减）' };
  if (/全额退款|已退还|失败|关闭/.test(row.status)) {
    return { kind: 'skip', row, reason: `交易状态：${row.status}` };
  }
  const refunded = /已退款[(（]?[¥￥]?([\d.]+)/.exec(row.status);
  if (refunded) {
    return mapCommon({ ...row, amount: Math.round((row.amount - Number(refunded[1])) * 100) / 100 }, ctx);
  }
  return mapCommon(row, ctx);
}

function mapCommon(row: BillRow, ctx: MapContext): Outcome {
  // 分期付款由财务规划「分期」模块按月入账，这里不重复记全额
  if (/分期/.test(row.payment)) {
    return { kind: 'skip', row, reason: '分期付款（请在分期模块登记）' };
  }
  const type: TransactionType | null =
    row.direction === '支出' ? 'expense' : row.direction === '收入' ? 'income' : null;
  if (!type) return { kind: 'skip', row, reason: `未知收/支：${row.direction}` };
  if (!Number.isFinite(row.amount) || row.amount <= 0) {
    return { kind: 'skip', row, reason: `金额无效：${row.amount}` };
  }
  return toImport(row, type, row.amount, ctx);
}

function toImport(
  row: BillRow,
  type: TransactionType,
  amount: number,
  { config, genericRules }: MapContext,
  forcedCategory?: string,
): Outcome {
  const valid = new Set(config.categories[type].map((c) => c.name));
  const text = `${row.counterparty} ${row.description}`;

  const matchKeyword = (rules: KeywordRule[]) =>
    rules.find((r) => r.type === type && r.pattern.test(text) && valid.has(r.category))?.category;

  let category = forcedCategory ?? matchKeyword(KEYWORD_RULES);
  if (!category) {
    const mapped = CATEGORY_MAP[row.source][type][row.category];
    if (mapped && valid.has(mapped)) category = mapped;
  }
  if (!category) category = matchKeyword(genericRules);
  const fallback = !category;
  if (!category) {
    category = FALLBACK_CATEGORY[type];
    if (!valid.has(category)) {
      return { kind: 'skip', row, reason: `分类无法映射：${row.category || '(空)'}` };
    }
  }
  if (!valid.has(category)) {
    return { kind: 'skip', row, reason: `系统中不存在分类：${category}` };
  }

  const validPm = new Set(config.paymentMethods.map((p) => p.name));
  const pmRule = PAYMENT_RULES.find((r) => r.pattern.test(row.payment) && validPm.has(r.paymentMethod));
  const paymentMethod = pmRule?.paymentMethod ?? DEFAULT_PAYMENT_METHOD[row.source];
  if (!validPm.has(paymentMethod)) {
    return { kind: 'skip', row, reason: `系统中不存在支付方式：${paymentMethod}` };
  }

  // 微信的商品说明常是订单号 / 收款备注，没有信息量的不写入备注
  const description = /^(收款方备注|转账备注|tradeDesc$|\w*\d{8,}\w*$)/.test(row.description) ? '' : row.description;
  const desc = [row.counterparty, description]
    .filter((s, i, arr) => s && arr.indexOf(s) === i)
    .join(' · ');
  return {
    kind: 'import',
    row,
    fallback,
    unknownPayment: !pmRule && !WALLET_PATTERN.test(row.payment),
    tx: {
      date: toDate(row.time),
      type,
      category,
      amount: Math.round(amount * 100) / 100,
      paymentMethod,
      note: `${desc} [${keyOf(row)}]`.trim(),
    },
  };
}

// ====================================================================
// 导入计划
// ====================================================================

const IMPORT_TAG = /\[(alipay|wechat):([^\]]+)\]/g;

/** 去重需要的已有交易年份（据此按年拉取已有记录） */
export function billYears(rows: BillRow[]): string[] {
  return [...new Set(rows.map((r) => toDate(r.time).slice(0, 4)))].sort();
}

export interface BillImportPlan {
  source: BillSource;
  total: number;
  toImport: ImportOutcome[];
  /** 疑似已手工记账（模糊去重命中）及对应的已有记录 */
  fuzzyMatched: Array<{ outcome: ImportOutcome; existing: Transaction }>;
  skipped: SkipOutcome[];
  /** 已按导入标签识别为已导入的条数 */
  alreadyImported: number;
  /** 需人工关注的跳过项（排除「已导入 / 不计收支 / 中性交易」） */
  attention: SkipOutcome[];
  /** 按原因汇总的跳过条数 */
  skipByReason: Array<{ reason: string; count: number }>;
  /** 未识别、已归为来源默认支付方式的原始付款方式 */
  unknownPayments: string[];
  /** 走了兜底分类的来源分类 */
  fallbackCategories: string[];
}

/**
 * 生成导入计划：映射 + 去重
 *
 * @param existing 账单涉及年份（{@link billYears}）的全部已有交易
 */
export function planBillImport(
  rows: BillRow[],
  config: AppConfig,
  existing: Transaction[],
  options: BillImportOptions = {},
): BillImportPlan {
  const { fuzzy = true, includeRefunds = false, localRules = [] } = options;
  const ctx: MapContext = { config, includeRefunds, genericRules: [...GENERIC_KEYWORD_RULES, ...localRules] };
  const outcomes = rows.map((r) => mapRow(r, ctx));

  const importedKeys = new Set(
    existing.flatMap((t) => [...(t.note ?? '').matchAll(IMPORT_TAG)].map((m) => `${m[1]}:${m[2]}`)),
  );
  // 模糊匹配池：不带导入标签的手工记录，按 日期|类型|金额 分桶；匹配一条消耗一条
  const manualPool = new Map<string, Transaction[]>();
  for (const t of existing) {
    if (/\[(alipay|wechat):/.test(t.note ?? '')) continue;
    const key = `${t.date}|${t.type}|${t.amount.toFixed(2)}`;
    manualPool.set(key, [...(manualPool.get(key) ?? []), t]);
  }

  const toImport: ImportOutcome[] = [];
  const skipped: SkipOutcome[] = [];
  const fuzzyMatched: BillImportPlan['fuzzyMatched'] = [];
  const seenKeys = new Set<string>();

  for (const o of outcomes) {
    if (o.kind === 'skip') {
      skipped.push(o);
      continue;
    }
    const key = keyOf(o.row);
    if (importedKeys.has(key) || seenKeys.has(key)) {
      skipped.push({ kind: 'skip', row: o.row, reason: '已导入' });
      continue;
    }
    seenKeys.add(key);
    if (fuzzy) {
      const bucket = manualPool.get(`${o.tx.date}|${o.tx.type}|${o.tx.amount.toFixed(2)}`);
      const match = bucket?.shift();
      if (match) {
        fuzzyMatched.push({ outcome: o, existing: match });
        continue;
      }
    }
    toImport.push(o);
  }

  const reasonCount = new Map<string, number>();
  skipped.forEach((s) => reasonCount.set(s.reason, (reasonCount.get(s.reason) ?? 0) + 1));

  return {
    source: rows[0]?.source ?? 'alipay',
    total: rows.length,
    toImport,
    fuzzyMatched,
    skipped,
    alreadyImported: reasonCount.get('已导入') ?? 0,
    attention: skipped.filter((s) => !['已导入', '不计收支', '中性交易'].includes(s.reason)),
    skipByReason: [...reasonCount].map(([reason, count]) => ({ reason, count })),
    unknownPayments: [...new Set(toImport.filter((o) => o.unknownPayment).map((o) => o.row.payment))],
    fallbackCategories: [...new Set(toImport.filter((o) => o.fallback).map((o) => o.row.category || '(空)'))],
  };
}
