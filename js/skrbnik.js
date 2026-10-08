// Stran skrbnik.html: potrjevanje novih uporabnikov, prijave in skriti oglasi.
// Vsa dejanja dodatno varujejo pravila RLS in funkcije v bazi (je_skrbnik).
(async function () {
  const { sb, spajzAuth, spajzPodatki } = window;
  const $ = (id) => document.getElementById(id);

  const prijava = await spajzAuth.pripravljeno;
  if (!prijava) return;
  if (!prijava.profil.je_skrbnik) {
    $('ni-skrbnik').hidden = false;
    return;
  }
  $('skrbnik').hidden = false;

  function sporocilo(besedilo, jeNapaka) {
    const el = $('sporocilo');
    el.textContent = besedilo || '';
    el.hidden = !besedilo;
    el.classList.toggle('napaka', Boolean(jeNapaka));
  }

  function povezavaOglasa(oglas) {
    const a = document.createElement('a');
    a.href = 'oglas.html?id=' + encodeURIComponent(oglas.id);
    a.textContent = oglas.naslov;
    return a;
  }

  function gumb(besedilo, ob, drugotni) {
    const g = document.createElement('button');
    g.type = 'button';
    g.className = drugotni ? 'gumb gumb-drugotni' : 'gumb';
    g.textContent = besedilo;
    g.addEventListener('click', async () => {
      g.disabled = true;
      await ob();
      g.disabled = false;
    });
    return g;
  }

  function postavka(vsebina, dejanja) {
    const li = document.createElement('li');
    li.className = 'skrbnik-postavka';
    const div = document.createElement('div');
    div.append(...vsebina);
    const d = document.createElement('div');
    d.className = 'moj-oglas-dejanja';
    d.append(...dejanja);
    li.append(div, d);
    return li;
  }

  function p(besedilo, razred) {
    const el = document.createElement('p');
    el.textContent = besedilo;
    if (razred) el.className = razred;
    return el;
  }

  async function izvedi(obljuba, uspesno) {
    const { error } = await obljuba;
    if (error) {
      sporocilo('Dejanje ni uspelo: ' + error.message, true);
      return false;
    }
    sporocilo(uspesno);
    nalozi();
    return true;
  }

  const skrij = (id) => sb.from('listings').update({ status: 'hidden' }).eq('id', id);

  async function nalozi() {
    const [cakajoci, prijave, skriti] = await Promise.all([
      sb.from('listings')
        .select('id, naslov, user_id, ustvarjen, profiles(ime, kraj)')
        .eq('status', 'pending')
        .order('ustvarjen'),
      sb.from('reports')
        .select('id, razlog, ustvarjen, listings(id, naslov, status)')
        .eq('obravnavano', false)
        .order('ustvarjen'),
      sb.from('listings')
        .select('id, naslov, profiles(ime)')
        .eq('status', 'hidden')
        .order('posodobljen', { ascending: false }),
    ]);

    // Čakajoči prvi oglasi
    const sc = $('seznam-cakajoci');
    sc.replaceChildren();
    for (const o of cakajoci.data || []) {
      const ime = o.profiles ? `${o.profiles.ime || 'brez imena'}, ${o.profiles.kraj || ''}` : '';
      sc.append(
        postavka(
          [povezavaOglasa(o), p(`${ime} · ${spajzPodatki.datum(o.ustvarjen)}`, 'pomoc')],
          [
            gumb('Potrdi uporabnika', () =>
              izvedi(sb.rpc('skrbnik_odobri_uporabnika', { p_user_id: o.user_id }),
                'Uporabnik je potrjen, njegovi oglasi so objavljeni.')),
            gumb('Skrij', () => izvedi(skrij(o.id), 'Oglas je skrit.'), true),
          ]
        )
      );
    }
    $('prazno-cakajoci').hidden = sc.children.length > 0;

    // Odprte prijave
    const sp = $('seznam-prijave');
    sp.replaceChildren();
    for (const r of prijave.data || []) {
      const o = r.listings;
      if (!o) continue;
      const oznaci = () => sb.from('reports').update({ obravnavano: true }).eq('id', r.id);
      sp.append(
        postavka(
          [
            povezavaOglasa(o),
            p(`»${r.razlog}«`),
            p(`${spajzPodatki.datum(r.ustvarjen)}${o.status === 'hidden' ? ' · oglas je že skrit' : ''}`, 'pomoc'),
          ],
          [
            gumb('Skrij oglas', async () => {
              if (await izvedi(skrij(o.id), 'Oglas je skrit.')) await oznaci();
            }),
            gumb('Zavrni prijavo', () => izvedi(oznaci(), 'Prijava je zaprta, oglas ostaja.'), true),
          ]
        )
      );
    }
    $('prazno-prijave').hidden = sp.children.length > 0;

    // Skriti oglasi
    const ss = $('seznam-skriti');
    ss.replaceChildren();
    for (const o of skriti.data || []) {
      ss.append(
        postavka(
          [povezavaOglasa(o), p((o.profiles && o.profiles.ime) || '', 'pomoc')],
          [
            gumb('Ponovno objavi', () =>
              izvedi(
                sb.from('listings')
                  .update({ status: 'active', velja_do: new Date(Date.now() + 30 * 864e5).toISOString() })
                  .eq('id', o.id),
                'Oglas je znova objavljen.'
              ), true),
          ]
        )
      );
    }
    $('prazno-skriti').hidden = ss.children.length > 0;

    if (cakajoci.error || prijave.error || skriti.error) {
      sporocilo('Nekaterih podatkov ni bilo mogoče naložiti. Osveži stran.', true);
    }
  }

  nalozi();
})();
