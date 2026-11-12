export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "What exactly is a credit?",
    answer:
      "A credit is the unit NEXORA bills in. The default rate is 1 credit = ₹0.01 (configurable by the admin). Every request is priced per token from the model list price plus a platform markup, rounded up to the next whole credit. You always see the estimated cost before sending and the exact cost after the response completes.",
  },
  {
    question: "Which providers and models are available?",
    answer:
      "Claude (Anthropic), GPT (OpenAI), Gemini (Google) and open-source models hosted by authorized providers such as Together, Groq, Fireworks, OpenRouter or your own vLLM/Ollama deployment. Access is through official, authorized APIs only. The model list is a live, admin-managed registry — each entry carries capabilities, pricing and a last-verified date.",
  },
  {
    question: "How does NEXORA keep model access legitimate?",
    answer:
      "Only official provider APIs are used. Consumer-subscription credentials, shared accounts, browser automation and unauthorized gateways are never involved. Provider keys live encrypted on the server and are never exposed to the browser.",
  },
  {
    question: "Do credits expire?",
    answer:
      "It depends on the bucket. Daily free credits reset each day. Promotional credits expire first (nearest expiry is consumed first), then subscription credits at the end of each billing cycle, and purchased credits last the longest. The consumption order is daily free → promotional → subscription → purchased.",
  },
  {
    question: "How is my API key handled?",
    answer:
      "API keys are stored hashed and shown once at creation. Each key carries its own name, expiry, spending limit, allowed models and optional IP allowlist, and can be revoked at any time from the dashboard.",
  },
  {
    question: "How accurate are the prices shown on this site?",
    answer:
      "List prices are taken from official provider documentation and marked with a last-verified date; entries that have not been verified are labeled as such, and scheduled price changes are flagged. USD amounts are converted at a configurable assumption rate for display only — actual billing is always computed server-side at request time.",
  },
];
