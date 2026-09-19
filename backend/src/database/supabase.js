const { createClient } = require('@supabase/supabase-js');
const config = require('../config/env');

let supabase = null;

if (config.isSupabaseConfigured) {
  try {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('[Database] Supabase client initialized with Service Role credentials.');
  } catch (err) {
    console.error('[Database] Failed to initialize Supabase client:', err.message);
    supabase = null;
  }
} else {
  console.warn('[Database] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Using local persistent storage mode.');
}

module.exports = supabase;
