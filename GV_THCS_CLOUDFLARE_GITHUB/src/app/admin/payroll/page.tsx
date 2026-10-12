"use client";

import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Filter,
  FileCheck,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
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
import { PayrollKpiCards } from "./components/payroll-kpi-cards";
import { PrincipalPayrollTable } from "./components/principal-payroll-table";
import { PrincipalAdjustmentModal } from "./components/principal-adjustment-modal";
import { TeacherScheduleDrawer } from "./components/teacher-schedule-drawer";

import {
  type PayrollApprovalStatus,
  type Row,
  type ScheduleWithMeta,
  type StatusFilter,
  type TeacherPayrollSummaryRow,
  type TeachingLevel,
  type ViewMode,
  MONTH_OPTIONS,
  cleanNoteText,
  currentMonthString,
  dateFromScheduleRow,
  formatPeriodDisplay,
  localTodayDateOnly,
  parseScheduleDateDetails,
  payrollStatusLabelVi,
  resolveScheduleSchoolLevel,
  resolveTeacherLevel,
  statusBadgeTone,
  statusLabelVi,
  teachingLevelLabelVi,
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
  const { user, role } = useAuth();

  // Role flags (RBAC)
  const isPrincipal = role === "bgh";
  const isAdmin = role === "admin";
  const canEditPayroll = isPrincipal || isAdmin;
  const showAuditLog = !isPrincipal; // ẨN HOÀN TOÀN AUDIT LOG đối với Hiệu trưởng

  // Primary active tab
  const [tab, setTab] = useState<"summary" | "attendance">("summary");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthString());

  // High-level filters
  const [schoolLevelFilter, setSchoolLevelFilter] = useState<"ALL" | "PRIMARY" | "SECONDARY" | "BOTH">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [teacherTypeFilter, setTeacherTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Attendance specific filters & views
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedTeacherId, setSelectedTeacherId] = useState("all");
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Firestore raw collections
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [checkins, setCheckins] = useState<Row[]>([]);
  const [payrollRows, setPayrollRows] = useState<Row[]>([]);
  const [rateRows, setRateRows] = useState<Row[]>([]);
  const [auditRows, setAuditRows] = useState<Row[]>([]);

  // Loading & State flags
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals & Drawers
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<ScheduleWithMeta | null>(null);
  const [adjustError, setAdjustError] = useState("");

  const [principalEditRow, setPrincipalEditRow] = useState<TeacherPayrollSummaryRow | null>(null);
  const [detailDrawerRow, setDetailDrawerRow] = useState<TeacherPayrollSummaryRow | null>(null);
  const [confirmApproveAllOpen, setConfirmApproveAllOpen] = useState(false);
  const [confirmReviewAllOpen, setConfirmReviewAllOpen] = useState(false);

  // Rate modal logic (admin only)
  const [rateOpen, setRateOpen] = useState(false);
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const [rateError, setRateError] = useState("");
  const [rateForm, setRateForm] = useState({ teacherId: "", subjectId: "", ratePerPeriod: "" });

  const selectedYear = selectedMonth.slice(0, 4);
  const selectedMonthNumber = selectedMonth.slice(5, 7);

  // Real-time Firestore Listeners
  useEffect(() => {
    setLoading(true);
    setError("");
    const unsubscribers = [
      onSnapshot(
        query(collection(firestore, "schedules"), limit(2000)),
        (snapshot) => {
          setSchedules(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          setLoading(false);
        },
        (snapshotError) => {
          setError(firebaseDataErrorMessage(snapshotError));
          setLoading(false);
        }
      ),
      onSnapshot(
        query(collection(firestore, "teachers"), limit(500)),
        (snapshot) => {
          setTeachers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        },
        (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))
      ),
      onSnapshot(
        query(collection(firestore, "subjects"), limit(500)),
        (snapshot) => {
          setSubjects(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        },
        (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))
      ),
      onSnapshot(
        query(collection(firestore, "classes"), limit(500)),
        (snapshot) => {
          setClasses(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        },
        () => undefined
      ),
      onSnapshot(
        query(collection(firestore, "departments"), limit(500)),
        (snapshot) => {
          setDepartments(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        },
        () => undefined
      ),
      onSnapshot(
        query(collection(firestore, "payrollRates"), limit(500)),
        (snapshot) => {
          setRateRows(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        },
        (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))
      ),
      ...(showAuditLog
        ? [
            onSnapshot(
              query(collection(firestore, "auditLogs"), limit(80)),
              (snapshot) => {
                setAuditRows(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
              },
              () => undefined
            ),
          ]
        : []),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [showAuditLog]);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(
        query(collection(firestore, "checkins"), where("month", "==", selectedMonth), limit(2000)),
        (snapshot) => {
          setCheckins(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        },
        (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))
      ),
      onSnapshot(
        query(collection(firestore, "payroll"), where("month", "==", selectedMonth), limit(500)),
        (snapshot) => {
          setPayrollRows(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        },
        (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))
      ),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [selectedMonth]);

  // Lookup Maps
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const departmentById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const checkinByScheduleId = useMemo(() => new Map(checkins.map((c) => [String(c.scheduleId), c])), [checkins]);
  const payrollByTeacherId = useMemo(() => new Map(payrollRows.map((p) => [String(p.teacherId), p])), [payrollRows]);

  // Department options
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

  // Process raw schedules into structured ScheduleWithMeta with multi-level awareness
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

        const originalTeacherId = String(schedule.originalTeacherId || schedule.teacherId || "");
        const originalTeacherDoc = teacherById.get(originalTeacherId);
        const originalTeacherName =
          originalTeacherDoc?.fullName ||
          schedule.originalTeacherName ||
          schedule.teacherName ||
          originalTeacherId ||
          "—";
        const originalTeacherCode = originalTeacherDoc?.teacherCode || "";

        const checkinDoc = checkinByScheduleId.get(schedule.id);
        const effectiveTeacherId = String(
          checkinDoc?.teacherId || schedule.actualTeacherId || schedule.teacherId || ""
        );
        const effectiveTeacherDoc = teacherById.get(effectiveTeacherId);
        const effectiveTeacherName =
          checkinDoc?.teacherName ||
          effectiveTeacherDoc?.fullName ||
          (effectiveTeacherId === originalTeacherId ? originalTeacherName : effectiveTeacherId) ||
          "—";

        const isSubstituted = Boolean(
          originalTeacherId &&
          effectiveTeacherId &&
          effectiveTeacherId !== originalTeacherId
        );

        const assignedTeacher = effectiveTeacherDoc || originalTeacherDoc;
        const resolvedTeacherName = originalTeacherName;
        const resolvedTeacherCode = originalTeacherCode || assignedTeacher?.teacherCode || "";

        const deptId = String(schedule.departmentId || assignedTeacher?.departmentId || "");
        const deptDoc = departmentById.get(deptId);
        const resolvedDepartmentName = deptDoc?.name || deptDoc?.code || deptId || "—";

        const classDoc = classById.get(String(schedule.classId));
        const resolvedClassName = classDoc?.name || classDoc?.code || schedule.className || schedule.classId || "—";

        const subjectDoc = subjectById.get(String(schedule.subjectId));
        const resolvedSubjectName =
          subjectDoc?.name || schedule.subjectName || subjectDoc?.code || schedule.subjectId || "—";

        const startPeriodNum = Math.max(1, Number(schedule.startPeriod || 1));
        const endPeriodNum = Number(schedule.endPeriod || 0);
        const periodInfo = formatPeriodDisplay(schedule.startPeriod, schedule.endPeriod);

        // Multi-level classification
        const schoolLevel = resolveScheduleSchoolLevel(schedule, classDoc);
        const schoolLevelLabel = schoolLevel === "PRIMARY" ? "Cấp 1" : "Cấp 2";

        // Effective status resolution
        let effectiveStatus: ScheduleWithMeta["effectiveStatus"] = "upcoming";
        if (checkinDoc) {
          if (checkinDoc.status === "absent") {
            effectiveStatus = "absent";
          } else if (
            checkinDoc.status === "adjusted" ||
            isSubstituted
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

        const cleanedNote = cleanNoteText(checkinDoc?.adjustmentReason, checkinDoc?.note);

        return {
          ...schedule,
          calculatedDate,
          dayOfWeekNumber: dateDetails.dayOfWeek,
          dayName: dateDetails.dayName,
          formattedDate: dateDetails.formattedDate,
          isPast,
          isToday,
          isUpcoming,
          originalTeacherId,
          originalTeacherName,
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
          schoolLevel,
          schoolLevelLabel,
          cleanedNote,
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

  // Unconfirmed past schedules (blocking payroll calculation)
  const unconfirmedPastSchedules = useMemo(() => {
    return monthProcessedSchedules.filter((s) => s.effectiveStatus === "pending_past");
  }, [monthProcessedSchedules]);

  // Multi-Level Teacher Summary Rows Calculation (Core Engine)
  const allTeacherPayrollRows = useMemo(() => {
    return teachers
      .filter((t) => t.status !== "inactive")
      .map((teacher): TeacherPayrollSummaryRow => {
        const teacherSchedules = monthProcessedSchedules.filter(
          (s) =>
            s.effectiveTeacherId === teacher.id ||
            s.actualTeacherId === teacher.id ||
            s.teacherId === teacher.id ||
            s.originalTeacherId === teacher.id
        );

        // Confirmed or adjusted teaching checkins (Người thực dạy)
        const validTeachingSchedules = monthProcessedSchedules.filter(
          (s) =>
            s.effectiveTeacherId === teacher.id &&
            ["confirmed", "adjusted"].includes(s.effectiveStatus)
        );

        // Primary vs Secondary breakdown
        const primarySchedules = validTeachingSchedules.filter((s) => s.schoolLevel === "PRIMARY");
        const secondarySchedules = validTeachingSchedules.filter((s) => s.schoolLevel === "SECONDARY");

        const rawPrimaryActual = primarySchedules.reduce((sum, s) => sum + s.periodCountNum, 0);
        const rawSecondaryActual = secondarySchedules.reduce((sum, s) => sum + s.periodCountNum, 0);

        // Substitutions (Dạy thay +): Số tiết GV này đi dạy thay cho người khác
        const substituteSchedules = validTeachingSchedules.filter((s) => s.isSubstituted);
        const substituteCount = substituteSchedules.reduce((sum, s) => sum + s.periodCountNum, 0);

        // Absences (Báo vắng -):
        // 1. Các lịch bị đánh dấu vắng (absent)
        // 2. Các lịch vốn của GV này nhưng nghỉ/vắng và có người khác dạy thay (trừ tiết của GV nghỉ để chuyển cho người dạy thay)
        const absentSchedules = teacherSchedules.filter((s) => {
          if (s.effectiveStatus === "absent") {
            return (s.originalTeacherId || s.teacherId) === teacher.id || s.effectiveTeacherId === teacher.id;
          }
          const wasOriginalTeacher = (s.originalTeacherId || s.teacherId) === teacher.id;
          const anotherTeacherTaught = s.effectiveTeacherId && s.effectiveTeacherId !== teacher.id;
          return wasOriginalTeacher && anotherTeacherTaught && ["confirmed", "adjusted"].includes(s.effectiveStatus);
        });
        const absentCount = absentSchedules.reduce((sum, s) => sum + s.periodCountNum, 0);

        // Level classification
        const teachingLevel = resolveTeacherLevel(teacher, rawPrimaryActual, rawSecondaryActual);
        const teachingLevelLabel = teachingLevelLabelVi(teachingLevel);

        // Firestore payroll doc check
        const payrollDoc = payrollByTeacherId.get(teacher.id);

        const primaryActual =
          payrollDoc?.overridePrimaryActual !== undefined
            ? Number(payrollDoc.overridePrimaryActual)
            : rawPrimaryActual;
        const secondaryActual =
          payrollDoc?.overrideSecondaryActual !== undefined
            ? Number(payrollDoc.overrideSecondaryActual)
            : rawSecondaryActual;

        // Standard periods (định mức tiết/tháng)
        const isAdjunct = teacher.teacherType === "thinh_giang";
        const standardWeeks = 4;
        const teacherConfiguredWeekly = Number(teacher.standardPeriodsPerWeek || 0);

        let primaryStandard: number | null = null;
        let secondaryStandard: number | null = null;

        if (!isAdjunct) {
          if (teachingLevel === "PRIMARY") {
            // Chuẩn Tiểu học: 20-23 tiết/tuần (mặc định 20 tiết * 4 tuần = 80 tiết)
            primaryStandard = Math.round((teacherConfiguredWeekly || 20) * standardWeeks);
            secondaryStandard = null;
          } else if (teachingLevel === "SECONDARY") {
            // Chuẩn THCS: 19 tiết/tuần (19 tiết * 4 tuần = 76 tiết)
            primaryStandard = null;
            secondaryStandard = Math.round((teacherConfiguredWeekly || 19) * standardWeeks);
          } else {
            // LIÊN CẤP (Cả 2 cấp): C1: 40 tiết | C2: 40 tiết (tổng 80 tiết chuẩn)
            const totalStandard = Math.round((teacherConfiguredWeekly || 20) * standardWeeks);
            primaryStandard = Math.round(totalStandard / 2); // 40 tiết C1
            secondaryStandard = totalStandard - primaryStandard; // 40 tiết C2
          }
        }

        // Overtime (Tiết phụ trội: chỉ tính khi thực dạy vượt định mức, không để số âm)
        let overtimePeriods = 0;
        if (!isAdjunct) {
          const pOver = primaryStandard !== null ? Math.max(0, primaryActual - primaryStandard) : 0;
          const sOver = secondaryStandard !== null ? Math.max(0, secondaryActual - secondaryStandard) : 0;
          overtimePeriods = pOver + sOver;
        }

        // Rates (Đơn giá theo cấp học)
        const primaryRate = Number(
          payrollDoc?.overridePrimaryRate ||
            teacher.primaryRatePerPeriod ||
            (teachingLevel === "PRIMARY" ? teacher.ratePerPeriod : null) ||
            teacher.ratePerPeriod ||
            120000
        );
        const secondaryRate = Number(
          payrollDoc?.overrideSecondaryRate ||
            teacher.secondaryRatePerPeriod ||
            (teachingLevel === "SECONDARY" ? teacher.ratePerPeriod : null) ||
            teacher.ratePerPeriod ||
            150000
        );

        // Thù lao độc lập cho từng cấp:
        // Thù lao C1 = Số tiết C1 × Đơn giá C1
        // Thù lao C2 = Số tiết C2 × Đơn giá C2
        const primaryAmount = primaryActual * primaryRate;
        const secondaryAmount = secondaryActual * secondaryRate;

        const adjustmentAmount = Number(payrollDoc?.adjustmentAmount || 0);
        const adjustmentReason = String(payrollDoc?.adjustmentReason || "");

        // Tổng thù lao/lương = Thù lao C1 + Thù lao C2 + Khoản điều chỉnh BGH
        const calculatedTotal = Math.max(0, primaryAmount + secondaryAmount + adjustmentAmount);
        const totalAmount =
          payrollDoc?.amount !== undefined && payrollDoc?.amount !== null && Number(payrollDoc.amount) > 0
            ? Number(payrollDoc.amount)
            : calculatedTotal;

        const status: PayrollApprovalStatus = (payrollDoc?.status as PayrollApprovalStatus) || "pending_approval";

        const deptDoc = departmentById.get(String(teacher.departmentId || ""));
        const departmentName = deptDoc?.name || deptDoc?.code || teacher.departmentId || "—";

        return {
          teacherId: teacher.id,
          teacherCode: teacher.teacherCode || "",
          teacherName: teacher.fullName || teacher.email || teacher.id,
          teachingLevel,
          teachingLevelLabel,
          departmentId: teacher.departmentId || "",
          departmentName,
          teacherType: teacher.teacherType || "co_huu",
          primaryActual,
          primaryStandard,
          primaryRate,
          primaryAmount,
          secondaryActual,
          secondaryStandard,
          secondaryRate,
          secondaryAmount,
          substituteCount,
          absentCount,
          overtimePeriods,
          adjustmentAmount,
          adjustmentReason,
          totalAmount,
          status,
          approvedBy: payrollDoc?.approvedBy,
          approvedAt: payrollDoc?.approvedAt,
          payrollDocId: `${selectedMonth}_${teacher.id}`,
          schedules: teacherSchedules,
        };
      })
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "vi"));
  }, [
    departmentById,
    monthProcessedSchedules,
    payrollByTeacherId,
    selectedMonth,
    teachers,
  ]);

  // Filtered Summary Rows according to global filters
  const filteredSummaryRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return allTeacherPayrollRows.filter((row) => {
      // 1. School Level filter
      if (schoolLevelFilter !== "ALL" && row.teachingLevel !== schoolLevelFilter) {
        return false;
      }

      // 2. Department filter
      if (departmentFilter !== "all" && row.departmentId !== departmentFilter) {
        return false;
      }

      // 3. Teacher Type filter
      if (teacherTypeFilter !== "all" && row.teacherType !== teacherTypeFilter) {
        return false;
      }

      // 4. Keyword search
      if (q) {
        const pool = [row.teacherName, row.teacherCode, row.departmentName, row.teachingLevelLabel]
          .join(" ")
          .toLowerCase();
        if (!pool.includes(q)) return false;
      }

      return true;
    });
  }, [allTeacherPayrollRows, departmentFilter, schoolLevelFilter, search, teacherTypeFilter]);

  // Top 4 KPI Decision Cards Metrics
  const payrollKpiMetrics = useMemo(() => {
    const totalEstimatedPayroll = filteredSummaryRows.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalTeachers = filteredSummaryRows.length;
    const primaryPeriods = filteredSummaryRows.reduce((sum, r) => sum + r.primaryActual, 0);
    const secondaryPeriods = filteredSummaryRows.reduce((sum, r) => sum + r.secondaryActual, 0);
    const totalPeriods = primaryPeriods + secondaryPeriods;
    const substitutePeriods = filteredSummaryRows.reduce((sum, r) => sum + r.substituteCount, 0);
    const absentPeriods = filteredSummaryRows.reduce((sum, r) => sum + r.absentCount, 0);
    const pendingPastPeriods = kpiCounts.pendingPast;

    const pendingApprovalTeachers = filteredSummaryRows.filter(
      (r) => r.status === "pending_approval" || r.status === "draft"
    ).length;
    const approvedTeachers = filteredSummaryRows.filter(
      (r) => r.status === "approved" || r.status === "paid"
    ).length;
    const reviewRequiredTeachers = filteredSummaryRows.filter((r) => r.status === "review_required").length;

    return {
      totalEstimatedPayroll,
      totalTeachers,
      totalPeriods,
      primaryPeriods,
      secondaryPeriods,
      substitutePeriods,
      absentPeriods,
      pendingPastPeriods,
      pendingApprovalTeachers,
      approvedTeachers,
      reviewRequiredTeachers,
    };
  }, [filteredSummaryRows, kpiCounts.pendingPast]);

  // Filtered schedules for Timesheet tab
  const filteredProcessedSchedules = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");

    return monthProcessedSchedules.filter((item) => {
      if (schoolLevelFilter !== "ALL" && item.schoolLevel !== schoolLevelFilter) {
        return false;
      }
      if (departmentFilter !== "all") {
        const teacher = teacherById.get(item.effectiveTeacherId);
        const matchesDept = item.departmentId === departmentFilter || teacher?.departmentId === departmentFilter;
        if (!matchesDept) return false;
      }
      if (teacherTypeFilter !== "all") {
        const teacher = teacherById.get(item.effectiveTeacherId);
        const matchesType = item.teacherType === teacherTypeFilter || teacher?.teacherType === teacherTypeFilter;
        if (!matchesType) return false;
      }
      if (statusFilter !== "all" && item.effectiveStatus !== statusFilter) {
        return false;
      }
      if (selectedDate !== "all" && item.calculatedDate !== selectedDate) {
        return false;
      }
      if (selectedTeacherId !== "all" && item.effectiveTeacherId !== selectedTeacherId && item.teacherId !== selectedTeacherId) {
        return false;
      }
      if (selectedClassId !== "all" && item.classId !== selectedClassId) {
        return false;
      }
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
    schoolLevelFilter,
    search,
    selectedClassId,
    selectedDate,
    selectedTeacherId,
    statusFilter,
    teacherById,
    teacherTypeFilter,
  ]);

  // Available dates for timesheet view
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
    if (ids.length === 0) setSelectedRowIds(new Set());
    else setSelectedRowIds(new Set(ids));
  };

  const handleClearSelection = () => setSelectedRowIds(new Set());

  // Quick single schedule checkin
  async function writeCheckin(
    schedule: ScheduleWithMeta | Row,
    override?: { status: "confirmed" | "adjusted" | "absent"; actualTeacherId: string; reason: string; note: string }
  ) {
    if (!user) return;
    const existing = checkinByScheduleId.get(schedule.id);
    const actualTeacherId = override?.actualTeacherId || String(schedule.actualTeacherId || schedule.teacherId || "");
    const originalTeacherId = String(schedule.originalTeacherId || schedule.teacherId || "");
    const isSubstitutedSchedule = Boolean(actualTeacherId && originalTeacherId && actualTeacherId !== originalTeacherId);
    const teacher = teacherById.get(actualTeacherId);
    const originalTeacher = teacherById.get(originalTeacherId);
    const status = override?.status || (isSubstitutedSchedule ? "adjusted" : "confirmed");
    const periodCount = Math.max(1, Number(schedule.endPeriod || 0) - Number(schedule.startPeriod || 0));
    const payable = ["confirmed", "adjusted"].includes(status);

    const classDoc = classById.get(String(schedule.classId || ""));
    const subjectDoc = subjectById.get(String(schedule.subjectId || ""));
    const deptDoc = departmentById.get(String(schedule.departmentId || teacher?.departmentId || ""));

    await setDoc(
      doc(firestore, "checkins", `${selectedMonth}_${schedule.id}`),
      {
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
        originalTeacherId,
        teacherType: teacher?.teacherType || schedule.teacherType || "",
        attendanceSource: "admin_confirmation",
        confirmedAt: serverTimestamp(),
        confirmedBy: user.uid,
        adjustedBy: user.uid,
        adjustmentReason:
          override?.reason ||
          (isSubstitutedSchedule
            ? `Dạy thay cho ${originalTeacher?.fullName || originalTeacherId}`
            : "Xác nhận đã dạy"),
        note: override?.note || "",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...(existing ? {} : { createdAt: serverTimestamp(), createdBy: user.uid, isActive: true }),
      },
      { merge: true }
    );
  }

  // Batch checkin write
  async function writeCheckinsBatch(
    targetSchedules: (ScheduleWithMeta | Row)[],
    status: "confirmed" | "absent" = "confirmed",
    reason = "Xác nhận hàng loạt theo phân công"
  ) {
    if (!user || targetSchedules.length === 0) return;
    const chunkSize = 400;

    for (let offset = 0; offset < targetSchedules.length; offset += chunkSize) {
      const chunk = targetSchedules.slice(offset, offset + chunkSize);
      const batch = writeBatch(firestore);

      for (const schedule of chunk) {
        const existing = checkinByScheduleId.get(schedule.id);
        const actualTeacherId = String(schedule.actualTeacherId || schedule.teacherId || "");
        const originalTeacherId = String(schedule.originalTeacherId || schedule.teacherId || "");
        const isSubstitutedSchedule = Boolean(actualTeacherId && originalTeacherId && actualTeacherId !== originalTeacherId);
        const teacher = teacherById.get(actualTeacherId);
        const originalTeacher = teacherById.get(originalTeacherId);
        const periodCount = Math.max(1, Number(schedule.endPeriod || 0) - Number(schedule.startPeriod || 0));
        const resolvedStatus = status === "confirmed" && isSubstitutedSchedule ? "adjusted" : status;
        const payable = ["confirmed", "adjusted"].includes(resolvedStatus);
        const resolvedReason = isSubstitutedSchedule
          ? `Dạy thay cho ${originalTeacher?.fullName || originalTeacherId}`
          : reason;

        const classDoc = classById.get(String(schedule.classId || ""));
        const subjectDoc = subjectById.get(String(schedule.subjectId || ""));
        const deptDoc = departmentById.get(String(schedule.departmentId || teacher?.departmentId || ""));

        const checkinRef = doc(firestore, "checkins", `${selectedMonth}_${schedule.id}`);
        batch.set(
          checkinRef,
          {
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
            status: resolvedStatus,
            actualTeacherId,
            originalTeacherId,
            teacherType: teacher?.teacherType || schedule.teacherType || "",
            attendanceSource: "admin_confirmation_batch",
            confirmedAt: serverTimestamp(),
            confirmedBy: user.uid,
            adjustedBy: user.uid,
            adjustmentReason: resolvedReason,
            note: "",
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
            ...(existing ? {} : { createdAt: serverTimestamp(), createdBy: user.uid, isActive: true }),
          },
          { merge: true }
        );
      }

      await batch.commit();
    }
  }

  async function confirmSchedule(schedule: ScheduleWithMeta) {
    setActionLoading(true);
    setError("");
    try {
      await writeCheckin(schedule);
      const isSub = schedule.isSubstituted;
      const targetName = isSub ? schedule.effectiveTeacherName : (schedule.resolvedTeacherName || schedule.effectiveTeacherName);
      toast.success(isSub ? `Đã xác nhận tiết dạy thay của ${targetName}` : `Đã xác nhận tiết dạy của ${targetName}`);
    } catch (submitError) {
      setError(firebaseDataErrorMessage(submitError));
    } finally {
      setActionLoading(false);
    }
  }

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
      await setDoc(
        doc(firestore, "payrollRates", rateDocId(rateForm.teacherId, rateForm.subjectId)),
        {
          teacherId: rateForm.teacherId,
          teacherName: textValue(teacher?.fullName) || textValue(teacher?.email) || rateForm.teacherId,
          departmentId: textValue(teacher?.departmentId),
          subjectId: rateForm.subjectId,
          subjectName: textValue(subject?.name) || textValue(subject?.code) || rateForm.subjectId,
          ratePerPeriod: Number(rateForm.ratePerPeriod),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          ...(existing ? {} : { createdAt: serverTimestamp(), createdBy: user.uid, isActive: true }),
        },
        { merge: true }
      );
      toast.success("Đã lưu đơn giá/tiết.");
      setRateForm({ teacherId: "", subjectId: "", ratePerPeriod: "" });
    } catch (submitError) {
      setRateError(firebaseDataErrorMessage(submitError));
    } finally {
      setRateSubmitting(false);
    }
  }

  // Admin Payroll Calculator
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
      toast.success(`Đã tính bảng lương cho ${result.count} giáo viên và gửi BGH phê duyệt.`);
      setTab("summary");
    } catch (submitError) {
      setError(firebaseErrorMessage(submitError));
    } finally {
      setCalculating(false);
    }
  }

  // Principal Quick Single Approve
  async function handleQuickApprove(row: TeacherPayrollSummaryRow) {
    if (!user) return;
    setActionLoading(true);
    try {
      const nextStatus: PayrollApprovalStatus = row.status === "approved" ? "pending_approval" : "approved";
      await setDoc(
        doc(firestore, "payroll", row.payrollDocId),
        {
          teacherId: row.teacherId,
          month: selectedMonth,
          status: nextStatus,
          approvedBy: nextStatus === "approved" ? user.uid : null,
          approvedAt: nextStatus === "approved" ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      toast.success(
        nextStatus === "approved"
          ? `Đã phê duyệt thù lao cho giáo viên ${row.teacherName}`
          : `Đã chuyển về trạng thái Chờ duyệt cho ${row.teacherName}`
      );
    } catch (err) {
      toast.error(firebaseDataErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  // Principal Batch Approve All
  async function handleApproveAllPending() {
    if (!user) return;
    const pendingRows = filteredSummaryRows.filter(
      (r) => r.status === "pending_approval" || r.status === "draft" || r.status === "review_required"
    );
    if (pendingRows.length === 0) {
      toast.info("Không có giáo viên nào đang chờ phê duyệt.");
      setConfirmApproveAllOpen(false);
      return;
    }
    setActionLoading(true);
    try {
      const batch = writeBatch(firestore);
      for (const row of pendingRows) {
        const ref = doc(firestore, "payroll", row.payrollDocId);
        batch.set(
          ref,
          {
            teacherId: row.teacherId,
            month: selectedMonth,
            status: "approved",
            approvedBy: user.uid,
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true }
        );
      }
      await batch.commit();
      setConfirmApproveAllOpen(false);
      toast.success(`Hiệu trưởng đã phê duyệt thành công toàn bộ ${pendingRows.length} giáo viên.`);
    } catch (err) {
      toast.error(firebaseDataErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  // Principal Batch Review / Reject All
  async function handleRequestReviewAll() {
    if (!user) return;
    const targetRows = filteredSummaryRows.filter((r) => r.status !== "review_required");
    if (targetRows.length === 0) return;
    setActionLoading(true);
    try {
      const batch = writeBatch(firestore);
      for (const row of targetRows) {
        const ref = doc(firestore, "payroll", row.payrollDocId);
        batch.set(
          ref,
          {
            teacherId: row.teacherId,
            month: selectedMonth,
            status: "review_required",
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true }
        );
      }
      await batch.commit();
      setConfirmReviewAllOpen(false);
      toast.success(`Đã yêu cầu kế toán & giáo vụ rà soát lại ${targetRows.length} hồ sơ thù lao.`);
    } catch (err) {
      toast.error(firebaseDataErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  // Principal Edit Modal Submission
  async function handlePrincipalAdjustmentSubmit(data: {
    primaryActual: number;
    secondaryActual: number;
    primaryRate: number;
    secondaryRate: number;
    adjustmentAmount: number;
    adjustmentReason: string;
    status: PayrollApprovalStatus;
  }) {
    if (!user || !principalEditRow) return;
    setActionLoading(true);
    try {
      const ref = doc(firestore, "payroll", principalEditRow.payrollDocId);
      const isAdjunct = principalEditRow.teacherType === "thinh_giang";
      const pOver = principalEditRow.primaryStandard !== null
        ? Math.max(0, data.primaryActual - principalEditRow.primaryStandard)
        : data.primaryActual;
      const sOver = principalEditRow.secondaryStandard !== null
        ? Math.max(0, data.secondaryActual - principalEditRow.secondaryStandard)
        : data.secondaryActual;

      const primarySubtotal = isAdjunct ? data.primaryActual * data.primaryRate : pOver * data.primaryRate;
      const secondarySubtotal = isAdjunct ? data.secondaryActual * data.secondaryRate : sOver * data.secondaryRate;
      const newAmount = Math.max(0, primarySubtotal + secondarySubtotal + data.adjustmentAmount);

      await setDoc(
        ref,
        {
          teacherId: principalEditRow.teacherId,
          month: selectedMonth,
          overridePrimaryActual: data.primaryActual,
          overrideSecondaryActual: data.secondaryActual,
          overridePrimaryRate: data.primaryRate,
          overrideSecondaryRate: data.secondaryRate,
          actualPeriods: data.primaryActual + data.secondaryActual,
          adjustmentAmount: data.adjustmentAmount,
          adjustmentReason: data.adjustmentReason,
          status: data.status,
          amount: newAmount,
          adjustedBy: user.uid,
          adjustedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          ...(data.status === "approved"
            ? { approvedBy: user.uid, approvedAt: serverTimestamp() }
            : {}),
        },
        { merge: true }
      );

      // Cập nhật đơn giá vào hồ sơ giáo viên để đồng bộ lâu dài
      try {
        await setDoc(
          doc(firestore, "teachers", principalEditRow.teacherId),
          {
            primaryRatePerPeriod: data.primaryRate,
            secondaryRatePerPeriod: data.secondaryRate,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true }
        );
      } catch {
        // Teacher profile update is optional
      }

      setPrincipalEditRow(null);
      toast.success(`Đã lưu điều chỉnh công & thù lao cho giáo viên ${principalEditRow.teacherName}.`);
    } catch (err) {
      toast.error(firebaseDataErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  // Comprehensive Multi-Level CSV Export
  function exportPayrollCsv() {
    const rows = filteredSummaryRows.map((row) => [
      row.teacherCode,
      row.teacherName,
      row.teachingLevelLabel,
      row.departmentName,
      row.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu",
      row.primaryActual,
      row.primaryStandard ?? "—",
      row.secondaryActual,
      row.secondaryStandard ?? "—",
      row.substituteCount,
      row.absentCount,
      row.overtimePeriods,
      row.adjustmentAmount,
      row.adjustmentReason,
      row.totalAmount,
      payrollStatusLabelVi(row.status),
    ]);

    const header = [
      "Mã GV",
      "Họ và Tên",
      "Cấp dạy",
      "Tổ bộ môn",
      "Loại hợp đồng",
      "Tiết Cấp 1 (Thực)",
      "Định mức C1",
      "Tiết Cấp 2 (Thực)",
      "Định mức C2",
      "Dạy thay (+)",
      "Báo vắng (-)",
      "Tiết phụ trội",
      "Điều chỉnh (+/- VND)",
      "Lý do điều chỉnh",
      "Tổng thù lao/Lương (VND)",
      "Trạng thái phê duyệt",
    ];

    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bang-luong-lien-cap-${selectedMonth}.csv`;
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
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <PageHeader
          eyebrow="Nghiệp vụ liên cấp"
          title={isPrincipal ? "Phê duyệt Chấm công & Bảng lương" : "Chấm công & Bảng lương liên cấp"}
          description={
            isPrincipal
              ? "Kiểm soát số tiết Cấp 1 & Cấp 2, điều chỉnh trực tiếp và phê duyệt chi trả lương cho giáo viên toàn trường."
              : "Theo dõi phân công, đối soát điểm danh tiết dạy, xử lý dạy thay và tính toán bảng lương trình BGH."
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={exportPayrollCsv}
                disabled={filteredSummaryRows.length === 0}
              >
                <Download className="h-4 w-4" />
                Xuất CSV
              </Button>

              {/* Principal Specific Buttons */}
              {isPrincipal && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmReviewAllOpen(true)}
                    disabled={filteredSummaryRows.length === 0}
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Yêu cầu rà soát
                  </Button>
                  <Button
                    onClick={() => setConfirmApproveAllOpen(true)}
                    disabled={filteredSummaryRows.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Phê duyệt bảng lương
                  </Button>
                </>
              )}

              {/* Cấu hình đơn giá thù lao theo môn & giáo viên (Admin & BGH) */}
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

              {/* Admin Specific Calculator */}
              {isAdmin && (
                <Button
                  loading={calculating}
                  onClick={calculatePayroll}
                  disabled={unconfirmedPastSchedules.length > 0}
                >
                  <Calculator className="h-4 w-4" />
                  Tính bảng lương
                </Button>
              )}
            </div>
          }
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* TOP FILTERS CARD */}
        <Card className="mb-5 p-4 shadow-xs">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Tháng / Năm */}
            <div>
              <Label>Tháng / Năm</Label>
              <div className="flex gap-2">
                <select
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold"
                  value={selectedMonthNumber}
                  onChange={(e) => setMonthPart(e.target.value)}
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
                <Input
                  className="w-24 font-semibold"
                  value={selectedYear}
                  onChange={(e) => setYearPart(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
            </div>

            {/* Cấp học */}
            <div>
              <Label>Cấp học</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold"
                value={schoolLevelFilter}
                onChange={(e) => setSchoolLevelFilter(e.target.value as any)}
              >
                <option value="ALL">Tất cả cấp học</option>
                <option value="PRIMARY">Cấp 1 (Tiểu học)</option>
                <option value="SECONDARY">Cấp 2 (THCS)</option>
                <option value="BOTH">Giáo viên dạy cả 2 cấp</option>
              </select>
            </div>

            {/* Tổ / Bộ môn */}
            <div>
              <Label>Tổ / Bộ môn</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="all">Tất cả tổ bộ môn</option>
                {departmentOptions.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Loại hợp đồng */}
            <div>
              <Label>Loại hợp đồng</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={teacherTypeFilter}
                onChange={(e) => setTeacherTypeFilter(e.target.value)}
              >
                <option value="all">Tất cả hợp đồng</option>
                <option value="co_huu">Cơ hữu</option>
                <option value="thinh_giang">Thỉnh giảng</option>
              </select>
            </div>

            {/* Tìm kiếm */}
            <div>
              <Label>Tìm giáo viên</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Mã GV, họ tên..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* 4 KPI DECISION CARDS */}
        <PayrollKpiCards
          totalEstimatedPayroll={payrollKpiMetrics.totalEstimatedPayroll}
          totalTeachers={payrollKpiMetrics.totalTeachers}
          totalPeriods={payrollKpiMetrics.totalPeriods}
          primaryPeriods={payrollKpiMetrics.primaryPeriods}
          secondaryPeriods={payrollKpiMetrics.secondaryPeriods}
          substitutePeriods={payrollKpiMetrics.substitutePeriods}
          absentPeriods={payrollKpiMetrics.absentPeriods}
          pendingPastPeriods={payrollKpiMetrics.pendingPastPeriods}
          pendingApprovalTeachers={payrollKpiMetrics.pendingApprovalTeachers}
          approvedTeachers={payrollKpiMetrics.approvedTeachers}
          reviewRequiredTeachers={payrollKpiMetrics.reviewRequiredTeachers}
          isPrincipal={isPrincipal}
        />

        {/* VIEW TABS */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button
              variant={tab === "summary" ? "primary" : "secondary"}
              onClick={() => setTab("summary")}
            >
              Bảng tổng hợp công & Lương
            </Button>
            <Button
              variant={tab === "attendance" ? "primary" : "secondary"}
              onClick={() => setTab("attendance")}
              className="relative"
            >
              Nhật ký chi tiết tiết dạy
              {kpiCounts.pendingPast > 0 ? (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {kpiCounts.pendingPast}
                </span>
              ) : null}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Dữ liệu tháng: <strong>{selectedMonth}</strong> · Tổng:{" "}
            <strong>{filteredSummaryRows.length}</strong> giáo viên
          </div>
        </div>

        {/* TAB 1: BẢNG TỔNG HỢP CÔNG & LƯƠNG LIÊN CẤP (Dành cho Hiệu trưởng & Admin) */}
        {tab === "summary" && (
          <PrincipalPayrollTable
            rows={filteredSummaryRows}
            onOpenEdit={(row) => setPrincipalEditRow(row)}
            onQuickApprove={handleQuickApprove}
            onOpenDetail={(row) => setDetailDrawerRow(row)}
            actionLoading={actionLoading}
            isPrincipal={isPrincipal}
          />
        )}

        {/* TAB 2: NHẬT KÝ CHI TIẾT TIẾT DẠY (Timesheet) */}
        {tab === "attendance" && (
          <div className="space-y-4">
            {/* KPI Ribbon (Chỉ hiển thị cho Admin hoặc khi cần đối soát chi tiết) */}
            {isAdmin && (
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
            )}

            <Card className="p-4 sm:p-5">
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
                onResetFilters={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setSelectedDate("all");
                  setSelectedTeacherId("all");
                  setSelectedClassId("all");
                }}
                hasActiveFilters={Boolean(
                  search.trim() ||
                    statusFilter !== "all" ||
                    selectedDate !== "all" ||
                    selectedTeacherId !== "all" ||
                    selectedClassId !== "all"
                )}
              />

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
                    onBatchConfirmDate={async (dateSchedules) => {
                      setActionLoading(true);
                      try {
                        await writeCheckinsBatch(dateSchedules, "confirmed", `Duyệt nhanh ngày ${dateSchedules[0]?.formattedDate || ""}`);
                        toast.success(`Đã duyệt tất cả ${dateSchedules.length} tiết.`);
                      } catch (e) {
                        toast.error(firebaseDataErrorMessage(e));
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    actionLoading={actionLoading}
                  />
                ) : (
                  <AttendanceByTeacherView
                    schedules={filteredProcessedSchedules}
                    onConfirmSchedule={confirmSchedule}
                    onAdjustSchedule={(s) => setAdjustTarget(s)}
                    onBatchConfirmTeacher={async (teacherSchedules) => {
                      setActionLoading(true);
                      try {
                        await writeCheckinsBatch(teacherSchedules, "confirmed", `Duyệt nhanh của ${teacherSchedules[0]?.resolvedTeacherName || ""}`);
                        toast.success(`Đã duyệt tất cả ${teacherSchedules.length} tiết của GV.`);
                      } catch (e) {
                        toast.error(firebaseDataErrorMessage(e));
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    actionLoading={actionLoading}
                  />
                )}
              </div>
            </Card>

            {/* AUDIT LOG CARD (CHỈ HIỂN THỊ KHI showAuditLog === true, TỨC ADMIN; ẨN HOÀN TOÀN KHỎI HIỆU TRƯỞNG) */}
            {showAuditLog && (
              <Card className="mt-6 overflow-hidden">
                <div className="border-b border-border px-5 py-4 sm:px-6">
                  <h2 className="text-base font-bold">Lịch sử thay đổi chấm công (Audit Log)</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Ghi nhận đầy đủ thông tin người duyệt, thời gian và lý do điều chỉnh phục vụ đối soát nội bộ.
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
            )}
          </div>
        )}

        {/* MODAL ĐIỀU CHỈNH CỦA HIỆU TRƯỞNG / ADMIN */}
        <PrincipalAdjustmentModal
          open={Boolean(principalEditRow)}
          onOpenChange={(open) => !open && setPrincipalEditRow(null)}
          row={principalEditRow}
          onSubmit={handlePrincipalAdjustmentSubmit}
          loading={actionLoading}
        />

        {/* DRAWER CHI TIẾT TỪNG TIẾT DẠY CỦA GIÁO VIÊN */}
        <TeacherScheduleDrawer
          open={Boolean(detailDrawerRow)}
          onClose={() => setDetailDrawerRow(null)}
          teacherRow={detailDrawerRow}
          schedules={monthProcessedSchedules}
        />

        {/* MODAL XÁC NHẬN PHÊ DUYỆT TOÀN BỘ (DÀNH CHO HIỆU TRƯỞNG) */}
        <Modal
          open={confirmApproveAllOpen}
          onOpenChange={setConfirmApproveAllOpen}
          title="Xác nhận phê duyệt toàn bộ bảng lương"
          description={`Bạn có chắc chắn muốn phê duyệt chi trả lương cho toàn bộ ${payrollKpiMetrics.pendingApprovalTeachers} giáo viên đang chờ duyệt trong tháng ${selectedMonth}?`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmApproveAllOpen(false)}>
                Hủy
              </Button>
              <Button
                loading={actionLoading}
                onClick={handleApproveAllPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                Xác nhận phê duyệt
              </Button>
            </div>
          }
        >
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-900 space-y-2">
            <p className="font-bold text-sm">Thông tin phê duyệt:</p>
            <p>• Tháng quyết toán: <strong>{selectedMonth}</strong></p>
            <p>• Tổng quỹ lương dự kiến: <strong>{formatCurrency(payrollKpiMetrics.totalEstimatedPayroll)}</strong></p>
            <p>• Số giáo viên được phê chuẩn: <strong>{payrollKpiMetrics.pendingApprovalTeachers}</strong> giáo viên</p>
          </div>
        </Modal>

        {/* MODAL YÊU CẦU RÀ SOÁT TOÀN BỘ (DÀNH CHO HIỆU TRƯỞNG) */}
        <Modal
          open={confirmReviewAllOpen}
          onOpenChange={setConfirmReviewAllOpen}
          title="Yêu cầu rà soát lại số liệu bảng lương"
          description={`Chuyển trạng thái các giáo viên sang 'Yêu cầu rà soát' để bộ phận kế toán và giáo vụ kiểm tra lại số liệu tháng ${selectedMonth}.`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmReviewAllOpen(false)}>
                Hủy
              </Button>
              <Button
                loading={actionLoading}
                onClick={handleRequestReviewAll}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Gửi yêu cầu rà soát
              </Button>
            </div>
          }
        >
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-900">
            Hệ thống sẽ gắn cờ cảnh báo rà soát tới bộ phận giáo vụ và kế toán để đối chiếu lại lịch dạy thay, báo vắng và số tiết phụ trội.
          </div>
        </Modal>

        {/* MODAL XÁC NHẬN HÀNG LOẠT QUÁ HẠN (ADMIN) */}
        <BatchConfirmModal
          open={batchModalOpen}
          onOpenChange={setBatchModalOpen}
          targetSchedules={unconfirmedPastSchedules}
          onConfirm={handleBatchConfirmAllPast}
          loading={actionLoading}
        />

        {/* MODAL ĐIỀU CHỈNH CHẤM CÔNG TỪNG TIẾT (ADMIN) */}
        <AdjustAttendanceModal
          open={Boolean(adjustTarget)}
          onOpenChange={(open) => !open && setAdjustTarget(null)}
          targetSchedule={adjustTarget}
          teachers={teachers}
          onSubmit={handleAdjustSubmit}
          loading={actionLoading}
          error={adjustError}
        />

        {/* MODAL ĐƠN GIÁ THÙ LAO (ADMIN ONLY) */}
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
