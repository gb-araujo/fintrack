-- Integridade de transferências no banco (ADR 0003, ADR 0012).
--
-- Toda transferência tem EXATAMENTE duas pernas em "transactions": uma de saída na conta de origem
-- e uma de entrada na conta de destino, com o mesmo valor, data e status do cabeçalho. Sem isso o
-- saldo das contas divergiria (dinheiro que sai sem entrar, ou o contrário).
--
-- A verificação é DEFERRED: roda no COMMIT, depois que a aplicação inseriu/atualizou o cabeçalho e
-- as duas pernas na mesma transação. Assim a regra vale mesmo que exista um bug na aplicação, um
-- script manual ou uma migration futura mexendo nessas tabelas.
CREATE OR REPLACE FUNCTION "check_transfer_integrity"() RETURNS trigger AS $$
DECLARE
  transfer_row "transfers"%ROWTYPE;
  transfer_key uuid;
  out_legs integer;
  in_legs integer;
  all_legs integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    transfer_key := OLD."transfer_id";
  ELSIF TG_TABLE_NAME = 'transfers' THEN
    transfer_key := NEW."id";
  ELSE
    transfer_key := NEW."transfer_id";
  END IF;

  SELECT * INTO transfer_row FROM "transfers" WHERE "id" = transfer_key;
  IF NOT FOUND THEN
    RETURN NULL; -- transferência removida junto com o usuário (ON DELETE CASCADE)
  END IF;

  SELECT
    count(*) FILTER (WHERE "transfer_direction" = 'out' AND "account_id" = transfer_row."from_account_id"),
    count(*) FILTER (WHERE "transfer_direction" = 'in' AND "account_id" = transfer_row."to_account_id"),
    count(*)
  INTO out_legs, in_legs, all_legs
  FROM "transactions"
  WHERE "transfer_id" = transfer_key
    AND "user_id" = transfer_row."user_id"
    AND "type" = 'transfer'
    AND "amount_cents" = transfer_row."amount_cents"
    AND "transaction_date" = transfer_row."transfer_date"
    AND "status" = transfer_row."status";

  IF out_legs <> 1 OR in_legs <> 1 OR all_legs <> 2
     OR (SELECT count(*) FROM "transactions" WHERE "transfer_id" = transfer_key) <> 2 THEN
    RAISE EXCEPTION 'Transferência % inconsistente: são necessárias exatamente duas pernas (saída e entrada) com o mesmo valor, data e status.', transfer_key
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "transfers_integrity"
  AFTER INSERT OR UPDATE ON "transfers"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_transfer_integrity"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "transfer_legs_integrity"
  AFTER INSERT OR UPDATE ON "transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW."transfer_id" IS NOT NULL)
  EXECUTE FUNCTION "check_transfer_integrity"();
--> statement-breakpoint
-- Apagar uma perna deixaria a transferência pela metade. Apagar transferência inteira (ou o usuário,
-- por cascata) continua permitido: no COMMIT o cabeçalho já não existe e a verificação é ignorada.
CREATE CONSTRAINT TRIGGER "transfer_legs_delete_integrity"
  AFTER DELETE ON "transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD."transfer_id" IS NOT NULL)
  EXECUTE FUNCTION "check_transfer_integrity"();
