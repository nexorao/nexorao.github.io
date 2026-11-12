-- Spec §5: the wallet ledger is append-only. UPDATE and DELETE are blocked
-- at the database level — corrections are new rows (adjustment type), never
-- mutations. This is the backbone of the "balances derived from the ledger"
-- invariant that lib/wallet verifies.
CREATE OR REPLACE FUNCTION wallet_transactions_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'wallet_transactions is append-only (attempted % on row id %)',
    TG_OP, COALESCE(OLD.id, NEW.id);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_transactions_no_update ON wallet_transactions;
CREATE TRIGGER wallet_transactions_no_update
  BEFORE UPDATE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION wallet_transactions_append_only();

DROP TRIGGER IF EXISTS wallet_transactions_no_delete ON wallet_transactions;
CREATE TRIGGER wallet_transactions_no_delete
  BEFORE DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION wallet_transactions_append_only();
