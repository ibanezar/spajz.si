# Špajz (spajz.si)

Lokalna tržnica Zgornje Savinjske in Šaleške doline. Prodajalci objavijo oglase
(naslov, opis, slike, cena, kontakt), kupci brskajo in kontaktirajo neposredno.
Špajz = narečna beseda za shrambo.

## Jezik in ton
- Vsa vsebina v slovenščini, topel in preprost ton.
- Cene se prikazujejo kot "3,50 € / kg" ali "po dogovoru". Na strani sta cena in evro dovoljena.
- Brez ® in TM pri imenih izdelkov.

## Tehnika
- Frontend: čisti HTML, CSS, JS. Brez ogrodij in brez gradnje.
- Zaledje: Supabase (Postgres, Auth, Storage). V frontend samo anon ključ.
- Vsak dostop do podatkov mora zaščititi Row Level Security. Brez izjem.
- Mobilni pogled je prvi (promet pride iz Facebooka).
- Slike pomanjšaj v brskalniku pred nalaganjem (največ 1200 px, JPEG ali WebP).
- Brez zunanjih sledilnikov. Pisave samo sistemske ali lokalne.
- Dostopnost: kontrast, alt besedila, povezave s smiselnim besedilom.

## Pravila dela
- Pred večjo spremembo povej načrt v 3 do 5 točkah.
- Migracije so v supabase/migrations/. SQL napiši, jaz ga zaženem v Supabase.
- Po vsaki zaključeni celoti naredi git commit.
- Ne dodajaj paketov brez vprašanja.
- Ključev in gesel nikoli ne piši v kodo. Uporabi .env, ki je v .gitignore.
