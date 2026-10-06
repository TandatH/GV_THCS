"use client";

import { Calculator, CheckCircle2, CircleDollarSign, Download, Sparkles } from "lucide-react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
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
import { formatCurrency, formatDate } from "@/lib/utils";

import { AttendanceKpiRibbon } from "./components/attendance-kpi-ribbon";
import { AttendanceToolbar } from "./components/attendance-toolbar";
import { AttendanceTableView } from "./components/attendance-table-view";
import { AttendanceByDateView } from "./components/attendance-by-date-view";
import { AttendanceByTeacherView } from "./components/attendance-by-teacher-view";
import { BatchConfirmModal } from "./components/batch-confirm-modal";
import { AdjustAttendanceModal } from "./components/adjust-attendance-modal";
import {
  type Row,
  type ScheduleWithMeta,
  type StatusFilter,
  type ViewMode,
  MONTH_OPTIONS,
  currentMonthString,
  localTodayDateOnly,
  dateFromScheduleRow,
  parseScheduleDateDetails,
  formatPeriodDisplay,
  statusLabelVi,
  statusBadgeTone,
} from "./types";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function rateDocId(teacherId: string, subjectId: string) {
  return `${teacherId}_${subjectId}`;
}

export default function AdminPayrollPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"attendance" | "summary" | "payroll">("attendance");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthString());

  // Global filters
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [teacherTypeFilter, setTeacherTypeFilter] = useState("all");

  // Attendance specific filters & views
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedTeacherId, setSelectedTeacherId] = useState("all");
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Data states
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [checkins, setCheckins] = useState<Row[]>([]);
  const [payrollRows, setPayrollRows] = useState<Row[]>([]);
  const [rateRows, setRateRows] = useState<Row[]>([]);
  const [auditRows, setAuditRows] = useState<Row[]>([]);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<ScheduleWithMeta | null>(null);
  const [adjustError, setAdjustError] = useState("");

  const [rateOpen, setRateOpen] = useState(false);
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const [rateError, setRateError] = useState("");
  const [rateForm, setRateForm] = useState({ teacherId: "", subjectId: "", ratePerPeriod: "" });

  const selectedYear = selectedMonth.slice(0, 4);
  const selectedMonthNumber = selectedMonth.slice(5, 7);

  // Firestore listeners
  useEffect(() => {
    setLoading(true);
    setError("");
    const unsubscribers = [
      onSnapshot(query(collection(firestore, "schedules"), limit(2000)), (snapshot) => {
        setSchedules(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setLoading(false); }),
      onSnapshot(query(collection(firestore, "teachers"), limit(500)), (snapshot) => {
        setTeachers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "subjects"), limit(500)), (snapshot) => {
        setSubjects(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "classes"), limit(500)), (snapshot) => {
        setClasses(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }, () => undefined),
      onSnapshot(query(collection(firestore, "departments"), limit(500)), (snapshot) => {
        setDepartments(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }, () => undefined),
      onSnapshot(query(collection(firestore, "payrollRates"), limit(500)), (snapshot) => {
        setRateRows(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "auditLogs"), limit(80)), (snapshot) => {
        setAuditRows(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }, () => undefined),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(query(collection(firestore, "checkins"), where("month", "==", selectedMonth), limit(2000)), (snapshot) => {
        setCheckins(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "payroll"), where("month", "==", selectedMonth), limit(500)), (snapshot) => {
        setPayrollRows(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [selectedMonth]);

  // Lookup maps
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const departmentById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const checkinByScheduleId = useMemo(() => new Map(checkins.map((c) => [String(c.scheduleId), c])), [checkins]);

  // Department options with fallback to unique teacher departmentIds
  const departmentOptions = useMemo(() => {
    if (departments.length > 0) {
      return departments.map((d) => ({
        id: d.id,
        name: d.name || d.code || d.id,
      }));
    }
    const set = new Set(teachers.map((t) => String(t.departmentId || "")).filter(Boolean));
    return Array.from(set).map((id) => ({ id, name: id }));
  }, [departments, teachers]);

  // Process raw schedules into structured ScheduleWithMeta
  const monthProcessedSchedules = useMemo(() => {
    const today = localTodayDateOnly();

    return schedules
      .filter((s) => s.status !== "cancelled" && dateFromScheduleRow(s).startsWith(selectedMonth))
      .map((schedule): ScheduleWithMeta => {
        const calculatedDate = dateFromScheduleRow(schedule);
        const dateDetails = parseScheduleDateDetails(calculatedDate);
        const isPast = Boolean(calculatedDate && calculatedDate <= today);
        const isToday = calculatedDate === today;
        const isUpcoming = Boolean(calculatedDate && calculatedDate > today);

        const checkinDoc = checkinByScheduleId.get(schedule.id);
        const assignedTeacher = teacherById.get(String(schedule.actualTeacherId || schedule.teacherId));
        const resolvedTeacherName = assignedTeacher?.fullName || schedule.teacherName || schedule.teacherId || "—";
        const resolvedTeacherCode = assignedTeacher?.teacherCode || "";

        const deptId = String(schedule.departmentId || assignedTeacher?.departmentId || "");
        const deptDoc = departmentById.get(deptId);
        const resolvedDepartmentName = deptDoc?.name || deptDoc?.code || deptId || "—";

        const classDoc = classById.get(String(schedule.classId));
        const resolvedClassName = classDoc?.name || classDoc?.code || schedule.className || schedule.classId || "—";

        const subjectDoc = subjectById.get(String(schedule.subjectId));
        const resolvedSubjectName = subjectDoc?.name || schedule.subjectName || subjectDoc?.code || schedule.subjectId || "—";

        const startPeriodNum = Math.max(1, Number(schedule.startPeriod || 1));
        const endPeriodNum = Number(schedule.endPeriod || 0);
        const periodInfo = formatPeriodDisplay(schedule.startPeriod, schedule.endPeriod);

        // Effective status resolution
        let effectiveStatus: ScheduleWithMeta["effectiveStatus"] = "upcoming";
        if (checkinDoc) {
          if (checkinDoc.status === "absent") {
            effectiveStatus = "absent";
          } else if (
            checkinDoc.status === "adjusted" ||
            (checkinDoc.teacherId && checkinDoc.teacherId !== (schedule.actualTeacherId || schedule.teacherId))
          ) {
            effectiveStatus = "adjusted";
          } else {
            effectiveStatus = "confirmed";
          }
        } else if (isPast) {
          effectiveStatus = "pending_past";
        } else {
          effectiveStatus = "upcoming";
        }

        const effectiveTeacherId = String(checkinDoc?.teacherId || schedule.actualTeacherId || schedule.teacherId || "");
        const effectiveTeacherDoc = teacherById.get(effectiveTeacherId);
        const effectiveTeacherName = checkinDoc?.teacherName || effectiveTeacherDoc?.fullName || resolvedTeacherName;
        const isSubstituted = Boolean(
          effectiveTeacherId &&
          effectiveTeacherId !== String(schedule.originalTeacherId || schedule.teacherId || "") &&
          effectiveStatus === "adjusted"
        );

        return {
          ...schedule,
          calculatedDate,
          dayOfWeekNumber: dateDetails.dayOfWeek,
          dayName: dateDetails.dayName,
          formattedDate: dateDetails.formattedDate,
          isPast,
          isToday,
          isUpcoming,
          resolvedTeacherName,
          resolvedTeacherCode,
          resolvedDepartmentName,
          resolvedClassName,
          resolvedSubjectName,
          startPeriodNum,
          endPeriodNum,
          periodLabel: periodInfo.label,
          periodCountNum: periodInfo.count,
          checkinDoc,
          effectiveStatus,
          effectiveTeacherId,
          effectiveTeacherName,
          isSubstituted,
        };
      })
      .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate) || a.startPeriodNum - b.startPeriodNum);
  }, [checkinByScheduleId, classById, departmentById, schedules, selectedMonth, subjectById, teacherById]);

  // Overall counts for KPI ribbon
  const kpiCounts = useMemo(() => {
    let total = 0;
    let confirmed = 0;
    let pendingPast = 0;
    let upcoming = 0;
    let adjusted = 0;
    let absent = 0;

    for (const item of monthProcessedSchedules) {
      total += 1;
      if (item.effectiveStatus === "confirmed") confirmed += 1;
      else if (item.effectiveStatus === "pending_past") pendingPast += 1;
      else if (item.effectiveStatus === "upcoming") upcoming += 1;
      else if (item.effectiveStatus === "adjusted") adjusted += 1;
      else if (item.effectiveStatus === "absent") absent += 1;
    }

    return { total, confirmed, pendingPast, upcoming, adjusted, absent };
  }, [monthProcessedSchedules]);

  // Past schedules that MUST be resolved before payroll can be calculated
  const unconfirmedPastSchedules = useMemo(() => {
    return monthProcessedSchedules.filter((s) => s.effectiveStatus === "pending_past");
  }, [monthProcessedSchedules]);

  // Available dates for secondary dropdown
  const availableDates = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const item of monthProcessedSchedules) {
      if (!item.calculatedDate) continue;
      const existing = map.get(item.calculatedDate);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(item.calculatedDate, {
          label: `${item.dayName}, ${item.formattedDate}`,
          count: 1,
        });
      }
    }
    return Array.from(map.entries())
      .map(([date, meta]) => ({ date, label: meta.label, count: meta.count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [monthProcessedSchedules]);

  // Filtered schedules according to all active criteria
  const filteredProcessedSchedules = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");

    return monthProcessedSchedules.filter((item) => {
      // 1. Department filter
      if (departmentFilter !== "all") {
        const teacher = teacherById.get(item.effectiveTeacherId);
        const matchesDept = item.departmentId === departmentFilter || teacher?.departmentId === departmentFilter;
        if (!matchesDept) return false;
      }

      // 2. Teacher type filter
      if (teacherTypeFilter !== "all") {
        const teacher = teacherById.get(item.effectiveTeacherId);
        const matchesType = item.teacherType === teacherTypeFilter || teacher?.teacherType === teacherTypeFilter;
        if (!matchesType) return false;
      }

      // 3. Status filter
      if (statusFilter !== "all" && item.effectiveStatus !== statusFilter) {
        return false;
      }

      // 4. Date filter
      if (selectedDate !== "all" && item.calculatedDate !== selectedDate) {
        return false;
      }

      // 5. Teacher filter
      if (selectedTeacherId !== "all" && item.effectiveTeacherId !== selectedTeacherId && item.teacherId !== selectedTeacherId) {
        return false;
      }

      // 6. Class filter
      if (selectedClassId !== "all" && item.classId !== selectedClassId) {
        return false;
      }

      // 7. Search keyword
      if (keyword) {
        const searchPool = [
          item.resolvedTeacherName,
          item.resolvedTeacherCode,
          item.effectiveTeacherName,
          item.resolvedClassName,
          item.resolvedSubjectName,
          item.resolvedDepartmentName,
          item.className,
          item.subjectName,
        ].filter(Boolean);

        const matches = searchPool.some((val) => String(val).toLocaleLowerCase("vi").includes(keyword));
        if (!matches) return false;
      }

      return true;
    });
  }, [
    departmentFilter,
    monthProcessedSchedules,
    search,
    selectedClassId,
    selectedDate,
    selectedTeacherId,
    statusFilter,
    teacherById,
    teacherTypeFilter,
  ]);

  const hasActiveFilters = Boolean(
    search.trim() ||
    statusFilter !== "all" ||
    selectedDate !== "all" ||
    selectedTeacherId !== "all" ||
    selectedClassId !== "all"
  );

  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSelectedDate("all");
    setSelectedTeacherId("all");
    setSelectedClassId("all");
  };

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllPage = (ids: string[]) => {
    if (ids.length === 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(ids));
    }
  };

  const handleClearSelection = () => {
    setSelectedRowIds(new Set());
  };

  // Core write checkin function (single)
  async function writeCheckin(
    schedule: ScheduleWithMeta | Row,
    override?: { status: "confirmed" | "adjusted" | "absent"; actualTeacherId: string; reason: string; note: string }
  ) {
    if (!user) return;
    const existing = checkinByScheduleId.get(schedule.id);
    const actualTeacherId = override?.actualTeacherId || String(schedule.actualTeacherId || schedule.teacherId || "");
    const teacher = teacherById.get(actualTeacherId);
    const status = override?.status || "confirmed";
    const periodCount = Math.max(1, Number(schedule.endPeriod || 0) - Number(schedule.startPeriod || 0));
    const payable = ["confirmed", "adjusted"].includes(status);

    const classDoc = classById.get(String(schedule.classId || ""));
    const subjectDoc = subjectById.get(String(schedule.subjectId || ""));
    const deptDoc = departmentById.get(String(schedule.departmentId || teacher?.departmentId || ""));

    await setDoc(doc(firestore, "checkins", `${selectedMonth}_${schedule.id}`), {
      scheduleId: schedule.id,
      month: selectedMonth,
      date: dateFromScheduleRow(schedule),
      teacherId: actualTeacherId,
      teacherName: teacher?.fullName || schedule.teacherName || actualTeacherId,
      departmentId: teacher?.departmentId || schedule.departmentId || "",
      departmentName: deptDoc?.name || deptDoc?.code || teacher?.departmentName || "",
      classId: schedule.classId || "",
      className: classDoc?.name || classDoc?.code || schedule.className || schedule.classId || "",
      subjectId: schedule.subjectId || "",
      subjectName: subjectDoc?.name || schedule.subjectName || subjectDoc?.code || schedule.subjectId || "",
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

  // Core batch checkin function
  async function writeCheckinsBatch(
    targetSchedules: (ScheduleWithMeta | Row)[],
    status: "confirmed" | "absent" = "confirmed",
    reason = "Xác nhận hàng loạt theo phân công"
  ) {
    if (!user || targetSchedules.length === 0) return;
    const chunkSize = 400; // safe margin for Firestore 500 limit

    for (let offset = 0; offset < targetSchedules.length; offset += chunkSize) {
      const chunk = targetSchedules.slice(offset, offset + chunkSize);
      const batch = writeBatch(firestore);

      for (const schedule of chunk) {
        const existing = checkinByScheduleId.get(schedule.id);
        const actualTeacherId = String(schedule.actualTeacherId || schedule.teacherId || "");
        const teacher = teacherById.get(actualTeacherId);
        const periodCount = Math.max(1, Number(schedule.endPeriod || 0) - Number(schedule.startPeriod || 0));
        const payable = status === "confirmed";

        const classDoc = classById.get(String(schedule.classId || ""));
        const subjectDoc = subjectById.get(String(schedule.subjectId || ""));
        const deptDoc = departmentById.get(String(schedule.departmentId || teacher?.departmentId || ""));

        const checkinRef = doc(firestore, "checkins", `${selectedMonth}_${schedule.id}`);
        batch.set(checkinRef, {
          scheduleId: schedule.id,
          month: selectedMonth,
          date: dateFromScheduleRow(schedule),
          teacherId: actualTeacherId,
          teacherName: teacher?.fullName || schedule.teacherName || actualTeacherId,
          departmentId: teacher?.departmentId || schedule.departmentId || "",
          departmentName: deptDoc?.name || deptDoc?.code || teacher?.departmentName || "",
          classId: schedule.classId || "",
          className: classDoc?.name || classDoc?.code || schedule.className || schedule.classId || "",
          subjectId: schedule.subjectId || "",
          subjectName: subjectDoc?.name || schedule.subjectName || subjectDoc?.code || schedule.subjectId || "",
          startPeriod: schedule.startPeriod || null,
          endPeriod: schedule.endPeriod || null,
          periodCount,
          payablePeriods: payable ? periodCount : 0,
          payable,
          status,
          actualTeacherId,
          originalTeacherId: schedule.originalTeacherId || schedule.teacherId || "",
          teacherType: teacher?.teacherType || schedule.teacherType || "",
          attendanceSource: "admin_confirmation_batch",
          confirmedAt: serverTimestamp(),
          confirmedBy: user.uid,
          adjustedBy: user.uid,
          adjustmentReason: reason,
          note: "",
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          ...(existing ? {} : { createdAt: serverTimestamp(), createdBy: user.uid, isActive: true }),
        }, { merge: true });
      }

      await batch.commit();
    }
  }

  // Single schedule quick confirmation
  async function confirmSchedule(schedule: ScheduleWithMeta) {
    setActionLoading(true);
    setError("");
    try {
      await writeCheckin(schedule);
      toast.success(`Đã xác nhận tiết dạy của ${schedule.resolvedTeacherName}`);
    } catch (submitError) {
      setError(firebaseDataErrorMessage(submitError));
    } finally {
      setActionLoading(false);
    }
  }

  // Submit modal adjustment
  async function handleAdjustSubmit(formData: {
    status: "confirmed" | "adjusted" | "absent";
    actualTeacherId: string;
    reason: string;
    note: string;
  }) {
    if (!adjustTarget) return;
    setActionLoading(true);
    setAdjustError("");
    try {
      await writeCheckin(adjustTarget, formData);
      setAdjustTarget(null);
      toast.success("Đã lưu thông tin điều chỉnh chấm công thành công.");
    } catch (submitError) {
      setAdjustError(firebaseDataErrorMessage(submitError));
    } finally {
      setActionLoading(false);
    }
  }

  // Batch confirm all unconfirmed past schedules
  async function handleBatchConfirmAllPast() {
    if (unconfirmedPastSchedules.length === 0) return;
    setActionLoading(true);
    setError("");
    try {
      await writeCheckinsBatch(unconfirmedPastSchedules, "confirmed", "Duyệt nhanh tất cả lịch đã qua");
      setBatchModalOpen(false);
      toast.success(`Đã xác nhận thành công ${unconfirmedPastSchedules.length} lịch dạy đã qua! Bảng lương đã được mở khóa.`);
    } catch (batchError) {
      setError(firebaseDataErrorMessage(batchError));
    } finally {
      setActionLoading(false);
    }
  }

  // Batch confirm selected checkbox rows
  async function handleBatchConfirmSelected(ids: string[], status: "confirmed" | "absent") {
    const targetItems = monthProcessedSchedules.filter((s) => ids.includes(s.id));
    if (targetItems.length === 0) return;
    setActionLoading(true);
    setError("");
    try {
      const reason = status === "confirmed" ? "Xác nhận hàng loạt đã dạy" : "Đánh dấu vắng hàng loạt";
      await writeCheckinsBatch(targetItems, status, reason);
      setSelectedRowIds(new Set());
      toast.success(`Đã cập nhật trạng thái cho ${targetItems.length} lịch dạy.`);
    } catch (batchError) {
      setError(firebaseDataErrorMessage(batchError));
    } finally {
      setActionLoading(false);
    }
  }

  // Batch confirm by date
  async function handleBatchConfirmDate(dateSchedules: ScheduleWithMeta[]) {
    setActionLoading(true);
    setError("");
    try {
      await writeCheckinsBatch(dateSchedules, "confirmed", `Duyệt nhanh lịch ngày ${dateSchedules[0]?.formattedDate || ""}`);
      toast.success(`Đã duyệt tất cả ${dateSchedules.length} tiết chờ trong ngày.`);
    } catch (batchError) {
      setError(firebaseDataErrorMessage(batchError));
    } finally {
      setActionLoading(false);
    }
  }

  // Batch confirm by teacher
  async function handleBatchConfirmTeacher(teacherSchedules: ScheduleWithMeta[]) {
    setActionLoading(true);
    setError("");
    try {
      await writeCheckinsBatch(teacherSchedules, "confirmed", `Duyệt nhanh lịch của ${teacherSchedules[0]?.resolvedTeacherName || ""}`);
      toast.success(`Đã duyệt tất cả ${teacherSchedules.length} tiết chờ của giáo viên.`);
    } catch (batchError) {
      setError(firebaseDataErrorMessage(batchError));
    } finally {
      setActionLoading(false);
    }
  }

  // Rate modal logic
  const visibleRateRows = useMemo(() => {
    return rateRows
      .filter((row) => {
        const teacher = teacherById.get(String(row.teacherId));
        return departmentFilter === "all" || teacher?.departmentId === departmentFilter;
      })
      .sort((a, b) => String(a.teacherName || a.teacherId).localeCompare(String(b.teacherName || b.teacherId), "vi"));
  }, [departmentFilter, rateRows, teacherById]);

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

  // Summary rows logic
  const summaryRows = useMemo(() => {
    return teachers
      .map((teacher) => {
        const teacherCheckins = checkins.filter(
          (c) => c.teacherId === teacher.id && ["confirmed", "adjusted"].includes(String(c.status))
        );
        const actualPeriods = teacherCheckins.reduce((sum, c) => sum + Number(c.periodCount || 0), 0);
        const standardPeriods = teacher.teacherType === "co_huu" ? Number(teacher.standardPeriodsPerWeek || 0) * 4 : null;
        const deptDoc = departmentById.get(String(teacher.departmentId || ""));
        const departmentName = deptDoc?.name || deptDoc?.code || teacher.departmentId || "—";

        return {
          teacherId: teacher.id,
          teacherName: teacher.fullName || teacher.email || teacher.id,
          teacherType: teacher.teacherType,
          departmentId: teacher.departmentId || "",
          departmentName,
          actualPeriods,
          standardPeriods,
          differencePeriods: standardPeriods === null ? null : actualPeriods - standardPeriods,
        };
      })
      .filter((row) => row.actualPeriods > 0 || departmentFilter === "all" || row.departmentId === departmentFilter);
  }, [checkins, departmentById, departmentFilter, teachers]);

  // Payroll rows logic
  const filteredPayrollRows = useMemo(() => {
    return payrollRows.filter((row) => {
      const teacher = teacherById.get(String(row.teacherId));
      const matchesDepartment = departmentFilter === "all" || teacher?.departmentId === departmentFilter;
      const matchesType = teacherTypeFilter === "all" || row.teacherType === teacherTypeFilter || teacher?.teacherType === teacherTypeFilter;
      return matchesDepartment && matchesType;
    });
  }, [departmentFilter, payrollRows, teacherById, teacherTypeFilter]);

  async function calculatePayroll() {
    setError("");
    if (unconfirmedPastSchedules.length > 0) {
      setError(
        `Còn ${unconfirmedPastSchedules.length} tiết dạy đã qua chưa được đối soát chấm công. Vui lòng xác nhận trước khi tính bảng lương.`
      );
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
        statusLabelVi(row.status),
      ];
    });
    const header = [
      "Giáo viên",
      "Loại giáo viên",
      "Số tiết thực dạy",
      "Số tiết chuẩn",
      "Số tiết vượt/thiếu",
      "Đơn giá",
      "Thành tiền",
      "Trạng thái",
    ];
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
          eyebrow="Nghiệp vụ thù lao"
          title="Chấm công & Bảng lương"
          description="Theo dõi lịch phân công, điểm danh tiết dạy, xử lý dạy thay và tự động chốt số liệu tính thù lao."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={exportPayrollCsv} disabled={filteredPayrollRows.length === 0}>
                <Download className="h-4 w-4" />
                Xuất CSV
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRateOpen(true);
                  setRateError("");
                }}
              >
                <CircleDollarSign className="h-4 w-4" />
                Đơn giá thù lao
              </Button>
              <Button loading={calculating} onClick={calculatePayroll} disabled={unconfirmedPastSchedules.length > 0}>
                <Calculator className="h-4 w-4" />
                Tính bảng lương
              </Button>
            </div>
          }
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* Global Controls Card */}
        <Card className="mb-5 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Tháng</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium"
                value={selectedMonthNumber}
                onChange={(e) => setMonthPart(e.target.value)}
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Năm</Label>
              <Input
                value={selectedYear}
                onChange={(e) => setYearPart(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>

            <div>
              <Label>Tổ / Bộ môn</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="all">Tất cả bộ môn</option>
                {departmentOptions.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Loại giáo viên</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={teacherTypeFilter}
                onChange={(e) => setTeacherTypeFilter(e.target.value)}
              >
                <option value="all">Tất cả loại giáo viên</option>
                <option value="co_huu">Cơ hữu</option>
                <option value="thinh_giang">Thỉnh giảng</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Main Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          <Button
            variant={tab === "attendance" ? "primary" : "secondary"}
            onClick={() => setTab("attendance")}
            className="relative"
          >
            Chấm công tiết dạy
            {kpiCounts.pendingPast > 0 ? (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {kpiCounts.pendingPast}
              </span>
            ) : null}
          </Button>
          <Button variant={tab === "summary" ? "primary" : "secondary"} onClick={() => setTab("summary")}>
            Tổng hợp theo tháng
          </Button>
          <Button variant={tab === "payroll" ? "primary" : "secondary"} onClick={() => setTab("payroll")}>
            Bảng lương tháng
          </Button>
        </div>

        {/* TAB 1: Chấm công (Industrial Standard Timesheet & Attendance) */}
        {tab === "attendance" && (
          <div className="space-y-4">
            {/* KPI Ribbon */}
            <AttendanceKpiRibbon
              total={kpiCounts.total}
              confirmed={kpiCounts.confirmed}
              pendingPast={kpiCounts.pendingPast}
              upcoming={kpiCounts.upcoming}
              adjusted={kpiCounts.adjusted}
              absent={kpiCounts.absent}
              activeFilter={statusFilter}
              onSelectFilter={(newFilter) => setStatusFilter(newFilter)}
              onOpenBatchModal={() => setBatchModalOpen(true)}
            />

            {/* Attendance Workspace Card */}
            <Card className="p-4 sm:p-5">
              {/* Toolbar */}
              <AttendanceToolbar
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedDate={selectedDate}
                onSelectedDateChange={setSelectedDate}
                availableDates={availableDates}
                selectedTeacherId={selectedTeacherId}
                onSelectedTeacherIdChange={setSelectedTeacherId}
                teachers={teachers}
                selectedClassId={selectedClassId}
                onSelectedClassIdChange={setSelectedClassId}
                classes={classes}
                counts={kpiCounts}
                totalFilteredCount={filteredProcessedSchedules.length}
                onResetFilters={handleResetFilters}
                hasActiveFilters={hasActiveFilters}
              />

              {/* View Rendering */}
              <div className="mt-5">
                {loading ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={index} className="h-14" />
                    ))}
                  </div>
                ) : viewMode === "table" ? (
                  <AttendanceTableView
                    schedules={filteredProcessedSchedules}
                    selectedIds={selectedRowIds}
                    onToggleSelect={handleToggleSelect}
                    onSelectAllPage={handleSelectAllPage}
                    onClearSelection={handleClearSelection}
                    onConfirmSchedule={confirmSchedule}
                    onAdjustSchedule={(s) => setAdjustTarget(s)}
                    onBatchConfirm={handleBatchConfirmSelected}
                    actionLoading={actionLoading}
                  />
                ) : viewMode === "by_date" ? (
                  <AttendanceByDateView
                    schedules={filteredProcessedSchedules}
                    onConfirmSchedule={confirmSchedule}
                    onAdjustSchedule={(s) => setAdjustTarget(s)}
                    onBatchConfirmDate={handleBatchConfirmDate}
                    actionLoading={actionLoading}
                  />
                ) : (
                  <AttendanceByTeacherView
                    schedules={filteredProcessedSchedules}
                    onConfirmSchedule={confirmSchedule}
                    onAdjustSchedule={(s) => setAdjustTarget(s)}
                    onBatchConfirmTeacher={handleBatchConfirmTeacher}
                    actionLoading={actionLoading}
                  />
                )}
              </div>
            </Card>

            {/* Audit Log Card */}
            <Card className="mt-6 overflow-hidden">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <h2 className="text-base font-bold">Lịch sử thay đổi chấm công (Audit Log)</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ghi nhận đầy đủ thông tin người duyệt, thời gian và lý do điều chỉnh theo quy trình kiểm soát.
                </p>
              </div>
              <div className="divide-y divide-border">
                {auditRows.slice(0, 6).map((row) => (
                  <div key={row.id} className="px-5 py-3 text-xs sm:px-6">
                    <p className="font-semibold text-foreground">{row.action || "Chấm công / Điều chỉnh"}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {row.entityType || "checkin"} · {row.entityId || "—"} · {formatDate(row.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: Tổng hợp theo tháng */}
        {tab === "summary" && (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <h2 className="text-lg font-bold">Tổng hợp tiết dạy theo tháng</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Số liệu tổng hợp chỉ tính các bản ghi chấm công đã xác nhận (Đã dạy / Đã điều chỉnh).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[840px]">
                <thead>
                  <tr>
                    <th>Giáo viên</th>
                    <th>Tổ bộ môn</th>
                    <th>Loại giáo viên</th>
                    <th>Số tiết thực dạy</th>
                    <th>Số tiết chuẩn (tháng)</th>
                    <th>Chênh lệch (Vượt/Thiếu)</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.teacherId}>
                      <td className="font-semibold">{row.teacherName}</td>
                      <td>{row.departmentName}</td>
                      <td>{row.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}</td>
                      <td className="font-bold text-foreground">{row.actualPeriods}</td>
                      <td>{row.standardPeriods ?? "—"}</td>
                      <td>
                        {row.differencePeriods !== null ? (
                          <span
                            className={
                              row.differencePeriods > 0
                                ? "font-bold text-emerald-700"
                                : row.differencePeriods < 0
                                  ? "font-bold text-rose-700"
                                  : "text-muted-foreground"
                            }
                          >
                            {row.differencePeriods > 0 ? `+${row.differencePeriods}` : row.differencePeriods}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* TAB 3: Bảng lương */}
        {tab === "payroll" && (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <h2 className="text-lg font-bold">Bảng lương & Thù lao tháng</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Dữ liệu được hệ thống tổng hợp tự động dựa trên số tiết thực dạy đã đối soát.
              </p>
            </div>
            {filteredPayrollRows.length === 0 ? (
              <EmptyState
                icon={<Calculator className="h-6 w-6" />}
                title="Chưa có bảng lương tháng này"
                description="Bấm 'Tính bảng lương' để hệ thống tính toán thù lao cho giáo viên."
                action={
                  <Button loading={calculating} onClick={calculatePayroll} disabled={unconfirmedPastSchedules.length > 0}>
                    Tính bảng lương
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[1080px]">
                  <thead>
                    <tr>
                      <th>Giáo viên</th>
                      <th>Loại giáo viên</th>
                      <th>Số tiết thực dạy</th>
                      <th>Số tiết chuẩn</th>
                      <th>Vượt/Thiếu</th>
                      <th>Đơn giá / Tiết</th>
                      <th>Thành tiền</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayrollRows.map((row) => {
                      const teacher = teacherById.get(String(row.teacherId));
                      const subjectAmounts = Array.isArray(row.subjectAmounts) ? row.subjectAmounts : [];
                      const rateText =
                        subjectAmounts.length > 1
                          ? `${subjectAmounts.length} mức đơn giá`
                          : row.ratePerPeriod === null || row.ratePerPeriod === undefined
                            ? "—"
                            : formatCurrency(Number(row.ratePerPeriod));

                      return (
                        <tr key={row.id}>
                          <td className="font-semibold">{teacher?.fullName || row.teacherId}</td>
                          <td>{row.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}</td>
                          <td className="font-bold text-foreground">{row.actualPeriods ?? 0}</td>
                          <td>{row.standardPeriods ?? "—"}</td>
                          <td>{row.differencePeriods ?? "—"}</td>
                          <td>{rateText}</td>
                          <td className="font-bold text-primary">
                            {row.amount === null || row.amount === undefined ? "—" : formatCurrency(Number(row.amount))}
                          </td>
                          <td>
                            <Badge tone={statusBadgeTone(row.status)}>{statusLabelVi(row.status)}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Modal Xác nhận hàng loạt cho lịch quá hạn */}
        <BatchConfirmModal
          open={batchModalOpen}
          onOpenChange={setBatchModalOpen}
          targetSchedules={unconfirmedPastSchedules}
          onConfirm={handleBatchConfirmAllPast}
          loading={actionLoading}
        />

        {/* Modal Điều chỉnh chấm công & Dạy thay */}
        <AdjustAttendanceModal
          open={Boolean(adjustTarget)}
          onOpenChange={(open) => !open && setAdjustTarget(null)}
          targetSchedule={adjustTarget}
          teachers={teachers}
          onSubmit={handleAdjustSubmit}
          loading={actionLoading}
          error={adjustError}
        />

        {/* Modal Đơn giá thù lao */}
        <Modal
          open={rateOpen}
          onOpenChange={setRateOpen}
          title="Đơn giá thù lao theo giáo viên và môn"
          description="Cấu hình đơn giá / 1 tiết cho từng giáo viên dạy từng môn để tính bảng lương tự động."
          wide
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRateOpen(false)}>
                Đóng
              </Button>
              <Button loading={rateSubmitting} onClick={saveRate}>
                Lưu đơn giá
              </Button>
            </div>
          }
        >
          <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
            <div className="space-y-4">
              <div>
                <Label>Giáo viên</Label>
                <select
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  value={rateForm.teacherId}
                  onChange={(e) => setRateForm((prev) => ({ ...prev, teacherId: e.target.value }))}
                >
                  <option value="">Chọn giáo viên</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.fullName || teacher.email || teacher.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Môn học</Label>
                <select
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  value={rateForm.subjectId}
                  onChange={(e) => setRateForm((prev) => ({ ...prev, subjectId: e.target.value }))}
                >
                  <option value="">Chọn môn học</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name || subject.code || subject.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Đơn giá / 1 tiết (VND)</Label>
                <Input
                  min="1"
                  type="number"
                  value={rateForm.ratePerPeriod}
                  onChange={(e) => setRateForm((prev) => ({ ...prev, ratePerPeriod: e.target.value }))}
                  placeholder="Ví dụ: 150000"
                />
              </div>

              {rateError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                  {rateError}
                </div>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted px-4 py-3">
                <p className="font-semibold text-sm">Đơn giá đã cấu hình</p>
                <p className="text-xs text-muted-foreground">{visibleRateRows.length} mức đơn giá</p>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {visibleRateRows.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Chưa có cấu hình đơn giá.
                  </div>
                ) : (
                  visibleRateRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="grid w-full gap-1 px-4 py-3 text-left text-xs transition hover:bg-muted"
                      onClick={() =>
                        setRateForm({
                          teacherId: String(row.teacherId || ""),
                          subjectId: String(row.subjectId || ""),
                          ratePerPeriod: String(row.ratePerPeriod || ""),
                        })
                      }
                    >
                      <span className="font-semibold text-foreground">
                        {row.teacherName || teacherById.get(String(row.teacherId))?.fullName || row.teacherId}
                      </span>
                      <span className="text-muted-foreground">
                        {row.subjectName || subjectById.get(String(row.subjectId))?.name || row.subjectId} ·{" "}
                        <strong className="text-primary">{formatCurrency(Number(row.ratePerPeriod || 0))}</strong>/tiết
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
