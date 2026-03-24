/**
 * Product image mapping.
 * 258 Komet catalog images + AI-generated bouquet/combo images organized in /images/shop/.
 * Matches product variety+color from database to actual image files.
 *
 * Matching strategy:
 * 1. Exact key match: normalize(variety-color) → file
 * 2. Variety-only prefix match
 * 3. Category-level fallback
 * 4. Floropolis logo
 */

// ━━━ IMAGE FILE MAP ━━━
// Keys = filename without extension, Values = path
// Generated from public/images/shop/ subdirectories

const IMAGE_MAP: Record<string, string> = {
  // ── Anemone (12 unique) ──
  "anemones-blue": "/images/shop/anemone/anemones-blue.png",
  "anemones-burdeaux": "/images/shop/anemone/anemones-burdeaux.png",
  "anemones-fucsia": "/images/shop/anemone/anemones-fucsia.png",
  "anemones-pink": "/images/shop/anemone/anemones-pink.png",
  "anemones-red": "/images/shop/anemone/anemones-red.png",
  "anemones-white": "/images/shop/anemone/anemones-white.png",
  "full-star-blue": "/images/shop/anemone/full-star-blue.png",
  "full-star-red": "/images/shop/anemone/full-star-red.png",
  "full-star-strawberry": "/images/shop/anemone/full-star-strawberry.png",
  "full-star-white": "/images/shop/anemone/full-star-white.png",
  "mistral-burgundy": "/images/shop/anemone/mistral-burgundy.png",
  "mistral-pink": "/images/shop/anemone/mistral-pink.png",

  // ── Roses (116) ──
  "absolut-in-pink-pink": "/images/shop/roses/absolut-in-pink-pink.png",
  "aloha-orange": "/images/shop/roses/aloha-orange.png",
  "altamira-cherry-red": "/images/shop/roses/altamira-cherry-red.png",
  "amsterdam-coral-pink": "/images/shop/roses/amsterdam-coral-pink.png",
  "antonia-garden-cream": "/images/shop/roses/antonia-garden-cream.png",
  "menta-cream": "/images/shop/roses/antonia-garden-cream.png",
  "apple-jack-red-creamy-green": "/images/shop/roses/apple-jack-red-creamy-green.png",
  "arya-soft-lavender": "/images/shop/roses/arya-soft-lavender.png",
  "atomic-yellow-red": "/images/shop/roses/atomic-yellow-red.png",
  "barista-mauve": "/images/shop/roses/barista-mauve.png",
  "be-sweet-light-pink": "/images/shop/roses/be-sweet-light-pink.png",
  "pomarosa-light-pink": "/images/shop/roses/be-sweet-light-pink.png",
  "black-baccara-very-dark-velvet-red": "/images/shop/roses/black-baccara-very-dark-velvet-red.png",
  "blueberry-dark-lavender": "/images/shop/roses/blueberry-dark-lavender.png",
  "lavender-blueberry-lavender": "/images/shop/roses/lavender-blueberry-lavender.png",
  "blueberry-lavender": "/images/shop/roses/lavender-blueberry-lavender.png",
  "boulevard-white-light-pink": "/images/shop/roses/boulevard-white-light-pink.png",
  "brighton-bright-yellow": "/images/shop/roses/brighton-bright-yellow.png",
  "cancun-light-yellow": "/images/shop/roses/cancun-light-yellow.png",
  "yellow-cancun-yellow": "/images/shop/roses/cancun-light-yellow.png",
  "cancun-yellow": "/images/shop/roses/cancun-light-yellow.png",
  "tiffany-lavender": "/images/shop/roses/tiffany-lavender.png",
  "tiffany-peach": "/images/shop/roses/tiffany-peach.png",
  "candlelight-cream": "/images/shop/roses/candlelight-cream.png",
  "carpe-diem-light-peach-red-outer": "/images/shop/roses/carpe-diem-light-peach-red-outer.png",
  "cavendish-bright-peach": "/images/shop/roses/cavendish-bright-peach.png",
  "cayenne-orange": "/images/shop/roses/cayenne-orange.png",
  "champagner-sandy-cream": "/images/shop/roses/champagner-sandy-cream.png",
  "cherry-mist-cherry-wine": "/images/shop/roses/cherry-mist-cherry-wine.png",
  "coldplay-white": "/images/shop/roses/coldplay-white.png",
  "cold-play-white": "/images/shop/roses/coldplay-white.png",
  "cool-water-lavender": "/images/shop/roses/cool-water-lavender.png",
  "cotton-x-pression-white": "/images/shop/roses/cotton-x-pression-white.png",
  "country-blues-dark-pink": "/images/shop/roses/country-blues-dark-pink.png",
  "country-candy-white-red": "/images/shop/roses/country-candy-white-red.png",
  "country-home-peach": "/images/shop/roses/country-home-peach.png",
  "creme-de-la-creme-cream": "/images/shop/roses/creme-de-la-creme-cream.png",
  "dark-crown-purple-cherry": "/images/shop/roses/dark-crown-purple-cherry.png",
  "deep-purple-lavender-purple-edges": "/images/shop/roses/deep-purple-lavender-purple-edges.png",
  "encanto-cream-yellow-orange-edge": "/images/shop/roses/encanto-cream-yellow-orange-edge.png",
  "enchantment-bicolor-white-red": "/images/shop/roses/enchantment-bicolor-white-red.png",
  "escimo-pure-white": "/images/shop/roses/escimo-pure-white.png",
  "esperance-cream-pink": "/images/shop/roses/esperance-cream-pink.png",
  "explorer-red": "/images/shop/roses/explorer-red.png",
  "mamma-mia-red": "/images/shop/roses/explorer-red.png",
  "faith-pink-lavender": "/images/shop/roses/faith-pink-lavender.png",
  "fancy-dreams-blush-white": "/images/shop/roses/fancy-dreams-blush-white.png",
  "felicity-peach": "/images/shop/roses/felicity-peach.png",
  "fortune-red": "/images/shop/roses/fortune-red.png",
  "free-spirit-orange-&-tan": "/images/shop/roses/free-spirit-orange-&-tan.png",
  "freedom-red": "/images/shop/roses/freedom-red.png",
  "frutteto-light-pink-green-outer-petals": "/images/shop/roses/frutteto-light-pink-green-outer-petals.png",
  "full-monty-hot-pink": "/images/shop/roses/full-monty-hot-pink.png",
  "funky-soul-hot-pink-orange-&-yellow-hints": "/images/shop/roses/funky-soul-hot-pink-orange-&-yellow-hints.png",
  "geraldine-pink-green-outer-petals": "/images/shop/roses/geraldine-pink-green-outer-petals.png",
  "goldfinch-yellow": "/images/shop/roses/goldfinch-yellow.png",
  "gotcha-hot-pink": "/images/shop/roses/gotcha-hot-pink.png",
  "green-romance-green": "/images/shop/roses/green-romance-green.png",
  "hard-rock-dark-pink": "/images/shop/roses/hard-rock-dark-pink.png",
  "hearts-deep-red": "/images/shop/roses/hearts-deep-red.png",
  "high-&-exotic-deep-yellow": "/images/shop/roses/high-&-exotic-deep-yellow.png",
  "high-&-flame-magic-yellow-red-outer-petals": "/images/shop/roses/high-&-flame-magic-yellow-red-outer-petals.png",
  "high-&-magic-yellow-red": "/images/shop/roses/high-&-magic-yellow-red.png",
  "high-yellow-magic-yellow": "/images/shop/roses/high-yellow-magic-yellow.png",
  "highlight-white": "/images/shop/roses/highlight-white.png",
  "hot-explorer-hot-pink": "/images/shop/roses/hot-explorer-hot-pink.png",
  "joy-dark-orange": "/images/shop/roses/joy-dark-orange.png",
  "kahala-bicolor-peach-orange": "/images/shop/roses/kahala-bicolor-peach-orange.png",
  "lighthouse-deep-yellow": "/images/shop/roses/lighthouse-deep-yellow.png",
  "limonada-light-green": "/images/shop/roses/limonada-light-green.png",
  "lola-hot-pink": "/images/shop/roses/lola-hot-pink.png",
  "magic-times-sparkled-red-on-white": "/images/shop/roses/magic-times-sparkled-red-on-white.png",
  "mandala-bicolor-white-red": "/images/shop/roses/mandala-bicolor-white-red.png",
  "mandarin-x-pression-peach-salmon": "/images/shop/roses/mandarin-x-pression-peach-salmon.png",
  "miss-piggy-coral-pink": "/images/shop/roses/miss-piggy-coral-pink.png",
  "momentum-yellow": "/images/shop/roses/momentum-yellow.png",
  "mondial-white": "/images/shop/roses/mondial-white.png",
  "moody-blues-dark-lavender": "/images/shop/roses/moody-blues-dark-lavender.png",
  "moonstone-white": "/images/shop/roses/moonstone-white.png",
  "nectarine-light-peach": "/images/shop/roses/nectarine-light-peach.png",
  "nena-light-pink": "/images/shop/roses/nena-light-pink.png",
  "nexus-orange": "/images/shop/roses/nexus-orange.png",
  "nina-dark-orange": "/images/shop/roses/nina-dark-orange.png",
  "novia-light-pink": "/images/shop/roses/novia-light-pink.png",
  "ocean-song-soft-lavender": "/images/shop/roses/ocean-song-soft-lavender.png",
  "opala-dark-pink": "/images/shop/roses/opala-dark-pink.png",
  "orange-crush-orange": "/images/shop/roses/orange-crush-orange.png",
  "paloma-cream-hot-pink": "/images/shop/roses/paloma-cream-hot-pink.png",
  "phoenix-peach-pink": "/images/shop/roses/phoenix-peach-pink.png",
  "piacere-dark-lavender": "/images/shop/roses/piacere-dark-lavender.png",
  "pink-floyd-bright-purple": "/images/shop/roses/pink-floyd-bright-purple.png",
  "pink-mondial-light-pink": "/images/shop/roses/pink-mondial-light-pink.png",
  "pink-x-pression-pink": "/images/shop/roses/pink-x-pression-pink.png",
  "playa-blanca-white": "/images/shop/roses/playa-blanca-white.png",
  "powder-puff-light-pink": "/images/shop/roses/powder-puff-light-pink.png",
  "princess-crown-peach": "/images/shop/roses/princess-crown-peach.png",
  "queen's-crown-lavender": "/images/shop/roses/queen's-crown-lavender.png",
  "queenberry-hot-pink": "/images/shop/roses/queenberry-hot-pink.png",
  "quicksand-sandy-cream": "/images/shop/roses/quicksand-sandy-cream.png",
  "razzmatazz-terracota": "/images/shop/roses/razzmatazz-terracota.png",
  "redvolution-red": "/images/shop/roses/redvolution-red.png",
  "rhoslyn-pink": "/images/shop/roses/rhoslyn-pink.png",
  "roseberry-purple-cherry": "/images/shop/roses/roseberry-purple-cherry.png",
  "rosita-vendela-light-pink": "/images/shop/roses/rosita-vendela-light-pink.png",
  "shimmer-light-peach-pink": "/images/shop/roses/shimmer-light-peach-pink.png",
  "shocking-blue-pearl-blue-mauve-undertones": "/images/shop/roses/shocking-blue-pearl-blue-mauve-undertones.png",
  "silantoi-yellow-red": "/images/shop/roses/silantoi-yellow-red.png",
  "summerlight-bicolor-yellow-red": "/images/shop/roses/summerlight-bicolor-yellow-red.png",
  "sunmaster-bright-yellow": "/images/shop/roses/sunmaster-bright-yellow.png",
  "sunny-days-light-yellow-with-green-center": "/images/shop/roses/sunny-days-light-yellow-with-green-center.png",
  "sweet-cake-pink": "/images/shop/roses/sweet-cake-pink.png",
  "sweet-memory-pink": "/images/shop/roses/sweet-memory-pink.png",
  "sweet-unique-pink": "/images/shop/roses/sweet-unique-pink.png",
  "tibet-pure-white": "/images/shop/roses/tibet-pure-white.png",
  "tie-dye-light-peach": "/images/shop/roses/tie-dye-light-peach.png",
  "toffee-caramel": "/images/shop/roses/toffee-caramel.png",
  "teddys-brown": "/images/shop/roses/toffee-caramel.png",
  "twilight-light-peach-dark-edges": "/images/shop/roses/twilight-light-peach-dark-edges.png",
  "veggie-green": "/images/shop/roses/veggie-green.png",
  "vendela-ivory-cream": "/images/shop/roses/vendela-ivory-cream.png",
  "vi-pink-hot-pink": "/images/shop/roses/vi-pink-hot-pink.png",
  "vicky-gardens-champagne": "/images/shop/roses/vicky-gardens-champagne.png",
  "violet-hill-lavender": "/images/shop/roses/violet-hill-lavender.png",
  "wasabi-green": "/images/shop/roses/wasabi-green.png",
  "westminster-abbey-sandy-beige": "/images/shop/roses/westminster-abbey-sandy-beige.png",
  "white-o'hara-cream-white": "/images/shop/roses/white-o'hara-cream-white.png",
  "white-shimmer-cream": "/images/shop/roses/white-shimmer-cream.png",

  // ── Delphinium (8) ──
  "astolat": "/images/shop/delphinium/astolat.png",
  "bella-andes-white": "/images/shop/delphinium/bella-andes-white.png",
  "blue-bird": "/images/shop/delphinium/blue-bird.png",
  "pacific-blue-bird-blue": "/images/shop/delphinium/blue-bird.png",
  "galahad-white": "/images/shop/delphinium/galahad-white.png",
  "pacific-galahad-white": "/images/shop/delphinium/galahad-white.png",
  "guinevere": "/images/shop/delphinium/guinevere.jpg",
  "sea-waltz-dark-blue": "/images/shop/delphinium/sea-waltz-dark-blue.png",
  "sky-waltz-light-blue": "/images/shop/delphinium/sky-waltz-light-blue.png",
  "summer-skies": "/images/shop/delphinium/summer-skies.png",
  "pacific-assorted": "/images/shop/delphinium/summer-skies.png",
  "pacific-summer-skies-light-blue": "/images/shop/delphinium/summer-skies.png",
  // Larkspur color aliases (variety="Larkspur" + color → larkspur-{color})
  "larkspur-pink": "/images/shop/delphinium/larkspur-pink-carmine.png",
  "larkspur-purple": "/images/shop/delphinium/larkspur-quis-purple.png",
  "larkspur-assorted": "/images/shop/delphinium/larkspur-quis-purple.png",

  // ── Ranunculus (11) ──
  "ranunculus-burgundy": "/images/shop/ranunculus/burgundy.png",
  "ranunculus-brown": "/images/shop/ranunculus/chocolate.png",      // Brown → chocolate (closest)
  "ranunculus-chocolate": "/images/shop/ranunculus/chocolate.png",
  "ranunculus-cream": "/images/shop/ranunculus/cream.png",
  "ranunculus-hot-pink": "/images/shop/ranunculus/hot-pink.png",
  "ranunculus-lavender": "/images/shop/ranunculus/lilie.png",       // Lavender → lilie (closest)
  "ranunculus-lilie": "/images/shop/ranunculus/lilie.png",
  "ranunculus-orange": "/images/shop/ranunculus/orange.png",
  "ranunculus-peach": "/images/shop/ranunculus/salmon.png",         // Peach → salmon (closest)
  "ranunculus-pink": "/images/shop/ranunculus/pink.png",
  "ranunculus-red": "/images/shop/ranunculus/red.png",
  "ranunculus-salmon": "/images/shop/ranunculus/salmon.png",
  "ranunculus-white": "/images/shop/ranunculus/white.png",
  "ranunculus-yellow": "/images/shop/ranunculus/yellow.png",
  "ranunculus-assorted": "/images/shop/ranunculus/hot-pink.png",    // Assorted → hot-pink fallback
  "ranunculus-light-pink": "/images/shop/ranunculus/pink.png",      // Light Pink → pink (for Bon Bon)
  "bon-bon-light-pink": "/images/shop/ranunculus/pink.png",

  // ── Greens (21) ──
  "anglonema-tip-green": "/images/shop/greens/anglonema-tip-green.png",
  "aglaonema-tip-green": "/images/shop/greens/anglonema-tip-green.png",  // typo alias
  "areca-palm-green": "/images/shop/greens/areca-palm-green.jpg",
  "arrow-palm-green": "/images/shop/greens/arrow-palm-green.jpg",
  "croton-tip-lemon-drop-green": "/images/shop/greens/croton-tip-lemon-drop-green.png",
  "dieffenbachia-white": "/images/shop/greens/dieffenbachia-white.jpg",
  "doll-green": "/images/shop/greens/doll-green.png",
  "lettuce-fern-green": "/images/shop/greens/lettuce-fern-green.jpg",
  "monstera-green": "/images/shop/greens/monstera-green.jpg",
  "musa-leaf-green": "/images/shop/greens/musa-leaf-green.jpg",
  "pandanus-curly-variegated-green": "/images/shop/greens/pandanus-curly-variegated-green.jpg",
  "pandanus-green-green": "/images/shop/greens/pandanus-green-green.jpg",
  "pandanus-variegated-green": "/images/shop/greens/pandanus-variegated-green.jpg",
  "phi-congo-green": "/images/shop/greens/phi-congo-green.jpg",
  "congo-green": "/images/shop/greens/phi-congo-green.jpg",         // variety stored without "Philodendron" prefix
  "phi-congo-red": "/images/shop/greens/phi-congo-red.jpg",
  "congo-red": "/images/shop/greens/phi-congo-red.jpg",
  "phi-esmeralda-green": "/images/shop/greens/phi-esmeralda-green.jpg",
  "esmeralda-green": "/images/shop/greens/phi-esmeralda-green.jpg",
  "curly-variegated-green": "/images/shop/greens/pandanus-curly-variegated-green.jpg",
  "davalia-green": "/images/shop/greens/doll-green.png",            // fern family — closest available
  "fern-davalia-green": "/images/shop/greens/doll-green.png",
  "phi-xanadu-green": "/images/shop/greens/phi-xanadu-green.jpg",
  "xanadu-green": "/images/shop/greens/phi-xanadu-green.jpg",
  "phi-xantal-green": "/images/shop/greens/phi-xantal-green.png",
  "xantal-green": "/images/shop/greens/phi-xantal-green.png",
  "podocarpus-green": "/images/shop/greens/podocarpus-green.png",
  "raphis-palm-green": "/images/shop/greens/raphis-palm-green.png",
  "schefflera-tip-green": "/images/shop/greens/schefflera-tip-green.png",
  "silver-dollar-green": "/images/shop/greens/silver-dollar-green.jpg",
  // Color/variety aliases for greens with no dedicated image
  "variegated-green": "/images/shop/greens/pandanus-variegated-green.jpg",
  "tree-fern-assorted": "/images/shop/greens/lettuce-fern-green.jpg",   // fern family
  "lemon-green": "/images/shop/greens/croton-tip-lemon-drop-green.png", // lemon in name
  "white-green": "/images/shop/greens/dieffenbachia-white.jpg",         // white-variegated green
  "green-green": "/images/shop/greens/monstera-green.jpg",              // generic green
  "willow-green": "/images/shop/greens/eucalyptus-silver-dollar-green.jpg", // closest stems
  "other-greens-willow-green": "/images/shop/greens/eucalyptus-silver-dollar-green.jpg",

  // ── Tropicals (8) ──
  "gingers-nicole-pink": "/images/shop/tropicals/gingers-nicole-pink.png",
  "gingers-plus-red": "/images/shop/tropicals/gingers-plus-red.png",
  "gingers-torch-red-pink": "/images/shop/tropicals/gingers-torch-red-pink.png",
  "hel-fire-opal-red": "/images/shop/tropicals/hel-fire-opal-red.png",
  "hel-sassy-red": "/images/shop/tropicals/hel-sassy-red.png",
  "iris-red": "/images/shop/tropicals/iris-red.png",
  "rostrata-red": "/images/shop/tropicals/rostrata-red.png",
  "fingers-green": "/images/shop/tropicals/fingers-green.jpg",
  // Anthurium — after variety merge to "Anthurium", need direct color keys
  "anthurium-red": "/images/shop/tropicals/anthurium-large-10-12cm-red.png",
  "anthurium-assorted": "/images/shop/tropicals/anthurium-assorted.png",
  "anthurium-green": "/images/shop/tropicals/anthurium-green.png",
  // Coccinea + other tropicals
  "coccinea-red": "/images/shop/tropicals/musa-coccinea-red.png",
  "musa-mix-red": "/images/shop/tropicals/musa-coccinea-red.png",  // Musa Mix → coccinea (closest red musa)
  "anana-lucidus-red": "/images/shop/tropicals/novelties-anana-torch-red.jpg", // Anana family
  "small-tropical-green": "/images/shop/tropicals/eucalyptus-doll-green.jpg",  // small green tropical
  "golden-fire-opal-red": "/images/shop/tropicals/heliconia-golden-fire-opal-red.png",
  "banana-fingers-green": "/images/shop/tropicals/novelty-tropicals-banana-fingers-green.png",
  "banana-fingers-green-15": "/images/shop/tropicals/novelty-tropicals-banana-fingers-green.png",
  "eucalyptus-doll-green": "/images/shop/tropicals/eucalyptus-doll-green.jpg",
  "eucalyptus-fresh-doll-cluster-green": "/images/shop/tropicals/eucalyptus-doll-green.jpg",
  // Million Star — same plant as Cosmic, use cosmic image
  "million-star-white": "/images/shop/other/cosmic.png",
  "million-star-250g-white": "/images/shop/other/cosmic.png",
  "million-star-white-250g": "/images/shop/other/cosmic.png",
  "million-star-white-750g": "/images/shop/other/cosmic.png",

  // ── Other flowers (gypsophila, bells, scabiosa, craspedia, lavender, thistle) ──
  "bells-of-ireland": "/images/shop/other/bells-of-ireland.png",
  "blue-lagoon": "/images/shop/other/blue-lagoon.png",
  "cosmic": "/images/shop/other/cosmic.png",
  "gyposphilia-purple": "/images/shop/other/gyposphilia-purple.png",
  "jumbo-yellow": "/images/shop/other/jumbo-yellow.jpg",
  "lavender": "/images/shop/other/lavender.png",
  "light-rainbow": "/images/shop/other/light-rainbow.png",
  "light-yellow": "/images/shop/other/light-yellow.png",
  "pink-carmine": "/images/shop/other/pink-carmine.png",
  "quis-purple": "/images/shop/other/quis-purple.png",
  "quis-white": "/images/shop/other/quis-white.png",
  "scabiosa-french-vanilla": "/images/shop/other/scabiosa-french-vanilla.png",
  "scabiosa-merlet-bon-bon": "/images/shop/other/scabiosa-merlet-bon-bon.png",
  "scabiosa-popsicle-focal": "/images/shop/other/scabiosa-popsicle-focal.png",
  "scabiosa-purple-lace": "/images/shop/other/scabiosa-purple-lace.png",
  "scabiosa-ube-bon-bon": "/images/shop/other/scabiosa-ube-bon-bon.png",
  "scabiosa-white-improved": "/images/shop/other/scabiosa-white-improved.png",
  "tinted-apple-green": "/images/shop/other/tinted-apple-green.png",
  "tinted-hot-pink": "/images/shop/other/tinted-hot-pink.png",
  "tinted-light-blue": "/images/shop/other/tinted-light-blue.png",
  "tinted-light-pink": "/images/shop/other/tinted-light-pink.png",
  "tinted-mocca": "/images/shop/other/tinted-mocca.png",
  "tinted-peach": "/images/shop/other/tinted-peach.png",
  "tinted-viva-magenta": "/images/shop/other/tinted-viva-magenta.png",
  "xlence-white": "/images/shop/other/xlence-white.png",

  // ── Novelties ──
  "anana-torch-red": "/images/shop/novelties/anana-torch-red.jpg",
  "french-kiss-red": "/images/shop/novelties/french-kiss-red.png",
  "tropical-xlarge-red": "/images/shop/novelties/tropical-xlarge-red.jpg",

  // ── AI Bouquets ──
  "bouquet-aforest": "/images/shop/bouquets/bouquet-aforest_11a115f409c6.png",
  "bouquet-amazon": "/images/shop/bouquets/bouquet-amazon_d6eaa8149f7d.png",
  "bouquet-aria": "/images/shop/bouquets/bouquet-aria_cb9620575382.png",
  "bouquet-brushed": "/images/shop/bouquets/bouquet-brushed_c856915749c4.png",
  "bouquet-confeti": "/images/shop/bouquets/bouquet-confeti_760de8d7c852.png",
  "bouquet-confeti-orange": "/images/shop/bouquets/bouquet-confeti-orange_6e88e4f0b729.png",
  "bouquet-confeti-orange-plus": "/images/shop/bouquets/bouquet-confeti-orange-plus_a79270452f09.png",
  "bouquet-emerald": "/images/shop/bouquets/bouquet-emerald_ed73b462cc12.png",
  "bouquet-forest": "/images/shop/bouquets/bouquet-forest_ead5b4568c54.png",
  "bouquet-fuego": "/images/shop/bouquets/bouquet-fuego_0e3ecb9096b7.png",
  "bouquet-fuego-plus": "/images/shop/bouquets/bouquet-fuego-plus_f7d240d38d54.png",
  "bouquet-hanna-assorted": "/images/shop/bouquets/bouquet-hanna-assorted_eb134874f9be.png",
  "bouquet-harmony": "/images/shop/bouquets/bouquet-harmony_659f39363700.png",
  "bouquet-jade": "/images/shop/bouquets/bouquet-jade_84aacf94aaa2.png",
  "bouquet-jungle-plus": "/images/shop/bouquets/bouquet-jungle-plus_306b20dd08c4.png",
  "bouquet-lolipop-plus": "/images/shop/bouquets/bouquet-lolipop-plus_26e57c72e835.png",
  "bouquet-lua-banana-pink-plus": "/images/shop/bouquets/bouquet-lua-banana-pink-plus_d956c287351b.png",
  "bouquet-paradise": "/images/shop/bouquets/bouquet-paradise_346875b6f089.png",
  "bouquet-rainbow": "/images/shop/bouquets/bouquet-rainbow_be2ae9aa066b.png",

  // ── AI Combos / Mixed Boxes ──
  "combo-capricho-box": "/images/shop/combos/combo-capricho-box_91bfc5ee3b0b.png",
  "combo-escarlata-box": "/images/shop/combos/combo-escarlata-box_5083951b104e.png",
  "combo-fiesta-box": "/images/shop/combos/combo-fiesta-box_e75c56fcc271.png",
  "combo-fire-box": "/images/shop/combos/combo-fire-box_00b25b3572aa.png",
  "combo-ginger-mix-box": "/images/shop/combos/combo-ginger-mix-box_b9b2c8a76d3c.png",
  "green-amazon-foliage": "/images/shop/combos/green-amazon-foliage_f706655ed6ee.png",
  "green-botanical": "/images/shop/combos/green-botanical_6ecc45f21231.png",
  "green-greenery-foliage": "/images/shop/combos/green-greenery-foliage_fc1b977e8868.png",
  "green-jungle-foliage": "/images/shop/combos/green-jungle-foliage_39f23e1d3d61.png",
  "roses-assorted-cool-tones": "/images/shop/combos/roses-assorted-cool-tones_e117be2c3319.png",
  "roses-assorted-creams": "/images/shop/combos/roses-assorted-creams_a9067a47cbe2.png",
  "assorted-cream": "/images/shop/combos/roses-assorted-creams_a9067a47cbe2.png",
  "roses-assorted-garden": "/images/shop/combos/roses-assorted-garden_d9a79f6f891c.png",
  "roses-assorted-neutrals": "/images/shop/combos/roses-assorted-neutrals_aae4c1ef1b96.png",
  "roses-assorted-pinks": "/images/shop/combos/roses-assorted-pinks_e4640517921b.png",
  "roses-assorted-rainbow": "/images/shop/combos/roses-assorted-rainbow_3f985d44682c.png",
  "assorted-rainbow": "/images/shop/combos/roses-assorted-rainbow_3f985d44682c.png",
  "roses-assorted-reds": "/images/shop/combos/roses-assorted-reds_28e50b75acfe.png",
  "roses-assorted-whites": "/images/shop/combos/roses-assorted-whites_edb0ab505fd1.png",
  "assorted-white": "/images/shop/combos/roses-assorted-whites_edb0ab505fd1.png",

  // ── CDN eShop images — added 2026-03-12 by Alvar_Ops / Job_PM ──
  // ANEMONE
  "fullstar-fuchsia": "/images/shop/anemone/fullstar-fuchsia.png",
  "fullstar-red": "/images/shop/anemone/fullstar-red.png",
  "mariane-assorted": "/images/shop/anemone/mariane-assorted.jpg",
  "mariane-blue": "/images/shop/anemone/mariane-blue.png",
  "mariane-blue-v2": "/images/shop/anemone/mariane-blue-v2.png",
  "mariane-fuchsia": "/images/shop/anemone/mariane-fuchsia.png",
  "mariane-pink": "/images/shop/anemone/mariane-pink.png",
  "mariane-red": "/images/shop/anemone/mariane-red.png",
  // COMBOS
  "variety-mixes-ginger-mix-assorted": "/images/shop/combos/variety-mixes-ginger-mix-assorted.png",
  // DELPHINIUM
  "blue-bird-blue-v2": "/images/shop/delphinium/blue-bird-blue-v2.png",
  "blue-pacific-summer-skies-light-blue": "/images/shop/delphinium/blue-pacific-summer-skies-light-blue.jpg",
  "blue-pacific-summer-skies-light-blue-v2": "/images/shop/delphinium/blue-pacific-summer-skies-light-blue-v2.jpg",
  "blue-sea-waltz-dark-blue": "/images/shop/delphinium/blue-sea-waltz-dark-blue.png",
  "blue-sky-waltz-light-blue": "/images/shop/delphinium/blue-sky-waltz-light-blue.png",
  "blue-sky-waltz-light-blue-v2": "/images/shop/delphinium/blue-sky-waltz-light-blue-v2.png",
  // GREENS
  "eucalyptus-silver-dollar-green": "/images/shop/greens/eucalyptus-silver-dollar-green.png",
  // OTHER
  "focal-scoop-white": "/images/shop/other/focal-scoop-white.jpg",
  "larkspur-white": "/images/shop/other/larkspur-white.png",
  "magical-lagoon-blue": "/images/shop/other/magical-lagoon-blue.png",
  "magical-lagoon-blue-v2": "/images/shop/other/magical-lagoon-blue-v2.png",
  // RANUNCULUS
  "amandine-assorted": "/images/shop/ranunculus/amandine-assorted.jpg",
  "amandine-brown": "/images/shop/ranunculus/amandine-brown.png",
  "amandine-cream": "/images/shop/ranunculus/amandine-cream.png",
  "amandine-orange": "/images/shop/ranunculus/amandine-orange.png",
  "amandine-salmon": "/images/shop/ranunculus/amandine-salmon.png",
  "pink-amandine-hot-pink": "/images/shop/ranunculus/pink-amandine-hot-pink.jpg",
  // ROSES
  "mandarin-x-pression-coral": "/images/shop/roses/mandarin-x-pression-coral.png",
  "pink-full-monty-hot-pink": "/images/shop/roses/pink-full-monty-hot-pink.png",
  "pink-hot-explorer-hot-pink": "/images/shop/roses/pink-hot-explorer-hot-pink.png",
  "silantoi-bicolor": "/images/shop/roses/silantoi-bicolor.png",
  "sweet-escimo-pink": "/images/shop/roses/sweet-escimo-pink.png",
  "tibet-white": "/images/shop/roses/tibet-white.png",
  // TROPICALS
  "anthurium-large-10-12cm-red": "/images/shop/tropicals/anthurium-large-10-12cm-red.png",
  "anthurium-xlarge-12-14cm-red": "/images/shop/tropicals/anthurium-xlarge-12-14cm-red.png",
  "ginger-nicole-pink": "/images/shop/tropicals/ginger-nicole-pink.png",
  "ginger-plus-red": "/images/shop/tropicals/ginger-plus-red.png",
  "ginger-torch-red": "/images/shop/tropicals/ginger-torch-red.png",
  "heliconia-golden-fire-opal-red": "/images/shop/tropicals/heliconia-golden-fire-opal-red.png",
  "heliconia-iris-red": "/images/shop/tropicals/heliconia-iris-red.png",
  "heliconia-rostrata-red": "/images/shop/tropicals/heliconia-rostrata-red.png",
  "heliconia-sassy-red": "/images/shop/tropicals/heliconia-sassy-red.png",
  "novelty-tropicals-banana-fingers-green": "/images/shop/tropicals/novelty-tropicals-banana-fingers-green.png",

  // ── Cande batch 2026-03-23 — aliases + new keys ──
  // Anemone with "anemone-" prefix
  "anemone-full-star-blue": "/images/shop/anemone/anemone-full-star-blue.jpg",
  "anemone-full-star-red": "/images/shop/anemone/anemone-full-star-red.png",
  "anemone-full-star-white": "/images/shop/anemone/anemone-full-star-white.png",
  "anemone-mistral-burgundy": "/images/shop/anemone/anemone-mistral-burgundy.png",
  "anemone-mistral-pink": "/images/shop/anemone/anemone-mistral-pink.png",
  // Delphinium with "delphinium-" prefix
  "delphinium-bella-andes-white": "/images/shop/delphinium/delphinium-bella-andes-white.png",
  "delphinium-blue-bird": "/images/shop/delphinium/delphinium-blue-bird.png",
  "delphinium-galahad-white": "/images/shop/delphinium/delphinium-galahad-white.png",
  "delphinium-sea-waltz-dark-blue": "/images/shop/delphinium/delphinium-sea-waltz-dark-blue.png",
  "delphinium-sky-waltz-light-blue": "/images/shop/delphinium/delphinium-sky-waltz-light-blue.png",
  "delphinium-summer-skies": "/images/shop/delphinium/delphinium-summer-skies.png",
  // Larkspur with "larkspur-" prefix
  "larkspur-pink-carmine": "/images/shop/delphinium/larkspur-pink-carmine.png",
  "larkspur-quis-purple": "/images/shop/delphinium/larkspur-quis-purple.png",
  "larkspur-quis-white": "/images/shop/delphinium/larkspur-quis-white.png",
  // Greens
  "phi-pinnatifidum-green": "/images/shop/greens/phi-pinnatifidum-green.jpg",
  // Other flowers
  "bells-of-ireland-green": "/images/shop/other/bells-of-ireland-green.png",
  "bouquet-combo-capricho-box_v1": "/images/shop/other/bouquet-combo-capricho-box_v1.png",
  "bouquet-combo-escarlata-box_v1": "/images/shop/other/bouquet-combo-escarlata-box_v1.png",
  "bouquet-combo-fire-box_v1": "/images/shop/other/bouquet-combo-fire-box_v1.png",
  "bouquet-combo-heliconia-mix-box_v1": "/images/shop/other/bouquet-combo-heliconia-mix-box_v1.png",
  "bouquet-combo-mini-fiesta-box_v1": "/images/shop/other/bouquet-combo-mini-fiesta-box_v1.png",
  "bouquet-combo-mini-tabasco-box_v1": "/images/shop/other/bouquet-combo-mini-tabasco-box_v1.png",
  "bouquet-combo-tabasco-box_v1": "/images/shop/other/bouquet-combo-tabasco-box_v1.png",
  "bouquet-combo-tiki-limbo-box_v1": "/images/shop/other/bouquet-combo-tiki-limbo-box_v1.png",
  "bouquet-flat-hanna-assorted_v1": "/images/shop/other/bouquet-flat-hanna-assorted_v1.png",
  "bouquet-green-aforest_v1": "/images/shop/other/bouquet-green-aforest_v1.png",
  "bouquet-green-assorted-amazon-foliage_v1": "/images/shop/other/bouquet-green-assorted-amazon-foliage_v1.png",
  "bouquet-green-assorted-botanical_v1": "/images/shop/other/bouquet-green-assorted-botanical_v1.png",
  "bouquet-green-assorted-greenery-foliage_v1": "/images/shop/other/bouquet-green-assorted-greenery-foliage_v1.png",
  "bouquet-green-assorted-jungle-foliage_v1": "/images/shop/other/bouquet-green-assorted-jungle-foliage_v1.png",
  "bouquet-green-bunch-emerald_v1": "/images/shop/other/bouquet-green-bunch-emerald_v1.png",
  "craspedias-jumbo-yellow": "/images/shop/other/craspedias-jumbo-yellow.jpg",
  "gypsophilia-cosmic": "/images/shop/other/gypsophilia-cosmic.png",
  "gypsophilia-lavender": "/images/shop/other/gypsophilia-lavender.png",
  "gypsophilia-light-rainbow": "/images/shop/other/gypsophilia-light-rainbow.png",
  "gypsophilia-light-yellow": "/images/shop/other/gypsophilia-light-yellow.png",
  "gypsophilia-tinted-apple-green": "/images/shop/other/gypsophilia-tinted-apple-green.png",
  "gypsophilia-tinted-hot-pink": "/images/shop/other/gypsophilia-tinted-hot-pink.png",
  "gypsophilia-tinted-light-blue": "/images/shop/other/gypsophilia-tinted-light-blue.png",
  "gypsophilia-tinted-light-pink": "/images/shop/other/gypsophilia-tinted-light-pink.png",
  "gypsophilia-tinted-mocca": "/images/shop/other/gypsophilia-tinted-mocca.jpg",
  "gypsophilia-tinted-peach": "/images/shop/other/gypsophilia-tinted-peach.png",
  "gypsophilia-tinted-viva-magenta": "/images/shop/other/gypsophilia-tinted-viva-magenta.png",
  "gypsophilia-xlence-white": "/images/shop/other/gypsophilia-xlence-white.png",
  "thistle-magical-lagoon-blue": "/images/shop/other/thistle-magical-lagoon-blue.jpg",
  // Tropicals with "heliconias-" prefix and other variants
  "anthuriums-tropical-xlarge-red": "/images/shop/tropicals/anthuriums-tropical-xlarge-red.jpg",
  "heliconias-hel.-fire-opal-red": "/images/shop/tropicals/heliconias-hel.-fire-opal-red.png",
  "heliconias-hel.-sassy-red": "/images/shop/tropicals/heliconias-hel.-sassy-red.png",
  "heliconias-iris-red": "/images/shop/tropicals/heliconias-iris-red.png",
  "heliconias-rostrata-red": "/images/shop/tropicals/heliconias-rostrata-red.png",
  "novelties-anana-torch-red": "/images/shop/tropicals/novelties-anana-torch-red.jpg",
};

