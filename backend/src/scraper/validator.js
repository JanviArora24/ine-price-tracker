/**
 * Validation rules for scraped product price and stock data.
 * Prevents saving corrupt, empty, NaN, or decoy data to the database.
 */

function validateScrapedData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Scraped data is missing or not an object'] };
  }

  // 1. Validate Product Identification
  if (!data.productId && !data.external_product_id) {
    errors.push('Missing product ID');
  }

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Missing or empty product name');
  }

  // 2. Validate Price
  if (data.price === undefined || data.price === null) {
    errors.push('Price is undefined or null');
  } else if (typeof data.price !== 'number' || isNaN(data.price) || !isFinite(data.price)) {
    errors.push(`Price is not a valid finite number: ${data.price}`);
  } else if (data.price <= 0) {
    errors.push(`Price must be greater than zero: ${data.price}`);
  }

  // 3. Validate Stock
  if (data.stock === undefined || data.stock === null) {
    errors.push('Stock is undefined or null');
  } else if (typeof data.stock !== 'number' || isNaN(data.stock) || !Number.isInteger(data.stock)) {
    errors.push(`Stock must be a valid integer: ${data.stock}`);
  } else if (data.stock < 0) {
    errors.push(`Stock cannot be negative: ${data.stock}`);
  }

  // 4. Validate URL security (must be INE mock store domain)
  if (data.url) {
    try {
      const parsedUrl = new URL(data.url);
      if (parsedUrl.hostname !== 'demo.inelabteamdev.com' && parsedUrl.hostname !== 'localhost') {
        errors.push(`Unauthorized URL domain: ${parsedUrl.hostname}`);
      }
    } catch (e) {
      errors.push(`Malformed product URL: ${data.url}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateScrapedData
};
