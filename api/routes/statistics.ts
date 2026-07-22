import { Router } from 'express';
import { getMonthly, getOverview } from '../controllers/statisticsController.js';

const router = Router();

router.get('/monthly', getMonthly);
router.get('/overview', getOverview);

export default router;
