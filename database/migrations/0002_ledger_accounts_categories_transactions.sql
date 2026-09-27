CREATE TYPE "public"."account_type" AS ENUM('bank', 'wallet', 'investment');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'debit_card', 'cash', 'boleto', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer', 'card_payment');--> statement-breakpoint
CREATE TYPE "public"."transfer_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"type" "account_type" NOT NULL,
	"initial_balance_cents" bigint DEFAULT 0 NOT NULL,
	"include_in_available" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"kind" "category_kind" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"transfer_date" date NOT NULL,
	"status" "transaction_status" DEFAULT 'completed' NOT NULL,
	"description" varchar(200) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "transfers_amount_positive" CHECK ("transfers"."amount_cents" > 0),
	CONSTRAINT "transfers_accounts_differ" CHECK ("transfers"."from_account_id" <> "transfers"."to_account_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"type" "transaction_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" varchar(200) DEFAULT '' NOT NULL,
	"transaction_date" date NOT NULL,
	"payment_method" "payment_method",
	"status" "transaction_status" DEFAULT 'completed' NOT NULL,
	"transfer_id" uuid,
	"transfer_direction" "transfer_direction",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_cents" > 0),
	CONSTRAINT "transactions_transfer_shape" CHECK (("transactions"."type" = 'transfer' and "transactions"."transfer_id" is not null and "transactions"."transfer_direction" is not null and "transactions"."category_id" is null)
        or ("transactions"."type" <> 'transfer' and "transactions"."transfer_id" is null and "transactions"."transfer_direction" is null))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_fk" FOREIGN KEY ("from_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_fk" FOREIGN KEY ("to_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_fk" FOREIGN KEY ("transfer_id","user_id") REFERENCES "public"."transfers"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_name_active_unique" ON "accounts" USING btree ("user_id",lower("name")) WHERE "accounts"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_kind_name_active_unique" ON "categories" USING btree ("user_id","kind",lower("name")) WHERE "categories"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "transfers_user_date_idx" ON "transfers" USING btree ("user_id","transfer_date");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_account_status_idx" ON "transactions" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "transactions_transfer_idx" ON "transactions" USING btree ("transfer_id");--> statement-breakpoint
-- Categorias padrão para usuários criados antes desta migration (FASE 1). Novos usuários recebem as
-- mesmas categorias, na mesma ordem, no cadastro (apps/api/src/modules/categories/default-categories.ts).
-- O instante de criação cresce 1 ms por categoria para manter a ordem da lista.
INSERT INTO "categories" ("user_id", "name", "kind", "is_default", "created_at")
SELECT u."id", c."name", c."kind"::"category_kind", true, now() + (c."ordinal" * interval '1 millisecond')
FROM "users" u
CROSS JOIN (VALUES
  ('Salário', 'income', 1),
  ('VR', 'income', 2),
  ('VT', 'income', 3),
  ('Outros', 'income', 4),
  ('Moradia', 'expense', 5),
  ('Energia', 'expense', 6),
  ('Água', 'expense', 7),
  ('Internet', 'expense', 8),
  ('Celular', 'expense', 9),
  ('Alimentação', 'expense', 10),
  ('Transporte', 'expense', 11),
  ('Saúde', 'expense', 12),
  ('Lazer', 'expense', 13),
  ('Assinaturas', 'expense', 14),
  ('Compras', 'expense', 15),
  ('Educação', 'expense', 16),
  ('Outros', 'expense', 17)
) AS c("name", "kind", "ordinal");
