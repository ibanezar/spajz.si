// Nastavitve Supabase projekta (Supabase > Project Settings > API).
// Sem sodi SAMO javni "anon" ključ, ki je namenjen brskalniku in ga varuje RLS.
// Ključa service_role nikoli ne vpisuj sem ali kamorkoli v repozitorij.
window.SPAJZ_CONFIG = {
  supabaseUrl: 'https://VPIŠI-PROJEKT.supabase.co',
  supabaseAnonKey: 'VPIŠI-ANON-KLJUČ',
};
