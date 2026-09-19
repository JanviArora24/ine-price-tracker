function errorHandler(err, req, res, next) {
  console.error('[ErrorHandler] Error caught:', err.message, err.stack);

  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  res.status(statusCode).json({
    error: err.name || 'Error',
    message: err.message || 'An unexpected error occurred',
    ...(err.existingProduct ? { existingProduct: err.existingProduct } : {})
  });
}

module.exports = errorHandler;
