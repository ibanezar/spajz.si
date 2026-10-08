// Stran prijava.html: e-poštna povezava, prvi vnos profila in urejanje profila.
(async function () {
  const { sb, spajzAuth } = window;
  const $ = (id) => document.getElementById(id);
  const naprej = spajzAuth.varnaPot(new URLSearchParams(location.search).get('naprej'));
  let trenutnaSeja = null;

  function pokazi(korak) {
    for (const id of ['korak-eposta', 'korak-poslano', 'korak-profil']) {
      $(id).hidden = id !== korak;
    }
  }

  function sporocilo(besedilo, jeNapaka) {
    const el = $('sporocilo');
    el.textContent = besedilo || '';
    el.hidden = !besedilo;
    el.classList.toggle('napaka', Boolean(jeNapaka));
  }

  function prevediNapako(error) {
    const m = ((error && error.message) || '').toLowerCase();
    if ((error && error.status === 429) || m.includes('rate limit') || m.includes('security purposes')) {
      return 'Poslali smo že več povezav zapored. Počakaj nekaj minut in poskusi znova.';
    }
    if (m.includes('invalid') && m.includes('email')) return 'Ta e-naslov ni veljaven.';
    if (error && error.code === '23514') return 'Preveri vnose. Telefon vpiši samo s številkami, npr. 041 123 456.';
    return 'Nekaj je šlo narobe. Poskusi znova čez trenutek.';
  }

  function povratniNaslov() {
    const url = new URL('prijava.html', location.href);
    if (naprej) url.searchParams.set('naprej', naprej);
    return url.href;
  }

  async function pokaziProfil(seja) {
    trenutnaSeja = seja;
    let p;
    try {
      p = await spajzAuth.profil(true);
    } catch (e) {
      sporocilo(prevediNapako(e), true);
      return;
    }
    const nov = !spajzAuth.jePopoln(p);

    if (!nov && naprej) {
      location.replace(naprej);
      return;
    }

    $('naslov-strani').textContent = nov ? 'Dobrodošli na Špajzu' : 'Moj profil';
    $('profil-uvod').textContent = nov
      ? 'Še nekaj podatkov, da te bodo kupci lahko našli. Ime in kraj sta vidna vsem.'
      : 'Tukaj lahko popraviš svoje podatke.';
    $('ime').value = (p && p.ime) || '';
    $('kraj').value = (p && p.kraj) || '';
    $('dolina').value = (p && p.dolina) || '';
    $('telefon').value = (p && p.telefon) || '';
    $('polje-privolitev').hidden = !nov;
    $('privolitev').required = nov;
    $('gumb-shrani').textContent = nov ? 'Shrani in nadaljuj' : 'Shrani';
    $('prijavljen-kot').textContent = seja.user.email || '';
    $('povezava-skrbnik').hidden = !(p && p.je_skrbnik);
    pokazi('korak-profil');
  }

  // Pošiljanje povezave
  $('obrazec-eposta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const gumb = e.submitter || e.target.querySelector('button');
    const eposta = $('eposta').value.trim();
    gumb.disabled = true;
    sporocilo('');

    const { error } = await sb.auth.signInWithOtp({
      email: eposta,
      options: { emailRedirectTo: povratniNaslov() },
    });

    gumb.disabled = false;
    if (error) {
      sporocilo(prevediNapako(error), true);
      return;
    }
    $('poslano-na').textContent = eposta;
    pokazi('korak-poslano');
  });

  $('gumb-znova').addEventListener('click', () => {
    sporocilo('');
    pokazi('korak-eposta');
    $('eposta').focus();
  });

  // Google je viden šele, ko je v js/config.js nastavljeno googlePrijava: true.
  if (window.SPAJZ_CONFIG.googlePrijava) {
    $('google').hidden = false;
    $('gumb-google').addEventListener('click', async () => {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: povratniNaslov() },
      });
      if (error) sporocilo(prevediNapako(error), true);
    });
  }

  // Shranjevanje profila
  $('obrazec-profil').addEventListener('submit', async (e) => {
    e.preventDefault();
    const gumb = $('gumb-shrani');
    gumb.disabled = true;
    sporocilo('');

    const { error } = await sb
      .from('profiles')
      .update({
        ime: $('ime').value.trim(),
        kraj: $('kraj').value.trim(),
        dolina: $('dolina').value,
        telefon: $('telefon').value.trim() || null,
      })
      .eq('id', trenutnaSeja.user.id);

    gumb.disabled = false;
    if (error) {
      sporocilo(prevediNapako(error), true);
      return;
    }
    await spajzAuth.profil(true);
    if (naprej) {
      location.replace(naprej);
      return;
    }
    $('naslov-strani').textContent = 'Moj profil';
    $('polje-privolitev').hidden = true;
    $('privolitev').required = false;
    $('gumb-shrani').textContent = 'Shrani';
    sporocilo('Podatki so shranjeni.');
  });

  $('gumb-odjava').addEventListener('click', spajzAuth.odjava);

  // Napaka v povratni povezavi (npr. potekla ali že uporabljena povezava)
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('error') || hash.get('error_code')) {
    sporocilo(
      hash.get('error_code') === 'otp_expired'
        ? 'Povezava je potekla ali je bila že uporabljena. Vpiši e-naslov in poslali ti bomo novo.'
        : 'Prijava ni uspela. Poskusi znova.',
      true
    );
    history.replaceState(null, '', location.pathname + location.search);
  }

  const seja = await spajzAuth.seja();
  if (seja) {
    await pokaziProfil(seja);
  } else {
    pokazi('korak-eposta');
  }

  // Prijava v drugem zavihku (klik na povezavo v e-pošti) osveži tudi ta zavihek.
  sb.auth.onAuthStateChange((dogodek, novaSeja) => {
    if (dogodek === 'SIGNED_IN' && novaSeja && $('korak-profil').hidden) {
      setTimeout(() => pokaziProfil(novaSeja), 0);
    }
  });
})();
