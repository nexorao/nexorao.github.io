import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<LogoSize, string> = {
  sm: "size-7 rounded-md p-1",
  md: "size-10 rounded-xl p-1.5",
  lg: "size-12 rounded-xl p-1.5",
};

function modelBrand(provider: string, modelId: string) {
  const value = `${provider} ${modelId}`.toLowerCase();
  if (value.includes("anthropic") || value.includes("claude")) {
    return { label: "Claude", src: "/brand/models/claude.png" };
  }
  if (value.includes("openai") || /\bgpt[-\d]/.test(value)) {
    return { label: "OpenAI", src: "/brand/models/openai.png" };
  }
  if (value.includes("gemini") || value.includes("google")) {
    return { label: "Gemini", src: "/brand/models/gemini.png" };
  }
  if (value.includes("deepseek")) {
    return { label: "DeepSeek", src: "/brand/models/deepseek.svg" };
  }
  if (value.includes("moonshot") || value.includes("kimi")) {
    return { label: "Kimi", src: "/brand/models/kimi.svg" };
  }
  if (value.includes("zhipu") || value.includes("glm")) {
    return { label: "GLM", src: "/brand/models/glm.svg" };
  }
  return null;
}

export function ProviderLogo({
  provider,
  modelId = "",
  size = "md",
  className,
}: {
  provider: string;
  modelId?: string;
  size?: LogoSize;
  className?: string;
}) {
  const brand = modelBrand(provider, modelId);

  return (
    <span
      role="img"
      aria-label={brand ? `${brand.label} logo` : `${provider} logo`}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border border-black/5 bg-white",
        SIZE_CLASS[size],
        className,
      )}
    >
      {brand ? (
        <Image
          src={brand.src}
          alt=""
          aria-hidden
          width={256}
          height={256}
          sizes={size === "lg" ? "48px" : size === "md" ? "40px" : "28px"}
          className="size-full object-contain"
        />
      ) : (
        <span aria-hidden className="text-[10px] font-bold text-violet">
          {provider.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
