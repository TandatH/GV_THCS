"use client";

import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, CheckCircle2, Clock3, RefreshCcw, Search, XCircle } from "lucide-react";
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

type Row = DocumentData & { id: string };

const weekdays = [2, 3, 4, 5, 6] as const;

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
    const reason = response === "tu_choi" ? window.prompt("Nhập lý do từ chối lịch dạy")?.trim() : undefined;
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

    return (
      <div key={schedule.id} className="rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-foreground">{periodText(schedule)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{scheduleStatusLabel(schedule.status)}</p>
          </div>
          <Badge tone={confirmationTone(schedule.confirmationStatus)}>{confirmationLabel(schedule.confirmationStatus)}</Badge>
        </div>
        <div className="mt-3 space-y-1.5">
          <p className="font-semibold leading-5">{subject}</p>
          <p className="text-muted-foreground">{className}</p>
          <p className="text-muted-foreground">{room} · {campus}</p>
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
    <RoleGuard allowedRoles={["giaovien"]}>
      <Shell>
        <PageHeader
          eyebrow="Thời khóa biểu"
          title="Lịch dạy của tôi"
          description="Lịch dạy theo tuần, chỉ hiển thị lớp, môn học, phòng, tiết và trạng thái xác nhận cần xử lý."
          actions={<Button variant="secondary" onClick={() => setSelectedWeek(currentMonday())}><RefreshCcw className="h-4 w-4" />Tuần hiện tại</Button>}
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {lookupError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Không thể tải đầy đủ tên môn/lớp/phòng: {lookupError}</div> : null}

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <Card className="p-4"><p className="text-sm text-muted-foreground">Giáo viên</p><p className="mt-2 truncate text-lg font-bold">{teacherName || "—"}</p></Card>
          <Card className="p-4"><p className="text-sm text-muted-foreground">Lịch trong tuần</p><p className="mt-2 text-3xl font-extrabold">{filteredSchedules.length}</p></Card>
          <Card className="p-4"><p className="text-sm text-muted-foreground">Số tiết / chờ xác nhận</p><p className="mt-2 text-3xl font-extrabold">{totalPeriods}<span className="ml-2 text-base font-semibold text-amber-700">/{pendingCount}</span></p></Card>
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
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Không có lịch dạy trong tuần này" description="Nếu bạn vừa được xếp lịch, hãy kiểm tra lại tuần đang chọn hoặc liên hệ admin để xác nhận lịch đã được phân công đúng hồ sơ giáo viên." />
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
