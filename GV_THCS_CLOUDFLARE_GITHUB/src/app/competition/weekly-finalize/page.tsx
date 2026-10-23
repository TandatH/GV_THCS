"use client";

import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  History,
  Info,
  KeyRound,
  Layers,
  ListChecks,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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
import { toast } from "sonner";
import {
  DEFAULT_DISCIPLINE_CRITERIA,
  disciplineCategories,
  disciplineCategoryLabels,
  type DisciplineCategory,
  type DisciplineCriterion,
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
  signWeeklyDisciplineScore,
  verifyWeeklyDisciplineSignature,
} from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { cn, formatDate } from "@/lib/utils";

type OptionRow = DocumentData & { id: string; name?: string; code?: string; grade?: number | string; gradeLevel?: number | string; schoolLevel?: string; homeroomTeacherId?: string };
type WeekRow = DocumentData & { id: string; weekNumber: number; schoolYearId: string; schoolLevel?: string; status?: string };
type EntryRow = DocumentData & {
  id: string;
  criterionId: string;
  criterionCode: string;
  criterionName: string;
  category: DisciplineCategory;
  unitPoints: number;
  quantity: number;
  totalPoints: number;
  scope: "student" | "class";
  studentNamesText?: string;
  occurredDate: string;
  period?: number;
  note?: string;
  status: string;
  reportedByName: string;
  reviewedByName?: string;
};
type SignerAssignmentRow = DocumentData & {
  id: string;
  assignedSignerUid: string;
  assignedSignerName: string;
  assignedSignerEmail: string;
  isActive?: boolean;
};
type ApprovalRow = DocumentData & {
  id: string;
  version: number;
  status: string;
  signerUid: string;
  signerName: string;
  signerEmail: string;
  contentHashSha256: string;
  signedAt?: { seconds: number; nanoseconds: number } | string;
  snapshot?: {
    finalScore: number;
    totalPlus: number;
    totalMinus: number;
    basePoints: number;
  };
};

function isSecondaryClass(row: OptionRow): boolean {
  if (row.schoolLevel === "primary") return false;
  if (row.schoolLevel === "secondary") return true;
  const grade = Number(row.grade ?? row.gradeLevel ?? String(row.name || row.code || "").match(/\d+/)?.[0]);
  return !(Number.isFinite(grade) && grade >= 1 && grade <= 5);
}

function WeeklyFinalizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryWeekId = searchParams.get("weekId");
  const queryClassId = searchParams.get("classId");
  const { user, role, claims } = useAuth();
  const [isCompetitionMember, setIsCompetitionMember] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsCompetitionMember(false);
      return;
    }
    const hasClaim = Boolean(
      claims?.isCompetitionCommittee ||
      claims?.isCompetitionHead ||
      claims?.isDisciplineHead ||
      ["competition_committee", "competition_head", "discipline_and_competition_head"].includes(claims?.disciplineRole as string)
    );
    if (hasClaim) {
      setIsCompetitionMember(true);
      return;
    }

    const q = query(
      collection(firestore, "disciplineAssignments"),
      where("userUid", "==", user.uid),
      where("isActive", "==", true),
    );
    getDocs(q).then((snap) => {
      const match = snap.docs.some((d) =>
        ["competition_committee", "competition_head", "discipline_and_competition_head"].includes(String(d.data().roleType || ""))
      );
      setIsCompetitionMember(match);
    }).catch(() => setIsCompetitionMember(false));
  }, [user, claims]);

  // Danh mục
  const [schoolYears, setSchoolYears] = useState<OptionRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [classes, setClasses] = useState<OptionRow[]>([]);
  const [criteria, setCriteria] = useState<any[]>(DEFAULT_DISCIPLINE_CRITERIA);

  // Lựa chọn hiện tại
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // Nhận tham số URL nếu có
  useEffect(() => {
    if (queryWeekId) setSelectedWeekId(queryWeekId);
  }, [queryWeekId]);

  useEffect(() => {
    if (queryClassId) setSelectedClassId(queryClassId);
  }, [queryClassId]);

  // Dữ liệu lớp trong tuần
  const [loadingEntries, setLoadingEntries] = useState<boolean>(true);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [signerAssignment, setSignerAssignment] = useState<SignerAssignmentRow | null>(null);
  const [activeApproval, setActiveApproval] = useState<ApprovalRow | null>(null);

  // Modal ký xác nhận
  const [isSignModalOpen, setIsSignModalOpen] = useState<boolean>(false);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [signConfirmChecked, setSignConfirmChecked] = useState<boolean>(false);

  // Modal xác minh chữ ký SHA-256
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyResult, setVerifyResult] = useState<{
    isValid: boolean;
    storedHash: string;
    message: string;
  } | null>(null);

  // 1. TẢI DANH MỤC NỀN
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const [sySnap, clsSnap, critSnap] = await Promise.all([
          getDocs(query(collection(firestore, "schoolYears"), where("isActive", "==", true))),
          getDocs(query(collection(firestore, "classes"), where("isActive", "==", true))),
          getDocs(collection(firestore, "disciplineCriteria")),
        ]);

        const syRows = sySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
        setSchoolYears(syRows);
        if (syRows.length > 0 && !selectedSchoolYearId) {
          setSelectedSchoolYearId(syRows[0].id);
        }

        const allClsRows = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
        allClsRows.sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi", { numeric: true }));
        setClasses(allClsRows);
        const firstSecondary = allClsRows.find(isSecondaryClass);
        if (allClsRows.length > 0 && (!selectedClassId || !allClsRows.some((row) => row.id === selectedClassId))) {
          setSelectedClassId(firstSecondary ? firstSecondary.id : allClsRows[0].id);
        }

        if (!critSnap.empty) {
          const critRows = critSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DisciplineCriterion[];
          critRows.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
          setCriteria(critRows);
        }
      } catch (err) {
        console.error("Lỗi tải metadata:", err);
      }
    }
    fetchMetadata();
  }, []);

  // 2. TẢI DANH SÁCH TUẦN THEO NĂM HỌC
  useEffect(() => {
    if (!selectedSchoolYearId) {
      setWeeks([]);
      return;
    }
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
        if (!selectedWeekId || !rows.some((w) => w.id === selectedWeekId)) {
          setSelectedWeekId(rows[0].id);
        }
      } else {
        setSelectedWeekId("");
      }
    });
    return () => unsubWeeks();
  }, [selectedSchoolYearId]);

  // 3. TẢI PHIẾU VI PHẠM CỦA LỚP TRONG TUẦN
  useEffect(() => {
    if (!selectedWeekId || !selectedClassId) {
      setEntries([]);
      setLoadingEntries(false);
      return;
    }

    setLoadingEntries(true);
    const qEntries = query(
      collection(firestore, "disciplineEntries"),
      where("weekId", "==", selectedWeekId),
      where("classId", "==", selectedClassId),
    );

    const unsubEntries = onSnapshot(
      qEntries,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as EntryRow[];
        setEntries(rows);
        setLoadingEntries(false);
      },
      (err) => {
        console.error("Lỗi tải phiếu lớp:", err);
        setLoadingEntries(false);
      },
    );

    // Tải phân công người ký của lớp trong tuần
    const assignmentRef = doc(firestore, "disciplineWeeklySignerAssignments", `${selectedWeekId}_${selectedClassId}`);
    const unsubAssignment = onSnapshot(assignmentRef, (snap) => {
      if (snap.exists()) {
        setSignerAssignment({ id: snap.id, ...snap.data() } as SignerAssignmentRow);
      } else {
        setSignerAssignment(null);
      }
    });

    // Tải thông tin ký xác nhận mới nhất (Latest approval)
    const qApprovals = query(
      collection(firestore, "disciplineWeeklyApprovals"),
      where("weekId", "==", selectedWeekId),
      where("classId", "==", selectedClassId),
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

    return () => {
      unsubEntries();
      unsubAssignment();
      unsubApprovals();
    };
  }, [selectedWeekId, selectedClassId]);

  // Đối tượng tuần & lớp đang chọn
  const activeWeek = useMemo(() => weeks.find((w) => w.id === selectedWeekId), [weeks, selectedWeekId]);
  const activeClass = useMemo(() => classes.find((c) => c.id === selectedClassId), [classes, selectedClassId]);

  // Phân cấp Cấp 1 và Cấp 2
  const secondaryClasses = useMemo(() => classes.filter(isSecondaryClass), [classes]);
  const primaryClasses = useMemo(() => classes.filter((c) => !isSecondaryClass(c)), [classes]);
  const isCurrentClassSecondary = useMemo(() => (activeClass ? isSecondaryClass(activeClass) : true), [activeClass]);

  // Phân loại phiếu: Phiếu đã duyệt (approved), Phiếu chờ duyệt (pending), Phiếu bị từ chối/trả lại
  const approvedEntries = useMemo(() => entries.filter((e) => e.status === "approved"), [entries]);
  const pendingEntries = useMemo(() => entries.filter((e) => e.status === "pending"), [entries]);

  // Tổng hợp thống kê theo 33 tiêu chí
  const criteriaSummaryMap = useMemo(() => {
    const map = new Map<string, { count: number; points: number; students: string[]; notes: string[]; reviewers: string[] }>();

    for (const entry of approvedEntries) {
      const cId = entry.criterionId;
      const cur = map.get(cId) || { count: 0, points: 0, students: [], notes: [], reviewers: [] };
      cur.count += entry.quantity || 1;
      cur.points += entry.totalPoints || 0;
      if (entry.studentNamesText) cur.students.push(entry.studentNamesText);
      if (entry.note) cur.notes.push(entry.note);
      if (entry.reviewedByName) cur.reviewers.push(entry.reviewedByName);
      map.set(cId, cur);
    }

    return map;
  }, [approvedEntries]);

  // Tính điểm tổng kết
  const scoreStats = useMemo(() => {
    const basePoints = 600;
    let totalPlus = 0;
    let totalMinus = 0;

    for (const entry of approvedEntries) {
      const pts = Number(entry.totalPoints) || 0;
      if (pts > 0) totalPlus += pts;
      else if (pts < 0) totalMinus += Math.abs(pts);
    }

    const finalScore = basePoints + totalPlus - totalMinus;
    return { basePoints, totalPlus, totalMinus, finalScore };
  }, [approvedEntries]);

  const isHomeroomTeacher = useMemo(() => {
    if (!user || !activeClass?.homeroomTeacherId) return false;
    return claims?.teacherId === activeClass.homeroomTeacherId;
  }, [user, activeClass, claims]);

  // Kiểm tra quyền ký xác nhận của user hiện tại
  const canSign = useMemo(() => {
    // Lớp Cấp 1 tạm thời không tham gia thi đua và không cho phép ký
    if (!isCurrentClassSecondary) return false;
    if (!user) return false;
    // Admin hoặc BGH luôn có quyền
    if (role === "admin" || role === "bgh") return true;
    // Thành viên Ban Thi đua có quyền tổng kết & ký điểm
    if (isCompetitionMember) return true;
    // Người được phân công ký lớp này trong tuần
    if (signerAssignment && signerAssignment.assignedSignerUid === user.uid && signerAssignment.isActive !== false) {
      return true;
    }
    // Giáo viên chủ nhiệm của lớp
    if (isHomeroomTeacher) return true;
    return false;
  }, [user, role, signerAssignment, isCurrentClassSecondary, isCompetitionMember, isHomeroomTeacher]);

  const userSigningRoleLabel = useMemo(() => {
    if (role === "admin" || role === "bgh") return "Quản trị viên / BGH";
    if (isCompetitionMember) return "Thành viên Ban Thi đua";
    if (signerAssignment && signerAssignment.assignedSignerUid === user?.uid) return "Người được phân công tuần này";
    if (isHomeroomTeacher) return "Giáo viên chủ nhiệm";
    return "Giáo viên";
  }, [role, isCompetitionMember, signerAssignment, user?.uid, isHomeroomTeacher]);

  // THỰC HIỆN KÝ XÁC NHẬN BẢNG ĐIỂM
  async function handleConfirmSign() {
    if (!selectedWeekId || !selectedClassId) return;

    if (pendingEntries.length > 0) {
      toast.error(`Còn ${pendingEntries.length} phiếu vi phạm đang chờ duyệt. Cần duyệt hết trước khi ký.`);
      return;
    }

    setIsSigning(true);
    try {
      const result = await signWeeklyDisciplineScore({
        weekId: selectedWeekId,
        classId: selectedClassId,
      });

      toast.success(
        (result as any)?.message ||
          "Đã ký xác nhận thành công và tự động đồng bộ điểm thi đua sang BGH!",
      );
      setIsSignModalOpen(false);
      setSignConfirmChecked(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi ký xác nhận: " + msg);
    } finally {
      setIsSigning(false);
    }
  }

  // XÁC MINH CHỮ KÝ SỐ SHA-256 (VERIFY SIGNATURE)
  async function handleVerifySignature() {
    if (!activeApproval) return;
    setIsVerifying(true);
    try {
      const res = await verifyWeeklyDisciplineSignature({
        approvalId: activeApproval.id,
        expectedHash: activeApproval.contentHashSha256,
      });

      setVerifyResult({
        isValid: res.isValid,
        storedHash: activeApproval.contentHashSha256,
        message: (res as any)?.verificationMessage || (res.isValid ? "Chữ ký số hợp lệ 100%!" : "Dữ liệu có dấu hiệu bị thay đổi!"),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi xác minh chữ ký: " + msg);
    } finally {
      setIsVerifying(false);
    }
  }

  // Format timestamp helper
  function formatTimestamp(ts: unknown) {
    if (!ts) return "—";
    if (typeof ts === "object" && ts !== null && "seconds" in ts) {
      const d = new Date((ts as { seconds: number }).seconds * 1000);
      return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return String(ts);
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh", "giaovien", "totruong"]}>
      <Shell>
        <div className="space-y-6 pb-20">
          {/* HEADER TRANG */}
          <PageHeader
            eyebrow="Ban Thi đua"
            title="Tổng kết điểm & Ký xác nhận"
            description="Tổng hợp và ký xác nhận bắt buộc cho các lớp Cấp 2. Cấp 1 hiện chưa tham gia thi đua toàn trường."
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push("/competition/review")}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Duyệt phiếu vi phạm
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push("/competition/leaderboard")}
                  className="gap-2"
                >
                  <ListChecks className="h-4 w-4" />
                  Bảng xếp hạng tuần
                </Button>
              </div>
            }
          />

          {/* BỘ LỌC CHỌN TUẦN VÀ LỚP */}
          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* CHỌN NĂM HỌC */}
              <div>
                <Label htmlFor="schoolYearSelect" className="text-xs font-semibold">Năm học</Label>
                <select
                  id="schoolYearSelect"
                  value={selectedSchoolYearId}
                  onChange={(e) => setSelectedSchoolYearId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {schoolYears.map((sy) => (
                    <option key={sy.id} value={sy.id}>
                      {sy.name || sy.code}
                    </option>
                  ))}
                </select>
              </div>

              {/* CHỌN TUẦN THI ĐUA */}
              <div>
                <Label htmlFor="weekSelect" className="text-xs font-semibold">Tuần thi đua</Label>
                <select
                  id="weekSelect"
                  value={selectedWeekId}
                  onChange={(e) => setSelectedWeekId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {weeks.map((w) => (
                    <option key={w.id} value={w.id}>
                      Tuần {w.weekNumber} {w.status === "locked" ? "🔒 (Đã khóa sổ)" : "(Đang mở)"}
                    </option>
                  ))}
                </select>
              </div>

              {/* CHỌN LỚP */}
              <div>
                <Label htmlFor="classSelect" className="text-xs font-semibold">Lớp học</Label>
                <select
                  id="classSelect"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <optgroup label="Cấp 2 (THCS - Bắt buộc ký)">
                    {secondaryClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        Lớp {c.name}
                      </option>
                    ))}
                  </optgroup>
                  {primaryClasses.length > 0 && (
                    <optgroup label="Cấp 1 (Tiểu học - Tạm chưa thi đua)">
                      {primaryClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          Lớp {c.name} (Cấp 1 - Tạm khóa)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          </Card>

          {/* CẢNH BÁO NẾU ĐANG CHỌN LỚP CẤP 1 */}
          {!isCurrentClassSecondary && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm">
                  Lớp {activeClass?.name} thuộc Cấp 1 (Tiểu học) — Tạm thời chưa tham gia thi đua chung
                </div>
                <p>
                  Theo quy định hiện hành, bảng xếp hạng và quy trình ký duyệt thi đua tuần chỉ áp dụng bắt buộc đối với Cấp 2 (Khối 6–9). Các thao tác ký xác nhận đối với Cấp 1 đang được làm mờ và tạm khóa cho đến khi Nhà trường có yêu cầu kích hoạt.
                </p>
              </div>
            </div>
          )}

          {/* KHỐI TRẠNG THÁI CHỮ KÝ VÀ BẢNG ĐIỂM TỔNG KẾT */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* THẺ TỔNG ĐIỂM */}
            <Card className="p-4 border space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase">Tổng điểm thi đua</span>
                <Badge tone={scoreStats.finalScore >= 600 ? "success" : "warning"}>
                  Lớp {activeClass?.name} - Tuần {activeWeek?.weekNumber}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2 rounded-lg bg-muted/30 border">
                  <div className="text-[10px] text-muted-foreground font-semibold">ĐIỂM GỐC</div>
                  <div className="text-lg font-black text-foreground mt-0.5">+{scoreStats.basePoints}</div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200">
                  <div className="text-[10px] text-emerald-700 font-semibold">ĐIỂM CỘNG</div>
                  <div className="text-lg font-black text-emerald-600 mt-0.5">+{scoreStats.totalPlus}</div>
                </div>
                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200">
                  <div className="text-[10px] text-red-700 font-semibold">ĐIỂM TRỪ</div>
                  <div className="text-lg font-black text-red-600 mt-0.5">-{scoreStats.totalMinus}</div>
                </div>
              </div>

              <div className="pt-2 border-t flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">ĐIỂM CHỐT TUẦN:</span>
                <span className="font-mono font-black text-2xl text-primary">
                  {scoreStats.finalScore} điểm
                </span>
              </div>
            </Card>

            {/* THẺ TRẠNG THÁI XÁC NHẬN CHỮ KÝ */}
            <Card className="p-4 border space-y-3 md:col-span-2">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase">Hồ sơ ký xác nhận</span>
                </div>
                <div>
                  {!isCurrentClassSecondary ? (
                    <Badge tone="neutral">CẤP 1 (TẠM CHƯA THI ĐUA)</Badge>
                  ) : activeApproval ? (
                    <Badge tone="success">ĐÃ KÝ XÁC NHẬN (v{activeApproval.version})</Badge>
                  ) : (
                    <Badge tone="warning">BẢNG TẠM TÍNH (CHƯA KÝ)</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <div>
                    Người được phân công ký:{" "}
                    <strong className="text-foreground">
                      {signerAssignment?.assignedSignerName || "Chưa phân công (Admin/BGH ký)"}
                    </strong>
                  </div>
                  <div>
                    Người đã ký:{" "}
                    <strong className="text-foreground">
                      {activeApproval?.signerName || "Chưa có"}
                    </strong>
                  </div>
                  <div>
                    Thời điểm ký:{" "}
                    <strong className="text-foreground">
                      {formatTimestamp(activeApproval?.signedAt)}
                    </strong>
                  </div>
                </div>

                <div className="space-y-1">
                  <div>
                    Mã băm SHA-256 (Anti-tamper):
                  </div>
                  {activeApproval?.contentHashSha256 ? (
                    <div className="font-mono text-[10px] bg-muted/60 p-1.5 rounded border break-all text-foreground">
                      {activeApproval.contentHashSha256}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">Chưa tạo mã băm (Chờ ký)</span>
                  )}
                </div>
              </div>

              {/* NÚT THAO TÁC KÝ VÀ XÁC MINH */}
              <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {!isCurrentClassSecondary ? (
                    <span className="text-muted-foreground font-semibold flex items-center gap-1">
                      <Info className="h-3.5 w-3.5" />
                      Lớp Cấp 1: Chưa áp dụng thi đua và không bắt buộc ký.
                    </span>
                  ) : pendingEntries.length > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Còn {pendingEntries.length} phiếu chờ duyệt. Không thể ký.
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Đủ điều kiện ký xác nhận.
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {activeApproval && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleVerifySignature}
                      disabled={isVerifying}
                      className="gap-1.5 text-xs"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      {isVerifying ? "Đang xác minh..." : "Xác minh SHA-256"}
                    </Button>
                  )}

                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!canSign || pendingEntries.length > 0}
                    onClick={() => setIsSignModalOpen(true)}
                    title={!isCurrentClassSecondary ? "Lớp thuộc Cấp 1 - Tạm thời chưa tham gia thi đua" : undefined}
                    className={cn(
                      "gap-1.5 text-xs shadow-sm",
                      !isCurrentClassSecondary && "opacity-40 cursor-not-allowed hover:bg-primary"
                    )}
                  >
                    <FileCheck className="h-3.5 w-3.5" />
                    {!isCurrentClassSecondary
                      ? "Cấp 1 tạm chưa ký"
                      : activeApproval
                        ? "Ký lại phiên bản mới"
                        : "Ký xác nhận bảng điểm"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* KẾT QUẢ XÁC MINH CHỮ KÝ NẾU CÓ */}
          {verifyResult && (
            <div
              className={cn(
                "p-4 rounded-xl border flex items-start gap-3 text-xs animate-in fade-in",
                verifyResult.isValid
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 text-emerald-900 dark:text-emerald-200"
                  : "bg-red-50 dark:bg-red-950/30 border-red-300 text-red-900 dark:text-red-200",
              )}
            >
              {verifyResult.isValid ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold text-sm">
                  {verifyResult.isValid ? "Xác minh tính toàn vẹn thành công 100%" : "Cảnh báo sai lệch dữ liệu!"}
                </div>
                <p>{verifyResult.message}</p>
                <div className="font-mono text-[10px] break-all pt-1">
                  Mã hash: {verifyResult.storedHash}
                </div>
              </div>
            </div>
          )}

          {/* BẢNG ĐIỂM CHI TIẾT 33 TIÊU CHÍ (THEO MẪU EXCEL NHÀ TRƯỜNG) */}
          <Card className="overflow-hidden border">
            <div className="p-4 bg-muted/30 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Bảng chi tiết 33 tiêu chí thi đua - Lớp {activeClass?.name} (Tuần {activeWeek?.weekNumber})
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Được tính toán tự động từ các phiếu vi phạm đã được Ban Thi đua phê duyệt chính thức.
                </p>
              </div>

              <div className="text-right text-xs">
                <span className="text-muted-foreground">Số tiêu chí vi phạm: </span>
                <strong className="text-foreground">{criteriaSummaryMap.size} / 33</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b font-bold text-muted-foreground uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5 w-12 text-center">STT</th>
                    <th className="p-2.5 w-20">Mã</th>
                    <th className="p-2.5 min-w-[240px]">Nội dung tiêu chí thi đua</th>
                    <th className="p-2.5 w-24 text-center">Nhóm</th>
                    <th className="p-2.5 w-24 text-center">Định mức</th>
                    <th className="p-2.5 w-20 text-center">Số lượt</th>
                    <th className="p-2.5 min-w-[200px]">Học sinh vi phạm / Chi tiết</th>
                    <th className="p-2.5 w-24 text-right">Tổng điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {criteria.map((crit, index) => {
                    const sum = criteriaSummaryMap.get(crit.id);
                    const hasViolation = Boolean(sum && sum.count > 0);

                    return (
                      <tr
                        key={crit.id}
                        className={cn(
                          "transition-colors hover:bg-muted/20",
                          hasViolation && (crit.defaultPoints < 0 ? "bg-red-50/20 dark:bg-red-950/10" : "bg-emerald-50/20 dark:bg-emerald-950/10"),
                        )}
                      >
                        <td className="p-2.5 text-center font-medium text-muted-foreground">{index + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-foreground">{crit.code}</td>
                        <td className="p-2.5">
                          <div className="font-medium text-foreground">{crit.name}</div>
                        </td>
                        <td className="p-2.5 text-center">
                          <Badge tone={crit.category === "ky_luat" ? "danger" : crit.category === "hoc_tap" ? "info" : "neutral"}>
                            {disciplineCategoryLabels[crit.category as DisciplineCategory] || crit.category}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-center font-mono font-semibold">
                          {crit.defaultPoints > 0 ? `+${crit.defaultPoints}` : crit.defaultPoints}đ
                        </td>
                        <td className="p-2.5 text-center font-bold">
                          {hasViolation ? (
                            <span className="px-2 py-0.5 rounded bg-muted font-mono">{sum!.count}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2.5">
                          {hasViolation ? (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-foreground">
                                {sum!.students.length > 0 ? sum!.students.join("; ") : "Tập thể lớp"}
                              </div>
                              {sum!.notes.length > 0 && (
                                <div className="text-[11px] text-muted-foreground italic">
                                  {sum!.notes.join(" | ")}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Không có</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-sm">
                          {hasViolation ? (
                            <span className={sum!.points < 0 ? "text-red-600" : "text-emerald-600"}>
                              {sum!.points > 0 ? `+${sum!.points}` : sum!.points}đ
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-normal">0đ</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/60 border-t font-black text-xs">
                  <tr>
                    <td colSpan={7} className="p-3 text-right uppercase">
                      Tổng điểm tuần lớp {activeClass?.name} (600 + Điểm cộng - Điểm trừ):
                    </td>
                    <td className="p-3 text-right font-mono text-base text-primary">
                      {scoreStats.finalScore} điểm
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* MODAL KÝ XÁC NHẬN BẢNG ĐIỂM */}
          {isSignModalOpen && (
            <Modal
              open={isSignModalOpen}
              onOpenChange={(open) => {
                if (!open) {
                  setIsSignModalOpen(false);
                  setSignConfirmChecked(false);
                }
              }}
              title={`Ký xác nhận bảng điểm: Lớp ${activeClass?.name} (Tuần ${activeWeek?.weekNumber})`}
            >
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5">
                  <div className="font-bold text-sm text-primary flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" />
                    Xác nhận danh tính người ký số:
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>Họ và tên: <strong className="text-foreground">{user?.displayName || "Giáo viên"}</strong></div>
                    <div>Email: <strong className="text-foreground">{user?.email}</strong></div>
                    <div>Lớp ký nhận: <strong className="text-foreground">{activeClass?.name}</strong></div>
                    <div>Điểm chốt: <strong className="text-primary font-bold">{scoreStats.finalScore} điểm</strong></div>
                    <div>Vai trò ký: <strong className="text-foreground">{userSigningRoleLabel}</strong></div>
                    <div>Đồng bộ: <strong className="text-emerald-600 font-bold">Trực tiếp sang BGH</strong></div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border bg-muted/40 space-y-2 text-muted-foreground">
                  <p className="font-semibold text-foreground">Quy trình ký điện tử và đồng bộ hệ thống:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Dữ liệu 33 tiêu chí sẽ được đóng gói thành snapshot bất biến trên server.</li>
                    <li>Mã băm mật mã SHA-256 sẽ được tạo để chống can thiệp hoặc sửa đổi dữ liệu ngoài luồng.</li>
                    <li>Bảng điểm sau khi ký sẽ được tự động đồng bộ tức thời sang Ban Giám Hiệu (BGH) và Bảng xếp hạng.</li>
                  </ul>
                </div>

                <div className="pt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="confirmSignCheck"
                    checked={signConfirmChecked}
                    onChange={(e) => setSignConfirmChecked(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mt-0.5"
                  />
                  <Label htmlFor="confirmSignCheck" className="text-xs font-medium text-foreground cursor-pointer">
                    Tôi xác nhận đã kiểm tra kỹ toàn bộ điểm cộng, điểm trừ và các phiếu vi phạm của lớp {activeClass?.name} trong tuần {activeWeek?.weekNumber}. Tôi cam kết dữ liệu trên là hoàn toàn chính xác.
                  </Label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="secondary"
                    disabled={isSigning}
                    onClick={() => setIsSignModalOpen(false)}
                  >
                    Hủy bỏ
                  </Button>

                  <Button
                    variant="primary"
                    disabled={isSigning || !signConfirmChecked}
                    onClick={handleConfirmSign}
                    className="gap-1.5 shadow-sm bg-primary text-white"
                  >
                    <FileCheck className="h-4 w-4" />
                    {isSigning ? "Đang tạo mã băm & Ký số..." : "Xác nhận & Ký số"}
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

export default function WeeklyFinalizePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center p-12 text-center text-muted-foreground">
          Đang tải bảng tổng kết điểm thi đua tuần...
        </div>
      }
    >
      <WeeklyFinalizeContent />
    </Suspense>
  );
}
