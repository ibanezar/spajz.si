// Skupni Supabase odjemalec za vse strani.
(function () {
  const { supabaseUrl, supabaseAnonKey } = window.SPAJZ_CONFIG;
  window.sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Implicitni tok: povezava iz e-pošte deluje tudi, če jo uporabnik odpre
      // v drugem brskalniku (npr. v aplikaciji za pošto na telefonu).
      flowType: 'implicit',
    },
  });
})();
