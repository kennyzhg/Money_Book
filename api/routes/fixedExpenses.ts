import { Router } from 'express';
import { fixedExpenseController } from '../controllers/fixedExpenseController.js';

const router = Router();

router.get('/', (req, res) => fixedExpenseController.list(req, res));
router.post('/', (req, res) => fixedExpenseController.create(req, res));
router.get('/:id', (req, res) => fixedExpenseController.get(req, res));
router.put('/:id', (req, res) => fixedExpenseController.update(req, res));
router.delete('/:id', (req, res) => fixedExpenseController.delete(req, res));

export default router;
