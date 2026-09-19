const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const productRoutes = require('./routes/productRoutes');
const trackerRoutes = require('./routes/trackerRoutes');
const cronRoutes = require('./routes/cronRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Cron-Secret']
}));
app.use(express.json());

// Request logging in development
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/api/health')) {
      console.log(`[HTTP] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: config.isSupabaseConfigured ? 'supabase-postgresql' : 'local-storage-mode',
    mockStoreUrl: config.mockStoreBaseUrl
  });
});

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/tracker', trackerRoutes);
app.use('/api/cron', cronRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
