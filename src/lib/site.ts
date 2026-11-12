export const site = {
  name: "NEXORAO",
  shortName: "NEXORAO",
  tagline: "One account. One credit wallet. Every frontier model.",
  description:
    "NEXORAO is a multi-model AI platform: chat, compare and build with Claude, GPT, Gemini and open-source models through one account and one credit wallet. Official APIs only, with transparent per-request pricing.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

/**
 * Marketing navigation. Entries marked `soon` are informational footer items;
 * shipped API/MCP entry points link to live documentation.
 */
export interface NavItem {
  label: string;
  href?: string;
  soon?: boolean;
}

export const mainNav: NavItem[] = [
  { label: "Models", href: "/models" },
  { label: "Pricing", href: "/pricing" },
  { label: "API docs", href: "/docs" },
  { label: "MCP", href: "/docs#mcp" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Product",
    items: [
      { label: "Model explorer", href: "/models" },
      { label: "Pricing", href: "/pricing" },
      { label: "AI chat", href: "/dashboard/chat" },
      { label: "API docs", href: "/docs" },
      { label: "MCP server", href: "/docs#mcp" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "About", soon: true },
      { label: "Contact", soon: true },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Terms", soon: true },
      { label: "Privacy", soon: true },
      { label: "Refund policy", soon: true },
    ],
  },
];
