-- ==========================================================================
--  NUUR COSMETIK — comptes clients, commandes, favoris
--  À exécuter une seule fois dans Supabase (SQL Editor > New query > Run),
--  ou via `supabase db push`.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- PROFILS (un par compte client, créé automatiquement à l'inscription)
-- --------------------------------------------------------------------------
create table public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    full_name   text not null default '' check (char_length(full_name) <= 120),
    phone       text not null default '' check (char_length(phone) <= 40),
    zone        text not null default '' check (char_length(zone) <= 80),
    address     text not null default '' check (char_length(address) <= 300),
    is_admin    boolean not null default false,
    created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name, phone)
    values (
        new.id,
        left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
        left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 40)
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;

create policy "profiles: lecture du sien ou admin" on public.profiles
    for select to authenticated
    using (id = auth.uid() or public.is_admin());

create policy "profiles: modification du sien" on public.profiles
    for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- Un client ne peut modifier que ces colonnes (jamais is_admin)
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, zone, address) on public.profiles to authenticated;

-- --------------------------------------------------------------------------
-- COMMANDES (enregistrées au moment du clic sur « Commander sur WhatsApp »)
-- --------------------------------------------------------------------------
create table public.orders (
    id             uuid primary key default gen_random_uuid(),
    ref            text not null unique check (ref ~ '^NUUR-[A-Z0-9]{4,10}$'),
    user_id        uuid references auth.users (id) on delete set null,
    customer_name  text not null check (char_length(customer_name) between 1 and 120),
    phone          text not null default '' check (char_length(phone) <= 40),
    zone           text not null default '' check (char_length(zone) <= 80),
    address        text not null default '' check (char_length(address) <= 300),
    note           text not null default '' check (char_length(note) <= 500),
    -- [{ "id": "gommage", "name": "Gommage", "size": "100 ml", "price": 3000, "qty": 2 }, ...]
    items          jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
    total          integer not null default 0,
    status         text not null default 'envoyee'
                   check (status in ('envoyee', 'confirmee', 'livree', 'annulee')),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_created_idx on public.orders (created_at desc);

-- Valide les articles et recalcule le total côté serveur
create or replace function public.orders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if exists (
        select 1 from jsonb_array_elements(new.items) as i
        where jsonb_typeof(i -> 'price') is distinct from 'number'
           or jsonb_typeof(i -> 'qty') is distinct from 'number'
           or (i ->> 'qty')::numeric not between 1 and 99
           or (i ->> 'price')::numeric not between 0 and 10000000
           or char_length(coalesce(i ->> 'name', '')) not between 1 and 120
    ) then
        raise exception 'Articles de commande invalides';
    end if;

    new.total := (
        select coalesce(sum((i ->> 'price')::numeric * (i ->> 'qty')::numeric), 0)::integer
        from jsonb_array_elements(new.items) as i
    );
    new.updated_at := now();
    return new;
end;
$$;

create trigger orders_before_write
    before insert or update on public.orders
    for each row execute function public.orders_before_write();

alter table public.orders enable row level security;

-- Tout visiteur (connecté ou non) peut passer commande ; un client connecté
-- ne peut rattacher la commande qu'à son propre compte.
create policy "orders: tout le monde peut commander" on public.orders
    for insert to anon, authenticated
    with check (user_id is null or user_id = auth.uid());

create policy "orders: lecture des siennes ou admin" on public.orders
    for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

create policy "orders: seule la gérante change le statut" on public.orders
    for update to authenticated
    using (public.is_admin())
    with check (public.is_admin());

revoke all on public.orders from anon, authenticated;
grant insert (ref, user_id, customer_name, phone, zone, address, note, items) on public.orders to anon, authenticated;
grant select on public.orders to authenticated;
grant update (status) on public.orders to authenticated;

-- --------------------------------------------------------------------------
-- FAVORIS
-- --------------------------------------------------------------------------
create table public.favorites (
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    product_id  text not null check (char_length(product_id) between 1 and 60),
    created_at  timestamptz not null default now(),
    primary key (user_id, product_id)
);

alter table public.favorites enable row level security;

create policy "favorites: les siens" on public.favorites
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

-- --------------------------------------------------------------------------
-- PING : appelé tous les 3 jours par GitHub Actions pour éviter la mise en
-- pause automatique des projets Supabase gratuits inactifs.
-- --------------------------------------------------------------------------
create or replace function public.ping()
returns boolean
language sql
stable
set search_path = ''
as $$ select true; $$;

grant execute on function public.ping() to anon;
