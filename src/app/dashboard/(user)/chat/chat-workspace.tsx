"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowUp, Bot, Check, ChevronDown, Code2, Copy, FileImage, LoaderCircle, MessageSquare, PanelLeftClose,
  PanelLeftOpen, Plus, Search, Settings2, Sparkles, Square, Trash2, X,
} from "lucide-react";
import type { ChatModelOption } from "@/lib/chat/queries";
import { ProviderLogo } from "@/components/models/provider-logo";

interface ConversationOption { id: string; title: string; updatedAt: Date }
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "failed";
  creditsCharged?: number;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  createdAt?: Date | string;
}
interface ImageDraft { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string; name: string }
type TabKey = "Create" | "Explore" | "Code" | "Prompts";
const suggestions: Record<TabKey, string[]> = {
  Create: ["Write a short story about a robot learning to dream", "Help me draft a professional email declining a meeting", "Create a weekly meal plan for a vegetarian family of four"],
  Explore: ["Explain a surprising idea in astronomy", "Compare two approaches to learning a new language", "Help me understand how a neural network learns"],
  Code: ["Build a responsive pricing card in React", "Review this function for edge cases", "Explain a clean way to structure an API route"],
  Prompts: ["Act as a thoughtful writing coach and improve my draft", "Turn my notes into a clear project plan", "Ask me questions to help shape a new product idea"],
};

