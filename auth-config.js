// A chave publishable identifica o projeto no cliente e pode ser distribuída.
// Nunca substitua esta chave por uma secret/service_role key.
const SUPABASE_URL = process.env.KRUMER_SUPABASE_URL
  || 'https://bcwgtutmzdhkotiuymxl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.KRUMER_SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_YKD-5OwhrWIjlHFAKDH9jw_wL6nHkd_';

const AUTH_REDIRECT_URL = 'krumer://auth/callback';
// Cloud auth and synchronization stay disabled while the beta is being polished.
const CLOUD_SYNC_ENABLED = false;

module.exports = {
  AUTH_REDIRECT_URL,
  CLOUD_SYNC_ENABLED,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
};
