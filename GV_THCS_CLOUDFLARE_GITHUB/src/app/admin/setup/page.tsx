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
          title="Checklist dữ liệu nền"
          description="Hoàn thành dữ liệu nền theo đúng thứ tự trước khi xếp thời khóa biểu và vận hành các nghiệp vụ chính."
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
            Hệ thống chưa được thiết lập đầy đủ. Vui lòng hoàn thành dữ liệu nền trước khi xếp lịch.
          </div>
        ) : null}

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-lg font-bold">Thứ tự dữ liệu cần thiết lập</h2>
            <p className="mt-1 text-sm text-muted-foreground">Không tự seed dữ liệu demo vào production.</p>
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
                <p className="font-semibold">Quy trình dữ liệu nền</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Tạo năm học trước, sau đó bộ môn, môn học, cơ sở, phòng, lớp, học kỳ, tiết học và cuối cùng là hồ sơ giáo viên.
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <Settings2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Không dùng dữ liệu demo</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Trang này chỉ kiểm tra số lượng bản ghi hiện có và dẫn đến màn hình quản lý tương ứng, không tự tạo dữ liệu production.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </Shell>
    </RoleGuard>
  );
}
