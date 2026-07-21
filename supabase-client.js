// Fill in your project credentials below (Supabase Dashboard -> Project Settings -> API).
// The anon key is safe to expose in the browser as long as RLS policies are set correctly.

const SUPABASE_URL = "https://mqydllsssbornidwfslc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_K4xmv94WqLocEvWcGFBKlg_BKVbpSFW";

window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
