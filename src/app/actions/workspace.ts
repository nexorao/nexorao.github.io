"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { supportMessages, supportTickets, userFeedback, userNotifications, userPreferences } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { listChatModels } from "@/lib/chat/queries";

export interface WorkspaceActionState { error?: string; ok?: boolean; }

const notificationKeys = ["usageAlerts", "lowBalance", "paymentReceipts", "securityAlerts", "planChanges", "productUpdates"] as const;

export async function saveWorkspacePreferencesAction(_state: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const user = await requireUser();
  const schema = z.object({
    defaultModel: z.string().trim().max(160),
    maxOutputTokens: z.coerce.number().int().min(16).max(65_536),
    timezone: z.string().trim().min(1).max(80),
    usageAlertPercent: z.coerce.number().int().min(10).max(100),
    lowBalanceCredits: z.coerce.number().int().min(0).max(1_000_000_000),
    notifications: z.array(z.enum(notificationKeys)),
  });
  const parsed = schema.safeParse({
    defaultModel: formData.get("defaultModel") ?? "",
    maxOutputTokens: formData.get("maxOutputTokens"),
    timezone: formData.get("timezone"),
    usageAlertPercent: formData.get("usageAlertPercent"),
    lowBalanceCredits: formData.get("lowBalanceCredits"),
    notifications: formData.getAll("notifications"),
  });
  if (!parsed.success) return { error: "Check the settings and try again." };

  if (parsed.data.defaultModel) {
    const available = await listChatModels(user.id);
    if (!available.some((model) => model.id === parsed.data.defaultModel)) {
      return { error: "Choose a model from the available model list." };
    }
  }
  const notificationPrefs = Object.fromEntries(notificationKeys.map((key) => [key, parsed.data.notifications.includes(key)]));
  await db.insert(userPreferences).values({
    userId: user.id,
    defaultModel: parsed.data.defaultModel || null,
    maxOutputTokens: parsed.data.maxOutputTokens,
    timezone: parsed.data.timezone,
    usageAlertPercent: parsed.data.usageAlertPercent,
    lowBalanceCredits: parsed.data.lowBalanceCredits,
    notifications: notificationPrefs,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: userPreferences.userId,
    set: {
      defaultModel: parsed.data.defaultModel || null,
      maxOutputTokens: parsed.data.maxOutputTokens,
      timezone: parsed.data.timezone,
      usageAlertPercent: parsed.data.usageAlertPercent,
      lowBalanceCredits: parsed.data.lowBalanceCredits,
      notifications: notificationPrefs,
      updatedAt: new Date(),
    },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/chat");
  return { ok: true };
}

export async function markNotificationReadAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return;
  await db.update(userNotifications).set({ isRead: true }).where(and(eq(userNotifications.id, id), eq(userNotifications.userId, user.id)));
  revalidatePath("/dashboard/notifications");
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await db.update(userNotifications).set({ isRead: true }).where(eq(userNotifications.userId, user.id));
  revalidatePath("/dashboard/notifications");
}

export async function createSupportTicketAction(_state: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const user = await requireUser();
  const parsed = z.object({
    subject: z.string().trim().min(4).max(140),
    category: z.enum(["billing", "account", "models", "bug", "general"]),
    message: z.string().trim().min(10).max(5_000),
  }).safeParse({ subject: formData.get("subject"), category: formData.get("category"), message: formData.get("message") });
  if (!parsed.success) return { error: "Add a subject and a message of at least 10 characters." };
  const ticket = await db.transaction(async (tx) => {
    const [created] = await tx.insert(supportTickets).values({ userId: user.id, subject: parsed.data.subject, category: parsed.data.category }).returning({ id: supportTickets.id });
    await tx.insert(supportMessages).values({ ticketId: created.id, body: parsed.data.message, authorRole: "user" });
    return created;
  });
  revalidatePath("/dashboard/support");
  redirect(`/dashboard/support?ticket=${ticket.id}`);
}

export async function replyToSupportTicketAction(_state: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const user = await requireUser();
  const parsed = z.object({ ticketId: z.uuid(), message: z.string().trim().min(2).max(5_000) }).safeParse({
    ticketId: formData.get("ticketId"), message: formData.get("message"),
  });
  if (!parsed.success) return { error: "Enter a message before sending." };
  const [ticket] = await db.select({ id: supportTickets.id, status: supportTickets.status }).from(supportTickets)
    .where(and(eq(supportTickets.id, parsed.data.ticketId), eq(supportTickets.userId, user.id))).limit(1);
  if (!ticket) return { error: "This ticket was not found." };
  await db.transaction(async (tx) => {
    await tx.insert(supportMessages).values({ ticketId: ticket.id, body: parsed.data.message, authorRole: "user" });
    await tx.update(supportTickets).set({ status: "open", updatedAt: new Date() }).where(eq(supportTickets.id, ticket.id));
  });
  revalidatePath(`/dashboard/support?ticket=${ticket.id}`);
  revalidatePath("/dashboard/support");
  return { ok: true };
}

export async function closeSupportTicketAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("ticketId") ?? "");
  if (!z.uuid().safeParse(id).success) return;
  await db.update(supportTickets).set({ status: "resolved", updatedAt: new Date() })
    .where(and(eq(supportTickets.id, id), eq(supportTickets.userId, user.id)));
  revalidatePath("/dashboard/support");
}

export async function submitFeedbackAction(_state: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const user = await requireUser();
  const parsed = z.object({
    rating: z.coerce.number().int().min(1).max(5),
    category: z.enum(["feature idea", "model quality", "speed & reliability", "design & ease of use", "pricing & plans", "something broken", "other"]),
    message: z.string().trim().max(4_000),
  }).safeParse({ rating: formData.get("rating"), category: formData.get("category"), message: formData.get("message") ?? "" });
  if (!parsed.success) return { error: "Choose a rating and check your feedback." };

  const uploads = formData.getAll("screenshots").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (uploads.length > 3 || uploads.some((file) => !file.type.startsWith("image/") || file.size > 200 * 1024)) {
    return { error: "Attach up to three images, each no larger than 200 KB." };
  }
  const attachments = await Promise.all(uploads.map(async (file) => ({
    name: file.name.slice(0, 160),
    mediaType: file.type,
    dataBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  })));
  await db.insert(userFeedback).values({ userId: user.id, rating: parsed.data.rating, category: parsed.data.category, message: parsed.data.message, attachments });
  revalidatePath("/dashboard/feedback");
  redirect("/dashboard/feedback?sent=1");
}
