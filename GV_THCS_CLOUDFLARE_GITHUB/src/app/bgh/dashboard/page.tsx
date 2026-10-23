"use client";

import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  Info,
  ShieldCheck,
  Star,
  Trophy,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  type DocumentData,
} from "firebase/firestore";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";

type Row = DocumentData & { id: string };

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numericGrade(value: unknown) {
  const grade = Number(value);
  return Number.isInteger(grade) && grade >= 1 && grade <= 9 ? grade : 0;
}

function schoolLevelForGrade(grade: number) {
  if (grade >= 1 && grade <= 5) return "primary";
  if (grade >= 6 && grade <= 9) return "secondary";
  return "";
}

function rowSchoolLevel(row: Row) {
  const explicit = text(row.schoolLevel);
  if (explicit === "primary" || explicit === "secondary") return explicit;
  return schoolLevelForGrade(numericGrade(row.grade ?? row.gradeLevel));
}

export default function BghDashboardPage() {
  const { claims, loading: authLoading } = useAuth();
  const bghPosition = claims?.bghPosition === "hieutruong" ? "Hiệu trưởng" : "Phó Hiệu trưởng";
  const schoolLevel = (typeof claims?.schoolLevel === "string" ? claims.schoolLevel : "secondary") as "primary" | "secondary" | "all";

  const levelLabel = schoolLevel === "primary"
    ? "Tiểu học (Khối 1–5)"
    : schoolLevel === "secondary"
      ? "THCS (Khối 6–9)"
      : "Toàn trường (Cả 2 cấp)";

  const [teachers, setTeachers] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [rooms, setRooms] = useState<Row[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<Row[]>([]);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setError("");

    const unsubscribers = [
      onSnapshot(collection(firestore, "teachers"), (snap) => {
        setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (e) => setError(firebaseDataErrorMessage(e))),
      onSnapshot(collection(firestore, "classes"), (snap) => {
        setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (e) => setError(firebaseDataErrorMessage(e))),
      onSnapshot(collection(firestore, "subjects"), (snap) => {
        setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (e) => setError(firebaseDataErrorMessage(e))),
      onSnapshot(collection(firestore, "rooms"), (snap) => {
        setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (e) => setError(firebaseDataErrorMessage(e))),
      onSnapshot(collection(firestore, "leaveRequests"), (snap) => {
        setLeaveRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (e) => setError(firebaseDataErrorMessage(e))),
      onSnapshot(collection(firestore, "schedules"), (snap) => {
        setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (e) => {
        setError(firebaseDataErrorMessage(e));
        setLoading(false);
      }),
    ];

    return () => unsubscribers.forEach((u) => u());
  }, [authLoading]);

  // Filtered by BGH's school level
  const filteredTeachers = useMemo(() => {
    if (schoolLevel === "all") return teachers;
    return teachers.filter((t) => {
      const levels = Array.isArray(t.schoolLevels) ? t.schoolLevels.map(String) : [];
      return levels.includes(schoolLevel);
    });
  }, [teachers, schoolLevel]);

  const filteredClasses = useMemo(() => {
    if (schoolLevel === "all") return classes;
    return classes.filter((c) => rowSchoolLevel(c) === schoolLevel);
  }, [classes, schoolLevel]);

  const filteredSubjects = useMemo(() => {
    if (schoolLevel === "all") return subjects;
    return subjects.filter((s) => {
      const lvl = rowSchoolLevel(s);
      return !lvl || lvl === schoolLevel;
    });
  }, [subjects, schoolLevel]);

  const coHuuCount = filteredTeachers.filter((t) => t.teacherType === "co_huu").length;
  const thinhGiangCount = filteredTeachers.filter((t) => t.teacherType === "thinh_giang").length;

  return (
    <RoleGuard allowedRoles={["bgh"]}>
      <Shell>
        <PageHeader
          eyebrow="Ban Giám hiệu"
          title={`Bảng điều khiển · ${bghPosition}`}
          description={`Theo dõi tình hình hoạt động, nhân sự và thời khóa biểu cấp ${levelLabel}.`}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" asChild>
                <Link href="/bgh/schedules">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  Thời khóa biểu
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/bgh/teachers">
                  <UsersRound className="h-4 w-4 text-emerald-600" />
                  Giáo viên
                </Link>
              </Button>
              <Button asChild>
                <Link href="/bgh/classes">
                  <GraduationCap className="h-4 w-4" />
                  Lớp học
                </Link>
              </Button>
            </div>
          )}
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* Scope and Role Notice */}
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-950">
                Vai trò: {bghPosition} · Phạm vi phụ trách: {levelLabel}
              </p>
              <p className="text-xs text-blue-800/80">
                Chế độ theo dõi chuyên môn · Số liệu được tổng hợp tự động theo cấp học phụ trách.
              </p>
            </div>
          </div>
          <div>
            <Badge tone="info">Ban Giám hiệu</Badge>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Giáo viên phụ trách</p>
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700">
                <UsersRound className="h-5 w-5" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <div>
                <p className="mt-2 text-3xl font-extrabold">{filteredTeachers.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {coHuuCount} cơ hữu · {thinhGiangCount} thỉnh giảng
                </p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Lớp học</p>
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                <GraduationCap className="h-5 w-5" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <div>
                <p className="mt-2 text-3xl font-extrabold">{filteredClasses.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Thuộc cấp {schoolLevel === "all" ? "toàn trường" : levelLabel}</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Môn học</p>
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-700">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <div>
                <p className="mt-2 text-3xl font-extrabold">{filteredSubjects.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Đang giảng dạy</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Phòng học & Cơ sở</p>
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-700">
                <DoorOpen className="h-5 w-5" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <div>
                <p className="mt-2 text-3xl font-extrabold">{rooms.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Phòng học trên hệ thống</p>
              </div>
            )}
          </Card>
        </div>

        {/* Quick Nav Modules */}
        <h2 className="mb-3 text-base font-bold text-slate-900">Phân hệ theo dõi nghiệp vụ</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/bgh/discipline" className="group rounded-2xl border border-border bg-card p-5 transition hover:border-indigo-300 hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold group-hover:text-indigo-600 transition">Thi đua & Kỷ luật</h3>
                  <Badge tone="success" className="text-[10px] px-1.5 py-0">Đồng bộ BGH</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Theo dõi điểm thi đua, tiến độ ký xác nhận và xếp hạng Cấp 2.</p>
              </div>
            </div>
          </Link>

          <Link href="/bgh/schedules" className="group rounded-2xl border border-border bg-card p-5 transition hover:border-blue-300 hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold group-hover:text-blue-600 transition">Thời khóa biểu</h3>
                <p className="text-xs text-muted-foreground">Xem lịch theo lớp, giáo viên, phòng và xuất báo cáo.</p>
              </div>
            </div>
          </Link>

          <Link href="/bgh/teachers" className="group rounded-2xl border border-border bg-card p-5 transition hover:border-emerald-300 hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold group-hover:text-emerald-600 transition">Hồ sơ Giáo viên</h3>
                <p className="text-xs text-muted-foreground">Danh bạ, chuyên môn, phân công môn/khối và định mức tiết.</p>
              </div>
            </div>
          </Link>

          <Link href="/bgh/classes" className="group rounded-2xl border border-border bg-card p-5 transition hover:border-violet-300 hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold group-hover:text-violet-600 transition">Lớp học</h3>
                <p className="text-xs text-muted-foreground">Khối lớp, giáo viên chủ nhiệm, phòng học và ca học.</p>
              </div>
            </div>
          </Link>

          <Link href="/bgh/subjects" className="group rounded-2xl border border-border bg-card p-5 transition hover:border-amber-300 hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold group-hover:text-amber-600 transition">Môn học</h3>
                <p className="text-xs text-muted-foreground">Danh mục môn học, tổ bộ môn và phân phối khối dạy.</p>
              </div>
            </div>
          </Link>

          <Link href="/bgh/leave-requests" className="group rounded-2xl border border-border bg-card p-5 transition hover:border-rose-300 hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold group-hover:text-rose-600 transition">Đơn nghỉ phép</h3>
                <p className="text-xs text-muted-foreground">Theo dõi tình hình giáo viên nghỉ phép và bố trí dạy thay.</p>
              </div>
            </div>
          </Link>

          <Link href="/bgh/evaluations" className="group rounded-2xl border border-border bg-card p-5 transition hover:border-yellow-300 hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-yellow-50 text-yellow-600 group-hover:bg-yellow-600 group-hover:text-white transition">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold group-hover:text-yellow-600 transition">Đánh giá chuyên môn</h3>
                <p className="text-xs text-muted-foreground">Tổng hợp kết quả đánh giá chất lượng giảng dạy giáo viên.</p>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 border border-slate-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>
            Tài khoản Ban Giám hiệu được cấp quyền theo dõi và giám sát chuyên môn. Để cấu hình hệ thống hoặc tạo tài khoản mới, vui lòng liên hệ Quản trị viên hệ thống.
          </p>
        </div>
      </Shell>
    </RoleGuard>
  );
}
