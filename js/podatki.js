// Skupni seznami in oblikovanje. Vrednosti se ujemajo z omejitvami v bazi.
window.spajzPodatki = (function () {
  const kategorije = {
    zelenjava: 'Zelenjava',
    sadje: 'Sadje',
    meso: 'Meso in izdelki',
    'mleko-jajca': 'Mleko in jajca',
    med: 'Med',
    'kruh-peka': 'Kruh in peka',
    predelano: 'Predelano (vloženo, sokovi)',
    drugo: 'Drugo',
  };

  const enote = {
    kg: 'kg',
    kos: 'kos',
    l: 'l',
    kozarec: 'kozarec',
    zaboj: 'zaboj',
  };

  const doline = {
    'zgornja-savinjska': 'Zgornja Savinjska dolina',
    saleska: 'Šaleška dolina',
    drugo: 'Drugo',
  };

  const oblikaCene = new Intl.NumberFormat('sl-SI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // "3,50 € / kg" ali "po dogovoru"
  function cena(oglas) {
    if (oglas.po_dogovoru || oglas.cena == null) return 'po dogovoru';
    return `${oblikaCene.format(oglas.cena)} € / ${enote[oglas.enota] || oglas.enota}`;
  }

  // "8. 10. 2026" (brskalniki imena mesecev ne sklanjajo vedno pravilno)
  function datum(niz) {
    const d = new Date(niz);
    return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
  }

  // Javni URL slike v vedru "oglasi"
  function slikaUrl(pot) {
    return window.sb.storage.from('oglasi').getPublicUrl(pot).data.publicUrl;
  }

  // Napolni <select> z možnostmi iz seznama.
  function napolniIzbiro(select, seznam) {
    for (const [vrednost, besedilo] of Object.entries(seznam)) {
      select.add(new Option(besedilo, vrednost));
    }
  }

  return { kategorije, enote, doline, cena, datum, slikaUrl, napolniIzbiro };
})();
