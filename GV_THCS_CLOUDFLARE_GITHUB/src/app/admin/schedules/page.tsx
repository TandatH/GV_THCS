"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { ScheduleInput } from "@school/shared";
import { addDays, addMinutes, format, isValid, parseISO } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CalendarClock,
  CalendarPlus,
  CalendarSync,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CopyCheck,
  FileSpreadsheet,
  GraduationCap,
  Info,
  LayoutGrid,
  Loader2,
  MapPin,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  Trash2,
  User,
  XCircle,
  Zap,
} from "lucide-react";
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
import { addDaysDateOnly, currentWeekStartDateOnly, normalizeWeekStartDateOnly } from "@/lib/date-only";
import { buildStudentTimetableWorkbook, downloadStudentTimetableWorkbook } from "@/lib/exports/student-timetable";
import { cn } from "@/lib/utils";

const fallbackPeriodStartHour = 7;
const fallbackPeriodMinutes = 50;
const WEEKDAYS = [2, 3, 4, 5, 6] as const;

type ScheduleRow = DocumentData & { id: string };
type CatalogRow = DocumentData & { id: string };
type AvailabilityRow = DocumentData & { id: string };

type ViewScope = "class" | "teacher" | "room" | "all";
type LayoutMode = "matrix" | "teacher_grid" | "calendar";

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

// Modern distinct color theme per subject
type SubjectTheme = {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  accent: string;
  dot: string;
  tagBg: string;
};

const SUBJECT_COLOR_PRESETS: Record<string, SubjectTheme> = {
  toan: {
    bg: "bg-gradient-to-br from-blue-50/95 to-indigo-50/70 hover:from-blue-100/90 hover:to-indigo-100/80",
    border: "border-blue-200 hover:border-blue-400",
    text: "text-blue-950",
    badgeBg: "bg-blue-100 text-blue-800",
    accent: "border-l-4 border-l-blue-600",
    dot: "bg-blue-600",
    tagBg: "bg-blue-600/10 text-blue-800",
  },
  van: {
    bg: "bg-gradient-to-br from-emerald-50/95 to-teal-50/70 hover:from-emerald-100/90 hover:to-teal-100/80",
    border: "border-emerald-200 hover:border-emerald-400",
    text: "text-emerald-950",
    badgeBg: "bg-emerald-100 text-emerald-800",
    accent: "border-l-4 border-l-emerald-600",
    dot: "bg-emerald-600",
    tagBg: "bg-emerald-600/10 text-emerald-800",
  },
  tiengviet: {
    bg: "bg-gradient-to-br from-teal-50/95 to-emerald-50/70 hover:from-teal-100/90 hover:to-emerald-100/80",
    border: "border-teal-200 hover:border-teal-400",
    text: "text-teal-950",
    badgeBg: "bg-teal-100 text-teal-800",
    accent: "border-l-4 border-l-teal-600",
    dot: "bg-teal-600",
    tagBg: "bg-teal-600/10 text-teal-800",
  },
  tienganh: {
    bg: "bg-gradient-to-br from-violet-50/95 to-purple-50/70 hover:from-violet-100/90 hover:to-purple-100/80",
    border: "border-violet-200 hover:border-violet-400",
    text: "text-violet-950",
    badgeBg: "bg-violet-100 text-violet-800",
    accent: "border-l-4 border-l-violet-600",
    dot: "bg-violet-600",
    tagBg: "bg-violet-600/10 text-violet-800",
  },
  khoahoc: {
    bg: "bg-gradient-to-br from-amber-50/95 to-orange-50/70 hover:from-amber-100/90 hover:to-orange-100/80",
    border: "border-amber-200 hover:border-amber-400",
    text: "text-amber-950",
    badgeBg: "bg-amber-100 text-amber-800",
    accent: "border-l-4 border-l-amber-600",
    dot: "bg-amber-600",
    tagBg: "bg-amber-600/10 text-amber-800",
  },
  lichsu: {
    bg: "bg-gradient-to-br from-rose-50/95 to-red-50/70 hover:from-rose-100/90 hover:to-red-100/80",
    border: "border-rose-200 hover:border-rose-400",
    text: "text-rose-950",
    badgeBg: "bg-rose-100 text-rose-800",
    accent: "border-l-4 border-l-rose-600",
    dot: "bg-rose-600",
    tagBg: "bg-rose-600/10 text-rose-800",
  },
  tinhoc: {
    bg: "bg-gradient-to-br from-cyan-50/95 to-sky-50/70 hover:from-cyan-100/90 hover:to-sky-100/80",
    border: "border-cyan-200 hover:border-cyan-400",
    text: "text-cyan-950",
    badgeBg: "bg-cyan-100 text-cyan-800",
    accent: "border-l-4 border-l-cyan-600",
    dot: "bg-cyan-600",
    tagBg: "bg-cyan-600/10 text-cyan-800",
  },
  mythuat: {
    bg: "bg-gradient-to-br from-fuchsia-50/95 to-pink-50/70 hover:from-fuchsia-100/90 hover:to-pink-100/80",
    border: "border-fuchsia-200 hover:border-fuchsia-400",
    text: "text-fuchsia-950",
    badgeBg: "bg-fuchsia-100 text-fuchsia-800",
    accent: "border-l-4 border-l-fuchsia-600",
    dot: "bg-fuchsia-600",
    tagBg: "bg-fuchsia-600/10 text-fuchsia-800",
  },
  theduc: {
    bg: "bg-gradient-to-br from-lime-50/95 to-green-50/70 hover:from-lime-100/90 hover:to-green-100/80",
    border: "border-lime-200 hover:border-lime-400",
    text: "text-lime-950",
    badgeBg: "bg-lime-100 text-lime-800",
    accent: "border-l-4 border-l-lime-600",
    dot: "bg-lime-600",
    tagBg: "bg-lime-600/10 text-lime-800",
  },
  gdcd: {
    bg: "bg-gradient-to-br from-yellow-50/95 to-amber-50/70 hover:from-yellow-100/90 hover:to-amber-100/80",
    border: "border-yellow-200 hover:border-yellow-400",
    text: "text-yellow-950",
    badgeBg: "bg-yellow-100 text-yellow-800",
    accent: "border-l-4 border-l-yellow-600",
    dot: "bg-yellow-600",
    tagBg: "bg-yellow-600/10 text-yellow-800",
  },
};

