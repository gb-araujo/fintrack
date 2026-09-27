-- Integridade das parcelas de cartão no banco (ADR 0005, ADR 0017).
--
-- Toda compra tem EXATAMENTE `installments_count` parcelas, numeradas de 1 a N, cuja soma é o valor
-- total da compra. Sem isso, uma fatura poderia somar mais (ou menos) do que foi comprado — e o
-- "Quanto posso gastar?", o limite e o orçamento divergiriam.
--
-- A verificação é DEFERRED: roda no COMMIT, depois que a aplicação inseriu a compra e todas as
-- parcelas na mesma transação. Vale mesmo para scripts manuais e migrations futuras. A unicidade
-- (compra, número) + count = N + max = N garantem que os números são exatamente 1..N.
CREATE OR REPLACE FUNCTION "check_purchase_installments"() RETURNS trigger AS $$
DECLARE
  purchase_key uuid;
  purchase_row "credit_card_transactions"%ROWTYPE;
  parts integer;
  total bigint;
  highest integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    purchase_key := OLD."card_transaction_id";
  ELSIF TG_TABLE_NAME = 'credit_card_transactions' THEN
    purchase_key := NEW."id";
  ELSE
    purchase_key := NEW."card_transaction_id";
  END IF;

  SELECT * INTO purchase_row FROM "credit_card_transactions" WHERE "id" = purchase_key;
  IF NOT FOUND THEN
    RETURN NULL; -- compra removida junto com o usuário (ON DELETE CASCADE)
  END IF;

  SELECT count(*), coalesce(sum("amount_cents"), 0), coalesce(max("installment_number"), 0)
  INTO parts, total, highest
  FROM "credit_card_installments"
  WHERE "card_transaction_id" = purchase_key;

  IF parts <> purchase_row."installments_count"
     OR highest <> purchase_row."installments_count"
     OR total <> purchase_row."total_amount_cents" THEN
    RAISE EXCEPTION 'Compra % inconsistente: esperadas % parcelas somando % centavos, encontradas % somando %.',
      purchase_key, purchase_row."installments_count", purchase_row."total_amount_cents", parts, total
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "purchases_installments_integrity"
  AFTER INSERT OR UPDATE ON "credit_card_transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_purchase_installments"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "installments_integrity"
  AFTER INSERT OR UPDATE OR DELETE ON "credit_card_installments"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_purchase_installments"();
