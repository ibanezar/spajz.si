-- Špajz: začetna shema
-- Zaženi v Supabase > SQL Editor. Migracija je napisana tako, da jo zaženeš enkrat.
--
-- Pregled varnosti:
--   * Vse tabele imajo vklopljen Row Level Security.
--   * Telefon ni berljiv neposredno iz tabele profiles (ne za anon ne za authenticated).
--     Kontakt vrne samo funkcija kontakt_prodajalca(), ki zahteva prijavo.
--     Svoj profil uporabnik prebere s funkcijo moj_profil().
--   * Polji odobren in je_skrbnik uporabnik ne more spremeniti (ni pravice UPDATE na stolpcu).
--   * Status oglasa, lastnika in veljavnost varuje sprožilec, ne samo odjemalec.
--
-- Opomba za frontend: ker so pravice na profiles podeljene po stolpcih,
-- `select('*')` na profiles ne deluje. Vedno naštej stolpce: id, ime, kraj, dolina.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  ime         text not null default '' check (char_length(ime) <= 80),
  kraj        text check (char_length(kraj) between 2 and 80),
  dolina      text check (dolina in ('zgornja-savinjska', 'saleska', 'drugo')),
  telefon     text check (telefon ~ '^\+?[0-9][0-9 /-]{5,19}$'),
  odobren     boolean not null default false,
  je_skrbnik  boolean not null default false,
  ustvarjen   timestamptz not null default now()
);

comment on column public.profiles.odobren is
  'Ko skrbnik potrdi prvi oglas, so nadaljnji oglasi objavljeni takoj.';

alter table public.profiles enable row level security;

-- Profil se ustvari samodejno ob registraciji (e-pošta ali Google).
create function public.ustvari_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, ime)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80)
  );
  return new;
end;
$$;

create trigger ob_novem_uporabniku
  after insert on auth.users
  for each row execute function public.ustvari_profil();

-- Pomožna funkcija za pravila. security definer, da lahko bere je_skrbnik.
create function public.je_skrbnik()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.je_skrbnik from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- Pravice po stolpcih: javno so vidni samo ime, kraj in dolina.
revoke all on public.profiles from anon, authenticated;
grant select (id, ime, kraj, dolina, ustvarjen) on public.profiles to anon, authenticated;
grant update (ime, kraj, dolina, telefon) on public.profiles to authenticated;

create policy "Profili: javno branje osnovnih podatkov"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Profili: urejanje samo svojega"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Svoj celoten profil (vključno s telefonom, odobren, je_skrbnik).
create function public.moj_profil()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------

create table public.listings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  naslov       text not null check (char_length(btrim(naslov)) between 3 and 100),
  opis         text not null default '' check (char_length(opis) <= 2000),
  kategorija   text not null check (kategorija in (
                 'zelenjava', 'sadje', 'meso', 'mleko-jajca', 'med',
                 'kruh-peka', 'predelano', 'drugo')),
  cena         numeric(8, 2) check (cena >= 0 and cena < 100000),
  enota        text check (enota in ('kg', 'kos', 'l', 'kozarec', 'zaboj')),
  po_dogovoru  boolean not null default false,
  dolina       text not null check (dolina in ('zgornja-savinjska', 'saleska', 'drugo')),
  kraj         text not null check (char_length(btrim(kraj)) between 2 and 80),
  status       text not null default 'pending'
                 check (status in ('pending', 'active', 'sold', 'expired', 'hidden')),
  ustvarjen    timestamptz not null default now(),
  posodobljen  timestamptz not null default now(),
  velja_do     timestamptz not null default now() + interval '30 days',
  iskanje      tsvector generated always as (
                 to_tsvector('simple', coalesce(naslov, '') || ' ' || coalesce(opis, ''))
               ) stored,
  -- Ali cena + enota ali "po dogovoru", nikoli oboje ali nič.
  constraint cena_ali_dogovor check (
    (po_dogovoru and cena is null and enota is null)
    or (not po_dogovoru and cena is not null and enota is not null)
  )
);

comment on column public.listings.status is
  'pending = čaka na potrditev skrbnika (prvi oglas novega uporabnika).';

create index listings_javni_idx on public.listings (velja_do desc) where status = 'active';
create index listings_user_idx on public.listings (user_id);
create index listings_kategorija_idx on public.listings (kategorija);
create index listings_dolina_idx on public.listings (dolina);
create index listings_iskanje_idx on public.listings using gin (iskanje);

alter table public.listings enable row level security;

