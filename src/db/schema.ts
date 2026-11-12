/**
 * NEXORA AI — database schema (Phase 2).
 *
 * Conventions (master spec §5):
 *  - Money is stored in integer paise, provider prices in integer micro-USD,
 *    credits as integers. There are no floats for money anywhere.
 *  - `wallet_transactions` is an append-only ledger (an SQL trigger in the
 *    migrations blocks UPDATE/DELETE); balances are derived from buckets and
 *    verified against the ledger by lib/wallet.
 *  - Later-phase tables (conversations, api_keys, mcp_*, knowledge_*, …) are
 *    added by their own phases to keep every migration reviewable.
 */
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const authTokenTypeEnum = pgEnum("auth_token_type", [
  "email_verify",
  "password_reset",
]);
export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "annual"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "expired",
]);
export const bucketTypeEnum = pgEnum("bucket_type", [
  "daily_free",
  "promotional",
  "subscription",
  "purchased",
]);
export const txTypeEnum = pgEnum("tx_type", [
  "daily_grant",
  "subscription_grant",
  "purchase",
  "promotional_grant",
  "reservation_hold",
  "reservation_release",
  "admin_grant",
  "admin_deduct",
  "expiry",
  "adjustment",
]);
export const reservationStatusEnum = pgEnum("reservation_status", [
  "held",
  "committed",
  "released",
  "expired",
]);
export const modelCategoryEnum = pgEnum("model_category", [
  "claude",
  "gpt",
  "gemini",
  "open_source",
]);
export const modelStatusEnum = pgEnum("model_status", [
  "available",
  "preview",
  "deprecated",
]);
export const chatMessageRoleEnum = pgEnum("chat_message_role", ["user", "assistant"]);
export const chatMessageStatusEnum = pgEnum("chat_message_status", [
  "complete",
  "streaming",
  "failed",
]);
export const paymentKindEnum = pgEnum("payment_kind", [
  "subscription",
  "topup",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "created",
  "paid",
  "failed",
  "refunded",
  "needs_review",
]);
export const webhookEventStatusEnum = pgEnum("webhook_event_status", [
  "received",
  "processed",
  "failed",
]);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  /** Slug: "user" | "admin" (extensible). */
  name: text("name").primaryKey(),
  description: text("description"),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored lowercase. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: userStatusEnum("status").notNull().default("active"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** AES-256-GCM envelope (lib/crypto/encryption). null = 2FA not set up. */
    totpSecretEnc: text("totp_secret_enc"),
    totpIv: text("totp_iv"),
    totpAuthTag: text("totp_auth_tag"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    referralCode: text("referral_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Soft delete for legal retention; never referenced by auth queries. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    uniqueIndex("users_referral_code_key").on(t.referralCode),
    index("users_created_at_idx").on(t.createdAt),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleName: text("role_name")
      .notNull()
      .references(() => roles.name, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleName] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the opaque cookie token; the raw token never touches the DB. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

/** Email verification + password reset tokens (hashed at rest, single use). */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: authTokenTypeEnum("type").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_tokens_token_hash_key").on(t.tokenHash),
    index("auth_tokens_user_id_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Plans & subscriptions
// ---------------------------------------------------------------------------

export const plans = pgTable("plans", {
  /** Code: "free" | "plus" | "pro" | "ultra" | "max". */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  /** jsonb array of marketing highlights. */
  highlights: jsonb("highlights").$type<string[]>().notNull().default([]),
  pricePaiseMonthly: integer("price_paise_monthly").notNull().default(0),
  /** Annual term = 12 months, this many charged (10 = two months free). */
  annualMonthsCharged: integer("annual_months_charged").notNull().default(10),
  monthlyCredits: bigint("monthly_credits", { mode: "number" })
    .notNull()
    .default(0),
  dailyFreeCredits: bigint("daily_free_credits", { mode: "number" })
    .notNull()
    .default(0),
  popular: boolean("popular").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Flexible per-plan limits, e.g. max_output_tokens, rate limits, concurrency. */
export const planLimits = pgTable(
  "plan_limits",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.key] })],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    billingCycle: billingCycleEnum("billing_cycle").notNull().default("monthly"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
    }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end")
      .notNull()
      .default(false),
    /** "manual" until Razorpay lands in Phase 7. */
    source: text("source").notNull().default("manual"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subscriptions_user_id_idx").on(t.userId),
    index("subscriptions_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("wallets_user_id_key").on(t.userId)],
);

export const walletBuckets = pgTable(
  "wallet_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    type: bucketTypeEnum("type").notNull(),
    credits: bigint("credits", { mode: "number" }).notNull().default(0),
    /** null = never expires. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Subscription / payment / campaign that produced this bucket. */
    sourceRef: uuid("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("wallet_buckets_wallet_idx").on(t.walletId, t.type, t.expiresAt),
    index("wallet_buckets_expires_idx").on(t.expiresAt),
  ],
);

/**
 * Append-only ledger. Every row is a signed delta (credit positive, debit
 * negative); invariant enforced by lib/wallet.verifyLedger:
 *   SUM(amount) == SUM(active buckets credits)
 * The hold → release pair records request billing without ever mutating rows.
 */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: txTypeEnum("type").notNull(),
    /** Signed: positive = credited to wallet, negative = debited. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** Ledger snapshot after this row (defense against drift). */
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    bucketType: bucketTypeEnum("bucket_type"),
    reservationId: uuid("reservation_id"),
    /** Idempotency / external reference (request id, payment id, admin note). */
    reference: text("reference"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("wallet_tx_wallet_created_idx").on(t.walletId, t.createdAt),
    index("wallet_tx_user_created_idx").on(t.userId, t.createdAt),
    index("wallet_tx_reservation_idx").on(t.reservationId),
  ],
);

export const creditReservations = pgTable(
  "credit_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    estimatedCredits: bigint("estimated_credits", { mode: "number" }).notNull(),
    actualCredits: bigint("actual_credits", { mode: "number" }),
    status: reservationStatusEnum("status").notNull().default("held"),
    /** Unique per billable request (spec §6 step 7). */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Per-bucket debit snapshot so refunds return to the same buckets. */
    breakdown: jsonb("breakdown").$type<
      {
        bucketId: string;
        bucketType: "daily_free" | "promotional" | "subscription" | "purchased";
        amount: number;
      }[]
    >(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_reservations_idempotency_key").on(t.idempotencyKey),
    index("credit_reservations_status_idx").on(t.status),
    index("credit_reservations_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Model registry foundation (Phase 3 wires the UI; admin seeds it now)
// ---------------------------------------------------------------------------

export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  /** Adapter id used by Phase 3: anthropic | openai | gemini | openai-compatible | mock. */
  adapter: text("adapter").notNull(),
  baseUrl: text("base_url"),
  enabled: boolean("enabled").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [uniqueIndex("providers_slug_key").on(t.slug)]);

/** AES-256-GCM envelope columns (never leaves the server). */
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("provider_credentials_provider_key").on(t.providerId)],
);

export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** API-facing model id, e.g. "claude-sonnet-5-5". */
    slug: text("slug").notNull(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    category: modelCategoryEnum("category").notNull(),
    status: modelStatusEnum("status").notNull().default("available"),
    capabilities: jsonb("capabilities")
      .$type<{ vision: boolean; tools: boolean; reasoning: boolean; streaming?: boolean; json?: boolean }>()
      .notNull(),
    contextWindow: integer("context_window"),
    maxOutput: integer("max_output"),
    /** Platform markup on provider cost, per model (spec §6). */
    markupPct: integer("markup_pct").notNull().default(15),
    /** Cheapest plan allowed to call this model. */
    minPlanId: text("min_plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    sourceUrl: text("source_url"),
    notes: text("notes"),
    /** Unverified seeds ship inactive; admin verifies then enables. */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("models_slug_key").on(t.slug),
    index("models_provider_idx").on(t.providerId),
    index("models_active_idx").on(t.active),
  ],
);

/** Provider list prices in micro-USD per 1M tokens (no floats for money). */
export const modelPricing = pgTable("model_pricing", {
  modelId: uuid("model_id")
    .primaryKey()
    .references(() => models.id, { onDelete: "cascade" }),
  inputUsdMicroPerMTok: bigint("input_usd_micro_per_mtok", {
    mode: "number",
  }).notNull(),
  outputUsdMicroPerMTok: bigint("output_usd_micro_per_mtok", {
    mode: "number",
  }).notNull(),
  cachedUsdMicroPerMTok: bigint("cached_usd_micro_per_mtok", { mode: "number" }),
  reasoningUsdMicroPerMTok: bigint("reasoning_usd_micro_per_mtok", {
    mode: "number",
  }),
  currency: text("currency").notNull().default("USD"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const modelPlanEligibility = pgTable(
  "model_plan_eligibility",
  {
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.planId] })],
);

// ---------------------------------------------------------------------------
// User chat (Phase 4)
// ---------------------------------------------------------------------------

/** User API credentials are one-way hashed; plaintext is only returned once. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    monthlyLimitCredits: bigint("monthly_limit_credits", { mode: "number" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_key").on(t.keyHash),
    index("api_keys_user_created_idx").on(t.userId, t.createdAt),
    index("api_keys_user_revoked_idx").on(t.userId, t.revokedAt),
  ],
);

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_conversations_user_updated_idx").on(t.userId, t.updatedAt),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    modelId: uuid("model_id").references(() => models.id, { onDelete: "set null" }),
    status: chatMessageStatusEnum("status").notNull().default("complete"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    reasoningOutputTokens: integer("reasoning_output_tokens"),
    creditsCharged: bigint("credits_charged", { mode: "number" })
      .notNull()
      .default(0),
    creditReservationId: uuid("credit_reservation_id").references(
      () => creditReservations.id,
      { onDelete: "set null" },
    ),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    requestKey: text("request_key"),
    providerRequestId: text("provider_request_id"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("chat_messages_api_key_created_idx").on(t.apiKeyId, t.createdAt),
    index("chat_messages_model_created_idx").on(t.modelId, t.createdAt),
    uniqueIndex("chat_messages_request_key_key").on(t.requestKey),
  ],
);


// ---------------------------------------------------------------------------
// Commerce foundation (checkout arrives in Phase 7; grants work today)
// ---------------------------------------------------------------------------

export const topupPacks = pgTable("topup_packs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  pricePaise: integer("price_paise").notNull(),
  credits: bigint("credits", { mode: "number" }).notNull(),
  bonusCredits: bigint("bonus_credits", { mode: "number" }).notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: paymentKindEnum("kind").notNull(),
    /** "manual" until Razorpay lands in Phase 7. */
    provider: text("provider").notNull().default("manual"),
    status: paymentStatusEnum("status").notNull().default("created"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    reference: text("reference"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("payments_user_idx").on(t.userId)],
);

/** Webhook idempotency (spec §14). Razorpay events land here in Phase 7. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload"),
    status: webhookEventStatusEnum("status").notNull().default("received"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_provider_event_key").on(t.provider, t.eventId)],
);

/** One referral per invitee; rewards are written with its unique ID as ledger ref. */
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviterUserId: uuid("inviter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    inviteeUserId: uuid("invitee_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: text("status").notNull().default("pending"),
    rewardCredits: bigint("reward_credits", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("referrals_invitee_key").on(t.inviteeUserId),
    index("referrals_inviter_created_idx").on(t.inviterUserId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Platform settings + audit
// ---------------------------------------------------------------------------

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_actor_idx").on(t.actorUserId),
  ],
);

// ---------------------------------------------------------------------------
// User workspace preferences, inbox, support and product feedback
// ---------------------------------------------------------------------------

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  phone: text("phone"),
  defaultModel: text("default_model"),
  maxOutputTokens: integer("max_output_tokens").notNull().default(8192),
  timezone: text("timezone").notNull().default("UTC"),
  notifications: jsonb("notifications").$type<Record<string, boolean>>().notNull().default({
    usageAlerts: true, lowBalance: true, paymentReceipts: true, securityAlerts: true, planChanges: true, productUpdates: false,
  }),
  usageAlertPercent: integer("usage_alert_percent").notNull().default(80),
  lowBalanceCredits: integer("low_balance_credits").notNull().default(500),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userNotifications = pgTable("user_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: text("category").notNull().default("alert"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("user_notifications_inbox_idx").on(t.userId, t.createdAt)]);

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  category: text("category").notNull().default("general"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("support_tickets_user_updated_idx").on(t.userId, t.updatedAt)]);

export const supportMessages = pgTable("support_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorRole: text("author_role").notNull().default("user"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("support_messages_ticket_created_idx").on(t.ticketId, t.createdAt)]);

export const userFeedback = pgTable("user_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  category: text("category").notNull().default("other"),
  message: text("message").notNull().default(""),
  attachments: jsonb("attachments").$type<{ name: string; mediaType: string; dataBase64: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("user_feedback_user_created_idx").on(t.userId, t.createdAt)]);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type WalletBucket = typeof walletBuckets.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type CreditReservation = typeof creditReservations.$inferSelect;
export type ModelRow = typeof models.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type BucketType = (typeof bucketTypeEnum.enumValues)[number];
export type TxType = (typeof txTypeEnum.enumValues)[number];
