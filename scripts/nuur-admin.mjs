#!/usr/bin/env node
// ==========================================================================
//  NUUR COSMETIK — outils d'administration (à lancer sur votre ordinateur)
//
//    npm run seed:demo                 crée une cliente de démo + un vrai historique de commandes
//    npm run clean:demo                supprime la cliente de démo et ses commandes
//    npm run seed:analytics            ajoute 60 jours de visites de démonstration (statistiques)
//    npm run clean:analytics           supprime ces visites de démonstration
//    npm run make-admin -- email@x.com donne l'accès « Espace gérante » à un compte existant
//    npm run make-admin -- email@x.com --create   crée le compte s'il n'existe pas encore
//    npm run make-admin -- email@x.com --remove   retire cet accès
//
//  Nécessite un fichier .env (jamais envoyé sur GitHub) contenant :
//    SUPABASE_URL=https://xxxx.supabase.co
//    SUPABASE_SECRET_KEY=sb_secret_...      (ou l'ancienne "service_role key")
// ==========================================================================
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- .env -----------------------------------------------------------------
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('❌ SUPABASE_URL et SUPABASE_SECRET_KEY doivent être définis (fichier .env à la racine du projet).');
    process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// --- Catalogue (le même que sur le site) -----------------------------------
globalThis.window = globalThis.window || {};
await import(pathToFileURL(join(ROOT, 'assets/js/products.js')).href);
const PRODUCTS = Object.fromEntries(window.NUUR_PRODUCTS.map(p => [p.id, p]));

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'cliente.demo@example.com';
const DEMO = {
    full_name: 'Fatou Sow',
    phone: '77 123 45 67',
    zone: 'Dakar & banlieue',
    address: 'Sacré-Cœur 3, Dakar',
};

// Historique : [jours écoulés, statut, [[produit, format, quantité], ...], remarque]
const DEMO_ORDERS = [
    [118, 'livree', [['lotion-capillaire', '200 ml', 1], ['spray-croissance', '100 ml', 1]], ''],
    [71, 'livree', [['huile-hydratante', '60 ml', 1], ['gommage', '100 ml', 1]], 'Livraison après 17h svp'],
    [22, 'livree', [['masque-argile', '100 ml', 2], ['lotion-capillaire', '100 ml', 1]], ''],
    [3, 'confirmee', [['spray-croissance', '50 ml', 2], ['huile-hydratante', '30 ml', 1]], ''],
];

// --- Helpers ---------------------------------------------------------------
function orderRef() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'NUUR-' + [...randomBytes(6)].map(b => alphabet[b % alphabet.length]).join('');
}

function item(id, size, qty) {
    const p = PRODUCTS[id];
    const v = p?.variants.find(x => x.size === size);
    if (!v) throw new Error(`Produit/format introuvable dans products.js : ${id} ${size}`);
    return { id, name: p.name, size, price: v.price, qty };
}

async function findUserByEmail(email) {
    for (let page = 1; ; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const u = data.users.find(x => x.email?.toLowerCase() === email.toLowerCase());
        if (u) return u;
        if (data.users.length < 200) return null;
    }
}

const fail = (msg, err) => { console.error(`❌ ${msg}`, err?.message || err || ''); process.exit(1); };
const fcfa = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' FCFA';

// --- Commandes ------------------------------------------------------------
async function seedDemo() {
    const password = process.env.DEMO_PASSWORD || 'Nuur-' + randomBytes(5).toString('hex');
    let user = await findUserByEmail(DEMO_EMAIL);

    if (user) {
        const { error } = await sb.auth.admin.updateUserById(user.id, { password });
        if (error) fail('Mise à jour du compte démo impossible :', error);
    } else {
        const { data, error } = await sb.auth.admin.createUser({
            email: DEMO_EMAIL,
            password,
            email_confirm: true,
            user_metadata: { full_name: DEMO.full_name, phone: DEMO.phone },
        });
        if (error) fail('Création du compte démo impossible :', error);
        user = data.user;
    }

    const { error: profileError } = await sb.from('profiles').update(DEMO).eq('id', user.id);
    if (profileError) fail('Profil démo :', profileError);

    // On repart d'un historique propre à chaque lancement
    await sb.from('orders').delete().eq('user_id', user.id);
    await sb.from('favorites').delete().eq('user_id', user.id);

    const now = Date.now();
    const rows = DEMO_ORDERS.map(([daysAgo, status, items, note]) => ({
        ref: orderRef(),
        user_id: user.id,
        customer_name: DEMO.full_name,
        phone: DEMO.phone,
        zone: DEMO.zone,
        address: DEMO.address,
        note,
        items: items.map(i => item(...i)),
        status,
        created_at: new Date(now - daysAgo * 86400000 - Math.floor(Math.random() * 8) * 3600000).toISOString(),
    }));
    const { data: orders, error: ordersError } = await sb.from('orders').insert(rows).select('ref, total, status, created_at');
    if (ordersError) fail('Création des commandes démo :', ordersError);

    const { error: favError } = await sb.from('favorites').insert(
        ['lotion-capillaire', 'huile-hydratante'].map(product_id => ({ user_id: user.id, product_id })));
    if (favError) fail('Favoris démo :', favError);

    console.log('✅ Compte de démonstration prêt\n');
    console.log(`   Email        : ${DEMO_EMAIL}`);
    console.log(`   Mot de passe : ${password}\n`);
    for (const o of orders.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        console.log(`   ${o.ref}  ${o.created_at.slice(0, 10)}  ${o.status.padEnd(9)}  ${fcfa(o.total)}`);
    }
    console.log('\n   Pour le supprimer avant le lancement : npm run clean:demo');
}

