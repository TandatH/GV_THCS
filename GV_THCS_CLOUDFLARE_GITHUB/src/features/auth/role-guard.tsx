"use client";

import type { Role } from "@school/shared";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button, Card } from "@/components/ui";

import { useAuth } from "./use-auth";

export function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: readonly Role[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { loading, role, user, authError, signOutUser } = useAuth();
  const allowed = role !== null && allowedRoles.includes(role);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!loading && user && role && !allowed) router.replace("/unauthorized");
  }, [allowed, loading, role, router, user]);

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Đang kiểm tra phiên đăng nhập…
        </div>
      </main>
    );
  }

  if (!role || authError) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-lg p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-xl font-bold">Tài khoản chưa được cấp quyền</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Tài khoản đã đăng nhập thành công nhưng chưa có Custom Claim phù hợp. Vui lòng liên hệ quản trị viên để được cấp quyền.
          </p>
          <Button
            className="mt-6"
            variant="secondary"
            onClick={async () => {
              await signOutUser();
              router.replace("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </Button>
        </Card>
      </main>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
