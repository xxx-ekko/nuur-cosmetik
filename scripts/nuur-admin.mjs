#!/usr/bin/env node
// ==========================================================================
//  NUUR COSMETIK — outils d'administration (à lancer sur votre ordinateur)
//
//    npm run seed:demo                 crée une cliente de démo + un vrai historique de commandes
//    npm run clean:demo                supprime la cliente de démo et ses commandes
//    npm run make-admin -- email@x.com donne l'accès « Espace gérante » à un compte existant
//    npm run make-admin -- email@x.com --create   crée le compte s'il n'existe pas encore
//    npm run make-admin -- email@x.com --remove   retire cet accès
//
//  Nécessite un fichier .env (jamais envoyé sur GitHub) contenant :
//    SUPABASE_URL=https://xxxx.supabase.co
//    SUPABASE_SECRET_KEY=sb_secret_...      (ou l'ancienne "service_role key")
// ==========================================================================
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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

const [command, ...args] = process.argv.slice(2);
const commands = {
    'seed-demo': seedDemo,
    'clean-demo': cleanDemo,
    'make-admin': () => makeAdmin(args.find(a => !a.startsWith('--')), args.includes('--remove'), args.includes('--create')),
};
if (!commands[command]) {
    console.log('Commandes : seed-demo | clean-demo | make-admin <email> [--remove]');
    process.exit(command ? 1 : 0);
}
await commands[command]();
