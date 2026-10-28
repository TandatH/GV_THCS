"use client";

import Link from "next/link";
import { BookOpen, ShieldAlert } from "lucide-react";

import AdminPayrollPage from "@/app/admin/payroll/page";
import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";

export default function BghPayrollPage() {
  const { claims, role, loading } = useAuth();
  const isPrincipal = (role === "bgh" && claims?.bghPosition === "hieutruong") || role === "admin";

  if (!loading && role === "bgh" && !isPrincipal) {
    return (
      <Shell>
        <PageHeader
          eyebrow="Ban Giám Hiệu · Quản lý Chuyên môn"
          title="Chấm công & Lương"
          description="Chức năng quản lý tài chính, thù lao và bảng lương nhân sự."
        />
        <Card className="mx-auto mt-8 max-w-lg p-8 text-center border-amber-200 bg-amber-50/40">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">Giới hạn quyền truy cập</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Tài khoản <span className="font-semibold text-foreground">Phó Hiệu trưởng</span> chỉ phụ trách theo dõi chuyên môn, tổ bộ môn và phân công môn giảng dạy của giáo viên.
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Chức năng đối soát chấm công, thù lao và duyệt bảng lương chỉ dành riêng cho <span className="font-semibold text-foreground">Hiệu trưởng</span> và <span className="font-semibold text-foreground">Quản trị viên</span>.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="secondary">
              <Link href="/bgh/dashboard">Về bảng điều khiển</Link>
            </Button>
            <Button asChild>
              <Link href="/bgh/teachers" className="gap-1.5">
                <BookOpen className="h-4 w-4" />
                Xem phân công chuyên môn
              </Link>
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  return <AdminPayrollPage />;
}
