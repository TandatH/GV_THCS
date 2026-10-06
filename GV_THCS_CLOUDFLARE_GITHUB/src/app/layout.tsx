import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { AuthProvider } from "@/features/auth/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Quản lý giáo viên",
    template: "%s | Quản lý giáo viên",
  },
  description: "Hệ thống quản lý giáo viên cơ hữu và thỉnh giảng",
  applicationName: "GV Manager",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
