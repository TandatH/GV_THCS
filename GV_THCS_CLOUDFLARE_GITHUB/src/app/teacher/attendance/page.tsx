"use client";

import { CalendarDays, CheckCircle2, ClipboardCheck, Search } from "lucide-react";
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Card, EmptyState, Input, Label, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { dateOnlyFromDate } from "@/lib/date-only";
import { formatDate } from "@/lib/utils";

type Row = DocumentData & { id: string };

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function scheduleDate(schedule: Row) {
  const date = new Date(String(schedule.weekStart || ""));
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(schedule.dayOfWeek || 2) - 2);
  return dateOnlyFromDate(date);
}

function periodCount(schedule: Row) {
  return Math.max(0, Number(schedule.endPeriod || 0) - Number(schedule.startPeriod || 0));
}

function statusLabel(status: unknown) {
  const labels: Record<string, string> = {
    confirmed: "Đã chấm công",
    adjusted: "Đã điều chỉnh",
    absent: "Vắng",
  };
  return typeof status === "string" ? labels[status] || status : "Chưa chấm công";
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
    const unsubscribers = [
      onSnapshot(query(collection(firestore, "schedules"), where("teacherId", "==", teacherId), limit(500)), (snapshot) => {
        setSchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        setLoading(false);
      }, (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setLoading(false); }),
      onSnapshot(query(collection(firestore, "schedules"), where("actualTeacherId", "==", teacherId), limit(500)), (snapshot) => {
        setActualSchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "checkins"), where("teacherId", "==", teacherId), limit(500)), (snapshot) => {
        setCheckins(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [teacherId]);

  const allSchedules = useMemo(() => {
    const map = new Map<string, Row>();
    [...schedules, ...actualSchedules].forEach((schedule) => map.set(schedule.id, schedule));
    return Array.from(map.values());
  }, [actualSchedules, schedules]);

  const checkinBySchedule = useMemo(() => new Map(checkins.map((checkin) => [String(checkin.scheduleId), checkin])), [checkins]);

  const monthSchedules = useMemo(() => allSchedules
    .filter((schedule) => schedule.status !== "cancelled" && scheduleDate(schedule).startsWith(selectedMonth))
    .sort((a, b) => scheduleDate(a).localeCompare(scheduleDate(b))), [allSchedules, selectedMonth]);

  const monthCheckins = useMemo(() => checkins.filter((checkin) => checkin.month === selectedMonth), [checkins, selectedMonth]);

  const rows = useMemo(() => {
    const scheduleRows = monthSchedules.map((schedule) => ({ schedule, checkin: checkinBySchedule.get(schedule.id) ?? null }));
    const scheduleIds = new Set(monthSchedules.map((schedule) => schedule.id));
    const extraCheckins = monthCheckins
      .filter((checkin) => !scheduleIds.has(String(checkin.scheduleId)))
      .map((checkin) => ({ schedule: null, checkin }));
    return [...scheduleRows, ...extraCheckins];
  }, [checkinBySchedule, monthCheckins, monthSchedules]);

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

  const confirmedPeriods = monthCheckins
    .filter((checkin) => ["confirmed", "adjusted"].includes(String(checkin.status)))
    .reduce((sum, checkin) => sum + Number(checkin.payablePeriods ?? checkin.periodCount ?? 0), 0);
  const pendingSchedules = monthSchedules.filter((schedule) => !checkinBySchedule.has(schedule.id)).length;

  return (
    <RoleGuard allowedRoles={["giaovien"]}>
      <Shell>
        <PageHeader
          eyebrow="Chấm công"
          title="Chấm công của tôi"
          description="Theo dõi lịch trong tháng và tiết thực dạy. Chỉ chấm công ở trạng thái Đã chấm công/Đã điều chỉnh mới được tính vào thù lao; lịch phân công chưa tự động phát sinh tiền."
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <Card className="p-5"><p className="text-sm text-muted-foreground">Giáo viên</p><p className="mt-2 text-lg font-bold">{teacherName || "—"}</p></Card>
          <Card className="p-5"><p className="text-sm text-muted-foreground">Tiết đã chấm công</p><p className="mt-2 text-3xl font-extrabold">{confirmedPeriods}</p></Card>
          <Card className="p-5"><p className="text-sm text-muted-foreground">Lịch chưa chấm công</p><p className="mt-2 text-3xl font-extrabold">{pendingSchedules}</p></Card>
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
          {loading || contextLoading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
          ) : error ? null : filteredRows.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="Chưa có dữ liệu chấm công trong tháng"
              description="Nếu bạn đã có lịch dạy, admin cần xác nhận chấm công để bản ghi xuất hiện. Nếu chưa có lịch, vui lòng chờ admin xếp thời khóa biểu."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[980px]">
                <thead><tr><th>Ngày</th><th>Lớp</th><th>Môn học</th><th>Tiết</th><th>Tiết tính công</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
                <tbody>
                  {filteredRows.map(({ schedule, checkin }) => {
                    const date = checkin?.date || (schedule ? scheduleDate(schedule) : "");
                    const status = checkin?.status;
                    const payable = checkin ? ["confirmed", "adjusted"].includes(String(checkin.status)) : false;
                    const periods = checkin ? (payable ? Number(checkin.payablePeriods ?? checkin.periodCount ?? 0) : 0) : 0;
                    return (
                      <tr key={schedule?.id || checkin?.id}>
                        <td>{formatDate(date)}</td>
                        <td>{checkin?.className || schedule?.className || schedule?.classId || "—"}</td>
                        <td>{checkin?.subjectName || schedule?.subjectName || schedule?.subjectId || "—"}</td>
                        <td>{schedule ? `${schedule.startPeriod || "?"}-${Math.max(Number(schedule.startPeriod || 1), Number(schedule.endPeriod || 1) - 1)}` : "—"}</td>
                        <td>{periods}</td>
                        <td><Badge tone={statusTone(status)}>{statusLabel(status)}</Badge></td>
                        <td><p className="max-w-xs truncate">{checkin?.note || checkin?.adjustmentReason || (status ? "—" : "Đang chờ admin xác nhận")}</p></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card className="p-5"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><CalendarDays className="h-5 w-5" /></div><div><p className="font-semibold">Lịch chưa chấm công</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Các dòng này lấy từ thời khóa biểu trong tháng nhưng chưa có bản ghi `checkins` tương ứng.</p></div></div></Card>
          <Card className="p-5"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></div><div><p className="font-semibold">Đã chấm công</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Sau khi admin xác nhận tại `/admin/payroll`, bản ghi sẽ chuyển sang đã chấm công hoặc đã điều chỉnh.</p></div></div></Card>
        </div>
      </Shell>
    </RoleGuard>
  );
}
