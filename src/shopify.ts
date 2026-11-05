/* ============================================================
   Shopify Storefront API – Verbindung zu kawaii-clothes-qbnuwvhv.myshopify.com
   ============================================================ */

const DOMAIN = import.meta.env.VITE_SHOPIFY_DOMAIN;
const TOKEN  = import.meta.env.VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN;
const API_VERSION = import.meta.env.VITE_SHOPIFY_API_VERSION ?? '2024-04';

if (!DOMAIN || !TOKEN) {
  console.warn('[Shopify] VITE_SHOPIFY_DOMAIN oder VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN fehlt in .env');
}

const GRAPHQL_URL = `https://${DOMAIN}/api/${API_VERSION}/graphql.json`;

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  price: string;
  currencyCode: string;
  images: string[];
  variants: Array<{
    id: string;
    title: string;
    price: string;
    availableForSale: boolean;
    selectedOptions: Array<{ name: string; value: string }>;
  }>;
}

/**
 * GraphQL-Request an Shopify Storefront API senden
 */
async function shopifyRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 12000);   // hängende Anfragen nicht ewig warten lassen
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      signal: ctl.signal,
    });
  } finally { clearTimeout(timer); }

  if (!res.ok) {
    throw new Error(`Shopify API Fehler: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL Fehler: ${json.errors.map((e: any) => e.message).join(', ')}`);
  }

  return json.data as T;
}

const PRODUCT_NODE = `
  id
  title
  handle
  description
  images(first: 10) { edges { node { url } } }
  variants(first: 10) {
    edges { node { id title price { amount currencyCode } availableForSale selectedOptions { name value } } }
  }`;

/** Rohknoten der Storefront API in unser Produktformat umwandeln */
function mapProduct(node: any): ShopifyProduct {
  const firstVariant = node.variants.edges[0]?.node;
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    description: node.description,
    price: firstVariant?.price?.amount ?? '0',
    currencyCode: firstVariant?.price?.currencyCode ?? 'EUR',
    images: node.images.edges.map((e: any) => e.node.url as string),
    variants: node.variants.edges.map((e: any) => e.node),
  };
}

/**
 * Produkte aus Shopify laden (Standard: die ersten 50, neueste zuerst).
 * Mit `collection` (Handle einer Kollektion) werden nur deren Produkte geladen. Das CMS stellt das ein.
 */
export async function fetchShopifyProducts(first: number = 50, collection = ''): Promise<ShopifyProduct[]> {
  if (collection) {
    const data = await shopifyRequest<{ collection: { products: { edges: Array<{ node: any }> } } | null }>(
      `query getCollectionProducts($first: Int!, $handle: String!) {
        collection(handle: $handle) { products(first: $first) { edges { node { ${PRODUCT_NODE} } } } }
      }`,
      { first, handle: collection },
    );
    if (!data.collection) throw new Error(`Kollektion „${collection}“ nicht gefunden`);
    return data.collection.products.edges.map(e => mapProduct(e.node));
  }
  const data = await shopifyRequest<{ products: { edges: Array<{ node: any }> } }>(
    `query getProducts($first: Int!) {
      products(first: $first, sortKey: CREATED_AT, reverse: true) { edges { node { ${PRODUCT_NODE} } } }
    }`,
    { first },
  );
  return data.products.edges.map(e => mapProduct(e.node));
}

/**
 * Checkout-URL erstellen (für Warenkorb → Shopify Checkout)
 */
export async function createCheckoutUrl(lineItems: Array<{ variantId: string; quantity: number }>): Promise<string> {
  // Cart-API statt der veralteten checkoutCreate-Mutation
  const data = await shopifyRequest<{
    cartCreate: { cart: { checkoutUrl: string } | null; userErrors: Array<{ message: string }> };
  }>(
    `mutation createCart($input: CartInput!) {
      cartCreate(input: $input) { cart { checkoutUrl } userErrors { message } }
    }`,
    { input: { lines: lineItems.map(li => ({ merchandiseId: li.variantId, quantity: li.quantity })) } },
  );

  const { cart, userErrors } = data.cartCreate;
  if (userErrors.length > 0) throw new Error(`Checkout-Fehler: ${userErrors.map(e => e.message).join(', ')}`);
  const url = cart?.checkoutUrl;
  if (!url || new URL(url).protocol !== 'https:') throw new Error('Ungültige Checkout-Adresse');   // nur https weiterleiten
  return url;
}
