CREATE TYPE "public"."recurrence_frequency" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"type" varchar(10) NOT NULL,
	"amount_cents" bigint,
	"is_variable_amount" boolean DEFAULT false NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"frequency" "recurrence_frequency" NOT NULL,
	"interval" smallint DEFAULT 1 NOT NULL,
	"day_of_month" smallint,
	"start_date" date NOT NULL,
	"end_date" date,
	"auto_confirm" boolean DEFAULT false NOT NULL,
	"include_in_forecast" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_transactions_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "recurring_type_valid" CHECK ("recurring_transactions"."type" in ('income', 'expense')),
	CONSTRAINT "recurring_interval_positive" CHECK ("recurring_transactions"."interval" >= 1),
	CONSTRAINT "recurring_day_of_month_range" CHECK ("recurring_transactions"."day_of_month" is null or ("recurring_transactions"."day_of_month" between 1 and 31)),
	CONSTRAINT "recurring_monthly_needs_day" CHECK ("recurring_transactions"."frequency" <> 'monthly' or "recurring_transactions"."day_of_month" is not null),
	CONSTRAINT "recurring_amount_positive" CHECK ("recurring_transactions"."amount_cents" is null or "recurring_transactions"."amount_cents" > 0),
	CONSTRAINT "recurring_fixed_needs_amount" CHECK ("recurring_transactions"."is_variable_amount" or "recurring_transactions"."amount_cents" is not null),
	CONSTRAINT "recurring_end_after_start" CHECK ("recurring_transactions"."end_date" is null or "recurring_transactions"."end_date" >= "recurring_transactions"."start_date"),
	CONSTRAINT "recurring_auto_confirm_fixed_only" CHECK (not "recurring_transactions"."auto_confirm" or not "recurring_transactions"."is_variable_amount")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"month" date NOT NULL,
	"limit_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_user_category_month_unique" UNIQUE("user_id","category_id","month"),
	CONSTRAINT "budgets_limit_positive" CHECK ("budgets"."limit_cents" > 0),
	CONSTRAINT "budgets_month_first_day" CHECK (extract(day from "budgets"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "occurrence_date" date;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_fk" FOREIGN KEY ("recurring_transaction_id","user_id") REFERENCES "public"."recurring_transactions"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_recurring_occurrence_unique" ON "transactions" USING btree ("recurring_transaction_id","occurrence_date") WHERE "transactions"."recurring_transaction_id" is not null;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_shape" CHECK (("transactions"."recurring_transaction_id" is null and "transactions"."occurrence_date" is null)
        or ("transactions"."recurring_transaction_id" is not null and "transactions"."occurrence_date" is not null and "transactions"."type" in ('income', 'expense')));