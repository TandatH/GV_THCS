"use client";

import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Database,
  KeyRound,
  Star,
  UserCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getCountFromServer,
  query,
  where,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Button, Card, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { FirebaseUiError, firebaseDataErrorMessage } from "@/lib/firebase/errors";

const adminDefinitions = [
  { collectionName: "teachers", label: "Giáo viên", icon: UsersRound, tone: "text-blue-600 bg-blue-50" },
  { collectionName: "schedules", label: "Lịch dạy", icon: CalendarDays, tone: "text-violet-600 bg-violet-50" },
  { collectionName: "leaveRequests", label: "Đơn nghỉ", icon: CalendarClock, tone: "text-amber-600 bg-amber-50" },
  { collectionName: "evaluations", label: "Đánh giá", icon: Star, tone: "text-rose-600 bg-rose-50" },
  { collectionName: "checkins", label: "Chấm công", icon: ClipboardCheck, tone: "text-emerald-600 bg-emerald-50" },
  { collectionName: "payroll", label: "Bảng lương", icon: WalletCards, tone: "text-cyan-600 bg-cyan-50" },
] as const;

const teacherDefinitions = [
  { collectionName: "schedules", label: "Lịch dạy", icon: CalendarDays, tone: "text-violet-600 bg-violet-50", ownerField: "teacherId" },
  { collectionName: "leaveRequests", label: "Đơn nghỉ", icon: CalendarClock, tone: "text-amber-600 bg-amber-50", ownerField: "teacherId" },
  { collectionName: "evaluations", label: "Đánh giá", icon: Star, tone: "text-rose-600 bg-rose-50", ownerField: "teacherId" },
  { collectionName: "checkins", label: "Chấm công", icon: ClipboardCheck, tone: "text-emerald-600 bg-emerald-50", ownerField: "teacherId" },
  { collectionName: "payroll", label: "Thu nhập", icon: WalletCards, tone: "text-cyan-600 bg-cyan-50", ownerField: "teacherId" },
  { collectionName: "notifications", label: "Thông báo", icon: AlertTriangle, tone: "text-orange-600 bg-orange-50", ownerField: "userId" },
] as const;

const setupCollections = [
  { collectionName: "departments", label: "Bộ môn" },
  { collectionName: "subjects", label: "Môn học" },
  { collectionName: "campuses", label: "Cơ sở" },
  { collectionName: "rooms", label: "Phòng học" },
  { collectionName: "classes", label: "Lớp học" },
  { collectionName: "semesters", label: "Học kỳ" },
  { collectionName: "timeSlots", label: "Tiết học" },
  { collectionName: "teachers", label: "Giáo viên" },
] as const;

type DashboardStat = {
  collectionName: string;
  label: string;
  value: number;
};

function claimString(claims: Record<string, unknown> | null, key: string) {
  const value = claims?.[key];
  return typeof value === "string" && value ? value : null;
}

function countQuery(collectionName: string, constraints: QueryConstraint[] = []): Query<DocumentData> {
  return query(collection(firestore, collectionName), ...constraints);
}

async function countCollection(collectionName: string, constraints: QueryConstraint[] = []) {
  const snapshot = await getCountFromServer(countQuery(collectionName, constraints));
  return snapshot.data().count;
}

