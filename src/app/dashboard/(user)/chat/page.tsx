import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isAiChatEnabled, listChatModels, listUserConversations } from "@/lib/chat/queries";
import { ensureDailyGrant } from "@/lib/wallet";
import { ChatWorkspace } from "./chat-workspace";

export const metadata: Metadata = { title: "Playground" };

type ChatPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function ChatPage({ searchParams }: ChatPageProps) {
  return (
    <Suspense fallback={<Skeleton className="h-[70vh] w-full" />}>
      <ChatPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ChatPageContent({ searchParams }: ChatPageProps) {
  await connection();
  const query = await searchParams;
  const requestedModelId = typeof query.model === "string" ? query.model : null;
  const user = await getCurrentUser();
  await ensureDailyGrant(user.id);
  const [modelResult, conversationResult, preferenceResult] = await Promise.allSettled([
    listChatModels(user.id),
    listUserConversations(user.id),
    db.select({ defaultModel: userPreferences.defaultModel, maxOutputTokens: userPreferences.maxOutputTokens }).from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1),
  ]);
  const models = modelResult.status === "fulfilled" ? modelResult.value : [];
  const conversations = conversationResult.status === "fulfilled" ? conversationResult.value : [];
  const savedPreferences = preferenceResult.status === "fulfilled" ? preferenceResult.value[0] : undefined;
  const preferredModel = requestedModelId ?? savedPreferences?.defaultModel ?? undefined;
  const initialModelId = preferredModel && models.some((model) => model.id === preferredModel) ? preferredModel : undefined;
  const initialError = modelResult.status === "rejected"
    ? "The model catalog could not be loaded. Use Retry to try again."
    : models.length === 0 ? "The model catalog is empty. Use Retry to try again." : null;
  return <ChatWorkspace models={models} conversations={conversations} chatEnabled={isAiChatEnabled()} initialError={initialError} initialModelId={initialModelId} initialMaxOutputTokens={savedPreferences?.maxOutputTokens} isAdmin={user.isAdmin} />;
}
