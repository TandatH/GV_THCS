"use client";

import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, CheckCircle2, Clock3, GraduationCap, MapPin, RefreshCcw, Search, User, XCircle } from "lucide-react";
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firebaseErrorMessage, respondToScheduleAssignment } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { addDaysDateOnly, currentWeekStartDateOnly, normalizeWeekStartDateOnly } from "@/lib/date-only";
import { cn } from "@/lib/utils";

type Row = DocumentData & { id: string };

const weekdays = [2, 3, 4, 5, 6] as const;

type SubjectTheme = {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  accent: string;
};

const SUBJECT_COLOR_PRESETS: Record<string, SubjectTheme> = {
  toan: {
    bg: "bg-gradient-to-br from-blue-50/90 to-indigo-50/60 hover:from-blue-100/90 hover:to-indigo-100/70",
    border: "border-blue-200 hover:border-blue-400",
    text: "text-blue-950",
    badgeBg: "bg-blue-100/80 text-blue-800",
    accent: "border-l-4 border-l-blue-600",
  },
  van: {
    bg: "bg-gradient-to-br from-emerald-50/90 to-teal-50/60 hover:from-emerald-100/90 hover:to-teal-100/70",
    border: "border-emerald-200 hover:border-emerald-400",
    text: "text-emerald-950",
    badgeBg: "bg-emerald-100/80 text-emerald-800",
    accent: "border-l-4 border-l-emerald-600",
  },
  tiengviet: {
    bg: "bg-gradient-to-br from-teal-50/90 to-emerald-50/60 hover:from-teal-100/90 hover:to-emerald-100/70",
    border: "border-teal-200 hover:border-teal-400",
    text: "text-teal-950",
    badgeBg: "bg-teal-100/80 text-teal-800",
    accent: "border-l-4 border-l-teal-600",
  },
  tienganh: {
    bg: "bg-gradient-to-br from-violet-50/90 to-purple-50/60 hover:from-violet-100/90 hover:to-purple-100/70",
    border: "border-violet-200 hover:border-violet-400",
    text: "text-violet-950",
    badgeBg: "bg-violet-100/80 text-violet-800",
    accent: "border-l-4 border-l-violet-600",
  },
  khoahoc: {
    bg: "bg-gradient-to-br from-amber-50/90 to-orange-50/60 hover:from-amber-100/90 hover:to-orange-100/70",
    border: "border-amber-200 hover:border-amber-400",
    text: "text-amber-950",
    badgeBg: "bg-amber-100/80 text-amber-800",
    accent: "border-l-4 border-l-amber-600",
  },
  lichsu: {
    bg: "bg-gradient-to-br from-rose-50/90 to-red-50/60 hover:from-rose-100/90 hover:to-red-100/70",
    border: "border-rose-200 hover:border-rose-400",
    text: "text-rose-950",
    badgeBg: "bg-rose-100/80 text-rose-800",
    accent: "border-l-4 border-l-rose-600",
  },
  tinhoc: {
    bg: "bg-gradient-to-br from-cyan-50/90 to-sky-50/60 hover:from-cyan-100/90 hover:to-sky-100/70",
    border: "border-cyan-200 hover:border-cyan-400",
    text: "text-cyan-950",
    badgeBg: "bg-cyan-100/80 text-cyan-800",
    accent: "border-l-4 border-l-cyan-600",
  },
  mythuat: {
    bg: "bg-gradient-to-br from-fuchsia-50/90 to-pink-50/60 hover:from-fuchsia-100/90 hover:to-pink-100/70",
    border: "border-fuchsia-200 hover:border-fuchsia-400",
    text: "text-fuchsia-950",
    badgeBg: "bg-fuchsia-100/80 text-fuchsia-800",
    accent: "border-l-4 border-l-fuchsia-600",
  },
  theduc: {
    bg: "bg-gradient-to-br from-lime-50/90 to-green-50/60 hover:from-lime-100/90 hover:to-green-100/70",
    border: "border-lime-200 hover:border-lime-400",
    text: "text-lime-950",
    badgeBg: "bg-lime-100/80 text-lime-800",
    accent: "border-l-4 border-l-lime-600",
  },
  gdcd: {
    bg: "bg-gradient-to-br from-yellow-50/90 to-amber-50/60 hover:from-yellow-100/90 hover:to-amber-100/70",
    border: "border-yellow-200 hover:border-yellow-400",
    text: "text-yellow-950",
    badgeBg: "bg-yellow-100/80 text-yellow-800",
    accent: "border-l-4 border-l-yellow-600",
  },
};