export default function DashboardPage() {
  const router = useRouter();
  const { claims, loading: authLoading, role, user } = useAuth();
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [setupStats, setSetupStats] = useState<DashboardStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const uid = user?.uid ?? null;
  const departmentId = claimString(claims, "departmentId");

  useEffect(() => {
    if (!authLoading && (claims?.userType === "sao_do" || claims?.isSaoDo)) {
      router.replace("/discipline/record");
      return;
    }
    if (!authLoading && role === "bgh") {
      router.replace("/bgh/dashboard");
    }
  }, [authLoading, claims, role, router]);

  const quickActions = useMemo(() => {
    if (role === "admin") {
      return [
        { href: "/admin/setup", label: "Thiết lập hệ thống", icon: Database },
        { href: "/admin/teachers", label: "Thêm giáo viên", icon: UsersRound },
        { href: "/admin/schedules", label: "Xếp thời khóa biểu", icon: CalendarDays },
      ];
    }
    if (role === "totruong") {
      return [
        { href: "/totruong/leave-requests", label: "Duyệt đơn nghỉ phép", icon: CalendarClock },
        { href: "/totruong/schedules", label: "Thời khóa biểu tổ", icon: CalendarDays },
      ];
    }
    return [
      { href: "/teacher/schedule", label: "Xem lịch dạy", icon: CalendarDays },
      { href: "/teacher/availability", label: "Đăng ký giờ trống", icon: ClipboardCheck },
      { href: "/teacher/change-password", label: "Đổi mật khẩu", icon: KeyRound },
    ];
  }, [role]);

  useEffect(() => {
    if (authLoading || !user || !role) return;
    let active = true;

    async function loadCounts() {
      setLoading(true);
      setError("");
      setStats([]);
      setSetupStats([]);
      try {
        if (role === "admin") {
          const [nextStats, nextSetupStats] = await Promise.all([
            Promise.all(
              adminDefinitions.map(async ({ collectionName, label }) => ({
                collectionName,
                label,
                value: await countCollection(collectionName),
              })),
            ),
            Promise.all(
              setupCollections.map(async ({ collectionName, label }) => ({
                collectionName,
                label,
                value: await countCollection(collectionName),
              })),
            ),
          ]);
          if (active) {
            setStats(nextStats);
            setSetupStats(nextSetupStats);
          }
          return;
        }

        if (role === "totruong") {
          if (!departmentId) throw new FirebaseUiError("PERMISSION_DENIED", "Tài khoản tổ trưởng chưa có departmentId.");
          const nextStats = await Promise.all(
            adminDefinitions
              .filter(({ collectionName }) => collectionName !== "payroll")
              .map(async ({ collectionName, label }) => ({
                collectionName,
                label,
                value: await countCollection(collectionName, [where("departmentId", "==", departmentId)]),
              })),
          );
          if (active) setStats(nextStats);
          return;
        }

        if (!uid) throw new FirebaseUiError("PERMISSION_DENIED");
        const teacherContext = await getCurrentTeacherContext(uid);
        if (teacherContext.teacherProfile.isActive === false || teacherContext.teacherProfile.status === "inactive") {
          throw new FirebaseUiError("PERMISSION_DENIED", "Hồ sơ giáo viên đã ngừng hoạt động.");
        }
        const nextStats = await Promise.all(
          teacherDefinitions.map(async ({ collectionName, label, ownerField }) => ({
            collectionName,
            label,
            value: await countCollection(collectionName, [
              where(ownerField, "==", ownerField === "teacherId" ? teacherContext.teacherId : uid),
            ]),
          })),
        );
        if (active) setStats(nextStats);
      } catch (loadError) {
        if (active) setError(firebaseDataErrorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCounts();
    return () => {
      active = false;
    };
  }, [authLoading, departmentId, role, uid, user]);

  const definitions = role === "giaovien" ? teacherDefinitions : adminDefinitions.filter((item) => role === "admin" || item.collectionName !== "payroll");
  const title = role === "admin" ? "Tổng quan nhà trường" : role === "totruong" ? "Tổng quan bộ môn" : "Tổng quan cá nhân";
  const setupIncomplete = role === "admin" && setupStats.some((item) => item.value === 0);

  return (
    <RoleGuard allowedRoles={["admin", "bgh", "totruong", "giaovien"]}>
      <Shell>
        <PageHeader
          eyebrow="Bảng điều khiển"
          title={title}
          description="Theo dõi nhanh hồ sơ, lịch dạy, đơn nghỉ phép và các nghiệp vụ cần xử lý trong phạm vi quyền hiện tại."
          actions={quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Button key={action.href} variant={index === 0 ? "primary" : "secondary"} asChild>
                <Link href={action.href}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{action.label}</span>
                </Link>
              </Button>
            );
          })}
        />

        {setupIncomplete ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Hệ thống chưa hoàn tất cấu hình ban đầu. Vui lòng hoàn thành các danh mục thiết lập trước khi xếp thời khóa biểu.
          </div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {definitions.map((definition) => {
            const stat = stats.find((item) => item.collectionName === definition.collectionName);
            const Icon = definition.icon;
            return (
              <Card key={definition.collectionName} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{definition.label}</p>
                    {loading ? (
                      <Skeleton className="mt-3 h-9 w-20" />
                    ) : error ? (
                      <p className="mt-2 text-3xl font-extrabold tracking-tight text-rose-600">!</p>
                    ) : (
                      <p className="mt-2 text-3xl font-extrabold tracking-tight">{stat?.value ?? 0}</p>
                    )}
                  </div>
                  <div className={`grid h-11 w-11 place-items-center rounded-xl ${definition.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.8fr]">
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Phân bố dữ liệu</h2>
                <p className="text-sm text-muted-foreground">So sánh nhanh các nhóm dữ liệu đang quản lý.</p>
              </div>
            </div>
            <div className="h-72 w-full">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : error ? (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 text-center text-sm text-rose-700">
                  Không thể vẽ biểu đồ vì truy vấn dữ liệu đang lỗi.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,.12)" }} />
                    <Bar dataKey="value" name="Số lượng" fill="#2563eb" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <h2 className="text-lg font-bold">Vận hành an toàn</h2>
              <p className="mt-1 text-sm text-muted-foreground">Các nguyên tắc đang được áp dụng.</p>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              {[
                "Kiểm soát truy cập chặt chẽ theo vai trò và quyền hạn",
                "Bảo mật thông tin nhân sự và dữ liệu bảng lương",
                "Đồng bộ dữ liệu thời khóa biểu theo thời gian thực",
                "Lưu trữ nhật ký hệ thống và sao lưu định kỳ",
              ].map((item) => (
                <div key={item} className="flex gap-3">
                  <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Shell>
    </RoleGuard>
  );
}
