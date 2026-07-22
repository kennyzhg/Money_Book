import { Router } from 'express';
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  batchCreateTransactions,
} from '../controllers/transactionController.js';

const router = Router();

// 注意：/batch 必须在 /:id 之前，避免被通配匹配
router.get('/', listTransactions);
router.post('/', createTransaction);
router.post('/batch', batchCreateTransactions);
router.get('/:id', getTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;
