import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with Service Role Key privileges.
 * WARNING: This client bypasses Row Level Security. Use with caution.
 */
export function getSupabaseAdmin() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    return createClient(url, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}
