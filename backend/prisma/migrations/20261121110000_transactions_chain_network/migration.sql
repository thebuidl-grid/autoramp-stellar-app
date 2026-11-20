-- Record which chain network (mainnet or testnet) the website was on when a transaction was created.
-- Additive and nullable: existing rows stay NULL (unknown) rather than being guessed.
ALTER TABLE "onramp_transactions" ADD COLUMN "chain_network" TEXT;
ALTER TABLE "offramp_transactions" ADD COLUMN "chain_network" TEXT;
ALTER TABLE "swap_transactions" ADD COLUMN "chain_network" TEXT;
ALTER TABLE "otc_transactions" ADD COLUMN "chain_network" TEXT;
ALTER TABLE "bridge_transactions" ADD COLUMN "chain_network" TEXT;
ALTER TABLE "merchant_onramp_transactions" ADD COLUMN "chain_network" TEXT;
ALTER TABLE "merchant_offramp_transactions" ADD COLUMN "chain_network" TEXT;
ALTER TABLE "merchant_swap_transactions" ADD COLUMN "chain_network" TEXT;
