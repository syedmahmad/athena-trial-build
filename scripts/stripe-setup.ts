/**
 * Idempotently create the Athena Family product + monthly/yearly prices in
 * Stripe. Re-running is safe: it finds the product by metadata tag and each
 * price by lookup_key, creating only what is missing.
 *
 *   pnpm tsx --env-file=.env scripts/stripe-setup.ts
 *
 * Requires STRIPE_SECRET_KEY (test mode) in .env. The checkout route resolves
 * prices by lookup_key at runtime, so nothing from the output needs to be
 * pasted anywhere.
 */
import Stripe from "stripe";
import { FAMILY_PLAN } from "../src/lib/stripe/plans";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add a test key to .env and run with --env-file=.env"
    );
  }
  const stripe = new Stripe(key);

  // 1. Product (find by metadata tag, else create).
  const existingProducts = await stripe.products.search({
    query: `metadata['athena_plan']:'${FAMILY_PLAN.productTag}'`,
  });
  let product = existingProducts.data[0];
  if (product) {
    console.log(`✓ product exists: ${product.id} (${product.name})`);
  } else {
    product = await stripe.products.create({
      name: FAMILY_PLAN.productName,
      metadata: { athena_plan: FAMILY_PLAN.productTag },
    });
    console.log(`+ created product: ${product.id} (${product.name})`);
  }

  // 2. Prices (find by lookup_key, else create + attach the key).
  for (const [interval, cfg] of Object.entries(FAMILY_PLAN.prices)) {
    const found = await stripe.prices.list({
      lookup_keys: [cfg.lookupKey],
      active: true,
      limit: 1,
    });
    if (found.data[0]) {
      const p = found.data[0];
      console.log(
        `✓ price exists: ${cfg.lookupKey} -> ${p.id} (${p.unit_amount} ${p.currency}/${cfg.interval})`
      );
      continue;
    }
    const price = await stripe.prices.create({
      product: product.id,
      currency: FAMILY_PLAN.currency,
      unit_amount: cfg.unitAmount,
      recurring: { interval: cfg.interval },
      lookup_key: cfg.lookupKey,
      transfer_lookup_key: true,
      nickname: `Athena Family ${interval}`,
    });
    console.log(
      `+ created price: ${cfg.lookupKey} -> ${price.id} (${cfg.unitAmount} ${FAMILY_PLAN.currency}/${cfg.interval})`
    );
  }

  console.log("\nDone. Prices are resolvable by lookup_key at checkout.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
