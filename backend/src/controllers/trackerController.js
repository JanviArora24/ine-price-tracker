const trackerService = require('../services/trackerService');

async function listTrackedProducts(req, res, next) {
  try {
    const products = await trackerService.listTrackedProducts();
    res.json({ products, total: products.length });
  } catch (err) {
    next(err);
  }
}

async function getTrackedProductById(req, res, next) {
  try {
    const { id } = req.params;
    const product = await trackerService.getTrackedProductById(id);
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function trackProduct(req, res, next) {
  try {
    const { externalProductId } = req.body;
    if (!externalProductId) {
      return res.status(400).json({ error: 'BadRequest', message: 'externalProductId is required in request body' });
    }
    const tracked = await trackerService.trackProduct(externalProductId);
    res.status(201).json(tracked);
  } catch (err) {
    next(err);
  }
}

async function scrapeSingleProduct(req, res, next) {
  try {
    const { id } = req.params;
    const result = await trackerService.scrapeSingleProduct(id);
    if (!result.success) {
      // 200 returned with success: false and details, so client UI can display error state
      return res.status(200).json({
        success: false,
        message: 'Scrape attempt failed after retries. Valid product data was preserved.',
        ...result
      });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function untrackProduct(req, res, next) {
  try {
    const { id } = req.params;
    const success = await trackerService.untrackProduct(id);
    res.json({ success, message: `Product ${id} untracked successfully` });
  } catch (err) {
    next(err);
  }
}

async function getProductHistory(req, res, next) {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    const history = await trackerService.getProductHistory(id, parseInt(limit, 10));
    res.json({ history, total: history.length });
  } catch (err) {
    next(err);
  }
}

async function getProductLogs(req, res, next) {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    const logs = await trackerService.getProductLogs(id, parseInt(limit, 10));
    res.json({ logs, total: logs.length });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listTrackedProducts,
  getTrackedProductById,
  trackProduct,
  scrapeSingleProduct,
  untrackProduct,
  getProductHistory,
  getProductLogs
};
