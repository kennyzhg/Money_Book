/**
 * 账单导入本地补充规则（示例）
 *
 * 复制为同目录的 `billImport.local.ts` 后按需修改。该文件已加入 .gitignore，
 * 用于存放含个人隐私、不宜公开入库的规则（如收款码为个人姓名的早餐摊、小饭馆）。
 * 网页导入与命令行脚本都会自动加载；文件不存在时忽略。
 *
 * 规则属于「泛化关键词」：仅在来源分类映射不到时生效，排在内置泛化关键词之后。
 */
import type { KeywordRule } from './billImport.ts';

export const LOCAL_KEYWORD_RULES: KeywordRule[] = [
  // 收款码为个人姓名的早餐摊 / 小饭馆
  { pattern: /张三|李四/, type: 'expense', category: '餐饮' },
];
