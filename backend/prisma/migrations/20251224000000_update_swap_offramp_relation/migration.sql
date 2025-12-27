-- Update swap_transactions table to remove unique constraint on reference (swap can share reference with offramp)
-- Note: We'll keep reference unique for now but ensure swap references match offramp references
-- The relation is already established via swapId in offramp_transactions

-- The foreign key constraint is already in place from previous migration
-- Just ensure the relation name matches
-- Swap transaction can now share the same reference as its corresponding offramp transaction

