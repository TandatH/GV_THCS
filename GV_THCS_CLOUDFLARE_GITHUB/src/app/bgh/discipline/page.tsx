"use client";

import {
  AlertCircle,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileCheck,
  FileSpreadsheet,
  Filter,
  History,
  Info,
  Layers,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  Unlock,
  UserCheck,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
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
import {
  exportSchoolDisciplineExcel,
  type SchoolwideClassRankingItem,
} from "@/lib/exports/discipline-excel";
import {
  lockWeeklyDiscipline,
  reopenWeeklyDiscipline,
  verifyWeeklyDisciplineSignature,
} from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { cn, formatDate } from "@/lib/utils";

type ClassRow = DocumentData & {
  id: string;
  name?: string;
  code?: string;
  grade?: number | string;
  gradeLevel?: number | string;
  schoolLevel?: string;
  homeroomTeacherId?: string;
};

type WeekRow = DocumentData & {
  id: string;
  name?: string;
  weekNumber: number;
  schoolYearId: string;
  schoolLevel?: string;
  status?: string;
  isLocked?: boolean;
};

type TeacherRow = DocumentData & {
  id: string;
  fullName?: string;
  name?: string;
};

type SnapshotRow = DocumentData & {
  id: string;
  weekId: string;
  classId: string;
  version: number;
  snapshotHash: string;
  totalScore: number;
  totalPlus: number;
  totalMinus: number;
  finalScore: number;
  criteriaRows?: any[];
  approvedEntryIds?: string[];
  createdAt?: any;
};

type ApprovalRow = DocumentData & {
  id: string;
  weekId: string;
  classId: string;
  version: number;
  status: "draft" | "signed" | "locked" | "superseded";
  signerUid: string;
  signerName: string;
  snapshotHash: string;
  signedAt?: any;
  isLocked?: boolean;
};

type SignerAssignmentRow = DocumentData & {
  id: string;
  weekId: string;
  classId: string;
  signerUid: string;
  signerName: string;
};

type EntryRow = DocumentData & {
  id: string;
  weekId: string;
  classId: string;
  status: string;
  points: number;
  category: string;
  criterionCode?: string;
};

type AppealRow = DocumentData & {
  id: string;
  entryId: string;
  classId: string;
  status: "pending" | "approved" | "rejected";
};

function isSecondaryClass(row: ClassRow): boolean {
  if (row.schoolLevel === "primary") return false;
  if (row.schoolLevel === "secondary") return true;
  const grade = Number(row.grade ?? row.gradeLevel ?? String(row.name || row.code || "").match(/\d+/)?.[0]);
  return !(Number.isFinite(grade) && grade >= 1 && grade <= 5);
}

export default function BghDisciplinePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center"><Skeleton className="h-40 w-full" /></div>}>
      <BghDisciplineContent />
    </Suspense>
  );
}

function BghDisciplineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, role, claims } = useAuth();

  const [loading, setLoading] = useState(true);
  const [schoolYears, setSchoolYears] = useState<{ id: string; name: string }[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachersMap, setTeachersMap] = useState<Record<string, string>>({});

  // Dữ liệu thời gian thực
  const [approvalsMap, setApprovalsMap] = useState<Record<string, ApprovalRow>>({});
  const [snapshotsMap, setSnapshotsMap] = useState<Record<string, SnapshotRow>>({});
  const [signerAssignmentsMap, setSignerAssignmentsMap] = useState<Record<string, SignerAssignmentRow>>({});
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);

  // Bộ lọc
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal Mở khóa tuần (Reopen)
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenTargetClass, setReopenTargetClass] = useState<ClassRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);

  // Modal Xem lịch sử phiên bản snapshot
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyClass, setHistoryClass] = useState<ClassRow | null>(null);
  const [versionHistoryList, setVersionHistoryList] = useState<SnapshotRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal Xác minh chữ ký SHA-256
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<{ className: string; approval: ApprovalRow } | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok?: boolean; match?: boolean; message?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Thao tác khóa tuần
  const [lockingWeek, setLockingWeek] = useState(false);

  // 1. TẢI DANH MỤC NỀN (NĂM HỌC, GIÁO VIÊN, LỚP HỌC)
  useEffect(() => {
    async function loadInitial() {
      try {
        const [sySnap, tSnap, cSnap] = await Promise.all([
          getDocs(query(collection(firestore, "schoolYears"))),
          getDocs(query(collection(firestore, "teachers"))),
          getDocs(query(collection(firestore, "classes"))),
        ]);

        const syList = sySnap.docs.map((d) => ({
          id: d.id,
          name: (d.data().name as string) || (d.data().code as string) || d.id,
        }));
        setSchoolYears(syList);

        const defaultYear = syList[0]?.id || "";
        setSelectedYearId(defaultYear);

        const tMap: Record<string, string> = {};
        tSnap.docs.forEach((d) => {
          const dat = d.data();
          tMap[d.id] = (dat.fullName || dat.name || "Chưa rõ") as string;
        });
        setTeachersMap(tMap);

        const cList = cSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ClassRow))
          .filter(isSecondaryClass);
        cList.sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi", { numeric: true }));
        setClasses(cList);
      } catch (err) {
        console.error("Lỗi tải danh mục ban đầu:", err);
        toast.error("Không thể tải danh mục năm học hoặc lớp học.");
      }
    }
    loadInitial();
  }, []);

  // 2. TẢI DANH SÁCH TUẦN THI ĐUA KHI CHỌN NĂM HỌC
  useEffect(() => {
    if (!selectedYearId) return;

    async function loadWeeks() {
      try {
        const wSnap = await getDocs(
          query(collection(firestore, "disciplineWeeks"), where("schoolYearId", "==", selectedYearId))
        );
        const wList = wSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as WeekRow))
          .filter((week) => (week.schoolLevel || "secondary") === "secondary");
        wList.sort((a, b) => (b.weekNumber || 0) - (a.weekNumber || 0));
        setWeeks(wList);

        if (wList.length > 0) {
          const urlWeek = searchParams.get("weekId");
          const found = wList.find((w) => w.id === urlWeek);
          setSelectedWeekId(found ? found.id : wList[0].id);
        } else {
          setSelectedWeekId("");
        }
      } catch (err) {
        console.error("Lỗi tải tuần thi đua:", err);
      }
    }
    loadWeeks();
  }, [selectedYearId, searchParams]);

  // 3. ĐĂNG KÝ LISTENER REALTIME CHO TUẦN ĐƯỢC CHỌN
  useEffect(() => {
    if (!selectedWeekId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // a. Approvals (Bản tổng kết đã ký)
    const qAppr = query(collection(firestore, "disciplineWeeklyApprovals"), where("weekId", "==", selectedWeekId));
    const unsubAppr = onSnapshot(qAppr, (snap) => {
      const map: Record<string, ApprovalRow> = {};
      snap.docs.forEach((d) => {
        const dat = d.data() as ApprovalRow;
        // Ưu tiên bản mới nhất chưa superseded
        if (dat.status !== "superseded" || !map[dat.classId]) {
          map[dat.classId] = { ...dat, id: d.id };
        }
      });
      setApprovalsMap(map);
    });

    // b. Snapshots (Bản snapshot điểm 33 tiêu chí)
    const qSnap = query(collection(firestore, "disciplineWeeklySnapshots"), where("weekId", "==", selectedWeekId));
    const unsubSnap = onSnapshot(qSnap, (snap) => {
      const map: Record<string, SnapshotRow> = {};
      snap.docs.forEach((d) => {
        const dat = d.data() as SnapshotRow;
        if (!map[dat.classId] || dat.version > (map[dat.classId]?.version || 0)) {
          map[dat.classId] = { ...dat, id: d.id };
        }
      });
      setSnapshotsMap(map);
    });

    // c. Signer Assignments (Phân công người ký)
    const qSigners = query(collection(firestore, "disciplineWeeklySignerAssignments"), where("weekId", "==", selectedWeekId));
    const unsubSigners = onSnapshot(qSigners, (snap) => {
      const map: Record<string, SignerAssignmentRow> = {};
      snap.docs.forEach((d) => {
        const dat = d.data() as SignerAssignmentRow;
        map[dat.classId] = { ...dat, id: d.id };
      });
      setSignerAssignmentsMap(map);
    });

    // d. Entries (Toàn bộ phiếu vi phạm trong tuần)
    const qEntries = query(collection(firestore, "disciplineEntries"), where("weekId", "==", selectedWeekId));
    const unsubEntries = onSnapshot(qEntries, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as EntryRow));
      setEntries(list);
    });

    // e. Appeals (Khiếu nại trong tuần)
    const qAppeals = query(collection(firestore, "disciplineAppeals"));
    const unsubAppeals = onSnapshot(qAppeals, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppealRow));
      setAppeals(list);
      setLoading(false);
    });

    return () => {
      unsubAppr();
      unsubSnap();
      unsubSigners();
      unsubEntries();
      unsubAppeals();
    };
  }, [selectedWeekId]);

  const currentWeek = useMemo(() => weeks.find((w) => w.id === selectedWeekId) || null, [weeks, selectedWeekId]);
  const currentYear = useMemo(() => schoolYears.find((y) => y.id === selectedYearId) || null, [schoolYears, selectedYearId]);

  const isWeekLocked = Boolean(currentWeek?.status === "locked" || currentWeek?.isLocked);
  const secondaryClassIds = useMemo(() => new Set(classes.map((row) => row.id)), [classes]);

  // 4. TÍNH TOÁN BẢNG XẾP HẠNG VÀ TIẾN ĐỘ TỔNG KẾT
  const classesProgressList = useMemo(() => {
    return classes.map((cls) => {
      const grade = cls.grade || (cls.name ? parseInt(cls.name.replace(/\D/g, "")[0], 10) : 6) || 6;
      const approval = approvalsMap[cls.id];
      const snapshot = snapshotsMap[cls.id];
      const signerAssignment = signerAssignmentsMap[cls.id];

      // Tính điểm trực tiếp từ entries hoặc từ snapshot nếu đã ký
      let basePoints = 600;
      let totalPlus = 0;
      let totalMinus = 0;
      let finalScore = 600;

      if (snapshot) {
        totalPlus = snapshot.totalPlus || 0;
        totalMinus = snapshot.totalMinus || 0;
        finalScore = snapshot.finalScore ?? snapshot.totalScore ?? 600;
      } else {
        const clsEntries = entries.filter((e) => e.classId === cls.id && e.status === "approved");
        for (const e of clsEntries) {
          if (e.points > 0) totalPlus += e.points;
          else if (e.points < 0) totalMinus += Math.abs(e.points);
        }
        finalScore = basePoints + totalPlus - totalMinus;
      }

      const isSigned = Boolean(approval && (approval.status === "signed" || approval.status === "locked"));
      const isClassLocked = isWeekLocked || Boolean(approval?.status === "locked");

      const homeroomTeacherName = cls.homeroomTeacherId ? teachersMap[cls.homeroomTeacherId] || "Chưa phân công" : "Chưa phân công";

      return {
        classId: cls.id,
        className: cls.name || cls.code || cls.id,
        grade,
        homeroomTeacherId: cls.homeroomTeacherId,
        homeroomTeacherName,
        assignedSignerName: signerAssignment?.signerName || "Chưa phân công",
        assignedSignerUid: signerAssignment?.signerUid,
        approval,
        snapshot,
        isSigned,
        isLocked: isClassLocked,
        version: snapshot?.version || approval?.version || 1,
        contentHashSha256: snapshot?.snapshotHash || approval?.snapshotHash || "",
        signerName: approval?.signerName,
        signedAt: approval?.signedAt ? formatDate(approval.signedAt.toDate ? approval.signedAt.toDate() : approval.signedAt) : undefined,
        basePoints,
        totalPlus,
        totalMinus,
        finalScore,
      };
    });
  }, [classes, approvalsMap, snapshotsMap, signerAssignmentsMap, entries, isWeekLocked, teachersMap]);

  // Sắp xếp thứ hạng toàn trường
  const rankedClasses = useMemo(() => {
    const list = [...classesProgressList];
    list.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (a.totalMinus !== b.totalMinus) return a.totalMinus - b.totalMinus;
      return a.className.localeCompare(b.className, "vi", { numeric: true });
    });
    return list.map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [classesProgressList]);

  // Bộ lọc khối & tìm kiếm
  const filteredRankedClasses = useMemo(() => {
    return rankedClasses.filter((cls) => {
      if (selectedGrade !== "all" && String(cls.grade) !== String(selectedGrade)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = cls.className.toLowerCase().includes(q);
        const matchTeacher = cls.homeroomTeacherName.toLowerCase().includes(q);
        if (!matchName && !matchTeacher) return false;
      }
      return true;
    });
  }, [rankedClasses, selectedGrade, searchQuery]);

  // KPI THỐNG KÊ TOÀN TRƯỜNG
  const kpiStats = useMemo(() => {
    const totalClasses = classes.length;
    const finalizedCount = classesProgressList.filter((c) => c.isSigned).length;
    const unfinalizedCount = totalClasses - finalizedCount;
    const lockedCount = isWeekLocked ? totalClasses : classesProgressList.filter((c) => c.isLocked).length;

    let totalViolations = 0;
    let totalSchoolPlus = 0;
    let totalSchoolMinus = 0;

    entries.forEach((e) => {
      if (!secondaryClassIds.has(e.classId)) return;
      if (e.status === "approved") {
        totalViolations += 1;
        if (e.points > 0) totalSchoolPlus += e.points;
        else if (e.points < 0) totalSchoolMinus += Math.abs(e.points);
      }
    });

    const pendingAppealsCount = appeals.filter((a) => secondaryClassIds.has(a.classId) && a.status === "pending").length;

    return {
      totalClasses,
      finalizedCount,
      unfinalizedCount,
      lockedCount,
      totalViolations,
      totalSchoolPlus,
      totalSchoolMinus,
      pendingAppealsCount,
    };
  }, [classes.length, classesProgressList, isWeekLocked, entries, appeals, secondaryClassIds]);

  // BIỂU ĐỒ SO SÁNH ĐIỂM TRUNG BÌNH CÁC KHỐI
  const gradeChartData = useMemo(() => {
    const grades = [6, 7, 8, 9];
    return grades.map((g) => {
      const clsInGrade = rankedClasses.filter((c) => Number(c.grade) === g);
      if (clsInGrade.length === 0) return { grade: `Khối ${g}`, avgScore: 600, classCount: 0 };
      const sum = clsInGrade.reduce((acc, cur) => acc + cur.finalScore, 0);
      return {
        grade: `Khối ${g}`,
        avgScore: Math.round((sum / clsInGrade.length) * 10) / 10,
        classCount: clsInGrade.length,
      };
    });
  }, [rankedClasses]);

  // THAO TÁC KHÓA SỔ TUẦN THI ĐUA
  async function handleLockWeek() {
    if (!currentWeek) return;
    if (kpiStats.unfinalizedCount > 0) {
      toast.error(`Cấp 2 còn ${kpiStats.unfinalizedCount} lớp chưa ký xác nhận. Phải ký đủ trước khi khóa tuần.`);
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn khóa sổ tuần ${currentWeek.weekNumber}? Sau khi khóa, kết quả toàn trường Cấp 2 sẽ trở thành chính thức.`)) {
      return;
    }

    setLockingWeek(true);
    try {
      const res = await lockWeeklyDiscipline({ weekId: currentWeek.id });
      if (res.ok) {
        toast.success((res as any).message || "Đã khóa sổ tuần thi đua thành công.");
      } else {
        toast.error((res as any).message || "Không thể khóa sổ tuần.");
      }
    } catch (err: any) {
      console.error("Lỗi khóa sổ:", err);
      toast.error(err.message || "Lỗi khi thực hiện khóa sổ.");
    } finally {
      setLockingWeek(false);
    }
  }

  // THAO TÁC MỞ KHÓA TUẦN (REOPEN)
  async function handleExecuteReopen() {
    if (!currentWeek || !reopenTargetClass) return;
    if (reopenReason.trim().length < 5) {
      toast.error("Vui lòng nhập lý do mở khóa có ít nhất 5 ký tự.");
      return;
    }

    setReopening(true);
    try {
      const res = await reopenWeeklyDiscipline({
        weekId: currentWeek.id,
        classId: reopenTargetClass.id,
        reason: reopenReason.trim(),
      });
      if (res.ok) {
        toast.success((res as any).message || "Đã mở khóa thành công. Bản cũ chuyển sang superseded và yêu cầu ký lại.");
        setReopenModalOpen(false);
        setReopenReason("");
        setReopenTargetClass(null);
      } else {
        toast.error((res as any).message || "Không thể mở khóa.");
      }
    } catch (err: any) {
      console.error("Lỗi mở khóa:", err);
      toast.error(err.message || "Lỗi xử lý mở khóa.");
    } finally {
      setReopening(false);
    }
  }

  // THAO TÁC XEM LỊCH SỬ PHIÊN BẢN SNAPSHOT
  async function handleOpenVersionHistory(cls: ClassRow) {
    if (!currentWeek) return;
    setHistoryClass(cls);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const snapQuery = query(
        collection(firestore, "disciplineWeeklySnapshots"),
        where("weekId", "==", currentWeek.id),
        where("classId", "==", cls.id),
        orderBy("version", "desc")
      );
      const snaps = await getDocs(snapQuery);
      const list = snaps.docs.map((d) => ({ id: d.id, ...d.data() } as SnapshotRow));
      setVersionHistoryList(list);
    } catch (err) {
      console.error("Lỗi tải lịch sử snapshot:", err);
      toast.error("Không thể tải lịch sử phiên bản của lớp.");
    } finally {
      setLoadingHistory(false);
    }
  }

  // THAO TÁC XÁC MINH MÃ BĂM SHA-256
  async function handleOpenVerifyHash(clsName: string, approval: ApprovalRow) {
    setVerifyTarget({ className: clsName, approval });
    setVerifyResult(null);
    setVerifyModalOpen(true);
    setVerifying(true);
    try {
      const res = await verifyWeeklyDisciplineSignature({
        approvalId: approval.id,
        expectedHash: approval.snapshotHash,
      });
      setVerifyResult(res);
    } catch (err: any) {
      console.error("Lỗi xác minh băm:", err);
      setVerifyResult({ ok: false, match: false, message: err.message || "Lỗi kiểm tra tính toàn vẹn." });
    } finally {
      setVerifying(false);
    }
  }

  // XUẤT BÁO CÁO EXCEL TOÀN TRƯỜNG
  function handleExportExcelAllSchool() {
    if (!currentWeek) {
      toast.error("Vui lòng chọn tuần thi đua để xuất báo cáo.");
      return;
    }

    const rankingPayload: SchoolwideClassRankingItem[] = rankedClasses.map((item) => ({
      rank: item.rank,
      grade: item.grade,
      classId: item.classId,
      className: item.className,
      homeroomTeacherName: item.homeroomTeacherName,
      basePoints: item.basePoints,
      totalPlus: item.totalPlus,
      totalMinus: item.totalMinus,
      finalScore: item.finalScore,
      assignedSignerName: item.assignedSignerName,
      signerName: item.signerName,
      signedAt: item.signedAt,
      version: item.version,
      isSigned: item.isSigned,
      isLocked: item.isLocked,
      contentHashSha256: item.contentHashSha256,
    }));

    exportSchoolDisciplineExcel({
      schoolYearName: currentYear?.name || "2026-2027",
      semesterName: "Học kỳ I",
      weekNumber: currentWeek.weekNumber,
      isWeekLocked,
      classesRanking: rankingPayload,
    });

    toast.success("Đã khởi tạo và tải xuống file Excel báo cáo thi đua toàn trường.");
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <div className="space-y-6">
          {/* HEADER CHÍNH */}
          <PageHeader
            title="Tổng quan Thi đua Toàn trường"
            description="Bảng điều hành Ban Giám hiệu: Theo dõi tiến độ ký xác nhận, kiểm soát tính toàn vẹn SHA-256, xếp hạng thi đua và khóa sổ toàn trường."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportExcelAllSchool}
                  disabled={classesProgressList.length === 0}
                  className="gap-2"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  Xuất Excel toàn trường
                </Button>
                {isWeekLocked ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (!currentWeek) return;
                      setReopenTargetClass({ id: "all", name: "Toàn trường" });
                      setReopenModalOpen(true);
                    }}
                    className="gap-2"
                  >
                    <Unlock className="h-4 w-4" />
                    Mở khóa tuần
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleLockWeek}
                    loading={lockingWeek}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Lock className="h-4 w-4" />
                    Khóa sổ tuần thi đua
                  </Button>
                )}
              </div>
            }
          />

          {/* BỘ CHỌN NĂM HỌC VÀ TUẦN */}
          <Card className="p-4 bg-muted/20 border">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Năm học:</span>
                  <select
                    className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium focus:ring-1 focus:ring-primary"
                    value={selectedYearId}
                    onChange={(e) => setSelectedYearId(e.target.value)}
                  >
                    {schoolYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Tuần thi đua:</span>
                  <select
                    className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium focus:ring-1 focus:ring-primary"
                    value={selectedWeekId}
                    onChange={(e) => setSelectedWeekId(e.target.value)}
                  >
                    {weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        Tuần {w.weekNumber} {w.status === "locked" ? "(🔒 Đã khóa)" : "(Đang mở)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* TRẠNG THÁI KHÓA SỔ */}
              <div className="flex items-center gap-2">
                {isWeekLocked ? (
                  <Badge tone="success">
                    🔒 TUẦN ĐÃ KHÓA SỔ (CHÍNH THỨC)
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    ⏳ TUẦN ĐANG MỞ (TẠM TÍNH)
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {/* 7 THẺ KPI TỔNG KẾT TOÀN TRƯỜNG */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <Card className="p-3 text-center border bg-card">
              <div className="text-[11px] font-bold text-muted-foreground uppercase">Tổng số lớp</div>
              <div className="text-2xl font-black mt-1">{kpiStats.totalClasses}</div>
              <div className="text-[10px] text-muted-foreground">Toàn trường</div>
            </Card>

            <Card className="p-3 text-center border bg-emerald-500/5 border-emerald-500/20">
              <div className="text-[11px] font-bold text-emerald-600 uppercase">Đã ký xác nhận</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">{kpiStats.finalizedCount}</div>
              <div className="text-[10px] text-emerald-600/80">Có chữ ký số</div>
            </Card>

            <Card className="p-3 text-center border bg-amber-500/5 border-amber-500/20">
              <div className="text-[11px] font-bold text-amber-600 uppercase">Chưa ký</div>
              <div className="text-2xl font-black text-amber-600 mt-1">{kpiStats.unfinalizedCount}</div>
              <div className="text-[10px] text-amber-600/80">Cần đôn đốc</div>
            </Card>

            <Card className="p-3 text-center border bg-blue-500/5 border-blue-500/20">
              <div className="text-[11px] font-bold text-blue-600 uppercase">Đã khóa sổ</div>
              <div className="text-2xl font-black text-blue-600 mt-1">{kpiStats.lockedCount}</div>
              <div className="text-[10px] text-blue-600/80">Đóng băng điểm</div>
            </Card>

            <Card className="p-3 text-center border bg-rose-500/5 border-rose-500/20">
              <div className="text-[11px] font-bold text-rose-600 uppercase">Lượt vi phạm</div>
              <div className="text-2xl font-black text-rose-600 mt-1">{kpiStats.totalViolations}</div>
              <div className="text-[10px] text-rose-600/80">Điểm trừ: -{kpiStats.totalSchoolMinus}</div>
            </Card>

            <Card className="p-3 text-center border bg-emerald-500/5 border-emerald-500/20">
              <div className="text-[11px] font-bold text-emerald-700 uppercase">Điểm cộng (+)</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">+{kpiStats.totalSchoolPlus}</div>
              <div className="text-[10px] text-emerald-700/80">Khen thưởng</div>
            </Card>

            <Card className="p-3 text-center border bg-purple-500/5 border-purple-500/20">
              <div className="text-[11px] font-bold text-purple-600 uppercase">Khiếu nại chờ</div>
              <div className="text-2xl font-black text-purple-600 mt-1">{kpiStats.pendingAppealsCount}</div>
              <div className="text-[10px] text-purple-600/80">Cần giải quyết</div>
            </Card>
          </div>

          {/* BIỂU ĐỒ SO SÁNH ĐIỂM TRUNG BÌNH CÁC KHỐI */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-4 lg:col-span-2 border">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-sm">Điểm trung bình thi đua theo từng khối</div>
                <div className="text-xs text-muted-foreground">Tuần {currentWeek?.weekNumber}</div>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradeChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="avgScore" name="Điểm trung bình" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 border">
              <div className="font-bold text-sm mb-3">Top 3 Lớp Dẫn Đầu Toàn Trường</div>
              <div className="space-y-3">
                {rankedClasses.slice(0, 3).map((item, idx) => (
                  <div key={item.classId} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                        idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-200 text-slate-700" : "bg-orange-100 text-orange-700"
                      )}>
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{item.className}</div>
                        <div className="text-xs text-muted-foreground">GVCN: {item.homeroomTeacherName}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black text-primary">{item.finalScore} đ</div>
                      <div className="text-[11px] text-muted-foreground">+{item.totalPlus} / -{item.totalMinus}</div>
                    </div>
                  </div>
                ))}
                {rankedClasses.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground">Chưa có dữ liệu xếp hạng</div>
                )}
              </div>
            </Card>
          </div>

          {/* BẢNG TIẾN ĐỘ TỔNG KẾT & QUẢN LÝ KÝ / KHÓA SỔ TỪNG LỚP */}
          <Card className="p-4 border">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-base">Tiến độ Ký xác nhận & Quản lý Khóa sổ từng lớp</h3>
                <p className="text-xs text-muted-foreground">Đối chiếu mã băm SHA-256 bảo đảm nguyên bản, mở khóa tuần khi có điều chỉnh</p>
              </div>

              {/* BỘ LỌC KHỐI VÀ TÌM KIẾM */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <select
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                  >
                    <option value="all">Tất cả khối</option>
                    <option value="6">Khối 6</option>
                    <option value="7">Khối 7</option>
                    <option value="8">Khối 8</option>
                    <option value="9">Khối 9</option>
                  </select>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Tìm tên lớp, GVCN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-2.5 rounded-lg border border-border bg-background text-xs w-48 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredRankedClasses.length === 0 ? (
              <EmptyState
                icon={<AlertCircle className="h-8 w-8" />}
                title="Không tìm thấy lớp học"
                description="Không có lớp nào phù hợp với bộ lọc khối hoặc từ khóa tìm kiếm."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3 w-14 text-center">Hạng</th>
                      <th className="py-2.5 px-3">Lớp & Khối</th>
                      <th className="py-2.5 px-3">GVCN</th>
                      <th className="py-2.5 px-3">Người tổng kết</th>
                      <th className="py-2.5 px-3 text-center">Cộng / Trừ</th>
                      <th className="py-2.5 px-3 text-center">Điểm tuần</th>
                      <th className="py-2.5 px-3">Trạng thái ký</th>
                      <th className="py-2.5 px-3">Mã SHA-256</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredRankedClasses.map((item) => (
                      <tr key={item.classId} className="hover:bg-muted/30 transition">
                        <td className="py-2.5 px-3 text-center font-bold">
                          <span className={cn(
                            "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs",
                            item.rank === 1 ? "bg-amber-100 text-amber-800 font-black" :
                            item.rank === 2 ? "bg-slate-200 text-slate-800" :
                            item.rank === 3 ? "bg-orange-100 text-orange-800" : "text-muted-foreground"
                          )}>
                            {item.rank}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {item.className}
                          <span className="block text-[10px] text-muted-foreground font-normal">Khối {item.grade}</span>
                        </td>
                        <td className="py-2.5 px-3">{item.homeroomTeacherName}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{item.assignedSignerName}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-emerald-600 font-semibold">+{item.totalPlus}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-rose-600 font-semibold">-{item.totalMinus}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-sm text-primary">
                          {item.finalScore}
                        </td>
                        <td className="py-2.5 px-3">
                          {item.isLocked ? (
                            <Badge tone="success">🔒 Đã khóa sổ</Badge>
                          ) : item.isSigned ? (
                            <Badge tone="success">✍️ Đã ký (v{item.version})</Badge>
                          ) : (
                            <Badge tone="warning">⏳ Chưa ký</Badge>
                          )}
                          {item.signedAt && (
                            <span className="block text-[10px] text-muted-foreground mt-0.5">{item.signedAt}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px]">
                          {item.contentHashSha256 ? (
                            <button
                              onClick={() => {
                                if (item.approval) {
                                  handleOpenVerifyHash(item.className, item.approval);
                                } else {
                                  navigator.clipboard.writeText(item.contentHashSha256);
                                  toast.success("Đã sao chép mã SHA-256!");
                                }
                              }}
                              className="text-primary hover:underline flex items-center gap-1"
                              title="Bấm để kiểm tra tính toàn vẹn SHA-256"
                            >
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                              {item.contentHashSha256.substring(0, 10)}...{item.contentHashSha256.substring(58)}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Nút xem lịch sử phiên bản */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleOpenVersionHistory({ id: item.classId, name: item.className })}
                              title="Lịch sử các phiên bản bảng điểm"
                            >
                              <History className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>

                            {/* Nút Mở khóa tuần cho lớp */}
                            {item.isSigned && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 px-2 text-xs text-amber-700 hover:bg-amber-50"
                                onClick={() => {
                                  setReopenTargetClass({ id: item.classId, name: item.className });
                                  setReopenModalOpen(true);
                                }}
                                title="Yêu cầu mở khóa để điều chỉnh và ký lại"
                              >
                                <Unlock className="h-3.5 w-3.5 text-amber-600 mr-1" />
                                Mở khóa
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* MODAL MỞ KHÓA TUẦN (REOPEN DISCIPLINE) */}
          <Modal
            open={reopenModalOpen}
            onOpenChange={setReopenModalOpen}
            title={`Mở khóa tuần thi đua: ${reopenTargetClass?.name || ""}`}
            description="Khi mở khóa, bản tổng kết cũ sẽ chuyển trạng thái 'superseded'. Dữ liệu cần được điều chỉnh và ký xác nhận lại (tạo phiên bản mới v+1)."
          >
            <div className="space-y-4">
              <div>
                <Label>Lý do mở khóa (Bắt buộc tối thiểu 5 ký tự)</Label>
                <textarea
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  rows={3}
                  placeholder="Ví dụ: Điều chỉnh theo khiếu nại của GVCN về tiết chào cờ; cập nhật điểm thi đua theo quyết định BGH..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Hành động này được ghi nhận nhật ký kiểm toán (Audit Log) chống gian lận. Người mở khóa chịu trách nhiệm về tính xác thực của lý do điều chỉnh.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setReopenModalOpen(false)}>
                  Hủy bỏ
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleExecuteReopen}
                  loading={reopening}
                  disabled={reopenReason.trim().length < 5}
                >
                  Xác nhận mở khóa
                </Button>
              </div>
            </div>
          </Modal>

          {/* MODAL XEM LỊCH SỬ PHIÊN BẢN SNAPSHOT */}
          <Modal
            open={historyModalOpen}
            onOpenChange={setHistoryModalOpen}
            title={`Lịch sử phiên bản bảng điểm: ${historyClass?.name || ""}`}
            description="Danh sách các bản snapshot thi đua đã từng ký xác nhận trong tuần này."
          >
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : versionHistoryList.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Lớp này chưa có bản snapshot nào được ký.
                </div>
              ) : (
                <div className="space-y-3">
                  {versionHistoryList.map((snap) => (
                    <div key={snap.id} className="p-3 rounded-xl border bg-card space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-primary">Phiên bản v{snap.version}</span>
                        <span className="text-xs text-muted-foreground">
                          {snap.createdAt ? formatDate(snap.createdAt.toDate ? snap.createdAt.toDate() : snap.createdAt) : ""}
                        </span>
                      </div>
                      <div className="text-xs">
                        Điểm tổng kết: <span className="font-bold text-foreground">{snap.finalScore ?? snap.totalScore}</span> (Cộng: +{snap.totalPlus} / Trừ: -{snap.totalMinus})
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground break-all">
                        SHA-256: {snap.snapshotHash}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>

          {/* MODAL XÁC MINH CHỮ KÝ SHA-256 */}
          <Modal
            open={verifyModalOpen}
            onOpenChange={setVerifyModalOpen}
            title="Xác minh tính toàn vẹn SHA-256"
            description={`Kiểm tra tính nguyên bản của bản snapshot lớp ${verifyTarget?.className || ""}`}
          >
            <div className="space-y-4">
              <div className="p-3 bg-muted/40 rounded-xl space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Người ký xác nhận: </span>
                  <span className="font-semibold">{verifyTarget?.approval.signerName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Phiên bản: </span>
                  <span className="font-semibold">v{verifyTarget?.approval.version}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Mã SHA-256 lưu trữ: </span>
                  <div className="font-mono text-[11px] break-all text-primary bg-background p-2 rounded border mt-1">
                    {verifyTarget?.approval.snapshotHash}
                  </div>
                </div>
              </div>

              {verifying ? (
                <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  Đang tái tính toán mã băm SHA-256 từ snapshot gốc tại máy chủ tin cậy...
                </div>
              ) : verifyResult ? (
                <div className={cn(
                  "p-3 rounded-xl border text-xs flex items-start gap-2",
                  verifyResult.match
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-800"
                )}>
                  {verifyResult.match ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {verifyResult.match ? "CHỨNG THỰC NGUYÊN BẢN THÀNH CÔNG" : "CẢNH BÁO: SAI LỆCH MÃ BĂM"}
                    </div>
                    <div className="mt-0.5">{verifyResult.message || "Dữ liệu snapshot hoàn toàn trùng khớp 100% với chữ ký điện tử đã lưu trữ."}</div>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setVerifyModalOpen(false)}>
                  Đóng
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </Shell>
    </RoleGuard>
  );
}
