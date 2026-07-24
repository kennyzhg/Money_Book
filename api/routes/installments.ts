import { Router } from 'express';
import { installmentController } from '../controllers/installmentController.js';

const router = Router();

// 注意：具名子路径必须在 /:id 之前
router.get('/', (req, res) => installmentController.list(req, res));
router.post('/', (req, res) => installmentController.create(req, res));
router.post('/calc', (req, res) => installmentController.calc(req, res));
router.post('/post-monthly', (req, res) => installmentController.postMonthly(req, res));
router.get('/:id', (req, res) => installmentController.get(req, res));
router.put('/:id', (req, res) => installmentController.update(req, res));
router.delete('/:id', (req, res) => installmentController.delete(req, res));

export default router;
