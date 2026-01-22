(() => {
  const SUPABASE_URL = "https://naptzrlwfhntawmqoktt.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hcHR6cmx3ZmhudGF3bXFva3R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NjM4MzQsImV4cCI6MjA4NDIzOTgzNH0.w3yN-ohalTFFUAxWHpUr5Fb9zLSU-epOV2MSz9dheYk";

  // Cache the client instance (singleton pattern)
  let clientInstance = null;

  const getClient = () => {
    // Return cached instance if exists
    if (clientInstance) return clientInstance;

    // Check prerequisites
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("Supabase URL or Key not configured");
      return null;
    }
    
    if (!window.supabase) {
      console.error("Supabase JS library not loaded");
      return null;
    }

    if (
      SUPABASE_URL === "YOUR_SUPABASE_URL" ||
      SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
    ) {
      console.error("Please configure your Supabase credentials");
      return null;
    }

    // Create and cache the client
    // Note: lock: false fixes "signal aborted" errors in some browsers
    clientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "workout-tracker-auth",
        storage: window.localStorage,
        flowType: "pkce",
        lock: false, // Disable Lock API to fix AbortError
      },
    });

    return clientInstance;
  };

  window.supabaseClient = {
    getClient,
  };
})();
