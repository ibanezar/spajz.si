// Prijava, profil in zaščita strani. Naloži se na vseh straneh za js/supabase.js.
//
// Strani, ki zahtevajo prijavo, imajo na <body> atribut data-zahteva-prijavo.
// Taka stran lahko počaka na preverjanje z:
//   const prijava = await spajzAuth.pripravljeno;  // { seja, profil } ali null
(function () {
  const sb = window.sb;
  let profilObljuba = null;

  async function seja() {
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  // Celoten lastni profil (tudi telefon), ki ga iz tabele ni mogoče brati neposredno.
  function profil(osvezi) {
    if (!profilObljuba || osvezi) {
      profilObljuba = sb.rpc('moj_profil').then(({ data, error }) => {
        if (error) throw error;
        return data && data.id ? data : null;
      });
    }
    return profilObljuba;
  }

  function jePopoln(p) {
    return Boolean(p && p.ime && p.ime.trim() && p.kraj && p.dolina);
  }

  // Dovoli samo preusmeritve na lastne strani (npr. "nov-oglas.html?id=..." ali
  // "nov-oglas?id=...", ker Cloudflare Pages končnico .html odstrani), da povezave
  // za prijavo ni mogoče zlorabiti za preusmeritev drugam.
  function varnaPot(pot) {
    return /^[a-z0-9-]+(\.html)?(\?[\w=&%.-]*)?$/.test(pot || '') ? pot : null;
  }

  function naPrijavo() {
    const tu = (location.pathname.split('/').pop() || 'index.html') + location.search;
    location.replace('prijava.html?naprej=' + encodeURIComponent(tu));
  }

  async function zahtevajPrijavo() {
    const s = await seja();
    if (!s) {
      naPrijavo();
      return null;
    }
    const p = await profil();
    if (!jePopoln(p)) {
      naPrijavo();
      return null;
    }
    return { seja: s, profil: p };
  }

  async function odjava() {
    await sb.auth.signOut();
    location.href = 'index.html';
  }

  // Odjava je na strani Moj profil, da glava na telefonu ostane v eni vrstici.
  async function posodobiGlavo() {
    const povezava = document.querySelector('.glava a[href="prijava.html"]');
    if (!povezava || !(await seja())) return;
    povezava.textContent = 'Moj profil';
  }

  window.spajzAuth = { seja, profil, jePopoln, varnaPot, zahtevajPrijavo, odjava };

  window.spajzAuth.pripravljeno =
    'zahtevaPrijavo' in document.body.dataset ? zahtevajPrijavo() : Promise.resolve(null);

  posodobiGlavo();
})();
