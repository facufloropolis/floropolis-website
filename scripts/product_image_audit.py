"""
Product Image Audit — floropolis.com
Outputs a CSV with every product, its resolved image, image type,
how many products share the same image, and merge candidates.

Run: python3 scripts/product_image_audit.py
Output: scripts/product_image_audit.csv
"""

import re
import json
import csv
import os
from collections import defaultdict

# ─────────────────────────────────────────────
# 1. Parse floropolis_products.ts → list of dicts
# ─────────────────────────────────────────────

TS_FILE = os.path.join(os.path.dirname(__file__), "../lib/data/floropolis_products.ts")
OUT_CSV  = os.path.join(os.path.dirname(__file__), "product_image_audit.csv")
BASE_URL = "https://floropolis.com"

def parse_products_ts(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()
    # Extract the array literal between `export const products: Product[] = [` and the final `];`
    m = re.search(r"export const products: Product\[\] = (\[.*?\]);", content, re.DOTALL)
    if not m:
        raise ValueError("Could not find products array in TS file")
    raw = m.group(1)
    # Strip TS-specific syntax: trailing commas before } or ], then parse as JSON
    # Remove single-line comments — but NOT inside strings (avoid eating https:// URLs)
    # Match // only when preceded by whitespace/comma/colon (not inside a string value)
    raw = re.sub(r'(?<!["\w:/])//[^\n]*', "", raw)
    # Remove trailing commas before closing bracket/brace
    raw = re.sub(r",\s*([\]}])", r"\1", raw)
    return json.loads(raw)

products = parse_products_ts(TS_FILE)
print(f"Loaded {len(products)} products")

# ─────────────────────────────────────────────
# 2. Image resolution logic (mirrors product-images.ts)
# ─────────────────────────────────────────────

IMAGE_MAP = {
    # Anemone
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
    "fullstar-fuchsia": "/images/shop/anemone/fullstar-fuchsia.png",
    "fullstar-red": "/images/shop/anemone/fullstar-red.png",
    "mariane-assorted": "/images/shop/anemone/mariane-assorted.jpg",
    "mariane-blue": "/images/shop/anemone/mariane-blue.png",
    "mariane-blue-v2": "/images/shop/anemone/mariane-blue-v2.png",
    "mariane-fuchsia": "/images/shop/anemone/mariane-fuchsia.png",
    "mariane-pink": "/images/shop/anemone/mariane-pink.png",
    "mariane-red": "/images/shop/anemone/mariane-red.png",
    # Roses (subset — same keys as TS file)
    "absolut-in-pink-pink": "/images/shop/roses/absolut-in-pink-pink.png",
    "aloha-orange": "/images/shop/roses/aloha-orange.png",
    "altamira-cherry-red": "/images/shop/roses/altamira-cherry-red.png",
    "amsterdam-coral-pink": "/images/shop/roses/amsterdam-coral-pink.png",
    "antonia-garden-cream": "/images/shop/roses/antonia-garden-cream.png",
    "apple-jack-red-creamy-green": "/images/shop/roses/apple-jack-red-creamy-green.png",
    "arya-soft-lavender": "/images/shop/roses/arya-soft-lavender.png",
    "atomic-yellow-red": "/images/shop/roses/atomic-yellow-red.png",
    "barista-mauve": "/images/shop/roses/barista-mauve.png",
    "be-sweet-light-pink": "/images/shop/roses/be-sweet-light-pink.png",
    "black-baccara-very-dark-velvet-red": "/images/shop/roses/black-baccara-very-dark-velvet-red.png",
    "blueberry-dark-lavender": "/images/shop/roses/blueberry-dark-lavender.png",
    "boulevard-white-light-pink": "/images/shop/roses/boulevard-white-light-pink.png",
    "brighton-bright-yellow": "/images/shop/roses/brighton-bright-yellow.png",
    "cancun-light-yellow": "/images/shop/roses/cancun-light-yellow.png",
    "candlelight-cream": "/images/shop/roses/candlelight-cream.png",
    "carpe-diem-light-peach-red-outer": "/images/shop/roses/carpe-diem-light-peach-red-outer.png",
    "cavendish-bright-peach": "/images/shop/roses/cavendish-bright-peach.png",
    "cayenne-orange": "/images/shop/roses/cayenne-orange.png",
    "champagner-sandy-cream": "/images/shop/roses/champagner-sandy-cream.png",
    "cherry-mist-cherry-wine": "/images/shop/roses/cherry-mist-cherry-wine.png",
    "coldplay-white": "/images/shop/roses/coldplay-white.png",
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
    "mandarin-x-pression-coral": "/images/shop/roses/mandarin-x-pression-coral.png",
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
    "silantoi-bicolor": "/images/shop/roses/silantoi-bicolor.png",
    "summerlight-bicolor-yellow-red": "/images/shop/roses/summerlight-bicolor-yellow-red.png",
    "sunmaster-bright-yellow": "/images/shop/roses/sunmaster-bright-yellow.png",
    "sunny-days-light-yellow-with-green-center": "/images/shop/roses/sunny-days-light-yellow-with-green-center.png",
    "sweet-cake-pink": "/images/shop/roses/sweet-cake-pink.png",
    "sweet-memory-pink": "/images/shop/roses/sweet-memory-pink.png",
    "sweet-unique-pink": "/images/shop/roses/sweet-unique-pink.png",
    "tibet-pure-white": "/images/shop/roses/tibet-pure-white.png",
    "tibet-white": "/images/shop/roses/tibet-white.png",
    "tie-dye-light-peach": "/images/shop/roses/tie-dye-light-peach.png",
    "toffee-caramel": "/images/shop/roses/toffee-caramel.png",
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
    "pink-full-monty-hot-pink": "/images/shop/roses/pink-full-monty-hot-pink.png",
    "pink-hot-explorer-hot-pink": "/images/shop/roses/pink-hot-explorer-hot-pink.png",
    "sweet-escimo-pink": "/images/shop/roses/sweet-escimo-pink.png",
    # Delphinium
    "astolat": "/images/shop/delphinium/astolat.png",
    "bella-andes-white": "/images/shop/delphinium/bella-andes-white.png",
    "blue-bird": "/images/shop/delphinium/blue-bird.png",
    "galahad-white": "/images/shop/delphinium/galahad-white.png",
    "guinevere": "/images/shop/delphinium/guinevere.jpg",
    "sea-waltz-dark-blue": "/images/shop/delphinium/sea-waltz-dark-blue.png",
    "sky-waltz-light-blue": "/images/shop/delphinium/sky-waltz-light-blue.png",
    "summer-skies": "/images/shop/delphinium/summer-skies.png",
    "blue-bird-blue-v2": "/images/shop/delphinium/blue-bird-blue-v2.png",
    "blue-pacific-summer-skies-light-blue": "/images/shop/delphinium/blue-pacific-summer-skies-light-blue.jpg",
    "blue-pacific-summer-skies-light-blue-v2": "/images/shop/delphinium/blue-pacific-summer-skies-light-blue-v2.jpg",
    "blue-sea-waltz-dark-blue": "/images/shop/delphinium/blue-sea-waltz-dark-blue.png",
    "blue-sky-waltz-light-blue": "/images/shop/delphinium/blue-sky-waltz-light-blue.png",
    "blue-sky-waltz-light-blue-v2": "/images/shop/delphinium/blue-sky-waltz-light-blue-v2.png",
    # Ranunculus
    "ranunculus-burgundy": "/images/shop/ranunculus/burgundy.png",
    "ranunculus-chocolate": "/images/shop/ranunculus/chocolate.png",
    "ranunculus-cream": "/images/shop/ranunculus/cream.png",
    "ranunculus-hot-pink": "/images/shop/ranunculus/hot-pink.png",
    "ranunculus-lilie": "/images/shop/ranunculus/lilie.png",
    "ranunculus-orange": "/images/shop/ranunculus/orange.png",
    "ranunculus-pink": "/images/shop/ranunculus/pink.png",
    "ranunculus-red": "/images/shop/ranunculus/red.png",
    "ranunculus-salmon": "/images/shop/ranunculus/salmon.png",
    "ranunculus-white": "/images/shop/ranunculus/white.png",
    "ranunculus-yellow": "/images/shop/ranunculus/yellow.png",
    "amandine-assorted": "/images/shop/ranunculus/amandine-assorted.jpg",
    "amandine-brown": "/images/shop/ranunculus/amandine-brown.png",
    "amandine-cream": "/images/shop/ranunculus/amandine-cream.png",
    "amandine-orange": "/images/shop/ranunculus/amandine-orange.png",
    "amandine-salmon": "/images/shop/ranunculus/amandine-salmon.png",
    "pink-amandine-hot-pink": "/images/shop/ranunculus/pink-amandine-hot-pink.jpg",
    # Greens
    "anglonema-tip-green": "/images/shop/greens/anglonema-tip-green.png",
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
    "phi-congo-red": "/images/shop/greens/phi-congo-red.jpg",
    "phi-esmeralda-green": "/images/shop/greens/phi-esmeralda-green.jpg",
    "phi-xanadu-green": "/images/shop/greens/phi-xanadu-green.jpg",
    "phi-xantal-green": "/images/shop/greens/phi-xantal-green.png",
    "podocarpus-green": "/images/shop/greens/podocarpus-green.png",
    "raphis-palm-green": "/images/shop/greens/raphis-palm-green.png",
    "schefflera-tip-green": "/images/shop/greens/schefflera-tip-green.png",
    "silver-dollar-green": "/images/shop/greens/silver-dollar-green.jpg",
    "eucalyptus-silver-dollar-green": "/images/shop/greens/eucalyptus-silver-dollar-green.png",
    # Tropicals
    "gingers-nicole-pink": "/images/shop/tropicals/gingers-nicole-pink.png",
    "gingers-plus-red": "/images/shop/tropicals/gingers-plus-red.png",
    "gingers-torch-red-pink": "/images/shop/tropicals/gingers-torch-red-pink.png",
    "hel-fire-opal-red": "/images/shop/tropicals/hel-fire-opal-red.png",
    "hel-sassy-red": "/images/shop/tropicals/hel-sassy-red.png",
    "iris-red": "/images/shop/tropicals/iris-red.png",
    "rostrata-red": "/images/shop/tropicals/rostrata-red.png",
    "fingers-green": "/images/shop/tropicals/fingers-green.jpg",
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
    # Other
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
    "focal-scoop-white": "/images/shop/other/focal-scoop-white.jpg",
    "larkspur-white": "/images/shop/other/larkspur-white.png",
    "magical-lagoon-blue": "/images/shop/other/magical-lagoon-blue.png",
    "magical-lagoon-blue-v2": "/images/shop/other/magical-lagoon-blue-v2.png",
    # Novelties
    "anana-torch-red": "/images/shop/novelties/anana-torch-red.jpg",
    "french-kiss-red": "/images/shop/novelties/french-kiss-red.png",
    "tropical-xlarge-red": "/images/shop/novelties/tropical-xlarge-red.jpg",
    # AI Bouquets
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
    # AI Combos
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
    "roses-assorted-garden": "/images/shop/combos/roses-assorted-garden_d9a79f6f891c.png",
    "roses-assorted-neutrals": "/images/shop/combos/roses-assorted-neutrals_aae4c1ef1b96.png",
    "roses-assorted-pinks": "/images/shop/combos/roses-assorted-pinks_e4640517921b.png",
    "roses-assorted-rainbow": "/images/shop/combos/roses-assorted-rainbow_3f985d44682c.png",
    "roses-assorted-reds": "/images/shop/combos/roses-assorted-reds_28e50b75acfe.png",
    "roses-assorted-whites": "/images/shop/combos/roses-assorted-whites_edb0ab505fd1.png",
    "variety-mixes-ginger-mix-assorted": "/images/shop/combos/variety-mixes-ginger-mix-assorted.png",
}

CATEGORY_FALLBACK = {
    "Rose": "/images/shop/roses/freedom-red.png",
    "Anemone": "/images/shop/anemone/anemones-red.png",
    "Ranunculus": "/images/shop/ranunculus/hot-pink.png",
    "Delphinium": "/images/shop/delphinium/sky-waltz-light-blue.png",
    "Tropicals": "/images/shop/tropicals/hel-fire-opal-red.png",
    "Greens & Foliage": "/images/shop/greens/monstera-green.jpg",
    "Greens": "/images/shop/greens/monstera-green.jpg",
    "Bouquets": "/images/shop/bouquets/bouquet-harmony_659f39363700.png",
    "Mixed Boxes": "/images/shop/combos/combo-fiesta-box_e75c56fcc271.png",
    "Gypsophila": "/images/shop/other/cosmic.png",
    "Scabiosa": "/images/shop/other/scabiosa-white-improved.png",
    "Thistle": "/images/shop/other/blue-lagoon.png",
    "Bells of Ireland": "/images/shop/other/bells-of-ireland.png",
    "Craspedia": "/images/shop/other/jumbo-yellow.jpg",
    "Larkspur": "/images/shop/delphinium/astolat.png",
    "Heliconia Hanging": "/images/shop/tropicals/rostrata-red.png",
    "Heliconia up-right": "/images/shop/tropicals/iris-red.png",
    "Anthurium": "/images/shop/tropicals/tropical-xlarge-red.jpg",
    "Heliconia": "/images/shop/tropicals/hel-fire-opal-red.png",
}

CAT_FOLDER = {
    "Rose": "roses", "Anemone": "anemone", "Ranunculus": "ranunculus",
    "Delphinium": "delphinium", "Greens & Foliage": "greens",
    "Tropicals": "tropicals", "Bouquets": "bouquets", "Mixed Boxes": "combos",
    "Gypsophila": "other", "Scabiosa": "other", "Bells of Ireland": "other",
    "Craspedia": "other", "Thistle": "other", "Larkspur": "delphinium",
    "Heliconia Hanging": "tropicals", "Heliconia up-right": "tropicals",
}

def norm(s):
    return re.sub(r"\s+", "-", s.lower()).replace("'", "'").strip()

def get_candidate_keys(variety, color):
    v, c = norm(variety), norm(color)
    keys = [f"{v}-{c}", v]
    if v.startswith("philodendron-"):
        keys.append(f"phi-{v.replace('philodendron-','')}-{c}")
    if v.startswith("palm-"):
        pt = re.sub(r"-(small|medium|large)$", "", v.replace("palm-",""))
        keys.append(f"{pt}-palm-{c}")
    if v.startswith("eucalyptus-"):
        keys.append(f"{v.replace('eucalyptus-','')}-{c}")
    if v.startswith("ginger-"):
        keys.append(f"gingers-{v.replace('ginger-','')}-{c}")
    if v.startswith("heliconia-"):
        hn = v.replace("heliconia-","").replace("golden-","")
        keys += [f"hel-{hn}-{c}", f"{v.replace('heliconia-','')}-{c}"]
    if v.startswith("musa-"):
        keys.append(f"musa-leaf-{c}")
    if v.startswith("fern-"):
        keys.append(f"{v.replace('fern-','')}-{c}")
    if "tips-&-accents-" in v:
        tn = v.replace("tips-&-accents-","")
        keys += [f"{tn}-tip-{c}", f"{tn}-{c}"]
    if v in ("fullstar","full-star"):
        keys.append(f"full-star-{c}")
    if v in ("mariane","mistral") or v.startswith("full-star") or v.startswith("fullstar"):
        cm = {"blue":"blue","red":"red","white":"white","pink":"pink","fuchsia":"fucsia",
              "burgundy":"burdeaux","hot-pink":"fucsia","assorted":"red"}.get(c, c)
        if v == "mariane": keys.append(f"anemones-{cm}")
        if v == "mistral": keys.append(f"mistral-{cm}")
    if v == "tinted":
        keys.append(f"tinted-{c}")
    if v == "xlence":
        keys.append(f"xlence-{c}")
    for kw, bk in [("confeti","bouquet-confeti"),("fuego","bouquet-fuego"),
                   ("amazon","bouquet-amazon"),("brushed","bouquet-brushed"),
                   ("parrot","bouquet-aria"),("hanna","bouquet-hanna-assorted"),
                   ("harmony","bouquet-harmony"),("rainbow","bouquet-rainbow"),
                   ("jungle","bouquet-jungle-plus"),("emerald","bouquet-emerald"),
                   ("forest","bouquet-forest"),("paradise","bouquet-paradise"),
                   ("jade","bouquet-jade"),("aforest","bouquet-aforest"),
                   ("afforest","bouquet-aforest")]:
        if kw in v: keys.append(bk)
    for kw, bk in [("fiesta","combo-fiesta-box"),("fire","combo-fire-box"),
                   ("capricho","combo-capricho-box"),("escarlata","combo-escarlata-box"),
                   ("iniziativa","combo-fire-box"),("tabasco","combo-fire-box")]:
        if kw in v: keys.append(bk)
    for kw, bk in [("foliage-amazon","green-amazon-foliage"),("foliage-botanical","green-botanical"),
                   ("foliage-greenery","green-greenery-foliage"),("foliage-jungle","green-jungle-foliage"),
                   ("botanical","green-botanical"),("greenery","green-greenery-foliage"),
                   ("ginger-mix","combo-ginger-mix-box")]:
        if kw in v: keys.append(bk)
    ran_vars = ["ranunculus","amandine","elegance","bon-bon","focal-scoop","scoop"]
    if any(rv in v or v == rv for rv in ran_vars):
        keys.append(f"ranunculus-{c}")
    if "escimo" in v:
        keys.append("escimo-pure-white")
    if v == "pandanus" or "pandanus" in v:
        if "variegated" in c or "variegated" in v: keys.append("pandanus-variegated-green")
        keys.append("pandanus-green-green")
    if "pinnatifidum" in v:
        keys.append("phi-esmeralda-green")
    return keys

def resolve_mapper_image(variety, color, category):
    keys = get_candidate_keys(variety, color)
    for k in keys:
        if k in IMAGE_MAP:
            return IMAGE_MAP[k], "mapper_exact"
    # Fuzzy prefix match within category folder
    v_norm = norm(variety)
    cat_folder = CAT_FOLDER.get(category)
    if cat_folder and len(v_norm) >= 4:
        cat_entries = [(k, p) for k, p in IMAGE_MAP.items() if f"/{cat_folder}/" in p]
        for mk, mp in cat_entries:
            if mk.startswith(v_norm): return mp, "mapper_prefix"
        for mk, mp in cat_entries:
            if len(mk) >= 4 and v_norm.startswith(mk): return mp, "mapper_prefix"
        for mk, mp in cat_entries:
            if len(v_norm) >= 5 and mk.startswith(v_norm[:5]): return mp, "mapper_fuzzy"
    if category in CATEGORY_FALLBACK:
        return CATEGORY_FALLBACK[category], "category_fallback"
    return "/Floropolis-logo-only.png", "logo_fallback"

# ─────────────────────────────────────────────
# 3. Classify image type
# ─────────────────────────────────────────────

AI_DIRS = ("/images/shop/bouquets/", "/images/shop/combos/")
AI_NAMES = ("-ai.", "_ai.", "-ai-", "_ai_")
CDN_HOST = "d3bgzcd3kwm78d.cloudfront.net"
# These specific local files are AI-generated despite not being in bouquets/combos
AI_LOCAL_FILES = {
    "/images/shop/lavender-deep-purple-ai.png",
    "/images/shop/white-tibet-ai.png",
    "/images/shop/orange-crush-ai.png",
}
# Files we know are fuzzy-fallback matches (same image for many varieties)
CATEGORY_FALLBACK_PATHS = set(CATEGORY_FALLBACK.values())

def classify_image(path, source):
    if not path or path == "/Floropolis-logo-only.png":
        return "LOGO_FALLBACK"
    if path in AI_LOCAL_FILES:
        return "AI_GENERATED"
    if path.startswith("https://"):
        return "CDN_REAL_PHOTO"
    if any(path.startswith(d) for d in AI_DIRS):
        return "AI_GENERATED"
    if any(s in path.lower() for s in AI_NAMES):
        return "AI_GENERATED"
    if source == "category_fallback":
        return "CATEGORY_FALLBACK"
    if source == "logo_fallback":
        return "LOGO_FALLBACK"
    return "REAL_PHOTO"

# ─────────────────────────────────────────────
# 4. Build enriched product list
# ─────────────────────────────────────────────

rows = []
for p in products:
    slug = p["slug"]
    variety = p.get("variety","") or ""
    color   = p.get("color","")   or ""
    cat     = p.get("category","") or ""
    vendor  = p.get("vendor","")  or ""
    db_imgs = p.get("images",[]) or []
    has_photo = p.get("has_photo", False)

    # Resolve image: DB first, then mapper
    if db_imgs:
        raw_img = db_imgs[0]
        if raw_img.startswith("http"):
            img_path = raw_img
            img_source = "db_cdn"
        elif raw_img.startswith("/"):
            img_path = raw_img
            img_source = "db_local"
        else:
            img_path = f"/product-photos/{raw_img}"
            img_source = "db_local"
    else:
        img_path, img_source = resolve_mapper_image(variety, color, cat)

    img_type = classify_image(img_path, img_source)
    pdp = f"{BASE_URL}/shop/{slug}"
    merge_key = f"{norm(variety)}||{norm(color)}||{norm(cat)}"

    rows.append({
        "slug": slug,
        "pdp_link": pdp,
        "variety": variety,
        "color": color,
        "category": cat,
        "vendor": vendor,
        "tier": p.get("tier",""),
        "stock": p.get("stock",0),
        "box_type": p.get("box_type",""),
        "length": p.get("length","") or "",
        "price": p.get("price",0),
        "has_db_image": bool(db_imgs),
        "image_path": img_path,
        "image_source": img_source,
        "image_type": img_type,
        "merge_key": merge_key,
    })

# ─────────────────────────────────────────────
# 5. Compute cross-product metrics
# ─────────────────────────────────────────────

# Count products sharing the same image path
image_counts = defaultdict(list)
for r in rows:
    image_counts[r["image_path"]].append(r["slug"])

# Count products in same merge group (same variety+color+category)
merge_groups = defaultdict(list)
for r in rows:
    merge_groups[r["merge_key"]].append(r["slug"])

# ─────────────────────────────────────────────
# 6. Determine action flags
# ─────────────────────────────────────────────

def get_action(row, n_sharing_image, merge_group_size):
    t = row["image_type"]
    if t == "LOGO_FALLBACK":
        return "🔴 NEEDS_REAL_PHOTO"
    if t == "AI_GENERATED":
        if row["category"] in ("Bouquets","Mixed Boxes"):
            return "🟡 AI_OK_FOR_COMBO"  # AI is acceptable for combo/bouquet boxes
        return "🟠 REPLACE_WITH_REAL"
    if t == "CATEGORY_FALLBACK":
        return "🟠 NEEDS_SPECIFIC_IMAGE"
    if t == "REAL_PHOTO" and n_sharing_image > 5:
        return "🟡 SHARED_FALLBACK_CHECK"  # real photo but used by many → might be a fuzzy match error
    if merge_group_size > 8:
        return "🔵 REVIEW_MERGE"  # many variants, might need UX simplification
    return "✅ OK"

for r in rows:
    n_sharing = len(image_counts[r["image_path"]])
    mg_size   = len(merge_groups[r["merge_key"]])
    r["instances_sharing_image"] = n_sharing
    r["merge_group_size"] = mg_size
    r["action"] = get_action(r, n_sharing, mg_size)

# ─────────────────────────────────────────────
# 7. Sort: priority issues first
# ─────────────────────────────────────────────

ACTION_ORDER = {
    "🔴 NEEDS_REAL_PHOTO": 0,
    "🟠 REPLACE_WITH_REAL": 1,
    "🟠 NEEDS_SPECIFIC_IMAGE": 2,
    "🟡 SHARED_FALLBACK_CHECK": 3,
    "🔵 REVIEW_MERGE": 4,
    "🟡 AI_OK_FOR_COMBO": 5,
    "✅ OK": 6,
}
rows.sort(key=lambda r: (ACTION_ORDER.get(r["action"],9), r["category"], r["variety"], r["color"]))

# ─────────────────────────────────────────────
# 8. Write CSV
# ─────────────────────────────────────────────

FIELDS = [
    "action",
    "category",
    "variety",
    "color",
    "vendor",
    "tier",
    "box_type",
    "length",
    "price",
    "stock",
    "image_type",
    "image_source",
    "instances_sharing_image",
    "merge_group_size",
    "image_path",
    "pdp_link",
    "slug",
]

with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

# ─────────────────────────────────────────────
# 9. Print summary
# ─────────────────────────────────────────────

from collections import Counter
action_counts = Counter(r["action"] for r in rows)
type_counts   = Counter(r["image_type"] for r in rows)

print("\n=== IMAGE TYPE BREAKDOWN ===")
for k, v in sorted(type_counts.items(), key=lambda x: -x[1]):
    print(f"  {k:<30} {v:>4}")

print("\n=== ACTION FLAGS ===")
for k, v in sorted(action_counts.items(), key=lambda x: ACTION_ORDER.get(x[0],9)):
    print(f"  {k:<35} {v:>4}")

print("\n=== TOP SHARED IMAGES (used by 10+ products) ===")
for img, slugs in sorted(image_counts.items(), key=lambda x: -len(x[1])):
    if len(slugs) >= 10:
        # Get one example product's category+variety
        example = next((r for r in rows if r["image_path"] == img), None)
        cat_example = example["category"] if example else "?"
        print(f"  {len(slugs):>3}x  {img.split('/')[-1]:<50} [{cat_example}]")

print("\n=== LARGE MERGE GROUPS (8+ variants for same variety+color) ===")
for mk, slugs in sorted(merge_groups.items(), key=lambda x: -len(x[1])):
    if len(slugs) >= 8:
        variety, color, cat = mk.split("||")
        print(f"  {len(slugs):>3}x  {variety} {color} [{cat}]")

print(f"\n✅ CSV written to: {OUT_CSV}")
print(f"   Total rows: {len(rows)}")