-- Ob vnosu: lastnik, datumi in status niso v rokah odjemalca.
create function public.oglas_pred_vnosom()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Brez prijavljenega uporabnika (SQL Editor, service_role) pusti vrednosti, kot so.
  if v_uid is null then
    return new;
  end if;

  new.user_id := v_uid;
  new.ustvarjen := now();
  new.posodobljen := now();
  new.velja_do := now() + interval '30 days';

  if exists (select 1 from public.profiles p where p.id = v_uid and (p.odobren or p.je_skrbnik)) then
    new.status := 'active';
  else
    new.status := 'pending';
  end if;

  -- Preprosta zaščita pred smetmi.
  if (select count(*) from public.listings l
      where l.user_id = v_uid and l.ustvarjen > now() - interval '1 day') >= 20 then
    raise exception 'V enem dnevu lahko objaviš največ 20 oglasov.';
  end if;

  return new;
end;
$$;

create trigger oglas_pred_vnosom
  before insert on public.listings
  for each row execute function public.oglas_pred_vnosom();

-- Ob urejanju: lastnik sme spreminjati vsebino, status samo med active in sold
-- (ali iz expired nazaj v active ob podaljšanju), veljavnost največ 30 dni naprej.
create function public.oglas_pred_urejanjem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.posodobljen := now();

  if (select auth.uid()) is null or public.je_skrbnik() then
    return new;
  end if;

  new.id := old.id;
  new.user_id := old.user_id;
  new.ustvarjen := old.ustvarjen;

  if new.status is distinct from old.status then
    if old.status in ('pending', 'hidden') or new.status not in ('active', 'sold') then
      raise exception 'Tega statusa ne moreš nastaviti.';
    end if;
  end if;

  if new.velja_do > now() + interval '30 days' then
    new.velja_do := now() + interval '30 days';
  end if;

  if new.status = 'active' and new.velja_do <= now() then
    raise exception 'Oglas je potekel. Podaljšaj ga, preden ga znova objaviš.';
  end if;

  return new;
end;
$$;

create trigger oglas_pred_urejanjem
  before update on public.listings
  for each row execute function public.oglas_pred_urejanjem();

-- Javno so vidni samo aktivni in veljavni oglasi. Lastnik in skrbnik vidita vse.
create policy "Oglasi: branje"
  on public.listings for select
  to anon, authenticated
  using (
    (status = 'active' and velja_do > now())
    or user_id = (select auth.uid())
    or (select public.je_skrbnik())
  );

create policy "Oglasi: vnos samo zase"
  on public.listings for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Oglasi: urejanje svojih"
  on public.listings for update
  to authenticated
  using (user_id = (select auth.uid()) or (select public.je_skrbnik()))
  with check (user_id = (select auth.uid()) or (select public.je_skrbnik()));

create policy "Oglasi: brisanje svojih"
  on public.listings for delete
  to authenticated
  using (user_id = (select auth.uid()) or (select public.je_skrbnik()));

-- ---------------------------------------------------------------------------
-- listing_images
-- ---------------------------------------------------------------------------

create table public.listing_images (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  pot         text not null check (char_length(pot) <= 300),
  vrstni_red  smallint not null check (vrstni_red between 0 and 3),
  unique (listing_id, vrstni_red)  -- skupaj s check: največ 4 slike na oglas
);

create index listing_images_listing_idx on public.listing_images (listing_id);

alter table public.listing_images enable row level security;

-- Sliko vidi, kdor vidi oglas (pravila na listings veljajo tudi v podpoizvedbi).
create policy "Slike: branje ob vidnem oglasu"
  on public.listing_images for select
  to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

-- Pot mora biti v mapi uporabnika: <user_id>/<listing_id>/<datoteka>
create policy "Slike: vnos k svojemu oglasu"
  on public.listing_images for insert
  to authenticated
  with check (
    exists (select 1 from public.listings l
            where l.id = listing_id and l.user_id = (select auth.uid()))
    and pot like (select auth.uid())::text || '/' || listing_id::text || '/%'
  );

create policy "Slike: urejanje pri svojem oglasu"
  on public.listing_images for update
  to authenticated
  using (exists (select 1 from public.listings l
                 where l.id = listing_id and l.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.listings l
            where l.id = listing_id and l.user_id = (select auth.uid()))
    and pot like (select auth.uid())::text || '/' || listing_id::text || '/%'
  );

create policy "Slike: brisanje pri svojem oglasu"
  on public.listing_images for delete
  to authenticated
  using (
    exists (select 1 from public.listings l
            where l.id = listing_id and l.user_id = (select auth.uid()))
    or (select public.je_skrbnik())
  );

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  razlog       text not null check (char_length(btrim(razlog)) between 3 and 500),
  obravnavano  boolean not null default false,
  ustvarjen    timestamptz not null default now(),
  unique (listing_id, reporter_id)  -- en uporabnik prijavi oglas enkrat
);

