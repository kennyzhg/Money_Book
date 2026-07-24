import { Router } from 'express';
import { billController } from '../controllers/billController.js';

const router = Router();

// 预算对比报表（预计 vs 实际）
router.get('/budget-monthly', (req, res) => billController.budgetMonthly(req, res));
router.get('/budget-yearly', (req, res) => billController.budgetYearly(req, res));

// 账单总览（逐项对比）
router.get('/overview', (req, res) => billController.overview(req, res));

export default router;