export function ChatWorkspace({
  models: initialModels,
  conversations: initialConversations,
  chatEnabled: initialChatEnabled,
  initialError,
  initialModelId,
  initialMaxOutputTokens,
  isAdmin,
}: {
  models: ChatModelOption[];
  conversations: ConversationOption[];
  chatEnabled: boolean;
  initialError: string | null;
  initialModelId?: string;
  initialMaxOutputTokens?: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [models, setModels] = useState(initialModels);
  const [conversations, setConversations] = useState(initialConversations);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modelId, setModelId] = useState(initialModels.find((item) => item.id === initialModelId)?.id ?? initialModels.find((item) => item.id === "claude-haiku-5-5")?.id ?? initialModels[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(initialMaxOutputTokens ?? 16_384);
  const [chatEnabled, setChatEnabled] = useState(initialChatEnabled);
  const [catalogError, setCatalogError] = useState(initialError);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCharge, setLastCharge] = useState<number | null>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(true);
  const [codeOpen, setCodeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("Create");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [image, setImage] = useState<ImageDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const [clockNow, setClockNow] = useState(0);
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const selectorRef = useRef<HTMLInputElement>(null);
  const activeModel = models.find((item) => item.id === modelId) ?? models.find((item) => item.id === "claude-haiku-5-5") ?? models[0];
  const filteredModels = useMemo(() => models.filter((item) => `${item.name} ${item.provider} ${item.id}`.toLowerCase().includes(modelSearch.toLowerCase())), [models, modelSearch]);
  const filteredConversations = useMemo(() => conversations.filter((item) => item.title.toLowerCase().includes(chatSearch.toLowerCase())), [conversations, chatSearch]);
  const canSend = Boolean(activeModel && chatEnabled && activeModel.status === "active" && !activeModel.locked && activeModel.providerReady && prompt.trim() && !sending && !catalogError);
  const codeCurl = `curl ${typeof window === "undefined" ? "https://nexora.ai" : window.location.origin}/api/v1/chat/completions \\\n+  -H "Authorization: Bearer $NEXORA_API_KEY" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{"model":"${activeModel?.id ?? "claude-haiku-5-5"}","messages":[{"role":"user","content":"Hello"}],"temperature":${temperature},"max_tokens":${maxTokens}}'`;

  useEffect(() => {
    const saved = localStorage.getItem("nexora-playground-settings");
    if (!saved) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const value = JSON.parse(saved) as { modelId?: string; systemPrompt?: string; temperature?: number; topP?: number; maxTokens?: number };
        if (!initialModelId && value.modelId && initialModels.some((item) => item.id === value.modelId)) setModelId(value.modelId);
        if (typeof value.systemPrompt === "string") setSystemPrompt(value.systemPrompt);
        if (typeof value.temperature === "number") setTemperature(value.temperature);
        if (typeof value.topP === "number") setTopP(value.topP);
        if (typeof value.maxTokens === "number") setMaxTokens(value.maxTokens);
      } catch { localStorage.removeItem("nexora-playground-settings"); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialModels, initialModelId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setClockNow(Date.now()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    localStorage.setItem("nexora-playground-settings", JSON.stringify({ modelId, systemPrompt, temperature, topP, maxTokens }));
  }, [modelId, systemPrompt, temperature, topP, maxTokens]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);
  useEffect(() => { if (selectorOpen) selectorRef.current?.focus(); }, [selectorOpen]);

  async function retryCatalog() {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await fetch("/api/chat/models", { cache: "no-store" });
      const payload = await response.json() as { models?: ChatModelOption[]; chatEnabled?: boolean; error?: string };
      if (!response.ok || !payload.models?.length) throw new Error(payload.error ?? "The catalog is empty. Retry in a moment.");
      setModels(payload.models);
      setChatEnabled(Boolean(payload.chatEnabled));
      setModelId((current) => payload.models?.some((item) => item.id === current) ? current : payload.models?.find((item) => item.id === "claude-haiku-5-5")?.id ?? payload.models?.[0]?.id ?? "");
    } catch (cause) { setCatalogError(cause instanceof Error ? cause.message : "The model catalog could not be loaded."); }
    finally { setCatalogLoading(false); }
  }

  function startNewConversation() {
    if (sending) return;
    setConversationId(null); setMessages([]); setPrompt(""); setImage(null); setError(null); setLastCharge(null); setLeftOpen(false);
    promptRef.current?.focus();
  }

  async function openConversation(id: string) {
    if (sending) return;
    setConversationId(id); setMessages([]); setError(null); setLeftOpen(false);
    try {
      const response = await fetch(`/api/chat/${id}`, { cache: "no-store" });
      const payload = await response.json() as { messages?: ChatMessage[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load this conversation.");
      setMessages(payload.messages ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this conversation."); }
  }

  async function deleteConversation(id: string) {
    const response = await fetch(`/api/chat/${id}`, { method: "DELETE" });
    if (!response.ok) { setError("Could not delete this chat."); return; }
    setConversations((rows) => rows.filter((item) => item.id !== id));
    if (conversationId === id) startNewConversation();
    router.refresh();
  }

  async function clearAll() {
    if (!conversations.length || sending) return;
    const response = await fetch("/api/chat/conversations", { method: "DELETE" });
    if (!response.ok) { setError("Could not clear your chats."); return; }
    setConversations([]); setConversationId(null); setMessages([]); setError(null); router.refresh();
  }

  async function deleteMessage(messageId: string) {
    const response = await fetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
    if (!response.ok) { setError("Could not delete this message."); return; }
    setMessages((rows) => rows.filter((item) => item.id !== messageId));
    router.refresh();
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true); window.setTimeout(() => setCopied(false), 1400);
  }

  async function sendMessage(event?: React.FormEvent, textOverride?: string) {
    event?.preventDefault();
    const text = (textOverride ?? prompt).trim();
    if (!text || !activeModel || !canSend) return;
    setPrompt(""); setImage(null); setError(null); setLastCharge(null); setSending(true);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, status: "complete", createdAt: new Date() };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", status: "streaming", model: activeModel.name, createdAt: new Date() };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    const abortController = new AbortController(); abortRef.current = abortController;
    let activeConversationId = conversationId;
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ conversationId, model: activeModel.id, prompt: text, requestKey: crypto.randomUUID(), temperature, topP, maxOutputTokens: maxTokens, systemPrompt, image: image ? { mediaType: image.mediaType, data: image.data } : undefined }),
        signal: abortController.signal,
      });
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error ?? "The message could not be sent."); }
      if (!response.body) throw new Error("The response stream could not be opened.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      const handleFrame = (frame: string) => {
        const lines = frame.split(/\r?\n/);
        const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
        const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (!eventName || !data) return;
        const payload = JSON.parse(data) as Record<string, unknown>;
        if (eventName === "conversation" && typeof payload.conversationId === "string") { activeConversationId = payload.conversationId; setConversationId(payload.conversationId); }
        else if (eventName === "delta" && typeof payload.text === "string") setMessages((rows) => rows.map((item) => item.id === assistantMessage.id ? { ...item, content: item.content + payload.text } : item));
        else if (eventName === "complete") {
          if (typeof payload.creditsCharged === "number") setLastCharge(payload.creditsCharged);
          setMessages((rows) => rows.map((item) => item.id === assistantMessage.id ? { ...item, status: "complete" } : item));
        } else if (eventName === "error") {
          setError(typeof payload.message === "string" ? payload.message : "The response could not be completed.");
          setMessages((rows) => rows.map((item) => item.id === assistantMessage.id ? { ...item, status: "failed" } : item));
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary !== -1) { const frame = buffer.slice(0, boundary); const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0].length ?? 2; buffer = buffer.slice(boundary + separator); handleFrame(frame); boundary = buffer.search(/\r?\n\r?\n/); }
        if (done) break;
      }
      if (buffer.trim()) handleFrame(buffer);
      if (activeConversationId) setConversations((rows) => [{ id: activeConversationId!, title: text.replace(/\s+/g, " ").slice(0, 72), updatedAt: new Date() }, ...rows.filter((row) => row.id !== activeConversationId)].slice(0, 30));
      router.refresh();
    } catch (cause) {
      const stopped = cause instanceof Error && cause.name === "AbortError";
      setError(stopped ? "Response stopped. The unused credit hold was returned." : cause instanceof Error ? cause.message : "The message could not be sent.");
      setMessages((rows) => rows.map((item) => item.id === assistantMessage.id ? { ...item, status: "failed" } : item));
    } finally { abortRef.current = null; setSending(false); }
  }

  function chooseImage(file: File | undefined) {
    if (!file || !activeModel?.capabilities.vision || !activeModel.imageInputSupported) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a PNG, JPEG, WebP or GIF image under 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      setImage({ mediaType: file.type as ImageDraft["mediaType"], data: result.split(",")[1] ?? "", name: file.name });
    };
    reader.onerror = () => setError("This image could not be opened.");
    reader.readAsDataURL(file);
  }

  const launchPlaceholder = !chatEnabled
    ? "Chat is currently unavailable on this deployment."
    : activeModel?.locked ? `Upgrade to ${activeModel.minPlanId} to use this model.`
      : !activeModel?.providerReady ? "Provider connection required before sending."
        : "Message the model… (Shift + Enter for a new line)";

  return (
    <section className="relative -mx-4 -my-5 flex h-[calc(100dvh-8.5rem)] min-h-[620px] overflow-hidden border-y border-line bg-bg-0 md:-mx-7 md:-my-7 lg:left-1/2 lg:mx-0 lg:w-[calc(100vw-255px)] lg:-translate-x-1/2">
      {leftOpen ? <button aria-label="Close chat list" className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setLeftOpen(false)} /> : null}
      <aside className={`absolute inset-y-0 left-0 z-50 flex w-[258px] shrink-0 flex-col border-r border-line bg-bg-1 transition-transform lg:relative lg:z-auto lg:translate-x-0 ${leftOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${leftCollapsed ? "lg:hidden" : ""}`}>
        <div className="flex h-[58px] items-center justify-between border-b border-line px-4">
          <span className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-violet/15 text-violet"><Sparkles className="size-4" /></span><span className="text-sm font-semibold text-text-0">Playground</span></span>
          <button type="button" aria-label="Close chat list" className="rounded-md p-1 text-text-2 hover:text-text-0 lg:hidden" onClick={() => setLeftOpen(false)}><X className="size-4" /></button>
          <button type="button" aria-label="New chat" className="rounded-md p-1.5 text-text-2 hover:bg-[var(--glass-bg-hover)] hover:text-text-0" onClick={startNewConversation}><Plus className="size-4" /></button>
        </div>
        <div className="p-3">
          <button type="button" onClick={startNewConversation} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-text-0 text-sm font-semibold text-bg-0 shadow-[0_6px_22px_rgba(139,92,246,.18)]"><Plus className="size-4" /> New chat</button>
          <label className="mt-2.5 flex h-9 items-center gap-2 rounded-lg border border-line bg-bg-0/70 px-3 text-text-2"><Search className="size-3.5 shrink-0" /><input aria-label="Search chats" value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats" className="w-full bg-transparent text-xs text-text-0 outline-none placeholder:text-text-2" /></label>
        </div>
        <div className="flex items-center justify-between px-4 pb-2 text-[11px] text-text-2"><span>{conversations.length} {conversations.length === 1 ? "conversation" : "conversations"}</span><button type="button" onClick={() => void clearAll()} disabled={!conversations.length} className="text-danger hover:underline disabled:opacity-40">Clear all</button></div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {filteredConversations.map((row) => (
            <div key={row.id} className={`group flex items-center gap-1 rounded-xl border px-2 py-2 transition-colors ${conversationId === row.id ? "border-violet/30 bg-violet/10" : "border-transparent hover:bg-[var(--glass-bg-hover)]"}`}>
              <button type="button" onClick={() => void openConversation(row.id)} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-2"><MessageSquare className="size-3.5 shrink-0 text-violet" /><span className="truncate text-xs font-medium text-text-0">{row.title}</span></span><span className="ml-5 mt-1 block truncate text-[10px] text-text-2">{activeModel?.name ?? "Nexora model"} · {relativeTime(row.updatedAt, clockNow)}</span></button>
              <button type="button" aria-label={`Delete ${row.title}`} title="Delete chat" onClick={() => void deleteConversation(row.id)} className="rounded-md p-1 text-text-2 opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
          {!filteredConversations.length ? <p className="px-3 py-4 text-xs leading-relaxed text-text-2">{conversations.length ? "No chats match your search." : "Your conversations will appear here."}</p> : null}
        </div>
        <div className="flex items-center justify-between border-t border-line px-3 py-3 text-xs"><Link href="/dashboard" className="flex items-center gap-1.5 font-medium text-text-1 hover:text-text-0"><ArrowLeft className="size-3.5" /> Dashboard</Link><Link href="/" className="text-text-2 hover:text-text-0">Website ↗</Link></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-20 flex min-h-[58px] flex-wrap items-center justify-between gap-2 border-b border-line bg-bg-0/95 px-3 py-2 backdrop-blur md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" aria-label="Toggle conversations" className="rounded-lg p-2 text-text-2 hover:bg-[var(--glass-bg-hover)] hover:text-text-0" onClick={() => { setLeftOpen((value) => !value); setLeftCollapsed((value) => !value); }}><PanelLeftOpen className="size-4 lg:hidden" />{leftCollapsed ? <PanelLeftOpen className="hidden size-4 lg:block" /> : <PanelLeftClose className="hidden size-4 lg:block" />}</button>
            <div className="relative">
              <button type="button" role="combobox" aria-expanded={selectorOpen} aria-controls="model-options" onClick={() => { setSelectorOpen((value) => !value); setModelSearch(""); setHighlightedModelIndex(Math.max(0, filteredModels.findIndex((item) => item.id === modelId))); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSelectorOpen(true); selectorRef.current?.focus(); } }} className="flex max-w-[220px] items-center gap-2 rounded-xl border border-line bg-bg-1 px-2.5 py-2 text-xs font-semibold text-text-0 hover:border-violet/40 sm:max-w-none">
                <ProviderMark provider={activeModel?.provider ?? "N"} modelId={activeModel?.id} /><span className="max-w-32 truncate sm:max-w-48">{activeModel?.name ?? "Loading models…"}</span><ChevronDown className="size-3.5 text-text-2" />
              </button>
              {selectorOpen ? <div id="model-options" role="listbox" aria-label="Available models" className="absolute left-0 top-full z-40 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-line bg-bg-1 shadow-2xl">
                <div className="border-b border-line p-2"><label className="flex items-center gap-2 rounded-lg border border-line bg-bg-0 px-3 py-2"><Search className="size-3.5 text-text-2" /><input ref={selectorRef} value={modelSearch} onChange={(event) => { setModelSearch(event.target.value); setHighlightedModelIndex(0); }} onKeyDown={(event) => { if (event.key === "Escape") setSelectorOpen(false); if (event.key === "ArrowDown") { event.preventDefault(); setHighlightedModelIndex((index) => Math.min(Math.max(0, filteredModels.length - 1), index + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setHighlightedModelIndex((index) => Math.max(0, index - 1)); } if (event.key === "Enter" && filteredModels[highlightedModelIndex]) { event.preventDefault(); setModelId(filteredModels[highlightedModelIndex].id); setSelectorOpen(false); } }} aria-activedescendant={filteredModels[highlightedModelIndex] ? `model-option-${filteredModels[highlightedModelIndex].id}` : undefined} className="w-full bg-transparent text-xs text-text-0 outline-none" placeholder="Search models" aria-label="Search models" /></label></div>
                <div className="max-h-[55vh] overflow-y-auto p-1.5">{filteredModels.map((option) => {
                  const launching = option.id === "claude-haiku-5-5" && !chatEnabled;
                  const highlighted = filteredModels.indexOf(option) === highlightedModelIndex;
                  return <button key={option.id} id={`model-option-${option.id}`} type="button" role="option" aria-selected={option.id === modelId} onMouseEnter={() => setHighlightedModelIndex(filteredModels.indexOf(option))} onClick={() => { setModelId(option.id); setMaxTokens((value) => Math.min(value, option.maxOutput)); setSelectorOpen(false); }} className={`w-full rounded-xl border p-3 text-left transition-colors ${option.id === modelId ? "border-violet/40 bg-violet/10" : highlighted ? "border-line bg-[var(--glass-bg-hover)]" : "border-transparent hover:bg-[var(--glass-bg-hover)]"}`}>
                    <div className="flex items-start gap-2.5"><ProviderMark provider={option.provider} modelId={option.id} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-text-0">{option.name}</span>{launching ? <Badge>Chat unavailable</Badge> : option.locked ? <Badge>Locked · upgrade</Badge> : option.status !== "active" ? <Badge>Coming soon</Badge> : null}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-text-2">{option.id} · {option.provider}</span><span className="mt-1 block text-[11px] leading-relaxed text-text-2">{option.description}</span><CapabilityBadges model={option} compact /></span></div>
                  </button>;
                })}{filteredModels.length === 0 ? <p className="p-4 text-xs text-text-2">No model matches that search.</p> : null}</div>
              </div> : null}
            </div>
            <div className="hidden items-center gap-1.5 xl:flex"><CapabilityBadges model={activeModel} compact /></div>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <button type="button" onClick={() => setParamsOpen((value) => !value)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 hover:bg-[var(--glass-bg-hover)] ${paramsOpen ? "text-violet" : "text-text-1"}`}><Settings2 className="size-3.5" /><span className="hidden sm:inline">Parameters</span></button>
            <button type="button" onClick={() => setCodeOpen(true)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-text-1 hover:bg-[var(--glass-bg-hover)] hover:text-text-0"><Code2 className="size-3.5" /><span className="hidden sm:inline">Get code</span></button>
            <button type="button" onClick={() => { setMessages([]); setError(null); if (conversationId) void deleteConversation(conversationId); else setConversationId(null); }} className="rounded-lg border border-line px-2.5 py-2 font-medium text-text-1 hover:text-text-0">Clear</button>
            <button type="button" aria-label="Toggle parameters" className="rounded-lg p-2 text-text-2 hover:text-text-0 xl:hidden" onClick={() => setParamsOpen((value) => !value)}><Settings2 className="size-4" /></button>
          </div>
        </header>

        {catalogError ? <div role="alert" className="flex items-center justify-between gap-3 border-b border-danger/20 bg-danger/5 px-4 py-2 text-xs text-danger"><span>{catalogError}</span><button type="button" onClick={() => void retryCatalog()} disabled={catalogLoading} className="inline-flex shrink-0 items-center gap-1 font-semibold underline">{catalogLoading ? <LoaderCircle className="size-3 animate-spin" /> : null}Retry</button></div> : null}
        {!chatEnabled && activeModel?.id === "claude-haiku-5-5" ? <div className="flex items-center gap-2 border-b border-violet/20 bg-violet/5 px-4 py-2 text-xs text-violet"><Sparkles className="size-3.5 shrink-0" />Chat is currently unavailable on this deployment. Try again later.</div> : null}
        {isAdmin && chatEnabled && activeModel && !activeModel.providerReady ? <div role="alert" className="flex items-center justify-between gap-3 border-b border-warn/20 bg-warn/5 px-4 py-2 text-xs text-warn"><span>{activeModel.provider} is not configured. Save and enable its upstream API key before requests can run.</span><Link href="/dashboard/admin/providers" className="shrink-0 font-semibold underline">Provider settings</Link></div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
          {messages.length ? <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-6">
            {messages.map((message) => <article key={message.id} className={`group flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`grid size-8 shrink-0 place-items-center rounded-xl ${message.role === "assistant" ? "bg-violet/15 text-violet" : "bg-[var(--glass-bg-hover)] text-text-1"}`}>{message.role === "assistant" ? <Bot className="size-4" /> : <span className="text-[10px] font-bold">You</span>}</div>
              <div className={`min-w-0 max-w-[88%] ${message.role === "user" ? "text-right" : "flex-1"}`}>
                <div className={`inline-block max-w-full rounded-2xl px-4 py-3 text-left ${message.role === "user" ? "bg-violet/15 text-text-0" : "text-text-0"}`}>
                  {message.role === "assistant" ? <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-text-0">{message.model ?? activeModel?.name ?? "Nexora"}</span><span className="font-mono text-[10px] text-text-2">{message.inputTokens || message.outputTokens ? `${(message.inputTokens ?? 0) + (message.outputTokens ?? 0)} tokens` : ""}{message.latencyMs ? ` · ${message.latencyMs} ms` : ""}{message.createdAt ? ` · ${formatMessageTime(message.createdAt)}` : ""}</span></div> : null}
                  <MarkdownMessage content={message.content || (message.status === "streaming" ? "Thinking…" : "")} onCopy={copy} />
                  {message.status === "streaming" ? <LoaderCircle className="mt-2 size-4 animate-spin text-violet" /> : null}
                  {message.status === "failed" ? <p className="mt-2 text-xs text-warn">The response did not finish.</p> : null}
                  {message.creditsCharged ? <p className="mt-2 text-[10px] text-text-2">{message.creditsCharged.toLocaleString()} credits</p> : null}
                </div>
                {message.status !== "streaming" ? <div className={`mt-1.5 flex gap-3 text-[10px] text-text-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${message.role === "user" ? "justify-end" : ""}`}><button type="button" onClick={() => void copy(message.content)} className="hover:text-text-0"><Copy className="mr-1 inline size-3" />Copy</button>{message.role === "assistant" ? <button type="button" onClick={() => { const previous = messages[messages.indexOf(message) - 1]; if (previous?.role === "user") void sendMessage(undefined, previous.content); }} className="hover:text-text-0">Regenerate</button> : null}<button type="button" onClick={() => void deleteMessage(message.id)} className="hover:text-danger"><Trash2 className="mr-1 inline size-3" />Delete</button></div> : null}
              </div>
            </article>)}
            <div ref={bottomRef} />
          </div> : <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center py-10 text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-violet/25 bg-violet/10 text-violet"><ProviderMark provider={activeModel?.provider ?? "N"} modelId={activeModel?.id} large /></div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-0 md:text-3xl">What should we build today?</h1>
            <p className="mt-2 max-w-xl text-sm text-text-2">{activeModel ? `Chatting with ${activeModel.name} · usage bills to your plan` : "Choose a model to explore the Nexora Playground."}</p>
            <div role="tablist" aria-label="Prompt suggestions" className="mt-6 inline-flex rounded-xl border border-line bg-bg-1 p-1">{(["Create", "Explore", "Code", "Prompts"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${activeTab === tab ? "bg-bg-3 text-text-0" : "text-text-2 hover:text-text-0"}`}>{tab}</button>)}</div>
            <div className="mt-3 grid w-full gap-2">{suggestions[activeTab].map((item) => <button key={item} type="button" onClick={() => { setPrompt(item); promptRef.current?.focus(); }} className="rounded-xl border border-line bg-bg-1 px-4 py-3 text-left text-sm text-text-1 transition-colors hover:border-violet/30 hover:bg-[var(--glass-bg-hover)] hover:text-text-0">{item}</button>)}</div>
          </div>}
          {error ? <p role="alert" className="mx-auto mt-2 max-w-4xl rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p> : null}
        </div>

        {lastCharge !== null ? <p className="px-5 pb-1 text-right text-[10px] text-text-2">This response used {lastCharge.toLocaleString()} credits.</p> : null}
        <form onSubmit={(event) => void sendMessage(event)} className="border-t border-line bg-bg-0 px-3 py-3 md:px-6 md:py-4">
          <div className="mx-auto max-w-4xl rounded-2xl border border-line-strong bg-bg-1 p-3 transition-colors focus-within:border-violet/55 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,.12)]">
            {image ? <div className="mb-2 flex w-fit items-center gap-2 rounded-lg border border-line bg-bg-0 p-1.5"><FileImage className="size-4 text-violet" /><span className="max-w-44 truncate text-xs text-text-1">{image.name}</span><button type="button" onClick={() => setImage(null)} aria-label="Remove image" className="rounded p-1 text-text-2 hover:text-danger"><X className="size-3.5" /></button></div> : null}
            <textarea ref={promptRef} value={prompt} onChange={(event) => { setPrompt(event.target.value); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 220)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} disabled={Boolean(catalogError) || !activeModel || Boolean(activeModel.locked) || activeModel.status !== "active" || !chatEnabled || sending} rows={1} placeholder={launchPlaceholder} className="max-h-[220px] min-h-12 w-full resize-none bg-transparent px-1 py-2 text-sm leading-6 text-text-0 outline-none placeholder:text-text-2 disabled:cursor-not-allowed" aria-label="Message the selected model" />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-text-2">
                <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => chooseImage(event.target.files?.[0])} />
                <button type="button" disabled={!activeModel?.capabilities.vision || !activeModel.imageInputSupported || !chatEnabled} title={activeModel?.capabilities.vision && activeModel.imageInputSupported ? "Attach an image" : "Image input is not supported by this model adapter"} onClick={() => imageRef.current?.click()} className="rounded-lg p-2 text-text-2 hover:bg-[var(--glass-bg-hover)] hover:text-text-0 disabled:cursor-not-allowed disabled:opacity-40"><FileImage className="size-4" /></button>
                <button type="button" aria-pressed={searchEnabled} onClick={() => setSearchEnabled((value) => !value)} className={`rounded-full border px-2.5 py-1.5 ${searchEnabled ? "border-violet/40 bg-violet/10 text-violet" : "border-line text-text-2 hover:text-text-0"}`}><Search className="mr-1 inline size-3" />Search</button>
                <span className="hidden sm:inline">temp {temperature.toFixed(1)} · max {maxTokens.toLocaleString()} tokens{searchEnabled ? " · web search unavailable" : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                {sending ? <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-text-1 hover:text-text-0"><Square className="mr-1 inline size-3" />Stop</button> : null}
                <button type="submit" aria-label="Send message" disabled={!canSend} className="grid size-10 place-items-center rounded-xl bg-violet text-white shadow-[0_6px_18px_rgba(139,92,246,.25)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp className="size-4" /></button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-text-2">Models can make mistakes. Chats are saved in your account.</p>
        </form>
      </div>

      {paramsOpen ? <>
        <button type="button" aria-label="Close parameters panel" onClick={() => setParamsOpen(false)} className="fixed inset-0 z-30 bg-black/55 xl:hidden" />
        <aside className="absolute inset-y-0 right-0 z-40 flex w-[min(88vw,310px)] flex-col border-l border-line bg-bg-1 shadow-2xl xl:relative xl:z-auto xl:w-[286px] xl:shadow-none">
          <div className="flex h-[58px] items-center justify-between border-b border-line px-4"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-2">Model</span><button type="button" aria-label="Close parameters panel" onClick={() => setParamsOpen(false)} className="rounded-md p-1 text-text-2 hover:text-text-0 xl:hidden"><X className="size-4" /></button></div>
          {activeModel ? <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-line p-4"><div className="flex items-center gap-3"><ProviderMark provider={activeModel.provider} modelId={activeModel.id} large /><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-text-0">{activeModel.name}</h2><p className="mt-1 truncate font-mono text-[10px] text-text-2">{activeModel.id}</p></div></div><p className="mt-3 text-xs leading-relaxed text-text-1">{activeModel.description}</p><CapabilityBadges model={activeModel} /><div className="mt-3 flex justify-between text-[11px] text-text-2"><span>Context</span><span className="font-semibold text-text-0">{activeModel.contextWindow ? `${(activeModel.contextWindow / 1000).toLocaleString()}K tokens` : "Not listed"}</span></div><button type="button" onClick={() => setSelectorOpen(true)} className="mt-4 h-9 w-full rounded-lg border border-line text-xs font-semibold text-text-0 hover:border-violet/40">Change model</button></div>
            <div className="space-y-4 border-b border-line p-4"><RangeControl label="Temperature" min={0} max={2} step={0.1} value={temperature} display={temperature.toFixed(1)} onChange={setTemperature} /><RangeControl label="Max output tokens" min={256} max={Math.min(activeModel.maxOutput, 128_000)} step={256} value={Math.min(maxTokens, activeModel.maxOutput)} display={Math.min(maxTokens, activeModel.maxOutput).toLocaleString()} onChange={setMaxTokens} /><RangeControl label="Top P" min={0} max={1} step={0.05} value={topP} display={topP.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} onChange={setTopP} /></div>
            <div className="border-b border-line p-4"><label htmlFor="system-prompt" className="text-xs font-semibold text-text-0">System prompt</label><textarea id="system-prompt" value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} placeholder="e.g. You are a concise senior engineer. Answer with code first." className="mt-2 h-32 w-full resize-y rounded-xl border border-line bg-bg-0 p-3 text-xs leading-relaxed text-text-0 outline-none placeholder:text-text-2 focus:border-violet/50" /></div>
            <Link href="/dashboard/usage" className="flex items-center justify-between p-4 text-xs font-medium text-violet hover:text-text-0">Playground usage <ArrowUp className="size-3.5 rotate-45" /></Link>
          </div> : <div className="p-4 text-xs text-text-2">Model details will appear here.</div>}
        </aside>
      </> : null}

      {codeOpen ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCodeOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="code-title" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-bg-1 shadow-2xl"><header className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 id="code-title" className="font-semibold text-text-0">Use this model in your app</h2><p className="mt-1 text-xs text-text-2">Your API key stays in your server environment.</p></div><button type="button" aria-label="Close code dialog" onClick={() => setCodeOpen(false)} className="rounded-md p-1.5 text-text-2 hover:text-text-0"><X className="size-4" /></button></header><div className="max-h-[70vh] space-y-4 overflow-y-auto p-5"><CodeSnippet language="cURL" code={codeCurl} /><CodeSnippet language="JavaScript" code={`const response = await fetch("/api/v1/chat/completions", {\n  method: "POST",\n  headers: { Authorization: "Bearer " + process.env.NEXORA_API_KEY, "Content-Type": "application/json" },\n  body: JSON.stringify({ model: "${activeModel?.id ?? "claude-haiku-5-5"}", messages: [{ role: "user", content: "Hello" }], temperature: ${temperature}, max_tokens: ${maxTokens}, system: ${JSON.stringify(systemPrompt)} })\n});`} /><CodeSnippet language="Python" code={`import os, requests\nresponse = requests.post(\n  "https://nexora.ai/api/v1/chat/completions",\n  headers={"Authorization": f"Bearer {os.environ['NEXORA_API_KEY']}"},\n  json={"model": "${activeModel?.id ?? "claude-haiku-5-5"}", "messages": [{"role": "user", "content": "Hello"}], "temperature": ${temperature}, "max_tokens": ${maxTokens}},\n)`} /></div><footer className="flex justify-end border-t border-line p-4"><button type="button" onClick={() => void copy(codeCurl)} className="rounded-lg bg-text-0 px-4 py-2 text-xs font-semibold text-bg-0">{copied ? <Check className="mr-1 inline size-3.5" /> : <Copy className="mr-1 inline size-3.5" />}{copied ? "Copied" : "Copy cURL"}</button></footer></section></div> : null}
    </section>
  );
}

function ProviderMark({ provider, modelId = "", large = false }: { provider: string; modelId?: string; large?: boolean }) {
  return <ProviderLogo provider={provider} modelId={modelId} size={large ? "lg" : "sm"} />;
}

function CapabilityBadges({ model, compact = false }: { model?: ChatModelOption; compact?: boolean }) {
  if (!model) return null;
  const flags = [["Reasoning", model.capabilities.reasoning], ["Vision", model.capabilities.vision], ["Tools", model.capabilities.tools], ["Streaming", model.capabilities.streaming], ["JSON", model.capabilities.json]] as const;
  return <span className={`flex flex-wrap gap-1.5 ${compact ? "mt-1.5" : "mt-3"}`}>{flags.filter(([, enabled]) => enabled).map(([label]) => <span key={label} className="rounded-full border border-line bg-bg-0/60 px-2 py-1 text-[9px] font-medium text-text-1">{label}</span>)}</span>;
}

function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-full border border-violet/25 bg-violet/10 px-2 py-0.5 text-[9px] font-medium text-violet">{children}</span>; }

function RangeControl({ label, min, max, step, value, display, onChange }: { label: string; min: number; max: number; step: number; value: number; display: string; onChange: (value: number) => void }) {
  return <label className="block"><span className="flex items-center justify-between text-xs font-semibold text-text-0"><span>{label}</span><span className="font-mono text-[11px] text-text-1">{display}</span></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 h-1.5 w-full cursor-pointer accent-violet" /></label>;
}

function MarkdownMessage({ content, onCopy }: { content: string; onCopy: (value: string) => void }) {
  const blocks = content.split(/```([^\n]*)\n([\s\S]*?)```/g);
  return <div className="space-y-3 break-words text-sm leading-7">{blocks.map((part, index) => {
    if (index % 3 === 2) return <pre key={index} className="relative overflow-x-auto rounded-xl border border-line bg-bg-0 p-3 font-mono text-xs leading-6 text-text-1"><button type="button" onClick={() => void onCopy(part)} aria-label="Copy code" className="absolute right-2 top-2 rounded-md border border-line bg-bg-1 p-1.5 text-text-2 hover:text-text-0"><Copy className="size-3" /></button><code>{part}</code></pre>;
    if (index % 3 === 1) return null;
    return <p key={index} className="whitespace-pre-wrap">{part.split(/(`[^`]+`)/g).map((fragment, partIndex) => fragment.startsWith("`") && fragment.endsWith("`") ? <code key={partIndex} className="rounded bg-bg-0 px-1.5 py-0.5 font-mono text-[.9em] text-violet">{fragment.slice(1, -1)}</code> : fragment)}</p>;
  })}</div>;
}

function CodeSnippet({ language, code }: { language: string; code: string }) {
  return <div className="overflow-hidden rounded-xl border border-line"><div className="border-b border-line bg-bg-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-2">{language}</div><pre className="max-h-48 overflow-auto bg-bg-0/60 p-3 font-mono text-[11px] leading-5 text-text-1"><code>{code}</code></pre></div>;
}

function relativeTime(value: Date, now: number) {
  if (!now) return "Recent";
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function formatMessageTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}
