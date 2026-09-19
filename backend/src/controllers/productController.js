const searchService = require('../services/searchService');

async function searchProducts(req, res, next) {
  try {
    const { q = '', page = 1, pageSize = 24 } = req.query;
    const result = await searchService.searchProducts(q, parseInt(page, 10), parseInt(pageSize, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getProductDetails(req, res, next) {
  try {
    const { id } = req.params;
    const details = await searchService.getProductDetails(id);
    if (!details) {
      return res.status(404).json({ error: 'NotFound', message: `Product ${id} not found in mock store` });
    }
    res.json(details);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchProducts,
  getProductDetails
};
