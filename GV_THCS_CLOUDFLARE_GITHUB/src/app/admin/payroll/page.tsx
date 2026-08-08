"use client";

import { Calculator, CheckCircle2, CircleDollarSign, Download, PencilLine, Search } from "lucide-react";
import { collection, doc, limit, onSnapshot, query, serverTimestamp, setDoc, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { calculateMonthlyPayroll, firebaseErrorMessage } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { dateOnlyFromDate } from "@/lib/date-only";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = DocumentData & { id: string };

const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateFromSchedule(schedule: Row) {
  if (!schedule.weekStart) return "";
  const date = new Date(String(schedule.weekStart));
  date.setDate(date.getDate() + Number(schedule.dayOfWeek || 2) - 2);
  return Number.isNaN(date.getTime()) ? "" : dateOnlyFromDate(date);
}

function statusLabel(status: unknown) {
  const labels: Record<string, string> = {
    confirmed: "Đã dạy",
    absent: "Vắng",
    adjusted: "Đã điều chỉnh",
    draft: "Nháp",
    paid: "Đã chi trả",
  };
  return typeof status === "string" ? labels[status] || status : "Chưa xác nhận";
}

function statusTone(status: unknown) {
  if (["confirmed", "paid"].includes(String(status))) return "success" as const;
  if (["absent"].includes(String(status))) return "danger" as const;
  if (["adjusted", "draft"].includes(String(status))) return "warning" as const;
  return "neutral" as const;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function rateDocId(teacherId: string, subjectId: string) {
  return `${teacherId}_${subjectId}`;
}

function localTodayDateOnly() {
  return dateOnlyFromDate(new Date());
}

function isPayableAttendanceStatus(status: unknown) {
  return ["confirmed", "adjusted"].includes(String(status));
}

export default function AdminPayrollPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"attendance" | "summary" | "payroll">("attendance");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [teacherTypeFilter, setTeacherTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [checkins, setCheckins] = useState<Row[]>([]);
  const [payrollRows, setPayrollRows] = useState<Row[]>([]);
  const [rateRows, setRateRows] = useState<Row[]>([]);
  const [auditRows, setAuditRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<Row | null>(null);
  const [adjustForm, setAdjustForm] = useState({ status: "confirmed", actualTeacherId: "", reason: "", note: "" });
  const [adjustError, setAdjustError] = useState("");
  const [rateOpen, setRateOpen] = useState(false);
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const [rateError, setRateError] = useState("");
  const [rateForm, setRateForm] = useState({ teacherId: "", subjectId: "", ratePerPeriod: "" });

  const selectedYear = selectedMonth.slice(0, 4);
  const selectedMonthNumber = selectedMonth.slice(5, 7);

  useEffect(() => {
    setLoading(true);
    setError("");
    const unsubscribers = [
      onSnapshot(query(collection(firestore, "schedules"), limit(700)), (snapshot) => {
        setSchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        setLoading(false);
      }, (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setLoading(false); }),
      onSnapshot(query(collection(firestore, "teachers"), limit(500)), (snapshot) => {
        setTeachers(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "subjects"), limit(500)), (snapshot) => {
        setSubjects(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "payrollRates"), limit(500)), (snapshot) => {
        setRateRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "auditLogs"), limit(80)), (snapshot) => {
        setAuditRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, () => undefined),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(query(collection(firestore, "checkins"), where("month", "==", selectedMonth), limit(700)), (snapshot) => {
        setCheckins(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "payroll"), where("month", "==", selectedMonth), limit(500)), (snapshot) => {
        setPayrollRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [selectedMonth]);

  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers]);
  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  const checkinByScheduleId = useMemo(() => new Map(checkins.map((checkin) => [String(checkin.scheduleId), checkin])), [checkins]);
  const departments = useMemo(() => Array.from(new Set(teachers.map((teacher) => String(teacher.departmentId || "")).filter(Boolean))), [teachers]);
  const visibleRateRows = useMemo(() => rateRows
    .filter((row) => {
      const teacher = teacherById.get(String(row.teacherId));
      return departmentFilter === "all" || teacher?.departmentId === departmentFilter;
    })
    .sort((first, second) => String(first.teacherName || first.teacherId).localeCompare(String(second.teacherName || second.teacherId), "vi")), [departmentFilter, rateRows, teacherById]);

  const monthSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.status !== "cancelled" && dateFromSchedule(schedule).startsWith(selectedMonth)),
    [schedules, selectedMonth],
  );
  const unconfirmedPastSchedules = useMemo(() => {
    const today = localTodayDateOnly();
    return monthSchedules.filter((schedule) => {
      const date = dateFromSchedule(schedule);
      return Boolean(date && date <= today && !checkinByScheduleId.has(schedule.id));
    });
  }, [checkinByScheduleId, monthSchedules]);

  const filteredSchedules = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return monthSchedules.filter((schedule) => {
      const teacher = teacherById.get(String(schedule.actualTeacherId || schedule.teacherId));
      const matchesKeyword = !keyword || [teacher?.fullName, schedule.className, schedule.classId, schedule.subjectName, schedule.subjectId]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(keyword));
      const matchesDepartment = departmentFilter === "all" || schedule.departmentId === departmentFilter || teacher?.departmentId === departmentFilter;
      return matchesKeyword && matchesDepartment;
    });
  }, [departmentFilter, monthSchedules, search, teacherById]);

  const summaryRows = useMemo(() => teachers.map((teacher) => {
    const teacherCheckins = checkins.filter((checkin) => checkin.teacherId === teacher.id && ["confirmed", "adjusted"].includes(String(checkin.status)));
    const actualPeriods = teacherCheckins.reduce((sum, checkin) => sum + Number(checkin.periodCount || 0), 0);
    const standardPeriods = teacher.teacherType === "co_huu" ? Number(teacher.standardPeriodsPerWeek || 0) * 4 : null;
    return {
      teacherId: teacher.id,
      teacherName: teacher.fullName || teacher.email || teacher.id,
      teacherType: teacher.teacherType,
      departmentId: teacher.departmentId || "",
      actualPeriods,
      standardPeriods,
      differencePeriods: standardPeriods === null ? null : actualPeriods - standardPeriods,
    };
  }).filter((row) => row.actualPeriods > 0 || departmentFilter === "all" || row.departmentId === departmentFilter), [checkins, departmentFilter, teachers]);

  const filteredPayrollRows = useMemo(() => payrollRows.filter((row) => {
    const teacher = teacherById.get(String(row.teacherId));
    const matchesDepartment = departmentFilter === "all" || teacher?.departmentId === departmentFilter;
    const matchesType = teacherTypeFilter === "all" || row.teacherType === teacherTypeFilter || teacher?.teacherType === teacherTypeFilter;
    return matchesDepartment && matchesType;
  }), [departmentFilter, payrollRows, teacherById, teacherTypeFilter]);

  async function writeCheckin(schedule: Row, override?: Partial<typeof adjustForm>) {
    if (!user) return;
    const existing = checkinByScheduleId.get(schedule.id);
    const actualTeacherId = override?.actualTeacherId || String(schedule.actualTeacherId || schedule.teacherId || "");
    const teacher = teacherById.get(actualTeacherId);
    const status = override?.status || "confirmed";
    const periodCount = Math.max(0, Number(schedule.endPeriod || 0) - Number(schedule.startPeriod || 0));
    const payable = isPayableAttendanceStatus(status);
    await setDoc(doc(firestore, "checkins", `${selectedMonth}_${schedule.id}`), {
      scheduleId: schedule.id,
      month: selectedMonth,
      date: dateFromSchedule(schedule),
      teacherId: actualTeacherId,
      teacherName: teacher?.fullName || schedule.teacherName || actualTeacherId,
      departmentId: teacher?.departmentId || schedule.departmentId || "",
      classId: schedule.classId || "",
      className: schedule.className || "",
      subjectId: schedule.subjectId || "",
      subjectName: schedule.subjectName || "",
      startPeriod: schedule.startPeriod || null,
      endPeriod: schedule.endPeriod || null,
      periodCount,
      payablePeriods: payable ? periodCount : 0,
      payable,
      status,
      actualTeacherId,
      originalTeacherId: schedule.originalTeacherId || schedule.teacherId || "",
      teacherType: teacher?.teacherType || schedule.teacherType || "",
      attendanceSource: "admin_confirmation",
      confirmedAt: serverTimestamp(),
      confirmedBy: user.uid,
      adjustedBy: user.uid,
      adjustmentReason: override?.reason || "Xác nhận đã dạy",
      note: override?.note || "",
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
      ...(existing ? {} : { createdAt: serverTimestamp(), createdBy: user.uid, isActive: true }),
    }, { merge: true });
  }

  async function confirmSchedule(schedule: Row) {
    setAdjusting(true);
    setError("");
    try {
      await writeCheckin(schedule);
      toast.success("Đã xác nhận chấm công.");
    } catch (submitError) {
      setError(firebaseDataErrorMessage(submitError));
    } finally {
      setAdjusting(false);
    }
  }

  async function submitAdjustment() {
    if (!adjustTarget) return;
    if (!adjustForm.reason.trim()) {
      setAdjustError("Vui lòng nhập lý do điều chỉnh.");
      return;
    }
    setAdjusting(true);
    setAdjustError("");
    try {
      await writeCheckin(adjustTarget, adjustForm);
      setAdjustTarget(null);
      setAdjustForm({ status: "confirmed", actualTeacherId: "", reason: "", note: "" });
      toast.success("Đã điều chỉnh chấm công.");
    } catch (submitError) {
      setAdjustError(firebaseDataErrorMessage(submitError));
    } finally {
      setAdjusting(false);
    }
  }

  async function saveRate() {
    if (!user) return;
    if (!rateForm.teacherId || !rateForm.subjectId || Number(rateForm.ratePerPeriod) <= 0) {
      setRateError("Vui lòng chọn giáo viên, môn học và nhập đơn giá/tiết lớn hơn 0.");
      return;
    }
    setRateSubmitting(true);
    setRateError("");
    try {
      const teacher = teacherById.get(rateForm.teacherId);
      const subject = subjectById.get(rateForm.subjectId);
      const existing = rateRows.find((row) => row.id === rateDocId(rateForm.teacherId, rateForm.subjectId));
      await setDoc(doc(firestore, "payrollRates", rateDocId(rateForm.teacherId, rateForm.subjectId)), {
        teacherId: rateForm.teacherId,
        teacherName: textValue(teacher?.fullName) || textValue(teacher?.email) || rateForm.teacherId,
        departmentId: textValue(teacher?.departmentId),
        subjectId: rateForm.subjectId,
        subjectName: textValue(subject?.name) || textValue(subject?.code) || rateForm.subjectId,
        ratePerPeriod: Number(rateForm.ratePerPeriod),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...(existing ? {} : { createdAt: serverTimestamp(), createdBy: user.uid, isActive: true }),
      }, { merge: true });
      toast.success("Đã lưu đơn giá/tiết.");
      setRateForm({ teacherId: "", subjectId: "", ratePerPeriod: "" });
    } catch (submitError) {
      setRateError(firebaseDataErrorMessage(submitError));
    } finally {
      setRateSubmitting(false);
    }
  }

  async function calculatePayroll() {
    setError("");
    if (unconfirmedPastSchedules.length > 0) {
      setError(`Còn ${unconfirmedPastSchedules.length} lịch dạy đã qua nhưng chưa được xác nhận chấm công. Hãy xác nhận “Đã dạy”, “Vắng” hoặc điều chỉnh giáo viên thực dạy trước khi tính bảng lương.`);
      setTab("attendance");
      return;
    }
    setCalculating(true);
    try {
      const result = await calculateMonthlyPayroll(selectedMonth);
      toast.success(`Đã tính bảng lương cho ${result.count} giáo viên.`);
      setTab("payroll");
    } catch (submitError) {
      setError(firebaseErrorMessage(submitError));
    } finally {
      setCalculating(false);
    }
  }

  function exportPayrollCsv() {
    const rows = filteredPayrollRows.map((row) => {
      const teacher = teacherById.get(String(row.teacherId));
      return [
        teacher?.fullName || row.teacherId,
        row.teacherType || teacher?.teacherType || "",
        row.actualPeriods ?? 0,
        row.standardPeriods ?? "",
        row.differencePeriods ?? "",
        row.ratePerPeriod ?? "",
        row.amount ?? "",
        statusLabel(row.status),
      ];
    });
    const header = ["Giáo viên", "Loại giáo viên", "Số tiết thực dạy", "Số tiết chuẩn", "Số tiết vượt/thiếu", "Đơn giá", "Thành tiền", "Trạng thái"];
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bang-luong-${selectedMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function setMonthPart(month: string) {
    setSelectedMonth(`${selectedYear}-${month}`);
  }

  function setYearPart(year: string) {
    setSelectedMonth(`${year}-${selectedMonthNumber}`);
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Chấm công và bảng lương"
          title="Quản lý chấm công, tổng hợp tháng và bảng lương"
          description="Lịch dạy chỉ là phân công. Chỉ bản ghi chấm công đã xác nhận (Đã dạy/Đã điều chỉnh) mới được tính là tiết thực dạy và đưa vào thù lao."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={exportPayrollCsv} disabled={filteredPayrollRows.length === 0}><Download className="h-4 w-4" />Xuất CSV</Button>
              <Button variant="secondary" onClick={() => { setRateOpen(true); setRateError(""); }}><CircleDollarSign className="h-4 w-4" />Thành tiền</Button>
              <Button loading={calculating} onClick={calculatePayroll} disabled={unconfirmedPastSchedules.length > 0}><Calculator className="h-4 w-4" />Tính bảng lương</Button>
            </div>
          }
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {unconfirmedPastSchedules.length > 0 ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Còn <strong>{unconfirmedPastSchedules.length}</strong> lịch dạy đã qua chưa xác nhận chấm công. Bảng lương sẽ bị khóa tính cho đến khi các lịch này được xác nhận “Đã dạy”, “Vắng” hoặc điều chỉnh giáo viên thực dạy.
          </div>
        ) : null}

        <Card className="mb-5 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr]">
            <div><Label>Tháng</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={selectedMonthNumber} onChange={(event) => setMonthPart(event.target.value)}>{months.map((month) => <option key={month} value={month}>Tháng {month}</option>)}</select></div>
            <div><Label>Năm</Label><Input value={selectedYear} onChange={(event) => setYearPart(event.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
            <div><Label>Bộ môn</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">Tất cả bộ môn</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></div>
            <div><Label>Loại giáo viên</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={teacherTypeFilter} onChange={(event) => setTeacherTypeFilter(event.target.value)}><option value="all">Tất cả</option><option value="co_huu">Cơ hữu</option><option value="thinh_giang">Thỉnh giảng</option></select></div>
          </div>
        </Card>

        <div className="mb-5 flex flex-wrap gap-2">
          <Button variant={tab === "attendance" ? "primary" : "secondary"} onClick={() => setTab("attendance")}>Chấm công</Button>
          <Button variant={tab === "summary" ? "primary" : "secondary"} onClick={() => setTab("summary")}>Tổng hợp theo tháng</Button>
          <Button variant={tab === "payroll" ? "primary" : "secondary"} onClick={() => setTab("payroll")}>Bảng lương</Button>
        </div>

        {tab === "attendance" ? (
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm giáo viên, lớp, môn học..." />
              </div>
              <p className="text-sm text-muted-foreground">{filteredSchedules.length} lịch trong tháng</p>
            </div>
            {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div> : filteredSchedules.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Chưa có lịch trong tháng" description="Không có lịch phù hợp với tháng và bộ lọc hiện tại." />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[1180px]">
                  <thead><tr><th>Ngày</th><th>Giáo viên</th><th>Lớp</th><th>Môn học</th><th>Tiết</th><th>Trạng thái</th><th>Giáo viên thực dạy</th><th>Người điều chỉnh</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {filteredSchedules.map((schedule) => {
                      const checkin = checkinByScheduleId.get(schedule.id);
                      const teacher = teacherById.get(String(schedule.actualTeacherId || schedule.teacherId));
                      return (
                        <tr key={schedule.id}>
                          <td>{formatDate(dateFromSchedule(schedule))}</td>
                          <td><p className="font-semibold">{teacher?.fullName || schedule.teacherName || schedule.teacherId}</p><p className="text-xs text-muted-foreground">{schedule.departmentId || teacher?.departmentId || "—"}</p></td>
                          <td>{schedule.className || schedule.classId || "—"}</td>
                          <td>{schedule.subjectName || schedule.subjectId || "—"}</td>
                          <td>{schedule.startPeriod || "—"}-{schedule.endPeriod ? Math.max(Number(schedule.startPeriod || 1), Number(schedule.endPeriod) - 1) : "—"}</td>
                          <td><Badge tone={statusTone(checkin?.status)}>{statusLabel(checkin?.status)}</Badge></td>
                          <td>{checkin?.teacherName || teacher?.fullName || "—"}</td>
                          <td>{checkin?.adjustedBy || "—"}</td>
                          <td><p className="max-w-xs truncate">{checkin?.note || checkin?.adjustmentReason || "—"}</p></td>
                          <td><div className="flex gap-2"><Button size="sm" loading={adjusting} onClick={() => confirmSchedule(schedule)}><CheckCircle2 className="h-4 w-4" />Xác nhận</Button><Button size="sm" variant="secondary" onClick={() => { setAdjustTarget(schedule); setAdjustForm({ status: String(checkin?.status || "confirmed"), actualTeacherId: String(checkin?.teacherId || schedule.actualTeacherId || schedule.teacherId || ""), reason: String(checkin?.adjustmentReason || ""), note: String(checkin?.note || "") }); }}><PencilLine className="h-4 w-4" />Điều chỉnh</Button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}

        {tab === "summary" ? (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-lg font-bold">Tổng hợp theo tháng</h2><p className="mt-1 text-sm text-muted-foreground">Dựa trên các bản ghi chấm công đã xác nhận.</p></div>
            <div className="overflow-x-auto"><table className="data-table min-w-[820px]"><thead><tr><th>Giáo viên</th><th>Bộ môn</th><th>Loại</th><th>Số tiết thực dạy</th><th>Số tiết chuẩn</th><th>Vượt/thiếu</th></tr></thead><tbody>{summaryRows.map((row) => <tr key={row.teacherId}><td className="font-semibold">{row.teacherName}</td><td>{row.departmentId || "—"}</td><td>{row.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}</td><td>{row.actualPeriods}</td><td>{row.standardPeriods ?? "—"}</td><td>{row.differencePeriods ?? "—"}</td></tr>)}</tbody></table></div>
          </Card>
        ) : null}

        {tab === "payroll" ? (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-lg font-bold">Bảng lương</h2><p className="mt-1 text-sm text-muted-foreground">Dữ liệu được đọc từ collection payroll sau khi Cloud Function tính toán.</p></div>
            {filteredPayrollRows.length === 0 ? <EmptyState icon={<Calculator className="h-6 w-6" />} title="Chưa có bảng lương" description="Bấm Tính bảng lương để chạy Cloud Function và tải dữ liệu tháng này." action={<Button loading={calculating} onClick={calculatePayroll} disabled={unconfirmedPastSchedules.length > 0}>Tính bảng lương</Button>} /> : (
              <div className="overflow-x-auto"><table className="data-table min-w-[1080px]"><thead><tr><th>Giáo viên</th><th>Loại giáo viên</th><th>Số tiết thực dạy</th><th>Số tiết chuẩn</th><th>Số tiết vượt/thiếu</th><th>Đơn giá</th><th>Thành tiền</th><th>Trạng thái</th></tr></thead><tbody>{filteredPayrollRows.map((row) => { const teacher = teacherById.get(String(row.teacherId)); const subjectAmounts = Array.isArray(row.subjectAmounts) ? row.subjectAmounts : []; const rateText = subjectAmounts.length > 1 ? `${subjectAmounts.length} mức đơn giá` : row.ratePerPeriod === null || row.ratePerPeriod === undefined ? "—" : formatCurrency(Number(row.ratePerPeriod)); return <tr key={row.id}><td className="font-semibold">{teacher?.fullName || row.teacherId}</td><td>{row.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}</td><td>{row.actualPeriods ?? 0}</td><td>{row.standardPeriods ?? "—"}</td><td>{row.differencePeriods ?? "—"}</td><td>{rateText}</td><td>{row.amount === null || row.amount === undefined ? "—" : formatCurrency(Number(row.amount))}</td><td><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></td></tr>; })}</tbody></table></div>
            )}
          </Card>
        ) : null}

        {tab === "attendance" ? (
          <Card className="mt-5 overflow-hidden">
            <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-lg font-bold">Audit log gần đây</h2><p className="mt-1 text-sm text-muted-foreground">Các thay đổi nghiệp vụ được ghi bởi backend hoặc các chức năng đã có audit.</p></div>
            <div className="divide-y divide-border">{auditRows.slice(0, 6).map((row) => <div key={row.id} className="px-5 py-3 text-sm sm:px-6"><p className="font-semibold">{row.action || "audit"}</p><p className="text-muted-foreground">{row.entityType || "—"}/{row.entityId || "—"} · {formatDate(row.createdAt)}</p></div>)}</div>
          </Card>
        ) : null}

        <Modal open={Boolean(adjustTarget)} onOpenChange={(open) => !open && setAdjustTarget(null)} title="Điều chỉnh chấm công" description="Nhập lý do điều chỉnh để lưu cùng bản ghi chấm công." footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdjustTarget(null)}>Hủy</Button><Button loading={adjusting} onClick={submitAdjustment}>Lưu điều chỉnh</Button></div>}>
          <div className="space-y-4">
            <div><Label>Trạng thái</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={adjustForm.status} onChange={(event) => setAdjustForm((current) => ({ ...current, status: event.target.value }))}><option value="confirmed">Đã dạy</option><option value="absent">Vắng</option><option value="adjusted">Đã điều chỉnh</option></select></div>
            <div><Label>Giáo viên thực dạy</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={adjustForm.actualTeacherId} onChange={(event) => setAdjustForm((current) => ({ ...current, actualTeacherId: event.target.value }))}>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName || teacher.email || teacher.id}</option>)}</select></div>
            <div><Label>Lý do điều chỉnh</Label><Input value={adjustForm.reason} onChange={(event) => setAdjustForm((current) => ({ ...current, reason: event.target.value }))} /></div>
            <div><Label>Ghi chú</Label><textarea className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={adjustForm.note} onChange={(event) => setAdjustForm((current) => ({ ...current, note: event.target.value }))} /></div>
            {adjustError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{adjustError}</div> : null}
          </div>
        </Modal>

        <Modal open={rateOpen} onOpenChange={setRateOpen} title="Thành tiền theo giáo viên và môn" description="Nhập đơn giá/tiết cho từng giáo viên dạy từng môn. Cloud Function sẽ dùng cấu hình này khi tính bảng lương." wide footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRateOpen(false)}>Đóng</Button><Button loading={rateSubmitting} onClick={saveRate}>Lưu đơn giá</Button></div>}>
          <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
            <div className="space-y-4">
              <div><Label>Giáo viên</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={rateForm.teacherId} onChange={(event) => setRateForm((current) => ({ ...current, teacherId: event.target.value }))}><option value="">Chọn giáo viên</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName || teacher.email || teacher.id}</option>)}</select></div>
              <div><Label>Môn học</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={rateForm.subjectId} onChange={(event) => setRateForm((current) => ({ ...current, subjectId: event.target.value }))}><option value="">Chọn môn học</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name || subject.code || subject.id}</option>)}</select></div>
              <div><Label>Giá tiền / 1 tiết</Label><Input min="1" type="number" value={rateForm.ratePerPeriod} onChange={(event) => setRateForm((current) => ({ ...current, ratePerPeriod: event.target.value }))} placeholder="Ví dụ: 150000" /></div>
              {rateError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{rateError}</div> : null}
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted px-4 py-3"><p className="font-semibold">Đơn giá đã cấu hình</p><p className="text-xs text-muted-foreground">{visibleRateRows.length} mức đơn giá</p></div>
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {visibleRateRows.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa có đơn giá.</div> : visibleRateRows.map((row) => <button key={row.id} className="grid w-full gap-1 px-4 py-3 text-left text-sm hover:bg-muted" onClick={() => setRateForm({ teacherId: String(row.teacherId || ""), subjectId: String(row.subjectId || ""), ratePerPeriod: String(row.ratePerPeriod || "") })}><span className="font-semibold">{row.teacherName || teacherById.get(String(row.teacherId))?.fullName || row.teacherId}</span><span className="text-xs text-muted-foreground">{row.subjectName || subjectById.get(String(row.subjectId))?.name || row.subjectId} · {formatCurrency(Number(row.ratePerPeriod || 0))}/tiết</span></button>)}
              </div>
            </div>
          </div>
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
