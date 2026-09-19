const config = require('../config/env');

/**
 * Middleware to authenticate requests to the protected cron endpoint
 */
function requireCronSecret(req, res, next) {
  const secretHeader = req.headers['x-cron-secret'];
  const authHeader = req.headers['authorization'];
  const querySecret = req.query.token || req.query.secret;

  let providedSecret = secretHeader || querySecret;

  if (!providedSecret && authHeader && authHeader.startsWith('Bearer ')) {
    providedSecret = authHeader.substring(7).trim();
  }

  if (!providedSecret) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing cron secret. Provide X-Cron-Secret header or Bearer token.'
    });
  }

  if (providedSecret !== config.cronSecret) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid cron secret.'
    });
  }

  next();
}

module.exports = {
  requireCronSecret
};
