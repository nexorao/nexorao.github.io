"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

type CheckoutInput = { kind: "topup"; packId: string } | { kind: "subscription"; planId: string; billingCycle: "monthly" | "annual" };
type CheckoutOrder = { provider?: "razorpay" | "mock"; paymentId?: string; keyId: string; orderId: string; amount: number; currency: string; name: string; description: string; prefill: { name: string; email: string } };
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type CheckoutOptions = { key: string; order_id: string; amount: number; currency: string; name: string; description: string; prefill: { name: string; email: string }; handler: (response: CheckoutResponse) => void | Promise<void>; modal?: { ondismiss?: () => void }; theme?: { color: string } };

declare global { interface Window { Razorpay?: new (options: CheckoutOptions) => { open: () => void; on: (event: string, callback: (payload: unknown) => void) => void } } }

export function PaymentCheckoutButton({ input, label, className }: { input: CheckoutInput; label: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mockPaymentId, setMockPaymentId] = useState<string | null>(null);

  async function startCheckout() {
    setBusy(true);
    setMessage("");
    try {
      const orderResponse = await fetch("/api/payments/order", { method: "POST", headers: { "content-type": "application/json", "x-user-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone, "x-user-locale": navigator.languages.join(",") }, body: JSON.stringify(input) });
      const orderPayload = await orderResponse.json() as CheckoutOrder & { error?: string };
      if (!orderResponse.ok) throw new Error(orderPayload.error ?? "Could not start checkout.");
      if (orderPayload.provider === "mock" && orderPayload.paymentId) {
        setMockPaymentId(orderPayload.paymentId);
        setMessage("Development simulator only. No real payment was sent.");
        setBusy(false);
        return;
      }
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Payment checkout could not load. Check your connection and retry."));
          document.body.appendChild(script);
        });
      }
      if (!window.Razorpay) throw new Error("Payment checkout did not initialize.");
      const checkout = new window.Razorpay({
        key: orderPayload.keyId,
        order_id: orderPayload.orderId,
        amount: orderPayload.amount,
        currency: orderPayload.currency,
        name: orderPayload.name,
        description: orderPayload.description,
        prefill: orderPayload.prefill,
        handler: async (response) => {
          try {
            const verify = await fetch("/api/payments/verify", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify(response),
            });
            const payload = await verify.json() as { error?: string };
            if (!verify.ok) throw new Error(payload.error ?? "Payment confirmation is still pending.");
            setMessage("Payment confirmed. Your NEXORAO balance or plan has been updated.");
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Payment confirmation is still pending.");
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
        theme: { color: "#8b5cf6" },
      });
      checkout.on("payment.failed", (payload) => {
        const data = payload && typeof payload === "object" ? payload as { error?: { description?: string } } : {};
        setMessage(data.error?.description ?? "The payment did not complete. You have not been charged by NEXORAO.");
        setBusy(false);
      });
      checkout.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  async function simulate() {
    if (!mockPaymentId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/billing/orders/${mockPaymentId}/simulate`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not simulate payment.");
      setMessage("Test payment completed. Your balance or plan was updated."); setMockPaymentId(null); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not simulate payment."); }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-1.5"><button type="button" onClick={startCheckout} disabled={busy} className={className ?? "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-text-0 px-4 text-sm font-semibold text-bg-0 disabled:opacity-60"}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}{busy ? "Opening checkout…" : label}</button>{mockPaymentId ? <button type="button" onClick={() => void simulate()} disabled={busy} className="rounded-lg border border-warn/30 px-2.5 py-1.5 text-[10px] font-semibold text-warn disabled:opacity-50">{busy ? "Simulating…" : "Simulate payment (dev only)"}</button> : null}{message ? <span role="status" className="max-w-xs text-xs leading-5 text-text-2">{message}</span> : null}</div>;
}