const DYNAMIC_PALETTES: SubjectTheme[] = [
  {
    bg: "bg-gradient-to-br from-sky-50/90 to-blue-50/60 hover:from-sky-100/90 hover:to-blue-100/70",
    border: "border-sky-200 hover:border-sky-400",
    text: "text-sky-950",
    badgeBg: "bg-sky-100/80 text-sky-800",
    accent: "border-l-4 border-l-sky-500",
  },
  {
    bg: "bg-gradient-to-br from-purple-50/90 to-indigo-50/60 hover:from-purple-100/90 hover:to-indigo-100/70",
    border: "border-purple-200 hover:border-purple-400",
    text: "text-purple-950",
    badgeBg: "bg-purple-100/80 text-purple-800",
    accent: "border-l-4 border-l-purple-500",
  },
  {
    bg: "bg-gradient-to-br from-pink-50/90 to-rose-50/60 hover:from-pink-100/90 hover:to-rose-100/70",
    border: "border-pink-200 hover:border-pink-400",
    text: "text-pink-950",
    badgeBg: "bg-pink-100/80 text-pink-800",
    accent: "border-l-4 border-l-pink-500",
  },
  {
    bg: "bg-gradient-to-br from-amber-50/90 to-yellow-50/60 hover:from-amber-100/90 hover:to-yellow-100/70",
    border: "border-amber-200 hover:border-amber-400",
    text: "text-amber-950",
    badgeBg: "bg-amber-100/80 text-amber-800",
    accent: "border-l-4 border-l-amber-500",
  },
  {
    bg: "bg-gradient-to-br from-teal-50/90 to-cyan-50/60 hover:from-teal-100/90 hover:to-cyan-100/70",
    border: "border-teal-200 hover:border-teal-400",
    text: "text-teal-950",
    badgeBg: "bg-teal-100/80 text-teal-800",
    accent: "border-l-4 border-l-teal-500",
  },
];

