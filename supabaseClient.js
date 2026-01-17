(() => {
  const SUPABASE_URL = "https://naptzrlwfhntawmqoktt.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcHR6cmx3ZmhudGF3bXFva3R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NjM4MzQsImV4cCI6MjA4NDIzOTgzNH0.w3yN-ohalTFFUAxWHpUr5Fb9zLSU-epOV2MSz9dheYk";

  const getClient = () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) return null;
    if (
      SUPABASE_URL === "YOUR_SUPABASE_URL" ||
      SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
    ) {
      return null;
    }
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  };

  window.supabaseClient = {
    getClient,
  };
})();

