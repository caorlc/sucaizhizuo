"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "xs";
}

export default function CopyButton({
  text,
  className,
  size = "xs",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 老浏览器降级
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // 静默
      } finally {
        ta.remove();
      }
    }
  };

  const sizeClass = size === "sm" ? "text-sm px-2.5 py-1" : "text-xs px-2 py-1";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`${sizeClass} rounded transition-colors ${
        copied
          ? "bg-green-50 text-green-600"
          : "bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700"
      } ${className ?? ""}`}
    >
      {copied ? "✓ 已复制" : "复制"}
    </button>
  );
}
