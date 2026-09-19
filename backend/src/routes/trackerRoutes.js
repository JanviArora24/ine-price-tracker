const express = require('express');
const router = express.Router();
const trackerController = require('../controllers/trackerController');

router.get('/', trackerController.listTrackedProducts);
router.post('/', trackerController.trackProduct);
router.get('/:id', trackerController.getTrackedProductById);
router.delete('/:id', trackerController.untrackProduct);
router.post('/:id/scrape', trackerController.scrapeSingleProduct);
router.get('/:id/history', trackerController.getProductHistory);
router.get('/:id/logs', trackerController.getProductLogs);

module.exports = router;