function getSubjectTheme(subjectName: string, subjectId: string): SubjectTheme {
  const norm = (subjectName || subjectId || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");

  if (norm.includes("toan")) return SUBJECT_COLOR_PRESETS.toan;
  if (norm.includes("tiengviet")) return SUBJECT_COLOR_PRESETS.tiengviet;
  if (norm.includes("van") || norm.includes("nguvan")) return SUBJECT_COLOR_PRESETS.van;
  if (norm.includes("anh") || norm.includes("tienganh") || norm.includes("english")) return SUBJECT_COLOR_PRESETS.tienganh;
  if (norm.includes("khoahoc") || norm.includes("khtn") || norm.includes("ly") || norm.includes("vatly") || norm.includes("hoa") || norm.includes("hoahoc") || norm.includes("sinh") || norm.includes("sinhhoc")) return SUBJECT_COLOR_PRESETS.khoahoc;
  if (norm.includes("su") || norm.includes("lichsu") || norm.includes("dia") || norm.includes("dialy") || norm.includes("khxh")) return SUBJECT_COLOR_PRESETS.lichsu;
  if (norm.includes("tin") || norm.includes("tinhoc") || norm.includes("congnghe")) return SUBJECT_COLOR_PRESETS.tinhoc;
  if (norm.includes("nhac") || norm.includes("amnhac") || norm.includes("my") || norm.includes("mythuat") || norm.includes("nghethuat")) return SUBJECT_COLOR_PRESETS.mythuat;
  if (norm.includes("theduc") || norm.includes("gdtc") || norm.includes("thechat")) return SUBJECT_COLOR_PRESETS.theduc;
  if (norm.includes("gdcd") || norm.includes("daoduc") || norm.includes("trainghiem") || norm.includes("hdtn")) return SUBJECT_COLOR_PRESETS.gdcd;

  let hash = 0;
  const str = subjectName || subjectId || "subject";
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DYNAMIC_PALETTES.length;
  return DYNAMIC_PALETTES[index];
}

function currentMonday() {
  return currentWeekStartDateOnly();
}

function mondayFrom(value: string) {
  return normalizeWeekStartDateOnly(value);
}

function dateForSchedule(schedule: Row) {
  return addDaysDateOnly(String(schedule.weekStart || ""), Number(schedule.dayOfWeek || 2) - 2);
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function catalogName(rows: Row[], id: unknown) {
  const value = textValue(id);
  if (!value) return "";
  const row = rows.find((item) => item.id === value);
  return textValue(row?.name) || textValue(row?.fullName) || textValue(row?.code) || value;
}

function periodText(schedule: Row) {
  const start = Number(schedule.startPeriod || 0);
  const last = Number(schedule.endPeriod || 0) - 1;
  return start > 0 && last >= start ? `Tiết ${start}-${last}` : "Chưa rõ tiết";
}

function periodCount(schedule: Row) {
  return Math.max(0, Number(schedule.endPeriod || 0) - Number(schedule.startPeriod || 0));
}

function confirmationLabel(status: unknown) {
  const labels: Record<string, string> = {
    cho_xac_nhan: "Chờ xác nhận",
    xac_nhan: "Đã xác nhận",
    tu_choi: "Đã từ chối",
    qua_han: "Quá hạn",
    khong_yeu_cau: "Không yêu cầu",
  };
  return typeof status === "string" ? labels[status] || status : "Không yêu cầu";
}

function confirmationTone(status: unknown) {
  if (["xac_nhan", "khong_yeu_cau"].includes(String(status))) return "success" as const;
  if (["tu_choi", "qua_han"].includes(String(status))) return "danger" as const;
  if (status === "cho_xac_nhan") return "warning" as const;
  return "neutral" as const;
}

function scheduleStatusLabel(status: unknown) {
  const labels: Record<string, string> = {
    scheduled: "Đã xếp lịch",
    needs_attention: "Cần xử lý",
    cancelled: "Đã hủy",
  };
  return typeof status === "string" ? labels[status] || status : "Đã xếp lịch";
}

export default function TeacherSchedulePage() {
  const { loading: authLoading, user } = useAuth();
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [primarySchedules, setPrimarySchedules] = useState<Row[]>([]);
  const [legacySchedules, setLegacySchedules] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [rooms, setRooms] = useState<Row[]>([]);
  const [campuses, setCampuses] = useState<Row[]>([]);
  const [contextLoading, setContextLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [selectedWeek, setSelectedWeek] = useState(currentMonday());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [respondingId, setRespondingId] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setContextLoading(false);
      return;
    }
    let active = true;
    setContextLoading(true);
    setError("");
    void getCurrentTeacherContext(user.uid)
      .then((context) => {
        if (!active) return;
        setTeacherId(context.teacherId);
        setTeacherName(String(context.teacherProfile.fullName || context.userProfile.displayName || "Giáo viên"));
      })
      .catch((loadError) => active && setError(firebaseDataErrorMessage(loadError)))
      .finally(() => active && setContextLoading(false));
    return () => { active = false; };
  }, [authLoading, user]);

  useEffect(() => {
    if (!teacherId) return;
    setLoading(true);
    setError("");
    const unsubscribers = [
      onSnapshot(
        query(collection(firestore, "schedules"), where("actualTeacherId", "==", teacherId), limit(500)),
        (snapshot) => {
          setPrimarySchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
          setLoading(false);
        },
        (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setLoading(false); },
      ),
      onSnapshot(
        query(collection(firestore, "schedules"), where("teacherId", "==", teacherId), limit(500)),
        (snapshot) => setLegacySchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))),
        (snapshotError) => setError(firebaseDataErrorMessage(snapshotError)),
      ),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [teacherId]);

  useEffect(() => {
    setLookupError("");
    const watchCatalog = (collectionName: string, setter: (rows: Row[]) => void) =>
      onSnapshot(
        query(collection(firestore, collectionName), limit(500)),
        (snapshot) => setter(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))),
        (snapshotError) => setLookupError(firebaseDataErrorMessage(snapshotError)),
      );
    const unsubscribers = [
      watchCatalog("subjects", setSubjects),
      watchCatalog("classes", setClasses),
      watchCatalog("rooms", setRooms),
      watchCatalog("campuses", setCampuses),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const allSchedules = useMemo(() => {
    const map = new Map<string, Row>();
    [...legacySchedules, ...primarySchedules].forEach((schedule) => map.set(schedule.id, schedule));
    return Array.from(map.values())
      .filter((schedule) => schedule.status !== "cancelled")
      .filter((schedule) => textValue(schedule.actualTeacherId) ? schedule.actualTeacherId === teacherId : schedule.teacherId === teacherId);
  }, [legacySchedules, primarySchedules, teacherId]);

  const weekEnd = useMemo(() => addDaysDateOnly(selectedWeek, 4), [selectedWeek]);

  const filteredSchedules = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return allSchedules
      .filter((schedule) => {
        const date = dateForSchedule(schedule);
        if (date < selectedWeek || date > weekEnd) return false;
        if (statusFilter !== "all" && schedule.confirmationStatus !== statusFilter) return false;
        if (!keyword) return true;
        return [
          schedule.subjectName,
          catalogName(subjects, schedule.subjectId),
          schedule.className,
          catalogName(classes, schedule.classId),
          schedule.roomName,
          catalogName(rooms, schedule.roomId),
          schedule.campusName,
          catalogName(campuses, schedule.campusId),
          scheduleStatusLabel(schedule.status),
          confirmationLabel(schedule.confirmationStatus),
        ].filter(Boolean).some((value) => String(value).toLocaleLowerCase("vi").includes(keyword));
      })
      .sort((first, second) => {
        const dateCompare = dateForSchedule(first).localeCompare(dateForSchedule(second));
        return dateCompare || Number(first.startPeriod || 0) - Number(second.startPeriod || 0);
      });
  }, [allSchedules, campuses, classes, rooms, search, selectedWeek, statusFilter, subjects, weekEnd]);

  const schedulesByDay = useMemo(() => new Map(weekdays.map((day) => [day, filteredSchedules.filter((schedule) => Number(schedule.dayOfWeek || 2) === day)])), [filteredSchedules]);
  const totalPeriods = filteredSchedules.reduce((sum, schedule) => sum + periodCount(schedule), 0);
  const pendingCount = filteredSchedules.filter((schedule) => schedule.confirmationStatus === "cho_xac_nhan").length;

  async function respond(schedule: Row, response: "xac_nhan" | "tu_choi") {
    const reason = response === "tu_choi" ? window.prompt("Nhập lý do từ chối lịch giảng dạy:")?.trim() : undefined;
    if (response === "tu_choi" && !reason) return;
    setRespondingId(schedule.id);
    setError("");
    try {
      await respondToScheduleAssignment({ scheduleId: schedule.id, response, reason });
      toast.success(response === "xac_nhan" ? "Đã xác nhận lịch dạy." : "Đã từ chối lịch dạy.");
    } catch (submitError) {
      setError(firebaseErrorMessage(submitError));
    } finally {
      setRespondingId("");
    }
  }

  function renderScheduleCard(schedule: Row) {
    const subject = schedule.subjectName || catalogName(subjects, schedule.subjectId) || schedule.subjectId || "Môn học";
    const className = schedule.className || catalogName(classes, schedule.classId) || schedule.classId || "Lớp";
    const room = schedule.roomName || catalogName(rooms, schedule.roomId) || schedule.roomId || "Phòng";
    const campus = schedule.campusName || catalogName(campuses, schedule.campusId) || schedule.campusId || "Cơ sở";
    const isSubstitute = textValue(schedule.originalTeacherId) && schedule.originalTeacherId !== teacherId;
    const canRespond = schedule.confirmationStatus === "cho_xac_nhan" && (schedule.actualTeacherId === teacherId || schedule.teacherId === teacherId);
    const theme = getSubjectTheme(subject, schedule.subjectId);

    return (
      <div
        key={schedule.id}
        className={cn(
          "rounded-xl border p-3 text-sm shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          theme.bg,
          theme.border,
          theme.accent,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={cn("font-bold text-sm", theme.text)}>{periodText(schedule)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{scheduleStatusLabel(schedule.status)}</p>
          </div>
          <Badge tone={confirmationTone(schedule.confirmationStatus)}>{confirmationLabel(schedule.confirmationStatus)}</Badge>
        </div>
        <div className="mt-2.5 space-y-1">
          <p className={cn("font-extrabold text-base tracking-tight", theme.text)}>{subject}</p>
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-700">
            <GraduationCap className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span>{className}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{room} · {campus}</span>
          </div>
          {isSubstitute ? <Badge tone="info">Dạy thay</Badge> : null}
        </div>
        {canRespond ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" loading={respondingId === schedule.id} onClick={() => respond(schedule, "xac_nhan")}><CheckCircle2 className="h-4 w-4" />Xác nhận</Button>
            <Button size="sm" variant="secondary" loading={respondingId === schedule.id} onClick={() => respond(schedule, "tu_choi")}><XCircle className="h-4 w-4" />Từ chối</Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["giaovien", "bgh", "totruong", "admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Thời khóa biểu"
          title="Lịch giảng dạy"
          description="Thời khóa biểu theo tuần, hiển thị chi tiết theo môn học, lớp học, phòng học và trạng thái xác nhận phân công."
          actions={<Button variant="secondary" onClick={() => setSelectedWeek(currentMonday())}><RefreshCcw className="h-4 w-4" />Tuần hiện tại</Button>}
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {lookupError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Không thể tải danh mục liên quan: {lookupError}</div> : null}

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <Card className="p-4"><p className="text-sm text-muted-foreground">Giáo viên</p><p className="mt-2 truncate text-lg font-bold">{teacherName || "—"}</p></Card>
          <Card className="p-4"><p className="text-sm text-muted-foreground">Lịch trong tuần</p><p className="mt-2 text-3xl font-extrabold">{filteredSchedules.length}</p></Card>
          <Card className="p-4"><p className="text-sm text-muted-foreground">Tổng tiết / Chờ xác nhận</p><p className="mt-2 text-3xl font-extrabold">{totalPeriods}<span className="ml-2 text-base font-semibold text-amber-700">/{pendingCount}</span></p></Card>
        </div>

        <Card className="mb-5 p-4">
          <div className="grid gap-4 lg:grid-cols-[220px_220px_1fr] lg:items-end">
            <div><Label>Tuần bắt đầu</Label><Input type="date" value={selectedWeek} onChange={(event) => setSelectedWeek(mondayFrom(event.target.value))} /></div>
            <div><Label>Trạng thái xác nhận</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả</option><option value="cho_xac_nhan">Chờ xác nhận</option><option value="xac_nhan">Đã xác nhận</option><option value="khong_yeu_cau">Không yêu cầu</option><option value="tu_choi">Đã từ chối</option><option value="qua_han">Quá hạn</option></select></div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm môn học, lớp, phòng, cơ sở..." />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden p-4">
          {loading || contextLoading ? (
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">{weekdays.map((day) => <Skeleton key={day} className="h-72" />)}</div>
          ) : error ? null : filteredSchedules.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Không có lịch dạy trong tuần này" description="Không có tiết dạy trong tuần được chọn. Vui lòng kiểm tra tuần khác hoặc liên hệ bộ phận xếp lịch." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {weekdays.map((day) => {
                const date = addDays(parseISO(selectedWeek), day - 2);
                const daySchedules = schedulesByDay.get(day) || [];
                return (
                  <section key={day} className="min-h-64 rounded-xl border border-border bg-muted/35 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <h3 className="font-bold">Thứ {day}</h3>
                        <p className="text-xs text-muted-foreground">{format(date, "dd/MM/yyyy")}</p>
                      </div>
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-card px-2 text-xs font-bold text-muted-foreground">{daySchedules.length}</span>
                    </div>
                    <div className="space-y-3">
                      {daySchedules.length > 0 ? daySchedules.map(renderScheduleCard) : <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-3 text-center text-xs text-muted-foreground"><Clock3 className="mr-2 h-4 w-4" />Không có tiết</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </Card>
      </Shell>
    </RoleGuard>
  );
}
