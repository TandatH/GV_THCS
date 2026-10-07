"use client";

import { addDays, format, parseISO } from "date-fns";
import {
  Activity,
  AlertCircle,
  Atom,
  BookOpen,
  Building2,
  Calculator,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Compass,
  GraduationCap,
  Info,
  Languages,
  Layers,
  MapPin,
  Monitor,
  Palette,
  Printer,
  RefreshCcw,
  Search,
  Sparkles,
  User,
  Users,
  XCircle,
} from "lucide-react";
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firebaseErrorMessage, respondToScheduleAssignment } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { addDaysDateOnly, currentWeekStartDateOnly, normalizeWeekStartDateOnly, todayDateOnly } from "@/lib/date-only";
import { cn } from "@/lib/utils";

type Row = DocumentData & { id: string };

const WEEKDAYS = [2, 3, 4, 5, 6] as const;
const DAY_NAMES: Record<number, string> = {
  2: "Thứ Hai",
  3: "Thứ Ba",
  4: "Thứ Tư",
  5: "Thứ Năm",
  6: "Thứ Sáu",
  7: "Thứ Bảy",
};

interface PeriodSlot {
  period: number;
  name: string;
  startTime: string;
  endTime: string;
  session: "morning" | "afternoon";
}

// Khung giờ tiết học chuẩn THCS Việt Nam (Trùng khớp 100% hình mẫu yêu cầu)
const DEFAULT_PERIOD_SLOTS: PeriodSlot[] = [
  { period: 1, name: "Tiết 1", startTime: "07:00", endTime: "07:45", session: "morning" },
  { period: 2, name: "Tiết 2", startTime: "07:55", endTime: "08:40", session: "morning" },
  { period: 3, name: "Tiết 3", startTime: "08:50", endTime: "09:35", session: "morning" },
  { period: 4, name: "Tiết 4", startTime: "09:45", endTime: "10:30", session: "morning" },
  { period: 5, name: "Tiết 5", startTime: "13:00", endTime: "13:45", session: "afternoon" },
  { period: 6, name: "Tiết 6", startTime: "13:55", endTime: "14:40", session: "afternoon" },
  { period: 7, name: "Tiết 7", startTime: "14:50", endTime: "15:35", session: "afternoon" },
  { period: 8, name: "Tiết 8", startTime: "15:45", endTime: "16:30", session: "afternoon" },
  { period: 9, name: "Tiết 9", startTime: "16:35", endTime: "17:20", session: "afternoon" },
  { period: 10, name: "Tiết 10", startTime: "17:25", endTime: "18:10", session: "afternoon" },
];

type ColorTheme = {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  accent: string;
  dot: string;
  iconColor: string;
};

// Bảng màu phân biệt theo Khối học (Khối 6, 7, 8, 9 - chuẩn thiết kế khoa học chống nhìn nhầm)
const GRADE_COLOR_THEMES: Record<number, ColorTheme> = {
  6: {
    bg: "bg-emerald-50/95 hover:bg-emerald-100/90",
    border: "border-emerald-200/90 hover:border-emerald-400",
    text: "text-emerald-950",
    badgeBg: "bg-emerald-100 text-emerald-800",
    accent: "border-l-4 border-l-emerald-500",
    dot: "bg-emerald-500",
    iconColor: "text-emerald-600",
  },
  7: {
    bg: "bg-sky-50/95 hover:bg-sky-100/90",
    border: "border-sky-200/90 hover:border-sky-400",
    text: "text-sky-950",
    badgeBg: "bg-sky-100 text-sky-800",
    accent: "border-l-4 border-l-sky-500",
    dot: "bg-sky-500",
    iconColor: "text-sky-600",
  },
  8: {
    bg: "bg-purple-50/95 hover:bg-purple-100/90",
    border: "border-purple-200/90 hover:border-purple-400",
    text: "text-purple-950",
    badgeBg: "bg-purple-100 text-purple-800",
    accent: "border-l-4 border-l-purple-500",
    dot: "bg-purple-500",
    iconColor: "text-purple-600",
  },
  9: {
    bg: "bg-amber-50/95 hover:bg-amber-100/90",
    border: "border-amber-200/90 hover:border-amber-400",
    text: "text-amber-950",
    badgeBg: "bg-amber-100 text-amber-800",
    accent: "border-l-4 border-l-amber-500",
    dot: "bg-amber-500",
    iconColor: "text-amber-600",
  },
  // Hỗ trợ thêm cho cấp Tiểu học (Khối 1 - 5)
  1: {
    bg: "bg-rose-50/95 hover:bg-rose-100/90",
    border: "border-rose-200/90 hover:border-rose-400",
    text: "text-rose-950",
    badgeBg: "bg-rose-100 text-rose-800",
    accent: "border-l-4 border-l-rose-500",
    dot: "bg-rose-500",
    iconColor: "text-rose-600",
  },
  2: {
    bg: "bg-cyan-50/95 hover:bg-cyan-100/90",
    border: "border-cyan-200/90 hover:border-cyan-400",
    text: "text-cyan-950",
    badgeBg: "bg-cyan-100 text-cyan-800",
    accent: "border-l-4 border-l-cyan-500",
    dot: "bg-cyan-500",
    iconColor: "text-cyan-600",
  },
  3: {
    bg: "bg-teal-50/95 hover:bg-teal-100/90",
    border: "border-teal-200/90 hover:border-teal-400",
    text: "text-teal-950",
    badgeBg: "bg-teal-100 text-teal-800",
    accent: "border-l-4 border-l-teal-500",
    dot: "bg-teal-500",
    iconColor: "text-teal-600",
  },
  4: {
    bg: "bg-indigo-50/95 hover:bg-indigo-100/90",
    border: "border-indigo-200/90 hover:border-indigo-400",
    text: "text-indigo-950",
    badgeBg: "bg-indigo-100 text-indigo-800",
    accent: "border-l-4 border-l-indigo-500",
    dot: "bg-indigo-500",
    iconColor: "text-indigo-600",
  },
  5: {
    bg: "bg-orange-50/95 hover:bg-orange-100/90",
    border: "border-orange-200/90 hover:border-orange-400",
    text: "text-orange-950",
    badgeBg: "bg-orange-100 text-orange-800",
    accent: "border-l-4 border-l-orange-500",
    dot: "bg-orange-500",
    iconColor: "text-orange-600",
  },
};

