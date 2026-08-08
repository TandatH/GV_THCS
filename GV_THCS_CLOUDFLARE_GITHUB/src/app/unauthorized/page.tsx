"use client";

import { ArrowLeft, ShieldX } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button, Card } from "@/components/ui";

export default function UnauthorizedPage() {
  const router = useRouter();
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <Card className="w-full max-w-lg p-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <ShieldX className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">Không có quyền truy cập</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Tài khoản của bạn không có vai trò phù hợp cho trang này. Quyền truy cập được kiểm tra bằng Firebase Authentication và Custom Claims.
        </p>
        <Button className="mt-6" variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
      </Card>
    </main>
  );
}
