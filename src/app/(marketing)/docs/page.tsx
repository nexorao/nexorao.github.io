import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/code-block";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Developer docs", description: "Use the NEXORAO API and MCP server." };

const curl = `curl ${site.url}/v1/chat/completions \\
  -H "Authorization: Bearer $NEXORA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"Hello"}]}'`;

const python = `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["NEXORA_API_KEY"],
    base_url="${site.url}/v1",
)

response = client.chat.completions.create(
    model="MODEL_ID",
    messages=[{"role": "user", "content": "Hello from NEXORA"}],
)
print(response.choices[0].message.content)`;

const streaming = `const response = await fetch("${site.url}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.NEXORA_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "MODEL_ID",
    messages: [{ role: "user", content: "Stream a response" }],
    stream: true,
  }),
});
// Read response.body as Server-Sent Events (SSE).`;

const mcpConfig = JSON.stringify({ mcpServers: { nexora: { url: `${site.url}/mcp`, headers: { Authorization: "Bearer <YOUR_NEXORA_API_KEY>" } } } }, null, 2);

export default function DocsPage() {
  return <article className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet">Developer documentation</p>
    <h1 className="mt-4 text-4xl font-semibold tracking-tight text-text-0 sm:text-5xl">Build with NEXORA.</h1>
    <p className="mt-4 max-w-3xl text-base leading-7 text-text-1">One account, one credit wallet and one API for the models enabled on your plan. The API is compatible with the OpenAI chat completions request and response shape.</p>

    <section id="authentication" className="mt-12 scroll-mt-24 border-t border-line pt-8"><h2 className="text-2xl font-semibold text-text-0">Authentication</h2><p className="mt-3 text-sm leading-6 text-text-1">Create an API key in your dashboard. NEXORA stores only its SHA-256 hash and shows the secret once. Send it as a Bearer token from a server or trusted backend; never embed it in browser JavaScript, a mobile app, or source control.</p><p className="mt-3 rounded-xl border border-line bg-bg-1 px-4 py-3 font-mono text-xs text-text-1">Authorization: Bearer nx_live_…</p></section>

    <section className="mt-10 border-t border-line pt-8"><h2 className="text-2xl font-semibold text-text-0">Chat completions</h2><p className="mt-3 text-sm text-text-1">POST to <code className="text-violet">/v1/chat/completions</code>. Choose an active model ID from the <a className="text-violet" href="/models">model catalog</a>, or query <code className="text-violet">GET /v1/models</code> using the same Bearer key. Model availability and billing are checked on the server for every request.</p><div className="mt-5"><CodeBlock code={curl} language="bash" /></div></section>

    <section className="mt-10 border-t border-line pt-8"><h2 className="text-2xl font-semibold text-text-0">Python</h2><p className="mt-3 text-sm text-text-1">The standard OpenAI Python SDK can target the NEXORA base URL.</p><div className="mt-5"><CodeBlock code={python} language="python" /></div></section>

    <section className="mt-10 border-t border-line pt-8"><h2 className="text-2xl font-semibold text-text-0">Streaming</h2><p className="mt-3 text-sm text-text-1">Set <code className="text-violet">stream: true</code> to receive OpenAI-style SSE chunks followed by <code className="text-violet">[DONE]</code>. The usage chunk is sent after provider settlement.</p><div className="mt-5"><CodeBlock code={streaming} language="typescript" /></div></section>

    <section className="mt-10 border-t border-line pt-8"><h2 className="text-2xl font-semibold text-text-0">Billing, errors and limits</h2><ul className="mt-4 flex flex-col gap-3 text-sm leading-6 text-text-1"><li>• Credits are reserved before the provider call and reconciled against provider token usage afterward.</li><li>• Insufficient wallet credits return HTTP 402. Invalid keys return 401; unavailable models return 404; rate limits return 429.</li><li>• Set a per-key monthly cap in Dashboard → API keys. Revoking a key takes effect on its next request.</li><li>• Never retry a streamed response after it starts without considering that a completed provider response may already have been billed.</li></ul></section>

    <section id="mcp" className="mt-10 scroll-mt-24 border-t border-line pt-8"><h2 className="text-2xl font-semibold text-text-0">MCP server</h2><p className="mt-3 text-sm leading-6 text-text-1">NEXORA provides a Streamable HTTP MCP endpoint at <code className="text-violet">{site.url}/mcp</code>. Configure your MCP client with that URL and a NEXORA API key as the Bearer token. Tools include model discovery, usage lookup, and billable chat completion. Keep the key in your local MCP client secrets/config and do not commit it.</p><div className="mt-5"><CodeBlock code={mcpConfig} language="json" title="Streamable HTTP client config (illustrative)" /></div></section>
  </article>;
}
