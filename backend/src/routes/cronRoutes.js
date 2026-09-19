const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');
const { requireCronSecret } = require('../middleware/auth');

// Protected endpoint for cron-job.org
router.post('/scrape', requireCronSecret, cronController.triggerCronScrape);
router.get('/scrape', requireCronSecret, cronController.triggerCronScrape);

module.exports = router;