const DEFAULT_THEME: ColorTheme = {
  bg: "bg-slate-50/95 hover:bg-slate-100/90",
  border: "border-slate-200/90 hover:border-slate-300",
  text: "text-slate-900",
  badgeBg: "bg-slate-100 text-slate-800",
  accent: "border-l-4 border-l-slate-400",
  dot: "bg-slate-500",
  iconColor: "text-slate-600",
};

// Bảng màu bổ sung theo bộ môn (khi chọn chế độ xem màu theo môn)
const SUBJECT_COLOR_PRESETS: Record<string, ColorTheme> = {
  toan: {
    bg: "bg-blue-50/95 hover:bg-blue-100/90",
    border: "border-blue-200 hover:border-blue-400",
    text: "text-blue-950",
    badgeBg: "bg-blue-100 text-blue-800",
    accent: "border-l-4 border-l-blue-600",
    dot: "bg-blue-600",
    iconColor: "text-blue-600",
  },
  van: {
    bg: "bg-emerald-50/95 hover:bg-emerald-100/90",
    border: "border-emerald-200 hover:border-emerald-400",
    text: "text-emerald-950",
    badgeBg: "bg-emerald-100 text-emerald-800",
    accent: "border-l-4 border-l-emerald-600",
    dot: "bg-emerald-600",
    iconColor: "text-emerald-600",
  },
  tiengviet: {
    bg: "bg-teal-50/95 hover:bg-teal-100/90",
    border: "border-teal-200 hover:border-teal-400",
    text: "text-teal-950",
    badgeBg: "bg-teal-100 text-teal-800",
    accent: "border-l-4 border-l-teal-600",
    dot: "bg-teal-600",
    iconColor: "text-teal-600",
  },
  tienganh: {
    bg: "bg-violet-50/95 hover:bg-violet-100/90",
    border: "border-violet-200 hover:border-violet-400",
    text: "text-violet-950",
    badgeBg: "bg-violet-100 text-violet-800",
    accent: "border-l-4 border-l-violet-600",
    dot: "bg-violet-600",
    iconColor: "text-violet-600",
  },
  khoahoc: {
    bg: "bg-amber-50/95 hover:bg-amber-100/90",
    border: "border-amber-200 hover:border-amber-400",
    text: "text-amber-950",
    badgeBg: "bg-amber-100 text-amber-800",
    accent: "border-l-4 border-l-amber-600",
    dot: "bg-amber-600",
    iconColor: "text-amber-600",
  },
  lichsu: {
    bg: "bg-rose-50/95 hover:bg-rose-100/90",
    border: "border-rose-200 hover:border-rose-400",
    text: "text-rose-950",
    badgeBg: "bg-rose-100 text-rose-800",
    accent: "border-l-4 border-l-rose-600",
    dot: "bg-rose-600",
    iconColor: "text-rose-600",
  },
  tinhoc: {
    bg: "bg-sky-50/95 hover:bg-sky-100/90",
    border: "border-sky-200 hover:border-sky-400",
    text: "text-sky-950",
    badgeBg: "bg-sky-100 text-sky-800",
    accent: "border-l-4 border-l-sky-600",
    dot: "bg-sky-600",
    iconColor: "text-sky-600",
  },
  mythuat: {
    bg: "bg-fuchsia-50/95 hover:bg-fuchsia-100/90",
    border: "border-fuchsia-200 hover:border-fuchsia-400",
    text: "text-fuchsia-950",
    badgeBg: "bg-fuchsia-100 text-fuchsia-800",
    accent: "border-l-4 border-l-fuchsia-600",
    dot: "bg-fuchsia-600",
    iconColor: "text-fuchsia-600",
  },
  theduc: {
    bg: "bg-lime-50/95 hover:bg-lime-100/90",
    border: "border-lime-200 hover:border-lime-400",
    text: "text-lime-950",
    badgeBg: "bg-lime-100 text-lime-800",
    accent: "border-l-4 border-l-lime-600",
    dot: "bg-lime-600",
    iconColor: "text-lime-600",
  },
  gdcd: {
    bg: "bg-yellow-50/95 hover:bg-yellow-100/90",
    border: "border-yellow-200 hover:border-yellow-400",
    text: "text-yellow-950",
    badgeBg: "bg-yellow-100 text-yellow-800",
    accent: "border-l-4 border-l-yellow-600",
    dot: "bg-yellow-600",
    iconColor: "text-yellow-600",
  },
};

function inferGradeFromName(name: unknown): number {
  const str = String(name ?? "").trim();
  const match = /(?:khối|khoi|lớp|lop|g|cls[_-]\d{4}[_-]g)?\s*0?([1-9])(?:[.\-_a-z]|\b)/i.exec(str);
  if (match) return Number(match[1]);
  return 0;
}

