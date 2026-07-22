import { Router } from 'express';
import {
  getConfig,
  addCategory,
  removeCategory,
  addPaymentMethod,
  removePaymentMethod,
} from '../controllers/configController.js';

const router = Router();

router.get('/', getConfig);
router.post('/categories', addCategory);
router.delete('/categories/:type/:name', removeCategory);
router.post('/payment-methods', addPaymentMethod);
router.delete('/payment-methods/:name', removePaymentMethod);

export default router;
