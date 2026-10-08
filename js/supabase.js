// Skupni Supabase odjemalec za vse strani.
(function () {
  const { supabaseUrl, supabaseAnonKey } = window.SPAJZ_CONFIG;
  window.sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
})();
