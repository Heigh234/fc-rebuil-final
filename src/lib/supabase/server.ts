import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/env';

export const PDF_STORAGE_BUCKET = 'bodega-fc-pdfs';

export function createServiceRoleClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
