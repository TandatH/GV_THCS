"use client";

import Image from "next/image";
import logoPic from "../../public/logo.png";

export function AppLogo({ className = "h-full w-full object-contain" }: { className?: string }) {
  return (
    <Image
      src={logoPic}
      alt="Logo trường học"
      className={className}
      priority
    />
  );
}
