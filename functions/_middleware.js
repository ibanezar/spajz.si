// Cloudflare Pages Functions: predogled oglasa ob deljenju in sitemap.xml.
//
// Facebook, Viber in iskalniki ne izvajajo JavaScripta, zato meta oznake
// posameznega oglasa (naslov, slika, cena) in strukturirane podatke Product
// vstavimo v HTML že na strežniku. Funkcija teče samo za poti iz _routes.json.
//
// V Cloudflare Pages > Settings > Variables and Secrets nastavi:
//   SUPABASE_URL       npr. https://abcdefgh.supabase.co
//   SUPABASE_ANON_KEY  javni anon ključ (isti kot v js/config.js, nikoli service_role)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KATEGORIJE = {
  zelenjava: 'Zelenjava',
  sadje: 'Sadje',
  meso: 'Meso in izdelki',
  'mleko-jajca': 'Mleko in jajca',
  med: 'Med',
  'kruh-peka': 'Kruh in peka',
  predelano: 'Predelano (vloženo, sokovi)',
  drugo: 'Drugo',
};

const DOLINE = {
  'zgornja-savinjska': 'Zgornja Savinjska dolina',
  saleska: 'Šaleška dolina',
};

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();

  const url = new URL(request.url);
  try {
    if (url.pathname === '/sitemap.xml') return await sitemap(context, url);
    if (url.pathname === '/oglas' || url.pathname === '/oglas.html') return await oglas(context, url);
  } catch (napaka) {
    // Če Supabase ni dosegljiv, stran vseeno deluje (brez predogleda).
    console.error(napaka);
  }
  return context.next();
}

async function supabase(env, pot) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const odgovor = await fetch(`${env.SUPABASE_URL}/rest/v1/${pot}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  return odgovor.ok ? odgovor.json() : null;
}

// ---------------------------------------------------------------------------
// Stran oglasa
// ---------------------------------------------------------------------------

async function oglas(context, url) {
  const odgovor = await context.next();
  const id = url.searchParams.get('id') || '';
  const jeHtml = (odgovor.headers.get('content-type') || '').includes('text/html');
  if (odgovor.status !== 200 || !jeHtml || !UUID.test(id)) return odgovor;

  // Samo aktivni in veljavni oglasi (RLS za anon tako ali tako ne vrne drugih).
  const zdaj = new Date().toISOString();
  const vrstice = await supabase(
    context.env,
    `listings?select=id,naslov,opis,kategorija,cena,enota,po_dogovoru,dolina,kraj,ustvarjen,velja_do,` +
      `listing_images(pot,vrstni_red),profiles(ime)` +
      `&id=eq.${id}&status=eq.active&velja_do=gt.${encodeURIComponent(zdaj)}`
  );
  const o = vrstice && vrstice[0];
  if (!o) return odgovor;

  const kanonicni = `${url.origin}/oglas?id=${o.id}`;
  const cena = izpisCene(o);
  const kraj = [o.kraj, DOLINE[o.dolina]].filter(Boolean).join(', ');
  const opis = skrajsaj(`${cena} · ${kraj}. ${o.opis || ''}`.trim(), 200);
  const slike = (o.listing_images || [])
    .sort((a, b) => a.vrstni_red - b.vrstni_red)
    .map((s) =>
      s.pot.startsWith('demo/')
        ? `${url.origin}/img/demo/${encodeURIComponent(s.pot.slice(5))}` // izmišljeni oglasi
        : `${context.env.SUPABASE_URL}/storage/v1/object/public/oglasi/${s.pot.split('/').map(encodeURIComponent).join('/')}`
    );

  const nastavi = (vrednost) => ({
    element(el) {
      el.setAttribute('content', vrednost);
    },
  });
  const odstrani = { element: (el) => el.remove() };

  let pisec = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(`${o.naslov} | Špajz`) })
    .on('meta[name="description"]', nastavi(opis))
    .on('meta[property="og:type"]', nastavi('product'))
    .on('meta[property="og:title"]', nastavi(`${o.naslov}: ${cena}`))
    .on('meta[property="og:description"]', nastavi(opis))
    .on('meta[property="og:image:alt"]', nastavi(o.naslov));

  if (slike.length) {
    // Velikost slike oglasa ni znana, zato privzeti dimenziji odstranimo.
    pisec = pisec
      .on('meta[property="og:image"]', nastavi(slike[0]))
      .on('meta[property="og:image:width"]', odstrani)
      .on('meta[property="og:image:height"]', odstrani);
  }

  const dodatno = [
    `<link rel="canonical" href="${esc(kanonicni)}">`,
    `<meta property="og:url" content="${esc(kanonicni)}">`,
  ];
  if (o.cena != null && !o.po_dogovoru) {
    dodatno.push(
      `<meta property="product:price:amount" content="${Number(o.cena).toFixed(2)}">`,
      '<meta property="product:price:currency" content="EUR">'
    );
  }
  dodatno.push(`<script type="application/ld+json">${jsonLd(o, kanonicni, slike)}</script>`);

  return pisec
    .on('head', { element: (el) => el.append(dodatno.join('\n'), { html: true }) })
    .transform(odgovor);
}

// Strukturirani podatki schema.org/Product. Brez cene ("po dogovoru") ponudbe ne navedemo.
function jsonLd(o, url, slike) {
  const podatki = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: o.naslov,
    description: o.opis || o.naslov,
    category: KATEGORIJE[o.kategorija] || o.kategorija,
    url,
  };
  if (slike.length) podatki.image = slike;
  if (o.cena != null && !o.po_dogovoru) {
    podatki.offers = {
      '@type': 'Offer',
      price: Number(o.cena).toFixed(2),
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      priceValidUntil: o.velja_do.slice(0, 10),
      url,
      areaServed: o.kraj,
    };
    if (o.profiles && o.profiles.ime) podatki.offers.seller = { '@type': 'Person', name: o.profiles.ime };
  }
  // "<" zamenjamo, da besedilo oglasa ne more zapreti oznake <script>.
  return JSON.stringify(podatki).replace(/</g, '\\u003c');
}

function izpisCene(o) {
  if (o.po_dogovoru || o.cena == null) return 'po dogovoru';
  return `${Number(o.cena).toFixed(2).replace('.', ',')} € / ${o.enota}`;
}

function skrajsaj(besedilo, dolzina) {
  const enovrsticno = besedilo.replace(/\s+/g, ' ');
  return enovrsticno.length <= dolzina ? enovrsticno : enovrsticno.slice(0, dolzina - 1).trimEnd() + '…';
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------

async function sitemap(context, url) {
  const zdaj = new Date().toISOString();
  const oglasi =
    (await supabase(
      context.env,
      `listings?select=id,posodobljen&status=eq.active&velja_do=gt.${encodeURIComponent(zdaj)}` +
        `&order=posodobljen.desc&limit=5000`
    )) || [];

  const naslovi = [
    { loc: `${url.origin}/`, changefreq: 'daily' },
    { loc: `${url.origin}/pravila` },
    { loc: `${url.origin}/zasebnost` },
    ...oglasi.map((o) => ({ loc: `${url.origin}/oglas?id=${o.id}`, lastmod: o.posodobljen.slice(0, 10) })),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    naslovi
      .map(
        (n) =>
          `  <url><loc>${esc(n.loc)}</loc>` +
          (n.lastmod ? `<lastmod>${n.lastmod}</lastmod>` : '') +
          (n.changefreq ? `<changefreq>${n.changefreq}</changefreq>` : '') +
          '</url>'
      )
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
