"use client";

import { CheckCircle2, Database, RefreshCcw, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, getCountFromServer, query } from "firebase/firestore";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";

const setupItems = [
  { collectionName: "schoolYears", label: "Năm học", href: "/admin/school-years" },
  { collectionName: "departments", label: "Bộ môn", href: "/admin/departments" },
  { collectionName: "subjects", label: "Môn học", href: "/admin/subjects" },
  { collectionName: "campuses", label: "Cơ sở", href: "/admin/campuses" },
  { collectionName: "rooms", label: "Phòng học", href: "/admin/rooms" },
  { collectionName: "classes", label: "Lớp học", href: "/admin/classes" },
  { collectionName: "semesters", label: "Học kỳ", href: "/admin/semesters" },
  { collectionName: "timeSlots", label: "Tiết học", href: "/admin/time-slots" },
  { collectionName: "teachers", label: "Giáo viên", href: "/admin/teachers" },
] as const;

type SetupCount = {
  collectionName: string;
  count: number;
};

async function loadCollectionCount(collectionName: string) {
  const snapshot = await getCountFromServer(query(collection(firestore, collectionName)));
  return snapshot.data().count;
}

export default function AdminSetupPage() {
  const [counts, setCounts] = useState<SetupCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all(
      setupItems.map(async (item) => ({
        collectionName: item.collectionName,
        count: await loadCollectionCount(item.collectionName),
      })),
    )
      .then((nextCounts) => {
        if (active) setCounts(nextCounts);
      })
      .catch((loadError) => {
        if (active) setError(firebaseDataErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const incompleteCount = setupItems.filter((item) => (counts.find((count) => count.collectionName === item.collectionName)?.count ?? 0) === 0).length;

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Thiết lập ban đầu"
          title="Tiến độ cấu hình hệ thống"
          description="Hoàn thành cấu hình các danh mục theo thứ tự trước khi xếp thời khóa biểu và vận hành các nghiệp vụ giảng dạy."
          actions={
            <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCcw className="h-4 w-4" />
              Làm mới
            </Button>
          }
        />

        {error ? (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!error && !loading && incompleteCount > 0 ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Hệ thống chưa hoàn tất thiết lập. Vui lòng hoàn thành các danh mục trước khi xếp thời khóa biểu.
          </div>
        ) : null}

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-lg font-bold">Danh mục thiết lập theo quy trình</h2>
            <p className="mt-1 text-sm text-muted-foreground">Danh mục các thành phần cần khởi tạo trước khi vận hành giảng dạy.</p>
          </div>
          <div className="divide-y divide-border">
            {setupItems.map((item, index) => {
              const count = counts.find((row) => row.collectionName === item.collectionName)?.count ?? 0;
              const configured = count > 0;
              return (
                <div key={item.collectionName} className="grid gap-4 px-5 py-4 sm:grid-cols-[56px_1fr_auto_auto] sm:items-center sm:px-6">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-sm font-bold">{index + 1}</div>
                  <div>
                    <p className="font-semibold">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {loading ? "Đang kiểm tra..." : `${count} bản ghi`}
                    </p>
                  </div>
                  {loading ? (
                    <Skeleton className="h-7 w-28" />
                  ) : (
                    <Badge tone={configured ? "success" : "warning"}>{configured ? "Đã có dữ liệu" : "Chưa thiết lập"}</Badge>
                  )}
                  <Button asChild variant={configured ? "secondary" : "primary"}>
                    <Link href={item.href}>
                      {configured ? <CheckCircle2 className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
                      Thiết lập
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Quy trình thiết lập chuẩn</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Khởi tạo năm học trước, sau đó thiết lập bộ môn, môn học, cơ sở, phòng học, lớp học, học kỳ, tiết học và hồ sơ giáo viên.
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Settings2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Lưu ý khi vận hành</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Khi tất cả danh mục hiển thị trạng thái đã có dữ liệu, hệ thống sẽ sẵn sàng cho việc phân công chuyên môn và xếp thời khóa biểu.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </Shell>
    </RoleGuard>
  );
}
