CREATE TABLE "credit_card_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"card_transaction_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "credit_card_installments_purchase_number_unique" UNIQUE("card_transaction_id","installment_number"),
	CONSTRAINT "credit_card_installments_amount_positive" CHECK ("credit_card_installments"."amount_cents" > 0),
	CONSTRAINT "credit_card_installments_number_positive" CHECK ("credit_card_installments"."installment_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "credit_card_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"reference_month" date NOT NULL,
	"closing_date" date NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_card_invoices_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "credit_card_invoices_id_card_user_unique" UNIQUE("id","credit_card_id","user_id"),
	CONSTRAINT "credit_card_invoices_card_month_unique" UNIQUE("credit_card_id","reference_month"),
	CONSTRAINT "credit_card_invoices_due_after_closing" CHECK ("credit_card_invoices"."due_date" > "credit_card_invoices"."closing_date"),
	CONSTRAINT "credit_card_invoices_reference_is_due_month" CHECK ("credit_card_invoices"."reference_month" = date_trunc('month', "credit_card_invoices"."due_date")::date)
);
--> statement-breakpoint
CREATE TABLE "credit_card_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"category_id" uuid,
	"description" varchar(200) NOT NULL,
	"purchase_date" date NOT NULL,
	"total_amount_cents" bigint NOT NULL,
	"installments_count" integer NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_card_transactions_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "credit_card_transactions_id_card_user_unique" UNIQUE("id","credit_card_id","user_id"),
	CONSTRAINT "credit_card_transactions_total_positive" CHECK ("credit_card_transactions"."total_amount_cents" > 0),
	CONSTRAINT "credit_card_transactions_installments_range" CHECK ("credit_card_transactions"."installments_count" between 1 and 48)
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"limit_cents" bigint NOT NULL,
	"closing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"payment_account_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_cards_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "credit_cards_limit_positive" CHECK ("credit_cards"."limit_cents" > 0),
	CONSTRAINT "credit_cards_closing_day_range" CHECK ("credit_cards"."closing_day" between 1 and 31),
	CONSTRAINT "credit_cards_due_day_range" CHECK ("credit_cards"."due_day" between 1 and 31)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "credit_card_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_purchase_fk" FOREIGN KEY ("card_transaction_id","credit_card_id","user_id") REFERENCES "public"."credit_card_transactions"("id","credit_card_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_invoice_fk" FOREIGN KEY ("invoice_id","credit_card_id","user_id") REFERENCES "public"."credit_card_invoices"("id","credit_card_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_invoices" ADD CONSTRAINT "credit_card_invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_invoices" ADD CONSTRAINT "credit_card_invoices_card_fk" FOREIGN KEY ("credit_card_id","user_id") REFERENCES "public"."credit_cards"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_transactions" ADD CONSTRAINT "credit_card_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_transactions" ADD CONSTRAINT "credit_card_transactions_card_fk" FOREIGN KEY ("credit_card_id","user_id") REFERENCES "public"."credit_cards"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_transactions" ADD CONSTRAINT "credit_card_transactions_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_payment_account_fk" FOREIGN KEY ("payment_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_card_installments_invoice_idx" ON "credit_card_installments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "credit_card_invoices_user_due_idx" ON "credit_card_invoices" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "credit_card_transactions_card_date_idx" ON "credit_card_transactions" USING btree ("credit_card_id","purchase_date");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_cards_user_name_active_unique" ON "credit_cards" USING btree ("user_id",lower("name")) WHERE "credit_cards"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoice_fk" FOREIGN KEY ("credit_card_invoice_id","user_id") REFERENCES "public"."credit_card_invoices"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_invoice_idx" ON "transactions" USING btree ("credit_card_invoice_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_payment_shape" CHECK (("transactions"."type" = 'card_payment' and "transactions"."credit_card_invoice_id" is not null and "transactions"."category_id" is null)
        or ("transactions"."type" <> 'card_payment' and "transactions"."credit_card_invoice_id" is null));