// ━━━ CATEGORY FALLBACKS ━━━
const CATEGORY_IMAGE_MAP: Record<string, string> = {
  Rose: "/images/shop/roses/freedom-red.png",
  Anemone: "/images/shop/anemone/anemones-red.png",
  Ranunculus: "/images/shop/ranunculus/hot-pink.png",
  Delphinium: "/images/shop/delphinium/sky-waltz-light-blue.png",
  Tropicals: "/images/shop/tropicals/hel-fire-opal-red.png",
  "Greens & Foliage": "/images/shop/greens/monstera-green.jpg",
  Greens: "/images/shop/greens/monstera-green.jpg",
  Bouquets: "/images/shop/bouquets/bouquet-harmony_659f39363700.png",
  "Mixed Boxes": "/images/shop/combos/combo-fiesta-box_e75c56fcc271.png",
  Gypsophila: "/images/shop/other/cosmic.png",
  Scabiosa: "/images/shop/other/scabiosa-white-improved.png",
  Thistle: "/images/shop/other/blue-lagoon.png",
  "Bells of Ireland": "/images/shop/other/bells-of-ireland.png",
  Craspedia: "/images/shop/other/jumbo-yellow.jpg",
  Larkspur: "/images/shop/delphinium/astolat.png",
  "Heliconia Hanging": "/images/shop/tropicals/rostrata-red.png",
  "Heliconia up-right": "/images/shop/tropicals/iris-red.png",
  Anthurium: "/images/shop/tropicals/tropical-xlarge-red.jpg",
  Heliconia: "/images/shop/tropicals/hel-fire-opal-red.png",
};

