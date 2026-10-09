/**
 * Development/staging sample catalogue. Every row is flagged `is_sample = true` so the
 * storefront can label it outside production and so it can be removed in one step.
 *
 * Descriptions describe only what is visible (shape, finish, colour). They make no claims
 * about origin, craftsmanship or sourcing — the real catalogue comes from the owner.
 */

export type SampleVariant = {
  sku: string;
  name?: string;
  options?: Record<string, string>;
  /** rupees */
  price: number;
  compareAt?: number;
  stock: number;
  dims: [number, number, number]; // mm
  weightG: number;
};

export type SampleProduct = {
  slug: string;
  name: string;
  category: string;
  collections: string[];
  material: string;
  finish: string;
  colour: string;
  short: string;
  description: string;
  uniqueness: "unique" | "stock" | "made_to_order";
  leadTimeDays?: number;
  featured?: boolean;
  giftable?: boolean;
  tones: [string, string];
  variants: SampleVariant[];
};

export const sampleCategories = [
  { slug: "trays", name: "Trays", position: 1 },
  { slug: "bowls", name: "Bowls", position: 2 },
  { slug: "vases", name: "Vases", position: 3 },
  { slug: "objects", name: "Objects", position: 4 },
];

export const sampleCollections = [
  {
    slug: "the-stone-edit",
    name: "The Stone Edit",
    intro: "Pieces chosen for the way light moves across their surface.",
    featured: true,
  },
  {
    slug: "gifting",
    name: "Gifting",
    intro: "Considered pieces that arrive gift-wrapped on request.",
    featured: true,
  },
  {
    slug: "living-room",
    name: "Living Room",
    intro: "For consoles, coffee tables and shelves.",
    featured: false,
  },
];

