"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { AppLogo } from "@/components/app-logo";
import { Button, Card } from "@/components/ui";

export default function UnauthorizedPage() {
  const router = useRouter();
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <Card className="w-full max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-sm border border-slate-100">
          <AppLogo className="h-full w-full object-contain" />
        </div>
        <h1 className="mt-2 text-2xl font-bold">Không có quyền truy cập</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Tài khoản của bạn không có quyền truy cập vào trang này. Vui lòng liên hệ ban quản trị nếu bạn cần được cấp quyền.
        </p>
        <Button className="mt-6" variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Phát triển bởi <span className="font-semibold text-slate-800">TanDat_HCMUTE</span>
        </p>
      </Card>
    </main>
  );
}
