// Stran nov-oglas.html: obrazec za nov oglas s slikami.
(async function () {
  const { sb, spajzAuth, spajzPodatki, spajzSlike } = window;
  const $ = (id) => document.getElementById(id);
  const NAJVEC_SLIK = 4;
  const slike = []; // { blob, tip, koncnica, predogled }

  const prijava = await spajzAuth.pripravljeno;
  if (!prijava) return; // auth.js je že preusmeril na prijavo
  const uid = prijava.seja.user.id;

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
        URL.revokeObjectURL(s.predogled);
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

  async function pocisti(listingId, poti) {
    if (poti.length) await sb.storage.from('oglasi').remove(poti);
    await sb.from('listings').delete().eq('id', listingId);
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
    gumb.disabled = true;
    gumb.textContent = 'Shranjujem …';

    const { data: oglas, error } = await sb
      .from('listings')
      .insert({
        naslov: $('naslov').value.trim(),
        opis: $('opis').value.trim(),
        kategorija: $('kategorija').value,
        cena,
        enota: dogovor ? null : $('enota').value,
        po_dogovoru: dogovor,
        dolina: $('dolina').value,
        kraj: $('kraj').value.trim(),
      })
      .select('id, status')
      .single();

    if (error) {
      gumb.disabled = false;
      gumb.textContent = 'Objavi oglas';
      sporocilo(prevediNapako(error), true);
      return;
    }

    // Slike: <user_id>/<listing_id>/<zaporedje>-<naključno>.<končnica>
    const poti = [];
    try {
      for (const [i, s] of slike.entries()) {
        gumb.textContent = `Nalagam sliko ${i + 1} od ${slike.length} …`;
        const pot = `${uid}/${oglas.id}/${i}-${crypto.randomUUID().slice(0, 8)}.${s.koncnica}`;
        const nalozi = await sb.storage.from('oglasi').upload(pot, s.blob, {
          contentType: s.tip,
          cacheControl: '31536000',
        });
        if (nalozi.error) throw nalozi.error;
        poti.push(pot);
        const vnos = await sb.from('listing_images').insert({ listing_id: oglas.id, pot, vrstni_red: i });
        if (vnos.error) throw vnos.error;
      }
    } catch (napaka) {
      await pocisti(oglas.id, poti);
      gumb.disabled = false;
      gumb.textContent = 'Objavi oglas';
      const podrobno = prevediNapako(napaka);
      sporocilo(
        'Slik ni bilo mogoče naložiti, zato oglas ni shranjen. ' +
          (podrobno.startsWith('Oglasa ni bilo') ? 'Poskusi znova čez trenutek.' : podrobno),
        true
      );
      return;
    }

    $('obrazec-oglas').hidden = true;
    $('naslov-strani').textContent = oglas.status === 'active' ? 'Oglas je objavljen' : 'Oglas je oddan';
    $('uspeh-besedilo').textContent =
      oglas.status === 'active'
        ? 'Hvala! Oglas je viden vsem 30 dni. Pred iztekom ga lahko podaljšaš v razdelku Moji oglasi.'
        : 'Hvala! Ker je to tvoj prvi oglas, ga bo pred objavo na hitro pregledal skrbnik. Nato bodo tvoji oglasi objavljeni takoj.';
    $('povezava-oglas').href = 'oglas.html?id=' + encodeURIComponent(oglas.id);
    $('povezava-oglas').hidden = oglas.status !== 'active';
    $('uspeh').hidden = false;
    $('naslov-strani').focus();
  });
})();
