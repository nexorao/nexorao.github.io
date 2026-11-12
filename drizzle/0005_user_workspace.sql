CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "phone" text,
  "default_model" text,
  "max_output_tokens" integer NOT NULL DEFAULT 8192,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "notifications" jsonb NOT NULL DEFAULT '{"usageAlerts":true,"lowBalance":true,"paymentReceipts":true,"securityAlerts":true,"planChanges":true,"productUpdates":false}'::jsonb,
  "usage_alert_percent" integer NOT NULL DEFAULT 80,
  "low_balance_credits" integer NOT NULL DEFAULT 500,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" text NOT NULL DEFAULT 'alert',
  "title" text NOT NULL,
  "body" text NOT NULL,
  "href" text,
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "user_notifications_inbox_idx" ON "user_notifications" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" text NOT NULL,
  "category" text NOT NULL DEFAULT 'general',
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_tickets_user_updated_idx" ON "support_tickets" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE,
  "author_role" text NOT NULL DEFAULT 'user',
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_messages_ticket_created_idx" ON "support_messages" ("ticket_id", "created_at");

CREATE TABLE IF NOT EXISTS "user_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "category" text NOT NULL DEFAULT 'other',
  "message" text NOT NULL DEFAULT '',
  "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "user_feedback_user_created_idx" ON "user_feedback" ("user_id", "created_at");
