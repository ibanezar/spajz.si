// Stran oglas.html?id=...: galerija, opis in kontakt prodajalca.
(async function () {
  const { sb, spajzAuth, spajzPodatki } = window;
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id') || '';

  function niNaVoljo() {
    $('nalaganje').hidden = true;
    $('ni-oglasa').hidden = false;
    document.title = 'Oglas ni na voljo | Špajz';
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    niNaVoljo();
    return;
  }

  const { data: oglas, error } = await sb
    .from('listings')
    .select(
      'id, user_id, naslov, opis, kategorija, cena, enota, po_dogovoru, dolina, kraj, status, ustvarjen, velja_do, ' +
        'listing_images(pot, vrstni_red), profiles(ime)'
    )
    .eq('id', id)
    .maybeSingle();

  // RLS vrne oglas samo, če je aktiven ali če je bralec lastnik oz. skrbnik.
  if (error || !oglas) {
    niNaVoljo();
    return;
  }

  document.title = `${oglas.naslov} | Špajz`;
  $('naslov').textContent = oglas.naslov;
  $('cena').textContent = spajzPodatki.cena(oglas);
  $('kategorija').textContent = spajzPodatki.kategorije[oglas.kategorija] || oglas.kategorija;
  $('kraj').textContent = `${oglas.kraj}, ${spajzPodatki.doline[oglas.dolina] || ''}`.replace(/, Drugo$/, '');
  $('prodajalec').textContent = (oglas.profiles && oglas.profiles.ime) || 'Prodajalec';
  $('objavljeno').textContent = spajzPodatki.datum(oglas.ustvarjen);
  $('opis').textContent = oglas.opis || '';
  $('opis').hidden = !oglas.opis;

  // Opomba lastniku, če oglas ni javno viden
  const potekel = new Date(oglas.velja_do) <= new Date();
  const opombe = {
    pending: 'Oglas čaka na potrditev skrbnika in še ni javno viden.',
    hidden: 'Skrbnik je oglas skril. Javno ni viden.',
    sold: 'Oglas je označen kot prodan in ni javno viden.',
    expired: 'Oglas je potekel. Podaljšaš ga v razdelku Moji oglasi.',
  };
  const opomba = opombe[oglas.status] || (potekel ? opombe.expired : '');
  if (opomba) {
    $('opomba').textContent = opomba;
    $('opomba').hidden = false;
  }

  // Galerija
  const slike = (oglas.listing_images || []).sort((a, b) => a.vrstni_red - b.vrstni_red);
  if (slike.length) {
    const glavna = $('glavna-slika');
    const pokazi = (i) => {
      glavna.src = spajzPodatki.slikaUrl(slike[i].pot);
      glavna.alt = slike.length > 1 ? `${oglas.naslov}, slika ${i + 1} od ${slike.length}` : oglas.naslov;
      for (const [j, g] of [...$('slicice').children].entries()) {
        g.firstChild.setAttribute('aria-current', j === i ? 'true' : 'false');
      }
    };
    if (slike.length > 1) {
      slike.forEach((s, i) => {
        const li = document.createElement('li');
        const gumb = document.createElement('button');
        gumb.type = 'button';
        gumb.setAttribute('aria-label', `Pokaži sliko ${i + 1}`);
        const img = document.createElement('img');
        img.src = spajzPodatki.slikaUrl(s.pot);
        img.alt = '';
        img.loading = 'lazy';
        gumb.append(img);
        gumb.addEventListener('click', () => pokazi(i));
        li.append(gumb);
        $('slicice').append(li);
      });
    }
    pokazi(0);
    $('galerija').hidden = false;
  }

  $('nalaganje').hidden = true;
  $('oglas').hidden = false;

  // Kontakt: samo za prijavljene (telefon in e-naslov vrne funkcija v bazi).
  const seja = await spajzAuth.seja();
  const naPrijavo = 'prijava.html?naprej=' + encodeURIComponent('oglas.html?id=' + oglas.id);
  const lastnik = seja && seja.user.id === oglas.user_id;

  // Prijava neprimernega oglasa (ne za lastnika)
  if (!lastnik) {
    $('prijava-oglasa').hidden = false;
    if (!seja) {
      $('prijava-neprijavljen').hidden = false;
      $('prijava-neprijavljen').querySelector('a').href = naPrijavo;
    } else {
      $('obrazec-prijava').hidden = false;
      $('obrazec-prijava').addEventListener('submit', async (e) => {
        e.preventDefault();
        const gumb = e.target.querySelector('button');
        gumb.disabled = true;
        const opomba = $('prijava-opomba').value.trim();
        const { error: napaka } = await sb.from('reports').insert({
          listing_id: oglas.id,
          razlog: ($('prijava-razlog').value + (opomba ? ': ' + opomba : '')).slice(0, 500),
        });
        gumb.disabled = false;
        const izid = $('prijava-izid');
        izid.hidden = false;
        izid.classList.toggle('napaka', Boolean(napaka && napaka.code !== '23505'));
        if (!napaka || napaka.code === '23505') {
          e.target.hidden = true;
          izid.textContent = napaka
            ? 'Tvoja prijava tega oglasa je že zabeležena. Skrbnik ga bo pregledal.'
            : 'Hvala! Skrbnik bo oglas pregledal.';
        } else {
          izid.textContent = 'Prijave ni bilo mogoče poslati. Poskusi znova.';
        }
      });
    }
  }

  if (lastnik) {
    $('lastnik-uredi').href = 'nov-oglas.html?id=' + encodeURIComponent(oglas.id);
    $('lastnik').hidden = false;
  }

  if (!seja) {
    $('kontakt-prijava').href = naPrijavo;
    $('kontakt-prijava').hidden = false;
    return;
  }

  $('gumb-kontakt').hidden = false;
  $('gumb-kontakt').addEventListener('click', async () => {
    $('gumb-kontakt').disabled = true;
    const { data, error: napaka } = await sb.rpc('kontakt_prodajalca', { p_listing_id: oglas.id });
    const k = data && data[0];
    if (napaka || !k) {
      $('gumb-kontakt').disabled = false;
      $('kontakt-napaka').hidden = false;
      return;
    }

    const dl = $('kontakt-podatki');
    const vrstica = (oznaka, vsebina) => {
      const dt = document.createElement('dt');
      dt.textContent = oznaka;
      const dd = document.createElement('dd');
      dd.append(vsebina);
      dl.append(dt, dd);
    };
    const povezava = (href, besedilo) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = besedilo;
      return a;
    };

    vrstica('Ime', k.ime || '');
    if (k.telefon) vrstica('Telefon', povezava('tel:' + k.telefon.replace(/[^\d+]/g, ''), k.telefon));
    if (k.email) {
      const zadeva = encodeURIComponent('Špajz: ' + oglas.naslov);
      vrstica('E-pošta', povezava(`mailto:${k.email}?subject=${zadeva}`, k.email));
    }
    $('gumb-kontakt').hidden = true;
    $('kontakt-napaka').hidden = true;
    dl.hidden = false;
  });
})();
