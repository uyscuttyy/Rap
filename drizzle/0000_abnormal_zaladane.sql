CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "payment_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"keeperhub_execution_id" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"transaction_hash" varchar(66),
	"error_message" text,
	"raw_response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" varchar(64) NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"recipient" varchar(42) NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"token" varchar(42) DEFAULT '0x0000000000000000000000000000000000000000' NOT NULL,
	"network" varchar(32) DEFAULT 'base-sepolia' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"keeperhub_execution_id" varchar(64),
	"transaction_hash" varchar(66),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
ALTER TABLE "payment_executions" ADD CONSTRAINT "payment_executions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_executions_keeperhub_execution_id_idx" ON "payment_executions" USING btree ("keeperhub_execution_id");--> statement-breakpoint
CREATE INDEX "payment_executions_payment_id_idx" ON "payment_executions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_payment_id_idx" ON "payments" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_user_address_idx" ON "payments" USING btree ("user_address");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");