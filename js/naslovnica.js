// Naslovnica: seznam aktivnih oglasov s filtri in iskanjem.
(function () {
  const { sb, spajzPodatki } = window;
  const $ = (id) => document.getElementById(id);
  const NA_STRAN = 24;
  let stran = 0;
  let zahteva = 0; // da starejši odgovor ne povozi novejšega

  spajzPodatki.napolniIzbiro($('filter-kategorija'), spajzPodatki.kategorije);
  spajzPodatki.napolniIzbiro($('filter-dolina'), spajzPodatki.doline);

  // Filtri iz naslova strani (?q=med&kategorija=med&dolina=saleska)
  const zacetni = new URLSearchParams(location.search);
  $('iskanje').value = zacetni.get('q') || '';
  if (zacetni.get('kategorija') in spajzPodatki.kategorije) $('filter-kategorija').value = zacetni.get('kategorija');
  if (zacetni.get('dolina') in spajzPodatki.doline) $('filter-dolina').value = zacetni.get('dolina');

  function filtri() {
    return {
      q: $('iskanje').value.trim(),
      kategorija: $('filter-kategorija').value,
      dolina: $('filter-dolina').value,
    };
  }

  function zapisiVNaslov(f) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    const niz = p.toString();
    history.replaceState(null, '', niz ? '?' + niz : location.pathname);
  }

  // Iskalni niz v poizvedbo za tsvector: vsaka beseda kot začetek besede (med:* & domač:*).
  // Ostanejo samo črke in številke, zato uporabnik ne more pokvariti poizvedbe.
  function iskalnaPoizvedba(q) {
    const besede = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    return besede.slice(0, 6).map((b) => b + ':*').join(' & ');
  }

  function kartica(oglas) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'kartica';
    a.href = 'oglas.html?id=' + encodeURIComponent(oglas.id);

    const slika = (oglas.listing_images || []).sort((x, y) => x.vrstni_red - y.vrstni_red)[0];
    if (slika) {
      const img = document.createElement('img');
      spajzPodatki.mala(img, slika.pot);
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 400;
      img.height = 300;
      a.append(img);
    } else {
      const ni = document.createElement('div');
      ni.className = 'kartica-brez-slike';
      ni.textContent = spajzPodatki.kategorije[oglas.kategorija] || '';
      a.append(ni);
    }

    const besedilo = document.createElement('div');
    besedilo.className = 'kartica-besedilo';
    const naslov = document.createElement('h2');
    naslov.textContent = oglas.naslov;
    const cena = document.createElement('p');
    cena.className = 'kartica-cena';
    cena.textContent = spajzPodatki.cena(oglas);
    const kraj = document.createElement('p');
    kraj.className = 'kartica-kraj';
    kraj.textContent = oglas.kraj;
    besedilo.append(naslov, cena, kraj);
    a.append(besedilo);
    li.append(a);
    return li;
  }

  async function nalozi(dodaj) {
    const id = ++zahteva;
    const f = filtri();
    if (!dodaj) {
      stran = 0;
      zapisiVNaslov(f);
    }

    $('stanje').textContent = 'Nalagam oglase …';
    $('gumb-vec').hidden = true;

    let poizvedba = sb
      .from('listings')
      .select('id, naslov, cena, enota, po_dogovoru, kraj, kategorija, listing_images(pot, vrstni_red)')
      .eq('status', 'active')
      .gt('velja_do', new Date().toISOString())
      .order('ustvarjen', { ascending: false })
      .range(stran * NA_STRAN, stran * NA_STRAN + NA_STRAN); // en več, da vemo, ali je še kaj

    if (f.kategorija) poizvedba = poizvedba.eq('kategorija', f.kategorija);
    if (f.dolina) poizvedba = poizvedba.eq('dolina', f.dolina);
    const tsq = iskalnaPoizvedba(f.q);
    if (tsq) poizvedba = poizvedba.textSearch('iskanje', tsq, { config: 'simple' });

    const { data, error } = await poizvedba;
    if (id !== zahteva) return;

    const seznam = $('seznam-oglasov');
    if (!dodaj) seznam.replaceChildren();

    if (error) {
      $('stanje').textContent = 'Oglasov trenutno ni mogoče naložiti. Poskusi znova čez trenutek.';
      return;
    }

    const jeVec = data.length > NA_STRAN;
    for (const oglas of data.slice(0, NA_STRAN)) seznam.append(kartica(oglas));
    $('gumb-vec').hidden = !jeVec;

    const skupaj = seznam.children.length;
    const filtrirano = f.q || f.kategorija || f.dolina;
    if (skupaj === 0) {
      $('stanje').textContent = filtrirano
        ? 'Ni oglasov, ki bi ustrezali iskanju. Poskusi z manj filtri.'
        : 'Oglasov še ni. Bodi prvi in objavi, kar imaš!';
    } else {
      $('stanje').textContent = filtrirano ? `Najdenih oglasov: ${skupaj}${jeVec ? '+' : ''}` : '';
    }
  }

  // Iskanje sproži ob tipkanju (s kratkim zamikom), filtri ob spremembi.
  let zamik;
  $('iskanje').addEventListener('input', () => {
    clearTimeout(zamik);
    zamik = setTimeout(() => nalozi(false), 300);
  });
  $('filtri').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(zamik);
    nalozi(false);
  });
  $('filter-kategorija').addEventListener('change', () => nalozi(false));
  $('filter-dolina').addEventListener('change', () => nalozi(false));
  $('gumb-vec').addEventListener('click', () => {
    stran += 1;
    nalozi(true);
  });

  nalozi(false);
})();