export const sampleProducts: SampleProduct[] = [
  {
    slug: "nero-marble-bowl",
    name: "Nero Marble Bowl",
    category: "bowls",
    collections: ["the-stone-edit", "living-room"],
    material: "Marble",
    finish: "Honed",
    colour: "Black with white veining",
    short: "A low, wide bowl in honed black marble.",
    description:
      "A generous, shallow bowl with a softly rounded rim. The honed surface has a quiet, matte depth.",
    uniqueness: "unique",
    featured: true,
    tones: ["charcoal-stone", "white-marble"],
    variants: [{ sku: "SAMPLE-BOWL-001", price: 8500, stock: 1, dims: [320, 320, 90], weightG: 3400 }],
  },
  {
    slug: "verde-sculptural-vase",
    name: "Verde Sculptural Vase",
    category: "vases",
    collections: ["the-stone-edit"],
    material: "Marble",
    finish: "Polished",
    colour: "Deep green",
    short: "A tall, tapering vase in polished green marble.",
    description:
      "A tall form that narrows toward the neck. Not watertight — use a glass insert for fresh flowers.",
    uniqueness: "made_to_order",
    leadTimeDays: 21,
    featured: true,
    tones: ["green-marble", "travertine"],
    variants: [{ sku: "SAMPLE-VASE-001", price: 24000, stock: 0, dims: [140, 140, 320], weightG: 4100 }],
  },
  {
    slug: "travertine-tray",
    name: "Travertine Tray",
    category: "trays",
    collections: ["living-room", "gifting"],
    material: "Travertine",
    finish: "Filled and honed",
    colour: "Warm beige",
    short: "A rectangular tray with a low lip.",
    description:
      "A simple rectangular tray with a low raised edge, for keys, candles or a small arrangement.",
    uniqueness: "stock",
    giftable: true,
    tones: ["travertine", "white-marble"],
    variants: [
      {
        sku: "SAMPLE-TRAY-001-S",
        name: "Small",
        options: { Size: "Small" },
        price: 5500,
        compareAt: 6500,
        stock: 6,
        dims: [300, 180, 20],
        weightG: 1900,
      },
      {
        sku: "SAMPLE-TRAY-001-L",
        name: "Large",
        options: { Size: "Large" },
        price: 8500,
        stock: 4,
        dims: [400, 250, 20],
        weightG: 3200,
      },
    ],
  },
  {
    slug: "bianco-bookends",
    name: "Bianco Bookends, Pair",
    category: "objects",
    collections: ["living-room", "gifting"],
    material: "Marble",
    finish: "Honed",
    colour: "White with grey veining",
    short: "A pair of solid, block-form bookends.",
    description: "Two solid blocks heavy enough to hold a row of hardcovers, with felt pads underneath.",
    uniqueness: "stock",
    giftable: true,
    tones: ["white-marble", "clay"],
    variants: [{ sku: "SAMPLE-BOOK-001", price: 7200, stock: 0, dims: [120, 80, 150], weightG: 5200 }],
  },
  {
    slug: "arc-candle-holder",
    name: "Arc Candle Holder",
    category: "objects",
    collections: ["gifting"],
    material: "Marble",
    finish: "Honed",
    colour: "White",
    short: "A curved holder for a single taper candle.",
    description: "A low arc with a single socket for a standard taper candle.",
    uniqueness: "stock",
    giftable: true,
    tones: ["white-marble", "travertine"],
    variants: [
      {
        sku: "SAMPLE-CNDL-001-W",
        name: "White",
        options: { Colour: "White" },
        price: 3200,
        stock: 10,
        dims: [160, 60, 50],
        weightG: 700,
      },
      {
        sku: "SAMPLE-CNDL-001-B",
        name: "Black",
        options: { Colour: "Black" },
        price: 3400,
        stock: 3,
        dims: [160, 60, 50],
        weightG: 700,
      },
    ],
  },
  {
    slug: "monolith-vase",
    name: "Monolith Vase",
    category: "vases",
    collections: ["the-stone-edit", "living-room"],
    material: "Travertine",
    finish: "Unfilled",
    colour: "Sand",
    short: "A squared column vase with open travertine texture.",
    description: "A squared column. The unfilled travertine keeps its natural pitted texture.",
    uniqueness: "stock",
    tones: ["travertine", "clay"],
    variants: [{ sku: "SAMPLE-VASE-002", price: 12500, stock: 2, dims: [110, 110, 280], weightG: 3900 }],
  },
  {
    slug: "coaster-set",
    name: "Coasters, Set of Four",
    category: "objects",
    collections: ["gifting"],
    material: "Marble",
    finish: "Honed",
    colour: "Mixed",
    short: "Four round coasters with cork backing.",
    description: "Four round coasters in one set, with cork backing to protect table surfaces.",
    uniqueness: "stock",
    giftable: true,
    tones: ["white-marble", "charcoal-stone"],
    variants: [{ sku: "SAMPLE-CSTR-001", price: 2800, stock: 25, dims: [100, 100, 10], weightG: 900 }],
  },
  {
    slug: "pedestal-bowl",
    name: "Pedestal Bowl",
    category: "bowls",
    collections: ["the-stone-edit"],
    material: "Marble",
    finish: "Polished",
    colour: "Green",
    short: "A raised bowl on a short pedestal foot.",
    description: "A deep bowl raised on a short, solid foot. Each piece is one of a kind.",
    uniqueness: "unique",
    tones: ["green-marble", "charcoal-stone"],
    variants: [{ sku: "SAMPLE-BOWL-002", price: 16500, stock: 1, dims: [260, 260, 160], weightG: 4800 }],
  },
  {
    slug: "catchall-dish",
    name: "Catchall Dish",
    category: "trays",
    collections: ["gifting"],
    material: "Marble",
    finish: "Honed",
    colour: "White with grey veining",
    short: "A small round dish for rings and keys.",
    description: "A small, shallow round dish for a bedside table or entryway.",
    uniqueness: "stock",
    giftable: true,
    tones: ["white-marble", "travertine"],
    variants: [{ sku: "SAMPLE-DISH-001", price: 2500, stock: 18, dims: [120, 120, 25], weightG: 450 }],
  },
  {
    slug: "plinth-riser",
    name: "Plinth Riser",
    category: "objects",
    collections: ["living-room"],
    material: "Travertine",
    finish: "Honed",
    colour: "Ivory",
    short: "A low block for raising objects on a shelf.",
    description: "A low rectangular block to give height to a vase or sculpture in an arrangement.",
    uniqueness: "made_to_order",
    leadTimeDays: 14,
    tones: ["travertine", "white-marble"],
    variants: [
      {
        sku: "SAMPLE-PLNT-001-M",
        name: "Medium",
        options: { Size: "Medium" },
        price: 9800,
        stock: 0,
        dims: [250, 150, 80],
        weightG: 5800,
      },
      {
        sku: "SAMPLE-PLNT-001-L",
        name: "Large",
        options: { Size: "Large" },
        price: 14500,
        stock: 0,
        dims: [350, 200, 100],
        weightG: 9600,
      },
    ],
  },
  {
    slug: "ridge-vessel",
    name: "Ridge Vessel",
    category: "vases",
    collections: ["the-stone-edit"],
    material: "Stoneware",
    finish: "Matte glaze",
    colour: "Clay",
    short: "A ribbed vessel with a matte finish.",
    description: "A rounded vessel with fine horizontal ridges. Each piece varies slightly in tone.",
    uniqueness: "unique",
    tones: ["clay", "travertine"],
    variants: [{ sku: "SAMPLE-VSSL-001", price: 6800, stock: 1, dims: [180, 180, 210], weightG: 1400 }],
  },
  {
    slug: "slab-serving-board",
    name: "Slab Serving Board",
    category: "trays",
    collections: ["living-room", "gifting"],
    material: "Marble",
    finish: "Honed",
    colour: "White",
    short: "A long, flat board for serving.",
    description: "A long, flat slab with eased edges for serving or display.",
    uniqueness: "stock",
    giftable: true,
    featured: true,
    tones: ["white-marble", "green-marble"],
    variants: [{ sku: "SAMPLE-BRD-001", price: 6200, stock: 7, dims: [450, 200, 15], weightG: 3600 }],
  },
];

