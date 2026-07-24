/**
 * Express 应用入口
 */
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import transactionRoutes from './routes/transactions.js';
import statisticsRoutes from './routes/statistics.js';
import configRoutes from './routes/config.js';
import installmentRoutes from './routes/installments.js';
import fixedExpenseRoutes from './routes/fixedExpenses.js';
import shoppingPlanRoutes from './routes/shoppingPlans.js';
import billRoutes from './routes/bills.js';

dotenv.config();

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * API v1 路由
 * 所有路径前缀：/api/v1
 */
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/statistics', statisticsRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/installments', installmentRoutes);
app.use('/api/v1/fixed-expenses', fixedExpenseRoutes);
app.use('/api/v1/shopping-plans', shoppingPlanRoutes);
app.use('/api/v1/bills', billRoutes);

/** 健康检查 */
app.use('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, message: 'ok' });
});

/**
 * 生产环境：托管前端构建产物（dist/）
 * 这样部署时只需启动后端，前端通过同一端口访问
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 静态资源：提供导入模板下载
 * 必须在 SPA fallback 之前注册，否则 /templates/*.csv 会被 history fallback 吞掉
 */
const templatesDir = path.resolve(__dirname, '../templates');
if (fs.existsSync(templatesDir)) {
  app.use(
    '/templates',
    express.static(templatesDir, {
      // 强制浏览器下载而不是尝试渲染
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.csv')) {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="transactions_template.csv"');
        }
      },
    }),
  );
}

const clientDist = path.resolve(__dirname, '../dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA history fallback：除已注册的 API/模板前缀外，所有路径统一返回 index.html
  // 新增受保护前缀时，只需在此数组中追加即可
  const protectedPrefixes = ['api', 'templates'];
  const fallbackRegex = new RegExp(`^/(?!${protectedPrefixes.join('|')}).*`);
  app.get(fallbackRegex, (_req: Request, res: Response): void => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

/** 404 处理 */
app.use((_req: Request, res: Response): void => {
  res.status(404).json({ success: false, data: null, message: 'API not found' });
});

/** 错误处理中间件 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('[server error]', err);
  res.status(500).json({ success: false, data: null, message: '服务器内部错误' });
});

export default app;