const DYNAMIC_PALETTES: SubjectTheme[] = [
  {
    bg: "bg-gradient-to-br from-sky-50/95 to-blue-50/70 hover:from-sky-100/90 hover:to-blue-100/80",
    border: "border-sky-200 hover:border-sky-400",
    text: "text-sky-950",
    badgeBg: "bg-sky-100 text-sky-800",
    accent: "border-l-4 border-l-sky-500",
    dot: "bg-sky-500",
    tagBg: "bg-sky-600/10 text-sky-800",
  },
  {
    bg: "bg-gradient-to-br from-purple-50/95 to-indigo-50/70 hover:from-purple-100/90 hover:to-indigo-100/80",
    border: "border-purple-200 hover:border-purple-400",
    text: "text-purple-950",
    badgeBg: "bg-purple-100 text-purple-800",
    accent: "border-l-4 border-l-purple-500",
    dot: "bg-purple-500",
    tagBg: "bg-purple-600/10 text-purple-800",
  },
  {
    bg: "bg-gradient-to-br from-pink-50/95 to-rose-50/70 hover:from-pink-100/90 hover:to-rose-100/80",
    border: "border-pink-200 hover:border-pink-400",
    text: "text-pink-950",
    badgeBg: "bg-pink-100 text-pink-800",
    accent: "border-l-4 border-l-pink-500",
    dot: "bg-pink-500",
    tagBg: "bg-pink-600/10 text-pink-800",
  },
  {
    bg: "bg-gradient-to-br from-amber-50/95 to-yellow-50/70 hover:from-amber-100/90 hover:to-yellow-100/80",
    border: "border-amber-200 hover:border-amber-400",
    text: "text-amber-950",
    badgeBg: "bg-amber-100 text-amber-800",
    accent: "border-l-4 border-l-amber-500",
    dot: "bg-amber-500",
    tagBg: "bg-amber-600/10 text-amber-800",
  },
  {
    bg: "bg-gradient-to-br from-teal-50/95 to-cyan-50/70 hover:from-teal-100/90 hover:to-cyan-100/80",
    border: "border-teal-200 hover:border-teal-400",
    text: "text-teal-950",
    badgeBg: "bg-teal-100 text-teal-800",
    accent: "border-l-4 border-l-teal-500",
    dot: "bg-teal-500",
    tagBg: "bg-teal-600/10 text-teal-800",
  },
  {
    bg: "bg-gradient-to-br from-indigo-50/95 to-blue-50/70 hover:from-indigo-100/90 hover:to-blue-100/80",
    border: "border-indigo-200 hover:border-indigo-400",
    text: "text-indigo-950",
    badgeBg: "bg-indigo-100 text-indigo-800",
    accent: "border-l-4 border-l-indigo-500",
    dot: "bg-indigo-500",
    tagBg: "bg-indigo-600/10 text-indigo-800",
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

function getSubjectHexColor(subjectName: string, subjectId: string): string {
  const norm = (subjectName || subjectId || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
  if (norm.includes("toan")) return "#2563eb";
  if (norm.includes("tiengviet")) return "#0d9488";
  if (norm.includes("van") || norm.includes("nguvan")) return "#059669";
  if (norm.includes("anh") || norm.includes("tienganh") || norm.includes("english")) return "#7c3aed";
  if (norm.includes("khoahoc") || norm.includes("khtn") || norm.includes("ly") || norm.includes("hoa") || norm.includes("sinh")) return "#d97706";
  if (norm.includes("su") || norm.includes("lichsu") || norm.includes("dia") || norm.includes("dialy")) return "#e11d48";
  if (norm.includes("tin") || norm.includes("tinhoc") || norm.includes("congnghe")) return "#0891b2";
  if (norm.includes("nhac") || norm.includes("amnhac") || norm.includes("mythuat")) return "#c026d3";
  if (norm.includes("theduc") || norm.includes("gdtc")) return "#65a30d";
  if (norm.includes("gdcd") || norm.includes("daoduc") || norm.includes("trainghiem")) return "#ca8a04";

  const hexes = ["#0284c7", "#9333ea", "#db2777", "#ea580c", "#0f766e", "#4f46e5"];
  let hash = 0;
  const str = subjectName || subjectId || "subject";
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hexes[Math.abs(hash) % hexes.length];
}

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

function numericGrade(value: unknown) {
  const grade = Number(value);
  return Number.isInteger(grade) && grade >= 1 && grade <= 9 ? grade : 0;
}

function schoolLevelForGrade(grade: number) {
  if (grade >= 1 && grade <= 5) return "primary";
  if (grade >= 6 && grade <= 9) return "secondary";
  return "";
}

function catalogSchoolLevel(row: CatalogRow | null | undefined) {
  const explicit = textValue(row?.schoolLevel);
  if (explicit === "primary" || explicit === "secondary") return explicit;
  return schoolLevelForGrade(numericGrade(row?.grade ?? row?.gradeLevel));
}

function timeSlotSchoolLevel(row: CatalogRow | null | undefined) {
  const explicit = textValue(row?.schoolLevel);
  return explicit === "primary" || explicit === "secondary" ? explicit : "secondary";
}

function timeSlotsForLevel(rows: CatalogRow[], level: string) {
  if (level !== "primary" && level !== "secondary") return [] as CatalogRow[];
  return rows.filter((row) => timeSlotSchoolLevel(row) === level);
}

function teacherSchoolLevels(teacher: CatalogRow | null | undefined) {
  if (Array.isArray(teacher?.schoolLevels)) {
    const levels = teacher.schoolLevels.map(String).filter((level) => level === "primary" || level === "secondary");
    if (levels.length > 0) return levels;
  }
  return ["secondary"];
}

function subjectMatchesClass(subject: CatalogRow | null | undefined, schoolClass: CatalogRow | null | undefined) {
  if (!subject || !schoolClass) return true;
  const subjectGrade = numericGrade(subject.grade ?? subject.gradeLevel);
  const classGrade = numericGrade(schoolClass.grade ?? schoolClass.gradeLevel);
  if (subjectGrade && classGrade && subjectGrade !== classGrade) return false;
  const subjectLevel = catalogSchoolLevel(subject);
  const classLevel = catalogSchoolLevel(schoolClass);
  return !subjectLevel || !classLevel || subjectLevel === classLevel;
}

function teacherMatchesClass(teacher: CatalogRow | null | undefined, schoolClass: CatalogRow | null | undefined) {
  if (!teacher || !schoolClass) return true;
  const classLevel = catalogSchoolLevel(schoolClass);
  return !classLevel || teacherSchoolLevels(teacher).includes(classLevel);
}

function teacherCanTeachSubjectAtClass(teacher: CatalogRow | null | undefined, subject: CatalogRow | null | undefined, schoolClass: CatalogRow | null | undefined) {
  if (!teacher || !subject) return true;
  const subjectIds = Array.isArray(teacher.subjectIds) ? teacher.subjectIds.map(String) : [];
  if (subjectIds.length > 0 && !subjectIds.includes(subject.id)) return false;
  const assignments = Array.isArray(teacher.teachingAssignments) ? teacher.teachingAssignments : [];
  if (assignments.length === 0) return true;
  const assignment = assignments.find((item) => item && typeof item === "object" && String((item as Record<string, unknown>).subjectId ?? "") === subject.id) as Record<string, unknown> | undefined;
  if (!assignment) return false;
  const classGrade = numericGrade(schoolClass?.grade ?? schoolClass?.gradeLevel);
  if (!classGrade) return true;
  const grades = Array.isArray(assignment.gradeLevels) ? assignment.gradeLevels.map(Number) : [];
  return grades.includes(classGrade);
}

function periodNumber(row: CatalogRow) {
  return Number(row.periodNumber ?? row.order ?? row.period ?? 0);
}

function activeTimeSlotRows(rows: CatalogRow[]) {
  return rows
    .filter((row) => row.isActive !== false && periodNumber(row) > 0)
    .sort((first, second) => periodNumber(first) - periodNumber(second));
}

function timeAtBoundary(row: ScheduleRow, slots: CatalogRow[], classes: CatalogRow[], boundary: "start" | "end") {
  const date = dateForSchedule(row);
  const period = boundary === "start" ? Number(row.startPeriod || 1) : Math.max(1, Number(row.endPeriod || 2) - 1);
  const schoolClass = classes.find((item) => item.id === textValue(row.classId));
  const level = textValue(row.schoolLevel) || catalogSchoolLevel(schoolClass) || "secondary";
  const slot = slots.find((item) => timeSlotSchoolLevel(item) === level && periodNumber(item) === period);
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

function resolveAvailabilitySlot(slot: unknown, timeSlots: CatalogRow[]) {
  const value = String(slot ?? "");
  const scoped = /^(primary|secondary):([2-7]):([^:]+)$/.exec(value);
  if (scoped) {
    const schoolLevel = scoped[1] as "primary" | "secondary";
    const dayOfWeek = Number(scoped[2]);
    const token = scoped[3];
    const byId = timeSlots.find((row) => row.id === token && timeSlotSchoolLevel(row) === schoolLevel);
    if (byId) return { schoolLevel, dayOfWeek, period: periodNumber(byId), timeSlot: byId };
    if (/^\d+$/.test(token)) {
      const byPeriod = timeSlots.find((row) => timeSlotSchoolLevel(row) === schoolLevel && periodNumber(row) === Number(token));
      if (byPeriod) return { schoolLevel, dayOfWeek, period: periodNumber(byPeriod), timeSlot: byPeriod };
    }
    return null;
  }
  const legacy = /^([2-7]):([1-9][0-9]?)$/.exec(value);
  if (!legacy) return null;
  const dayOfWeek = Number(legacy[1]);
  const period = Number(legacy[2]);
  const timeSlot = timeSlots.find((row) => timeSlotSchoolLevel(row) === "secondary" && periodNumber(row) === period) ?? null;
  return { schoolLevel: "secondary" as const, dayOfWeek, period, timeSlot };
}

function availabilitySlotLabel(slot: unknown, timeSlots: CatalogRow[] = []) {
  const parsed = resolveAvailabilitySlot(slot, timeSlots);
  if (!parsed) return String(slot);
  const level = parsed.schoolLevel === "primary" ? "Tiểu học" : "THCS";
  const start = textValue(parsed.timeSlot?.startTime);
  const end = textValue(parsed.timeSlot?.endTime);
  const clock = start && end ? ` · ${start}–${end}` : "";
  return `${level} · Thứ ${parsed.dayOfWeek} · Tiết ${parsed.period}${clock}`;
}

function approvedAvailabilitySlots(row: AvailabilityRow | null) {
  if (!row) return [] as string[];
  if (Array.isArray(row.approvedSlots) && row.approvedSlots.length > 0) return row.approvedSlots.map(String);
  return Array.isArray(row.slots) ? row.slots.map(String) : [];
}

function availabilityCoversSelection(
  row: AvailabilityRow | null,
  schoolLevel: string,
  dayOfWeek: number,
  startPeriod: number,
  lastPeriod: number,
  timeSlots: CatalogRow[],
) {
  if (schoolLevel !== "primary" && schoolLevel !== "secondary") return false;
  const approvedSlots = approvedAvailabilitySlots(row);
  if (approvedSlots.length === 0) return false;
  for (let period = startPeriod; period <= lastPeriod; period += 1) {
    const configured = timeSlots.find((slot) => timeSlotSchoolLevel(slot) === schoolLevel && periodNumber(slot) === period && slot.isActive !== false);
    if (!configured) return false;
    const scoped = `${schoolLevel}:${dayOfWeek}:${configured.id}`;
    const legacy = `${dayOfWeek}:${period}`;
    if (!approvedSlots.includes(scoped) && !(schoolLevel === "secondary" && approvedSlots.includes(legacy))) return false;
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

function formatDayHeader(weekStart: string, dayOfWeek: number) {
  const base = parseISO(weekStart);
  if (!isValid(base)) return { dayName: `Thứ ${dayOfWeek}`, dateStr: "", fullDate: new Date() };
  const dayDate = addDays(base, dayOfWeek - 2);
  const dayStr = String(dayDate.getDate()).padStart(2, "0");
  const monthStr = String(dayDate.getMonth() + 1).padStart(2, "0");
  return {
    dayName: `Thứ ${dayOfWeek}`,
    dateStr: `${dayStr}/${monthStr}`,
    fullDate: dayDate,
  };
}

function formatWeekRange(weekStart: string) {
  const base = parseISO(weekStart);
  if (!isValid(base)) return weekStart;
  const friday = addDays(base, 4);
  return `${format(base, "dd/MM/yyyy")} — ${format(friday, "dd/MM/yyyy")}`;
}

export default function SchedulesPage() {
  const { role, claims, loading: authLoading } = useAuth();
  const managerDepartmentId = typeof claims?.departmentId === "string" ? claims.departmentId : "";
  const bghSchoolLevel = typeof claims?.schoolLevel === "string" ? claims.schoolLevel : "secondary";

  // Data states
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [teachers, setTeachers] = useState<CatalogRow[]>([]);
  const [subjects, setSubjects] = useState<CatalogRow[]>([]);
  const [classes, setClasses] = useState<CatalogRow[]>([]);
  const [rooms, setRooms] = useState<CatalogRow[]>([]);
  const [campuses, setCampuses] = useState<CatalogRow[]>([]);
  const [departments, setDepartments] = useState<CatalogRow[]>([]);
  const [semesters, setSemesters] = useState<CatalogRow[]>([]);
  const [timeSlots, setTimeSlots] = useState<CatalogRow[]>([]);

  // Navigation & Filter states
  const [selectedWeek, setSelectedWeek] = useState(currentMonday());
  const [viewScope, setViewScope] = useState<ViewScope>("class");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedSchoolLevel, setSelectedSchoolLevel] = useState<string>("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(managerDepartmentId || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("matrix");

  // Modals & form states
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ScheduleRow | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRow | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [formError, setFormError] = useState("");

  // Availability states
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [reviewingAvailabilityId, setReviewingAvailabilityId] = useState("");
  const [showAvailabilitySection, setShowAvailabilitySection] = useState(true);

  // Export states
  const [exportOpen, setExportOpen] = useState(false);
  const [exportWeekStart, setExportWeekStart] = useState(currentMonday());
  const [exportClassId, setExportClassId] = useState("");
  const [exportSchoolName, setExportSchoolName] = useState("TRƯỜNG THCS");
  const [exportOnlyReady, setExportOnlyReady] = useState(true);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Replicate / Apply Timetable to Next Weeks states
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyScope, setApplyScope] = useState<"all" | "class" | "teacher">("all");
  const [applyWeeksCount, setApplyWeeksCount] = useState<number>(1);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [applyError, setApplyError] = useState("");

  // Sync school level for bgh
  useEffect(() => {
    if (role === "bgh" && bghSchoolLevel && bghSchoolLevel !== "all") {
      setSelectedSchoolLevel(bghSchoolLevel);
    }
  }, [role, bghSchoolLevel]);

  // Sync manager department for totruong
  useEffect(() => {
    if (role === "totruong" && managerDepartmentId) {
      setSelectedDepartmentId(managerDepartmentId);
    }
  }, [role, managerDepartmentId]);

  // Query schedules
  useEffect(() => {
    if (authLoading || !role) return;
    if (role === "totruong" && !managerDepartmentId) {
      setError("Tài khoản tổ trưởng chưa được gán bộ môn phụ trách.");
      setLoading(false);
      return;
    }
    const schedulesQuery = role === "totruong"
      ? query(collection(firestore, "schedules"), where("departmentId", "==", managerDepartmentId), limit(1000))
      : query(collection(firestore, "schedules"), limit(1000));
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

  // Query catalogs
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

  // Auto select default class/teacher when catalogs load
  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (!selectedTeacherId && teachers.length > 0) {
      setSelectedTeacherId(teachers[0].id);
    }
  }, [teachers, selectedTeacherId]);

  useEffect(() => {
    if (!selectedRoomId && rooms.length > 0) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  // Query availability for admin
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

  // Filtered lists based on secondary filters
  const filteredCatalogClasses = useMemo(() => {
    return classes.filter((cls) => {
      if (selectedSchoolLevel && catalogSchoolLevel(cls) !== selectedSchoolLevel) return false;
      return true;
    });
  }, [classes, selectedSchoolLevel]);

  const filteredCatalogTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      if (selectedDepartmentId && teacher.departmentId !== selectedDepartmentId) return false;
      if (selectedSchoolLevel && !teacherSchoolLevels(teacher).includes(selectedSchoolLevel)) return false;
      return true;
    });
  }, [teachers, selectedDepartmentId, selectedSchoolLevel]);

  // Filter schedules for the current active view
  const currentWeekSchedules = useMemo(() => {
    return rows.filter((row) => {
      if (row.status === "cancelled") return false;
      if (textValue(row.weekStart) !== selectedWeek) return false;
      const day = Number(row.dayOfWeek || 0);
      if (day < 2 || day > 6) return false; // Chỉ hiển thị Thứ 2 - Thứ 6

      // Filter by Scope
      if (viewScope === "class" && selectedClassId && row.classId !== selectedClassId) return false;
      if (viewScope === "teacher" && selectedTeacherId && (row.actualTeacherId || row.teacherId) !== selectedTeacherId) return false;
      if (viewScope === "room" && selectedRoomId && row.roomId !== selectedRoomId) return false;

      // Filter by Level
      if (selectedSchoolLevel) {
        const cls = classes.find((c) => c.id === row.classId);
        const lvl = row.schoolLevel || catalogSchoolLevel(cls);
        if (lvl && lvl !== selectedSchoolLevel) return false;
      }

      // Filter by Department
      if (selectedDepartmentId && row.departmentId !== selectedDepartmentId) return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const teacherName = (catalogName(teachers, row.actualTeacherId || row.teacherId) || "").toLowerCase();
        const className = (catalogName(classes, row.classId) || "").toLowerCase();
        const subjectName = (catalogName(subjects, row.subjectId) || "").toLowerCase();
        const roomName = (catalogName(rooms, row.roomId) || "").toLowerCase();
        if (!teacherName.includes(q) && !className.includes(q) && !subjectName.includes(q) && !roomName.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [classes, rows, rooms, searchQuery, selectedClassId, selectedDepartmentId, selectedRoomId, selectedSchoolLevel, selectedTeacherId, selectedWeek, subjects, teachers, viewScope]);

  // Period matrix structure
  const activeLevelForSlots = useMemo(() => {
    if (viewScope === "class" && selectedClassId) {
      const cls = classes.find((c) => c.id === selectedClassId);
      return catalogSchoolLevel(cls) || "secondary";
    }
    return selectedSchoolLevel || "secondary";
  }, [classes, selectedClassId, selectedSchoolLevel, viewScope]);

  const levelTimeSlots = useMemo(() => {
    const slots = timeSlotsForLevel(timeSlots, activeLevelForSlots);
    if (slots.length > 0) return slots;
    return timeSlots;
  }, [activeLevelForSlots, timeSlots]);

  // Standard Vietnam school periods (Sáng 1-5, Chiều 6-10)
  const morningPeriods = useMemo(() => {
    const configured = levelTimeSlots.filter((slot) => periodNumber(slot) <= 5);
    if (configured.length > 0) return configured;
    return [
      { id: "slot-1", periodNumber: 1, name: "Tiết 1", startTime: "07:00", endTime: "07:45" },
      { id: "slot-2", periodNumber: 2, name: "Tiết 2", startTime: "07:50", endTime: "08:35" },
      { id: "slot-3", periodNumber: 3, name: "Tiết 3", startTime: "08:55", endTime: "09:40" },
      { id: "slot-4", periodNumber: 4, name: "Tiết 4", startTime: "09:45", endTime: "10:30" },
      { id: "slot-5", periodNumber: 5, name: "Tiết 5", startTime: "10:35", endTime: "11:20" },
    ] as CatalogRow[];
  }, [levelTimeSlots]);

  const afternoonPeriods = useMemo(() => {
    const configured = levelTimeSlots.filter((slot) => periodNumber(slot) > 5 && periodNumber(slot) <= 10);
    if (configured.length > 0) return configured;
    return [
      { id: "slot-6", periodNumber: 6, name: "Tiết 6", startTime: "13:00", endTime: "13:45" },
      { id: "slot-7", periodNumber: 7, name: "Tiết 7", startTime: "13:50", endTime: "14:35" },
      { id: "slot-8", periodNumber: 8, name: "Tiết 8", startTime: "14:50", endTime: "15:35" },
      { id: "slot-9", periodNumber: 9, name: "Tiết 9", startTime: "15:40", endTime: "16:25" },
      { id: "slot-10", periodNumber: 10, name: "Tiết 10", startTime: "16:30", endTime: "17:15" },
    ] as CatalogRow[];
  }, [levelTimeSlots]);

  // Statistics for the selected entity (Class / Teacher / Room)
  const currentEntityStats = useMemo(() => {
    const totalPeriodsCount = currentWeekSchedules.reduce((acc, curr) => {
      const start = Number(curr.startPeriod || 0);
      const end = Number(curr.endPeriod || start + 1);
      return acc + Math.max(1, end - start);
    }, 0);

    const morningCount = currentWeekSchedules.reduce((acc, curr) => {
      const start = Number(curr.startPeriod || 0);
      const end = Number(curr.endPeriod || start + 1);
      let count = 0;
      for (let p = start; p < end; p++) {
        if (p <= 5) count++;
      }
      return acc + count;
    }, 0);

    const afternoonCount = totalPeriodsCount - morningCount;

    // Check for period conflicts in the currently filtered view
    const conflictMap = new Map<string, number>();
    let hasConflict = false;
    currentWeekSchedules.forEach((curr) => {
      const day = Number(curr.dayOfWeek || 0);
      const start = Number(curr.startPeriod || 0);
      const end = Number(curr.endPeriod || start + 1);
      for (let p = start; p < end; p++) {
        const key = `${day}-${p}`;
        const prev = conflictMap.get(key) || 0;
        conflictMap.set(key, prev + 1);
        if (prev >= 1) hasConflict = true;
      }
    });

    const activeDaysCount = new Set(currentWeekSchedules.map((r) => Number(r.dayOfWeek))).size;

    return {
      totalPeriods: totalPeriodsCount,
      morningPeriods: morningCount,
      afternoonPeriods: afternoonCount,
      activeDays: activeDaysCount,
      hasConflict,
    };
  }, [currentWeekSchedules]);

  // Teacher availability slots for quick visual scheduling
  const selectedTeacherAvailabilitySlots = useMemo(() => {
    if (viewScope !== "teacher" || !selectedTeacherId) return new Set<string>();
    const avail = availabilityRows.find((row) => row.teacherId === selectedTeacherId);
    if (!avail) return new Set<string>();
    const approved = approvedAvailabilitySlots(avail);
    const set = new Set<string>();
    approved.forEach((slotStr) => {
      const parsed = resolveAvailabilitySlot(slotStr, timeSlots);
      if (parsed) {
        set.add(`${parsed.dayOfWeek}-${parsed.period}`);
      }
    });
    return set;
  }, [availabilityRows, selectedTeacherId, timeSlots, viewScope]);

  // FullCalendar events with distinct subject colors
  const calendarEvents = useMemo(() => {
    return currentWeekSchedules.map((row) => {
      const subjectTitle = row.subjectName || catalogName(subjects, row.subjectId) || row.subjectId || "Môn học";
      const hex = getSubjectHexColor(subjectTitle, row.subjectId);
      return {
        id: row.id,
        title: `${subjectTitle} · ${row.className || catalogName(classes, row.classId) || row.classId || "Lớp"}`,
        start: timeAtBoundary(row, timeSlots, classes, "start"),
        end: timeAtBoundary(row, timeSlots, classes, "end"),
        backgroundColor: hex,
        borderColor: "transparent",
        extendedProps: { row },
      };
    });
  }, [classes, currentWeekSchedules, subjects, timeSlots]);

  const calendarStart = textValue(timeSlots[0]?.startTime) || "06:30:00";
  const calendarEnd = textValue(timeSlots[timeSlots.length - 1]?.endTime) || "19:00:00";

  // Form helpers & dependencies
  const selectedTeacher = useMemo(() => selectedCatalogRow(teachers, form.teacherId), [form.teacherId, teachers]);
  const teacherDepartmentId = textValue(selectedTeacher?.departmentId);
  const selectedSubject = useMemo(() => selectedCatalogRow(subjects, form.subjectId), [form.subjectId, subjects]);
  const subjectDepartmentId = textValue(selectedSubject?.departmentId);
  const selectedClass = useMemo(() => selectedCatalogRow(classes, form.classId), [classes, form.classId]);
  const selectedClassLevel = catalogSchoolLevel(selectedClass);
  const selectedFormTimeSlots = useMemo(
    () => timeSlotsForLevel(timeSlots, selectedClassLevel),
    [selectedClassLevel, timeSlots],
  );
  const selectedSemester = useMemo(() => selectedCatalogRow(semesters, form.semesterId), [form.semesterId, semesters]);

  const filteredFormTeachers = useMemo(() => teachers.filter((teacher) => teacher.id === form.teacherId || (
    teacherMatchesClass(teacher, selectedClass)
    && teacherCanTeachSubjectAtClass(teacher, selectedSubject, selectedClass)
  )), [form.teacherId, selectedClass, selectedSubject, teachers]);

  const filteredFormSubjects = useMemo(() => subjects.filter((subject) => subject.id === form.subjectId || (
    subjectMatchesClass(subject, selectedClass)
    && teacherCanTeachSubjectAtClass(selectedTeacher, subject, selectedClass)
  )), [form.subjectId, selectedClass, selectedTeacher, subjects]);

  const filteredFormClasses = useMemo(() => classes.filter((schoolClass) => schoolClass.id === form.classId || (
    subjectMatchesClass(selectedSubject, schoolClass)
    && teacherMatchesClass(selectedTeacher, schoolClass)
    && teacherCanTeachSubjectAtClass(selectedTeacher, selectedSubject, schoolClass)
  )), [classes, form.classId, selectedSubject, selectedTeacher]);

  const catalogFields: { key: Exclude<CatalogFieldKey, "departmentId">; label: string; options: CatalogRow[] }[] = [
    { key: "teacherId", label: "Giáo viên", options: filteredFormTeachers },
    { key: "subjectId", label: "Môn học", options: filteredFormSubjects },
    { key: "classId", label: "Lớp học", options: filteredFormClasses },
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
    selectedClassLevel,
    Number(form.dayOfWeek),
    Number(form.startPeriod),
    Number(form.endPeriod),
    timeSlots,
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

  function openCreate(prefill?: Partial<FormState>) {
    setEditingSchedule(null);
    setForm({
      ...initialForm,
      weekStart: selectedWeek,
      semesterId: semesters[0]?.id || "",
      ...(viewScope === "class" && selectedClassId ? { classId: selectedClassId } : {}),
      ...(viewScope === "teacher" && selectedTeacherId ? {
        teacherId: selectedTeacherId,
        departmentId: textValue(teachers.find((t) => t.id === selectedTeacherId)?.departmentId),
      } : {}),
      ...(viewScope === "room" && selectedRoomId ? { roomId: selectedRoomId } : {}),
      ...prefill,
    });
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
        if (teacher?.teacherType !== "thinh_giang") next.confirmationDeadline = "";
      }
      if (key === "subjectId" && !next.teacherId && !next.departmentId) {
        const subject = subjects.find((row) => row.id === value);
        if (textValue(subject?.departmentId)) next.departmentId = textValue(subject?.departmentId);
      }
      if (key === "classId") {
        const schoolClass = classes.find((row) => row.id === value);
        const level = catalogSchoolLevel(schoolClass);
        const levelSlots = timeSlotsForLevel(timeSlots, level);
        const firstPeriod = String(periodNumber(levelSlots[0]) || 1);
        next.startPeriod = firstPeriod;
        next.endPeriod = firstPeriod;
      }
      if (key === "roomId") {
        const room = rooms.find((row) => row.id === value);
        if (textValue(room?.campusId)) next.campusId = textValue(room?.campusId);
      }
      return next;
    });
  }

  function openCreateFromAvailability(row: AvailabilityRow, slot: unknown) {
    const parsed = resolveAvailabilitySlot(slot, timeSlots);
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
      weekStart: selectedWeek,
      dayOfWeek: String(parsed.dayOfWeek),
      startPeriod: firstPeriod,
      endPeriod: firstPeriod,
      confirmationDeadline: dateTimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
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
      if (!subjectMatchesClass(selectedSubject, selectedClass)) throw new Error("Môn học không phù hợp với cấp học/khối của lớp đã chọn.");
      if (!teacherMatchesClass(selectedTeacher, selectedClass)) throw new Error("Giáo viên chưa được phân công phụ trách cấp học của lớp đã chọn.");
      if (!teacherCanTeachSubjectAtClass(selectedTeacher, selectedSubject, selectedClass)) throw new Error("Giáo viên chưa được phân công dạy môn này ở khối của lớp đã chọn.");
      if (!selectedClassLevel) throw new Error("Lớp chưa được cấu hình cấp học/khối hợp lệ.");
      if (selectedFormTimeSlots.length === 0) throw new Error(selectedClassLevel === "primary"
        ? "Chưa cấu hình tiết học dành cho Tiểu học."
        : "Chưa cấu hình tiết học dành cho THCS.");
      const lastPeriod = Number(form.endPeriod);
      const startPeriod = Number(form.startPeriod);
      if (lastPeriod < startPeriod) throw new Error("Tiết cuối không được nhỏ hơn tiết bắt đầu.");
      const configuredPeriods = new Set(selectedFormTimeSlots.map(periodNumber));
      for (let period = startPeriod; period <= lastPeriod; period += 1) {
        if (!configuredPeriods.has(period)) throw new Error(`Tiết ${period} chưa được cấu hình cho ${selectedClassLevel === "primary" ? "Tiểu học" : "THCS"}.`);
      }
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
        ...(selectedTeacherIsAdjunct
          ? { confirmationDeadline: new Date(form.confirmationDeadline).toISOString() }
          : {}),
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

  // Handle Replicate / Apply Timetable to Next Weeks
  async function handleApplyToNextWeeks() {
    setApplying(true);
    setApplyError("");
    try {
      // Filter candidate schedules to copy based on applyScope
      const candidateSchedules = rows.filter((row) => {
        if (row.status === "cancelled") return false;
        if (textValue(row.weekStart) !== selectedWeek) return false;
        if (applyScope === "class" && selectedClassId && row.classId !== selectedClassId) return false;
        if (applyScope === "teacher" && selectedTeacherId && (row.actualTeacherId || row.teacherId) !== selectedTeacherId) return false;
        if (role === "totruong" && row.departmentId !== managerDepartmentId) return false;
        return true;
      });

      if (candidateSchedules.length === 0) {
        throw new Error("Không có tiết học nào trong tuần nguồn để áp dụng.");
      }

      // Generate target weeks
      const targetWeeks: string[] = [];
      for (let w = 1; w <= applyWeeksCount; w++) {
        targetWeeks.push(addDaysDateOnly(selectedWeek, w * 7));
      }

      let totalCopied = 0;
      let totalSkipped = 0;
      const totalTasks = candidateSchedules.length * targetWeeks.length;
      let currentTask = 0;

      for (const targetW of targetWeeks) {
        // Filter existing schedules in target week to skip duplicates
        const existingInTarget = rows.filter((r) => r.status !== "cancelled" && textValue(r.weekStart) === targetW);

        for (const schedule of candidateSchedules) {
          currentTask++;
          const subjName = catalogName(subjects, schedule.subjectId) || schedule.subjectId || "Môn";
          setApplyProgress({
            current: currentTask,
            total: totalTasks,
            message: `Đang sao chép (${currentTask}/${totalTasks}): ${subjName} (Thứ ${schedule.dayOfWeek})...`,
          });

          // Check if same class + day + startPeriod already exists in target week
          const isAlreadyPresent = existingInTarget.some((r) =>
            r.classId === schedule.classId &&
            Number(r.dayOfWeek) === Number(schedule.dayOfWeek) &&
            Number(r.startPeriod) === Number(schedule.startPeriod),
          );

          if (isAlreadyPresent) {
            totalSkipped++;
            continue;
          }

          const payload: ScheduleInput = {
            teacherId: textValue(schedule.actualTeacherId) || textValue(schedule.teacherId),
            subjectId: textValue(schedule.subjectId),
            classId: textValue(schedule.classId),
            roomId: textValue(schedule.roomId),
            campusId: textValue(schedule.campusId),
            departmentId: textValue(schedule.departmentId),
            semesterId: textValue(schedule.semesterId),
            schoolYearId: textValue(schedule.schoolYearId),
            weekStart: targetW,
            dayOfWeek: Number(schedule.dayOfWeek),
            startPeriod: Number(schedule.startPeriod),
            endPeriod: Number(schedule.endPeriod),
            status: "scheduled",
            cancellationReason: "",
            ...(schedule.teacherType === "thinh_giang"
              ? { confirmationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }
              : {}),
          };

          await createOrUpdateSchedule(payload);
          totalCopied++;
        }
      }

      toast.success(`Đã áp dụng thành công ${totalCopied} tiết học sang ${targetWeeks.length} tuần tiếp theo!${totalSkipped > 0 ? ` (Bỏ qua ${totalSkipped} tiết đã có sẵn)` : ""}`);
      setApplyModalOpen(false);
      // Automatically switch to the newly scheduled next week
      setSelectedWeek(targetWeeks[0]);
    } catch (err) {
      setApplyError(firebaseErrorMessage(err));
    } finally {
      setApplying(false);
      setApplyProgress(null);
    }
  }

  // Week navigation actions
  function handlePrevWeek() {
    setSelectedWeek((current) => addDaysDateOnly(current, -7));
  }
  function handleNextWeek() {
    setSelectedWeek((current) => addDaysDateOnly(current, 7));
  }
  function handleThisWeek() {
    setSelectedWeek(currentMonday());
  }

  // Find schedules for a given day and period
  function getSchedulesForSlot(day: number, period: number) {
    return currentWeekSchedules.filter((row) => {
      const d = Number(row.dayOfWeek || 0);
      const start = Number(row.startPeriod || 0);
      const end = Number(row.endPeriod || start + 1);
      return d === day && start <= period && period < end;
    });
  }

  const applyCandidateCount = useMemo(() => {
    return rows.filter((row) => {
      if (row.status === "cancelled") return false;
      if (textValue(row.weekStart) !== selectedWeek) return false;
      if (applyScope === "class" && selectedClassId && row.classId !== selectedClassId) return false;
      if (applyScope === "teacher" && selectedTeacherId && (row.actualTeacherId || row.teacherId) !== selectedTeacherId) return false;
      if (role === "totruong" && row.departmentId !== managerDepartmentId) return false;
      return true;
    }).length;
  }, [applyScope, managerDepartmentId, role, rows, selectedClassId, selectedTeacherId, selectedWeek]);

  return (
    <RoleGuard allowedRoles={["admin", "totruong", "bgh"]}>
      <Shell>
        <PageHeader
          eyebrow={role === "bgh" ? "Ban Giám Hiệu theo dõi" : role === "totruong" ? "Điều phối trong tổ" : "Điều phối giảng dạy"}
          title={role === "bgh" ? `Thời khóa biểu ${bghSchoolLevel === "primary" ? "Tiểu học" : bghSchoolLevel === "secondary" ? "THCS" : "Toàn trường"}` : role === "totruong" ? "Thời khóa biểu bộ môn" : "Quản lý Thời khóa biểu"}
          description={role === "bgh" ? "Chế độ xem và xuất thời khóa biểu dành cho Ban Giám Hiệu. Dữ liệu được giới hạn trong phạm vi cấp học phụ trách." : "Bố cục ma trận thời khóa biểu khoa học, phân tách Sáng/Chiều rõ ràng, hỗ trợ theo dõi tải tiết học, nhân bản tuần tiếp theo và xếp lịch 1-chạm."}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              {role !== "bgh" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setApplyError("");
                    setApplyModalOpen(true);
                  }}
                  className="border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 font-semibold"
                >
                  <CalendarSync className="h-4 w-4 text-indigo-600" />
                  Áp dụng cho tuần sau
                </Button>
              )}
              {role === "admin" ? (
                <Button variant="secondary" asChild>
                  <a href="/admin/ai-scheduler/"><Sparkles className="h-4 w-4 text-amber-500" />AI xếp lịch</a>
                </Button>
              ) : null}
              {(role === "admin" || role === "bgh") && (
                <Button variant="secondary" onClick={() => { setExportError(""); setExportOpen(true); }}>
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />Xuất TKB học sinh
                </Button>
              )}
              {role !== "bgh" && (
                <Button onClick={() => openCreate()}><CalendarPlus className="h-4 w-4" />Tạo lịch dạy</Button>
              )}
            </div>
          )}
        />

        {/* Modern Subject Color Palette Quick Legend */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <span className="text-muted-foreground font-semibold">Màu nhận diện môn:</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-blue-800 font-semibold border border-blue-200">
              <span className="h-2 w-2 rounded-full bg-blue-600" /> Toán
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-teal-800 font-semibold border border-teal-200">
              <span className="h-2 w-2 rounded-full bg-teal-600" /> Tiếng Việt / Văn
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-violet-800 font-semibold border border-violet-200">
              <span className="h-2 w-2 rounded-full bg-violet-600" /> Tiếng Anh
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 font-semibold border border-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-600" /> Khoa học / Tự nhiên
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-rose-800 font-semibold border border-rose-200">
              <span className="h-2 w-2 rounded-full bg-rose-600" /> Sử / Địa / Xã hội
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-800 font-semibold border border-cyan-200">
              <span className="h-2 w-2 rounded-full bg-cyan-600" /> Tin học / Công nghệ
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-50 px-2.5 py-1 text-fuchsia-800 font-semibold border border-fuchsia-200">
              <span className="h-2 w-2 rounded-full bg-fuchsia-600" /> Nghệ thuật / Âm nhạc
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-50 px-2.5 py-1 text-lime-800 font-semibold border border-lime-200">
              <span className="h-2 w-2 rounded-full bg-lime-600" /> Thể dục / GDTC
            </span>
          </div>
          {role === "admin" && adjunctAvailabilityRows.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowAvailabilitySection((prev) => !prev)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {showAvailabilitySection ? "Ẩn khung giờ rảnh" : `Xem ${adjunctAvailabilityRows.length} đăng ký giờ rảnh`}
            </button>
          ) : null}
        </div>

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {catalogError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{catalogError}</div> : null}
        {timeSlots.length === 0 ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Chưa có tiết học đang hoạt động. Hãy cấu hình mục “Tiết học” trước khi tạo lịch.</div> : null}
        {availabilityError ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{availabilityError}</div> : null}

        {/* Availability review card for Admin */}
        {role === "admin" && showAvailabilitySection && adjunctAvailabilityRows.length > 0 ? (
          <Card className="mb-5 overflow-hidden border-indigo-100 bg-indigo-50/20">
            <div className="flex flex-col gap-2 border-b border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <CalendarClock className="h-5 w-5 text-indigo-600" />
                  Đăng ký khung giờ rảnh của giáo viên thỉnh giảng
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Duyệt đăng ký trước, sau đó bấm trực tiếp vào ô khung giờ đã duyệt để mở biểu mẫu xếp lịch nhanh.
                </p>
              </div>
              <Badge tone={sortedAvailabilityRows.some((row) => reviewStatusOf(row) === "pending") ? "warning" : "success"}>
                {sortedAvailabilityRows.filter((row) => reviewStatusOf(row) === "pending").length} chờ duyệt
              </Badge>
            </div>
            {availabilityLoading ? (
              <div className="p-4"><Skeleton className="h-28 w-full" /></div>
            ) : sortedAvailabilityRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Chưa có đăng ký nào được gửi.</div>
            ) : (
              <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
                {sortedAvailabilityRows.map((availability) => {
                  const teacher = teachers.find((row) => row.id === availability.teacherId);
                  const semester = semesters.find((row) => row.id === availability.semesterId);
                  const reviewStatus = reviewStatusOf(availability);
                  const slots = approvedAvailabilitySlots(availability).sort((a, b) => String(a).localeCompare(String(b), "vi", { numeric: true }));
                  return (
                    <div key={availability.id} className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{teacher ? primaryCatalogName(teacher) : availability.teacherId}</p>
                          <p className="text-xs text-muted-foreground">{semester ? primaryCatalogName(semester) : availability.semesterId}</p>
                        </div>
                        <Badge tone={reviewStatus === "approved" ? "success" : reviewStatus === "rejected" ? "danger" : "warning"}>
                          {reviewStatus === "approved" ? "Đã duyệt" : reviewStatus === "rejected" ? "Đã từ chối" : "Chờ duyệt"}
                        </Badge>
                      </div>
                      {availability.reviewNote ? <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">Lý do: {availability.reviewNote}</p> : null}
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {slots.map((slot) => reviewStatus === "approved" ? (
                          <button
                            key={String(slot)}
                            type="button"
                            onClick={() => openCreateFromAvailability(availability, slot)}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                            title="Bấm để xếp lịch vào khung giờ này"
                          >
                            <Plus className="h-3 w-3" />
                            {availabilitySlotLabel(slot, timeSlots)}
                          </button>
                        ) : (
                          <span key={String(slot)} className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{availabilitySlotLabel(slot, timeSlots)}</span>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                        {reviewStatus !== "rejected" ? (
                          <Button size="sm" variant="danger" loading={reviewingAvailabilityId === availability.id} onClick={() => void reviewAvailability(availability, "rejected")}>
                            <XCircle className="h-3.5 w-3.5" />Từ chối
                          </Button>
                        ) : null}
                        {reviewStatus !== "approved" ? (
                          <Button size="sm" loading={reviewingAvailabilityId === availability.id} onClick={() => void reviewAvailability(availability, "approved")}>
                            <CheckCircle2 className="h-3.5 w-3.5" />Duyệt
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}

        {/* Smart Control & Filter Bar */}
        <Card className="mb-4 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            {/* Top row: Week Navigator & Layout Mode */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
              {/* Week Navigation */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-xl border border-border bg-card p-1 shadow-xs">
                  <Button variant="ghost" size="sm" onClick={handlePrevWeek} title="Tuần trước" className="h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleThisWeek} className="h-8 px-2.5 text-xs font-medium">
                    Tuần này
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleNextWeek} title="Tuần sau" className="h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(normalizeWeekStartDateOnly(e.target.value))}
                    className="h-9 w-38 text-xs font-medium"
                  />
                  <span className="hidden text-xs text-muted-foreground lg:inline font-medium">
                    ({formatWeekRange(selectedWeek)})
                  </span>
                </div>
              </div>

              {/* Layout Mode Switcher */}
              <div className="flex items-center rounded-xl border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setLayoutMode("matrix")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    layoutMode === "matrix" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Ma trận Tiết
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("teacher_grid")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    layoutMode === "teacher_grid" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  Bảng Giáo viên
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("calendar")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    layoutMode === "calendar" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Lịch Tuần
                </button>
              </div>
            </div>

            {/* Middle row: View Scope Selection */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {/* Scope buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground mr-1">Đối tượng xếp lịch:</span>
                <button
                  type="button"
                  onClick={() => setViewScope("class")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
                    viewScope === "class" ? "bg-primary text-primary-foreground shadow-xs" : "border border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  Theo Lớp học
                </button>
                <button
                  type="button"
                  onClick={() => setViewScope("teacher")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
                    viewScope === "teacher" ? "bg-primary text-primary-foreground shadow-xs" : "border border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <User className="h-3.5 w-3.5" />
                  Theo Giáo viên
                </button>
                <button
                  type="button"
                  onClick={() => setViewScope("room")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
                    viewScope === "room" ? "bg-primary text-primary-foreground shadow-xs" : "border border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Theo Phòng học
                </button>
                <button
                  type="button"
                  onClick={() => setViewScope("all")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
                    viewScope === "all" ? "bg-primary text-primary-foreground shadow-xs" : "border border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Toàn trường
                </button>
              </div>

              {/* Scope specific entity selector */}
              <div className="flex items-center gap-2 min-w-[260px]">
                {viewScope === "class" ? (
                  <div className="w-full">
                    <select
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                      <option value="">-- Chọn lớp học --</option>
                      {filteredCatalogClasses.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {catalogOptionLabel(cls)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {viewScope === "teacher" ? (
                  <div className="w-full">
                    <select
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                    >
                      <option value="">-- Chọn giáo viên --</option>
                      {filteredCatalogTeachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {catalogOptionLabel(teacher)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {viewScope === "room" ? (
                  <div className="w-full">
                    <select
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
                      value={selectedRoomId}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                    >
                      <option value="">-- Chọn phòng học --</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {catalogOptionLabel(room)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Quick Entity Fast-Switch Pills Bar (1-Click Switch for Schedulers) */}
            {viewScope === "class" && filteredCatalogClasses.length > 0 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
                <span className="text-[11px] font-bold text-muted-foreground whitespace-nowrap mr-1">Chuyển nhanh lớp:</span>
                {filteredCatalogClasses.map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => setSelectedClassId(cls.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition",
                      selectedClassId === cls.id
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {primaryCatalogName(cls)}
                  </button>
                ))}
              </div>
            ) : null}

            {viewScope === "teacher" && filteredCatalogTeachers.length > 0 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
                <span className="text-[11px] font-bold text-muted-foreground whitespace-nowrap mr-1">Chuyển nhanh GV:</span>
                {filteredCatalogTeachers.slice(0, 15).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTeacherId(t.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition",
                      selectedTeacherId === t.id
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {primaryCatalogName(t)}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Bottom row: Secondary filters (Level, Department, Search) */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
              {/* School Level Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Cấp:</span>
                <select
                  className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
                  value={selectedSchoolLevel}
                  onChange={(e) => setSelectedSchoolLevel(e.target.value)}
                >
                  <option value="">Tất cả cấp</option>
                  <option value="primary">Tiểu học</option>
                  <option value="secondary">THCS</option>
                </select>
              </div>

              {/* Department Filter (Admin only, Totruong is locked) */}
              {role === "admin" ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Tổ/Bộ môn:</span>
                  <select
                    className="h-9 max-w-[180px] rounded-lg border border-border bg-background px-2.5 text-xs text-foreground truncate"
                    value={selectedDepartmentId}
                    onChange={(e) => setSelectedDepartmentId(e.target.value)}
                  >
                    <option value="">Tất cả tổ bộ môn</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {primaryCatalogName(dept)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Search query */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Tìm theo môn, lớp, giáo viên, phòng..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
              </div>

              {/* Reset filter button */}
              {(selectedSchoolLevel || (role === "admin" && selectedDepartmentId) || searchQuery) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSchoolLevel("");
                    if (role === "admin") setSelectedDepartmentId("");
                    setSearchQuery("");
                  }}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Xóa lọc
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Scientific Scheduler HUD: Metric Bar for the Active Entity */}
        {layoutMode === "matrix" && (viewScope === "class" || viewScope === "teacher") ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                {viewScope === "class" ? <GraduationCap className="h-5 w-5" /> : <User className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {viewScope === "class"
                    ? `Thời khóa biểu Lớp: ${catalogName(classes, selectedClassId) || "Đang chọn..."}`
                    : `Lịch dạy Giáo viên: ${catalogName(teachers, selectedTeacherId) || "Đang chọn..."}`}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {viewScope === "class"
                    ? `Cấp: ${selectedClassLevel === "primary" ? "Tiểu học" : "THCS"}`
                    : `Bộ môn: ${catalogName(departments, teachers.find((t) => t.id === selectedTeacherId)?.departmentId) || "—"}`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="rounded-xl border border-border bg-card px-3 py-1.5 shadow-2xs">
                <span className="text-muted-foreground">Tổng tiết tuần: </span>
                <span className="font-extrabold text-foreground text-sm">{currentEntityStats.totalPeriods} tiết</span>
              </div>
              <div className="rounded-xl border border-border bg-card px-3 py-1.5 shadow-2xs">
                <span className="text-blue-700 font-medium">Sáng: <strong>{currentEntityStats.morningPeriods}</strong></span>
                <span className="text-muted-foreground mx-1.5">|</span>
                <span className="text-amber-700 font-medium">Chiều: <strong>{currentEntityStats.afternoonPeriods}</strong></span>
              </div>
              {currentEntityStats.hasConflict ? (
                <div className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
                  <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" />
                  Cảnh báo trùng tiết!
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Lịch hợp lệ
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* MAIN TIMETABLE DISPLAY */}
        {loading ? (
          <Card className="p-6">
            <Skeleton className="h-[600px] w-full" />
          </Card>
        ) : (
          <>
            {/* 1. SCIENTIFIC TIMETABLE MATRIX VIEW (Ma trận Tiết x Thứ 2-6) */}
            {layoutMode === "matrix" ? (
              <Card className="overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground font-semibold">
                        <th className="w-32 p-3 text-center border-r border-border">Buổi / Tiết học</th>
                        {WEEKDAYS.map((day) => {
                          const { dayName, dateStr } = formatDayHeader(selectedWeek, day);
                          const dayPeriodsCount = currentWeekSchedules.filter((r) => Number(r.dayOfWeek) === day).reduce((acc, curr) => {
                            const start = Number(curr.startPeriod || 0);
                            const end = Number(curr.endPeriod || start + 1);
                            return acc + Math.max(1, end - start);
                          }, 0);

                          return (
                            <th key={day} className="min-w-[190px] p-3 text-center border-r border-border last:border-r-0">
                              <div className="text-sm font-extrabold text-foreground">{dayName}</div>
                              <div className="text-[11px] text-muted-foreground font-medium">{dateStr}</div>
                              {dayPeriodsCount > 0 ? (
                                <div className="mt-1">
                                  <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                    {dayPeriodsCount} tiết
                                  </span>
                                </div>
                              ) : null}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                      {/* BUỔI SÁNG HEADER */}
                      <tr className="bg-gradient-to-r from-blue-50/80 via-blue-50/40 to-transparent font-bold text-xs text-blue-900 border-t-2 border-t-blue-200">
                        <td colSpan={6} className="px-4 py-2.5 uppercase tracking-wider">
                          <span className="inline-flex items-center gap-1.5">
                            ☀️ BUỔI SÁNG (Tiết 1 — 5)
                          </span>
                        </td>
                      </tr>
                      {morningPeriods.map((slot) => {
                        const p = periodNumber(slot);
                        return (
                          <tr key={`morning-${p}`} className="divide-x divide-border hover:bg-muted/10 transition">
                            <td className="p-2.5 text-center bg-muted/20 align-middle">
                              <div className="font-extrabold text-foreground text-xs">{primaryCatalogName(slot)}</div>
                              <div className="text-[11px] text-muted-foreground font-mono mt-0.5 font-medium">
                                {slot.startTime || "?"} – {slot.endTime || "?"}
                              </div>
                            </td>
                            {WEEKDAYS.map((day) => {
                              const matches = getSchedulesForSlot(day, p);
                              const isTeacherAvailable = selectedTeacherAvailabilitySlots.has(`${day}-${p}`);

                              return (
                                <td key={`slot-${day}-${p}`} className="p-2 align-top h-28">
                                  {matches.length > 0 ? (
                                    <div className="flex flex-col gap-1.5 h-full">
                                      {matches.map((schedule) => {
                                        const subjectName = catalogName(subjects, schedule.subjectId) || schedule.subjectName || schedule.subjectId || "Môn học";
                                        const teacherName = catalogName(teachers, schedule.actualTeacherId || schedule.teacherId) || schedule.actualTeacherId || schedule.teacherId || "Giáo viên";
                                        const className = catalogName(classes, schedule.classId) || schedule.className || schedule.classId || "Lớp";
                                        const roomName = catalogName(rooms, schedule.roomId) || schedule.roomCode || schedule.roomId || "Phòng";
                                        const isSubstitute = textValue(schedule.originalTeacherId) && schedule.originalTeacherId !== (schedule.actualTeacherId || schedule.teacherId);
                                        const isAdjunct = schedule.teacherType === "thinh_giang";
                                        const theme = getSubjectTheme(subjectName, schedule.subjectId);
                                        const startPeriodNum = Number(schedule.startPeriod || 1);
                                        const isContinuation = p > startPeriodNum;

                                        return (
                                          <div
                                            key={schedule.id}
                                            onClick={() => setDetail(schedule)}
                                            className={cn(
                                              "group relative cursor-pointer rounded-xl border p-2.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                                              theme.bg,
                                              theme.border,
                                              theme.accent,
                                              isContinuation && "border-t-dashed opacity-95",
                                            )}
                                          >
                                            <div className="flex items-start justify-between gap-1">
                                              <span className={cn("font-extrabold text-xs tracking-tight", theme.text)}>
                                                {isContinuation ? `↳ ${subjectName}` : subjectName}
                                              </span>
                                              <span className={cn("text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shadow-2xs", theme.badgeBg)}>
                                                {periodDisplay(schedule)}
                                              </span>
                                            </div>

                                            <div className="mt-1.5 flex flex-col gap-0.5 text-[11px] opacity-95">
                                              {viewScope !== "class" ? (
                                                <div className="flex items-center gap-1 font-bold text-slate-800">
                                                  <GraduationCap className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                                  <span>{className}</span>
                                                </div>
                                              ) : null}
                                              {viewScope !== "teacher" ? (
                                                <div className="flex items-center gap-1 font-semibold text-slate-700 truncate">
                                                  <User className="h-3 w-3 text-slate-400 shrink-0" />
                                                  <span className="truncate">{teacherName}</span>
                                                </div>
                                              ) : null}
                                              {viewScope !== "room" && roomName ? (
                                                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                                  <MapPin className="h-3 w-3 shrink-0" />
                                                  <span>{roomName}</span>
                                                </div>
                                              ) : null}
                                            </div>

                                            {/* Tag indicator for special schedules */}
                                            <div className="mt-1.5 flex flex-wrap gap-1">
                                              {isSubstitute ? (
                                                <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 border border-amber-300">
                                                  Dạy thay
                                                </span>
                                              ) : isAdjunct ? (
                                                <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.2 text-[9px] font-bold text-violet-800 border border-violet-300">
                                                  Thỉnh giảng
                                                </span>
                                              ) : null}
                                              {schedule.status === "needs_attention" ? (
                                                <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-800 border border-rose-300">
                                                  <AlertCircle className="h-2.5 w-2.5" /> Chú ý
                                                </span>
                                              ) : null}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openCreate({
                                        dayOfWeek: String(day),
                                        startPeriod: String(p),
                                        endPeriod: String(p),
                                      })}
                                      className={cn(
                                        "group flex h-full min-h-[5.5rem] w-full flex-col items-center justify-center rounded-xl border border-dashed transition",
                                        isTeacherAvailable
                                          ? "border-emerald-300 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-100/60"
                                          : "border-border/60 bg-transparent text-muted-foreground/35 hover:border-primary/60 hover:bg-primary/5 hover:text-primary",
                                      )}
                                      title={isTeacherAvailable ? "Khung giờ rảnh đã duyệt của GV này. Bấm để xếp lịch." : "Bấm để xếp lịch vào tiết này"}
                                    >
                                      {isTeacherAvailable ? (
                                        <div className="flex flex-col items-center text-center px-1">
                                          <Zap className="h-3.5 w-3.5 text-emerald-600 mb-0.5" />
                                          <span className="text-[10px] font-bold text-emerald-700">Giờ rảnh đã duyệt</span>
                                          <span className="text-[9px] text-emerald-600 opacity-0 group-hover:opacity-100 transition">+ Xếp lịch</span>
                                        </div>
                                      ) : (
                                        <>
                                          <Plus className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                                          <span className="text-[11px] font-medium opacity-0 transition group-hover:opacity-100">+ Xếp lịch</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* BUỔI CHIỀU HEADER */}
                      <tr className="bg-gradient-to-r from-amber-50/80 via-amber-50/40 to-transparent font-bold text-xs text-amber-900 border-t-2 border-t-amber-200">
                        <td colSpan={6} className="px-4 py-2.5 uppercase tracking-wider">
                          <span className="inline-flex items-center gap-1.5">
                            🌤️ BUỔI CHIỀU (Tiết 6 — 10)
                          </span>
                        </td>
                      </tr>
                      {afternoonPeriods.map((slot) => {
                        const p = periodNumber(slot);
                        return (
                          <tr key={`afternoon-${p}`} className="divide-x divide-border hover:bg-muted/10 transition">
                            <td className="p-2.5 text-center bg-muted/20 align-middle">
                              <div className="font-extrabold text-foreground text-xs">{primaryCatalogName(slot)}</div>
                              <div className="text-[11px] text-muted-foreground font-mono mt-0.5 font-medium">
                                {slot.startTime || "?"} – {slot.endTime || "?"}
                              </div>
                            </td>
                            {WEEKDAYS.map((day) => {
                              const matches = getSchedulesForSlot(day, p);
                              const isTeacherAvailable = selectedTeacherAvailabilitySlots.has(`${day}-${p}`);

                              return (
                                <td key={`slot-${day}-${p}`} className="p-2 align-top h-28">
                                  {matches.length > 0 ? (
                                    <div className="flex flex-col gap-1.5 h-full">
                                      {matches.map((schedule) => {
                                        const subjectName = catalogName(subjects, schedule.subjectId) || schedule.subjectName || schedule.subjectId || "Môn học";
                                        const teacherName = catalogName(teachers, schedule.actualTeacherId || schedule.teacherId) || schedule.actualTeacherId || schedule.teacherId || "Giáo viên";
                                        const className = catalogName(classes, schedule.classId) || schedule.className || schedule.classId || "Lớp";
                                        const roomName = catalogName(rooms, schedule.roomId) || schedule.roomCode || schedule.roomId || "Phòng";
                                        const isSubstitute = textValue(schedule.originalTeacherId) && schedule.originalTeacherId !== (schedule.actualTeacherId || schedule.teacherId);
                                        const isAdjunct = schedule.teacherType === "thinh_giang";
                                        const theme = getSubjectTheme(subjectName, schedule.subjectId);
                                        const startPeriodNum = Number(schedule.startPeriod || 1);
                                        const isContinuation = p > startPeriodNum;

                                        return (
                                          <div
                                            key={schedule.id}
                                            onClick={() => setDetail(schedule)}
                                            className={cn(
                                              "group relative cursor-pointer rounded-xl border p-2.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                                              theme.bg,
                                              theme.border,
                                              theme.accent,
                                              isContinuation && "border-t-dashed opacity-95",
                                            )}
                                          >
                                            <div className="flex items-start justify-between gap-1">
                                              <span className={cn("font-extrabold text-xs tracking-tight", theme.text)}>
                                                {isContinuation ? `↳ ${subjectName}` : subjectName}
                                              </span>
                                              <span className={cn("text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shadow-2xs", theme.badgeBg)}>
                                                {periodDisplay(schedule)}
                                              </span>
                                            </div>

                                            <div className="mt-1.5 flex flex-col gap-0.5 text-[11px] opacity-95">
                                              {viewScope !== "class" ? (
                                                <div className="flex items-center gap-1 font-bold text-slate-800">
                                                  <GraduationCap className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                                  <span>{className}</span>
                                                </div>
                                              ) : null}
                                              {viewScope !== "teacher" ? (
                                                <div className="flex items-center gap-1 font-semibold text-slate-700 truncate">
                                                  <User className="h-3 w-3 text-slate-400 shrink-0" />
                                                  <span className="truncate">{teacherName}</span>
                                                </div>
                                              ) : null}
                                              {viewScope !== "room" && roomName ? (
                                                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                                  <MapPin className="h-3 w-3 shrink-0" />
                                                  <span>{roomName}</span>
                                                </div>
                                              ) : null}
                                            </div>

                                            {/* Tag indicator for special schedules */}
                                            <div className="mt-1.5 flex flex-wrap gap-1">
                                              {isSubstitute ? (
                                                <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 border border-amber-300">
                                                  Dạy thay
                                                </span>
                                              ) : isAdjunct ? (
                                                <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.2 text-[9px] font-bold text-violet-800 border border-violet-300">
                                                  Thỉnh giảng
                                                </span>
                                              ) : null}
                                              {schedule.status === "needs_attention" ? (
                                                <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-800 border border-rose-300">
                                                  <AlertCircle className="h-2.5 w-2.5" /> Chú ý
                                                </span>
                                              ) : null}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openCreate({
                                        dayOfWeek: String(day),
                                        startPeriod: String(p),
                                        endPeriod: String(p),
                                      })}
                                      className={cn(
                                        "group flex h-full min-h-[5.5rem] w-full flex-col items-center justify-center rounded-xl border border-dashed transition",
                                        isTeacherAvailable
                                          ? "border-emerald-300 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-100/60"
                                          : "border-border/60 bg-transparent text-muted-foreground/35 hover:border-primary/60 hover:bg-primary/5 hover:text-primary",
                                      )}
                                      title={isTeacherAvailable ? "Khung giờ rảnh đã duyệt của GV này. Bấm để xếp lịch." : "Bấm để xếp lịch vào tiết này"}
                                    >
                                      {isTeacherAvailable ? (
                                        <div className="flex flex-col items-center text-center px-1">
                                          <Zap className="h-3.5 w-3.5 text-emerald-600 mb-0.5" />
                                          <span className="text-[10px] font-bold text-emerald-700">Giờ rảnh đã duyệt</span>
                                          <span className="text-[9px] text-emerald-600 opacity-0 group-hover:opacity-100 transition">+ Xếp lịch</span>
                                        </div>
                                      ) : (
                                        <>
                                          <Plus className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                                          <span className="text-[11px] font-medium opacity-0 transition group-hover:opacity-100">+ Xếp lịch</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            {/* 2. TEACHER OVERVIEW GRID VIEW (Bảng tổng hợp tất cả Giáo viên) */}
            {layoutMode === "teacher_grid" ? (
              <Card className="overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground font-semibold">
                        <th className="w-56 p-3 border-r border-border">Giáo viên / Bộ môn</th>
                        {WEEKDAYS.map((day) => {
                          const { dayName, dateStr } = formatDayHeader(selectedWeek, day);
                          return (
                            <th key={day} className="min-w-[170px] p-3 text-center border-r border-border last:border-r-0">
                              <div className="text-sm font-bold text-foreground">{dayName}</div>
                              <div className="text-xs text-muted-foreground font-normal">{dateStr}</div>
                            </th>
                          );
                        })}
                        <th className="w-28 p-3 text-center">Tổng tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-xs">
                      {filteredCatalogTeachers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-muted-foreground">
                            Không tìm thấy giáo viên nào phù hợp điều kiện lọc.
                          </td>
                        </tr>
                      ) : (
                        filteredCatalogTeachers.map((teacher) => {
                          const teacherSchedules = currentWeekSchedules.filter((r) => (r.actualTeacherId || r.teacherId) === teacher.id);
                          const totalPeriods = teacherSchedules.reduce((acc, curr) => {
                            const start = Number(curr.startPeriod || 0);
                            const end = Number(curr.endPeriod || start + 1);
                            return acc + Math.max(1, end - start);
                          }, 0);

                          return (
                            <tr key={teacher.id} className="hover:bg-muted/10 transition">
                              <td className="p-3 border-r border-border align-top">
                                <div className="font-bold text-foreground text-sm">{primaryCatalogName(teacher)}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {catalogName(departments, teacher.departmentId) || teacher.departmentId || "Chưa có bộ môn"}
                                </div>
                                <div className="mt-1">
                                  <Badge tone={teacher.teacherType === "thinh_giang" ? "info" : "neutral"}>
                                    {teacher.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}
                                  </Badge>
                                </div>
                              </td>

                              {WEEKDAYS.map((day) => {
                                const daySchedules = teacherSchedules
                                  .filter((r) => Number(r.dayOfWeek) === day)
                                  .sort((a, b) => Number(a.startPeriod) - Number(b.startPeriod));

                                return (
                                  <td key={day} className="p-2 border-r border-border last:border-r-0 align-top">
                                    {daySchedules.length > 0 ? (
                                      <div className="flex flex-col gap-1.5">
                                        {daySchedules.map((schedule) => {
                                          const subjectName = catalogName(subjects, schedule.subjectId) || schedule.subjectId;
                                          const className = catalogName(classes, schedule.classId) || schedule.classId;
                                          const roomName = catalogName(rooms, schedule.roomId) || schedule.roomId;
                                          const theme = getSubjectTheme(subjectName, schedule.subjectId);

                                          return (
                                            <div
                                              key={schedule.id}
                                              onClick={() => setDetail(schedule)}
                                              className={cn(
                                                "cursor-pointer rounded-lg border p-2 shadow-2xs transition hover:shadow-xs",
                                                theme.bg,
                                                theme.border,
                                                theme.accent,
                                              )}
                                            >
                                              <div className="flex items-center justify-between gap-1">
                                                <span className="font-bold text-xs">{periodDisplay(schedule)}</span>
                                                <span className={cn("font-bold text-xs", theme.text)}>{subjectName}</span>
                                              </div>
                                              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                                                <span className="font-semibold">Lớp {className}</span>
                                                {roomName ? <span>{roomName}</span> : null}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => openCreate({
                                          teacherId: teacher.id,
                                          departmentId: textValue(teacher.departmentId),
                                          dayOfWeek: String(day),
                                        })}
                                        className="h-full min-h-[4rem] w-full rounded-md border border-dashed border-border/40 text-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 hover:text-primary flex items-center justify-center transition"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="p-3 text-center align-middle font-bold text-sm">
                                <span className={cn(
                                  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold",
                                  totalPeriods > 0 ? "bg-primary/10 text-primary" : "text-muted-foreground",
                                )}>
                                  {totalPeriods} tiết
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            {/* 3. CALENDAR VIEW (FullCalendar timeline) */}
            {layoutMode === "calendar" ? (
              <Card className="overflow-hidden p-3 sm:p-5 shadow-sm">
                {currentWeekSchedules.length === 0 ? (
                  <EmptyState
                    icon={<CalendarPlus className="h-6 w-6" />}
                    title="Chưa có lịch dạy trong tuần"
                    description="Bấm tạo lịch hoặc chọn tuần khác để xem thời khóa biểu."
                    action={<Button onClick={() => openCreate()}>Tạo lịch</Button>}
                  />
                ) : (
                  <div className="min-w-0 overflow-x-auto">
                    <div className="min-w-[780px]">
                      <FullCalendar
                        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
                        initialView="timeGridWeek"
                        firstDay={1}
                        hiddenDays={[0, 6]} // Ẩn CN (0) và Thứ 7 (6)
                        allDaySlot={false}
                        slotMinTime={calendarStart.length === 5 ? `${calendarStart}:00` : calendarStart}
                        slotMaxTime={calendarEnd.length === 5 ? `${calendarEnd}:00` : calendarEnd}
                        slotDuration="00:15:00"
                        height="auto"
                        headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,dayGridMonth" }}
                        buttonText={{ today: "Hôm nay", week: "Tuần", month: "Tháng" }}
                        events={calendarEvents}
                        eventClick={(argument) => setDetail(argument.event.extendedProps.row as ScheduleRow)}
                        nowIndicator
                      />
                    </div>
                  </div>
                )}
              </Card>
            ) : null}
          </>
        )}

        {/* Modal: Áp dụng Thời khóa biểu cho các tuần tiếp theo */}
        <Modal
          open={applyModalOpen}
          onOpenChange={(next) => {
            if (!applying) {
              setApplyModalOpen(next);
              if (!next) setApplyError("");
            }
          }}
          title="Áp dụng thời khóa biểu cho tuần tiếp theo"
          description="Sao chép toàn bộ hoặc một phần thời khóa biểu của tuần hiện tại sang các tuần tiếp theo nếu kế hoạch giảng dạy không thay đổi."
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={applying} onClick={() => setApplyModalOpen(false)}>Hủy</Button>
              <Button loading={applying} onClick={handleApplyToNextWeeks} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <CopyCheck className="h-4 w-4" />
                {applying ? "Đang áp dụng..." : "Xác nhận áp dụng"}
              </Button>
            </div>
          )}
        >
          <div className="space-y-4">
            {/* Source Week Box */}
            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tuần nguồn sao chép</span>
                  <p className="text-sm font-bold text-foreground mt-0.5">{formatWeekRange(selectedWeek)}</p>
                </div>
                <Badge tone="info">{applyCandidateCount} tiết học sẵn sàng</Badge>
              </div>
            </div>

            {/* Scope selection */}
            <div>
              <Label>Phạm vi áp dụng</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setApplyScope("all")}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-xl border text-left transition",
                    applyScope === "all" ? "border-primary bg-primary/5 text-primary font-bold shadow-xs" : "border-border hover:bg-muted text-foreground",
                  )}
                >
                  <span className="text-xs font-bold">Toàn bộ trường</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">Tất cả các lớp và giáo viên</span>
                </button>

                <button
                  type="button"
                  onClick={() => setApplyScope("class")}
                  disabled={!selectedClassId}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-xl border text-left transition disabled:opacity-50",
                    applyScope === "class" ? "border-primary bg-primary/5 text-primary font-bold shadow-xs" : "border-border hover:bg-muted text-foreground",
                  )}
                >
                  <span className="text-xs font-bold">Lớp đang chọn</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5 truncate w-full">
                    {selectedClassId ? (catalogName(classes, selectedClassId) || "Lớp đã chọn") : "Chưa chọn lớp"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setApplyScope("teacher")}
                  disabled={!selectedTeacherId}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-xl border text-left transition disabled:opacity-50",
                    applyScope === "teacher" ? "border-primary bg-primary/5 text-primary font-bold shadow-xs" : "border-border hover:bg-muted text-foreground",
                  )}
                >
                  <span className="text-xs font-bold">Giáo viên đang chọn</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5 truncate w-full">
                    {selectedTeacherId ? (catalogName(teachers, selectedTeacherId) || "GV đã chọn") : "Chưa chọn GV"}
                  </span>
                </button>
              </div>
            </div>

            {/* Target Weeks count */}
            <div>
              <Label>Số tuần tiếp theo cần áp dụng</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { count: 1, label: "1 tuần tiếp theo", desc: "Tuần kế tiếp" },
                  { count: 2, label: "2 tuần tiếp theo", desc: "2 tuần tới" },
                  { count: 4, label: "4 tuần tiếp theo", desc: "1 tháng tới" },
                ].map((item) => (
                  <button
                    key={item.count}
                    type="button"
                    onClick={() => setApplyWeeksCount(item.count)}
                    className={cn(
                      "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition",
                      applyWeeksCount === item.count ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-bold ring-1 ring-indigo-600" : "border-border hover:bg-muted text-foreground",
                    )}
                  >
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Target weeks preview */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-indigo-950 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                <ArrowRight className="h-4 w-4" />
                Các tuần đích sẽ được tạo lịch:
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px] text-indigo-800">
                {Array.from({ length: applyWeeksCount }).map((_, idx) => {
                  const targetMonday = addDaysDateOnly(selectedWeek, (idx + 1) * 7);
                  return (
                    <li key={targetMonday} className="font-medium">
                      Tuần {idx + 1}: <strong>{formatWeekRange(targetMonday)}</strong>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-indigo-700 mt-1">
                * Hệ thống sẽ tự động bỏ qua các tiết học đã tồn tại ở tuần đích để tránh trùng lặp.
              </p>
            </div>

            {/* Live Progress Bar during execution */}
            {applying && applyProgress ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    {applyProgress.message}
                  </span>
                  <span>{Math.round((applyProgress.current / applyProgress.total) * 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
                  <div
                    className="h-full bg-blue-600 transition-all duration-150"
                    style={{ width: `${(applyProgress.current / applyProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}

            {applyError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {applyError}
              </div>
            ) : null}
          </div>
        </Modal>

        {/* Export Timetable Modal */}
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
              <p className="mt-1 text-xs">Tệp có đuôi .xml và mở trực tiếp bằng Microsoft Excel; mỗi lớp là một sheet riêng (Thứ 2 đến Thứ 6).</p>
            </div>
            {exportError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{exportError}</div> : null}
          </div>
        </Modal>

        {/* Create / Edit Schedule Modal */}
        <Modal
          open={open}
          onOpenChange={(next) => { setOpen(next); if (!next) setEditingSchedule(null); }}
          title={editingSchedule ? "Sửa lịch dạy" : "Tạo lịch dạy"}
          description="Chọn dữ liệu nền. Tiết cuối được tính là tiết có học, hệ thống sẽ tự chuyển sang định dạng lưu trữ nội bộ."
          wide
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Đóng</Button>
              <Button form="schedule-form" loading={submitting} type="submit" disabled={(Boolean(form.classId) && selectedFormTimeSlots.length === 0) || Boolean(selectedAvailabilityIssue)}>
                {editingSchedule ? "Lưu thay đổi" : "Kiểm tra và lưu"}
              </Button>
            </div>
          )}
        >
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
            </div>
            <div>
              <Label>Tuần bắt đầu</Label>
              <Input required type="date" value={form.weekStart} onChange={(event) => setField("weekStart", event.target.value)} />
            </div>
            <div>
              <Label>Thứ</Label>
              <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={form.dayOfWeek} onChange={(event) => setField("dayOfWeek", event.target.value)}>
                {WEEKDAYS.map((day) => <option key={day} value={day}>Thứ {day}</option>)}
              </select>
            </div>
            <div>
              <Label>Tiết bắt đầu</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                required
                value={form.startPeriod}
                onChange={(event) => {
                  const nextStart = Number(event.target.value);
                  setForm((current) => ({ ...current, startPeriod: event.target.value, endPeriod: String(Math.max(nextStart, Number(current.endPeriod))) }));
                }}
              >
                {selectedFormTimeSlots.length === 0 ? <option value="">Chọn lớp để tải đúng bộ tiết</option> : null}
                {selectedFormTimeSlots.map((slot) => <option key={slot.id} value={periodNumber(slot)}>{primaryCatalogName(slot)} · {slot.startTime || "?"}–{slot.endTime || "?"}</option>)}
              </select>
            </div>
            <div>
              <Label>Tiết cuối cùng</Label>
              <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" required value={form.endPeriod} onChange={(event) => setField("endPeriod", event.target.value)}>
                {selectedFormTimeSlots.filter((slot) => periodNumber(slot) >= Number(form.startPeriod)).map((slot) => <option key={slot.id} value={periodNumber(slot)}>{primaryCatalogName(slot)} · kết thúc {slot.endTime || "?"}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">{selectedClassLevel ? `Đang dùng bộ tiết ${selectedClassLevel === "primary" ? "Tiểu học" : "THCS"}. ` : "Chọn lớp để xác định bộ tiết. "}Ví dụ học tiết 1 và 2: chọn bắt đầu 1, tiết cuối 2.</p>
            </div>
            {selectedTeacherIsAdjunct ? (
              <div className="sm:col-span-2">
                <Label>Hạn xác nhận <span className="text-rose-600">*</span></Label>
                <Input required type="datetime-local" value={form.confirmationDeadline} onChange={(event) => setField("confirmationDeadline", event.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Chỉ áp dụng cho giáo viên thỉnh giảng.</p>
              </div>
            ) : null}
            {selectedTeacherIsAdjunct ? (
              <div className={`sm:col-span-2 rounded-xl border px-4 py-3 text-sm ${selectedAvailabilityIssue ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {selectedAvailabilityIssue || `Khung giờ hợp lệ. Giáo viên đã được duyệt cho Thứ ${form.dayOfWeek}, tiết ${form.startPeriod}${form.endPeriod !== form.startPeriod ? `–${form.endPeriod}` : ""}.`}
                {selectedAvailability && Array.isArray(selectedAvailability.slots) ? <p className="mt-1 text-xs">Các ô đã duyệt: {selectedAvailability.slots.map((slot: unknown) => availabilitySlotLabel(slot, timeSlots)).join(", ")}</p> : null}
              </div>
            ) : null}
            {formError ? <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div> : null}
          </form>
        </Modal>

        {/* Schedule Detail Modal */}
        <Modal
          open={Boolean(detail)}
          onOpenChange={(next) => !next && setDetail(null)}
          title="Chi tiết lịch dạy"
          description="Lịch sử hủy được giữ lại để đối chiếu; thao tác hủy sẽ giải phóng toàn bộ khóa tài nguyên."
          footer={detail && role !== "bgh" ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" loading={cancelling} onClick={() => void cancelSelectedSchedule(detail)}>
                <Trash2 className="h-4 w-4" />Hủy lịch
              </Button>
              <Button onClick={() => openEdit(detail)}>
                <PencilLine className="h-4 w-4" />Sửa lịch
              </Button>
            </div>
          ) : undefined}
        >
          {detail ? (
            <div className="space-y-3 text-sm">
              {[
                ["Giáo viên thực dạy", catalogName(teachers, detail.actualTeacherId || detail.teacherId) || detail.actualTeacherId || detail.teacherId],
                ["Giáo viên gốc", textValue(detail.originalTeacherId) && detail.originalTeacherId !== (detail.actualTeacherId || detail.teacherId) ? catalogName(teachers, detail.originalTeacherId) || detail.originalTeacherId : "—"],
                ["Môn học", catalogName(subjects, detail.subjectId) || detail.subjectId],
                ["Lớp", catalogName(classes, detail.classId) || detail.classId],
                ["Phòng", catalogName(rooms, detail.roomId) || detail.roomId],
                ["Cơ sở", catalogName(campuses, detail.campusId) || detail.campusId],
                ["Thời lượng", periodDisplay(detail)],
                ["Trạng thái", detail.status],
                ["Xác nhận", detail.confirmationStatus],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-border pb-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-right font-semibold">{value || "—"}</span>
                </div>
              ))}
              <div className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-blue-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Mọi thay đổi đi qua Cloud Function để kiểm tra xung đột và ghi nhật ký.</p>
              </div>
            </div>
          ) : null}
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