/** Development-only coupons. */
export const sampleCoupons = [
  { code: "SAMPLE10", type: "percent" as const, value: 1000, minOrderTotal: 500_000, maxDiscount: 300_000 },
  { code: "SAMPLE500", type: "fixed" as const, value: 50_000, minOrderTotal: 1_000_000, maxDiscount: null },
];

/**
 * Draft pages. Policies are placeholders that state what each page will cover — they make
 * no commitments. They stay marked "Pending owner approval" until approved in the admin.
 */
const pendingNote = "*This page is a draft. Studio Clayrity will confirm the final terms before launch.*";

export const samplePages = [
  {
    slug: "about",
    title: "Our story",
    body: `${pendingNote}

# The studio

This page will introduce Studio Clayrity in the owner's own words: who is behind the studio, what draws them to stone and clay, and how pieces are chosen.

# How we work

A short description of the design approach and the materials the studio works with. Only details the studio can verify will be published here.

[Explore the collection](/shop)`,
  },
  {
    slug: "shipping",
    title: "Shipping policy",
    body: `${pendingNote}

# What this policy will cover

- Where we deliver and how long dispatch takes
- Shipping charges, including any free-shipping threshold
- How fragile pieces are packed and whether shipments are insured
- What to do if a parcel arrives damaged`,
  },
  {
    slug: "returns",
    title: "Returns and refunds",
    body: `${pendingNote}

# What this policy will cover

- Which items can be returned, and within how many days
- How to report breakage in transit (including any photo or unboxing-video requirement)
- Whether made-to-order and custom pieces can be returned
- How and when refunds are paid`,
  },
  {
    slug: "cancellation",
    title: "Cancellation policy",
    body: `${pendingNote}

# What this policy will cover

- Until when an order can be cancelled
- How to request a cancellation
- Refund timelines for cancelled orders`,
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    body: `${pendingNote}

# What this policy will cover

- What personal information we collect and why
- How it is stored and protected, and who it is shared with (for example, payment and delivery partners)
- Your rights to access, correct and delete your data
- How to contact us about privacy`,
  },
  {
    slug: "terms",
    title: "Terms and conditions",
    body: `${pendingNote}

# What this page will cover

- The terms on which products are sold through this website
- Pricing, taxes and payment
- Liability and governing law`,
  },
  {
    slug: "cookies",
    title: "Cookie policy",
    body: `${pendingNote}

# What this policy will cover

- The cookies this website uses (for example, to keep your bag and sign-in working)
- Any analytics cookies, and how to accept or decline them`,
  },
];
