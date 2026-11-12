"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Copy, LoaderCircle, LockKeyhole, QrCode, X } from "lucide-react";
import { formatLocalPrice, formatMinorCurrency } from "@/components/currency/currency-provider";

type BillingConfig = { usdInrRate: number; minTopupInr: number; maxTopupInr: number; orderExpiryMinutes: number; razorpayReady: boolean; devSimulationAvailable: boolean; country: string; currency: string; locale: string; exchangeRate: number; exchangeRateDate: string };
type Order = { provider: "razorpay" | "mock"; checkoutMode?: "qr" | "hosted"; paymentId: string; orderId: string; keyId?: string; qrImageUrl?: string; amount: number; currency: string; locale?: string; exchangeRate?: number; reference: string; baseInr: number; creditUsd: number; expiresAt: string; name: string; description: string; prefill: { name: string; email: string } };
type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = { key: string; order_id: string; amount: number; currency: string; name: string; description: string; prefill: { name: string; email: string }; handler: (value: RazorpayResult) => void | Promise<void>; modal?: { ondismiss?: () => void }; theme?: { color: string } };
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => { open: () => void; on: (event: string, callback: (payload: unknown) => void) => void } } }

export function BalanceTopupButton({ initialAmountInr, label = "Add balance", className, autoOpen = false, hideTrigger = false, pageMode = false }: { initialAmountInr?: number; label?: string; className?: string; autoOpen?: boolean; hideTrigger?: boolean; pageMode?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [amount, setAmount] = useState(initialAmountInr ?? 500);
  const [coupon, setCoupon] = useState("");
  const [couponStatus, setCouponStatus] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [stage, setStage] = useState<"amount" | "payment" | "success" | "expired" | "review">("amount");
  const [busy, setBusy] = useState(false);
  const [utr, setUtr] = useState("");
  const [utrMessage, setUtrMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || config) return;
    const locationHeaders = { "x-user-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone, "x-user-locale": navigator.languages.join(",") };
    void fetch("/api/billing/config", { cache: "no-store", headers: locationHeaders }).then(async (response) => {
      const payload = await response.json() as BillingConfig & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Checkout settings could not be loaded.");
      setConfig(payload);
      setAmount((current) => initialAmountInr ? Math.max(payload.minTopupInr, Math.ceil(initialAmountInr)) : Math.max(payload.minTopupInr, current));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Checkout settings could not be loaded."));
  }, [open, config, initialAmountInr]);

  useEffect(() => {
    if (!open || !order || stage !== "payment") return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/billing/orders/${order.paymentId}`, { cache: "no-store" });
        const payload = await response.json() as { status?: string };
        if (!response.ok || stopped) return;
        if (payload.status === "paid") { setStage("success"); router.refresh(); }
        else if (payload.status === "needs_review") setStage("review");
        else if (["failed", "expired", "refunded"].includes(payload.status ?? "")) setStage("expired");
      } catch { /* keep polling while the checkout stays open */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 4_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [open, order, stage, router]);

  function close() {
    if (pageMode) { router.push("/dashboard/wallet"); return; }
    setOpen(false); setOrder(null); setStage("amount"); setError(""); setUtrMessage("");
  }

  async function openGatewayCheckout(newOrder: Order) {
    if (!window.Razorpay) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Secure checkout could not load. Check your connection and retry."));
        document.body.appendChild(script);
      });
    }
    if (!window.Razorpay || !newOrder.keyId) throw new Error("Secure checkout is not configured.");
    const checkout = new window.Razorpay({
      key: newOrder.keyId, order_id: newOrder.orderId, amount: newOrder.amount, currency: newOrder.currency,
      name: newOrder.name, description: newOrder.description, prefill: newOrder.prefill,
      handler: async (result) => {
        const response = await fetch("/api/payments/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result) });
        const payload = await response.json() as { error?: string; needsReview?: boolean };
        if (!response.ok) throw new Error(payload.error ?? "Payment verification is still pending.");
        setStage(payload.needsReview ? "review" : "success");
        router.refresh();
      },
      modal: { ondismiss: () => setBusy(false) }, theme: { color: "#8b5cf6" },
    });
    checkout.on("payment.failed", (payload) => {
      const detail = payload && typeof payload === "object" ? payload as { error?: { description?: string } } : {};
      setError(detail.error?.description ?? "The payment did not complete. Your balance was not changed.");
      setBusy(false);
    });
    checkout.open();
  }

  async function createOrder(event: React.FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/billing/orders", { method: "POST", headers: { "content-type": "application/json", "x-user-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone, "x-user-locale": navigator.languages.join(",") }, body: JSON.stringify({ method: "upi", amountInr: amount, couponCode: coupon.trim() || undefined }) });
      const payload = await response.json() as Order & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not start checkout.");
      setOrder(payload); setStage("payment");
      if (payload.provider === "razorpay" && payload.checkoutMode !== "qr" && !payload.qrImageUrl) await openGatewayCheckout(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start checkout."); }
    finally { setBusy(false); }
  }

  async function applyCoupon() {
    setCouponStatus(""); setError("");
    const response = await fetch("/api/billing/coupons/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: coupon }) });
    const payload = await response.json() as { error?: string; valid?: boolean };
    setCouponStatus(payload.valid ? "Coupon applied." : payload.error ?? "Coupon is invalid.");
  }

  async function simulatePayment() {
    if (!order) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/billing/orders/${order.paymentId}/simulate`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not simulate payment.");
      setStage("success"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not simulate payment."); }
    finally { setBusy(false); }
  }

  async function submitUtr(event: React.FormEvent) {
    event.preventDefault(); if (!order) return;
    setUtrMessage("");
    const response = await fetch(`/api/billing/orders/${order.paymentId}/utr`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ utr }) });
    const payload = await response.json() as { message?: string; error?: string };
    setUtrMessage(response.ok ? payload.message ?? "Reference saved." : payload.error ?? "Reference could not be saved.");
  }

  async function changeAmount() {
    if (order) await fetch(`/api/billing/orders/${order.paymentId}`, { method: "DELETE" });
    setOrder(null); setStage("amount"); setUtr(""); setUtrMessage(""); setError("");
  }

  async function copyReference() {
    if (!order) return;
    await navigator.clipboard.writeText(order.reference); setCopied(true); window.setTimeout(() => setCopied(false), 1200);
  }

  const min = config?.minTopupInr ?? 500;
  const currencySettings = config ? { country: config.country, currency: config.currency, locale: config.locale, rate: config.exchangeRate, asOf: config.exchangeRateDate } : { country: "IN", currency: "INR", locale: "en-IN", rate: 1, asOf: null };
  const amountMinor = order?.amount ?? amount * 100;
  const localAmount = formatLocalPrice(amount, currencySettings);
  const localDigits = new Intl.NumberFormat("en", { style: "currency", currency: currencySettings.currency }).resolvedOptions().maximumFractionDigits;

  const panel = <section role={pageMode ? "region" : "dialog"} aria-modal={pageMode ? undefined : true} aria-labelledby="balance-modal-title" className={`flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-bg-1 ${pageMode ? "max-w-2xl shadow-[var(--shadow-glass)]" : "max-h-[min(90dvh,900px)] max-w-[650px] shadow-2xl"}`}>
        <header className="flex shrink-0 items-start justify-between border-b border-line px-5 py-4"><div><h2 id="balance-modal-title" className="text-base font-semibold text-text-0">Add balance</h2><p className="mt-1 text-xs text-text-2">Funds appear after your payment has been verified.</p></div><button type="button" aria-label={pageMode ? "Back to wallet" : "Close"} onClick={close} className="rounded-lg p-1.5 text-text-2 hover:bg-[var(--glass-bg-hover)] hover:text-text-0"><X className="size-4" /></button></header>
        <div className="min-h-0 overflow-y-auto p-5">
          {stage === "amount" ? <form onSubmit={(event) => void createOrder(event)} className="space-y-5">
            <div className="rounded-xl border border-violet/20 bg-violet/5 p-3"><p className="text-sm font-semibold text-text-0">{currencySettings.currency === "INR" ? "UPI / QR through Razorpay" : "Razorpay international checkout"}</p><p className="mt-1 text-xs leading-relaxed text-text-2">{currencySettings.currency === "INR" ? "GPay, PhonePe and other UPI apps appear in secure checkout when enabled for this merchant." : "Razorpay shows the payment options enabled for your region and account."}</p></div>
            <div><label htmlFor="topup-amount" className="text-xs font-semibold text-text-0">Amount ({currencySettings.currency})</label><div className="mt-2 flex flex-wrap gap-2">{[500, 1000, 1500, 2000, 5000].filter((item) => item >= min).map((item) => <button key={item} type="button" onClick={() => setAmount(item)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${amount === item ? "border-violet bg-violet/10 text-text-0" : "border-line text-text-1 hover:border-violet/30"}`}>{formatLocalPrice(item, currencySettings)}</button>)}</div><div className="mt-2 flex items-center rounded-xl border border-line bg-bg-0 px-3"><span className="text-sm text-text-2">{new Intl.NumberFormat(currencySettings.locale, { style: "currency", currency: currencySettings.currency }).formatToParts(0).find((part) => part.type === "currency")?.value}</span><input id="topup-amount" type="number" min={(min * currencySettings.rate).toFixed(localDigits)} max={((config?.maxTopupInr ?? 100000) * currencySettings.rate).toFixed(localDigits)} step={localDigits ? "0.01" : "1"} value={(amount * currencySettings.rate).toFixed(localDigits)} onChange={(event) => setAmount(Math.round(Number(event.target.value) / currencySettings.rate))} className="h-11 w-full bg-transparent px-2 text-sm tabular-nums text-text-0 outline-none" /></div><p className="mt-1.5 text-[11px] text-text-2">Minimum {formatLocalPrice(min, currencySettings)} · converted using the latest available reference rate.</p></div>
            <div><label htmlFor="topup-coupon" className="text-xs font-semibold text-text-0">Coupon <span className="font-normal text-text-2">(optional)</span></label><div className="mt-2 flex gap-2"><input id="topup-coupon" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} maxLength={40} placeholder="E.G. NEXORA10" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg-0 px-3 font-mono text-xs text-text-0 outline-none placeholder:text-text-2 focus:border-violet/50" /><button type="button" disabled={!coupon.trim()} onClick={() => void applyCoupon()} className="rounded-xl border border-line px-3 text-xs font-semibold text-text-0 disabled:opacity-40">Apply</button></div>{couponStatus ? <p role="status" className="mt-1.5 text-xs text-text-2">{couponStatus}</p> : null}</div>
            <div className="rounded-xl border border-line bg-bg-0/70 p-4"><div className="flex justify-between text-sm"><span className="text-text-1">You pay</span><span className="font-semibold tabular-nums text-text-0">{localAmount}</span></div><div className="mt-2 flex justify-between text-sm"><span className="text-text-1">Credited to balance</span><span className="font-semibold tabular-nums text-success">{Math.round(amount * 100).toLocaleString("en-IN")} credits</span></div></div>
            {error ? <p role="alert" className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p> : null}
            {!config?.razorpayReady && config?.devSimulationAvailable ? <p className="text-[11px] leading-relaxed text-warn">Development checkout is in simulation mode. No real payment will be sent or collected.</p> : null}
            {!config?.razorpayReady && !config?.devSimulationAvailable ? <p className="text-[11px] leading-relaxed text-warn">Add the Razorpay merchant keys to enable live payment collection.</p> : null}
            <button type="submit" disabled={!config || busy || amount < min || amount > (config.maxTopupInr)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-text-0 text-sm font-semibold text-bg-0 shadow-[0_8px_24px_rgba(127,92,255,.18)] disabled:cursor-not-allowed disabled:opacity-40">{busy || !config ? <LoaderCircle className="size-4 animate-spin" /> : null}{busy ? "Creating secure order…" : !config ? "Loading secure checkout…" : `Continue to payment · ${localAmount}`}</button>
          </form> : null}

          {stage === "payment" && order ? <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-line bg-bg-0/70 p-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-text-2">Amount to pay</p><p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-text-0">{formatMinorCurrency(amountMinor, order.currency, order.locale ?? currencySettings.locale)}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-[10px] font-semibold text-success"><LockKeyhole className="size-3" /> Fixed amount</span></div>
            <div className="mx-auto grid justify-items-center text-center">{order.qrImageUrl ? <Image unoptimized src={order.qrImageUrl} alt="Single use Razorpay UPI QR code for this exact payment" width={240} height={240} referrerPolicy="no-referrer" className="size-[240px] rounded-2xl border-[6px] border-white bg-white object-contain shadow-[0_12px_36px_rgba(127,92,255,.18)]" /> : <div className="grid size-20 place-items-center rounded-2xl border border-violet/20 bg-violet/10 text-violet"><QrCode className="size-10" /></div>}<h3 className="mt-3 text-sm font-semibold text-text-0">{order.qrImageUrl ? "Scan with any UPI app" : "Secure Razorpay checkout"}</h3><p className="mt-1 max-w-sm text-xs leading-relaxed text-text-2">{order.qrImageUrl ? `${formatMinorCurrency(amountMinor, order.currency, order.locale ?? currencySettings.locale)} is fixed for this order.` : "The verified payment gateway will open its secure payment options. Keep this order window open."}</p></div>
            {order.qrImageUrl ? <p className="text-center text-[11px] text-warn">Please pay the exact amount shown; the paise suffix identifies your order.</p> : null}
            <div className="rounded-xl border border-violet/20 bg-violet/5 p-3 text-xs leading-relaxed text-text-1"><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-success align-middle" />Waiting for your payment… {Math.round(amount * 100).toLocaleString("en-IN")} credits are added after the gateway verifies it. Orders expire after {config?.orderExpiryMinutes ?? 15} minutes.</div>
            {order.provider === "mock" ? <div className="rounded-xl border border-warn/25 bg-warn/5 p-3"><p className="text-xs leading-relaxed text-warn">Development simulator only. This will add test credits without collecting money.</p><button type="button" onClick={() => void simulatePayment()} disabled={busy} className="mt-3 w-full rounded-lg border border-warn/30 px-3 py-2 text-xs font-semibold text-warn disabled:opacity-50">{busy ? "Simulating…" : "Simulate payment (development)"}</button></div> : null}
            {order.qrImageUrl ? <form onSubmit={(event) => void submitUtr(event)}><label htmlFor="utr-input" className="text-xs font-semibold text-text-0">Paid already? Add the UPI reference <span className="font-normal text-text-2">(optional)</span></label><div className="mt-2 flex gap-2"><input id="utr-input" value={utr} onChange={(event) => setUtr(event.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" placeholder="12–20 digit UTR / transaction ID" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg-0 px-3 font-mono text-xs text-text-0 outline-none placeholder:text-text-2" /><button type="submit" disabled={utr.length < 12} className="rounded-lg border border-line px-3 text-xs font-semibold text-text-0 disabled:opacity-40">Submit</button></div>{utrMessage ? <p role="status" className="mt-2 text-[11px] text-text-2">{utrMessage}</p> : <p className="mt-1 text-[10px] text-text-2">Submitting a reference only helps support match a transfer. It never credits funds by itself.</p>}</form> : null}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4"><button type="button" onClick={() => void changeAmount()} className="text-xs font-semibold text-violet hover:underline">← Change amount</button><button type="button" onClick={() => void copyReference()} className="inline-flex items-center gap-1 font-mono text-[10px] text-text-2 hover:text-text-0">{copied ? "Copied" : order.reference}<Copy className="size-3" /></button></div>
            {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
          </div> : null}

          {stage === "success" ? <div className="grid justify-items-center py-12 text-center"><span className="grid size-14 place-items-center rounded-full bg-success/10 text-success"><Check className="size-7" /></span><h3 className="mt-4 text-xl font-semibold text-text-0">Credits added to your balance</h3><p className="mt-2 text-sm text-text-2">Your verified payment has been credited.</p><button type="button" onClick={close} className="mt-6 rounded-xl bg-text-0 px-7 py-2.5 text-sm font-semibold text-bg-0">Done</button></div> : null}
          {stage === "expired" ? <div className="space-y-4 py-8 text-center"><span className="text-sm font-semibold text-warn">This payment window expired</span><p className="mx-auto max-w-sm text-xs leading-relaxed text-text-2">If you already paid, share the UPI reference with support for reconciliation. The reference alone will not credit your wallet.</p>{order ? <form onSubmit={(event) => void submitUtr(event)} className="mx-auto max-w-md text-left"><label htmlFor="expired-utr-input" className="text-xs font-semibold text-text-0">Paid already? Add the UPI reference <span className="font-normal text-text-2">(optional)</span></label><div className="mt-2 flex gap-2"><input id="expired-utr-input" value={utr} onChange={(event) => setUtr(event.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" placeholder="12–20 digit UTR / transaction ID" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg-0 px-3 font-mono text-xs text-text-0 outline-none placeholder:text-text-2" /><button type="submit" disabled={utr.length < 12} className="rounded-lg border border-line px-3 text-xs font-semibold text-text-0 disabled:opacity-40">Submit</button></div>{utrMessage ? <p role="status" className="mt-2 text-[11px] text-text-2">{utrMessage}</p> : null}</form> : null}<button type="button" onClick={() => { setStage("amount"); setOrder(null); setError(""); }} className="rounded-xl bg-text-0 px-5 py-2.5 text-sm font-semibold text-bg-0">Start over</button></div> : null}
          {stage === "review" ? <div className="grid justify-items-center py-10 text-center"><span className="text-sm font-semibold text-warn">Payment needs a review</span><p className="mt-2 max-w-sm text-xs leading-relaxed text-text-2">The payment arrived late or its amount did not match this order. No balance was credited automatically. Support will review the reference.</p><button type="button" onClick={close} className="mt-5 rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-text-0">Close</button></div> : null}
        </div>
      </section>;

  return <>
    {!hideTrigger ? <button type="button" onClick={() => { setAmount(initialAmountInr ?? config?.minTopupInr ?? 500); setOpen(true); }} className={className ?? "inline-flex h-10 items-center justify-center rounded-xl bg-text-0 px-4 text-sm font-semibold text-bg-0 shadow-[0_8px_24px_rgba(127,92,255,.18)]"}>{label}</button> : null}
    {open ? pageMode ? <div className="mx-auto w-full py-4">{panel}</div> : typeof document !== "undefined" ? createPortal(<div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>{panel}</div>, document.body) : null : null}
  </>;
}