async function cleanDemo() {
    const user = await findUserByEmail(DEMO_EMAIL);
    if (!user) return console.log('ℹ️  Aucun compte de démonstration à supprimer.');
    const { error: e1 } = await sb.from('orders').delete().eq('user_id', user.id);
    if (e1) fail('Suppression des commandes démo :', e1);
    const { error: e2 } = await sb.auth.admin.deleteUser(user.id);
    if (e2) fail('Suppression du compte démo :', e2);
    console.log(`✅ Compte ${DEMO_EMAIL} et ses commandes supprimés.`);
}

async function makeAdmin(email, remove, create) {
    if (!email) fail('Indiquez l’email du compte : npm run make-admin -- email@exemple.com');
    let user = await findUserByEmail(email);
    let password = null;
    if (!user && create && !remove) {
        password = process.env.ADMIN_PASSWORD || 'Nuur-' + randomBytes(5).toString('hex');
        const { data, error } = await sb.auth.admin.createUser({
            email, password, email_confirm: true, user_metadata: { full_name: process.env.ADMIN_NAME || 'Nuur Cosmetik' },
        });
        if (error) fail('Création du compte impossible :', error);
        user = data.user;
    }
    if (!user) fail(`Aucun compte avec l’email ${email}. Créez-le depuis la page « Mon Compte » du site, ou ajoutez --create.`);
    const { error } = await sb.from('profiles').update({ is_admin: !remove }).eq('id', user.id);
    if (error) fail('Mise à jour impossible :', error);
    console.log(remove
        ? `✅ ${email} n’a plus accès à l’Espace gérante.`
        : `✅ ${email} a maintenant accès à l’Espace gérante (menu Mon Compte > Espace gérante).`);
    if (password) console.log(`   Compte créé — mot de passe : ${password}`);
}

// --- Statistiques de démonstration ------------------------------------------
const rand = Math.random;
const pick = weights => { // { valeur: poids }
    let r = rand() * Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [k, w] of Object.entries(weights)) if ((r -= w) <= 0) return k;
    return Object.keys(weights)[0];
};
const between = (min, max) => min + rand() * (max - min);

const NEXT_PAGE = {
    accueil:  { boutique: 50, galerie: 14, apropos: 12, contact: 8, compte: 6 },
    boutique: { accueil: 14, galerie: 8, contact: 10, compte: 8, apropos: 5 },
    galerie:  { boutique: 40, accueil: 20, apropos: 10, contact: 6 },
    apropos:  { boutique: 35, contact: 20, accueil: 15, galerie: 10 },
    contact:  { boutique: 25, accueil: 20, apropos: 8 },
    compte:   { boutique: 40, accueil: 15 },
};
const DWELL = { accueil: [8, 70], boutique: [25, 180], galerie: [10, 90], apropos: [15, 110], contact: [10, 80], compte: [10, 70] };
const PRODUCT_WEIGHTS = { 'lotion-capillaire': 30, 'huile-hydratante': 26, 'spray-croissance': 20, gommage: 14, 'masque-argile': 10 };

function demoSource() {
    const source = pick({ social: 42, direct: 24, organique: 19, email: 8, referent: 7 });
    const s = { source, referrer_host: '', utm_source: '', utm_medium: '', utm_campaign: '' };
    if (source === 'social') {
        const net = pick({ tiktok: 62, instagram: 22, whatsapp: 10, facebook: 6 });
        Object.assign(s, { utm_source: net, utm_medium: 'social', referrer_host: net === 'whatsapp' ? '' : `${net}.com` });
    } else if (source === 'organique') {
        s.referrer_host = pick({ 'google.com': 86, 'bing.com': 9, 'duckduckgo.com': 5 });
    } else if (source === 'email') {
        Object.assign(s, { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: pick({ 'nouveautes': 60, 'promo-tabaski': 40 }) });
    } else if (source === 'referent') {
        s.referrer_host = pick({ 'blog-beaute-naturelle.sn': 55, 'annuaire-dakar.sn': 45 });
    }
    return s;
}

