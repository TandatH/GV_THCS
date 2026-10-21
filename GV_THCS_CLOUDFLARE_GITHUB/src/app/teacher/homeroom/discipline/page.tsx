"use client";

import {
  AlertCircle,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  History,
  Info,
  Layers,
  ListChecks,
  Lock,
  MessageSquare,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Unlock,
  User,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  DEFAULT_DISCIPLINE_CRITERIA,
  disciplineCategories,
  disciplineCategoryLabels,
  type DisciplineCategory,
} from "@school/shared";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  Skeleton,
} from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { exportHomeroomDisciplineExcel } from "@/lib/exports/discipline-excel";
import { submitDisciplineAppeal } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { cn, formatDate } from "@/lib/utils";

type ClassRow = DocumentData & { id: string; name?: string; code?: string; grade?: number | string; gradeLevel?: number | string; schoolLevel?: string; homeroomTeacherId?: string };
type WeekRow = DocumentData & { id: string; weekNumber: number; schoolYearId: string; schoolLevel?: string; status?: string; isLocked?: boolean };
type StudentRow = DocumentData & { id: string; studentCode: string; fullName: string; classId: string; className: string };
type EntryRow = DocumentData & {
  id: string;
  weekId: string;
  classId: string;
  className: string;
  criterionId: string;
  criterionCode?: string;
  criterionName: string;
  category: DisciplineCategory;
  unitPoints: number;
  quantity: number;
  totalPoints: number;
  scope: "student" | "class";
  studentIds?: string[];
  studentNamesText?: string;
  occurredDate: string;
  period?: number | null;
  note?: string;
  attachmentUrls?: string[];
  status: string;
  reportedByName: string;
  reviewedByName?: string;
  hasPendingAppeal?: boolean;
};
type AppealRow = DocumentData & {
  id: string;
  entryId: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  reason: string;
  evidenceUrls?: string[];
  status: "pending" | "approved" | "rejected";
  resolutionNote?: string;
  resolvedByName?: string;
  resolvedAt?: any;
  createdAt?: any;
};
type ApprovalRow = DocumentData & {
  id: string;
  version: number;
  status: string;
  signerUid: string;
  signerName: string;
  signerEmail: string;
  contentHashSha256: string;
  signedAt?: any;
};
type ClassScoreRow = DocumentData & {
  id: string;
  weekId: string;
  classId: string;
  grade?: string;
  finalScore: number;
  totalPlus: number;
  totalMinus: number;
};

function isSecondaryClass(row: ClassRow): boolean {
  if (row.schoolLevel === "primary") return false;
  if (row.schoolLevel === "secondary") return true;
  const grade = Number(row.grade ?? row.gradeLevel ?? String(row.name || row.code || "").match(/\d+/)?.[0]);
  return !(Number.isFinite(grade) && grade >= 1 && grade <= 5);
}

function HomeroomDisciplineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryWeekId = searchParams.get("weekId");
  const { user, role } = useAuth();

  // Trạng thái tải và liên kết GVCN
  const [checkingHomeroom, setCheckingHomeroom] = useState<boolean>(true);
  const [teacherId, setTeacherId] = useState<string>("");
  const [homeroomClasses, setHomeroomClasses] = useState<ClassRow[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>("");

  // Metadata
  const [schoolYears, setSchoolYears] = useState<DocumentData[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");

  // Dữ liệu học sinh, vi phạm, khiếu nại, điểm
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [activeApproval, setActiveApproval] = useState<ApprovalRow | null>(null);
  const [allWeekScores, setAllWeekScores] = useState<ClassScoreRow[]>([]);

  // Lọc danh sách vi phạm
  const [filterStudentId, setFilterStudentId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"violations" | "students_summary" | "appeals">("violations");

  // Modal khiếu nại
  const [appealModalEntry, setAppealModalEntry] = useState<EntryRow | null>(null);
  const [appealReason, setAppealReason] = useState<string>("");
  const [appealEvidenceUrl, setAppealEvidenceUrl] = useState<string>("");
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState<boolean>(false);

  // 1. XÁC ĐỊNH LỚP DO GIÁO VIÊN CHỦ NHIỆM
  useEffect(() => {
    async function resolveHomeroomClasses() {
      if (!user) return;
      setCheckingHomeroom(true);

      try {
        let tId = "";
        try {
          const teacherContext = await getCurrentTeacherContext(user.uid);
          tId = teacherContext.teacherId;
          setTeacherId(tId);
        } catch {
          // Người dùng có thể là Admin/BGH không có teacherId
        }

        // Lấy danh sách lớp học
        const clsSnap = await getDocs(query(collection(firestore, "classes"), where("isActive", "==", true)));
        const allCls = (clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ClassRow[])
          .filter(isSecondaryClass);
        allCls.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        // Lọc các lớp do giáo viên này làm GVCN
        let myClasses: ClassRow[] = [];
        if (tId) {
          myClasses = allCls.filter((c) => c.homeroomTeacherId === tId);
        }

        // Nếu là Admin/BGH mà không chủ nhiệm lớp nào, cho phép xem tất cả các lớp
        if (myClasses.length === 0 && (role === "admin" || role === "bgh")) {
          myClasses = allCls;
        }

        setHomeroomClasses(myClasses);
        if (myClasses.length > 0) {
          setActiveClassId(myClasses[0].id);
        }
      } catch (err) {
        console.error("Lỗi xác định lớp chủ nhiệm:", err);
      } finally {
        setCheckingHomeroom(false);
      }
    }

    resolveHomeroomClasses();
  }, [user, role]);

  // 2. TẢI NĂM HỌC VÀ TUẦN THI ĐUA
  useEffect(() => {
    async function fetchYears() {
      try {
        const sySnap = await getDocs(query(collection(firestore, "schoolYears"), where("isActive", "==", true)));
        const rows = sySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSchoolYears(rows);
        if (rows.length > 0 && !selectedSchoolYearId) {
          setSelectedSchoolYearId(rows[0].id);
        }
      } catch (err) {
        console.error("Lỗi tải năm học:", err);
      }
    }
    fetchYears();
  }, []);

  useEffect(() => {
    if (!selectedSchoolYearId) return;
    const qWeeks = query(
      collection(firestore, "disciplineWeeks"),
      where("schoolYearId", "==", selectedSchoolYearId),
    );
    const unsubWeeks = onSnapshot(qWeeks, (snapshot) => {
      const rows = (snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as WeekRow[])
        .filter((week) => (week.schoolLevel || "secondary") === "secondary");
      rows.sort((a, b) => b.weekNumber - a.weekNumber);
      setWeeks(rows);
      if (rows.length > 0) {
        if (queryWeekId && rows.some((w) => w.id === queryWeekId)) {
          setSelectedWeekId(queryWeekId);
        } else if (!selectedWeekId || !rows.some((w) => w.id === selectedWeekId)) {
          setSelectedWeekId(rows[0].id);
        }
      } else {
        setSelectedWeekId("");
      }
    });
    return () => unsubWeeks();
  }, [selectedSchoolYearId, queryWeekId]);

  // 3. TẢI HỌC SINH CỦA LỚP
  useEffect(() => {
    if (!activeClassId) {
      setStudents([]);
      return;
    }
    const qStudents = query(
      collection(firestore, "students"),
      where("classId", "==", activeClassId),
    );
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as StudentRow[];
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setStudents(rows);
    });
    return () => unsubStudents();
  }, [activeClassId]);

  // 4. TẢI PHIẾU VI PHẠM CỦA LỚP TRONG TUẦN
  useEffect(() => {
    if (!activeClassId || !selectedWeekId) {
      setEntries([]);
      return;
    }
    const qEntries = query(
      collection(firestore, "disciplineEntries"),
      where("classId", "==", activeClassId),
      where("weekId", "==", selectedWeekId),
    );
    const unsubEntries = onSnapshot(qEntries, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as EntryRow[];
      rows.sort((a, b) => b.occurredDate.localeCompare(a.occurredDate));
      setEntries(rows);
    });
    return () => unsubEntries();
  }, [activeClassId, selectedWeekId]);

  // 5. TẢI KHIẾU NẠI CỦA LỚP
  useEffect(() => {
    if (!activeClassId) {
      setAppeals([]);
      return;
    }
    const qAppeals = query(
      collection(firestore, "disciplineAppeals"),
      where("classId", "==", activeClassId),
    );
    const unsubAppeals = onSnapshot(qAppeals, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as AppealRow[];
      setAppeals(rows);
    });
    return () => unsubAppeals();
  }, [activeClassId]);

  // 6. TẢI THÔNG TIN KÝ XÁC NHẬN CỦA LỚP TRONG TUẦN
  useEffect(() => {
    if (!activeClassId || !selectedWeekId) {
      setActiveApproval(null);
      return;
    }
    const qApprovals = query(
      collection(firestore, "disciplineWeeklyApprovals"),
      where("weekId", "==", selectedWeekId),
      where("classId", "==", activeClassId),
    );
    const unsubApprovals = onSnapshot(qApprovals, (snapshot) => {
      if (!snapshot.empty) {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ApprovalRow[];
        rows.sort((a, b) => b.version - a.version);
        setActiveApproval(rows[0]);
      } else {
        setActiveApproval(null);
      }
    });
    return () => unsubApprovals();
  }, [activeClassId, selectedWeekId]);

  // 7. TẢI ĐIỂM CỦA TẤT CẢ CÁC LỚP TRONG TUẦN (ĐỂ TÍNH THỨ HẠNG)
  useEffect(() => {
    if (!selectedWeekId) return;
    const qScores = query(
      collection(firestore, "classWeeklyScores"),
      where("weekId", "==", selectedWeekId),
    );
    const unsubScores = onSnapshot(qScores, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ClassScoreRow[];
      setAllWeekScores(rows);
    });
    return () => unsubScores();
  }, [selectedWeekId]);

  // Lớp và Tuần hiện tại
  const currentClass = useMemo(() => homeroomClasses.find((c) => c.id === activeClassId), [homeroomClasses, activeClassId]);
  const currentWeek = useMemo(() => weeks.find((w) => w.id === selectedWeekId), [weeks, selectedWeekId]);
  const currentYear = useMemo(() => schoolYears.find((y) => y.id === selectedSchoolYearId), [schoolYears, selectedSchoolYearId]);
  const isWeekLocked = currentWeek?.status === "locked" || currentWeek?.isLocked === true;

  // Phiếu đã duyệt
  const approvedEntries = useMemo(() => entries.filter((e) => e.status === "approved"), [entries]);

  // Thống kê Dashboard KPI
  const kpiStats = useMemo(() => {
    let plus = 0;
    let minus = 0;
    let rewardCount = 0;
    let violationCount = 0;
    const violatorSet = new Set<string>();

    for (const entry of approvedEntries) {
      const pts = Number(entry.totalPoints) || 0;
      if (pts > 0) {
        plus += pts;
        rewardCount += entry.quantity || 1;
      } else if (pts < 0) {
        minus += Math.abs(pts);
        violationCount += entry.quantity || 1;
        if (entry.studentIds && entry.studentIds.length > 0) {
          entry.studentIds.forEach((sid) => violatorSet.add(sid));
        }
      }
    }

    const finalScore = 600 + plus - minus;

    // Tính thứ hạng trong khối
    let gradeRank = "—";
    const currentGrade = currentClass?.grade ? String(currentClass.grade) : "";
    if (allWeekScores.length > 0 && currentGrade) {
      const gradeScores = allWeekScores.filter((s) => s.grade === currentGrade);
      gradeScores.sort((a, b) => b.finalScore - a.finalScore);
      const myIdx = gradeScores.findIndex((s) => s.classId === activeClassId);
      if (myIdx >= 0) {
        gradeRank = `#${myIdx + 1} / ${gradeScores.length}`;
      }
    }

    return {
      finalScore,
      totalPlus: plus,
      totalMinus: minus,
      violationCount,
      violatorStudentCount: violatorSet.size,
      rewardCount,
      gradeRank,
    };
  }, [approvedEntries, allWeekScores, currentClass, activeClassId]);

  // Danh sách vi phạm đã lọc
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterStudentId !== "all") {
        if (filterStudentId === "collective") {
          if (e.scope !== "class") return false;
        } else {
          if (!e.studentIds || !e.studentIds.includes(filterStudentId)) return false;
        }
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchStudent = (e.studentNamesText || "").toLowerCase().includes(term);
        const matchCriterion = (e.criterionName || "").toLowerCase().includes(term);
        const matchReporter = (e.reportedByName || "").toLowerCase().includes(term);
        const matchNote = (e.note || "").toLowerCase().includes(term);
        if (!matchStudent && !matchCriterion && !matchReporter && !matchNote) return false;
      }
      return true;
    });
  }, [entries, filterStudentId, searchTerm]);

  // Thống kê vi phạm theo từng học sinh trong lớp (Nội bộ GVCN)
  const studentViolationSummaries = useMemo(() => {
    const map = new Map<string, { student: StudentRow; count: number; totalMinus: number; violations: string[] }>();

    for (const student of students) {
      map.set(student.id, { student, count: 0, totalMinus: 0, violations: [] });
    }

    for (const entry of approvedEntries) {
      if (entry.scope === "student" && entry.studentIds && entry.studentIds.length > 0) {
        for (const sid of entry.studentIds) {
          const cur = map.get(sid);
          if (cur) {
            cur.count += 1;
            const pts = Number(entry.unitPoints) || 0;
            if (pts < 0) cur.totalMinus += Math.abs(pts);
            cur.violations.push(`${entry.criterionName} (${entry.occurredDate})`);
          }
        }
      }
    }

    const list = Array.from(map.values());
    // Sắp xếp học sinh có số lần vi phạm nhiều nhất lên đầu
    list.sort((a, b) => b.totalMinus - a.totalMinus || b.count - a.count);
    return list;
  }, [students, approvedEntries]);

  // Dữ liệu biểu đồ phân bố vi phạm theo nhóm lỗi
  const categoryChartData = useMemo(() => {
    let klCount = 0;
    let htCount = 0;
    let gcCount = 0;

    for (const entry of approvedEntries) {
      if (entry.category === "ky_luat") klCount += entry.quantity || 1;
      else if (entry.category === "hoc_tap") htCount += entry.quantity || 1;
      else if (entry.category === "ghi_chu") gcCount += entry.quantity || 1;
    }

    return [
      { name: "Kỷ luật", "Số lượt": klCount, fill: "#ef4444" },
      { name: "Học tập", "Số lượt": htCount, fill: "#3b82f6" },
      { name: "Ghi chú & Nề nếp", "Số lượt": gcCount, fill: "#10b981" },
    ];
  }, [approvedEntries]);

  // Dữ liệu biểu đồ xu hướng điểm qua các tuần
  const weeklyTrendsChartData = useMemo(() => {
    const list: { name: string; "Điểm chốt": number; "Điểm cộng": number; "Điểm trừ": number }[] = [];
    // Sắp xếp các tuần từ nhỏ đến lớn
    const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);

    for (const w of sortedWeeks) {
      const score = allWeekScores.find((s) => s.weekId === w.id && s.classId === activeClassId);
      if (score) {
        list.push({
          name: `T${w.weekNumber}`,
          "Điểm chốt": score.finalScore,
          "Điểm cộng": score.totalPlus,
          "Điểm trừ": score.totalMinus,
        });
      } else {
        list.push({
          name: `T${w.weekNumber}`,
          "Điểm chốt": 600,
          "Điểm cộng": 0,
          "Điểm trừ": 0,
        });
      }
    }

    return list.slice(-8); // Lấy 8 tuần gần nhất
  }, [weeks, allWeekScores, activeClassId]);

  // GỬI KHIẾU NẠI CHO PHIẾU VI PHẠM
  async function handleSendAppeal() {
    if (!appealModalEntry) return;

    if (appealReason.trim().length < 5) {
      toast.error("Vui lòng nhập lý do phản hồi chi tiết (ít nhất 5 ký tự).");
      return;
    }

    setIsSubmittingAppeal(true);
    try {
      const result = await submitDisciplineAppeal({
        entryId: appealModalEntry.id,
        reason: appealReason.trim(),
        evidenceUrls: appealEvidenceUrl.trim() ? [appealEvidenceUrl.trim()] : [],
      });

      toast.success(result.message || "Đã gửi khiếu nại thành công! Ban Thi đua sẽ xem xét phản hồi.");
      setAppealModalEntry(null);
      setAppealReason("");
      setAppealEvidenceUrl("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi gửi khiếu nại: " + msg);
    } finally {
      setIsSubmittingAppeal(false);
    }
  }

  // XUẤT EXCEL BẢNG ĐIỂM LỚP MÌNH
  function handleExportExcel() {
    if (!currentClass || !currentWeek) {
      toast.error("Chưa có thông tin lớp hoặc tuần để xuất Excel.");
      return;
    }

    // Nhóm 33 tiêu chí
    const criteriaSummary = DEFAULT_DISCIPLINE_CRITERIA.map((crit) => {
      const matching = approvedEntries.filter((e) => e.criterionCode === crit.code);
      let qty = 0;
      let pts = 0;
      const studentNames: string[] = [];

      for (const m of matching) {
        qty += m.quantity || 1;
        pts += m.totalPoints || 0;
        if (m.studentNamesText) studentNames.push(m.studentNamesText);
      }

      return {
        criterionId: crit.code,
        criterionCode: crit.code,
        criterionName: crit.name,
        category: crit.category,
        unitPoints: crit.defaultPoints,
        quantity: qty,
        totalPoints: pts,
        studentNamesText: studentNames.join("; "),
      };
    });

    exportHomeroomDisciplineExcel({
      schoolYearName: currentYear?.name || currentYear?.code || "2026-2027",
      weekNumber: currentWeek.weekNumber,
      className: currentClass.name || currentClass.code || "Lớp",
      isLocked: Boolean(isWeekLocked),
      isSigned: Boolean(activeApproval),
      approvalData: activeApproval
        ? {
            approvalId: activeApproval.id,
            version: activeApproval.version,
            signerName: activeApproval.signerName,
            signerEmail: activeApproval.signerEmail,
            signedAt: activeApproval.signedAt ? formatDate(activeApproval.signedAt) : "",
            contentHashSha256: activeApproval.contentHashSha256,
          }
        : null,
      criteriaSummary,
      allEntries: approvedEntries.map((e) => ({
        id: e.id,
        occurredDate: e.occurredDate,
        period: e.period,
        studentNamesText: e.studentNamesText,
        criterionCode: e.criterionCode,
        criterionName: e.criterionName,
        category: e.category,
        totalPoints: e.totalPoints,
        reportedByName: e.reportedByName,
        reviewedByName: e.reviewedByName,
        status: e.status,
        note: e.note,
      })),
      finalScore: kpiStats.finalScore,
      totalPlus: kpiStats.totalPlus,
      totalMinus: kpiStats.totalMinus,
      basePoints: 600,
    });

    toast.success("Đã xuất file Excel bảng điểm thi đua thành công!");
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh", "giaovien", "totruong"]}>
      <Shell>
        <div className="space-y-6 pb-20">
          {/* HEADER TRANG */}
          <PageHeader
            eyebrow="Giáo viên chủ nhiệm"
            title={`Kỷ luật & Thi đua: Lớp ${currentClass?.name || "Chủ nhiệm"}`}
            description="Theo dõi điểm thi đua, học sinh vi phạm của lớp mình; gửi khiếu nại phản hồi khi phát hiện sai sót và xuất Excel bảng điểm theo phân quyền."
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={!currentClass || !currentWeek}
                  className="gap-2 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Xuất Excel ({isWeekLocked ? "Chính thức" : "Tạm tính"})
                </Button>
              </div>
            }
          />

          {/* KIỂM TRA PHÂN CÔNG CHỦ NHIỆM */}
          {checkingHomeroom ? (
            <Card className="p-8 text-center space-y-3">
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
            </Card>
          ) : homeroomClasses.length === 0 ? (
            <Card className="p-8 text-center border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
              <GraduationCap className="h-12 w-12 text-amber-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-foreground">Bạn chưa được phân công chủ nhiệm lớp nào</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                Tài khoản giáo viên của bạn hiện chưa được gắn làm Giáo viên chủ nhiệm (GVCN) của lớp nào trong năm học này.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="secondary" onClick={() => router.push("/teacher/dashboard")}>
                  Về trang tổng quan
                </Button>
              </div>
            </Card>
          ) : (
            <>
              {/* THANH CHỌN LỚP CHỦ NHIỆM & TUẦN THI ĐUA */}
              <Card className="p-4 border">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    {/* CHỌN LỚP NẾU CHỦ NHIỆM NHIỀU LỚP HOẶC ADMIN */}
                    {homeroomClasses.length > 1 && (
                      <div>
                        <Label htmlFor="hrClassSelect" className="text-xs font-semibold">Lớp chủ nhiệm</Label>
                        <select
                          id="hrClassSelect"
                          value={activeClassId}
                          onChange={(e) => setActiveClassId(e.target.value)}
                          className="mt-1 block w-44 rounded-xl border border-input bg-background px-3 py-2 text-xs font-bold text-primary focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          {homeroomClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              Lớp {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* CHỌN TUẦN THI ĐUA */}
                    <div>
                      <Label htmlFor="hrWeekSelect" className="text-xs font-semibold">Tuần thi đua</Label>
                      <select
                        id="hrWeekSelect"
                        value={selectedWeekId}
                        onChange={(e) => setSelectedWeekId(e.target.value)}
                        className="mt-1 block w-48 rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary"
                      >
                        {weeks.map((w) => (
                          <option key={w.id} value={w.id}>
                            Tuần {w.weekNumber} {w.status === "locked" ? "🔒 (Khóa sổ)" : "(Đang mở)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* THÔNG TIN TRẠNG THÁI BẢNG ĐIỂM */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {isWeekLocked ? (
                      <Badge tone="success">
                        🔒 KẾT QUẢ CHÍNH THỨC (ĐÃ KHÓA SỔ)
                      </Badge>
                    ) : activeApproval ? (
                      <Badge tone="success">
                        ✍️ ĐÃ KÝ XÁC NHẬN (v{activeApproval.version})
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        ⏳ BẢNG ĐIỂM TẠM TÍNH (CHƯA CHỐT)
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>

              {/* 8 THẺ KPI THỐNG KÊ DASHBOARD */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. TỔNG ĐIỂM */}
                <Card className="p-3.5 border bg-primary/5 border-primary/20 text-center">
                  <div className="text-[11px] font-bold text-primary uppercase">Tổng điểm tuần</div>
                  <div className="text-3xl font-black text-primary mt-1">{kpiStats.finalScore}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Điểm gốc: 600đ</div>
                </Card>

                {/* 2. ĐIỂM CỘNG */}
                <Card className="p-3.5 border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 text-center">
                  <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Tổng điểm cộng</div>
                  <div className="text-3xl font-black text-emerald-600 mt-1">+{kpiStats.totalPlus}</div>
                  <div className="text-[10px] text-emerald-700/80 mt-0.5">{kpiStats.rewardCount} lượt khen thưởng</div>
                </Card>

                {/* 3. ĐIỂM TRỪ */}
                <Card className="p-3.5 border bg-red-50/50 dark:bg-red-950/20 border-red-200 text-center">
                  <div className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase">Tổng điểm trừ</div>
                  <div className="text-3xl font-black text-red-600 mt-1">-{kpiStats.totalMinus}</div>
                  <div className="text-[10px] text-red-700/80 mt-0.5">{kpiStats.violationCount} lượt vi phạm</div>
                </Card>

                {/* 4. THỨ HẠNG */}
                <Card className="p-3.5 border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 text-center">
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase flex items-center justify-center gap-1">
                    <Trophy className="h-3.5 w-3.5" />
                    Hạng khối {currentClass?.grade}
                  </div>
                  <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">{kpiStats.gradeRank}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{isWeekLocked ? "Chính thức" : "Tạm tính"}</div>
                </Card>

                {/* 5. SỐ LƯỢT VI PHẠM */}
                <Card className="p-3 border text-center">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase">Số lượt vi phạm</div>
                  <div className="text-xl font-bold text-foreground mt-1">{kpiStats.violationCount}</div>
                </Card>

                {/* 6. SỐ HỌC SINH VI PHẠM */}
                <Card className="p-3 border text-center">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase">Học sinh vi phạm</div>
                  <div className="text-xl font-bold text-foreground mt-1">{kpiStats.violatorStudentCount} bạn</div>
                </Card>

                {/* 7. LƯỢT KHEN THƯỞNG */}
                <Card className="p-3 border text-center">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase">Lượt cộng điểm</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">{kpiStats.rewardCount} lượt</div>
                </Card>

                {/* 8. TRẠNG THÁI BẢNG ĐIỂM */}
                <Card className="p-3 border text-center">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase">Hồ sơ chữ ký</div>
                  <div className="text-xs font-bold text-foreground mt-1.5">
                    {activeApproval ? `Đã ký (v${activeApproval.version})` : "Bản tạm tính"}
                  </div>
                </Card>
              </div>

              {/* BIỂU ĐỒ TRỰC QUAN (RECHARTS) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BIỂU ĐỒ 1: XU HƯỚNG ĐIỂM THI ĐUA QUA CÁC TUẦN */}
                <Card className="p-4 border space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-bold text-xs text-foreground uppercase">
                      Xu hướng điểm thi đua qua các tuần
                    </h3>
                    <span className="text-[11px] text-muted-foreground">Mốc chuẩn: 600 điểm</span>
                  </div>
                  <div className="h-56 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyTrendsChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis domain={["auto", "auto"]} fontSize={11} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="Điểm chốt" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* BIỂU ĐỒ 2: PHÂN BỐ CÁC NHÓM VI PHẠM */}
                <Card className="p-4 border space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-bold text-xs text-foreground uppercase">
                      Số lượt vi phạm theo nhóm lỗi (Tuần {currentWeek?.weekNumber})
                    </h3>
                  </div>
                  <div className="h-56 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis allowDecimals={false} fontSize={11} />
                        <Tooltip />
                        <Bar dataKey="Số lượt" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {/* THANH ĐIỀU HƯỚNG TAB: VI PHẠM CHI TIẾT / THEO DÕI HỌC SINH / KHIẾU NẠI */}
              <div className="flex border-b text-xs font-semibold gap-4">
                <button
                  onClick={() => setActiveTab("violations")}
                  className={cn(
                    "pb-2.5 transition-all border-b-2 flex items-center gap-1.5",
                    activeTab === "violations"
                      ? "border-primary text-primary font-bold"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ListChecks className="h-4 w-4" />
                  Danh sách vi phạm tuần ({entries.length})
                </button>

                <button
                  onClick={() => setActiveTab("students_summary")}
                  className={cn(
                    "pb-2.5 transition-all border-b-2 flex items-center gap-1.5",
                    activeTab === "students_summary"
                      ? "border-primary text-primary font-bold"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Users className="h-4 w-4" />
                  Theo dõi học sinh trong lớp ({students.length})
                </button>

                <button
                  onClick={() => setActiveTab("appeals")}
                  className={cn(
                    "pb-2.5 transition-all border-b-2 flex items-center gap-1.5",
                    activeTab === "appeals"
                      ? "border-primary text-primary font-bold"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <MessageSquareWarning className="h-4 w-4" />
                  Lịch sử phản hồi / khiếu nại ({appeals.length})
                </button>
              </div>

              {/* TAB 1: DANH SÁCH VI PHẠM CỦA LỚP */}
              {activeTab === "violations" && (
                <div className="space-y-3">
                  {/* BỘ LỌC TÌM KIẾM HỌC SINH TRONG LỚP */}
                  <Card className="p-3">
                    <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                      <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Tìm học sinh, lỗi, người ghi..."
                          className="pl-8 text-xs"
                        />
                      </div>

                      <div className="w-full sm:w-64">
                        <select
                          value={filterStudentId}
                          onChange={(e) => setFilterStudentId(e.target.value)}
                          className="w-full text-xs rounded-xl border border-input bg-background px-3 py-2 font-medium focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          <option value="all">Tất cả đối tượng</option>
                          <option value="collective">Chỉ lỗi tập thể lớp</option>
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.studentCode} - {s.fullName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </Card>

                  {/* BẢNG CHI TIẾT VI PHẠM */}
                  {filteredEntries.length === 0 ? (
                    <Card className="p-8">
                      <EmptyState
                        icon={<CheckCircle2 className="h-8 w-8 text-emerald-600" />}
                        title="Không có phiếu vi phạm nào"
                        description="Tuyệt vời! Lớp không có phiếu vi phạm nào phù hợp với bộ lọc trong tuần này."
                      />
                    </Card>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredEntries.map((item) => (
                        <Card key={item.id} className="p-3.5 border hover:shadow-sm transition-all space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-foreground">
                                {item.occurredDate} {item.period ? `(Tiết ${item.period})` : ""}
                              </span>
                              <span className="text-muted-foreground text-xs">•</span>
                              <Badge tone={item.category === "ky_luat" ? "danger" : item.category === "hoc_tap" ? "info" : "neutral"}>
                                {disciplineCategoryLabels[item.category] || item.category}
                              </Badge>
                              <Badge tone={item.status === "approved" ? "success" : item.status === "pending" ? "warning" : "danger"}>
                                {item.status === "approved" ? "Đã duyệt" : item.status === "pending" ? "Chờ duyệt" : item.status}
                              </Badge>
                              {item.hasPendingAppeal && (
                                <Badge tone="warning">Đang khiếu nại</Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <span
                                className={cn(
                                  "font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg",
                                  item.totalPoints < 0
                                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                                )}
                              >
                                {item.totalPoints > 0 ? `+${item.totalPoints}` : item.totalPoints} đ
                              </span>

                              {/* NÚT KHIẾU NẠI DÀNH CHO GVCN */}
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={item.hasPendingAppeal}
                                onClick={() => {
                                  setAppealModalEntry(item);
                                  setAppealReason("");
                                  setAppealEvidenceUrl("");
                                }}
                                className="h-7 text-xs gap-1 text-amber-700 hover:text-amber-800"
                              >
                                <MessageSquareWarning className="h-3 w-3" />
                                {item.hasPendingAppeal ? "Đang xử lý khiếu nại" : "Phản hồi / Khiếu nại"}
                              </Button>
                            </div>
                          </div>

                          <div className="text-xs space-y-1">
                            <div className="font-semibold text-foreground">
                              [{item.criterionCode || "—"}] {item.criterionName}
                            </div>
                            <div className="text-muted-foreground">
                              <strong>Học sinh:</strong>{" "}
                              <span className="text-foreground font-medium">
                                {item.scope === "student" ? item.studentNamesText : "Tập thể lớp"}
                              </span>
                            </div>
                            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
                              <span>Người ghi: {item.reportedByName}</span>
                              {item.reviewedByName && <span>• Người duyệt: {item.reviewedByName}</span>}
                              {item.attachmentUrls && item.attachmentUrls.length > 0 && (
                                <>
                                  <span>•</span>
                                  <a
                                    href={item.attachmentUrls[0]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Xem ảnh minh chứng
                                  </a>
                                </>
                              )}
                            </div>
                            {item.note && (
                              <div className="p-2 rounded bg-muted/40 italic text-muted-foreground mt-1">
                                "{item.note}"
                              </div>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: THỐNG KÊ HỌC SINH TRONG LỚP (NỘI BỘ GVCN) */}
              {activeTab === "students_summary" && (
                <Card className="overflow-hidden border">
                  <div className="p-3 bg-muted/30 border-b flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">
                      Theo dõi số lượt vi phạm theo từng học sinh lớp {currentClass?.name} (Tuần {currentWeek?.weekNumber})
                    </span>
                    <span className="text-muted-foreground italic text-[11px]">
                      * Dữ liệu nội bộ chỉ dành riêng cho GVCN quản lý, không công khai bêu tên học sinh.
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/50 border-b font-bold text-muted-foreground uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5 w-12 text-center">STT</th>
                          <th className="p-2.5 w-24">Mã HS</th>
                          <th className="p-2.5 min-w-[160px]">Họ và tên học sinh</th>
                          <th className="p-2.5 w-24 text-center">Số lượt vi phạm</th>
                          <th className="p-2.5 w-24 text-right">Tổng điểm trừ</th>
                          <th className="p-2.5 min-w-[240px]">Chi tiết các lỗi trong tuần</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {studentViolationSummaries.map((item, index) => (
                          <tr key={item.student.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-2.5 text-center text-muted-foreground">{index + 1}</td>
                            <td className="p-2.5 font-mono font-semibold">{item.student.studentCode}</td>
                            <td className="p-2.5 font-medium text-foreground">{item.student.fullName}</td>
                            <td className="p-2.5 text-center font-bold">
                              {item.count > 0 ? (
                                <Badge tone="warning">{item.count} lượt</Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold">
                              {item.totalMinus > 0 ? (
                                <span className="text-red-600">-{item.totalMinus}đ</span>
                              ) : (
                                <span className="text-muted-foreground">0đ</span>
                              )}
                            </td>
                            <td className="p-2.5 text-muted-foreground">
                              {item.violations.length > 0 ? (
                                item.violations.join("; ")
                              ) : (
                                <span className="text-emerald-600 italic">Không có vi phạm</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* TAB 3: DANH SÁCH PHẢN HỒI / KHIẾU NẠI ĐÃ GỬI */}
              {activeTab === "appeals" && (
                <div className="space-y-3">
                  {appeals.length === 0 ? (
                    <Card className="p-8">
                      <EmptyState
                        icon={<MessageSquare className="h-8 w-8 text-muted-foreground" />}
                        title="Chưa có phản hồi khiếu nại nào"
                        description="Lớp chưa có khiếu nại hoặc phản hồi nào được gửi lên Ban Thi đua."
                      />
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {appeals.map((appeal) => (
                        <Card key={appeal.id} className="p-4 border space-y-2">
                          <div className="flex items-center justify-between border-b pb-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-bold text-foreground">Khiếu nại phiếu vi phạm: {appeal.entryId}</span>
                              <Badge
                                tone={
                                  appeal.status === "approved"
                                    ? "success"
                                    : appeal.status === "rejected"
                                      ? "danger"
                                      : "warning"
                                }
                              >
                                {appeal.status === "approved"
                                  ? "Chấp thuận"
                                  : appeal.status === "rejected"
                                    ? "Từ chối"
                                    : "Chờ xử lý"}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              Người gửi: {appeal.teacherName}
                            </span>
                          </div>

                          <div className="text-xs space-y-1">
                            <div>
                              <strong>Nội dung phản hồi của GVCN:</strong>
                              <p className="mt-0.5 p-2 rounded bg-muted/40 text-foreground italic">
                                "{appeal.reason}"
                              </p>
                            </div>

                            {appeal.evidenceUrls && appeal.evidenceUrls.length > 0 && (
                              <div className="pt-1">
                                <a
                                  href={appeal.evidenceUrls[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline font-semibold inline-flex items-center gap-1 text-[11px]"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Minh chứng khiếu nại
                                </a>
                              </div>
                            )}

                            {/* KẾT QUẢ GIẢI QUYẾT TỪ BAN THI ĐUA */}
                            {appeal.resolutionNote && (
                              <div className="p-2.5 rounded-lg border bg-muted/30 mt-2 space-y-1">
                                <div className="font-semibold text-foreground flex items-center justify-between">
                                  <span>Ý kiến giải quyết từ Ban Thi đua ({appeal.resolvedByName || "Người duyệt"}):</span>
                                </div>
                                <p className="text-muted-foreground font-medium">
                                  {appeal.resolutionNote}
                                </p>
                              </div>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* MODAL GỬI PHẢN HỒI / KHIẾU NẠI CHO PHIẾU VI PHẠM */}
          {appealModalEntry && (
            <Modal
              open={Boolean(appealModalEntry)}
              onOpenChange={(open) => {
                if (!open) {
                  setAppealModalEntry(null);
                  setAppealReason("");
                  setAppealEvidenceUrl("");
                }
              }}
              title={`Khiếu nại phiếu vi phạm: Lớp ${appealModalEntry.className}`}
            >
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl border bg-muted/30 space-y-1">
                  <div className="font-bold text-foreground">
                    [{appealModalEntry.criterionCode}] {appealModalEntry.criterionName}
                  </div>
                  <div className="text-muted-foreground">
                    Học sinh: <strong className="text-foreground">{appealModalEntry.studentNamesText || "Tập thể lớp"}</strong> • Ngày: {appealModalEntry.occurredDate} • Điểm: {appealModalEntry.totalPoints}đ
                  </div>
                </div>

                <div>
                  <Label htmlFor="appealReasonInput" className="font-bold text-xs text-foreground">
                    Lý do khiếu nại / phản hồi của GVCN *
                  </Label>
                  <textarea
                    id="appealReasonInput"
                    rows={3}
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    placeholder="Nêu rõ lý do sai sót (VD: Học sinh có phép đã được GVCN duyệt, đã được đính chính trong sổ đầu bài...)"
                    className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="appealEvidenceInput" className="font-bold text-xs text-foreground">
                    Link minh chứng đính kèm (nếu có)
                  </Label>
                  <Input
                    id="appealEvidenceInput"
                    value={appealEvidenceUrl}
                    onChange={(e) => setAppealEvidenceUrl(e.target.value)}
                    placeholder="https://drive.google.com/... hoặc link ảnh xác nhận"
                    className="text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="secondary"
                    disabled={isSubmittingAppeal}
                    onClick={() => setAppealModalEntry(null)}
                  >
                    Hủy bỏ
                  </Button>
                  <Button
                    variant="primary"
                    disabled={isSubmittingAppeal || appealReason.trim().length < 5}
                    onClick={handleSendAppeal}
                    className="gap-1.5 shadow-sm bg-primary text-white"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isSubmittingAppeal ? "Đang gửi..." : "Gửi khiếu nại cho Ban Thi đua"}
                  </Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      </Shell>
    </RoleGuard>
  );
}

export default function HomeroomDisciplinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center p-12 text-center text-muted-foreground">
          Đang tải dữ liệu Kỷ luật & Thi đua lớp chủ nhiệm...
        </div>
      }
    >
      <HomeroomDisciplineContent />
    </Suspense>
  );
}
