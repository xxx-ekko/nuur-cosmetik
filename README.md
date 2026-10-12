# Nuur Cosmetik — website

Static website (GitHub Pages) with a guest cart that sends the order on WhatsApp, plus optional customer accounts, order history and an owner dashboard (Supabase).

```
index.html                  the whole site (pages: #accueil #boutique #galerie #apropos #contact #compte #admin)
assets/js/products.js       ← catalog, prices, WhatsApp number, Supabase keys (edit this one)
assets/js/app.js            site logic (cart, WhatsApp, accounts, admin)
assets/css/style.css        compiled CSS (generated from assets/css/input.css)
assets/img/                 optimized images (products, gallery, logo)
supabase/migrations/        database tables + security rules
scripts/nuur-admin.mjs      seed demo account / delete it / give owner access
ressources/                 your original files (not published)
```

## How ordering works

1. The visitor picks products and sizes, adds them to the cart. No account needed. The cart is kept in the browser.
2. In the cart they enter name, delivery zone and address, then tap **Commander sur WhatsApp**.
3. WhatsApp opens with the full order pre-written (reference, items, quantities, prices, total, delivery info). They tap Send.
4. If Supabase is configured, the order is also saved: the customer sees it in **Mon Compte** (if logged in), and the owner sees every order in **Espace gérante** and sets its status (Envoyée → Confirmée → Livrée / Annulée).

Without Supabase keys the site still works fully as guest-only WhatsApp ordering, and "Mon Compte" shows "bientôt disponible".

## Change products, prices or the WhatsApp number

Edit `assets/js/products.js` and push. To add a product, copy a block, give it a new `id`, and add its photo in `assets/img/products/`.

If you add new Tailwind classes in `index.html`/`app.js`, rebuild the CSS:

```bash
npm install          # once
npm run build:css
```

## 1. Set up Supabase (accounts + order history), about 10 minutes

1. Create a free account at <https://supabase.com> → **New project** (region: closest to Senegal, e.g. *West EU*).
2. **SQL Editor → New query** → paste the whole content of `supabase/migrations/20261012000000_nuur_init.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email" (signup becomes instant; Supabase's free email sender only allows a few emails per hour).
4. **Authentication → URL Configuration**: set **Site URL** to your GitHub Pages address (e.g. `https://xxx-ekko.github.io/nuur-cosmetik/`), used by "mot de passe oublié" emails.
5. **Project Settings → API**: copy the **Project URL** and the **Publishable key** (or "anon public" key) into `assets/js/products.js`:
   ```js
   supabaseUrl: 'https://xxxx.supabase.co',
   supabaseKey: 'sb_publishable_xxxx',
   ```
   These two values are public by design; the security rules in the SQL file protect the data.

### Owner access (Espace gérante)

1. On the website, go to **Mon Compte → Créer un compte** with the owner's email.
2. On your computer, copy `.env.example` to `.env` and fill in the URL and the **Secret key** (Project Settings → API keys; this one is private, never put it on GitHub, `.env` is git-ignored).
3. Run:
   ```bash
   npm install
   npm run make-admin -- owner@email.com
   ```
   The owner now sees **Espace gérante** in Mon Compte / the mobile menu.

### Demo customer with a real order history

```bash
npm run seed:demo     # creates "Fatou Sow" (cliente.demo@example.com) with 4 real orders + favorites, prints the password
npm run clean:demo    # deletes the demo account and its orders (do this before launch)
```

Orders are real database rows built from the current catalog and prices. Re-running `seed:demo` resets them.

## 2. Publish on GitHub Pages

```bash
git init && git add . && git commit -m "Nuur Cosmetik website"
gh repo create nuur-cosmetik --public --source=. --push      # or create the repo on github.com and push
```

Then on GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root**. The site appears at `https://xxx-ekko.github.io/nuur-cosmetik/` after a minute or two.

`.github/workflows/supabase-keepalive.yml` pings the database every 3 days so the free Supabase project never pauses. GitHub turns off scheduled workflows after 60 days without any commit; if that happens, re-enable it in the **Actions** tab.

## Local preview

```bash
python3 -m http.server 8080      # then open http://127.0.0.1:8080
```

Optional full local backend (Docker + Supabase CLI): `supabase start` (this project uses ports 553xx), then use the local URL and key from `supabase status`.

## Before going live

- The testimonials on the home page are the ones from the draft. They mention products that aren't in the catalog (Bain d'Huile Fortifiant, Sérum Barbe, Lait Corporel…). Replace them with real customer reviews.
- Run `npm run clean:demo` if you seeded the demo account.
- Set the `og:image` meta tag in `index.html` to the full URL (e.g. `https://xxx-ekko.github.io/nuur-cosmetik/assets/img/brand/gamme.jpg`) so links shared on WhatsApp show the picture.