async function seedAnalytics() {
    const DAYS = 60;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const visitors = [];
    const sessions = [], events = [];

    for (let day = DAYS - 1; day >= 0; day--) {
        const date = new Date(today.getTime() - day * 86400000);
        const growth = 8 + (DAYS - day) * 0.45;                       // le site gagne en visibilité
        const weekend = [0, 6].includes(date.getUTCDay()) ? 1.25 : 1;
        const count = Math.max(2, Math.round(growth * weekend * between(0.75, 1.25)));

        for (let i = 0; i < count; i++) {
            const returning = visitors.length > 10 && rand() < 0.28;
            const visitor_id = returning ? visitors[Math.floor(rand() * visitors.length)] : randomUUID();
            if (!returning) visitors.push(visitor_id);
            const session_id = randomUUID();
            const src = demoSource();
            const device = pick({ mobile: 76, ordinateur: 19, tablette: 5 });
            const hour = Number(pick({ 8: 3, 10: 5, 12: 8, 13: 9, 15: 6, 17: 8, 19: 12, 20: 14, 21: 13, 22: 9, 23: 4 }));
            let t = date.getTime() + hour * 3600000 + rand() * 3600000;
            if (t > Date.now()) t = Date.now() - rand() * 3600000;
            const at = () => new Date(t).toISOString();
            const ev = (name, page, value = 0, product_id = '') =>
                events.push({ session_id, visitor_id, name, page, value: Math.round(value), product_id, is_demo: true, created_at: at() });

            let page = src.source === 'email' ? 'boutique'
                : src.source === 'social' ? pick({ accueil: 55, boutique: 40, galerie: 5 })
                : pick({ accueil: 70, boutique: 20, apropos: 10 });
            sessions.push({ id: session_id, visitor_id, is_new_visitor: !returning, ...src, landing_page: page, device, is_demo: true, created_at: at() });

            const cart = [];
            let opened = false;
            const pages = Math.min(7, 1 + Math.floor(Math.log(1 - rand()) / Math.log(0.6)));
            for (let n = 0; n < pages; n++) {
                ev('page_view', page);
                const dwell = between(...DWELL[page]) * 1000;
                if ((page === 'boutique' || page === 'accueil') && rand() < 0.45) {
                    const views = 1 + Math.floor(rand() * 3);
                    for (let v = 0; v < views; v++) {
                        t += between(4, 25) * 1000;
                        const product = pick(PRODUCT_WEIGHTS);
                        ev('view_product', page, 0, product);
                        if (rand() < 0.16) {
                            t += between(5, 30) * 1000;
                            const variant = PRODUCTS[product].variants[rand() < 0.65 ? 0 : PRODUCTS[product].variants.length - 1];
                            cart.push(variant.price);
                            ev('add_to_cart', page, variant.price, product);
                        }
                    }
                }
                if (cart.length && !opened && rand() < 0.85) { t += between(5, 40) * 1000; opened = true; ev('open_cart', page); }
                if (page === 'contact' && rand() < 0.35) ev('whatsapp_click', page);
                if (page === 'compte' && rand() < 0.3) ev('sign_up', page);
                t += dwell;
                ev('engagement', page, dwell);
                if (opened && cart.length && rand() < 0.2) {
                    ev('purchase', page, cart.reduce((a, b) => a + b, 0));
                    if (rand() < 0.15) ev('sign_up', 'compte');
                    break;
                }
                if (rand() < 0.04) ev('whatsapp_click', page);
                page = pick(NEXT_PAGE[page]);
                t += between(1, 4) * 1000;
            }
        }
    }

    await sb.from('analytics_events').delete().eq('is_demo', true);
    await sb.from('analytics_sessions').delete().eq('is_demo', true);
    for (let i = 0; i < sessions.length; i += 500) {
        const { error } = await sb.from('analytics_sessions').insert(sessions.slice(i, i + 500));
        if (error) fail('Sessions de démonstration :', error);
    }
    for (let i = 0; i < events.length; i += 1000) {
        const { error } = await sb.from('analytics_events').insert(events.slice(i, i + 1000));
        if (error) fail('Événements de démonstration :', error);
    }
    const purchases = events.filter(e => e.name === 'purchase').length;
    console.log(`✅ Statistiques de démonstration : ${sessions.length} sessions, ${visitors.length} visiteurs, ${events.length} événements, ${purchases} commandes sur ${DAYS} jours.`);
    console.log('   Elles sont signalées « démonstration » dans le tableau de bord. Pour les retirer : npm run clean:analytics');
}

async function cleanAnalytics() {
    const { error: e1, count: c1 } = await sb.from('analytics_events').delete({ count: 'exact' }).eq('is_demo', true);
    if (e1) fail('Suppression des événements de démonstration :', e1);
    const { error: e2, count: c2 } = await sb.from('analytics_sessions').delete({ count: 'exact' }).eq('is_demo', true);
    if (e2) fail('Suppression des sessions de démonstration :', e2);
    console.log(`✅ ${c2} sessions et ${c1} événements de démonstration supprimés. Les vraies visites sont conservées.`);
}

const [command, ...args] = process.argv.slice(2);
const commands = {
    'seed-demo': seedDemo,
    'clean-demo': cleanDemo,
    'seed-analytics': seedAnalytics,
    'clean-analytics': cleanAnalytics,
    'make-admin': () => makeAdmin(args.find(a => !a.startsWith('--')), args.includes('--remove'), args.includes('--create')),
};
if (!commands[command]) {
    console.log('Commandes : seed-demo | clean-demo | seed-analytics | clean-analytics | make-admin <email> [--create] [--remove]');
    process.exit(command ? 1 : 0);
}
await commands[command]();
