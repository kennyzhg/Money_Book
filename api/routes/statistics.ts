import { Router } from 'express';
import { getAvailableYears, getMonthly, getOverview } from '../controllers/statisticsController.js';

const router = Router();

router.get('/monthly', getMonthly);
router.get('/years', getAvailableYears);
router.get('/overview', getOverview);

export default router;
