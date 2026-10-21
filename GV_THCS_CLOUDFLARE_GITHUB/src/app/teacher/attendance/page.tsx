"use client";

import { CalendarDays, CheckCircle2, ClipboardCheck, Search } from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { formatPeriodDisplay, indexMonthlyCheckins, payrollScheduleDate, resolveTeachingAttendance, teacherAttendanceTotals } from "@school/shared";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Card, EmptyState, Input, Label, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/utils";

type Row = DocumentData & { id: string };

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function scheduleDate(schedule: Row) {
  return payrollScheduleDate(schedule);
}

function statusLabel(status: unknown) {
  const labels: Record<string, string> = {
    confirmed: "Đã xác nhận",
    adjusted: "Dạy thay / Điều chỉnh",
    absent: "Vắng / Nghỉ phép",
    pending: "Chưa đối soát",
    cancelled: "Đã hủy",
  };
  return typeof status === "string" ? labels[status] || status : "Chưa đối soát";
}

function statusTone(status: unknown) {
  if (["confirmed", "adjusted"].includes(String(status))) return "success" as const;
  if (status === "absent") return "danger" as const;
  return "warning" as const;
}

export default function TeacherAttendancePage() {
  const { loading: authLoading, user } = useAuth();
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [actualSchedules, setActualSchedules] = useState<Row[]>([]);
  const [originalSchedules, setOriginalSchedules] = useState<Row[]>([]);
  const [attendanceSchedules, setAttendanceSchedules] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [checkinsLoading, setCheckinsLoading] = useState(true);
  const [checkins, setCheckins] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    const uid = user.uid;
    setContextLoading(true);
    setError("");
    void getCurrentTeacherContext(uid)
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
    const loaded = new Set<string>();
    const listeners = [
      { field: "teacherId", setter: setSchedules },
      { field: "actualTeacherId", setter: setActualSchedules },
      { field: "originalTeacherId", setter: setOriginalSchedules },
      { field: "attendanceTeacherId", setter: setAttendanceSchedules },
    ];
    const unsubscribers = listeners.map(({ field, setter }) => onSnapshot(
      query(collection(firestore, "schedules"), where(field, "==", teacherId)), (snapshot) => {
        setter(snapshot.docs.map((document) => ({ ...document.data(), id: document.id })));
        loaded.add(field);
        if (loaded.size === listeners.length) setLoading(false);
      }, (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setLoading(false); }));
    unsubscribers.push(onSnapshot(collection(firestore, "classes"), (snapshot) => {
      setClasses(snapshot.docs.map((document) => ({ ...document.data(), id: document.id })));
    }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [teacherId]);

  const allSchedules = useMemo(() => {
    const map = new Map<string, Row>();
    [...schedules, ...actualSchedules, ...originalSchedules, ...attendanceSchedules].forEach((schedule) => map.set(schedule.id, schedule));
    return Array.from(map.values());
  }, [actualSchedules, schedules, originalSchedules, attendanceSchedules]);

  const checkinBySchedule = useMemo(() => indexMonthlyCheckins(checkins, selectedMonth) as Map<string, Row>, [checkins, selectedMonth]);
  const classById = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);

  const monthSchedules = useMemo(() => allSchedules
    .filter((schedule) => schedule.status !== "cancelled" && schedule.isActive !== false && scheduleDate(schedule).startsWith(selectedMonth))
    .sort((a, b) => scheduleDate(a).localeCompare(scheduleDate(b))), [allSchedules, selectedMonth]);

  const monthScheduleIds = monthSchedules.map((schedule) => schedule.id).sort().join(",");
  useEffect(() => {
    setCheckins([]);
    const scheduleIds = monthScheduleIds ? monthScheduleIds.split(",") : [];
    setCheckinsLoading(scheduleIds.length > 0);
    const results = new Map<number, Row[]>();
    const unsubscribers: Array<() => void> = [];
    // Đọc theo lịch để A cũng thấy checkin của B, kể cả bản cũ thiếu originalTeacherId.
    // Nhóm nhỏ giữ số lượt đọc kiểm tra quyền Firestore trong giới hạn.
    for (let offset = 0; offset < scheduleIds.length; offset += 5) {
      const chunk = scheduleIds.slice(offset, offset + 5);
      unsubscribers.push(onSnapshot(query(collection(firestore, "checkins"), where("scheduleId", "in", chunk)), (snapshot) => {
        results.set(offset, snapshot.docs.map((document) => ({ ...document.data(), id: document.id })));
        setCheckins(Array.from(results.values()).flat());
        if (results.size === Math.ceil(scheduleIds.length / 5)) setCheckinsLoading(false);
      }, (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setCheckinsLoading(false); }));
    }
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [monthScheduleIds, selectedMonth]);

  const rows = useMemo(() => {
    return monthSchedules.map((schedule) => {
      const checkin = checkinBySchedule.get(schedule.id) ?? null;
      const attendance = resolveTeachingAttendance(schedule, checkin ?? undefined, classById.get(String(schedule.classId)));
      return { schedule, checkin, attendance };
    });
  }, [checkinBySchedule, monthSchedules, classById]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    if (!keyword) return rows;
    return rows.filter(({ schedule, checkin }) => [
      schedule?.subjectName,
      schedule?.subjectId,
      schedule?.className,
      schedule?.classId,
      checkin?.subjectName,
      checkin?.className,
      checkin?.note,
      checkin?.adjustmentReason,
    ].filter(Boolean).some((value) => String(value).toLocaleLowerCase("vi").includes(keyword)));
  }, [rows, search]);

  // Cùng quy tắc bù–trừ với Admin và server: A không hưởng tiết do B thực dạy.
  const totals = teacherAttendanceTotals(teacherId, rows.map((row) => row.attendance));
  const confirmedPeriods = totals.actualPeriods;
  const pendingSchedules = rows.filter((row) => row.attendance.status === "pending")
    .reduce((sum, row) => sum + row.attendance.periodCount, 0);

  return (
    <RoleGuard allowedRoles={["giaovien", "bgh", "totruong", "admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Chấm công"
          title="Chấm công giảng dạy"
          description="Theo dõi tiết dạy thực tế theo thời khóa biểu. Thù lao giảng dạy được tính dựa trên các tiết đã được đối soát và xác nhận hoàn thành."
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="mb-5 grid gap-4 md:grid-cols-5">
          <Card className="p-5"><p className="text-sm text-muted-foreground">Giáo viên</p><p className="mt-2 text-lg font-bold">{teacherName || "—"}</p></Card>
          <Card className="p-5"><p className="text-sm text-muted-foreground">Tiết đã xác nhận</p><p className="mt-2 text-3xl font-extrabold">{confirmedPeriods}</p></Card>
          <Card className="p-5"><p className="text-sm text-muted-foreground">Tiết chưa đối soát</p><p className="mt-2 text-3xl font-extrabold">{pendingSchedules}</p></Card>
          <Card className="p-5"><p className="text-sm text-muted-foreground">Tiết dạy thế</p><p className="mt-2 text-3xl font-extrabold">{totals.substituteCount}</p></Card>
          <Card className="p-5"><p className="text-sm text-muted-foreground">Tiết vắng / Được dạy thay</p><p className="mt-2 text-3xl font-extrabold">{totals.absentCount}</p></Card>
        </div>

        <Card className="mb-5 p-4">
          <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-end">
            <div><Label>Tháng chấm công</Label><Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm lớp, môn học, ghi chú..." />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          {loading || contextLoading || checkinsLoading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
          ) : error ? null : filteredRows.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="Chưa có dữ liệu chấm công trong tháng"
              description="Hiện chưa có dữ liệu chấm công cho tháng được chọn. Bản ghi sẽ hiển thị sau khi tiết dạy được phân công và xác nhận hoàn thành."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[980px]">
                <thead><tr><th>Ngày</th><th>Lớp</th><th>Môn học</th><th>Tiết</th><th>Số tiết ghi nhận</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
                <tbody>
                  {filteredRows.map(({ schedule, checkin, attendance }) => {
                    const date = checkin?.date || (schedule ? scheduleDate(schedule) : "");
                    const wasReplaced = attendance.originalTeacherId === teacherId && attendance.isSubstituted;
                    const status = wasReplaced ? "absent" : attendance.status;
                    const periods = attendance.effectiveTeacherId === teacherId ? attendance.payablePeriods : 0;
                    return (
                      <tr key={schedule?.id || checkin?.id}>
                        <td>{formatDate(date)}</td>
                        <td>{checkin?.className || schedule?.className || schedule?.classId || "—"}</td>
                        <td>{checkin?.subjectName || schedule?.subjectName || schedule?.subjectId || "—"}</td>
                        <td>{formatPeriodDisplay(schedule).label}</td>
                        <td>{periods}</td>
                        <td><Badge tone={statusTone(status)}>{statusLabel(status)}</Badge></td>
                        <td><p className="max-w-xs truncate">{wasReplaced ? `Được dạy thay bởi ${checkin?.teacherId === attendance.effectiveTeacherId ? checkin.teacherName || attendance.effectiveTeacherId : attendance.effectiveTeacherId}` : checkin?.note || checkin?.adjustmentReason || "—"}</p></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card className="p-5"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><CalendarDays className="h-5 w-5" /></div><div><p className="font-semibold">Tiết chưa đối soát</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Các tiết dạy theo thời khóa biểu trong tháng đang chờ Ban Giám hiệu hoặc bộ phận quản lý rà soát và xác nhận hoàn thành.</p></div></div></Card>
          <Card className="p-5"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></div><div><p className="font-semibold">Tiết đã xác nhận</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Tiết dạy đã được đối soát thành công (dạy theo lịch hoặc dạy thay), đủ điều kiện kết chuyển vào bảng tổng hợp thù lao tháng.</p></div></div></Card>
        </div>
      </Shell>
    </RoleGuard>
  );
}
