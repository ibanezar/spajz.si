// Stran moji-oglasi.html: pregled in upravljanje lastnih oglasov.
(async function () {
  const { sb, spajzAuth, spajzPodatki } = window;
  const $ = (id) => document.getElementById(id);
  const TRIDESET_DNI = 30 * 24 * 60 * 60 * 1000;

  const prijava = await spajzAuth.pripravljeno;
  if (!prijava) return;
  const uid = prijava.seja.user.id;

  function sporocilo(besedilo, jeNapaka) {
    const el = $('sporocilo');
    el.textContent = besedilo || '';
    el.hidden = !besedilo;
    el.classList.toggle('napaka', Boolean(jeNapaka));
  }

  // Dejansko stanje: aktiven oglas s pretečeno veljavnostjo je potekel.
  function stanje(oglas) {
    if (oglas.status === 'active' && new Date(oglas.velja_do) <= new Date()) return 'expired';
    return oglas.status;
  }

  const opisStanja = {
    active: 'Objavljen',
    pending: 'Čaka na potrditev',
    sold: 'Prodano',
    expired: 'Potekel',
    hidden: 'Skril skrbnik',
  };

  async function spremeni(oglas, podatki, uspesno) {
    const { error } = await sb.from('listings').update(podatki).eq('id', oglas.id);
    if (error) {
      sporocilo('Spremembe ni bilo mogoče shraniti. Poskusi znova.', true);
      return;
    }
    sporocilo(uspesno);
    nalozi();
  }

  async function izbrisi(oglas) {
    if (!confirm(`Res želiš izbrisati oglas »${oglas.naslov}«? Tega ni mogoče razveljaviti.`)) return;
    const poti = (oglas.listing_images || []).map((s) => s.pot);
    const { error } = await sb.from('listings').delete().eq('id', oglas.id);
    if (error) {
      sporocilo('Oglasa ni bilo mogoče izbrisati. Poskusi znova.', true);
      return;
    }
    if (poti.length) await sb.storage.from('oglasi').remove(poti);
    sporocilo(`Oglas »${oglas.naslov}« je izbrisan.`);
    nalozi();
  }

  function gumb(besedilo, opis, ob, drugotni) {
    const g = document.createElement('button');
    g.type = 'button';
    g.className = drugotni ? 'gumb gumb-drugotni' : 'gumb';
    g.textContent = besedilo;
    g.setAttribute('aria-label', opis);
    g.addEventListener('click', async () => {
      g.disabled = true;
      await ob();
      g.disabled = false;
    });
    return g;
  }

  function vrstica(oglas) {
    const s = stanje(oglas);
    const li = document.createElement('li');
    li.className = 'moj-oglas';

    const slika = (oglas.listing_images || []).sort((a, b) => a.vrstni_red - b.vrstni_red)[0];
    const img = document.createElement(slika ? 'img' : 'div');
    if (slika) {
      img.src = spajzPodatki.slikaUrl(slika.pot);
      img.alt = '';
      img.loading = 'lazy';
    }
    img.className = 'moj-oglas-slika';

    const besedilo = document.createElement('div');
    besedilo.className = 'moj-oglas-besedilo';
    const h2 = document.createElement('h2');
    const a = document.createElement('a');
    a.href = 'oglas.html?id=' + encodeURIComponent(oglas.id);
    a.textContent = oglas.naslov;
    h2.append(a);
    const cena = document.createElement('p');
    cena.textContent = spajzPodatki.cena(oglas);
    const znacka = document.createElement('p');
    znacka.className = 'znacka znacka-' + s;
    znacka.textContent = opisStanja[s] || s;
    const veljavnost = document.createElement('p');
    veljavnost.className = 'pomoc';
    veljavnost.textContent =
      s === 'active' ? `Velja do ${spajzPodatki.datum(oglas.velja_do)}` :
      s === 'pending' ? 'Prvi oglas pregleda skrbnik, nato bo objavljen.' :
      s === 'hidden' ? 'Oglas je skrit, ker krši pravila. Za pojasnilo piši skrbniku.' : '';
    besedilo.append(h2, cena, znacka, veljavnost);

    const dejanja = document.createElement('div');
    dejanja.className = 'moj-oglas-dejanja';
    const ime = `»${oglas.naslov}«`;
    const podaljsaj = () => ({ status: 'active', velja_do: new Date(Date.now() + TRIDESET_DNI).toISOString() });

    const urejanje = document.createElement('a');
    urejanje.className = 'gumb gumb-drugotni';
    urejanje.href = 'nov-oglas.html?id=' + encodeURIComponent(oglas.id);
    urejanje.textContent = 'Uredi';
    urejanje.setAttribute('aria-label', `Uredi oglas ${ime}`);
    dejanja.append(urejanje);

    if (s === 'active') {
      dejanja.append(
        gumb('Prodano', `Označi oglas ${ime} kot prodan`, () =>
          spremeni(oglas, { status: 'sold' }, `Oglas ${ime} je označen kot prodan in ni več javno viden.`), true),
        gumb('Podaljšaj za 30 dni', `Podaljšaj oglas ${ime} za 30 dni`, () =>
          spremeni(oglas, podaljsaj(), `Oglas ${ime} velja še 30 dni.`), true)
      );
    }
    if (s === 'sold' || s === 'expired') {
      dejanja.append(
        gumb('Ponovno objavi', `Ponovno objavi oglas ${ime} za 30 dni`, () =>
          spremeni(oglas, podaljsaj(), `Oglas ${ime} je znova objavljen za 30 dni.`))
      );
    }
    dejanja.append(gumb('Izbriši', `Izbriši oglas ${ime}`, () => izbrisi(oglas), true));
    dejanja.lastChild.classList.add('gumb-nevarno');

    li.append(img, besedilo, dejanja);
    return li;
  }

  async function nalozi() {
    const { data, error } = await sb
      .from('listings')
      .select('id, naslov, cena, enota, po_dogovoru, status, velja_do, listing_images(pot, vrstni_red)')
      .eq('user_id', uid)
      .order('ustvarjen', { ascending: false });

    const seznam = $('seznam-mojih');
    seznam.replaceChildren();
    if (error) {
      $('stanje').textContent = 'Oglasov ni bilo mogoče naložiti. Osveži stran.';
      return;
    }
    $('stanje').textContent = data.length ? '' : 'Še nimaš oglasov.';
    for (const oglas of data) seznam.append(vrstica(oglas));
  }

  $('vsebina-mojih').hidden = false;
  nalozi();
})();
