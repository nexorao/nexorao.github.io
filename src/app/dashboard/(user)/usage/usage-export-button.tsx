"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Row = { date: string; model: string; status: string; inputTokens: number; outputTokens: number; credits: number; latencyMs: number | "" };

export function UsageExportButton({ rows }: { rows: Row[] }) {
  function exportCsv() {
    const fields: (keyof Row)[] = ["date", "model", "status", "inputTokens", "outputTokens", "credits", "latencyMs"];
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [fields.join(","), ...rows.map((row) => fields.map((field) => quote(row[field])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nexora-usage.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <Button variant="outline" onClick={exportCsv}><Download className="size-4" /> Export CSV</Button>;
}
