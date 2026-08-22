// A chave publishable identifica o projeto no cliente e pode ser distribuída.
// Nunca substitua esta chave por uma secret/service_role key.
const SUPABASE_URL = process.env.KRUMER_SUPABASE_URL
  || 'https://bcwgtutmzdhkotiuymxl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.KRUMER_SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_YKD-5OwhrWIjlHFAKDH9jw_wL6nHkd_';

const AUTH_REDIRECT_URL = 'krumer://auth/callback';

module.exports = {
  AUTH_REDIRECT_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
};
