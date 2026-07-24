import { Router } from 'express';
import { shoppingPlanController } from '../controllers/shoppingPlanController.js';

const router = Router();

// 注意：/:id/purchase 必须在 /:id 之前，避免被通配
router.get('/', (req, res) => shoppingPlanController.list(req, res));
router.post('/', (req, res) => shoppingPlanController.create(req, res));
router.get('/:id', (req, res) => shoppingPlanController.get(req, res));
router.patch('/:id/purchase', (req, res) => shoppingPlanController.purchase(req, res));
router.put('/:id', (req, res) => shoppingPlanController.update(req, res));
router.delete('/:id', (req, res) => shoppingPlanController.delete(req, res));

export default router;
