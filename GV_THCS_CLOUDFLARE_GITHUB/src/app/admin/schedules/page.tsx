"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { ScheduleInput } from "@school/shared";
import { addDays, addMinutes, parseISO } from "date-fns";
import { CalendarClock, CalendarPlus, CheckCircle2, FileSpreadsheet, Info, PencilLine, Sparkles, Trash2, XCircle } from "lucide-react";
import { collection, limit, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { createOrUpdateSchedule, firebaseErrorMessage, reviewTeacherAvailability } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { currentWeekStartDateOnly } from "@/lib/date-only";
import { classGrade, gradeScopeForSubject, teacherCanTeachClass, teacherCanTeachSubject } from "@/lib/teaching-assignments";
import { buildStudentTimetableWorkbook, downloadStudentTimetableWorkbook } from "@/lib/exports/student-timetable";

const fallbackPeriodStartHour = 7;
const fallbackPeriodMinutes = 50;

type ScheduleRow = DocumentData & { id: string };
type CatalogRow = DocumentData & { id: string };
type AvailabilityRow = DocumentData & { id: string };

type FormState = {
  teacherId: string;
  subjectId: string;
  classId: string;
  roomId: string;
  campusId: string;
  departmentId: string;
  semesterId: string;
  weekStart: string;
  dayOfWeek: string;
  startPeriod: string;
  endPeriod: string; // Last period shown to the user (inclusive).
  confirmationDeadline: string;
};

type CatalogFieldKey = "teacherId" | "subjectId" | "classId" | "roomId" | "campusId" | "departmentId" | "semesterId";

function currentMonday() {
  return currentWeekStartDateOnly();
}

const initialForm: FormState = {
  teacherId: "",
  subjectId: "",
  classId: "",
  roomId: "",
  campusId: "",
  departmentId: "",
  semesterId: "",
  weekStart: currentMonday(),
  dayOfWeek: "2",
  startPeriod: "1",
  endPeriod: "1",
  confirmationDeadline: "",
};

function dateForSchedule(row: ScheduleRow) {
  const base = parseISO(String(row.weekStart));
  return addDays(base, Number(row.dayOfWeek || 2) - 2);
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function primaryCatalogName(row: CatalogRow) {
  return textValue(row.fullName)
    || textValue(row.name)
    || textValue(row.displayName)
    || textValue(row.email)
    || textValue(row.code)
    || row.id;
}

function catalogOptionLabel(row: CatalogRow) {
  const name = primaryCatalogName(row);
  const details = [textValue(row.code), textValue(row.email), textValue(row.departmentId), textValue(row.campusId)]
    .filter((value, index, values) => value && values.indexOf(value) === index && value !== name && value !== row.id)
    .join(" · ");
  return details ? `${name} · ${details}` : name;
}

function catalogName(rows: CatalogRow[], id: unknown) {
  const value = textValue(id);
  if (!value) return "";
  const row = rows.find((item) => item.id === value);
  return row ? primaryCatalogName(row) : "";
}

function selectedCatalogRow(rows: CatalogRow[], id: unknown) {
  const value = textValue(id);
  return value ? rows.find((item) => item.id === value) ?? null : null;
}

function dateTimeLocalValue(value: unknown) {
  if (!value) return "";
  const date = typeof value === "object" && value !== null && "toDate" in value
    ? (value as { toDate(): Date }).toDate()
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formFromSchedule(row: ScheduleRow): FormState {
  return {
    teacherId: textValue(row.actualTeacherId) || textValue(row.teacherId),
    subjectId: textValue(row.subjectId),
    classId: textValue(row.classId),
    roomId: textValue(row.roomId),
    campusId: textValue(row.campusId),
    departmentId: textValue(row.departmentId),
    semesterId: textValue(row.semesterId),
    weekStart: textValue(row.weekStart) || currentMonday(),
    dayOfWeek: row.dayOfWeek ? String(row.dayOfWeek) : "2",
    startPeriod: row.startPeriod ? String(row.startPeriod) : "1",
    endPeriod: row.endPeriod ? String(Math.max(Number(row.startPeriod || 1), Number(row.endPeriod) - 1)) : "1",
    confirmationDeadline: dateTimeLocalValue(row.confirmationDeadline),
  };
}

function activeCatalogRows(rows: CatalogRow[]) {
  return rows
    .filter((row) => row.isActive !== false && row.status !== "inactive" && row.status !== "archived")
    .sort((first, second) => primaryCatalogName(first).localeCompare(primaryCatalogName(second), "vi"));
}

function periodNumber(row: CatalogRow) {
  return Number(row.periodNumber ?? row.order ?? row.period ?? 0);
}

function activeTimeSlotRows(rows: CatalogRow[]) {
  return rows
    .filter((row) => row.isActive !== false && periodNumber(row) > 0)
    .sort((first, second) => periodNumber(first) - periodNumber(second));
}

function timeAtBoundary(row: ScheduleRow, slots: CatalogRow[], boundary: "start" | "end") {
  const date = dateForSchedule(row);
  const period = boundary === "start" ? Number(row.startPeriod || 1) : Math.max(1, Number(row.endPeriod || 2) - 1);
  const slot = slots.find((item) => periodNumber(item) === period);
  const configured = textValue(boundary === "start" ? slot?.startTime : slot?.endTime);
  const match = /^(\d{1,2}):(\d{2})/.exec(configured);
  if (match) {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return date;
  }
  const minutes = fallbackPeriodStartHour * 60 + (boundary === "start" ? period - 1 : period) * fallbackPeriodMinutes;
  return addMinutes(date, minutes);
}

function periodDisplay(row: ScheduleRow) {
  const start = Number(row.startPeriod || 0);
  const last = Math.max(start, Number(row.endPeriod || start + 1) - 1);
  return start === last ? `Tiết ${start}` : `Tiết ${start}–${last}`;
}

function parseAvailabilitySlot(slot: unknown) {
  const match = /^(\d+):(\d+)$/.exec(String(slot));
  if (!match) return null;
  return { dayOfWeek: Number(match[1]), period: Number(match[2]) };
}

function availabilitySlotLabel(slot: unknown) {
  const parsed = parseAvailabilitySlot(slot);
  return parsed ? `Thứ ${parsed.dayOfWeek} · Tiết ${parsed.period}` : String(slot);
}

function approvedAvailabilitySlots(row: AvailabilityRow | null) {
  if (!row) return [] as string[];
  if (Array.isArray(row.approvedSlots)) return row.approvedSlots.map(String);
  return Array.isArray(row.slots) ? row.slots.map(String) : [];
}

function availabilityCoversSelection(row: AvailabilityRow | null, dayOfWeek: number, startPeriod: number, lastPeriod: number) {
  const approvedSlots = approvedAvailabilitySlots(row);
  if (approvedSlots.length === 0) return false;
  for (let period = startPeriod; period <= lastPeriod; period += 1) {
    if (!approvedSlots.includes(`${dayOfWeek}:${period}`)) return false;
  }
  return true;
}

type AvailabilityReviewStatus = "pending" | "approved" | "rejected" | "not_submitted";

function reviewStatusOf(row: AvailabilityRow): AvailabilityReviewStatus {
  const reviewStatus = textValue(row.reviewStatus);
  if (reviewStatus === "approved") return "approved";
  if (reviewStatus === "rejected") return "rejected";
  return textValue(row.status) === "submitted" ? "pending" : "not_submitted";
}

function localDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function defaultConfirmationDeadline() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return localDateTimeInput(date);
}

export default function SchedulesPage() {
  const { role, claims, loading: authLoading } = useAuth();
  const managerDepartmentId = typeof claims?.departmentId === "string" ? claims.departmentId : "";
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ScheduleRow | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRow | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [formError, setFormError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [teachers, setTeachers] = useState<CatalogRow[]>([]);
  const [subjects, setSubjects] = useState<CatalogRow[]>([]);
  const [classes, setClasses] = useState<CatalogRow[]>([]);
  const [rooms, setRooms] = useState<CatalogRow[]>([]);
  const [campuses, setCampuses] = useState<CatalogRow[]>([]);
  const [departments, setDepartments] = useState<CatalogRow[]>([]);
  const [semesters, setSemesters] = useState<CatalogRow[]>([]);
  const [timeSlots, setTimeSlots] = useState<CatalogRow[]>([]);
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [reviewingAvailabilityId, setReviewingAvailabilityId] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportWeekStart, setExportWeekStart] = useState(currentMonday());
  const [exportClassId, setExportClassId] = useState("");
  const [exportSchoolName, setExportSchoolName] = useState("TRƯỜNG THCS");
  const [exportOnlyReady, setExportOnlyReady] = useState(true);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (authLoading || !role) return;
    if (role === "totruong" && !managerDepartmentId) {
      setError("Tài khoản tổ trưởng chưa được gán bộ môn phụ trách.");
      setLoading(false);
      return;
    }
    const schedulesQuery = role === "totruong"
      ? query(collection(firestore, "schedules"), where("departmentId", "==", managerDepartmentId), limit(500))
      : query(collection(firestore, "schedules"), limit(500));
    return onSnapshot(
      schedulesQuery,
      (snapshot) => {
        setRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        setLoading(false);
      },
      () => {
        setError("Không thể tải thời khóa biểu. Hãy kiểm tra Firestore Rules và tài khoản hiện tại.");
        setLoading(false);
      },
    );
  }, [authLoading, managerDepartmentId, role]);

  useEffect(() => {
    if (authLoading || !role) return;
    setCatalogError("");
    const watchCatalog = (collectionName: string, setter: (rows: CatalogRow[]) => void, timeSlot = false) => {
      const scopedQuery = role === "totruong" && collectionName === "teachers"
        ? query(collection(firestore, collectionName), where("departmentId", "==", managerDepartmentId), limit(500))
        : query(collection(firestore, collectionName), limit(500));
      return onSnapshot(
        scopedQuery,
        (snapshot) => {
          let catalogRows: CatalogRow[] = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
          if (role === "totruong" && collectionName === "subjects") {
            catalogRows = catalogRows.filter((row) => row.departmentId === managerDepartmentId);
          }
          setter(timeSlot ? activeTimeSlotRows(catalogRows) : activeCatalogRows(catalogRows));
        },
        (snapshotError) => setCatalogError(`Không thể tải dữ liệu ${collectionName}: ${firebaseDataErrorMessage(snapshotError)}`),
      );
    };
    const unsubscribers = [
      watchCatalog("teachers", setTeachers),
      watchCatalog("subjects", setSubjects),
      watchCatalog("classes", setClasses),
      watchCatalog("rooms", setRooms),
      watchCatalog("campuses", setCampuses),
      watchCatalog("departments", setDepartments),
      watchCatalog("semesters", setSemesters),
      watchCatalog("timeSlots", setTimeSlots, true),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [authLoading, managerDepartmentId, role]);

  useEffect(() => {
    if (authLoading || role !== "admin") {
      setAvailabilityRows([]);
      setAvailabilityLoading(false);
      return;
    }
    setAvailabilityLoading(true);
    setAvailabilityError("");
    const availabilityQuery = query(
      collection(firestore, "teacherAvailability"),
      where("status", "==", "submitted"),
      limit(500),
    );
    return onSnapshot(
      availabilityQuery,
      (snapshot) => {
        setAvailabilityRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        setAvailabilityLoading(false);
      },
      (snapshotError) => {
        setAvailabilityError(`Không thể tải đăng ký giờ rảnh: ${firebaseDataErrorMessage(snapshotError)}`);
        setAvailabilityLoading(false);
      },
    );
  }, [authLoading, role]);

  const events = useMemo(
    () => rows
      .filter((row) => row.weekStart && row.status !== "cancelled")
      .map((row) => ({
        id: row.id,
        title: `${row.subjectName || catalogName(subjects, row.subjectId) || row.subjectId || "Môn học"} · ${row.className || catalogName(classes, row.classId) || row.classId || "Lớp"}`,
        start: timeAtBoundary(row, timeSlots, "start"),
        end: timeAtBoundary(row, timeSlots, "end"),
        backgroundColor: textValue(row.originalTeacherId) && row.originalTeacherId !== (row.actualTeacherId || row.teacherId) ? "#f59e0b" : row.teacherType === "thinh_giang" ? "#7c3aed" : "#2563eb",
        borderColor: "transparent",
        extendedProps: { row },
      })),
    [classes, rows, subjects, timeSlots],
  );

  const calendarStart = textValue(timeSlots[0]?.startTime) || "06:30:00";
  const calendarEnd = textValue(timeSlots[timeSlots.length - 1]?.endTime) || "19:00:00";

  const selectedTeacher = useMemo(() => selectedCatalogRow(teachers, form.teacherId), [form.teacherId, teachers]);
  const teacherDepartmentId = textValue(selectedTeacher?.departmentId);
  const selectedSubject = useMemo(() => selectedCatalogRow(subjects, form.subjectId), [form.subjectId, subjects]);
  const subjectDepartmentId = textValue(selectedSubject?.departmentId);
  const selectedClass = useMemo(() => selectedCatalogRow(classes, form.classId), [classes, form.classId]);
  const selectedSemester = useMemo(() => selectedCatalogRow(semesters, form.semesterId), [form.semesterId, semesters]);

  const eligibleTeachers = useMemo(
    () => teachers.filter((teacher) => {
      if (form.subjectId && !teacherCanTeachSubject(teacher, form.subjectId)) return false;
      if (form.subjectId && selectedClass && !teacherCanTeachClass(teacher, form.subjectId, selectedClass)) return false;
      return true;
    }),
    [form.subjectId, selectedClass, teachers],
  );
  const eligibleSubjects = useMemo(
    () => selectedTeacher ? subjects.filter((subject) => teacherCanTeachSubject(selectedTeacher, subject.id)) : subjects,
    [selectedTeacher, subjects],
  );
  const eligibleClasses = useMemo(
    () => selectedTeacher && form.subjectId
      ? classes.filter((schoolClass) => teacherCanTeachClass(selectedTeacher, form.subjectId, schoolClass))
      : classes,
    [classes, form.subjectId, selectedTeacher],
  );

  const teacherTeachingIssue = selectedTeacher && form.subjectId
    ? !teacherCanTeachSubject(selectedTeacher, form.subjectId)
      ? "Môn học đã chọn không nằm trong phân công của giáo viên."
      : selectedClass && !teacherCanTeachClass(selectedTeacher, form.subjectId, selectedClass)
        ? `Giáo viên không được phân công dạy ${catalogName(subjects, form.subjectId) || form.subjectId} cho khối ${classGrade(selectedClass) ?? "của lớp này"}.`
        : ""
    : "";

  const catalogFields: { key: Exclude<CatalogFieldKey, "departmentId">; label: string; options: CatalogRow[] }[] = [
    { key: "teacherId", label: "Giáo viên", options: eligibleTeachers },
    { key: "subjectId", label: "Môn học", options: eligibleSubjects },
    { key: "classId", label: "Lớp học", options: eligibleClasses },
    { key: "roomId", label: "Phòng học", options: rooms },
    { key: "campusId", label: "Cơ sở", options: campuses },
    { key: "semesterId", label: "Học kỳ", options: semesters },
  ];
  const adjunctAvailabilityRows = useMemo(
    () => availabilityRows.filter((row) => teachers.find((teacher) => teacher.id === row.teacherId)?.teacherType === "thinh_giang"),
    [availabilityRows, teachers],
  );
  const selectedAvailability = useMemo(
    () => adjunctAvailabilityRows.find((row) => row.teacherId === form.teacherId && row.semesterId === form.semesterId) ?? null,
    [adjunctAvailabilityRows, form.semesterId, form.teacherId],
  );
  const selectedTeacherIsAdjunct = selectedTeacher?.teacherType === "thinh_giang";
  const selectedAvailabilityReviewStatus = selectedAvailability ? reviewStatusOf(selectedAvailability) : "not_submitted";
  const selectedAvailabilityCovers = !selectedTeacherIsAdjunct || availabilityCoversSelection(
    selectedAvailability,
    Number(form.dayOfWeek),
    Number(form.startPeriod),
    Number(form.endPeriod),
  );
  const selectedAvailabilityIssue = selectedTeacherIsAdjunct
    ? !selectedAvailability
      ? "Giáo viên chưa gửi đăng ký khung giờ rảnh cho học kỳ này."
      : selectedAvailabilityReviewStatus === "pending"
        ? "Đăng ký khung giờ rảnh đang chờ quản trị viên duyệt."
        : selectedAvailabilityReviewStatus === "rejected"
          ? `Đăng ký khung giờ rảnh đã bị từ chối${selectedAvailability.reviewNote ? `: ${selectedAvailability.reviewNote}` : "."}`
          : !selectedAvailabilityCovers
            ? "Thứ và tiết đang chọn không nằm trong khung giờ đã được duyệt của giáo viên."
            : ""
    : "";
  const sortedAvailabilityRows = useMemo(
    () => [...adjunctAvailabilityRows].sort((first, second) => {
      const order = { pending: 0, approved: 1, rejected: 2, not_submitted: 3 } as const;
      const statusDiff = order[reviewStatusOf(first)] - order[reviewStatusOf(second)];
      if (statusDiff !== 0) return statusDiff;
      const firstTeacher = teachers.find((row) => row.id === first.teacherId);
      const secondTeacher = teachers.find((row) => row.id === second.teacherId);
      return primaryCatalogName(firstTeacher ?? first).localeCompare(primaryCatalogName(secondTeacher ?? second), "vi");
    }),
    [adjunctAvailabilityRows, teachers],
  );
  const exportCandidateRows = useMemo(
    () => rows.filter((row) => {
      if (row.status === "cancelled") return false;
      if (textValue(row.weekStart) !== exportWeekStart) return false;
      if (exportClassId && textValue(row.classId) !== exportClassId) return false;
      if (!exportOnlyReady) return true;
      const confirmationStatus = textValue(row.confirmationStatus);
      return row.status !== "needs_attention"
        && !["cho_xac_nhan", "tu_choi", "qua_han", "da_huy"].includes(confirmationStatus);
    }),
    [exportClassId, exportOnlyReady, exportWeekStart, rows],
  );

  const exportClassCount = useMemo(
    () => new Set(exportCandidateRows.map((row) => textValue(row.classId)).filter(Boolean)).size,
    [exportCandidateRows],
  );

  const departmentSummary = teacherDepartmentId
    ? `${catalogName(departments, teacherDepartmentId) || teacherDepartmentId}`
    : form.teacherId
      ? "Hồ sơ giáo viên chưa có bộ môn. Vui lòng cập nhật ở trang Giáo viên."
      : "Chọn giáo viên trước, hệ thống sẽ tự lấy bộ môn từ hồ sơ giáo viên.";
  const subjectDepartmentWarning = form.teacherId && subjectDepartmentId && teacherDepartmentId && subjectDepartmentId !== teacherDepartmentId
    ? `Môn học đang thuộc bộ môn ${catalogName(departments, subjectDepartmentId) || subjectDepartmentId}, khác bộ môn của giáo viên.`
    : "";

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    const firstPeriod = String(periodNumber(timeSlots[0]) || 1);
    setEditingSchedule(null);
    setForm({ ...initialForm, startPeriod: firstPeriod, endPeriod: firstPeriod });
    setFormError("");
    setOpen(true);
  }

  function openEdit(row: ScheduleRow) {
    setEditingSchedule(row);
    setForm(formFromSchedule(row));
    setFormError("");
    setDetail(null);
    setOpen(true);
  }

  function setCatalogField(key: CatalogFieldKey, value: string) {
    setForm((current) => {
      const next: FormState = { ...current, [key]: value };
      if (key === "teacherId") {
        const teacher = teachers.find((row) => row.id === value);
        next.departmentId = textValue(teacher?.departmentId);
        if (textValue(teacher?.campusId)) next.campusId = textValue(teacher?.campusId);
        if (teacher && next.subjectId && !teacherCanTeachSubject(teacher, next.subjectId)) next.subjectId = "";
        const currentClass = classes.find((row) => row.id === next.classId);
        if (teacher && next.subjectId && currentClass && !teacherCanTeachClass(teacher, next.subjectId, currentClass)) next.classId = "";
      }
      if (key === "subjectId") {
        if (!next.teacherId && !next.departmentId) {
          const subject = subjects.find((row) => row.id === value);
          if (textValue(subject?.departmentId)) next.departmentId = textValue(subject?.departmentId);
        }
        const teacher = teachers.find((row) => row.id === next.teacherId);
        const currentClass = classes.find((row) => row.id === next.classId);
        if (teacher && currentClass && value && !teacherCanTeachClass(teacher, value, currentClass)) next.classId = "";
      }
      if (key === "classId") {
        const teacher = teachers.find((row) => row.id === next.teacherId);
        const schoolClass = classes.find((row) => row.id === value);
        if (teacher && next.subjectId && schoolClass && !teacherCanTeachClass(teacher, next.subjectId, schoolClass)) next.teacherId = "";
      }
      if (key === "roomId") {
        const room = rooms.find((row) => row.id === value);
        if (textValue(room?.campusId)) next.campusId = textValue(room?.campusId);
      }
      return next;
    });
  }

  function openCreateFromAvailability(row: AvailabilityRow, slot: unknown) {
    const parsed = parseAvailabilitySlot(slot);
    if (!parsed) return;
    const teacher = teachers.find((item) => item.id === row.teacherId);
    const firstPeriod = String(parsed.period);
    setEditingSchedule(null);
    setForm({
      ...initialForm,
      teacherId: String(row.teacherId ?? ""),
      departmentId: textValue(teacher?.departmentId),
      campusId: textValue(teacher?.campusId),
      semesterId: String(row.semesterId ?? ""),
      dayOfWeek: String(parsed.dayOfWeek),
      startPeriod: firstPeriod,
      endPeriod: firstPeriod,
      confirmationDeadline: defaultConfirmationDeadline(),
    });
    setFormError("");
    setOpen(true);
  }

  async function reviewAvailability(row: AvailabilityRow, decision: "approved" | "rejected") {
    const note = decision === "rejected"
      ? window.prompt("Nhập lý do từ chối để giáo viên điều chỉnh:")?.trim()
      : "";
    if (decision === "rejected" && !note) return;
    setReviewingAvailabilityId(row.id);
    setAvailabilityError("");
    try {
      await reviewTeacherAvailability({ availabilityId: row.id, decision, note });
      toast.success(decision === "approved" ? "Đã duyệt khung giờ rảnh." : "Đã từ chối đăng ký và gửi lý do cho giáo viên.");
    } catch (reviewError) {
      setAvailabilityError(firebaseErrorMessage(reviewError));
    } finally {
      setReviewingAvailabilityId("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const scheduleDepartmentId = teacherDepartmentId || form.departmentId;
      if (!scheduleDepartmentId) throw new Error("Hồ sơ giáo viên chưa có bộ môn. Vui lòng cập nhật bộ môn trước khi tạo lịch.");
      if (subjectDepartmentWarning) throw new Error(subjectDepartmentWarning);
      if (teacherTeachingIssue) throw new Error(teacherTeachingIssue);
      const lastPeriod = Number(form.endPeriod);
      const startPeriod = Number(form.startPeriod);
      if (lastPeriod < startPeriod) throw new Error("Tiết cuối không được nhỏ hơn tiết bắt đầu.");
      const schoolYearId = textValue(selectedSemester?.schoolYearId);
      if (!schoolYearId) throw new Error("Học kỳ chưa được liên kết với năm học. Vui lòng cập nhật học kỳ trước.");
      if (selectedTeacherIsAdjunct) {
        if (selectedAvailabilityIssue) throw new Error(selectedAvailabilityIssue);
        if (!form.confirmationDeadline) throw new Error("Cần đặt hạn xác nhận cho giáo viên thỉnh giảng.");
        if (new Date(form.confirmationDeadline).getTime() <= Date.now()) throw new Error("Hạn xác nhận phải là thời điểm trong tương lai.");
      }

      const payload: ScheduleInput = {
        ...(editingSchedule ? { id: editingSchedule.id } : {}),
        teacherId: form.teacherId,
        subjectId: form.subjectId,
        classId: form.classId,
        roomId: form.roomId,
        campusId: form.campusId,
        departmentId: scheduleDepartmentId,
        semesterId: form.semesterId,
        schoolYearId,
        weekStart: form.weekStart,
        dayOfWeek: Number(form.dayOfWeek),
        startPeriod,
        endPeriod: lastPeriod + 1,
        status: "scheduled",
        cancellationReason: "",
        confirmationDeadline: form.confirmationDeadline ? new Date(form.confirmationDeadline).toISOString() : undefined,
      };
      await createOrUpdateSchedule(payload);
      toast.success(editingSchedule ? "Đã cập nhật lịch dạy." : "Đã tạo lịch dạy.");
      setOpen(false);
      setEditingSchedule(null);
      setForm(initialForm);
    } catch (submitError) {
      setFormError(firebaseErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  function exportStudentTimetable() {
    setExportError("");
    setExporting(true);
    try {
      if (!exportWeekStart) throw new Error("Vui lòng chọn tuần cần xuất.");
      if (exportCandidateRows.length === 0) {
        throw new Error(exportOnlyReady
          ? "Không có lịch đã sẵn sàng để xuất trong tuần và lớp đã chọn."
          : "Không có lịch trong tuần và lớp đã chọn.");
      }

      const workbook = buildStudentTimetableWorkbook({
        schoolName: exportSchoolName,
        weekStart: exportWeekStart,
        classId: exportClassId || undefined,
        schedules: exportCandidateRows,
        classes,
        subjects,
        teachers,
        rooms,
        timeSlots,
      });
      downloadStudentTimetableWorkbook(workbook);
      toast.success(`Đã xuất thời khóa biểu ${workbook.worksheetCount} lớp, ${workbook.scheduleCount} lịch.`);
      setExportOpen(false);
    } catch (exportFailure) {
      setExportError(exportFailure instanceof Error ? exportFailure.message : "Không thể xuất thời khóa biểu.");
    } finally {
      setExporting(false);
    }
  }

  async function cancelSelectedSchedule(row: ScheduleRow) {
    const reason = window.prompt("Nhập lý do hủy lịch. Lịch đã hủy vẫn được giữ trong lịch sử:")?.trim();
    if (!reason) return;
    setCancelling(true);
    setError("");
    try {
      await createOrUpdateSchedule({
        id: row.id,
        teacherId: textValue(row.actualTeacherId) || textValue(row.teacherId),
        subjectId: textValue(row.subjectId),
        classId: textValue(row.classId),
        roomId: textValue(row.roomId),
        campusId: textValue(row.campusId),
        departmentId: textValue(row.departmentId),
        semesterId: textValue(row.semesterId),
        schoolYearId: textValue(row.schoolYearId),
        weekStart: textValue(row.weekStart),
        dayOfWeek: Number(row.dayOfWeek),
        startPeriod: Number(row.startPeriod),
        endPeriod: Number(row.endPeriod),
        status: "cancelled",
        cancellationReason: reason,
      });
      setDetail(null);
      toast.success("Đã hủy lịch và giải phóng giáo viên, lớp, phòng.");
    } catch (cancelError) {
      setError(firebaseErrorMessage(cancelError));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin", "totruong"]}>
      <Shell>
        <PageHeader
          eyebrow={role === "totruong" ? "Điều phối trong tổ" : "Điều phối giảng dạy"}
          title={role === "totruong" ? "Thời khóa biểu bộ môn" : "Thời khóa biểu tổng"}
          description="Lịch tuần dùng chung cho giáo viên cơ hữu và thỉnh giảng. Mọi thay đổi được kiểm tra xung đột tại Cloud Functions."
          actions={(
            <div className="flex flex-wrap gap-2">
              {role === "admin" ? (
                <>
                  <Button variant="secondary" asChild>
                    <a href="/admin/ai-scheduler/"><Sparkles className="h-4 w-4" />AI xếp lịch</a>
                  </Button>
                  <Button variant="secondary" onClick={() => { setExportError(""); setExportOpen(true); }}>
                    <FileSpreadsheet className="h-4 w-4" />Xuất TKB học sinh
                  </Button>
                </>
              ) : null}
              <Button onClick={openCreate}><CalendarPlus className="h-4 w-4" />Tạo lịch dạy</Button>
            </div>
          )}
        />

        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-blue-700"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Giáo viên cơ hữu</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-violet-700"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" />Giáo viên thỉnh giảng</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-amber-700"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Lịch dạy thay</span>
        </div>

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {catalogError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{catalogError}</div> : null}
        {timeSlots.length === 0 ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Chưa có tiết học đang hoạt động. Hãy cấu hình mục “Tiết học” trước khi tạo lịch.</div> : null}
        {availabilityError ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{availabilityError}</div> : null}

        {role === "admin" ? (
          <Card className="mb-5 overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="h-5 w-5 text-primary" />Khung giờ rảnh của giáo viên thỉnh giảng</h2>
                <p className="mt-1 text-sm text-muted-foreground">Duyệt đăng ký trước, sau đó bấm đúng ô Thứ/Tiết để mở biểu mẫu xếp lịch. Nhiều giáo viên có thể cùng được duyệt một khung giờ; chỉ khi tạo lịch dạy chính thức hệ thống mới kiểm tra trùng giáo viên, lớp và phòng.</p>
              </div>
              <Badge tone={sortedAvailabilityRows.some((row) => reviewStatusOf(row) === "pending") ? "warning" : "success"}>
                {sortedAvailabilityRows.filter((row) => reviewStatusOf(row) === "pending").length} chờ duyệt
              </Badge>
            </div>
            {availabilityLoading ? (
              <div className="p-4"><Skeleton className="h-40 w-full" /></div>
            ) : sortedAvailabilityRows.length === 0 ? (
              <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Chưa có đăng ký nào được gửi" description="Khi giáo viên thỉnh giảng bấm Gửi đăng ký, họ tên và các Thứ/Tiết trống sẽ xuất hiện tại đây." />
            ) : (
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                {sortedAvailabilityRows.map((availability) => {
                  const teacher = teachers.find((row) => row.id === availability.teacherId);
                  const semester = semesters.find((row) => row.id === availability.semesterId);
                  const reviewStatus = reviewStatusOf(availability);
                  const slots = approvedAvailabilitySlots(availability).sort((a, b) => String(a).localeCompare(String(b), "vi", { numeric: true }));
                  return (
                    <div key={availability.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{teacher ? primaryCatalogName(teacher) : availability.teacherId}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{semester ? primaryCatalogName(semester) : availability.semesterId} · {catalogName(departments, teacher?.departmentId) || teacher?.departmentId || "Chưa có bộ môn"}</p>
                        </div>
                        <Badge tone={reviewStatus === "approved" ? "success" : reviewStatus === "rejected" ? "danger" : "warning"}>
                          {reviewStatus === "approved" ? "Đã duyệt" : reviewStatus === "rejected" ? "Đã từ chối" : "Chờ duyệt"}
                        </Badge>
                      </div>
                      {availability.reviewNote ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">Lý do: {availability.reviewNote}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {slots.map((slot) => reviewStatus === "approved" ? (
                          <button key={String(slot)} type="button" onClick={() => openCreateFromAvailability(availability, slot)} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">
                            {availabilitySlotLabel(slot)} · Xếp lịch
                          </button>
                        ) : (
                          <span key={String(slot)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{availabilitySlotLabel(slot)}</span>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        {reviewStatus !== "rejected" ? <Button variant="danger" loading={reviewingAvailabilityId === availability.id} onClick={() => void reviewAvailability(availability, "rejected")}><XCircle className="h-4 w-4" />Từ chối</Button> : null}
                        {reviewStatus !== "approved" ? <Button loading={reviewingAvailabilityId === availability.id} onClick={() => void reviewAvailability(availability, "approved")}><CheckCircle2 className="h-4 w-4" />Duyệt toàn bộ</Button> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}

        <Card className="overflow-hidden p-3 sm:p-5">
          {loading ? (
            <Skeleton className="h-[680px] w-full" />
          ) : rows.filter((row) => row.status !== "cancelled").length === 0 ? (
            <EmptyState icon={<CalendarPlus className="h-6 w-6" />} title="Chưa có lịch dạy" description="Tạo lịch đầu tiên để bắt đầu xếp thời khóa biểu." action={<Button onClick={openCreate}>Tạo lịch</Button>} />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <div className="min-w-[780px]">
                <FullCalendar
                  plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
                  initialView="timeGridWeek"
                  firstDay={1}
                  allDaySlot={false}
                  slotMinTime={calendarStart.length === 5 ? `${calendarStart}:00` : calendarStart}
                  slotMaxTime={calendarEnd.length === 5 ? `${calendarEnd}:00` : calendarEnd}
                  slotDuration="00:15:00"
                  height="auto"
                  headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,dayGridMonth" }}
                  buttonText={{ today: "Hôm nay", week: "Tuần", month: "Tháng" }}
                  events={events}
                  eventClick={(argument) => setDetail(argument.event.extendedProps.row as ScheduleRow)}
                  nowIndicator
                />
              </div>
            </div>
          )}
        </Card>

        <Modal
          open={exportOpen}
          onOpenChange={(next) => { setExportOpen(next); if (!next) setExportError(""); }}
          title="Xuất thời khóa biểu cho học sinh"
          description="Chọn tuần và lớp. Tệp Excel XML có một sheet cho mỗi lớp, hiển thị môn học, giáo viên và phòng học."
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setExportOpen(false)}>Đóng</Button>
              <Button loading={exporting} onClick={exportStudentTimetable}>
                <FileSpreadsheet className="h-4 w-4" />Xuất Excel
              </Button>
            </div>
          )}
        >
          <div className="space-y-4">
            <div>
              <Label>Tên trường hiển thị trên file</Label>
              <Input value={exportSchoolName} onChange={(event) => setExportSchoolName(event.target.value)} placeholder="TRƯỜNG THCS ..." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Tuần bắt đầu</Label>
                <Input type="date" value={exportWeekStart} onChange={(event) => setExportWeekStart(event.target.value)} />
              </div>
              <div>
                <Label>Lớp cần xuất</Label>
                <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={exportClassId} onChange={(event) => setExportClassId(event.target.value)}>
                  <option value="">Tất cả lớp có lịch</option>
                  {classes.map((row) => <option key={row.id} value={row.id}>{catalogOptionLabel(row)}</option>)}
                </select>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <input
                className="mt-1 h-4 w-4 rounded border-border"
                type="checkbox"
                checked={exportOnlyReady}
                onChange={(event) => setExportOnlyReady(event.target.checked)}
              />
              <span>
                <span className="block text-sm font-semibold">Chỉ xuất lịch đã sẵn sàng</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Loại lịch đã hủy, cần xử lý, giáo viên thỉnh giảng chưa xác nhận, từ chối hoặc quá hạn.</span>
              </span>
            </label>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Tuần đã chọn có <strong>{exportCandidateRows.length}</strong> lịch thuộc <strong>{exportClassCount}</strong> lớp phù hợp điều kiện xuất.
              <p className="mt-1 text-xs">Tệp có đuôi .xml và mở trực tiếp bằng Microsoft Excel; mỗi lớp là một sheet riêng.</p>
            </div>
            {exportError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{exportError}</div> : null}
          </div>
        </Modal>

        <Modal open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditingSchedule(null); }} title={editingSchedule ? "Sửa lịch dạy" : "Tạo lịch dạy"} description="Chọn dữ liệu nền. Tiết cuối được tính là tiết có học, hệ thống sẽ tự chuyển sang định dạng lưu trữ nội bộ." wide footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Đóng</Button><Button form="schedule-form" loading={submitting} type="submit" disabled={timeSlots.length === 0 || Boolean(selectedAvailabilityIssue) || Boolean(teacherTeachingIssue)}>{editingSchedule ? "Lưu thay đổi" : "Kiểm tra và lưu"}</Button></div>}>
          <form id="schedule-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            {catalogFields.map(({ key, label, options }) => (
              <div key={key}>
                <Label>{label}</Label>
                <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" required value={form[key]} onChange={(event) => setCatalogField(key, event.target.value)}>
                  <option value="">Chọn {label.toLocaleLowerCase("vi")}</option>
                  {options.map((row) => <option key={row.id} value={row.id}>{catalogOptionLabel(row)}</option>)}
                </select>
                {options.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Chưa có dữ liệu nền phù hợp.</p> : null}
              </div>
            ))}
            <div>
              <Label>Bộ môn của lịch</Label>
              <div className="flex min-h-11 items-center rounded-xl border border-border bg-muted px-3 py-2 text-sm font-semibold text-foreground">{departmentSummary}</div>
              {subjectDepartmentWarning ? <p className="mt-1 text-xs text-amber-700">{subjectDepartmentWarning}</p> : <p className="mt-1 text-xs text-muted-foreground">Bộ môn lấy theo hồ sơ giáo viên.</p>}
              {selectedTeacher && form.subjectId ? (
                <p className={`mt-1 text-xs ${teacherTeachingIssue ? "text-rose-700" : "text-emerald-700"}`}>
                  {teacherTeachingIssue || (() => { const grades = gradeScopeForSubject(selectedTeacher, form.subjectId); return grades.length ? `Phạm vi được phân công: khối ${grades.join(", ")}.` : "Hồ sơ cũ chưa giới hạn khối; hệ thống tạm cho phép các khối của môn này."; })()}
                </p>
              ) : null}
            </div>
            <div><Label>Tuần bắt đầu</Label><Input required type="date" value={form.weekStart} onChange={(event) => setField("weekStart", event.target.value)} /></div>
            <div><Label>Thứ</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={form.dayOfWeek} onChange={(event) => setField("dayOfWeek", event.target.value)}>{[2,3,4,5,6,7].map((day) => <option key={day} value={day}>Thứ {day}</option>)}</select></div>
            <div>
              <Label>Tiết bắt đầu</Label>
              <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" required value={form.startPeriod} onChange={(event) => {
                const nextStart = Number(event.target.value);
                setForm((current) => ({ ...current, startPeriod: event.target.value, endPeriod: String(Math.max(nextStart, Number(current.endPeriod))) }));
              }}>
                {timeSlots.map((slot) => <option key={slot.id} value={periodNumber(slot)}>{primaryCatalogName(slot)} · {slot.startTime || "?"}–{slot.endTime || "?"}</option>)}
              </select>
            </div>
            <div>
              <Label>Tiết cuối cùng</Label>
              <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" required value={form.endPeriod} onChange={(event) => setField("endPeriod", event.target.value)}>
                {timeSlots.filter((slot) => periodNumber(slot) >= Number(form.startPeriod)).map((slot) => <option key={slot.id} value={periodNumber(slot)}>{primaryCatalogName(slot)} · kết thúc {slot.endTime || "?"}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Ví dụ học tiết 1 và 2: chọn bắt đầu 1, tiết cuối 2.</p>
            </div>
            <div className="sm:col-span-2"><Label>Hạn xác nhận (chỉ cần cho giáo viên thỉnh giảng)</Label><Input type="datetime-local" value={form.confirmationDeadline} onChange={(event) => setField("confirmationDeadline", event.target.value)} /></div>
            {selectedTeacherIsAdjunct ? (
              <div className={`sm:col-span-2 rounded-xl border px-4 py-3 text-sm ${selectedAvailabilityIssue ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {selectedAvailabilityIssue || `Khung giờ hợp lệ. Giáo viên đã được duyệt cho Thứ ${form.dayOfWeek}, tiết ${form.startPeriod}${form.endPeriod !== form.startPeriod ? `–${form.endPeriod}` : ""}.`}
                {selectedAvailability && Array.isArray(selectedAvailability.slots) ? <p className="mt-1 text-xs">Các ô đã duyệt: {selectedAvailability.slots.map(availabilitySlotLabel).join(", ")}</p> : null}
              </div>
            ) : null}
            {formError ? <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div> : null}
          </form>
        </Modal>

        <Modal open={Boolean(detail)} onOpenChange={(next) => !next && setDetail(null)} title="Chi tiết lịch dạy" description="Lịch sử hủy được giữ lại để đối chiếu; thao tác hủy sẽ giải phóng toàn bộ khóa tài nguyên." footer={detail ? <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" loading={cancelling} onClick={() => void cancelSelectedSchedule(detail)}><Trash2 className="h-4 w-4" />Hủy lịch</Button><Button onClick={() => openEdit(detail)}><PencilLine className="h-4 w-4" />Sửa lịch</Button></div> : undefined}>
          {detail ? <div className="space-y-3 text-sm">{[
            ["Giáo viên thực dạy", catalogName(teachers, detail.actualTeacherId || detail.teacherId) || detail.actualTeacherId || detail.teacherId],
            ["Giáo viên gốc", textValue(detail.originalTeacherId) && detail.originalTeacherId !== (detail.actualTeacherId || detail.teacherId) ? catalogName(teachers, detail.originalTeacherId) || detail.originalTeacherId : "—"],
            ["Môn học", catalogName(subjects, detail.subjectId) || detail.subjectId],
            ["Lớp", catalogName(classes, detail.classId) || detail.classId],
            ["Phòng", catalogName(rooms, detail.roomId) || detail.roomId],
            ["Cơ sở", catalogName(campuses, detail.campusId) || detail.campusId],
            ["Thời lượng", periodDisplay(detail)],
            ["Trạng thái", detail.status],
            ["Xác nhận", detail.confirmationStatus],
          ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-border pb-3"><span className="text-muted-foreground">{label}</span><span className="text-right font-semibold">{value || "—"}</span></div>)}<div className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-blue-700"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p>Mọi thay đổi đi qua Cloud Function để kiểm tra xung đột và ghi nhật ký.</p></div></div> : null}
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
