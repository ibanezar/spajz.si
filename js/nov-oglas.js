// Stran nov-oglas.html: nov oglas ali urejanje obstoječega (nov-oglas.html?id=...).
(async function () {
  const { sb, spajzAuth, spajzPodatki, spajzSlike } = window;
  const $ = (id) => document.getElementById(id);
  const NAJVEC_SLIK = 4;
  // Nove slike: { blob, tip, koncnica, predogled }
  // Obstoječe slike: { obstojeca: { id, pot }, predogled }
  const slike = [];
  const odstranjene = []; // obstoječe slike, ki jih je uporabnik odstranil

  const prijava = await spajzAuth.pripravljeno;
  if (!prijava) return; // auth.js je že preusmeril na prijavo
  const uid = prijava.seja.user.id;
  const urejanjeId = new URLSearchParams(location.search).get('id');

  function sporocilo(besedilo, jeNapaka) {
    const el = $('sporocilo');
    el.textContent = besedilo || '';
    el.hidden = !besedilo;
    el.classList.toggle('napaka', Boolean(jeNapaka));
    if (besedilo) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Izbirni seznami in privzete vrednosti iz profila
  spajzPodatki.napolniIzbiro($('kategorija'), spajzPodatki.kategorije);
  spajzPodatki.napolniIzbiro($('enota'), spajzPodatki.enote);
  spajzPodatki.napolniIzbiro($('dolina'), spajzPodatki.doline);
  $('dolina').value = prijava.profil.dolina || '';
  $('kraj').value = prijava.profil.kraj || '';

  // Urejanje: naloži oglas (RLS in pogoj user_id zagotovita, da je res tvoj)
  if (urejanjeId) {
    const { data: oglas } = await sb
      .from('listings')
      .select('id, naslov, opis, kategorija, cena, enota, po_dogovoru, dolina, kraj, listing_images(id, pot, vrstni_red)')
      .eq('id', urejanjeId)
      .eq('user_id', uid)
      .maybeSingle();

    if (!oglas) {
      $('naslov-strani').textContent = 'Oglasa ni mogoče urejati';
      sporocilo('Oglas ne obstaja ali ni tvoj.', true);
      return;
    }

    document.title = 'Uredi oglas | Špajz';
    $('naslov-strani').textContent = 'Uredi oglas';
    $('gumb-objavi').textContent = 'Shrani spremembe';
    $('naslov').value = oglas.naslov;
    $('opis').value = oglas.opis || '';
    $('kategorija').value = oglas.kategorija;
    $('po-dogovoru').checked = oglas.po_dogovoru;
    $('cena').value = oglas.cena == null ? '' : String(oglas.cena).replace('.', ',');
    $('enota').value = oglas.enota || '';
    $('dolina').value = oglas.dolina;
    $('kraj').value = oglas.kraj;
    for (const s of (oglas.listing_images || []).sort((a, b) => a.vrstni_red - b.vrstni_red)) {
      slike.push({ obstojeca: { id: s.id, pot: s.pot }, predogled: spajzPodatki.slikaUrl(s.pot) });
    }
  }

  $('obrazec-oglas').hidden = false;

  // Cena ali "po dogovoru"
  function posodobiCeno() {
    const dogovor = $('po-dogovoru').checked;
    for (const id of ['cena', 'enota']) {
      $(id).disabled = dogovor;
      $(id).required = !dogovor;
    }
    $('polje-cena').classList.toggle('onemogoceno', dogovor);
  }
  $('po-dogovoru').addEventListener('change', posodobiCeno);
  posodobiCeno();

  // Sprejme "3,50", "3.50" ali "3"; vrne število ali null, če ni veljavno.
  function preberiCeno(besedilo) {
    const s = besedilo.trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return null;
    return Number(s);
  }

  // Slike
  function izrisiSlike() {
    const seznam = $('seznam-slik');
    seznam.replaceChildren();
    slike.forEach((s, i) => {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = s.predogled;
      img.alt = i === 0 ? 'Naslovna slika' : `Slika ${i + 1}`;
      const gumb = document.createElement('button');
      gumb.type = 'button';
      gumb.className = 'odstrani-sliko';
      gumb.textContent = 'Odstrani';
      gumb.setAttribute('aria-label', `Odstrani sliko ${i + 1}`);
      gumb.addEventListener('click', () => {
        if (s.obstojeca) odstranjene.push(s.obstojeca);
        else URL.revokeObjectURL(s.predogled);
        slike.splice(i, 1);
        izrisiSlike();
      });
      li.append(img, gumb);
      seznam.append(li);
    });
    const polno = slike.length >= NAJVEC_SLIK;
    $('slike').disabled = polno;
    $('oznaka-slike').classList.toggle('onemogoceno', polno);
    $('stevec-slik').textContent = `${slike.length} od ${NAJVEC_SLIK}`;
  }

  $('slike').addEventListener('change', async (e) => {
    const datoteke = Array.from(e.target.files);
    e.target.value = '';
    const prosto = NAJVEC_SLIK - slike.length;
    if (datoteke.length > prosto) {
      sporocilo(`Dodaš lahko največ ${NAJVEC_SLIK} slike. Upoštevane so prve ${prosto}.`, true);
    } else {
      sporocilo('');
    }
    $('stevec-slik').textContent = 'Pripravljam slike …';
    for (const datoteka of datoteke.slice(0, prosto)) {
      try {
        const s = await spajzSlike.pomanjsaj(datoteka);
        s.predogled = URL.createObjectURL(s.blob);
        slike.push(s);
      } catch (napaka) {
        sporocilo(napaka.message, true);
      }
    }
    izrisiSlike();
  });
  izrisiSlike();

  // Oddaja
  function prevediNapako(error) {
    const m = ((error && error.message) || '').toLowerCase();
    if (m.includes('20 oglasov')) return 'V enem dnevu lahko objaviš največ 20 oglasov.';
    if (error && error.code === '23514') return 'Preveri vnose. Nekaj ni v dovoljeni obliki.';
    if (m.includes('payload too large') || m.includes('exceeded the maximum')) return 'Slika je prevelika.';
    return 'Oglasa ni bilo mogoče shraniti. Poskusi znova čez trenutek.';
  }

  // Naloži nove slike in jih zapiše v listing_images. Vrne poti naloženih datotek;
  // ob napaki vrže napako, ki ima v .poti že naložene datoteke.
  async function naloziNove(listingId, gumb) {
    const poti = [];
    const novi = slike.filter((s) => !s.obstojeca);
    try {
      for (const [i, s] of slike.entries()) {
        if (s.obstojeca) continue;
        gumb.textContent = `Nalagam sliko ${poti.length + 1} od ${novi.length} …`;
        // <user_id>/<listing_id>/<zaporedje>-<naključno>.<končnica>
        const pot = `${uid}/${listingId}/${i}-${crypto.randomUUID().slice(0, 8)}.${s.koncnica}`;
        const nalozi = await sb.storage.from('oglasi').upload(pot, s.blob, {
          contentType: s.tip,
          cacheControl: '31536000',
        });
        if (nalozi.error) throw nalozi.error;
        poti.push(pot);
        const vnos = await sb.from('listing_images').insert({ listing_id: listingId, pot, vrstni_red: i });
        if (vnos.error) throw vnos.error;
      }
    } catch (napaka) {
      napaka.poti = poti;
      throw napaka;
    }
    return poti;
  }

  function sporociloSlik(napaka, dodatek) {
    const podrobno = prevediNapako(napaka);
    sporocilo(
      'Slik ni bilo mogoče naložiti' + dodatek + ' ' +
        (podrobno.startsWith('Oglasa ni bilo') ? 'Poskusi znova čez trenutek.' : podrobno),
      true
    );
  }

  function uspeh(naslov, besedilo, listingId, javno) {
    $('obrazec-oglas').hidden = true;
    $('naslov-strani').textContent = naslov;
    $('uspeh-besedilo').textContent = besedilo;
    $('povezava-oglas').href = 'oglas.html?id=' + encodeURIComponent(listingId);
    $('povezava-oglas').hidden = !javno;
    $('uspeh').hidden = false;
    $('naslov-strani').focus();
  }

  $('obrazec-oglas').addEventListener('submit', async (e) => {
    e.preventDefault();
    sporocilo('');

    const dogovor = $('po-dogovoru').checked;
    const cena = dogovor ? null : preberiCeno($('cena').value);
    if (!dogovor && cena === null) {
      sporocilo('Cena naj bo število, npr. 3,50.', true);
      $('cena').focus();
      return;
    }

    const gumb = $('gumb-objavi');
    const besediloGumba = gumb.textContent;
    const ponastavi = () => {
      gumb.disabled = false;
      gumb.textContent = besediloGumba;
    };
    gumb.disabled = true;
    gumb.textContent = 'Shranjujem …';

    const podatki = {
      naslov: $('naslov').value.trim(),
      opis: $('opis').value.trim(),
      kategorija: $('kategorija').value,
      cena,
      enota: dogovor ? null : $('enota').value,
      po_dogovoru: dogovor,
      dolina: $('dolina').value,
      kraj: $('kraj').value.trim(),
    };

    if (urejanjeId) {
      await shraniUrejanje(podatki, gumb, ponastavi);
      return;
    }

    const { data: oglas, error } = await sb.from('listings').insert(podatki).select('id, status').single();
    if (error) {
      ponastavi();
      sporocilo(prevediNapako(error), true);
      return;
    }

    try {
      await naloziNove(oglas.id, gumb);
    } catch (napaka) {
      // Nov oglas brez slik ne pustimo napol narejenega.
      if (napaka.poti.length) await sb.storage.from('oglasi').remove(napaka.poti);
      await sb.from('listings').delete().eq('id', oglas.id);
      ponastavi();
      sporociloSlik(napaka, ', zato oglas ni shranjen.');
      return;
    }

    const javno = oglas.status === 'active';
    uspeh(
      javno ? 'Oglas je objavljen' : 'Oglas je oddan',
      javno
        ? 'Hvala! Oglas je viden vsem 30 dni. Pred iztekom ga lahko podaljšaš v razdelku Moji oglasi.'
        : 'Hvala! Ker je to tvoj prvi oglas, ga bo pred objavo na hitro pregledal skrbnik. Nato bodo tvoji oglasi objavljeni takoj.',
      oglas.id,
      javno
    );
  });

  async function shraniUrejanje(podatki, gumb, ponastavi) {
    const { data: oglas, error } = await sb
      .from('listings')
      .update(podatki)
      .eq('id', urejanjeId)
      .select('id, status, velja_do')
      .single();
    if (error) {
      ponastavi();
      sporocilo(prevediNapako(error), true);
      return;
    }

    // 1. odstranjene slike: najprej vrstice, nato datoteke
    if (odstranjene.length) {
      await sb.from('listing_images').delete().in('id', odstranjene.map((s) => s.id));
      await sb.storage.from('oglasi').remove(odstranjene.map((s) => s.pot));
      odstranjene.length = 0;
    }

    // 2. ostale obstoječe slike oštevilči po novem vrstnem redu (0, 1, 2 …).
    //    Vrstni red se le zmanjšuje, zato se številke vmes ne podvojijo.
    for (const [i, s] of slike.entries()) {
      if (s.obstojeca) await sb.from('listing_images').update({ vrstni_red: i }).eq('id', s.obstojeca.id);
    }

    // 3. nove slike
    try {
      await naloziNove(urejanjeId, gumb);
    } catch (napaka) {
      if (napaka.poti.length) {
        // naložene, a nezapisane datoteke pobrišemo; zapisane ostanejo
        const { data: zapisane } = await sb.from('listing_images').select('pot').eq('listing_id', urejanjeId);
        const ostanejo = new Set((zapisane || []).map((z) => z.pot));
        const odvecne = napaka.poti.filter((p) => !ostanejo.has(p));
        if (odvecne.length) await sb.storage.from('oglasi').remove(odvecne);
      }
      ponastavi();
      sporociloSlik(napaka, '. Besedilo oglasa je shranjeno.');
      return;
    }

    const javno = oglas.status === 'active' && new Date(oglas.velja_do) > new Date();
    uspeh('Spremembe so shranjene', 'Oglas je posodobljen.', oglas.id, javno);
  }
})();
