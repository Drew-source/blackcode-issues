-- Add bounty/payment fields to issues table
ALTER TABLE issues ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(10);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS payment_details TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS requirements TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS claim_only_details TEXT;
