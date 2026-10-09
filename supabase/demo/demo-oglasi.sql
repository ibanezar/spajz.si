-- Izmišljeni oglasi, da je tržnica pred zagonom videti polna.
-- Zaženi v Supabase > SQL Editor. Pobrišeš jih s supabase/demo/pobrisi-demo.sql.
--
-- Ustvari 6 izmišljenih prodajalcev (e-naslovi @demo.spajz.si, prijava z njimi ni mogoča)
-- in 12 oglasov. Slike so v projektu (img/demo/), zato je pot oblike "demo/<ime>.webp".
-- Skripto lahko zaženeš večkrat: obstoječe vrstice preskoči.

begin;

-- 1. Prodajalci (profil ustvari sprožilec ob vnosu v auth.users)
insert into auth.users (
  instance_id, id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cebelarstvo@demo.spajz.si',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Čebelarstvo Lipa"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'soncni-breg@demo.spajz.si',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Kmetija Sončni breg"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sadovnjak@demo.spajz.si',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Sadovnjak pri Ani"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'marija@demo.spajz.si',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Marija iz Šaleka"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'planina@demo.spajz.si',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Planšarija Pod vrhom"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'joze@demo.spajz.si',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Jožetov vrt"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

update public.profiles p
   set kraj = v.kraj, dolina = v.dolina, odobren = true
  from (values
    ('de000000-0000-0000-0000-000000000001'::uuid, 'Luče', 'zgornja-savinjska'),
    ('de000000-0000-0000-0000-000000000002'::uuid, 'Mozirje', 'zgornja-savinjska'),
    ('de000000-0000-0000-0000-000000000003'::uuid, 'Nazarje', 'zgornja-savinjska'),
    ('de000000-0000-0000-0000-000000000004'::uuid, 'Šoštanj', 'saleska'),
    ('de000000-0000-0000-0000-000000000005'::uuid, 'Solčava', 'zgornja-savinjska'),
    ('de000000-0000-0000-0000-000000000006'::uuid, 'Rečica ob Savinji', 'zgornja-savinjska')
  ) as v(id, kraj, dolina)
 where p.id = v.id;

-- 2. Oglasi (starost v dnevih, da so različno sveži)
insert into public.listings
  (id, user_id, naslov, opis, kategorija, cena, enota, po_dogovoru, dolina, kraj, status, ustvarjen, velja_do)
select v.id, v.user_id, v.naslov, v.opis, v.kategorija, v.cena, v.enota, v.cena is null, v.dolina, v.kraj,
       'active', now() - make_interval(hours => v.ur), now() - make_interval(hours => v.ur) + interval '30 days'
  from (values
    ('de000000-0000-0000-0001-000000000001'::uuid, 'de000000-0000-0000-0000-000000000001'::uuid,
     'Cvetlični med letošnje letine',
     'Med iz naših panjev nad Lučami. Kozarec 900 g. Prevzem na domu ali ob sobotah na tržnici v Mozirju.',
     'med', 9.00, 'kozarec', 'zgornja-savinjska', 'Luče', 2),
    ('de000000-0000-0000-0001-000000000002'::uuid, 'de000000-0000-0000-0000-000000000002'::uuid,
     'Jajca kokoši s proste reje',
     'Kokoši se pasejo na travniku za hišo. Na voljo vsak dan, za večje količine pokličite dan prej.',
     'mleko-jajca', 0.40, 'kos', 'zgornja-savinjska', 'Mozirje', 5),
    ('de000000-0000-0000-0001-000000000003'::uuid, 'de000000-0000-0000-0000-000000000002'::uuid,
     'Krompir iz domače njive',
     'Sorta desiree, primeren za pečenje in pire. Na voljo v vrečah po 10 in 25 kg.',
     'zelenjava', 0.90, 'kg', 'zgornja-savinjska', 'Mozirje', 9),
    ('de000000-0000-0000-0001-000000000004'::uuid, 'de000000-0000-0000-0000-000000000003'::uuid,
     'Jabolka idared in jonagold',
     'Ročno obrana, brez škropljenja po cvetenju. Primerna za ozimnico, zaboj približno 15 kg.',
     'sadje', 1.20, 'kg', 'zgornja-savinjska', 'Nazarje', 14),
    ('de000000-0000-0000-0001-000000000005'::uuid, 'de000000-0000-0000-0000-000000000004'::uuid,
     'Kmečki kruh iz krušne peči',
     'Polbel kruh z drožmi, pečen v krušni peči vsak petek. Naročila do srede.',
     'kruh-peka', 4.50, 'kos', 'saleska', 'Šoštanj', 20),
    ('de000000-0000-0000-0001-000000000006'::uuid, 'de000000-0000-0000-0000-000000000004'::uuid,
     'Vložene kumarice po babičinem receptu',
     'Hrustljave kumarice s koprom in gorčičnim semenom. Kozarec 720 ml.',
     'predelano', 4.00, 'kozarec', 'saleska', 'Šoštanj', 30),
    ('de000000-0000-0000-0001-000000000007'::uuid, 'de000000-0000-0000-0000-000000000005'::uuid,
     'Mehki sir iz planinskega mleka',
     'Sir iz mleka krav, ki so poletje preživele na planini. Hlebčki po približno 1 kg.',
     'mleko-jajca', 14.00, 'kg', 'zgornja-savinjska', 'Solčava', 36),
    ('de000000-0000-0000-0001-000000000008'::uuid, 'de000000-0000-0000-0000-000000000006'::uuid,
     'Paradižnik iz domačega vrta',
     'Zadnji letošnji paradižnik, mešane sorte. Odličen za omake in vlaganje.',
     'zelenjava', 2.50, 'kg', 'zgornja-savinjska', 'Rečica ob Savinji', 44),
    ('de000000-0000-0000-0001-000000000009'::uuid, 'de000000-0000-0000-0000-000000000001'::uuid,
     'Marmelada iz gozdnih sadežev',
     'Borovnice, maline in robide z naših jas. Brez dodanih konzervansov, kozarec 370 ml.',
     'predelano', 5.00, 'kozarec', 'zgornja-savinjska', 'Luče', 52),
    ('de000000-0000-0000-0001-000000000010'::uuid, 'de000000-0000-0000-0000-000000000002'::uuid,
     'Buče za juho in okras',
     'Hokaido in muškatne buče različnih velikosti. Cena po dogovoru glede na količino.',
     'zelenjava', null, null, 'zgornja-savinjska', 'Mozirje', 60),
    ('de000000-0000-0000-0001-000000000011'::uuid, 'de000000-0000-0000-0000-000000000006'::uuid,
     'Orehi letošnje letine',
     'Posušeni orehi v lupini. Na željo tudi luščeni (cena po dogovoru).',
     'drugo', 6.00, 'kg', 'zgornja-savinjska', 'Rečica ob Savinji', 70),
    ('de000000-0000-0000-0001-000000000012'::uuid, 'de000000-0000-0000-0000-000000000003'::uuid,
     'Jabolčni sok brez dodatkov',
     '100 % sok iz naših jabolk, pasteriziran. Steklenice po 1 l, vračljiva embalaža.',
     'predelano', 2.50, 'l', 'zgornja-savinjska', 'Nazarje', 80)
  ) as v(id, user_id, naslov, opis, kategorija, cena, enota, dolina, kraj, ur)
on conflict (id) do nothing;

-- 3. Slike (datoteke so v projektu: img/demo/)
insert into public.listing_images (listing_id, pot, vrstni_red)
select v.listing_id, v.pot, 0
  from (values
    ('de000000-0000-0000-0001-000000000001'::uuid, 'demo/med.webp'),
    ('de000000-0000-0000-0001-000000000002'::uuid, 'demo/jajca.webp'),
    ('de000000-0000-0000-0001-000000000003'::uuid, 'demo/krompir.webp'),
    ('de000000-0000-0000-0001-000000000004'::uuid, 'demo/jabolka.webp'),
    ('de000000-0000-0000-0001-000000000005'::uuid, 'demo/kruh.webp'),
    ('de000000-0000-0000-0001-000000000006'::uuid, 'demo/kumarice.webp'),
    ('de000000-0000-0000-0001-000000000007'::uuid, 'demo/sir.webp'),
    ('de000000-0000-0000-0001-000000000008'::uuid, 'demo/paradiznik.webp'),
    ('de000000-0000-0000-0001-000000000009'::uuid, 'demo/marmelada.webp'),
    ('de000000-0000-0000-0001-000000000010'::uuid, 'demo/buce.webp'),
    ('de000000-0000-0000-0001-000000000011'::uuid, 'demo/orehi.webp'),
    ('de000000-0000-0000-0001-000000000012'::uuid, 'demo/sok.webp')
  ) as v(listing_id, pot)
on conflict (listing_id, vrstni_red) do nothing;

commit;