create index reports_odprte_idx on public.reports (ustvarjen desc) where not obravnavano;

alter table public.reports enable row level security;

create policy "Prijave: ustvari prijavljen uporabnik"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and obravnavano = false
    and exists (select 1 from public.listings l where l.id = listing_id)
  );

create policy "Prijave: bere skrbnik"
  on public.reports for select
  to authenticated
  using ((select public.je_skrbnik()));

create policy "Prijave: ureja skrbnik"
  on public.reports for update
  to authenticated
  using ((select public.je_skrbnik()))
  with check ((select public.je_skrbnik()));

create policy "Prijave: briše skrbnik"
  on public.reports for delete
  to authenticated
  using ((select public.je_skrbnik()));

-- ---------------------------------------------------------------------------
-- Funkcije
-- ---------------------------------------------------------------------------

-- Kontakt prodajalca: samo za prijavljene in samo za oglas, ki ga uporabnik vidi.
create function public.kontakt_prodajalca(p_listing_id uuid)
returns table (ime text, telefon text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Za ogled kontakta se prijavi.';
  end if;

  return query
    select p.ime, p.telefon, u.email::text
    from public.listings l
    join public.profiles p on p.id = l.user_id
    join auth.users u on u.id = l.user_id
    where l.id = p_listing_id
      and ((l.status = 'active' and l.velja_do > now())
           or l.user_id = v_uid
           or public.je_skrbnik());
end;
$$;

-- Skrbnik potrdi uporabnika: profil postane odobren, čakajoči oglasi se objavijo.
create function public.skrbnik_odobri_uporabnika(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.je_skrbnik() then
    raise exception 'Samo za skrbnike.';
  end if;

  update public.profiles set odobren = true where id = p_user_id;

  update public.listings
     set status = 'active', velja_do = now() + interval '30 days'
   where user_id = p_user_id and status = 'pending';
end;
$$;

-- Izbris računa (GDPR): izbriše uporabnika, profil, oglase, slike v tabeli in prijave.
-- Datoteke v shrambi mora frontend izbrisati PRED klicem (storage API),
-- ker Supabase ne dovoli neposrednega brisanja iz storage.objects.
create function public.izbrisi_racun()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Nisi prijavljen.';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

-- Neobvezno: označi potekle oglase. RLS jih skrije že sam (velja_do),
-- to je le za urejen prikaz statusa. Lahko se kliče s pg_cron:
--   select cron.schedule('potekli-oglasi', '15 3 * * *', 'select public.oznaci_potekle()');
create function public.oznaci_potekle()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.listings set status = 'expired'
  where status = 'active' and velja_do <= now();
$$;

-- Pravice za funkcije: privzeto jih lahko kliče PUBLIC, zato jih zapremo.
revoke execute on function public.ustvari_profil() from public, anon, authenticated;
revoke execute on function public.oglas_pred_vnosom() from public, anon, authenticated;
revoke execute on function public.oglas_pred_urejanjem() from public, anon, authenticated;
revoke execute on function public.oznaci_potekle() from public, anon, authenticated;
revoke execute on function public.moj_profil() from public, anon;
revoke execute on function public.kontakt_prodajalca(uuid) from public, anon;
revoke execute on function public.skrbnik_odobri_uporabnika(uuid) from public, anon;
revoke execute on function public.izbrisi_racun() from public, anon;
grant execute on function public.moj_profil() to authenticated;
grant execute on function public.kontakt_prodajalca(uuid) to authenticated;
grant execute on function public.skrbnik_odobri_uporabnika(uuid) to authenticated;
grant execute on function public.izbrisi_racun() to authenticated;
-- je_skrbnik() ostane na voljo vsem, ker ga uporabljajo pravila (anon dobi false).

-- ---------------------------------------------------------------------------
-- Shramba slik
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oglasi', 'oglasi', true, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Javno branje (vedro je javno, slike se prikazujejo prek javnega URL-ja).
create policy "Slike oglasov: javno branje"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'oglasi');

-- Nalaganje, menjava in brisanje samo v mapi <user_id>/...
create policy "Slike oglasov: nalaganje v svojo mapo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'oglasi'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Slike oglasov: menjava v svoji mapi"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'oglasi'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'oglasi'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Slike oglasov: brisanje v svoji mapi"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'oglasi'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select public.je_skrbnik()))
  );

-- ---------------------------------------------------------------------------
-- Prvi skrbnik: po prvi prijavi zaženi ročno (zamenjaj e-naslov):
--   update public.profiles set je_skrbnik = true, odobren = true
--   where id = (select id from auth.users where email = 'tvoj@naslov.si');
-- ---------------------------------------------------------------------------