function getSubjectTheme(subjectName: string, subjectId: string): ColorTheme {
  const norm = (subjectName || subjectId || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");

  if (norm.includes("toan")) return SUBJECT_COLOR_PRESETS.toan;
  if (norm.includes("tiengviet")) return SUBJECT_COLOR_PRESETS.tiengviet;
  if (norm.includes("van") || norm.includes("nguvan")) return SUBJECT_COLOR_PRESETS.van;
  if (norm.includes("anh") || norm.includes("tienganh") || norm.includes("english")) return SUBJECT_COLOR_PRESETS.tienganh;
  if (norm.includes("khoahoc") || norm.includes("khtn") || norm.includes("ly") || norm.includes("vatly") || norm.includes("hoa") || norm.includes("hoahoc") || norm.includes("sinh") || norm.includes("sinhhoc"))
    return SUBJECT_COLOR_PRESETS.khoahoc;
  if (norm.includes("su") || norm.includes("lichsu") || norm.includes("dia") || norm.includes("dialy") || norm.includes("khxh"))
    return SUBJECT_COLOR_PRESETS.lichsu;
  if (norm.includes("tin") || norm.includes("tinhoc") || norm.includes("congnghe")) return SUBJECT_COLOR_PRESETS.tinhoc;
  if (norm.includes("nhac") || norm.includes("amnhac") || norm.includes("my") || norm.includes("mythuat") || norm.includes("nghethuat"))
    return SUBJECT_COLOR_PRESETS.mythuat;
  if (norm.includes("theduc") || norm.includes("gdtc") || norm.includes("thechat")) return SUBJECT_COLOR_PRESETS.theduc;
  if (norm.includes("gdcd") || norm.includes("daoduc") || norm.includes("trainghiem") || norm.includes("hdtn"))
    return SUBJECT_COLOR_PRESETS.gdcd;

  return DEFAULT_THEME;
}

function getSubjectIcon(subjectName: string, subjectId: string) {
  const norm = (subjectName || subjectId || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");

  if (norm.includes("tin") || norm.includes("tinhoc") || norm.includes("congnghe")) return Monitor;
  if (norm.includes("toan")) return Calculator;
  if (norm.includes("van") || norm.includes("tiengviet") || norm.includes("nguvan")) return BookOpen;
  if (norm.includes("anh") || norm.includes("tienganh") || norm.includes("english")) return Languages;
  if (norm.includes("khoahoc") || norm.includes("khtn") || norm.includes("ly") || norm.includes("hoa") || norm.includes("sinh"))
    return Atom;
  if (norm.includes("su") || norm.includes("lichsu") || norm.includes("dia") || norm.includes("khxh")) return Compass;
  if (norm.includes("my") || norm.includes("mythuat") || norm.includes("nhac") || norm.includes("amnhac")) return Palette;
  if (norm.includes("theduc") || norm.includes("gdtc")) return Activity;
  return GraduationCap;
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
  const end = Number(schedule.endPeriod || start + 1);
  const last = Math.max(start, end - 1);
  if (start <= 0) return "Chưa rõ tiết";
  return start === last ? `Tiết ${start}` : `Tiết ${start} - ${last}`;
}

function periodCount(schedule: Row) {
  return Math.max(1, Number(schedule.endPeriod || 0) - Number(schedule.startPeriod || 0));
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
  const [semesters, setSemesters] = useState<Row[]>([]);
  const [timeSlots, setTimeSlots] = useState<Row[]>([]);
  const [contextLoading, setContextLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");

  // Navigation & Filter States
  const [selectedWeek, setSelectedWeek] = useState(currentMonday());
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [selectedSession, setSelectedSession] = useState<"all" | "morning" | "afternoon">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [colorMode, setColorMode] = useState<"grade" | "subject">("grade");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showSaturday, setShowSaturday] = useState(false);

  // Interaction States (Crosshair coordinate tracking for anti-misreading)
  const [hoveredCoordinate, setHoveredCoordinate] = useState<{ day: number; period: number } | null>(null);
  const [selectedScheduleModal, setSelectedScheduleModal] = useState<Row | null>(null);
  const [respondingId, setRespondingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

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
    return () => {
      active = false;
    };
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
        (snapshotError) => {
          setError(firebaseDataErrorMessage(snapshotError));
          setLoading(false);
        },
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
      watchCatalog("semesters", setSemesters),
      watchCatalog("timeSlots", setTimeSlots),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  // Map of periods with exact start and end times (Configured in Firestore or default standard)
  const activePeriods = useMemo<PeriodSlot[]>(() => {
    return DEFAULT_PERIOD_SLOTS.map((defSlot) => {
      const matchInDb = timeSlots.find(
        (slot) => Number(slot.periodNumber ?? slot.order ?? slot.period ?? 0) === defSlot.period && slot.isActive !== false,
      );
      if (matchInDb && matchInDb.startTime && matchInDb.endTime) {
        return {
          period: defSlot.period,
          name: String(matchInDb.name || defSlot.name),
          startTime: String(matchInDb.startTime),
          endTime: String(matchInDb.endTime),
          session: defSlot.session,
        };
      }
      return defSlot;
    });
  }, [timeSlots]);

  const allSchedules = useMemo(() => {
    const map = new Map<string, Row>();
    [...legacySchedules, ...primarySchedules].forEach((schedule) => map.set(schedule.id, schedule));
    return Array.from(map.values())
      .filter((schedule) => schedule.status !== "cancelled")
      .filter((schedule) =>
        textValue(schedule.actualTeacherId) ? schedule.actualTeacherId === teacherId : schedule.teacherId === teacherId,
      );
  }, [legacySchedules, primarySchedules, teacherId]);

  // Check if there are any Saturday schedules in general
  const hasSaturdayTeaching = useMemo(() => {
    return allSchedules.some((s) => Number(s.dayOfWeek || 0) === 7);
  }, [allSchedules]);

  const activeWeekdays = useMemo(() => {
    if (showSaturday || hasSaturdayTeaching) {
      return [2, 3, 4, 5, 6, 7] as const;
    }
    return WEEKDAYS;
  }, [hasSaturdayTeaching, showSaturday]);

  // Compute Week Range
  const weekEnd = useMemo(() => addDaysDateOnly(selectedWeek, 6), [selectedWeek]);
  const todayStr = useMemo(() => todayDateOnly(), []);

  // Format week range label (e.g. "06/10/2025 - 12/10/2025")
  const weekRangeLabel = useMemo(() => {
    try {
      const start = parseISO(selectedWeek);
      const end = parseISO(weekEnd);
      return `${format(start, "dd/MM/yyyy")} - ${format(end, "dd/MM/yyyy")}`;
    } catch {
      return `${selectedWeek} - ${weekEnd}`;
    }
  }, [selectedWeek, weekEnd]);

  // Classes taught by this teacher for the filter dropdown
  const teacherClasses = useMemo(() => {
    const classIdSet = new Set<string>();
    allSchedules.forEach((s) => {
      const cid = textValue(s.classId);
      if (cid) classIdSet.add(cid);
    });
    return Array.from(classIdSet)
      .map((cid) => {
        const found = classes.find((c) => c.id === cid);
        return {
          id: cid,
          name: catalogName(classes, cid) || cid,
          grade: Number(found?.grade ?? found?.gradeLevel ?? 0) || inferGradeFromName(catalogName(classes, cid)),
        };
      })
      .sort((a, b) => (a.grade !== b.grade ? a.grade - b.grade : a.name.localeCompare(b.name, "vi")));
  }, [allSchedules, classes]);

  const filteredSchedules = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return allSchedules
      .filter((schedule) => {
        const date = dateForSchedule(schedule);
        if (date < selectedWeek || date > weekEnd) return false;
        if (selectedSemesterId && textValue(schedule.semesterId) !== selectedSemesterId) return false;
        if (selectedClassId !== "all" && textValue(schedule.classId) !== selectedClassId) return false;
        if (statusFilter !== "all" && schedule.confirmationStatus !== statusFilter) return false;

        // Session filter
        if (selectedSession !== "all") {
          const start = Number(schedule.startPeriod || 0);
          if (selectedSession === "morning" && start > 4) return false;
          if (selectedSession === "afternoon" && start <= 4) return false;
        }

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
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("vi").includes(keyword));
      })
      .sort((first, second) => {
        const dateCompare = dateForSchedule(first).localeCompare(dateForSchedule(second));
        return dateCompare || Number(first.startPeriod || 0) - Number(second.startPeriod || 0);
      });
  }, [
    allSchedules,
    campuses,
    classes,
    rooms,
    search,
    selectedClassId,
    selectedSemesterId,
    selectedSession,
    selectedWeek,
    statusFilter,
    subjects,
    weekEnd,
  ]);

  const totalPeriods = filteredSchedules.reduce((sum, schedule) => sum + periodCount(schedule), 0);
  const pendingCount = filteredSchedules.filter((schedule) => schedule.confirmationStatus === "cho_xac_nhan").length;

  // Max period to display: default 8 (matching the screenshot), but if there are classes at 9 or 10, show up to 10
  const maxPeriodToDisplay = useMemo(() => {
    const hasLatePeriod = filteredSchedules.some((s) => Number(s.endPeriod || 0) > 9);
    return hasLatePeriod ? 10 : 8;
  }, [filteredSchedules]);

  const displayedPeriods = useMemo(() => {
    return activePeriods.filter((p) => p.period <= maxPeriodToDisplay);
  }, [activePeriods, maxPeriodToDisplay]);

  // Group schedules by day and start period for ultra-fast table lookup
  const scheduleMatrix = useMemo(() => {
    const map = new Map<string, Row[]>();
    filteredSchedules.forEach((sch) => {
      const day = Number(sch.dayOfWeek || 2);
      const start = Number(sch.startPeriod || 1);
      const key = `${day}-${start}`;
      const existing = map.get(key) || [];
      existing.push(sch);
      map.set(key, existing);
    });
    return map;
  }, [filteredSchedules]);

  // Check which periods a class occupies to handle multi-period spanning (rowSpan)
  const cellOccupancy = useMemo(() => {
    const occupied = new Map<string, { schedules: Row[]; rowSpan: number; isLead: boolean }>();

    filteredSchedules.forEach((sch) => {
      const day = Number(sch.dayOfWeek || 2);
      const start = Number(sch.startPeriod || 1);
      const end = Number(sch.endPeriod || start + 1);
      const span = Math.max(1, end - start);

      for (let p = start; p < end; p++) {
        const key = `${day}-${p}`;
        const existing = occupied.get(key);
        if (!existing) {
          occupied.set(key, {
            schedules: [sch],
            rowSpan: span,
            isLead: p === start,
          });
        } else {
          if (!existing.schedules.some((s) => s.id === sch.id)) {
            existing.schedules.push(sch);
            existing.rowSpan = Math.max(existing.rowSpan, span);
          }
        }
      }
    });

    return occupied;
  }, [filteredSchedules]);

  // Resolve theme for a card (by grade or subject)
  function resolveCardTheme(schedule: Row): ColorTheme {
    const className = schedule.className || catalogName(classes, schedule.classId) || "";
    const subjectName = schedule.subjectName || catalogName(subjects, schedule.subjectId) || "";

    if (colorMode === "subject") {
      return getSubjectTheme(subjectName, schedule.subjectId);
    }

    // Default: Color by Grade (Khối 6: xanh lá, Khối 7: xanh dương, Khối 8: tím, Khối 9: vàng)
    const grade = Number(schedule.grade ?? 0) || inferGradeFromName(className);
    if (grade && GRADE_COLOR_THEMES[grade]) {
      return GRADE_COLOR_THEMES[grade];
    }
    return DEFAULT_THEME;
  }

  async function respond(schedule: Row, response: "xac_nhan" | "tu_choi", reason?: string) {
    if (response === "tu_choi" && !reason) {
      setShowRejectInput(true);
      return;
    }
    setRespondingId(schedule.id);
    setError("");
    try {
      await respondToScheduleAssignment({ scheduleId: schedule.id, response, reason });
      toast.success(response === "xac_nhan" ? "Đã xác nhận lịch dạy thành công." : "Đã từ chối lịch dạy.");
      setSelectedScheduleModal(null);
      setShowRejectInput(false);
      setRejectReason("");
    } catch (submitError) {
      setError(firebaseErrorMessage(submitError));
    } finally {
      setRespondingId("");
    }
  }

  // Quick navigation handlers
  const handlePrevWeek = () => setSelectedWeek(addDaysDateOnly(selectedWeek, -7));
  const handleNextWeek = () => setSelectedWeek(addDaysDateOnly(selectedWeek, 7));
  const handleCurrentWeek = () => setSelectedWeek(currentMonday());

  function renderScheduleCardContent(schedule: Row, compact = false) {
    const subject = schedule.subjectName || catalogName(subjects, schedule.subjectId) || schedule.subjectId || "Môn học";
    const className = schedule.className || catalogName(classes, schedule.classId) || schedule.classId || "Lớp";
    const room = schedule.roomName || catalogName(rooms, schedule.roomId) || schedule.roomId || "Phòng";
    const theme = resolveCardTheme(schedule);
    const SubjectIcon = getSubjectIcon(subject, schedule.subjectId);
    const isSubstitute = textValue(schedule.originalTeacherId) && schedule.originalTeacherId !== teacherId;
    const isPending = schedule.confirmationStatus === "cho_xac_nhan";

    return (
      <div
        key={schedule.id}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedScheduleModal(schedule);
        }}
        className={cn(
          "group relative flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 text-left transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-md hover:-translate-y-0.5",
          theme.bg,
          theme.border,
          theme.accent,
          compact ? "py-2" : "min-h-[82px]",
        )}
      >
        {/* Top: Icon + Class Name */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn("shrink-0 transition-transform group-hover:scale-110", theme.iconColor)}>
              <SubjectIcon className="h-4 w-4" />
            </span>
            <span className={cn("truncate font-black text-sm tracking-tight", theme.text)}>{className}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isSubstitute ? (
              <span className="rounded bg-sky-200/80 px-1 py-0.5 text-[10px] font-bold text-sky-900">Thay</span>
            ) : null}
            {isPending ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Middle: Subject Name */}
        <div className="mt-1">
          <p className={cn("truncate text-xs font-semibold text-slate-800", theme.text)}>{subject}</p>
        </div>

        {/* Bottom: Room Name */}
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600 font-medium">
          <div className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="truncate">{room}</span>
          </div>
          {periodCount(schedule) > 1 ? (
            <span className="text-[10px] font-bold text-slate-500">({periodCount(schedule)} tiết)</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["giaovien", "bgh", "totruong", "admin"]}>
      <Shell>
        {/* PAGE HEADER */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-primary/10 p-1.5 text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Thời khóa biểu</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Thời khóa biểu giảng dạy theo tuần, hiển thị rõ giờ học, phân định sáng - chiều và chống nhìn nhầm.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">In thời khóa biểu</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCurrentWeek}>
              <RefreshCcw className="h-4 w-4" />
              Tuần hiện tại
            </Button>
            <div className="inline-flex rounded-xl border border-border bg-card p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-bold transition",
                  viewMode === "grid" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Lưới chuẩn
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-bold transition",
                  viewMode === "list" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Thẻ theo ngày
              </button>
            </div>
          </div>
        </div>

        {/* ALERTS */}
        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        ) : null}
        {lookupError ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Không thể tải danh mục liên quan: {lookupError}
          </div>
        ) : null}

        {/* CONTROLS BAR (THIẾT KẾ ĐÚNG 100% NHƯ HÌNH MẪU YÊU CẦU) */}
        <Card className="mb-5 p-4 shadow-sm border border-slate-200/90 print:hidden">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            {/* 1. TUẦN SELECTOR (< 06/10/2025 - 12/10/2025 >) */}
            <div>
              <Label className="mb-1 text-xs font-bold text-slate-700">Tuần</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePrevWeek}
                  className="h-10 w-10 shrink-0 p-0 rounded-xl"
                  title="Tuần trước"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="relative flex-1">
                  <div className="flex h-10 w-full items-center justify-center rounded-xl border border-border bg-card px-2 text-center text-xs font-extrabold text-foreground shadow-2xs">
                    <Calendar className="mr-1.5 h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{weekRangeLabel}</span>
                  </div>
                  {/* Native invisible date picker overlaid for direct week picking */}
                  <input
                    type="date"
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(mondayFrom(e.target.value))}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Bấm để chọn ngày bất kỳ"
                  />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleNextWeek}
                  className="h-10 w-10 shrink-0 p-0 rounded-xl"
                  title="Tuần kế tiếp"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 2. HỌC KỲ DROPDOWN */}
            <div>
              <Label className="mb-1 text-xs font-bold text-slate-700">Học kỳ</Label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
                value={selectedSemesterId}
                onChange={(e) => setSelectedSemesterId(e.target.value)}
              >
                <option value="">Tất cả học kỳ</option>
                {semesters.length > 0 ? (
                  semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {catalogName(semesters, s.id)}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="hk1">Học kỳ I (2025 - 2026)</option>
                    <option value="hk2">Học kỳ II (2025 - 2026)</option>
                  </>
                )}
              </select>
            </div>

            {/* 3. HIỂN THỊ LỚP (Tất cả lớp / 6A1, 7A1...) */}
            <div>
              <Label className="mb-1 text-xs font-bold text-slate-700">Hiển thị</Label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                <option value="all">Tất cả lớp</option>
                {teacherClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. TÌM KIẾM NHANH */}
            <div className="relative">
              <Label className="mb-1 text-xs font-bold text-slate-700">Tìm kiếm</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 pl-9 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Môn, lớp, phòng học..."
                />
              </div>
            </div>
          </div>

          {/* SECONDARY FILTER & STATUS ROW */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-medium">Buổi dạy:</span>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value as any)}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold"
                >
                  <option value="all">Cả ngày (Sáng & Chiều)</option>
                  <option value="morning">Chỉ buổi sáng (Tiết 1-4)</option>
                  <option value="afternoon">Chỉ buổi chiều (Tiết 5-8)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-medium">Trạng thái:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="cho_xac_nhan">Chờ xác nhận</option>
                  <option value="xac_nhan">Đã xác nhận</option>
                  <option value="khong_yeu_cau">Không yêu cầu</option>
                  <option value="tu_choi">Đã từ chối</option>
                </select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={showSaturday}
                  onChange={(e) => setShowSaturday(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="font-medium">Hiện Thứ Bảy</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Tô màu theo:</span>
              <button
                type="button"
                onClick={() => setColorMode("grade")}
                className={cn(
                  "rounded-lg px-2 py-0.5 font-bold transition",
                  colorMode === "grade" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Khối lớp
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={() => setColorMode("subject")}
                className={cn(
                  "rounded-lg px-2 py-0.5 font-bold transition",
                  colorMode === "subject" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Môn học
              </button>
            </div>
          </div>
        </Card>

        {/* METRIC STRIP */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-card p-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">{teacherName || "Giáo viên"}</p>
              <p className="text-[11px] text-muted-foreground">Giáo viên phụ trách lịch</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-1.5">
              <span className="text-muted-foreground">Tiết trong tuần: </span>
              <strong className="text-foreground text-sm font-black">{totalPeriods}</strong> tiết
            </div>
            {pendingCount > 0 ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                {pendingCount} tiết chờ xác nhận
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Lịch đã đồng bộ
              </div>
            )}
          </div>
        </div>

        {/* MAIN DISPLAY */}
        {loading || contextLoading ? (
          <Card className="p-6">
            <Skeleton className="h-[520px] w-full rounded-2xl" />
          </Card>
        ) : filteredSchedules.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={<CalendarDays className="h-8 w-8 text-primary" />}
              title="Không có lịch dạy trong tuần này"
              description="Không có tiết dạy trong tuần được chọn. Vui lòng kiểm tra tuần khác hoặc điều chỉnh bộ lọc."
              action={
                <Button variant="secondary" size="sm" onClick={handleCurrentWeek}>
                  Quay lại tuần hiện tại
                </Button>
              }
            />
          </Card>
        ) : viewMode === "grid" ? (
          /* ========================================================================= */
          /* 1. LƯỚI THỜI KHÓA BIỂU MA TRẬN KHOA HỌC CHUẨN (CHỐNG NHÌN NHẦM)          */
          /* ========================================================================= */
          <div className="space-y-4">
            <Card className="overflow-hidden border border-slate-200/90 shadow-sm bg-white rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left select-none">
                  {/* TABLE HEADER (TIẾT | THỨ HAI 06/10 | THỨ BA 07/10 ...) */}
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-700">
                      {/* Cột Tiết */}
                      <th className="w-28 sm:w-32 p-3 text-center border-r border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-800">
                        Tiết
                      </th>

                      {/* Các cột Thứ trong tuần */}
                      {activeWeekdays.map((day) => {
                        const dayDateStr = addDaysDateOnly(selectedWeek, day - 2);
                        const isToday = dayDateStr === todayStr;
                        const isDayHovered = hoveredCoordinate?.day === day;
                        let formattedDayDate = "";
                        try {
                          formattedDayDate = format(parseISO(dayDateStr), "dd/MM");
                        } catch {
                          formattedDayDate = dayDateStr;
                        }

                        return (
                          <th
                            key={day}
                            className={cn(
                              "min-w-[155px] sm:min-w-[175px] p-3 text-center border-r border-slate-200 last:border-r-0 transition-colors duration-150",
                              isToday ? "bg-blue-50/50" : "",
                              isDayHovered ? "bg-blue-100/60 ring-1 ring-primary/30" : "",
                            )}
                          >
                            <div className="flex flex-col items-center justify-center">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    "text-sm font-extrabold tracking-tight",
                                    isToday ? "text-primary" : "text-slate-800",
                                    isDayHovered ? "text-primary scale-105" : "",
                                  )}
                                >
                                  {DAY_NAMES[day] || `Thứ ${day}`}
                                </span>
                                {isToday ? (
                                  <span className="rounded-full bg-primary px-1.5 py-0.2 text-[9px] font-black text-primary-foreground shadow-2xs">
                                    Hôm nay
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-[11px] font-semibold text-slate-500 mt-0.5">{formattedDayDate}</span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  {/* TABLE BODY */}
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {displayedPeriods.map((slot, index) => {
                      const p = slot.period;
                      const isPeriodHovered = hoveredCoordinate?.period === p;
                      const isLunchBreakBoundary = p === 5; // Dải phân cách nghỉ trưa giữa tiết 4 và tiết 5

                      return (
                        <tr
                          key={p}
                          className={cn(
                            "divide-x divide-slate-200 transition-colors duration-100",
                            isPeriodHovered ? "bg-blue-50/20" : "",
                            // Phân biệt nhẹ giữa các dòng để chống nhìn nhầm (alternating striping)
                            p % 2 === 0 ? "bg-slate-50/30" : "bg-white",
                          )}
                        >
                          {/* CỘT TIẾT & GIỜ HỌC BÊN TRÁI (Chuẩn như hình chụp) */}
                          <td
                            className={cn(
                              "p-2.5 text-center border-r border-slate-200 align-middle transition-colors duration-150",
                              isPeriodHovered ? "bg-blue-100/60 text-primary ring-1 ring-primary/30" : "bg-slate-50/50",
                            )}
                          >
                            <div className="flex flex-col items-center justify-center">
                              <span
                                className={cn(
                                  "text-base font-black tracking-tight",
                                  isPeriodHovered ? "text-primary scale-110" : "text-slate-800",
                                )}
                              >
                                {p}
                              </span>
                              <span className="mt-0.5 text-[11px] font-semibold text-slate-400 font-sans tracking-tight">
                                {slot.startTime} - {slot.endTime}
                              </span>
                            </div>
                          </td>

                          {/* CÁC Ô LỊCH HỌC THEO THỨ */}
                          {activeWeekdays.map((day) => {
                            const dayDateStr = addDaysDateOnly(selectedWeek, day - 2);
                            const isToday = dayDateStr === todayStr;
                            const isCellHovered = hoveredCoordinate?.day === day && hoveredCoordinate?.period === p;
                            const occ = cellOccupancy.get(`${day}-${p}`);

                            // Nếu ô này thuộc về tiết kéo dài (rowSpan) và không phải ô bắt đầu, bỏ qua để không vỡ bảng
                            if (occ && !occ.isLead) {
                              return null;
                            }

                            return (
                              <td
                                key={day}
                                rowSpan={occ?.isLead ? occ.rowSpan : 1}
                                onMouseEnter={() => setHoveredCoordinate({ day, period: p })}
                                onMouseLeave={() => setHoveredCoordinate(null)}
                                className={cn(
                                  "p-1.5 sm:p-2 align-top transition-all duration-150 border-r border-slate-200 last:border-r-0 relative",
                                  isToday ? "bg-blue-50/25" : "",
                                  isCellHovered ? "ring-2 ring-primary/40 ring-inset bg-blue-50/40" : "",
                                )}
                              >
                                {occ?.schedules && occ.schedules.length > 0 ? (
                                  occ.schedules.length === 1 ? (
                                    renderScheduleCardContent(occ.schedules[0], occ.rowSpan === 1 && p > 8)
                                  ) : (
                                    <div className="flex flex-col gap-1.5 h-full">
                                      <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-300 px-2 py-1 text-[11px] font-extrabold text-emerald-800 shadow-2xs">
                                        <span className="flex items-center gap-1">
                                          <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                          <span>Dạy ghép {occ.schedules.length} lớp</span>
                                        </span>
                                        <span className="text-[10px] bg-emerald-200/90 text-emerald-900 px-1.5 py-0.5 rounded font-black">
                                          {occ.schedules
                                            .map((s) => s.className || catalogName(classes, s.classId) || "")
                                            .filter(Boolean)
                                            .join(" & ")}
                                        </span>
                                      </div>
                                      <div className="flex flex-col gap-1.5">
                                        {occ.schedules.map((schedule) => (
                                          <div key={schedule.id}>
                                            {renderScheduleCardContent(schedule, true)}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  // Ô trống: thiết kế tối giản, sạch sẽ, không rối mắt
                                  <div className="h-full min-h-[72px] w-full rounded-xl border border-transparent p-2 text-center text-xs text-muted-foreground/30 flex items-center justify-center hover:border-slate-200/60 hover:bg-slate-50/40 transition">
                                    <span className="sr-only">Trống tiết {p}</span>
                                  </div>
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

            {/* CHÚ THÍCH MÀU LỚP HỌC (ĐÚNG 100% NHƯ HÌNH MẪU YÊU CẦU) */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-2 py-1 text-xs">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-semibold text-slate-700">
                <span className="text-slate-900 font-extrabold">Màu lớp học:</span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-2xs"></span>
                  <span>Khối 6</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-sky-500 shadow-2xs"></span>
                  <span>Khối 7</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-purple-500 shadow-2xs"></span>
                  <span>Khối 8</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-500 shadow-2xs"></span>
                  <span>Khối 9</span>
                </span>
              </div>

              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-primary" />
                <span>Rê chuột vào ô để tự động gióng hàng dọc (Thứ) và hàng ngang (Tiết / Giờ).</span>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* 2. CHẾ ĐỘ XEM DANH SÁCH THẺ THEO THỨ (Cards View)                         */
          /* ========================================================================= */
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {activeWeekdays.map((day) => {
              const dayDate = addDays(parseISO(selectedWeek), day - 2);
              const dayDateStr = addDaysDateOnly(selectedWeek, day - 2);
              const isToday = dayDateStr === todayStr;
              const daySchedules = filteredSchedules
                .filter((s) => Number(s.dayOfWeek || 2) === day)
                .sort((a, b) => Number(a.startPeriod || 0) - Number(b.startPeriod || 0));

              return (
                <section
                  key={day}
                  className={cn(
                    "min-h-64 rounded-2xl border p-3 shadow-2xs transition",
                    isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card",
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-extrabold text-sm text-foreground">{DAY_NAMES[day]}</h3>
                        {isToday ? (
                          <span className="rounded-full bg-primary px-1.5 py-0.2 text-[9px] font-black text-primary-foreground">
                            Hôm nay
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-semibold">{format(dayDate, "dd/MM/yyyy")}</p>
                    </div>
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-xs font-black text-muted-foreground">
                      {daySchedules.length}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {daySchedules.length > 0 ? (
                      daySchedules.map((schedule) => renderScheduleCardContent(schedule))
                    ) : (
                      <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-3 text-center text-xs text-muted-foreground font-medium">
                        <Clock3 className="mr-1.5 h-4 w-4" />
                        Không có tiết
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* MODAL CHI TIẾT TIẾT DẠY & THAO TÁC XÁC NHẬN */}
        {selectedScheduleModal ? (
          <Modal
            open={Boolean(selectedScheduleModal)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedScheduleModal(null);
                setShowRejectInput(false);
                setRejectReason("");
              }
            }}
            title="Chi tiết tiết giảng dạy"
            description="Thông tin chi tiết thời gian, môn học, phòng học và xác nhận phân công."
          >
            {(() => {
              const schedule = selectedScheduleModal;
              const subject =
                schedule.subjectName || catalogName(subjects, schedule.subjectId) || schedule.subjectId || "Môn học";
              const className =
                schedule.className || catalogName(classes, schedule.classId) || schedule.classId || "Lớp";
              const room = schedule.roomName || catalogName(rooms, schedule.roomId) || schedule.roomId || "Phòng";
              const campus =
                schedule.campusName || catalogName(campuses, schedule.campusId) || schedule.campusId || "Cơ sở";
              const dateStr = dateForSchedule(schedule);
              const start = Number(schedule.startPeriod || 1);
              const end = Number(schedule.endPeriod || start + 1);
              const slotDef = activePeriods.find((s) => s.period === start);
              const endSlotDef = activePeriods.find((s) => s.period === Math.max(start, end - 1));
              const timeRange =
                slotDef && endSlotDef
                  ? `${slotDef.startTime} – ${endSlotDef.endTime}`
                  : slotDef
                  ? `${slotDef.startTime} – ${slotDef.endTime}`
                  : "Chưa rõ giờ";
              const isSubstitute =
                textValue(schedule.originalTeacherId) && schedule.originalTeacherId !== teacherId;
              const canRespond =
                schedule.confirmationStatus === "cho_xac_nhan" &&
                (schedule.actualTeacherId === teacherId || schedule.teacherId === teacherId);
              const SubjectIcon = getSubjectIcon(subject, schedule.subjectId);
              const theme = resolveCardTheme(schedule);

              return (
                <div className="space-y-4">
                  {/* Hero card */}
                  <div className={cn("rounded-2xl border p-4 shadow-xs", theme.bg, theme.border)}>
                    <div className="flex items-center gap-3">
                      <div className={cn("rounded-xl p-2.5 bg-white/80 shadow-2xs", theme.iconColor)}>
                        <SubjectIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className={cn("text-lg font-black tracking-tight", theme.text)}>{subject}</h4>
                        <p className="text-xs font-bold text-slate-700">Lớp: {className}</p>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-xl border border-border bg-card p-3 shadow-2xs space-y-1">
                      <span className="text-muted-foreground font-medium">Thời gian & Tiết học:</span>
                      <p className="text-sm font-black text-foreground">
                        {periodText(schedule)} ({timeRange})
                      </p>
                      <p className="text-muted-foreground">
                        {DAY_NAMES[Number(schedule.dayOfWeek || 2)]}, {dateStr}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 shadow-2xs space-y-1">
                      <span className="text-muted-foreground font-medium">Địa điểm:</span>
                      <p className="text-sm font-black text-foreground">{room}</p>
                      <p className="text-muted-foreground">{campus}</p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 shadow-2xs space-y-1">
                      <span className="text-muted-foreground font-medium">Trạng thái xếp lịch:</span>
                      <div>
                        <Badge tone="neutral">{scheduleStatusLabel(schedule.status)}</Badge>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 shadow-2xs space-y-1">
                      <span className="text-muted-foreground font-medium">Xác nhận phân công:</span>
                      <div>
                        <Badge tone={confirmationTone(schedule.confirmationStatus)}>
                          {confirmationLabel(schedule.confirmationStatus)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {isSubstitute ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                      <strong>Lịch dạy thay:</strong> Tiết này được phân công dạy thay giáo viên khác.
                    </div>
                  ) : null}

                  {/* Thao tác xác nhận / từ chối */}
                  {canRespond ? (
                    <div className="border-t border-border pt-4">
                      <p className="mb-2 text-xs font-bold text-foreground">Phản hồi phân công tiết học:</p>
                      {showRejectInput ? (
                        <div className="space-y-2">
                          <Label className="text-xs">Lý do từ chối:</Label>
                          <Input
                            placeholder="Nhập lý do từ chối lịch..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="text-xs"
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="danger"
                              size="sm"
                              loading={respondingId === schedule.id}
                              onClick={() => respond(schedule, "tu_choi", rejectReason)}
                            >
                              Xác nhận từ chối
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setShowRejectInput(false)}>
                              Hủy
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            loading={respondingId === schedule.id}
                            onClick={() => respond(schedule, "xac_nhan")}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Xác nhận lịch dạy
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={respondingId === schedule.id}
                            onClick={() => setShowRejectInput(true)}
                          >
                            <XCircle className="h-4 w-4" />
                            Từ chối lịch dạy
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </Modal>
        ) : null}
      </Shell>
    </RoleGuard>
  );
}
