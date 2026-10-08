// Nastavitve Supabase projekta (Supabase > Project Settings > API).
// Sem sodi SAMO javni "anon" ključ, ki je namenjen brskalniku in ga varuje RLS.
// Ključa service_role nikoli ne vpisuj sem ali kamorkoli v repozitorij.
window.SPAJZ_CONFIG = {
  supabaseUrl: 'https://wrgrjzugitphlbrqibfc.supabase.co/rest/v1/',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZ3JqenVnaXRwaGxicnFpYmZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NzExOTAsImV4cCI6MjEwNzA0NzE5MH0.361jO1moYFmOTDnccEy1E9w5_HUjswvCscdO-v3fRe4',
};