const FALLBACK_IMAGE = "/Floropolis-logo-only.png";

/** Map product category to image folder name for scoped prefix matching. */
function categoryToImageFolder(category: string): string | null {
  const map: Record<string, string> = {
    Rose: "roses",
    Anemone: "anemone",
    Ranunculus: "ranunculus",
    Delphinium: "delphinium",
    "Greens & Foliage": "greens",
    Tropicals: "tropicals",
    Bouquets: "bouquets",
    "Mixed Boxes": "combos",
    Gypsophila: "other",
    Scabiosa: "other",
    "Bells of Ireland": "other",
    Craspedia: "other",
    Thistle: "other",
    Larkspur: "delphinium",
    "Heliconia Hanging": "tropicals",
    "Heliconia up-right": "tropicals",
  };
  return map[category] || null;
}

/**
 * Normalize a string to a lookup key: lowercase, spaces → dashes, strip special chars.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/['']/g, "'")
    .trim();
}

/**
 * Build all candidate lookup keys from variety + color.
 * Tries multiple name normalization strategies to maximize matches.
 */
function getCandidateKeys(variety: string, color: string): string[] {
  const v = normalize(variety);
  const c = normalize(color);
  const keys: string[] = [];

  // 1. Direct: variety-color
  keys.push(`${v}-${c}`);

  // 2. For roses: Komet files include descriptive color (e.g., "freedom-red", "mondial-white")
  //    Product data might have just "Freedom" + "Red" → already covered above

  // 3. Variety only (for delphiniums like "Bella Andes" → "bella-andes-white")
  keys.push(v);

  // 4. Strip "& Foliage" prefix from greens
  if (v.startsWith("&-foliage-")) {
    const stripped = v.replace("&-foliage-", "");
    keys.push(`${stripped}-${c}`);
    keys.push(stripped);
  }

  // 5. For philodendrons: "Philodendron Congo" → "phi-congo-green"
  if (v.startsWith("philodendron-")) {
    keys.push(`phi-${v.replace("philodendron-", "")}-${c}`);
  }

  // 6. For greens with "Palm" prefix: "Palm Areca Medium" → "areca-palm-green"
  if (v.startsWith("palm-")) {
    const palmType = v.replace(/^palm-/, "").replace(/-?(small|medium|large)$/, "");
    keys.push(`${palmType}-palm-${c}`);
  }

  // 7. For Eucalyptus: "Eucalyptus Silver Dollar" → "silver-dollar-green"
  if (v.startsWith("eucalyptus-")) {
    keys.push(`${v.replace("eucalyptus-", "")}-${c}`);
  }

  // 8. For Ginger: "Ginger Nicole" → "gingers-nicole-pink"
  if (v.startsWith("ginger-")) {
    keys.push(`gingers-${v.replace("ginger-", "")}-${c}`);
  }

  // 9. For Heliconia: "Heliconia Golden Fire Opal" → "hel-fire-opal-red"
  if (v.startsWith("heliconia-")) {
    const helName = v.replace("heliconia-", "").replace("golden-", "");
    keys.push(`hel-${helName}-${c}`);
    keys.push(`${v.replace("heliconia-", "")}-${c}`);
  }

  // 10. For Musa Coccinea: → "musa-leaf-green" (closest match)
  if (v.startsWith("musa-")) {
    keys.push(`musa-leaf-${c}`);
  }

  // 11. For Fern varieties: "Fern Davalia" → could match "doll-green" etc.
  if (v.startsWith("fern-")) {
    keys.push(`${v.replace("fern-", "")}-${c}`);
  }

  // 12. Tips & Accents: "Tips & Accents Aglaonema" → "anglonema-tip-green"
  if (v.includes("tips-&-accents-")) {
    const tipName = v.replace(/tips-&-accents-/, "");
    keys.push(`${tipName}-tip-${c}`);
    keys.push(`${tipName}-${c}`);
  }

  // 13. For anemones: "Mariane" variety → generic color "anemones-{color}"
  //     "Mistral" → "mistral-{color}"
  //     "FullStar" → "full-star-{color}"
  if (v === "fullstar" || v === "full-star") {
    keys.push(`full-star-${c}`);
  }
  if (v === "mariane" || v === "mistral" || v.startsWith("full-star") || v.startsWith("fullstar")) {
    // Map anemone colors to file names
    const anemoneColorMap: Record<string, string> = {
      blue: "blue", red: "red", white: "white", pink: "pink",
      fuchsia: "fucsia", burgundy: "burdeaux", "hot-pink": "fucsia",
      assorted: "red", // fallback for assorted
    };
    const mappedColor = anemoneColorMap[c] || c;
    if (v === "mariane") keys.push(`anemones-${mappedColor}`);
    if (v === "mistral") keys.push(`mistral-${mappedColor}`);
  }

  // 14. Gypsophila tinted: "Tinted" + color → "tinted-{color}"
  // DB colors don't always match file names — map known variants
  if (v === "tinted") {
    keys.push(`tinted-${c}`);
    const tintedColorMap: Record<string, string> = {
      blue: "tinted-light-blue",
      brown: "tinted-mocca",
      green: "tinted-apple-green",
      pink: "tinted-light-pink",
      red: "tinted-viva-magenta",
    
    };
    if (tintedColorMap[c]) keys.push(tintedColorMap[c]);
  }

  // 15. Scabiosa: "Focal Scoop" → "scabiosa-popsicle-focal" etc.
  // 16. Xlence: → "xlence-white"
  if (v === "xlence") {
    keys.push(`xlence-${c}`);
  }

  // 17. Bouquet matching: "Round - Medium Confeti" → "bouquet-confeti"
  if (v.includes("confeti")) keys.push("bouquet-confeti");
  if (v.includes("fuego")) keys.push("bouquet-fuego");
  if (v.includes("amazon")) keys.push("bouquet-amazon");
  if (v.includes("brushed")) keys.push("bouquet-brushed");
  if (v.includes("parrot")) keys.push("bouquet-aria");
  if (v.includes("hanna")) keys.push("bouquet-hanna-assorted");
  if (v.includes("harmony")) keys.push("bouquet-harmony");
  if (v.includes("rainbow")) keys.push("bouquet-rainbow");
  if (v.includes("jungle")) keys.push("bouquet-jungle-plus");
  if (v.includes("emerald")) keys.push("bouquet-emerald");
  if (v.includes("forest")) keys.push("bouquet-forest");
  if (v.includes("paradise")) keys.push("bouquet-paradise");
  if (v.includes("jade")) keys.push("bouquet-jade");
  if (v.includes("aforest") || v.includes("afforest")) keys.push("bouquet-aforest");

  // 18. Combo boxes: "Combo Box Fiesta" → "combo-fiesta-box"
  if (v.includes("combo-box-fiesta") || (v.includes("fiesta") && !v.includes("spirit"))) keys.push("combo-fiesta-box");
  if (v.includes("combo-box-fire") || (v.includes("fire") && v.includes("combo"))) keys.push("combo-fire-box");
  if (v.includes("combo-box-capricho") || v.includes("capricho")) keys.push("combo-capricho-box");
  if (v.includes("escarlata")) keys.push("combo-escarlata-box");
  if (v.includes("iniziativa") || v.includes("tabasco")) keys.push("combo-fire-box");

  // 19. Foliage combo boxes
  if (v.includes("foliage-amazon")) keys.push("green-amazon-foliage");
  if (v.includes("foliage-botanical")) keys.push("green-botanical");
  if (v.includes("foliage-greenery")) keys.push("green-greenery-foliage");
  if (v.includes("foliage-jungle")) keys.push("green-jungle-foliage");

  // 20. Ranunculus with just color name — maps variety+color → ranunculus-{color}
  // Covers all known Ranunculus varieties: Amandine, Elegance, Bon Bon, Focal Scoop
  const RANUNCULUS_VARIETIES = ["ranunculus", "amandine", "elegance", "bon-bon", "focal-scoop", "scoop"];
  if (RANUNCULUS_VARIETIES.some((rv) => v.includes(rv) || v === rv)) {
    keys.push(`ranunculus-${c}`);
  }

  // 21. For "Sweet Escimo" → "escimo-pure-white"
  if (v.includes("escimo")) keys.push("escimo-pure-white");

  // 22. Pandanus variations
  if (v === "pandanus" || v.includes("pandanus")) {
    if (c.includes("variegated") || v.includes("variegated")) keys.push("pandanus-variegated-green");
    keys.push("pandanus-green-green");
  }

  // 23. Philodendron Pinnatifidum → use phi-esmeralda as closest
  if (v.includes("pinnatifidum")) keys.push("phi-esmeralda-green");

  // 24. Boxes Foliage/Variety Mixes
  if (v.includes("foliage-mixes-botanical") || v.includes("botanical")) keys.push("green-botanical");
  if (v.includes("foliage-mixes-greenery") || v.includes("greenery")) keys.push("green-greenery-foliage");
  if (v.includes("ginger-mix")) keys.push("combo-ginger-mix-box");

  return keys;
}

