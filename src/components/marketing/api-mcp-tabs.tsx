"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/ui/code-block";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Reveal } from "@/components/marketing/reveal";
import { CheckCircle2 } from "lucide-react";

const CURL_SNIPPET = `curl https://api.nexora.ai/v1/chat/completions \\
  -H "Authorization: Bearer nx_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-5-5",
    "messages": [
      { "role": "user", "content": "Summarize this changelog" }
    ]
  }'`;

const PYTHON_SNIPPET = `from openai import OpenAI

client = OpenAI(
    base_url="https://api.nexora.ai/v1",
    api_key="nx_live_your_key_here",
)

response = client.chat.completions.create(
    model="gpt-6.1-sol",
    messages=[{"role": "user", "content": "Draft release notes from this diff"}],
)
print(response.choices[0].message.content)`;

const NODE_SNIPPET = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.nexora.ai/v1",
  apiKey: "nx_live_your_key_here",
});

const completion = await client.chat.completions.create({
  model: "gemini-3.8-flash",
  messages: [{ role: "user", content: "Explain this stack trace" }],
});
console.log(completion.choices[0].message.content);`;

const MCP_CONFIG = `{
  "mcpServers": {
    "nexora": {
      "type": "http",
      "url": "https://api.nexora.ai/mcp",
      "headers": {
        "Authorization": "Bearer nx_live_your_mcp_key_here"
      }
    }
  }
}`;

const MCP_TOOLS = [
  "nexora_chat",
  "nexora_list_models",
  "nexora_get_usage",
  "nexora_get_balance",
  "nexora_code_assistant",
  "nexora_compare_models",
];

const API_POINTS = [
  "Bearer auth with scoped, hashed keys (nx_live_…)",
  "Streaming and non-streaming chat completions",
  "Per-key rate limits with standard X-RateLimit headers",
  "Documented error codes: 401, 402, 403, 429, 500, 503",
];

export function ApiMcpTabs() {
  return (
    <section className="nx-container py-20 md:py-28">
      <SectionHeading
        eyebrow="For developers"
        title="Your stack, one endpoint"
        description="Keep the SDKs you already use. NEXORAO speaks the OpenAI wire format and provides an MCP server for agents — both enforced by the same wallet."
      />

      <Reveal className="mt-10">
        <Tabs defaultValue="api" className="mx-auto max-w-3xl">
          <TabsList className="mx-auto">
            <TabsTrigger value="api">OpenAI-compatible API</TabsTrigger>
            <TabsTrigger value="mcp">MCP server</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <CodeBlock code={PYTHON_SNIPPET} language="python" title="python" />
              <CodeBlock code={NODE_SNIPPET} language="javascript" title="node.js" />
            </div>
            <CodeBlock code={CURL_SNIPPET} language="bash" title="cURL" />
            <ul className="mt-1 grid gap-2 text-sm text-text-1 sm:grid-cols-2">
              {API_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-text-2">
              Full reference and per-model parameter support are available in
              the developer docs and playground.
            </p>
          </TabsContent>

          <TabsContent value="mcp" className="flex flex-col gap-4">
            <CodeBlock code={MCP_CONFIG} language="json" title="mcp client config" />
            <div className="glass rounded-xl p-5">
              <p className="text-sm font-semibold text-text-0">Tools exposed</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {MCP_TOOLS.map((tool) => (
                  <li
                    key={tool}
                    className="rounded-sm border border-line bg-[var(--glass-bg)] px-2 py-1 font-mono text-xs text-text-1"
                  >
                    {tool}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs leading-relaxed text-text-2">
              MCP is an integration protocol — it does not unlock provider
              consumer subscriptions or proprietary internal tools. NEXORAO
              issues its own MCP credentials with wallet balance, model and
              tool permissions enforced server-side. Setup examples for Claude
              Desktop, Codex-compatible clients and generic MCP clients are in
              the developer docs.
            </p>
          </TabsContent>
        </Tabs>
      </Reveal>
    </section>
  );
}
