import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Public project URL + publishable (anon) key — safe to expose in client code.
// All real access control happens server-side via Row Level Security (Stage 1).
const SUPABASE_URL = "https://ozcwfcfcwzjjanxfvico.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KwVoNQtwp23fiZnrqCao_g_ROVmU3KZ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});
