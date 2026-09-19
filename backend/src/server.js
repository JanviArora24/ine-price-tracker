const app = require('./app');
const config = require('./config/env');

const server = app.listen(config.port, () => {
  console.log('====================================================');
  console.log(`  INE Mock Store Price Tracker API Server`);
  console.log('====================================================');
  console.log(`  Port:             ${config.port}`);
  console.log(`  Environment:      ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Mock Store URL:   ${config.mockStoreBaseUrl}`);
  console.log(`  Database Mode:    ${config.isSupabaseConfigured ? 'Supabase PostgreSQL' : 'Local Persistent Storage'}`);
  console.log(`  Health Endpoint:  http://localhost:${config.port}/api/health`);
  console.log('====================================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server process terminated.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server process terminated.');
    process.exit(0);
  });
});
