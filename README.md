# Špajz (spajz.si)

Lokalna tržnica Zgornje Savinjske in Šaleške doline. Čisti HTML, CSS in JS, zaledje Supabase.

## Postavitev baze

1. V Supabase odpri **SQL Editor** in zaženi `supabase/migrations/20261008000000_zacetna_shema.sql`.
2. Prijavi se na strani, nato zase zaženi (zamenjaj e-naslov):
   ```sql
   update public.profiles set je_skrbnik = true, odobren = true
   where id = (select id from auth.users where email = 'tvoj@naslov.si');
   ```
3. V `js/config.js` vpiši URL projekta in **anon** ključ (nikoli `service_role`).

## Kako deluje zaščita podatkov

- Javno so vidni samo aktivni oglasi z veljavnostjo v prihodnosti. Lastnik in skrbnik vidita tudi svoje skrite, čakajoče in potekle.
- Iz `profiles` sta javno berljiva samo ime, kraj in dolina. Telefon in e-naslov vrne funkcija `kontakt_prodajalca(listing_id)`, ki zahteva prijavo. Svoj profil prebereš z `moj_profil()`.
- Status (`pending`, `active`, `sold`, `expired`, `hidden`), lastnika in veljavnost oglasa varuje sprožilec v bazi. Prvi oglasi neodobrenega uporabnika so `pending`, dokler skrbnik ne pokliče `skrbnik_odobri_uporabnika(user_id)`.
- Slike: vedro `oglasi` (javno, največ 1 MB, JPEG ali WebP). Pot je `<user_id>/<listing_id>/<datoteka>`, nalaganje je dovoljeno samo v svojo mapo.
- Izbris računa: `izbrisi_racun()` izbriše uporabnika z vsemi oglasi in prijavami. Datoteke v shrambi mora frontend izbrisati pred klicem.

## Objava na Cloudflare Pages

1. Cloudflare > Workers & Pages > Create > Pages > Connect to Git, izberi ta repozitorij.
2. Build command: prazno. Build output directory: `/`.
3. Settings > Variables and Secrets (Production in Preview):
   - `SUPABASE_URL` = URL projekta
   - `SUPABASE_ANON_KEY` = javni anon ključ (nikoli `service_role`)
4. Funkcija `functions/_middleware.js` (poti v `_routes.json`) vstavi v `oglas?id=…`
   meta oznake Open Graph in strukturirane podatke Product ter ustvari `sitemap.xml`.
   Lokalno s `python -m http.server` ne teče.
5. Predogled preveri v Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