/**
 * Get the best available image for a product.
 * Priority: exact match → variety prefix → category fallback → logo.
 */
export function getProductImage(
  variety: string,
  color: string,
  category: string,
): string {
  const keys = getCandidateKeys(variety, color);

  // Try exact match from candidate keys
  for (const key of keys) {
    if (IMAGE_MAP[key]) return IMAGE_MAP[key];
  }

  // Try fuzzy match within same category folder
  const normalizedVariety = normalize(variety);
  const normalizedColor = normalize(color);
  const catFolder = categoryToImageFolder(category);

  if (catFolder) {
    const catEntries = Object.entries(IMAGE_MAP).filter(([, p]) => p.includes(`/${catFolder}/`));

    // Strategy 1: map key starts with variety name (e.g., "arya" matches "arya-soft-lavender")
    if (normalizedVariety.length >= 4) {
      for (const [mapKey, mapPath] of catEntries) {
        if (mapKey.startsWith(normalizedVariety)) return mapPath;
      }
    }

    // Strategy 2: variety name starts with map key (short map keys like "cosmic")
    if (normalizedVariety.length >= 4) {
      for (const [mapKey, mapPath] of catEntries) {
        if (mapKey.length >= 4 && normalizedVariety.startsWith(mapKey)) return mapPath;
      }
    }

    // Strategy 3: map key contains the variety name
    if (normalizedVariety.length >= 5) {
      for (const [mapKey, mapPath] of catEntries) {
        if (mapKey.includes(normalizedVariety)) return mapPath;
      }
    }
  }

  // Category fallback
  if (CATEGORY_IMAGE_MAP[category]) return CATEGORY_IMAGE_MAP[category];

  return FALLBACK_IMAGE;
}
