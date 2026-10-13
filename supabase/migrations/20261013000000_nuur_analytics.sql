-- ==========================================================================
--  NUUR COSMETIK — statistiques de visite (anonymes)
--  À exécuter une seule fois dans Supabase (SQL Editor > New query > Run),
--  après le premier fichier.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- SESSIONS : une visite (fin après 30 min d'inactivité). Aucune donnée
-- personnelle : identifiant aléatoire du navigateur, source et appareil.
-- --------------------------------------------------------------------------
create table public.analytics_sessions (
    id              uuid primary key,
    visitor_id      uuid not null,
    is_new_visitor  boolean not null default true,
    source          text not null check (source in ('organique', 'social', 'email', 'direct', 'referent')),
    referrer_host   text not null default '' check (char_length(referrer_host) <= 120),
    utm_source      text not null default '' check (char_length(utm_source) <= 80),
    utm_medium      text not null default '' check (char_length(utm_medium) <= 80),
    utm_campaign    text not null default '' check (char_length(utm_campaign) <= 80),
    landing_page    text not null default '' check (char_length(landing_page) <= 40),
    device          text not null check (device in ('mobile', 'tablette', 'ordinateur')),
    is_demo         boolean not null default false,
    created_at      timestamptz not null default now()
);

create index analytics_sessions_created_idx on public.analytics_sessions (created_at);

-- --------------------------------------------------------------------------
-- ÉVÉNEMENTS
--   page_view       page affichée               engagement   temps actif sur une page (value = ms)
--   view_product    fiche produit ouverte       add_to_cart  ajout au panier (value = FCFA)
--   open_cart       panier ouvert               purchase     commande envoyée (value = total FCFA)
--   sign_up / login compte créé / connexion     whatsapp_click  clic vers WhatsApp (hors commande)
-- --------------------------------------------------------------------------
create table public.analytics_events (
    id          bigint generated always as identity primary key,
    session_id  uuid not null,
    visitor_id  uuid not null,
    name        text not null check (name in ('page_view', 'engagement', 'view_product', 'add_to_cart',
                                              'open_cart', 'purchase', 'sign_up', 'login', 'whatsapp_click')),
    page        text not null default '' check (char_length(page) <= 40),
    value       integer not null default 0 check (value between 0 and 100000000),
    product_id  text not null default '' check (char_length(product_id) <= 60),
    is_demo     boolean not null default false,
    created_at  timestamptz not null default now()
);

create index analytics_events_session_idx on public.analytics_events (session_id);
create index analytics_events_created_idx on public.analytics_events (created_at);

-- Les visiteurs peuvent seulement ENVOYER des données, jamais les lire.
alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;

create policy "analytics: envoi des sessions" on public.analytics_sessions
    for insert to anon, authenticated with check (true);
create policy "analytics: envoi des événements" on public.analytics_events
    for insert to anon, authenticated with check (true);

revoke all on public.analytics_sessions, public.analytics_events from anon, authenticated;
grant insert (id, visitor_id, is_new_visitor, source, referrer_host, utm_source, utm_medium, utm_campaign, landing_page, device)
    on public.analytics_sessions to anon, authenticated;
grant insert (session_id, visitor_id, name, page, value, product_id)
    on public.analytics_events to anon, authenticated;

-- --------------------------------------------------------------------------
-- TABLEAU DE BORD : tous les indicateurs en un appel, réservé à la gérante
-- --------------------------------------------------------------------------
create or replace function public.admin_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_days  integer := greatest(1, least(coalesce(p_days, 30), 365));
    v_today date := (now() at time zone 'Africa/Dakar')::date;
    v_since timestamptz := ((v_today - (v_days - 1))::timestamp at time zone 'Africa/Dakar');
    v_result jsonb;
begin
    if not public.is_admin() then
        raise exception 'Accès réservé à la gérante' using errcode = '42501';
    end if;

    with
    s as (
        select * from public.analytics_sessions where created_at >= v_since
    ),
    e as (
        select ev.* from public.analytics_events ev join s on s.id = ev.session_id
    ),
    totals as (
        select
            count(*)                                                        as sessions,
            count(distinct visitor_id)                                      as users,
            count(distinct visitor_id) filter (where is_new_visitor)        as new_users,
            count(distinct visitor_id) filter (where not is_new_visitor)    as returning_users,
            count(*) filter (where is_demo)                                 as demo_sessions
        from s
    ),
    flags as (   -- ce qui s'est passé dans chaque session
        select
            s.id,
            bool_or(e.name = 'view_product')   as viewed_product,
            bool_or(e.name = 'add_to_cart')    as added,
            bool_or(e.name = 'open_cart')      as opened_cart,
            bool_or(e.name = 'purchase')       as purchased,
            bool_or(e.name = 'sign_up')        as signed_up,
            bool_or(e.name = 'whatsapp_click') as clicked_whatsapp
        from s left join e on e.session_id = s.id
        group by s.id
    ),
    views as (
        select * from e where name = 'page_view'
    ),
    exits as (   -- dernière page vue de chaque session
        select distinct on (session_id) session_id, page
        from views
        order by session_id, created_at desc, id desc
    ),
    page_stats as (
        select
            v.page,
            count(*) as views,
            (select count(*) from exits x where x.page = v.page) as exits,
            coalesce((select sum(value) from e en where en.name = 'engagement' and en.page = v.page), 0) as engagement_ms
        from views v
        group by v.page
    ),
    days as (
        select d::date as day from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d
    )
    select jsonb_build_object(
        'days', v_days,
        'since', v_since,
        'sessions', t.sessions,
        'users', t.users,
        'new_users', t.new_users,
        'returning_users', t.returning_users,
        'demo_sessions', t.demo_sessions,
        'page_views', (select count(*) from views),
        'engagement_ms', (select coalesce(sum(value), 0) from e where name = 'engagement'),

        'daily', (
            select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'sessions', coalesce(x.n, 0), 'users', coalesce(x.u, 0)) order by d.day), '[]'::jsonb)
            from days d
            left join (
                select (created_at at time zone 'Africa/Dakar')::date as day, count(*) as n, count(distinct visitor_id) as u
                from s group by 1
            ) x on x.day = d.day
        ),
        'sources', (
            select coalesce(jsonb_object_agg(source, jsonb_build_object('sessions', n, 'users', u)), '{}'::jsonb)
            from (select source, count(*) as n, count(distinct visitor_id) as u from s group by source) x
        ),
        'devices', (
            select coalesce(jsonb_object_agg(device, n), '{}'::jsonb)
            from (select device, count(*) as n from s group by device) x
        ),
        'referrers', (
            select coalesce(jsonb_agg(jsonb_build_object('host', host, 'sessions', n) order by n desc), '[]'::jsonb)
            from (
                select coalesce(nullif(utm_source, ''), nullif(referrer_host, '')) as host, count(*) as n
                from s where source <> 'direct'
                group by 1 having coalesce(nullif(utm_source, ''), nullif(referrer_host, '')) is not null
                order by n desc limit 8
            ) x
        ),
        'pages', (
            select coalesce(jsonb_agg(jsonb_build_object('page', page, 'views', views, 'exits', exits, 'engagement_ms', engagement_ms) order by views desc), '[]'::jsonb)
            from page_stats
        ),
        'products', (
            select coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'views', v, 'adds', a) order by v desc, a desc), '[]'::jsonb)
            from (
                select product_id,
                       count(*) filter (where name = 'view_product') as v,
                       count(*) filter (where name = 'add_to_cart') as a
                from e where product_id <> '' group by product_id
            ) x
        ),
        'conversions', jsonb_build_object(
            'purchase',       jsonb_build_object('events', (select count(*) from e where name = 'purchase'),       'sessions', (select count(*) from flags where purchased)),
            'sign_up',        jsonb_build_object('events', (select count(*) from e where name = 'sign_up'),        'sessions', (select count(*) from flags where signed_up)),
            'whatsapp_click', jsonb_build_object('events', (select count(*) from e where name = 'whatsapp_click'), 'sessions', (select count(*) from flags where clicked_whatsapp))
        ),
        'revenue', (select coalesce(sum(value), 0) from e where name = 'purchase'),
        'funnel', jsonb_build_object(
            'sessions',       t.sessions,
            'viewed_product', (select count(*) from flags where viewed_product),
            'added',          (select count(*) from flags where added),
            'opened_cart',    (select count(*) from flags where added and opened_cart),
            'purchased',      (select count(*) from flags where purchased)
        ),
        'cart', jsonb_build_object(
            'with_cart',  (select count(*) from flags where added),
            'abandoned',  (select count(*) from flags where added and not purchased)
        )
    )
    into v_result
    from totals t;

    return v_result;
end;
$$;

revoke all on function public.admin_analytics(integer) from public, anon;
grant execute on function public.admin_analytics(integer) to authenticated;
