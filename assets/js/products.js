// ==========================================================================
//  NUUR COSMETIK — CATALOGUE & RÉGLAGES
//  Pour changer un prix, ajouter un produit ou modifier le numéro WhatsApp,
//  il suffit d'éditer ce fichier puis de le renvoyer sur GitHub.
// ==========================================================================

window.NUUR_CONFIG = {
    // Numéro qui reçoit les commandes : format international, sans "+" ni espaces
    whatsappNumber: '221762382500',
    whatsappDisplay: '+221 76 238 25 00',
    tiktok: 'nuurcosn',
    currency: 'FCFA',
    deliveryZones: ['Dakar & banlieue', 'Régions du Sénégal'],

    // Comptes clients & historique des commandes (Supabase).
    // Coller ici "Project URL" et "Publishable key" (ou "anon public key") depuis
    // Supabase > Project Settings > API. Ces deux valeurs sont publiques, c'est normal.
    // Laisser vide = le site fonctionne sans comptes (commande en invité uniquement).
    supabaseUrl: 'https://fyqvxjjlzdirjfhnccoo.supabase.co',
    supabaseKey: 'sb_publishable_pBT0NLJGYiyRRKC8AU3pZg_UPsJ7bZy',
};

// Catégories : 'capillaires' (cheveux) et/ou 'corporels' (corps & peau).
// Un produit peut appartenir aux deux.
// variants : chaque format avec son prix en FCFA (le premier est sélectionné par défaut).
window.NUUR_PRODUCTS = [
    {
        id: 'lotion-capillaire',
        name: 'Lotion Capillaire',
        englishName: 'Hair Lotion',
        categories: ['capillaires'],
        badge: 'Cheveux afro',
        image: 'assets/img/products/lotion-capillaire.jpg',
        sheet: 'assets/img/products/lotion-capillaire-fiche.jpg',
        description: 'La lotion nourrit et hydrate vos cheveux en profondeur pour une chevelure saine et brillante.',
        idealFor: 'Cheveux afro : enfants et adultes',
        ingredients: 'Karité, noyaux de dattes, huiles essentielles',
        usage: '3 applications par semaine',
        variants: [
            { size: '100 ml', price: 3000 },
            { size: '200 ml', price: 5000 },
        ],
    },
    {
        id: 'huile-hydratante',
        name: 'Huile Hydratante Naturelle',
        englishName: 'Natural Oil',
        categories: ['capillaires', 'corporels'],
        badge: 'Cheveux & corps',
        image: 'assets/img/products/huile-hydratante.jpg',
        sheet: 'assets/img/products/huile-hydratante-fiche.jpg',
        description: 'Idéale et indispensable pour redonner de l’éclat à vos cheveux et à votre peau. Cette huile de la gamme Nuur vous permet de réparer, d’assouplir, de régénérer et de nourrir les zones concernées.',
        idealFor: 'Enfants et adultes',
        ingredients: 'Huile de datte, huile de baobab, huile d’argan, huile d’avocat, huile de jojoba',
        variants: [
            { size: '30 ml', price: 3000 },
            { size: '60 ml', price: 6000 },
        ],
    },
    {
        id: 'spray-croissance',
        name: 'Spray de Croissance',
        englishName: 'Growth Spray',
        categories: ['capillaires'],
        badge: 'Pousse',
        image: 'assets/img/products/spray-croissance.jpg',
        sheet: 'assets/img/products/spray-croissance-fiche.jpg',
        description: 'Fait à base d’huiles essentielles infusées dans une eau stérilisée, le spray de croissance de Nuur stimule et renforce les cheveux tout en favorisant leur croissance.',
        idealFor: 'Enfants et adultes',
        ingredients: 'Clou de girofle, huiles naturelles',
        variants: [
            { size: '50 ml', price: 1000 },
            { size: '100 ml', price: 1500 },
        ],
    },
    {
        id: 'gommage',
        name: 'Gommage',
        englishName: 'Body Scrub',
        categories: ['corporels'],
        badge: 'Exfoliant',
        image: 'assets/img/products/gommage.jpg',
        sheet: 'assets/img/products/gommage-fiche.jpg',
        description: 'Pour purifier le corps, éliminer les cellules mortes et les impuretés, et laisser la peau lisse et douce.',
        idealFor: 'Homme et femme',
        ingredients: 'Noyaux de datte, poudre de coco, vétiver (« Ceep »)',
        variants: [
            { size: '100 ml', price: 3000 },
        ],
    },
    {
        id: 'masque-argile',
        name: 'Masque à l’Argile',
        englishName: 'Clay Mask',
        categories: ['corporels'],
        badge: 'Purifiant',
        image: 'assets/img/products/masque-argile.jpg',
        sheet: 'assets/img/products/masque-argile-fiche.jpg',
        description: 'Purifie et régénère votre peau pour un teint éclatant et lumineux.',
        idealFor: 'Homme et femme',
        ingredients: 'Argile blanche en poudre',
        variants: [
            { size: '100 ml', price: 2000 },
        ],
    },
];

// Photos de la galerie (largeur/hauteur servent à éviter les sauts de mise en page)
window.NUUR_GALLERY = [
    { src: 'assets/img/gallery/nuur-01.jpg', w: 600, h: 900, alt: 'Trois personnes aux cheveux naturels bouclés et crépus' },
    { src: 'assets/img/gallery/nuur-02.jpg', w: 848, h: 1185, alt: 'Mains définissant des boucles naturelles' },
    { src: 'assets/img/gallery/nuur-03.jpg', w: 736, h: 920, alt: 'Homme appliquant une huile sur sa barbe avec une pipette' },
    { src: 'assets/img/gallery/nuur-04.jpg', w: 1028, h: 1280, alt: 'Huile appliquée à la pipette sur des tresses' },
    { src: 'assets/img/gallery/nuur-05.jpg', w: 675, h: 1200, alt: 'Enfant se faisant coiffer ses cheveux crépus' },
    { src: 'assets/img/gallery/nuur-06.jpg', w: 1024, h: 1280, alt: 'Femme appliquant une huile sur le cuir chevelu d’un homme' },
    { src: 'assets/img/gallery/nuur-07.jpg', w: 916, h: 960, alt: 'Cheveux crépus étirés pour montrer leur longueur' },
    { src: 'assets/img/gallery/nuur-08.jpg', w: 736, h: 959, alt: 'Barbe soignée en gros plan' },
    { src: 'assets/img/gallery/nuur-09.jpg', w: 375, h: 562, alt: 'Tresses coiffées avec un peigne' },
    { src: 'assets/img/gallery/nuur-10.jpg', w: 854, h: 1280, alt: 'Cheveux crépus démêlés au peigne' },
];
