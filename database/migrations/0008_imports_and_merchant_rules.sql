CREATE TABLE "imported_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw_data" jsonb NOT NULL,
	"transaction_date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"direction" varchar(3) NOT NULL,
	"description" varchar(300) NOT NULL,
	"description_normalized" varchar(300) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"external_id" varchar(100),
	"suggested_type" varchar(12) NOT NULL,
	"suggested_category_id" uuid,
	"suggested_target_account_id" uuid,
	"suggested_invoice_id" uuid,
	"suggestion_source" varchar(12) DEFAULT 'none' NOT NULL,
	"duplicate_kind" varchar(8),
	"duplicate_of_transaction_id" uuid,
	"default_action" varchar(6) NOT NULL,
	"status" varchar(8) DEFAULT 'pending' NOT NULL,
	"created_transaction_id" uuid,
	"created_transfer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imported_transactions_import_row_unique" UNIQUE("import_id","row_number"),
	CONSTRAINT "imported_transactions_amount_positive" CHECK ("imported_transactions"."amount_cents" > 0),
	CONSTRAINT "imported_transactions_direction_valid" CHECK ("imported_transactions"."direction" in ('in', 'out')),
	CONSTRAINT "imported_transactions_suggested_type_valid" CHECK ("imported_transactions"."suggested_type" in ('income', 'expense', 'transfer', 'card_payment')),
	CONSTRAINT "imported_transactions_duplicate_kind_valid" CHECK ("imported_transactions"."duplicate_kind" is null or "imported_transactions"."duplicate_kind" in ('exact', 'possible')),
	CONSTRAINT "imported_transactions_default_action_valid" CHECK ("imported_transactions"."default_action" in ('import', 'skip')),
	CONSTRAINT "imported_transactions_status_valid" CHECK ("imported_transactions"."status" in ('pending', 'imported', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source" varchar(10) DEFAULT 'csv' NOT NULL,
	"filename" varchar(200) NOT NULL,
	"status" varchar(12) DEFAULT 'review' NOT NULL,
	"detected" jsonb NOT NULL,
	"ignored_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ignored_rows_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "imports_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "imports_source_valid" CHECK ("imports"."source" in ('csv', 'ofx', 'pdf')),
	CONSTRAINT "imports_status_valid" CHECK ("imports"."status" in ('review', 'confirmed', 'cancelled', 'reverted'))
);
--> statement-breakpoint
CREATE TABLE "merchant_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pattern" varchar(100) NOT NULL,
	"match_type" varchar(12) DEFAULT 'contains' NOT NULL,
	"suggested_type" varchar(12) NOT NULL,
	"category_id" uuid,
	"target_account_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_rules_user_pattern_unique" UNIQUE("user_id","match_type","pattern"),
	CONSTRAINT "merchant_rules_match_type_valid" CHECK ("merchant_rules"."match_type" in ('contains', 'starts_with')),
	CONSTRAINT "merchant_rules_suggested_type_valid" CHECK ("merchant_rules"."suggested_type" in ('income', 'expense', 'transfer')),
	CONSTRAINT "merchant_rules_transfer_shape" CHECK (("merchant_rules"."suggested_type" = 'transfer' and "merchant_rules"."target_account_id" is not null and "merchant_rules"."category_id" is null)
        or ("merchant_rules"."suggested_type" <> 'transfer' and "merchant_rules"."target_account_id" is null)),
	CONSTRAINT "merchant_rules_pattern_length" CHECK (char_length("merchant_rules"."pattern") between 2 and 100)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "imported_transactions" ADD CONSTRAINT "imported_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_transactions" ADD CONSTRAINT "imported_transactions_import_fk" FOREIGN KEY ("import_id","user_id") REFERENCES "public"."imports"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_transactions" ADD CONSTRAINT "imported_transactions_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_transactions" ADD CONSTRAINT "imported_transactions_category_fk" FOREIGN KEY ("suggested_category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_transactions" ADD CONSTRAINT "imported_transactions_target_account_fk" FOREIGN KEY ("suggested_target_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_transactions" ADD CONSTRAINT "imported_transactions_transaction_fk" FOREIGN KEY ("created_transaction_id","user_id") REFERENCES "public"."transactions"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_transactions" ADD CONSTRAINT "imported_transactions_transfer_fk" FOREIGN KEY ("created_transfer_id","user_id") REFERENCES "public"."transfers"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_target_account_fk" FOREIGN KEY ("target_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imported_transactions_fingerprint_idx" ON "imported_transactions" USING btree ("user_id","account_id","fingerprint");--> statement-breakpoint
CREATE INDEX "imports_user_created_idx" ON "imports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "merchant_rules_user_idx" ON "merchant_rules" USING btree ("user_id");
