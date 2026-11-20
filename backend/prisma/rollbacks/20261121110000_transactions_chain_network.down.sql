ALTER TABLE "onramp_transactions" DROP COLUMN IF EXISTS "chain_network";
ALTER TABLE "offramp_transactions" DROP COLUMN IF EXISTS "chain_network";
ALTER TABLE "swap_transactions" DROP COLUMN IF EXISTS "chain_network";
ALTER TABLE "otc_transactions" DROP COLUMN IF EXISTS "chain_network";
ALTER TABLE "bridge_transactions" DROP COLUMN IF EXISTS "chain_network";
ALTER TABLE "merchant_onramp_transactions" DROP COLUMN IF EXISTS "chain_network";
ALTER TABLE "merchant_offramp_transactions" DROP COLUMN IF EXISTS "chain_network";
ALTER TABLE "merchant_swap_transactions" DROP COLUMN IF EXISTS "chain_network";
