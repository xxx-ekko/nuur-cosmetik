// ==========================================================================
//  NUUR COSMETIK — logique du site
//  Le catalogue, les prix et le numéro WhatsApp sont dans products.js
// ==========================================================================
(() => {
    'use strict';

    const CFG = window.NUUR_CONFIG;
    const PRODUCTS = window.NUUR_PRODUCTS;
    const GALLERY = window.NUUR_GALLERY;
    const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
    const PAGES = ['accueil', 'boutique', 'galerie', 'apropos', 'contact', 'compte', 'admin'];
    const KEYS = { cart: 'nuur.cart.v1', customer: 'nuur.customer.v1' };
    const STATUS = {
        envoyee: { label: 'Envoyée', cls: 'bg-amber-100 text-amber-800' },
        confirmee: { label: 'Confirmée', cls: 'bg-sky-100 text-sky-800' },
        livree: { label: 'Livrée', cls: 'bg-green-100 text-green-800' },
        annulee: { label: 'Annulée', cls: 'bg-gray-200 text-gray-600' },
    };

    // Supabase (comptes & commandes) — désactivé tant que l'URL et la clé ne sont pas renseignées
    const sb = CFG.supabaseUrl && CFG.supabaseKey && window.supabase
        ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey)
        : null;

    // ----------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const normalize = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const formatNumber = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const formatPrice = n => `${formatNumber(n)} ${CFG.currency}`;
    const waUrl = text => `https://wa.me/${CFG.whatsappNumber}` + (text ? `?text=${encodeURIComponent(text)}` : '');
    const formatDate = iso => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const formatDateTime = iso => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const siteUrl = () => location.origin + location.pathname;
    const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

    const storage = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
        },
    };

    // Numéro saisi par un client -> numéro international pour wa.me (Sénégal par défaut)
    function phoneToWhatsApp(phone) {
        let digits = String(phone || '').replace(/\D/g, '');
        if (digits.startsWith('00')) digits = digits.slice(2);
        if (digits.length === 9) digits = '221' + digits;
        return digits.length >= 10 ? digits : '';
    }

    function makeOrderRef() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        return 'NUUR-' + [...bytes].map(b => alphabet[b % alphabet.length]).join('');
    }

    // ----------------------------------------------------------------------
    // Animations
    // ----------------------------------------------------------------------
    const motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Les éléments marqués data-reveal (ou enfants d'un data-reveal-stagger)
    // apparaissent en douceur quand ils entrent à l'écran.
    const revealObserver = motionOK && 'IntersectionObserver' in window
        ? new IntersectionObserver(entries => entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            revealObserver.unobserve(entry.target);
        }), { rootMargin: '0px 0px -6% 0px', threshold: 0.08 })
        : null;

    function armOne(el, delay = 0) {
        el.classList.remove('is-in');
        el.classList.add('reveal');
        el.style.setProperty('--d', `${delay}ms`);
        revealObserver.observe(el);
    }

    function armChildren(container) {
        if (!revealObserver || !container) return;
        [...container.children].forEach((child, i) => armOne(child, Math.min(i, 6) * 90));
    }

    function armReveal(root) {
        if (!revealObserver) return;
        $$('[data-reveal], .section-heading', root).forEach(el => armOne(el));
        $$('[data-reveal-stagger]', root).forEach(armChildren);
    }

    // Remplace le contenu d'une liste en conservant son animation si elle n'a pas encore été jouée
    function setHTML(el, html) {
        const pending = revealObserver && el.querySelector(':scope > .reveal:not(.is-in)');
        el.innerHTML = html;
        if (pending) armChildren(el);
    }

    function replayClass(el, cls) {
        if (!motionOK || !el) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
    }

    function countUp(el, to) {
        if (!motionOK || !to) { el.textContent = formatNumber(to); return; }
        const start = performance.now(), duration = 900;
        const step = now => {
            const t = Math.min((now - start) / duration, 1);
            el.textContent = formatNumber(t < 1 ? Math.floor(to * (1 - Math.pow(1 - t, 3))) : to);
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    // La photo du produit « vole » jusqu'à l'icône du panier
    function flyToCart(sourceImg) {
        const cartBtn = $('button[data-action="open-cart"]');
        if (!motionOK || !sourceImg || !cartBtn) return;
        const a = sourceImg.getBoundingClientRect(), b = cartBtn.getBoundingClientRect();
        if (!a.width || typeof sourceImg.animate !== 'function') return;
        const dot = document.createElement('img');
        dot.src = sourceImg.currentSrc || sourceImg.src;
        dot.alt = '';
        dot.className = 'fly-dot';
        dot.style.left = `${a.left + a.width / 2 - 28}px`;
        dot.style.top = `${a.top + a.height / 2 - 28}px`;
        document.body.appendChild(dot);
        const dx = b.left + b.width / 2 - (a.left + a.width / 2);
        const dy = b.top + b.height / 2 - (a.top + a.height / 2);
        dot.animate([
            { transform: 'translate(0, 0) scale(.6)', opacity: 0 },
            { transform: 'translate(0, -24px) scale(1.15)', opacity: 1, offset: 0.25 },
            { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0.7 },
        ], { duration: 850, easing: 'cubic-bezier(.55, 0, .3, 1)' }).onfinish = () => {
            dot.remove();
            replayClass($('i', cartBtn), 'cart-wiggle');
        };
    }

    // ----------------------------------------------------------------------
    // Statistiques de visite (anonymes, envoyées à Supabase)
    // ----------------------------------------------------------------------
    const analytics = (() => {
        const noop = { track() {}, page() {}, flush() {}, optOut() {} };
        if (!sb || !window.fetch) return noop;

        const KEY_VISITOR = 'nuur.visitor.v1', KEY_SESSION = 'nuur.session.v1', KEY_OPTOUT = 'nuur.analytics.optout';
        const SESSION_TIMEOUT = 30 * 60 * 1000, IDLE_AFTER = 60 * 1000, MAX_PAGE_MS = 30 * 60 * 1000;
        const memory = {}; // si le stockage du navigateur est bloqué
        const read = key => storage.get(key, null) ?? memory[key] ?? null;
        const write = (key, value) => { memory[key] = value; storage.set(key, value); };
        const uuid = () => crypto.randomUUID ? crypto.randomUUID()
            : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
        const optedOut = () => read(KEY_OPTOUT) === true;

        // Source de la visite, calculée une fois à l'arrivée sur le site
        const attribution = (() => {
            const params = new URLSearchParams(location.search);
            const utm = k => (params.get('utm_' + k) || '').slice(0, 80).toLowerCase();
            let host = '';
            try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch { /* referrer illisible */ }
            if (host === location.hostname) host = '';
            const tag = `${utm('source')} ${utm('medium')} ${host}`;
            let source = 'direct';
            if (/e-?mail|newsletter|mail\.|outlook|gmail/.test(tag)) source = 'email';
            else if (/tiktok|instagram|facebook|fb\b|whatsapp|wa\.me|snapchat|twitter|t\.co\b|x\.com|linkedin|youtube|pinterest|social/.test(tag)) source = 'social';
            else if (/google|bing|yahoo|duckduckgo|ecosia|qwant|baidu|yandex|brave|search|organic/.test(tag)) source = 'organique';
            else if (host || utm('source')) source = 'referent';
            return { source, referrer_host: host.slice(0, 120), utm_source: utm('source'), utm_medium: utm('medium'), utm_campaign: utm('campaign') };
        })();
        let attributionUsed = false;

        const device = () => {
            const w = Math.min(window.screen?.width || innerWidth, innerWidth);
            return w < 640 ? 'mobile' : (w < 1024 && navigator.maxTouchPoints > 0 ? 'tablette' : 'ordinateur');
        };

        const post = (table, rows) => fetch(`${CFG.supabaseUrl}/rest/v1/${table}`, {
            method: 'POST',
            headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(rows),
            keepalive: true,
        }).catch(() => { /* les statistiques ne doivent jamais gêner le site */ });

        function session(landingPage) {
            const now = Date.now();
            let visitor = read(KEY_VISITOR), isNew = false;
            if (!visitor) { visitor = uuid(); isNew = true; write(KEY_VISITOR, visitor); }
            let s = read(KEY_SESSION);
            if (!s || now - s.last > SESSION_TIMEOUT) {
                s = { id: uuid(), last: now };
                const a = attributionUsed ? { source: 'direct', referrer_host: '', utm_source: '', utm_medium: '', utm_campaign: '' } : attribution;
                attributionUsed = true;
                post('analytics_sessions', [{ id: s.id, visitor_id: visitor, is_new_visitor: isNew, ...a, landing_page: landingPage, device: device() }]);
            }
            s.last = now;
            write(KEY_SESSION, s);
            return { session_id: s.id, visitor_id: visitor };
        }

        let queue = [], flushTimer = null;
        function flush() {
            clearTimeout(flushTimer);
            if (!queue.length) return;
            const rows = queue;
            queue = [];
            post('analytics_events', rows);
        }

        function track(name, { page = active.page || currentPage(), value = 0, product = '' } = {}) {
            if (optedOut() || page === 'admin') return;
            queue.push({ ...session(page), name, page, value: Math.max(0, Math.min(Math.round(value), 100000000)), product_id: product });
            clearTimeout(flushTimer);
            flushTimer = setTimeout(flush, 4000);
        }

        // Temps d'engagement : seulement quand l'onglet est visible et que la personne interagit
        const active = { page: null, since: 0, ms: 0, lastInput: Date.now() };
        const pause = () => { if (active.since) { active.ms += Date.now() - active.since; active.since = 0; } };
        const resume = () => { if (active.page && !active.since && document.visibilityState === 'visible') active.since = Date.now(); };
        function sendEngagement() {
            pause();
            const ms = Math.min(active.ms, MAX_PAGE_MS);
            active.ms = 0;
            if (active.page && ms >= 1000) track('engagement', { page: active.page, value: ms });
        }
        function page(name) {
            if (active.page) sendEngagement();
            active.page = name === 'admin' ? null : name;
            active.lastInput = Date.now();
            resume();
            if (active.page) track('page_view', { page: name });
        }

        ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(evt =>
            window.addEventListener(evt, () => { active.lastInput = Date.now(); resume(); }, { passive: true }));
        setInterval(() => { if (Date.now() - active.lastInput > IDLE_AFTER) pause(); }, 10000);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') { sendEngagement(); flush(); } else resume();
        });
        window.addEventListener('pagehide', () => { sendEngagement(); flush(); });

        // Les visites de la gérante ne sont pas comptées sur cet appareil
        const optOut = () => { write(KEY_OPTOUT, true); queue = []; };

        return { track, page, flush, optOut };
    })();

    // ----------------------------------------------------------------------
    // State
    // ----------------------------------------------------------------------
    const state = {
        category: 'all',
        search: '',
        selected: {},          // productId -> index du format choisi
        cart: loadCart(),      // [{ id, v, qty }]
        modal: null,           // { id, qty, img }
        lightboxIndex: 0,
        lastOrder: null,       // { ref, url }
        // compte
        authReady: !sb,
        authView: 'login',
        accountTab: 'orders',
        user: null,
        profile: null,
        orders: [],
        favorites: new Set(),
        // espace gérante
        admin: { orders: [], filter: 'all', search: '', loading: false, view: 'orders' },
        stats: { days: 30, data: {} },
    };

    // ----------------------------------------------------------------------
    // Cart
    // ----------------------------------------------------------------------
    function loadCart() {
        return storage.get(KEYS.cart, [])
            .filter(i => i && PRODUCT_BY_ID[i.id]?.variants[i.v] && Number.isInteger(i.qty) && i.qty > 0)
            .map(i => ({ id: i.id, v: i.v, qty: Math.min(i.qty, 99) }));
    }

    const saveCart = () => storage.set(KEYS.cart, state.cart);
    const lineKey = item => `${item.id}:${item.v}`;
    const cartCount = () => state.cart.reduce((sum, i) => sum + i.qty, 0);

    function cartLines() {
        return state.cart.map(item => {
            const product = PRODUCT_BY_ID[item.id];
            const variant = product.variants[item.v];
            return { ...item, product, variant, subtotal: variant.price * item.qty };
        });
    }

    function addToCart(id, v = 0, qty = 1, { silent = false } = {}) {
        const product = PRODUCT_BY_ID[id];
        if (!product?.variants[v]) return;
        const existing = state.cart.find(i => i.id === id && i.v === v);
        if (existing) existing.qty = Math.min(existing.qty + qty, 99);
        else state.cart.push({ id, v, qty: Math.min(qty, 99) });
        saveCart();
        renderCart();
        bumpBadge();
        analytics.track('add_to_cart', { product: id, value: product.variants[v].price * qty });
        if (!silent) {
            toast(`<strong>${esc(product.name)}</strong> (${esc(product.variants[v].size)}) ajouté au panier`,
                { label: 'Voir le panier', action: 'open-cart' });
        }
    }

    function changeQty(key, delta) {
        const item = state.cart.find(i => lineKey(i) === key);
        if (!item) return;
        item.qty = Math.min(item.qty + delta, 99);
        if (item.qty <= 0) state.cart = state.cart.filter(i => i !== item);
        saveCart();
        renderCart();
    }

    function removeLine(key) {
        state.cart = state.cart.filter(i => lineKey(i) !== key);
        saveCart();
        renderCart();
    }

    function bumpBadge() {
        const badge = $('#cart-badge');
        badge.classList.remove('badge-bump');
        void badge.offsetWidth;
        badge.classList.add('badge-bump');
    }

    function renderCart() {
        const lines = cartLines();
        const count = cartCount();
        const total = lines.reduce((sum, l) => sum + l.subtotal, 0);

        $('#cart-badge').textContent = count;
        $('#cart-count-label').textContent = count ? `(${plural(count, 'article')})` : '';
        $('#cart-total').textContent = formatPrice(total);
        $('#cart-form').classList.toggle('hidden', !lines.length);
        $('#cart-footer').classList.toggle('hidden', !lines.length);

        if (!lines.length) {
            $('#cart-items').innerHTML = `
                <div class="text-center py-16 text-gray-400 space-y-4">
                    <i class="fa-solid fa-bag-shopping text-5xl"></i>
                    <p class="text-sm font-medium">Votre panier est vide.</p>
                    <a href="#boutique" data-action="close-cart" data-category="all" class="inline-block text-sm bg-nuur-700 text-white font-bold px-5 py-2.5 rounded-full">
                        Découvrir nos soins
                    </a>
                </div>`;
            return;
        }

        $('#cart-items').innerHTML = lines.map(l => `
            <div class="flex gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <img src="${l.product.image}" alt="" class="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl shrink-0 bg-nuur-deep">
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <h4 class="text-sm font-bold text-gray-900 leading-snug">${esc(l.product.name)}</h4>
                            <p class="text-xs text-gray-500">${esc(l.variant.size)} · ${formatPrice(l.variant.price)}</p>
                        </div>
                        <button type="button" data-action="remove" data-key="${lineKey(l)}" class="w-8 h-8 -mr-1 -mt-1 shrink-0 text-gray-400 hover:text-red-500" aria-label="Retirer ${esc(l.product.name)}">
                            <i class="fa-solid fa-trash-can text-sm"></i>
                        </button>
                    </div>
                    <div class="flex items-center justify-between gap-2 mt-2">
                        <div class="qty-stepper">
                            <button type="button" data-action="qty" data-key="${lineKey(l)}" data-delta="-1" aria-label="Diminuer la quantité">−</button>
                            <span aria-live="polite">${l.qty}</span>
                            <button type="button" data-action="qty" data-key="${lineKey(l)}" data-delta="1" aria-label="Augmenter la quantité">+</button>
                        </div>
                        <span class="text-sm font-serif font-bold text-nuur-800 whitespace-nowrap">${formatPrice(l.subtotal)}</span>
                    </div>
                </div>
            </div>`).join('');
    }

    // ----------------------------------------------------------------------
    // Checkout -> WhatsApp (+ enregistrement de la commande si Supabase est configuré)
    // ----------------------------------------------------------------------
    const checkoutFields = () => ({
        name: $('#checkout-name'),
        phone: $('#checkout-phone'),
        zone: $('#checkout-zone'),
        address: $('#checkout-address'),
        note: $('#checkout-note'),
    });

    function readCheckout() {
        const f = checkoutFields();
        return Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
    }

    function prefillCheckout(data, { overwrite = false } = {}) {
        const f = checkoutFields();
        ['name', 'phone', 'zone', 'address'].forEach(k => {
            if (data?.[k] && (overwrite || !f[k].value.trim())) f[k].value = data[k];
        });
    }

    function buildOrderMessage(ref, c, lines) {
        const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
        const out = [
            'Bonjour Nuur Cosmetik,',
            'Je souhaite passer la commande suivante :',
            '',
            `*Commande ${ref}*`,
            '',
        ];
        lines.forEach((l, i) => {
            out.push(`${i + 1}. ${l.product.name} (${l.variant.size})`);
            out.push(`   ${l.qty} x ${formatPrice(l.variant.price)} = ${formatPrice(l.subtotal)}`);
        });
        out.push('', `*Total : ${formatPrice(total)}* (hors livraison)`, '', '*Livraison*');
        out.push(`Nom : ${c.name}`);
        if (c.phone) out.push(`Téléphone : ${c.phone}`);
        out.push(`Zone : ${c.zone}`);
        out.push(`Adresse : ${c.address}`);
        if (c.note) out.push(`Remarque : ${c.note}`);
        out.push('', 'Merci de me confirmer la disponibilité et les frais de livraison.');
        return out.join('\n');
    }

    async function saveOrder(ref, c, lines) {
        if (!sb) return false;
        try {
            const { error } = await sb.from('orders').insert({
                ref,
                user_id: state.user?.id ?? null,
                customer_name: c.name,
                phone: c.phone,
                zone: c.zone,
                address: c.address,
                note: c.note,
                items: lines.map(l => ({ id: l.id, name: l.product.name, size: l.variant.size, price: l.variant.price, qty: l.qty })),
            });
            if (error) throw error;
            return true;
        } catch (err) {
            console.warn('Commande non enregistrée :', err);
            return false;
        }
    }

    function checkout() {
        if (!state.cart.length) return;
        const f = checkoutFields();
        const c = readCheckout();
        const errorBox = $('#cart-form-error');

        Object.values(f).forEach(el => el.classList.remove('is-invalid'));
        const missing = [];
        if (!c.name) missing.push(f.name);
        if (!c.address) missing.push(f.address);
        if (missing.length) {
            missing.forEach(el => el.classList.add('is-invalid'));
            errorBox.textContent = 'Merci d’indiquer votre nom et votre adresse de livraison.';
            errorBox.classList.remove('hidden');
            missing[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            missing[0].focus({ preventScroll: true });
            return;
        }
        errorBox.classList.add('hidden');
        storage.set(KEYS.customer, { name: c.name, phone: c.phone, zone: c.zone, address: c.address });

        const ref = makeOrderRef();
        const lines = cartLines();
        const url = waUrl(buildOrderMessage(ref, c, lines));

        // La requête d'enregistrement part avant l'ouverture de WhatsApp, dans le même clic
        // (sinon le navigateur bloquerait la nouvelle fenêtre).
        const saved = saveOrder(ref, c, lines);
        analytics.track('purchase', { value: lines.reduce((sum, l) => sum + l.subtotal, 0) });
        analytics.flush();
        const win = window.open(url, '_blank');
        if (!win) Promise.race([saved, new Promise(r => setTimeout(r, 2500))]).then(() => { location.href = url; });

        state.lastOrder = { ref, url };
        $('#cart-sent-ref').textContent = ref;
        $('#cart-sent').classList.replace('hidden', 'flex');

        saved.then(ok => { if (ok && state.user) loadUserData().then(refreshAccountUI); });
    }

    function finishOrder() {
        state.cart = [];
        saveCart();
        renderCart();
        $('#checkout-note').value = '';
        $('#cart-sent').classList.replace('flex', 'hidden');
        closeOverlay('cart');
        toast('Merci pour votre commande ! 💚');
    }

    // ----------------------------------------------------------------------
    // Products
    // ----------------------------------------------------------------------
    function variantChips(p, sel) {
        if (p.variants.length === 1) {
            return `<span class="inline-block text-[11px] sm:text-xs text-gray-500 font-medium px-2.5 py-1 rounded-lg bg-gray-100">${esc(p.variants[0].size)}</span>`;
        }
        return `<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Format">${p.variants.map((v, i) => `
            <button type="button" role="radio" aria-checked="${i === sel}" data-action="select-variant" data-id="${p.id}" data-index="${i}"
                    class="size-chip ${i === sel ? 'is-active' : ''}">${esc(v.size)}</button>`).join('')}
        </div>`;
    }

    function favButton(p, extraClass = 'fav-btn') {
        if (!sb) return '';
        const fav = state.favorites.has(p.id);
        return `<button type="button" data-action="toggle-favorite" data-id="${p.id}" class="${extraClass} ${fav ? 'is-fav' : ''}"
                        aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                    <i class="fa-${fav ? 'solid' : 'regular'} fa-heart"></i>
                </button>`;
    }

    function productCard(p) {
        const sel = state.selected[p.id] ?? 0;
        const variant = p.variants[sel];
        return `
            <article class="product-card group">
                <div class="relative">
                    <button type="button" data-action="open-product" data-id="${p.id}" class="block w-full aspect-square overflow-hidden rounded-xl sm:rounded-2xl bg-nuur-deep" aria-label="Voir le détail : ${esc(p.name)}">
                        <img src="${p.image}" alt="${esc(p.name)}" loading="lazy" width="800" height="800" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    </button>
                    <span class="absolute top-2 left-2 sm:top-3 sm:left-3 bg-nuur-700 text-white text-[9px] sm:text-[10px] font-bold px-2 sm:px-2.5 py-1 rounded-full uppercase tracking-wide pointer-events-none">${esc(p.badge)}</span>
                    ${favButton(p)}
                </div>
                <div class="flex-1 flex flex-col pt-3">
                    <h3 class="font-serif font-bold text-gray-900 text-sm sm:text-base leading-snug">
                        <button type="button" data-action="open-product" data-id="${p.id}" class="text-left hover:text-nuur-700">${esc(p.name)}</button>
                    </h3>
                    <p class="hidden sm:block text-xs text-gray-500 mt-1 line-clamp-2">${esc(p.description)}</p>
                    <div class="mt-auto pt-3">
                        ${variantChips(p, sel)}
                        <div class="flex items-center justify-between gap-2 mt-3">
                            <span class="font-serif font-bold text-nuur-800 text-sm sm:text-lg whitespace-nowrap">${formatPrice(variant.price)}</span>
                            <button type="button" data-action="add" data-id="${p.id}" class="add-btn" aria-label="Ajouter ${esc(p.name)} ${esc(variant.size)} au panier">
                                <i class="fa-solid fa-cart-plus"></i><span class="hidden sm:inline">Ajouter</span>
                            </button>
                        </div>
                    </div>
                </div>
            </article>`;
    }

    function filteredProducts() {
        const q = normalize(state.search);
        return PRODUCTS.filter(p =>
            (state.category === 'all' || p.categories.includes(state.category)) &&
            (!q || normalize([p.name, p.englishName, p.badge, p.description, p.ingredients].join(' ')).includes(q)));
    }

    function renderProducts() {
        setHTML($('#home-products'), PRODUCTS.map(productCard).join(''));
        const list = filteredProducts();
        $('#product-count').textContent = list.length;
        setHTML($('#shop-products'), list.length
            ? list.map(productCard).join('')
            : `<p class="col-span-full text-center text-sm text-gray-500 py-12">Aucun soin ne correspond à votre recherche.</p>`);
        $$('.cat-btn').forEach(b => {
            const on = b.dataset.filter === state.category;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on);
        });
        if (state.modal) renderModal();
        if (state.user) renderFavorites();
    }

    function setCategory(cat) {
        state.category = cat;
        state.search = '';
        $('#shop-search-input').value = '';
        renderProducts();
    }

    // ----------------------------------------------------------------------
    // Product detail modal
    // ----------------------------------------------------------------------
    function openProduct(id) {
        if (!PRODUCT_BY_ID[id]) return;
        analytics.track('view_product', { product: id });
        state.modal = { id, qty: 1, img: 'photo' };
        renderModal();
        openOverlay('product-modal');
    }

    function renderModal() {
        const { id, qty, img } = state.modal;
        const p = PRODUCT_BY_ID[id];
        const sel = state.selected[id] ?? 0;
        const v = p.variants[sel];
        $('#modal-product-content').innerHTML = `
            <div class="relative bg-nuur-deep md:rounded-l-3xl overflow-hidden">
                <img src="${img === 'sheet' ? p.sheet : p.image}" alt="${esc(p.name)}" class="w-full aspect-square object-cover">
                <div class="absolute bottom-3 left-3 flex gap-2">
                    <button type="button" data-action="modal-image" data-img="photo" class="img-tab ${img === 'photo' ? 'is-active' : ''}">Photo</button>
                    <button type="button" data-action="modal-image" data-img="sheet" class="img-tab ${img === 'sheet' ? 'is-active' : ''}">Fiche produit</button>
                </div>
            </div>
            <div class="p-5 sm:p-8 flex flex-col gap-4">
                <div>
                    <span class="bg-nuur-100 text-nuur-800 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">${esc(p.badge)}</span>
                    <h2 id="modal-product-name" class="font-serif text-2xl font-bold text-gray-900 mt-2 pr-8">${esc(p.name)}</h2>
                    <p class="text-xs text-gray-400 italic">${esc(p.englishName)}</p>
                    <p class="font-serif font-bold text-nuur-800 text-2xl mt-2">${formatPrice(v.price)} <span class="text-xs text-gray-400 font-sans font-normal">/ ${esc(v.size)}</span></p>
                </div>
                <p class="text-sm text-gray-600 leading-relaxed">${esc(p.description)}</p>
                <dl class="text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                    <div><dt class="font-bold text-gray-900">Idéal pour</dt><dd>${esc(p.idealFor)}</dd></div>
                    <div><dt class="font-bold text-gray-900">Ingrédients naturels</dt><dd>${esc(p.ingredients)}</dd></div>
                    ${p.usage ? `<div><dt class="font-bold text-gray-900">Utilisation</dt><dd>${esc(p.usage)}</dd></div>` : ''}
                </dl>
                <div>
                    <p class="form-label">Format</p>
                    ${variantChips(p, sel)}
                </div>
                <div class="flex items-center gap-3">
                    <div class="qty-stepper qty-stepper-lg">
                        <button type="button" data-action="modal-qty" data-delta="-1" aria-label="Diminuer la quantité">−</button>
                        <span aria-live="polite">${qty}</span>
                        <button type="button" data-action="modal-qty" data-delta="1" aria-label="Augmenter la quantité">+</button>
                    </div>
                    <button type="button" data-action="modal-add" class="btn-primary flex-1 !px-3">
                        <i class="fa-solid fa-cart-plus"></i> Ajouter · ${formatPrice(v.price * qty)}
                    </button>
                </div>
                ${sb ? `<div class="flex justify-center">${favButton(p, 'fav-link')}</div>` : ''}
            </div>`;
        const favLink = $('#modal-product-content .fav-link');
        if (favLink) favLink.insertAdjacentHTML('beforeend', state.favorites.has(id) ? ' Dans mes favoris' : ' Ajouter aux favoris');
    }

    // ----------------------------------------------------------------------
    // Search modal
    // ----------------------------------------------------------------------
    function renderQuickSearch(query) {
        const box = $('#quick-search-results');
        const q = normalize(query.trim());
        if (!q) { box.innerHTML = ''; return; }
        const matches = PRODUCTS.filter(p => normalize([p.name, p.englishName, p.badge, p.description, p.ingredients].join(' ')).includes(q));
        box.innerHTML = matches.length
            ? matches.map(p => `
                <button type="button" data-action="search-result" data-id="${p.id}" class="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl text-left">
                    <img src="${p.image}" alt="" class="w-12 h-12 object-cover rounded-lg bg-nuur-deep">
                    <span class="flex-1 min-w-0">
                        <span class="block text-sm font-bold text-gray-900">${esc(p.name)}</span>
                        <span class="text-xs text-nuur-800 font-semibold">dès ${formatPrice(p.variants[0].price)}</span>
                    </span>
                    <i class="fa-solid fa-angle-right text-gray-300"></i>
                </button>`).join('')
            : '<p class="text-sm text-gray-400 text-center py-4">Aucun soin trouvé.</p>';
    }

    // ----------------------------------------------------------------------
    // Gallery & lightbox
    // ----------------------------------------------------------------------
    function renderGallery() {
        $('#gallery-grid').innerHTML = GALLERY.map((g, i) => `
            <button type="button" data-action="lightbox" data-index="${i}" class="block w-full mb-3 sm:mb-4 break-inside-avoid overflow-hidden rounded-2xl group" aria-label="Agrandir : ${esc(g.alt)}">
                <img src="${g.src}" alt="${esc(g.alt)}" width="${g.w}" height="${g.h}" loading="lazy" class="w-full h-auto group-hover:scale-105 transition-transform duration-500">
            </button>`).join('');
        $('#home-gallery').innerHTML = GALLERY.slice(0, 6).map((g, i) => `
            <button type="button" data-action="lightbox" data-index="${i}" class="aspect-square overflow-hidden rounded-xl sm:rounded-2xl group" aria-label="Agrandir : ${esc(g.alt)}">
                <img src="${g.src}" alt="${esc(g.alt)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
            </button>`).join('');
    }

    function showLightbox(i) {
        state.lightboxIndex = (i + GALLERY.length) % GALLERY.length;
        const g = GALLERY[state.lightboxIndex];
        const img = $('#lightbox-img');
        img.src = g.src;
        img.alt = g.alt;
        replayClass(img, 'lb-anim');
        $('#lightbox-counter').textContent = `${state.lightboxIndex + 1} / ${GALLERY.length}`;
    }

    // ----------------------------------------------------------------------
    // Overlays (panier, modales, lightbox)
    // ----------------------------------------------------------------------
    const overlayStack = [];
    let lastFocus = null;

    function openOverlay(name) {
        if (overlayStack.includes(name)) return;
        hideToast();
        if (!overlayStack.length) lastFocus = document.activeElement;
        overlayStack.push(name);
        document.body.classList.add('overflow-hidden');

        if (name === 'cart') {
            analytics.track('open_cart');
            $('#cart-overlay').classList.remove('hidden');
            const drawer = $('#cart-drawer');
            drawer.classList.remove('invisible');
            requestAnimationFrame(() => {
                $('#cart-overlay').classList.add('is-open');
                drawer.classList.remove('translate-x-full');
            });
            armChildren($('#cart-items'));
            setTimeout(() => $('[data-action="close-cart"]', drawer)?.focus({ preventScroll: true }), 50);
        } else if (name === 'lightbox') {
            $('#lightbox').classList.replace('hidden', 'flex');
            $('[data-action="lb-close"]').focus({ preventScroll: true });
        } else {
            const el = $('#' + name);
            el.classList.remove('hidden');
            const target = name === 'search-modal' ? $('#quick-search-input') : $('[data-action="close-modal"].rounded-full', el);
            setTimeout(() => target?.focus({ preventScroll: true }), 30);
        }
    }

    function closeOverlay(name = overlayStack[overlayStack.length - 1]) {
        if (!name || !overlayStack.includes(name)) return;
        overlayStack.splice(overlayStack.indexOf(name), 1);
        if (!overlayStack.length) document.body.classList.remove('overflow-hidden');

        if (name === 'cart') {
            const drawer = $('#cart-drawer');
            $('#cart-overlay').classList.remove('is-open');
            drawer.classList.add('translate-x-full');
            setTimeout(() => {
                if (overlayStack.includes('cart')) return;
                $('#cart-overlay').classList.add('hidden');
                drawer.classList.add('invisible');
                $('#cart-sent').classList.replace('flex', 'hidden');
            }, 300);
        } else if (name === 'lightbox') {
            $('#lightbox').classList.replace('flex', 'hidden');
        } else {
            $('#' + name).classList.add('hidden');
            if (name === 'product-modal') state.modal = null;
        }
        if (!overlayStack.length && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    }

    // ----------------------------------------------------------------------
    // Toast
    // ----------------------------------------------------------------------
    let toastTimer;
    const hideToast = () => { clearTimeout(toastTimer); $('#toast').classList.remove('is-visible'); };
    function toast(html, action) {
        const el = $('#toast');
        el.innerHTML = `<span class="min-w-0">${html}</span>` +
            (action ? `<button type="button" data-action="${action.action}" class="toast-action">${esc(action.label)}</button>` : '');
        el.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3800);
    }

    // ----------------------------------------------------------------------
    // Routing (#boutique, #galerie, ...)
    // ----------------------------------------------------------------------
    const isAuthHash = () => /access_token=|error_description=|error_code=/.test(location.hash);

    function currentPage() {
        const h = decodeURIComponent(location.hash.slice(1));
        return PAGES.includes(h) ? h : 'accueil';
    }

    function closeMenu() {
        $('#mobile-menu').classList.add('hidden');
        $('#mobile-menu-icon').className = 'fa-solid fa-bars text-2xl w-6 text-center';
        $('[data-action="toggle-menu"]').setAttribute('aria-expanded', 'false');
    }

    function route() {
        if (isAuthHash()) return; // lien reçu par email : traité par Supabase
        const page = currentPage();
        analytics.page(page);
        $$('.page-section').forEach(s => s.classList.toggle('hidden', s.id !== 'page-' + page));
        $$('[data-nav]').forEach(a => {
            const on = a.dataset.nav === page;
            a.classList.toggle('is-active', on);
            if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        document.title = $('#page-' + page).dataset.title;
        closeMenu();
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (page === 'compte') renderAccount();
        if (page === 'admin') loadAdmin();
        const section = $('#page-' + page);
        replayClass(section, 'page-enter');
        armReveal(section);
    }

    // ----------------------------------------------------------------------
    // Account (Supabase Auth)
    // ----------------------------------------------------------------------
    const AUTH_ERRORS = {
        'Invalid login credentials': 'Email ou mot de passe incorrect.',
        'Email not confirmed': 'Confirmez d’abord votre email grâce au lien reçu, puis reconnectez-vous.',
        'User already registered': 'Un compte existe déjà avec cet email. Connectez-vous.',
        'Password should be at least 6 characters.': 'Le mot de passe doit contenir au moins 6 caractères.',
        'Unable to validate email address: invalid format': 'Adresse email invalide.',
        'New password should be different from the old password.': 'Le nouveau mot de passe doit être différent de l’ancien.',
    };
    const authError = err => AUTH_ERRORS[err?.message]
        || (/rate limit/i.test(err?.message || '') ? 'Trop de tentatives, réessayez dans quelques minutes.' : null)
        || 'Une erreur est survenue. Vérifiez votre connexion et réessayez.';

    function authMessage(text, kind = 'error') {
        const el = $('#auth-message');
        el.textContent = text;
        el.className = `mt-4 text-xs font-semibold rounded-xl px-3 py-2 ${kind === 'error' ? 'text-red-700 bg-red-50 border border-red-100' : 'text-nuur-800 bg-nuur-50 border border-nuur-100'}`;
        if (!text) el.classList.add('hidden');
    }

    function setAuthView(view) {
        state.authView = view;
        authMessage('');
        renderAccount();
    }

    async function withBusy(form, fn) {
        const btn = $('button[type="submit"]', form);
        const label = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try { await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
    }

    async function loadUserData() {
        const uid = state.user?.id;
        if (!sb || !uid) return;
        const [profile, orders, favs] = await Promise.all([
            sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
            sb.from('orders').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
            sb.from('favorites').select('product_id'),
        ]);
        if (state.user?.id !== uid) return;
        state.profile = profile.data || { full_name: '', phone: '', zone: '', address: '', is_admin: false };
        if (state.profile.is_admin) analytics.optOut();
        state.orders = orders.data || [];
        state.favorites = new Set((favs.data || []).map(f => f.product_id));
        const p = state.profile;
        prefillCheckout({ name: p.full_name, phone: p.phone, zone: p.zone, address: p.address });
    }

    let userDataLoading = null;

    async function handleSession(event, session) {
        const user = session?.user ?? null;
        const changed = user?.id !== state.user?.id;
        state.user = user;

        if (event === 'PASSWORD_RECOVERY') state.authView = 'reset';
        if (!user) {
            state.profile = null;
            state.orders = [];
            state.favorites = new Set();
            state.admin.orders = [];
            state.stats.data = {};
        } else {
            // Supabase peut émettre plusieurs événements d'affilée : tous attendent le même chargement
            if (changed) userDataLoading = loadUserData();
            await userDataLoading;
        }
        state.authReady = true;

        // Retour depuis un lien email (confirmation, nouveau mot de passe) -> page compte
        if (isAuthHash() || event === 'PASSWORD_RECOVERY') {
            history.replaceState(null, '', '#compte');
            route();
        }
        refreshAccountUI();
    }

    function refreshAccountUI() {
        const isAdmin = !!state.profile?.is_admin;
        $('#account-dot').classList.toggle('hidden', !state.user);
        $$('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
        renderProducts();
        const page = currentPage();
        if (page === 'compte') renderAccount();
        if (page === 'admin') loadAdmin();
    }

    function renderAccount() {
        const show = id => {
            const appearing = $('#' + id).classList.contains('hidden');
            ['account-unavailable', 'account-loading', 'account-auth', 'account-dashboard']
                .forEach(x => $('#' + x).classList.toggle('hidden', x !== id));
            if (appearing) armReveal($('#' + id));
            return appearing;
        };

        if (!sb) return show('account-unavailable');
        if (!state.authReady) return show('account-loading');

        if (!state.user || state.authView === 'reset') {
            show('account-auth');
            const view = state.user ? 'reset' : (state.authView === 'reset' ? 'login' : state.authView);
            $$('[data-auth-form]').forEach(f => f.classList.toggle('hidden', f.dataset.authForm !== view));
            $('#auth-tabs').classList.toggle('hidden', view === 'forgot' || view === 'reset');
            $$('.auth-tab').forEach(t => t.classList.toggle('is-active', t.dataset.authView === view));
            return;
        }

        const dashboardAppearing = show('account-dashboard');
        const p = state.profile || {};
        const name = p.full_name || state.user.email.split('@')[0];
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
        const active = state.orders.filter(o => o.status !== 'annulee');

        $('#account-initials').textContent = initials || '?';
        $('#account-name').textContent = name;
        $('#account-email').textContent = state.user.email;
        $('#account-zone').innerHTML = p.zone || p.address
            ? `<i class="fa-solid fa-location-dot"></i> ${esc([p.address, p.zone].filter(Boolean).join(' — '))}`
            : '';
        const spent = active.reduce((s, o) => s + o.total, 0);
        if (dashboardAppearing) {
            countUp($('#stat-orders'), state.orders.length);
            countUp($('#stat-spent'), spent);
        } else {
            $('#stat-orders').textContent = state.orders.length;
            $('#stat-spent').textContent = formatNumber(spent);
        }
        $('#orders-count-badge').textContent = plural(state.orders.length, 'commande');

        $$('.account-tab-btn').forEach(b => b.classList.toggle('is-active', b.dataset.accountTab === state.accountTab));
        $$('.account-tab-content').forEach(c => c.classList.toggle('hidden', c.id !== 'account-tab-' + state.accountTab));

        renderOrders();
        renderFavorites();
        if (document.activeElement?.closest('#profile-form') == null) {
            $('#profile-name').value = p.full_name || '';
            $('#profile-phone').value = p.phone || '';
            $('#profile-zone').value = p.zone || CFG.deliveryZones[0];
            $('#profile-address').value = p.address || '';
        }
    }

    function orderItemsList(items) {
        return items.map(i => `<li>• ${esc(i.name)} ${esc(i.size)} <span class="text-gray-500">(x${i.qty})</span></li>`).join('');
    }

    function statusBadge(status) {
        const st = STATUS[status] || STATUS.envoyee;
        return `<span class="status-badge ${st.cls}">${st.label}</span>`;
    }

    function renderOrders() {
        const list = $('#orders-list');
        if (!state.orders.length) {
            setHTML(list, `
                <div class="text-center py-10 text-gray-400 space-y-3">
                    <i class="fa-solid fa-box-open text-4xl"></i>
                    <p class="text-sm">Vous n’avez pas encore passé de commande.</p>
                    <a href="#boutique" data-category="all" class="inline-block text-sm bg-nuur-700 text-white font-bold px-5 py-2.5 rounded-full">Découvrir nos soins</a>
                </div>`);
            return;
        }
        setHTML(list, state.orders.map(o => {
            const count = o.items.reduce((s, i) => s + i.qty, 0);
            return `
                <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-bold text-sm text-gray-900">Commande #${esc(o.ref)}</span>
                            ${statusBadge(o.status)}
                        </div>
                        <p class="text-xs text-gray-500 mt-1">${formatDate(o.created_at)} • ${plural(count, 'article')}</p>
                        <ul class="text-xs text-gray-700 font-medium mt-1 space-y-0.5">${orderItemsList(o.items)}</ul>
                    </div>
                    <div class="sm:text-right sm:border-l sm:border-gray-200 sm:pl-4 shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-2">
                        <p class="font-serif font-bold text-nuur-800 text-base whitespace-nowrap">${formatPrice(o.total)}</p>
                        <div class="flex flex-wrap justify-end gap-x-3 gap-y-1">
                            <button type="button" data-action="reorder" data-ref="${esc(o.ref)}" class="text-xs text-gray-700 font-bold hover:underline"><i class="fa-solid fa-rotate-right"></i> Recommander</button>
                            <a href="${waUrl(`Bonjour Nuur Cosmetik, je souhaite avoir des nouvelles de ma commande ${o.ref}.`)}" target="_blank" rel="noopener" class="text-xs text-nuur-700 font-bold hover:underline">
                                <i class="fa-brands fa-whatsapp"></i> Suivi WhatsApp
                            </a>
                        </div>
                    </div>
                </div>`;
        }).join(''));
    }

    function reorder(ref) {
        const order = state.orders.find(o => o.ref === ref);
        if (!order) return;
        let added = 0;
        order.items.forEach(item => {
            const p = PRODUCT_BY_ID[item.id];
            const v = p ? p.variants.findIndex(x => x.size === item.size) : -1;
            if (v >= 0) { addToCart(item.id, v, item.qty, { silent: true }); added++; }
        });
        if (!added) return toast('Ces produits ne sont plus disponibles.');
        openOverlay('cart');
        if (added < order.items.length) toast('Certains produits de cette commande ne sont plus disponibles.');
    }

    function renderFavorites() {
        const box = $('#favorites-list');
        const favs = PRODUCTS.filter(p => state.favorites.has(p.id));
        setHTML(box, favs.length
            ? favs.map(p => `
                <div class="p-3 border border-gray-100 rounded-2xl flex items-center gap-3 bg-gray-50/50">
                    <button type="button" data-action="open-product" data-id="${p.id}" class="shrink-0">
                        <img src="${p.image}" alt="${esc(p.name)}" class="w-16 h-16 object-cover rounded-xl bg-nuur-deep">
                    </button>
                    <div class="flex-1 min-w-0">
                        <h5 class="text-sm font-bold text-gray-900">${esc(p.name)}</h5>
                        <span class="text-xs text-nuur-800 font-bold">dès ${formatPrice(p.variants[0].price)}</span>
                        <button type="button" data-action="open-product" data-id="${p.id}" class="block text-xs text-nuur-700 font-bold hover:underline mt-1">+ Choisir & ajouter au panier</button>
                    </div>
                    ${favButton(p, 'w-9 h-9 shrink-0 text-red-500 hover:text-gray-400')}
                </div>`).join('')
            : `<p class="sm:col-span-2 text-center text-sm text-gray-400 py-8">Touchez le <i class="fa-regular fa-heart"></i> d’un produit pour l’ajouter à vos favoris.</p>`);
    }

    async function toggleFavorite(id) {
        if (!sb) return;
        if (!state.user) {
            return toast('Connectez-vous pour enregistrer vos favoris.', { label: 'Se connecter', action: 'go-account' });
        }
        const had = state.favorites.has(id);
        had ? state.favorites.delete(id) : state.favorites.add(id);
        renderProducts();
        const { error } = had
            ? await sb.from('favorites').delete().eq('product_id', id).eq('user_id', state.user.id)
            : await sb.from('favorites').insert({ product_id: id });
        if (error) {
            had ? state.favorites.add(id) : state.favorites.delete(id);
            renderProducts();
            toast('Impossible de mettre à jour vos favoris.');
        }
    }

    // ----------------------------------------------------------------------
    // Espace gérante
    // ----------------------------------------------------------------------
    async function loadAdmin() {
        const denied = $('#admin-denied'), panel = $('#admin-panel');
        if (!sb || !state.authReady) {
            denied.classList.toggle('hidden', !!sb);
            panel.classList.add('hidden');
            return;
        }
        const isAdmin = !!state.profile?.is_admin;
        denied.classList.toggle('hidden', isAdmin);
        panel.classList.toggle('hidden', !isAdmin);
        if (!isAdmin || state.admin.loading) return;

        state.admin.loading = true;
        if (!state.admin.orders.length) $('#admin-orders').innerHTML = '<p class="col-span-full text-center text-gray-400 py-10"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></p>';
        const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
        state.admin.loading = false;
        if (error) return toast('Impossible de charger les commandes.');
        state.admin.orders = data || [];
        renderAdmin();
        armChildren($('#admin-stats'));
        armChildren($('#admin-orders'));
        $$('#admin-stats [data-count]').forEach(el => countUp(el, Number(el.dataset.count)));
    }

    function renderAdmin() {
        const orders = state.admin.orders;
        const count = s => orders.filter(o => o.status === s).length;
        const revenue = orders.filter(o => o.status === 'livree').reduce((s, o) => s + o.total, 0);
        const stat = (label, value, cls) => `
            <div class="bg-white border border-gray-200 rounded-2xl p-4">
                <p class="text-xs text-gray-500 font-semibold">${label}</p>
                <p class="font-semibold text-2xl sm:text-3xl mt-1 ${cls}" data-count="${value}">${formatNumber(value)}</p>
            </div>`;
        $('#admin-stats').innerHTML =
            stat('À confirmer', count('envoyee'), 'text-amber-700') +
            stat('Confirmées', count('confirmee'), 'text-sky-700') +
            stat('Livrées', count('livree'), 'text-green-700') +
            stat('CA livré (FCFA)', revenue, 'text-nuur-800');

        const filters = [['all', 'Toutes', orders.length], ...Object.entries(STATUS).map(([k, s]) => [k, s.label + 's', count(k)])];
        $('#admin-filters').innerHTML = filters.map(([k, label, n]) => `
            <button type="button" data-admin-filter="${k}" class="cat-btn !px-4 !py-2 ${state.admin.filter === k ? 'is-active' : ''}">${label} <span class="opacity-70">(${n})</span></button>`).join('');

        const q = normalize(state.admin.search);
        const list = orders.filter(o =>
            (state.admin.filter === 'all' || o.status === state.admin.filter) &&
            (!q || normalize([o.ref, o.customer_name, o.phone, o.address, o.zone].join(' ')).includes(q)));

        $('#admin-orders').innerHTML = list.length ? list.map(o => {
            const wa = phoneToWhatsApp(o.phone);
            return `
                <article class="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3 min-w-0">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <p class="font-bold text-gray-900">#${esc(o.ref)}</p>
                            <p class="text-xs text-gray-500">${formatDateTime(o.created_at)}</p>
                        </div>
                        <label class="sr-only" for="status-${o.id}">Statut</label>
                        <select id="status-${o.id}" data-admin-status="${o.id}" class="status-select ${(STATUS[o.status] || STATUS.envoyee).cls}">
                            ${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${s.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="text-sm space-y-0.5">
                        <p class="font-semibold text-gray-900">${esc(o.customer_name)} ${o.user_id ? '<span class="text-[10px] font-bold text-nuur-700 bg-nuur-50 px-1.5 py-0.5 rounded ml-1 align-middle">compte client</span>' : ''}</p>
                        ${o.phone ? `<p class="text-gray-600"><i class="fa-solid fa-phone text-xs w-4"></i> ${esc(o.phone)}</p>` : ''}
                        <p class="text-gray-600"><i class="fa-solid fa-location-dot text-xs w-4"></i> ${esc([o.address, o.zone].filter(Boolean).join(' — '))}</p>
                        ${o.note ? `<p class="text-gray-500 text-xs italic">« ${esc(o.note)} »</p>` : ''}
                    </div>
                    <ul class="text-xs text-gray-700 bg-gray-50 rounded-xl p-3 space-y-1">
                        ${o.items.map(i => `<li class="flex justify-between gap-3"><span>${esc(i.name)} ${esc(i.size)} × ${i.qty}</span><span class="whitespace-nowrap">${formatPrice(i.price * i.qty)}</span></li>`).join('')}
                        <li class="flex justify-between gap-3 pt-1 border-t border-gray-200 font-bold text-gray-900"><span>Total</span><span>${formatPrice(o.total)}</span></li>
                    </ul>
                    ${wa ? `<a href="https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour ${o.customer_name}, ici Nuur Cosmetik au sujet de votre commande ${o.ref}.`)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-xs font-bold text-nuur-700 hover:underline"><i class="fa-brands fa-whatsapp text-base"></i> Écrire à la cliente</a>` : ''}
                </article>`;
        }).join('') : '<p class="col-span-full text-center text-sm text-gray-400 py-10">Aucune commande.</p>';
    }

    async function updateOrderStatus(id, status, select) {
        const order = state.admin.orders.find(o => o.id === id);
        if (!order || !STATUS[status]) return;
        const previous = order.status;
        order.status = status;
        select.disabled = true;
        const { error } = await sb.from('orders').update({ status }).eq('id', id);
        select.disabled = false;
        if (error) {
            order.status = previous;
            toast('Le statut n’a pas pu être modifié.');
        } else {
            toast(`Commande ${esc(order.ref)} : ${STATUS[status].label.toLowerCase()}`);
        }
        renderAdmin();
    }

    // ----------------------------------------------------------------------
    // Espace gérante : statistiques de visite
    // ----------------------------------------------------------------------
    const PAGE_LABELS = { accueil: 'Accueil', boutique: 'Boutique', galerie: 'Galerie', apropos: 'À propos', contact: 'Contact', compte: 'Mon compte' };
    const SOURCE_LABELS = [
        ['social', 'Réseaux sociaux', 'TikTok, Instagram, WhatsApp…'],
        ['organique', 'Recherche (organique)', 'Google, Bing…'],
        ['email', 'Email', 'Newsletter, messagerie'],
        ['direct', 'Direct', 'Adresse tapée, favori'],
        ['referent', 'Autres sites', 'Liens depuis d’autres sites'],
    ];
    const DEVICE_LABELS = [['mobile', 'Mobile'], ['tablette', 'Tablette'], ['ordinateur', 'Ordinateur']];
    const STATS_PERIODS = [[7, '7 jours'], [30, '30 jours'], [90, '90 jours']];

    const ratio = (a, b) => (b ? a / b : 0);
    const formatPct = x => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: x < 0.1 ? 1 : 0 })} %`;
    const formatDecimal = x => x.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    function formatDuration(ms) {
        const total = Math.round(ms / 1000);
        const m = Math.floor(total / 60), sec = total % 60;
        return m ? `${m}\u00a0min\u00a0${String(sec).padStart(2, '0')}\u00a0s` : `${sec}\u00a0s`;
    }

    const statTile = (label, value, sub = '') => `
        <div class="stat-tile">
            <p class="text-xs text-gray-500 font-semibold">${label}</p>
            <p class="stat-value">${value}</p>
            ${sub ? `<p class="text-xs text-gray-500 mt-1">${sub}</p>` : ''}
        </div>`;

    // Barre horizontale : libellé · barre · valeur (la valeur est toujours écrite)
    const barRow = (label, fraction, valueText, hint = '') => `
        <div class="bar-row" data-tip="${esc(label)} : ${esc(valueText)}">
            <div class="bar-label">
                <p class="text-sm font-semibold text-gray-800 sm:truncate">${esc(label)}</p>
                ${hint ? `<p class="text-[11px] text-gray-500 sm:truncate">${esc(hint)}</p>` : ''}
            </div>
            <p class="bar-value">${valueText}</p>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(1, fraction)) * 100}%"></div></div>
        </div>`;

    const statsSection = (n, title, intro, body) => `
        <section class="stats-card">
            <div class="flex items-start gap-3 mb-5">
                <span class="w-8 h-8 shrink-0 rounded-full bg-nuur-700 text-white text-sm font-bold flex items-center justify-center">${n}</span>
                <div>
                    <h2 class="font-serif text-xl sm:text-2xl font-bold text-gray-900">${title}</h2>
                    <p class="text-xs text-gray-500 mt-0.5">${intro}</p>
                </div>
            </div>
            ${body}
        </section>`;

    const subTitle = text => `<h3 class="text-sm font-bold text-gray-900 mb-3">${text}</h3>`;

    function dailyChart(daily) {
        const max = Math.max(1, ...daily.map(d => d.sessions));
        const label = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        const mid = Math.floor((daily.length - 1) / 2);
        return `
            <div class="relative">
                <div class="flex items-center gap-2 mb-1 text-[11px] text-gray-500 tabular-nums"><span>${formatNumber(max)}</span><span class="flex-1 border-t border-gray-100"></span></div>
                <div class="flex items-end h-40 border-b border-gray-200" role="img" aria-label="Sessions par jour">
                    ${daily.map(d => `
                        <div class="daily-col" tabindex="0" data-tip="${label(d.day)} : ${plural(d.sessions, 'session')} · ${plural(d.users, 'utilisateur')}">
                            <div class="daily-bar" style="height:${(d.sessions / max) * 100}%"></div>
                        </div>`).join('')}
                </div>
                <div class="flex justify-between mt-1.5 text-[11px] text-gray-500">
                    <span>${label(daily[0].day)}</span><span>${label(daily[mid].day)}</span><span>${label(daily[daily.length - 1].day)}</span>
                </div>
            </div>
            <details class="mt-3 text-xs">
                <summary class="cursor-pointer text-nuur-700 font-semibold">Voir les données jour par jour</summary>
                <div class="max-h-56 overflow-y-auto mt-2 border border-gray-100 rounded-xl">
                    <table class="w-full text-left tabular-nums">
                        <thead class="bg-gray-50 text-gray-500"><tr><th class="px-3 py-2 font-semibold">Jour</th><th class="px-3 py-2 font-semibold text-right">Sessions</th><th class="px-3 py-2 font-semibold text-right">Utilisateurs</th></tr></thead>
                        <tbody>${[...daily].reverse().map(d => `<tr class="border-t border-gray-100"><td class="px-3 py-1.5">${label(d.day)}</td><td class="px-3 py-1.5 text-right">${d.sessions}</td><td class="px-3 py-1.5 text-right">${d.users}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </details>`;
    }

    function renderStats() {
        $('#stats-periods').innerHTML = STATS_PERIODS.map(([d, label]) =>
            `<button type="button" data-stats-days="${d}" class="cat-btn !px-4 !py-2 ${state.stats.days === d ? 'is-active' : ''}">${label}</button>`).join('');

        const d = state.stats.data[state.stats.days];
        const box = $('#stats-content');
        if (!d) {
            box.innerHTML = '<p class="text-center text-gray-400 py-16"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></p>';
            return;
        }
        $('#stats-note').innerHTML = d.demo_sessions
            ? `<i class="fa-solid fa-flask"></i> Inclut ${plural(d.demo_sessions, 'session')} de démonstration`
            : 'Statistiques anonymes · vos propres visites ne sont pas comptées';

        if (!d.sessions) {
            box.innerHTML = `<div class="stats-card text-center text-gray-500 py-14"><i class="fa-solid fa-chart-column text-3xl text-gray-300"></i><p class="mt-3 text-sm">Pas encore de visites sur cette période.</p></div>`;
            return;
        }

        const sessions = d.sessions;
        const maxSource = Math.max(1, ...SOURCE_LABELS.map(([k]) => d.sources[k]?.sessions || 0));
        const maxDevice = Math.max(1, ...DEVICE_LABELS.map(([k]) => d.devices[k] || 0));
        const maxViews = Math.max(1, ...d.pages.map(p => p.views));
        const maxProductViews = Math.max(1, ...d.products.map(p => p.views));
        const conv = d.conversions;
        const f = d.funnel;

        const acquisition = statsSection(1, 'Acquisition', 'D’où viennent vos visiteurs et combien ils sont.', `
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                ${statTile('Utilisateurs', formatNumber(d.users), 'visiteurs uniques')}
                ${statTile('Sessions', formatNumber(sessions), 'visites')}
                ${statTile('Nouveaux visiteurs', formatNumber(d.new_users), formatPct(ratio(d.new_users, d.users)) + ' des utilisateurs')}
                ${statTile('Sessions par utilisateur', formatDecimal(ratio(sessions, d.users)))}
            </div>
            ${subTitle('Sessions par jour')}
            ${dailyChart(d.daily)}
            <div class="grid lg:grid-cols-2 gap-6 mt-6">
                <div>
                    ${subTitle('Sources de trafic')}
                    <div class="space-y-3">${SOURCE_LABELS.map(([k, label, hint]) => {
                        const n = d.sources[k]?.sessions || 0;
                        return barRow(label, n / maxSource, `${formatNumber(n)} · ${formatPct(ratio(n, sessions))}`, hint);
                    }).join('')}</div>
                    ${d.referrers.length ? `<p class="text-[11px] text-gray-500 mt-3">Principales origines : ${d.referrers.map(r => `${esc(r.host)} (${r.sessions})`).join(', ')}</p>` : ''}
                </div>
                <div>
                    ${subTitle('Appareils')}
                    <div class="space-y-3">${DEVICE_LABELS.map(([k, label]) => {
                        const n = d.devices[k] || 0;
                        return barRow(label, n / maxDevice, `${formatNumber(n)} · ${formatPct(ratio(n, sessions))}`);
                    }).join('')}</div>
                </div>
            </div>`);

        const engagement = statsSection(2, 'Engagement', 'Ce que les visiteurs regardent, et combien de temps.', `
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                ${statTile('Durée moyenne d’engagement', formatDuration(ratio(d.engagement_ms, sessions)), 'temps actif par session')}
                ${statTile('Pages par session', formatDecimal(ratio(d.page_views, sessions)))}
                ${statTile('Pages vues', formatNumber(d.page_views))}
            </div>
            <div class="grid lg:grid-cols-2 gap-6">
                <div>
                    ${subTitle('Pages les plus vues')}
                    <div class="space-y-3">${d.pages.map(p => barRow(PAGE_LABELS[p.page] || p.page, p.views / maxViews,
                        `${formatNumber(p.views)} vues`, `Engagement moyen : ${formatDuration(ratio(p.engagement_ms, p.views))}`)).join('')}</div>
                </div>
                <div>
                    ${subTitle('Produits les plus consultés')}
                    <div class="space-y-3">${d.products.length ? d.products.map(p => barRow(PRODUCT_BY_ID[p.id]?.name || p.id, p.views / maxProductViews,
                        `${formatNumber(p.views)} vues`, `${plural(p.adds, 'ajout')} au panier`)).join('') : '<p class="text-xs text-gray-400">Aucune fiche produit ouverte.</p>'}</div>
                </div>
            </div>`);

        const conversion = statsSection(3, 'Conversion', 'Les actions qui comptent, et la part des sessions qui les réalisent.', `
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                ${statTile('Taux de conversion', formatPct(ratio(conv.purchase.sessions, sessions)), 'sessions avec une commande')}
                ${statTile('Commandes', formatNumber(conv.purchase.events), `${formatNumber(d.revenue)} FCFA au total`)}
                ${statTile('Comptes créés', formatNumber(conv.sign_up.events), formatPct(ratio(conv.sign_up.sessions, sessions)) + ' des sessions')}
                ${statTile('Clics WhatsApp', formatNumber(conv.whatsapp_click.events), formatPct(ratio(conv.whatsapp_click.sessions, sessions)) + ' des sessions')}
            </div>
            ${subTitle('Parcours d’achat')}
            <div class="space-y-3">
                ${[['Visites', f.sessions], ['Fiche produit consultée', f.viewed_product], ['Ajout au panier', f.added], ['Panier ouvert', f.opened_cart], ['Commande envoyée', f.purchased]]
                    .map(([label, n]) => barRow(label, ratio(n, sessions), `${formatNumber(n)} · ${formatPct(ratio(n, sessions))}`)).join('')}
            </div>`);

        const retention = statsSection(4, 'Rétention et abandon', 'Où les visiteurs partent, et les paniers non commandés.', `
            <div class="grid grid-cols-2 gap-3 mb-6">
                ${statTile('Taux d’abandon de panier', formatPct(ratio(d.cart.abandoned, d.cart.with_cart)), `${d.cart.abandoned} sur ${plural(d.cart.with_cart, 'panier')} non commandés`)}
                ${statTile('Visiteurs récurrents', formatPct(ratio(d.returning_users, d.users)), `${formatNumber(d.returning_users)} reviennent sur le site`)}
            </div>
            ${subTitle('Taux de sortie par page')}
            <p class="text-[11px] text-gray-500 -mt-2 mb-3">Part des vues d’une page qui ont été la dernière de la visite.</p>
            <div class="space-y-3">${[...d.pages].sort((a, b) => ratio(b.exits, b.views) - ratio(a.exits, a.views)).map(p =>
                barRow(PAGE_LABELS[p.page] || p.page, ratio(p.exits, p.views), formatPct(ratio(p.exits, p.views)), `${formatNumber(p.exits)} sorties sur ${formatNumber(p.views)} vues`)).join('')}</div>`);

        box.innerHTML = acquisition + engagement + conversion + retention + '<div id="stats-tip" class="chart-tip hidden" role="tooltip"></div>';
        armChildren(box);
    }

    async function loadStats({ force = false } = {}) {
        if (!sb || !state.profile?.is_admin) return;
        const days = state.stats.days;
        if (state.stats.data[days] && !force) return renderStats();
        renderStats();
        const { data, error } = await sb.rpc('admin_analytics', { p_days: days });
        if (error) {
            $('#stats-content').innerHTML = '<p class="text-center text-sm text-red-600 py-10">Impossible de charger les statistiques. Le fichier SQL des statistiques est-il installé dans Supabase ?</p>';
            return;
        }
        state.stats.data[days] = data;
        if (state.stats.days === days && state.admin.view === 'stats') renderStats();
    }

    function setAdminView(view) {
        state.admin.view = view;
        $$('[data-admin-view]').forEach(b => b.classList.toggle('is-active', b.dataset.adminView === view));
        $('#admin-view-orders').classList.toggle('hidden', view !== 'orders');
        $('#admin-view-stats').classList.toggle('hidden', view !== 'stats');
        if (view === 'stats') loadStats();
    }

    // Infobulle des graphiques (souris et clavier)
    function showChartTip(target) {
        const tip = $('#stats-tip');
        if (!tip) return;
        if (!target) return tip.classList.add('hidden');
        const box = $('#stats-content').getBoundingClientRect(), r = target.getBoundingClientRect();
        tip.textContent = target.dataset.tip;
        tip.classList.remove('hidden');
        const left = Math.min(Math.max(r.left + r.width / 2 - box.left - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
        tip.style.left = `${left}px`;
        tip.style.top = `${r.top - box.top - tip.offsetHeight - 8}px`;
    }

    // ----------------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------------
    const actions = {
        'open-cart': () => { closeOverlay('product-modal'); openOverlay('cart'); },
        'close-cart': () => closeOverlay('cart'),
        'checkout': checkout,
        'finish-order': finishOrder,
        'back-to-cart': () => $('#cart-sent').classList.replace('flex', 'hidden'),
        'reopen-whatsapp': () => { if (state.lastOrder && !window.open(state.lastOrder.url, '_blank')) location.href = state.lastOrder.url; },
        'qty': el => changeQty(el.dataset.key, Number(el.dataset.delta)),
        'remove': el => removeLine(el.dataset.key),
        'add': el => {
            flyToCart(el.closest('.product-card')?.querySelector('img'));
            addToCart(el.dataset.id, state.selected[el.dataset.id] ?? 0);
        },
        'select-variant': el => { state.selected[el.dataset.id] = Number(el.dataset.index); renderProducts(); },
        'open-product': el => openProduct(el.dataset.id),
        'close-modal': () => closeOverlay('product-modal'),
        'modal-image': el => { state.modal.img = el.dataset.img; renderModal(); replayClass($('#modal-product-content img'), 'fade-swap'); },
        'modal-qty': el => { state.modal.qty = Math.max(1, Math.min(99, state.modal.qty + Number(el.dataset.delta))); renderModal(); },
        'modal-add': () => {
            const { id, qty } = state.modal;
            flyToCart($('#modal-product-content img'));
            addToCart(id, state.selected[id] ?? 0, qty);
            closeOverlay('product-modal');
        },
        'toggle-favorite': el => toggleFavorite(el.dataset.id),
        'open-search': () => openOverlay('search-modal'),
        'close-search': () => closeOverlay('search-modal'),
        'search-result': el => { closeOverlay('search-modal'); openProduct(el.dataset.id); },
        'toggle-menu': el => {
            const menu = $('#mobile-menu');
            const open = menu.classList.toggle('hidden') === false;
            $('#mobile-menu-icon').className = `fa-solid ${open ? 'fa-xmark' : 'fa-bars'} text-2xl w-6 text-center`;
            el.setAttribute('aria-expanded', String(open));
        },
        'lightbox': el => { showLightbox(Number(el.dataset.index)); openOverlay('lightbox'); },
        'lb-prev': () => showLightbox(state.lightboxIndex - 1),
        'lb-next': () => showLightbox(state.lightboxIndex + 1),
        'lb-close': () => closeOverlay('lightbox'),
        'logout': async () => { await sb?.auth.signOut(); state.authView = 'login'; toast('Vous êtes déconnecté(e).'); },
        'go-account': () => { location.hash = 'compte'; },
        'reorder': el => reorder(el.dataset.ref),
        'admin-refresh': () => { state.admin.view === 'stats' ? loadStats({ force: true }) : loadAdmin(); },
    };

    document.addEventListener('click', e => {
        if (e.target.closest('a[href*="wa.me/"]')) analytics.track('whatsapp_click');

        const catLink = e.target.closest('[data-category]');
        if (catLink) setCategory(catLink.dataset.category);

        if (e.target.closest('[data-nav]')) closeMenu();

        const filterBtn = e.target.closest('[data-filter]');
        if (filterBtn) { state.category = filterBtn.dataset.filter; renderProducts(); armChildren($('#shop-products')); }

        const authView = e.target.closest('[data-auth-view]');
        if (authView) setAuthView(authView.dataset.authView);

        const accountTab = e.target.closest('[data-account-tab]');
        if (accountTab) {
            state.accountTab = accountTab.dataset.accountTab;
            renderAccount();
            const content = $('#account-tab-' + state.accountTab);
            replayClass(content, 'fade-swap');
            armChildren($('[data-reveal-stagger]', content));
            // Sur mobile le contenu est sous le profil : on y descend
            if (window.innerWidth < 768) content.parentElement.scrollIntoView({ behavior: motionOK ? 'smooth' : 'auto', block: 'start' });
        }

        const adminView = e.target.closest('[data-admin-view]');
        if (adminView) setAdminView(adminView.dataset.adminView);

        const statsDays = e.target.closest('[data-stats-days]');
        if (statsDays) { state.stats.days = Number(statsDays.dataset.statsDays); loadStats(); }

        const adminFilter = e.target.closest('[data-admin-filter]');
        if (adminFilter) { state.admin.filter = adminFilter.dataset.adminFilter; renderAdmin(); armChildren($('#admin-orders')); }

        const el = e.target.closest('[data-action]');
        if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
    });

    $('#stats-content').addEventListener('pointerover', e => showChartTip(e.target.closest('[data-tip]')));
    $('#stats-content').addEventListener('pointerleave', () => showChartTip(null));
    $('#stats-content').addEventListener('focusin', e => showChartTip(e.target.closest('[data-tip]')));
    $('#stats-content').addEventListener('focusout', () => showChartTip(null));

    // Cliquer à côté de la photo ferme la lightbox
    $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeOverlay('lightbox'); });

    // Swipe dans la lightbox
    let touchStartX = null;
    $('#lightbox').addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    $('#lightbox').addEventListener('touchend', e => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 50) showLightbox(state.lightboxIndex + (dx < 0 ? 1 : -1));
        touchStartX = null;
    });

    document.addEventListener('keydown', e => {
        const top = overlayStack[overlayStack.length - 1];
        if (e.key === 'Escape' && top) closeOverlay(top);
        if (top === 'lightbox' && e.key === 'ArrowLeft') showLightbox(state.lightboxIndex - 1);
        if (top === 'lightbox' && e.key === 'ArrowRight') showLightbox(state.lightboxIndex + 1);
    });

    $('#shop-search-input').addEventListener('input', e => { state.search = e.target.value; renderProducts(); });
    $('#quick-search-input').addEventListener('input', e => renderQuickSearch(e.target.value));
    $('#admin-search').addEventListener('input', e => { state.admin.search = e.target.value; renderAdmin(); });

    document.addEventListener('change', e => {
        const sel = e.target.closest('[data-admin-status]');
        if (sel) updateOrderStatus(sel.dataset.adminStatus, sel.value, sel);
    });

    // Mémorise les infos de livraison pour la prochaine fois
    $('#cart-form').addEventListener('input', e => {
        e.target.classList.remove('is-invalid');
        const c = readCheckout();
        storage.set(KEYS.customer, { name: c.name, phone: c.phone, zone: c.zone, address: c.address });
    });
    $('#cart-form').addEventListener('submit', e => { e.preventDefault(); checkout(); });

    $('#contact-form').addEventListener('submit', e => {
        e.preventDefault();
        const name = $('#contact-name'), msg = $('#contact-message');
        [name, msg].forEach(el => el.classList.toggle('is-invalid', !el.value.trim()));
        if (!name.value.trim() || !msg.value.trim()) return (name.value.trim() ? msg : name).focus();
        analytics.track('whatsapp_click');
        const text = `Bonjour Nuur Cosmetik,\n\n*Nom :* ${name.value.trim()}\n*Sujet :* ${$('#contact-subject').value}\n*Message :* ${msg.value.trim()}`;
        if (!window.open(waUrl(text), '_blank')) location.href = waUrl(text);
    });
    $('#contact-form').addEventListener('input', e => e.target.classList.remove('is-invalid'));

    // Formulaires du compte
    const val = id => $('#' + id).value.trim();

    $('#login-form').addEventListener('submit', e => {
        e.preventDefault();
        const email = val('login-email'), password = $('#login-password').value;
        if (!email || !password) return authMessage('Saisissez votre email et votre mot de passe.');
        withBusy(e.target, async () => {
            const { error } = await sb.auth.signInWithPassword({ email, password });
            if (error) return authMessage(authError(error));
            analytics.track('login');
            $('#login-password').value = '';
            authMessage('');
        });
    });

    $('#signup-form').addEventListener('submit', e => {
        e.preventDefault();
        const full_name = val('signup-name'), phone = val('signup-phone'), email = val('signup-email'), password = $('#signup-password').value;
        if (!full_name || !email || !password) return authMessage('Merci de remplir les champs obligatoires (*).');
        if (password.length < 6) return authMessage(AUTH_ERRORS['Password should be at least 6 characters.']);
        withBusy(e.target, async () => {
            const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name, phone }, emailRedirectTo: siteUrl() } });
            if (error) return authMessage(authError(error));
            if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) {
                return authMessage(AUTH_ERRORS['User already registered']);
            }
            $('#signup-password').value = '';
            analytics.track('sign_up');
            if (!data.session) {
                state.authView = 'login';
                renderAccount();
                authMessage('Compte créé ! Confirmez votre email grâce au lien reçu, puis connectez-vous.', 'success');
            } else {
                toast(`Bienvenue ${esc(full_name.split(' ')[0])} ! 💚`);
            }
        });
    });

    $('#forgot-form').addEventListener('submit', e => {
        e.preventDefault();
        const email = val('forgot-email');
        if (!email) return authMessage('Saisissez votre email.');
        withBusy(e.target, async () => {
            const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
            if (error) return authMessage(authError(error));
            authMessage('Si un compte existe avec cet email, un lien vient de vous être envoyé.', 'success');
        });
    });

    $('#reset-form').addEventListener('submit', e => {
        e.preventDefault();
        const password = $('#reset-password').value;
        if (password.length < 6) return authMessage(AUTH_ERRORS['Password should be at least 6 characters.']);
        withBusy(e.target, async () => {
            const { error } = await sb.auth.updateUser({ password });
            if (error) return authMessage(authError(error));
            $('#reset-password').value = '';
            state.authView = 'login';
            renderAccount();
            toast('Mot de passe modifié ✔');
        });
    });

    $('#profile-form').addEventListener('submit', e => {
        e.preventDefault();
        const msg = $('#profile-message');
        const update = { full_name: val('profile-name'), phone: val('profile-phone'), zone: $('#profile-zone').value, address: val('profile-address') };
        withBusy(e.target, async () => {
            const { error } = await sb.from('profiles').update(update).eq('id', state.user.id);
            if (error) {
                msg.className = 'text-xs font-semibold text-red-600';
                msg.textContent = 'Enregistrement impossible, réessayez.';
                return;
            }
            Object.assign(state.profile, update);
            prefillCheckout({ name: update.full_name, phone: update.phone, zone: update.zone, address: update.address }, { overwrite: true });
            msg.className = 'text-xs font-semibold text-nuur-700';
            msg.textContent = 'Modifications enregistrées ✔';
            setTimeout(() => { msg.textContent = ''; }, 3000);
            document.activeElement?.blur();
            renderAccount();
        });
    });

    // ----------------------------------------------------------------------
    // Init
    // ----------------------------------------------------------------------
    const zoneOptions = CFG.deliveryZones.map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
    $('#checkout-zone').innerHTML = zoneOptions;
    $('#profile-zone').innerHTML = zoneOptions;

    $$('.wa-link').forEach(a => { a.href = waUrl(); });
    $$('.wa-display').forEach(el => { el.textContent = CFG.whatsappDisplay; });
    $('#year').textContent = new Date().getFullYear();

    prefillCheckout(storage.get(KEYS.customer, {}));
    renderGallery();
    renderProducts();
    renderCart();
    window.addEventListener('hashchange', route);
    route();
    armReveal($('footer'));

    const header = $('#site-header');
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (sb) {
        // Le callback ne doit pas attendre d'autres appels Supabase directement (verrou interne)
        sb.auth.onAuthStateChange((event, session) => { setTimeout(() => handleSession(event, session), 0); });
    }
})();
