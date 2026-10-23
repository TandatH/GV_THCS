"use client";

import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
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
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CURRENT_DISCIPLINE_WEEK,
  disciplineCategories,
  disciplineCategoryLabels,
  disciplineEntryStatuses,
  disciplineEntryStatusLabels,
  type DisciplineCategory,
  type DisciplineEntryStatus,
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
import { reviewDisciplineViolation } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { cn, formatDate } from "@/lib/utils";

type DisciplineRecord = DocumentData & {
  id: string;
  weekId: string;
  schoolYearId: string;
  classId: string;
  className: string;
  criterionId: string;
  criterionCode: string;
  criterionName: string;
  category: DisciplineCategory;
  unitType: "per_student" | "per_occurrence" | "per_unit";
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
  status: DisciplineEntryStatus;
  reportedByUid: string;
  reportedByName: string;
  reporterRole?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: { seconds: number; nanoseconds: number } | string | null;
  reviewNote?: string;
  createdAt?: { seconds: number; nanoseconds: number } | string | null;
  updatedAt?: { seconds: number; nanoseconds: number } | string | null;
};

type OptionRow = DocumentData & { id: string; name?: string; code?: string; isActive?: boolean; schoolLevel?: string; grade?: number | string; gradeLevel?: number | string };
type WeekRow = DocumentData & { id: string; weekNumber: number; schoolYearId: string; schoolLevel?: string; status?: string };

function isSecondaryClass(row: OptionRow): boolean {
  if (row.schoolLevel === "primary") return false;
  if (row.schoolLevel === "secondary") return true;
  const grade = Number(row.grade ?? row.gradeLevel ?? String(row.name || row.code || "").match(/\d+/)?.[0]);
  return !(Number.isFinite(grade) && grade >= 1 && grade <= 5);
}

export default function CompetitionReviewPage() {
  const router = useRouter();
  const { user, role } = useAuth();
  const canReviewEntries = role !== "bgh";

  // Quyền Ban Thi đua
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionChecking, setPermissionChecking] = useState<boolean>(true);

  // Metadata
  const [schoolYears, setSchoolYears] = useState<OptionRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [classes, setClasses] = useState<OptionRow[]>([]);

  // Dữ liệu phiếu
  const [loadingEntries, setLoadingEntries] = useState<boolean>(true);
  const [entries, setEntries] = useState<DisciplineRecord[]>([]);

  // Bộ lọc
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [activeTabStatus, setActiveTabStatus] = useState<DisciplineEntryStatus | "all">("pending");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Modal xem chi tiết
  const [viewingRecord, setViewingRecord] = useState<DisciplineRecord | null>(null);

  // Modal xử lý (Trả lại / Từ chối)
  const [actionRecord, setActionRecord] = useState<DisciplineRecord | null>(null);
  const [actionType, setActionType] = useState<"returned" | "rejected" | null>(null);
  const [actionNote, setActionNote] = useState<string>("");
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

  // 1. KIỂM TRA PHÂN QUYỀN BAN THI ĐUA
  useEffect(() => {
    async function checkPermission() {
      if (!user) return;
      setPermissionChecking(true);

      // Admin hoặc BGH mặc nhiên có quyền
      if (role === "admin" || role === "bgh") {
        setHasPermission(true);
        setPermissionChecking(false);
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult(true);
        const claims = tokenResult.claims;

        // Kiểm tra Custom Claims
        if (
          claims.isCompetitionCommittee === true ||
          claims.isDisciplineHead === true ||
          ["competition_committee", "discipline_and_competition_head"].includes(String(claims.disciplineRole || ""))
        ) {
          setHasPermission(true);
          setPermissionChecking(false);
          return;
        }

        // Kiểm tra Firestore Assignment
        const assignmentRefs = [
          doc(firestore, "disciplineAssignments", `${user.uid}_competition_committee`),
          doc(firestore, "disciplineAssignments", `${user.uid}_discipline_head`),
          doc(firestore, "disciplineAssignments", `${user.uid}_discipline_and_competition_head`),
        ];
        const assignmentSnaps = await Promise.all(assignmentRefs.map((ref) => getDoc(ref)));

        if (assignmentSnaps.some((snap) => snap.exists() && snap.data()?.isActive !== false)) {
          setHasPermission(true);
        } else {
          setHasPermission(false);
        }
      } catch (err) {
        console.error("Lỗi kiểm tra quyền Ban Thi đua:", err);
        setHasPermission(false);
      } finally {
        setPermissionChecking(false);
      }
    }

    checkPermission();
  }, [user, role]);

  // 2. TẢI DANH MỤC NỀN
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const [sySnap, clsSnap] = await Promise.all([
          getDocs(query(collection(firestore, "schoolYears"), where("isActive", "==", true))),
          getDocs(query(collection(firestore, "classes"), where("isActive", "==", true))),
        ]);

        const syRows = sySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
        setSchoolYears(syRows);
        if (syRows.length > 0 && !selectedSchoolYearId) {
          setSelectedSchoolYearId(syRows[0].id);
        }

        const clsRows = (clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[])
          .filter(isSecondaryClass);
        clsRows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setClasses(clsRows);
      } catch (err) {
        console.error("Lỗi tải danh mục:", err);
      }
    }
    fetchMetadata();
  }, []);

  // 3. TẢI DANH SÁCH TUẦN THEO NĂM HỌC
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
      if (!selectedWeekId || (selectedWeekId !== "all" && !rows.some((week) => week.id === selectedWeekId))) {
        setSelectedWeekId(
          rows.find((week) => week.weekNumber === CURRENT_DISCIPLINE_WEEK)?.id || rows[0]?.id || "all",
        );
      }
    });
    return () => unsubWeeks();
  }, [selectedSchoolYearId, selectedWeekId]);

  // 4. LẮNG NGHE DANH SÁCH PHIẾU VI PHẠM THEO NĂM HỌC
  useEffect(() => {
    if (!selectedSchoolYearId) {
      setEntries([]);
      setLoadingEntries(false);
      return;
    }

    setLoadingEntries(true);
    const qEntries = query(
      collection(firestore, "disciplineEntries"),
      where("schoolYearId", "==", selectedSchoolYearId),
    );

    const unsubEntries = onSnapshot(
      qEntries,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as DisciplineRecord[];
        // Sắp xếp: Phiếu pending trước, sau đó theo ngày vi phạm giảm dần
        rows.sort((a, b) => {
          if (a.status === "pending" && b.status !== "pending") return -1;
          if (a.status !== "pending" && b.status === "pending") return 1;
          if (a.occurredDate !== b.occurredDate) {
            return b.occurredDate.localeCompare(a.occurredDate);
          }
          const timeA = typeof a.createdAt === "object" && a.createdAt !== null ? (a.createdAt as any).seconds || 0 : 0;
          const timeB = typeof b.createdAt === "object" && b.createdAt !== null ? (b.createdAt as any).seconds || 0 : 0;
          return timeB - timeA;
        });
        setEntries(rows);
        setLoadingEntries(false);
      },
      (err) => {
        console.error("Lỗi tải danh sách vi phạm:", err);
        toast.error("Không thể tải danh sách phiếu vi phạm.");
        setLoadingEntries(false);
      },
    );

    return () => unsubEntries();
  }, [selectedSchoolYearId]);

  // 5. LỌC PHẠM VI (TUẦN, LỚP, NHÓM VI PHẠM) TRƯỚC KHI XÉT TAB TRẠNG THÁI VÀ TÌM KIẾM
  const scopedEntries = useMemo(() => {
    return entries.filter((r) => {
      // Lọc tuần
      if (selectedWeekId !== "all" && r.weekId !== selectedWeekId) return false;
      // Lọc lớp
      if (selectedClassId !== "all" && r.classId !== selectedClassId) return false;
      // Lọc nhóm vi phạm
      if (selectedCategory !== "all" && r.category !== selectedCategory) return false;
      return true;
    });
  }, [entries, selectedWeekId, selectedClassId, selectedCategory]);

  // Thống kê số lượng phiếu theo trạng thái TRONG PHẠM VI BỘ LỌC ĐANG CHỌN (Tuần, Lớp, Nhóm lỗi)
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let returned = 0;
    let rejected = 0;

    for (const r of scopedEntries) {
      if (r.status === "pending") pending++;
      else if (r.status === "approved") approved++;
      else if (r.status === "returned") returned++;
      else if (r.status === "rejected") rejected++;
    }

    return { total: scopedEntries.length, pending, approved, returned, rejected };
  }, [scopedEntries]);

  // Thống kê toàn năm học để cảnh báo số phiếu chờ duyệt còn lại ở các tuần khác
  const yearStats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let returned = 0;
    let rejected = 0;

    for (const r of entries) {
      if (r.status === "pending") pending++;
      else if (r.status === "approved") approved++;
      else if (r.status === "returned") returned++;
      else if (r.status === "rejected") rejected++;
    }

    return { total: entries.length, pending, approved, returned, rejected };
  }, [entries]);

  // Danh sách đã lọc theo các tiêu chí và Tab
  const filteredEntries = useMemo(() => {
    return scopedEntries.filter((r) => {
      // Lọc trạng thái theo Tab
      if (activeTabStatus !== "all" && r.status !== activeTabStatus) return false;

      // Lọc tìm kiếm
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchCriterion =
          (r.criterionName || "").toLowerCase().includes(term) ||
          (r.criterionCode || "").toLowerCase().includes(term);
        const matchStudent = (r.studentNamesText || "").toLowerCase().includes(term);
        const matchClass = (r.className || "").toLowerCase().includes(term);
        const matchReporter = (r.reportedByName || "").toLowerCase().includes(term);
        const matchNote = (r.note || "").toLowerCase().includes(term);
        if (!matchCriterion && !matchStudent && !matchClass && !matchReporter && !matchNote) return false;
      }

      return true;
    });
  }, [scopedEntries, activeTabStatus, searchTerm]);

  // DUYỆT PHIẾU (APPROVE)
  async function handleApprove(record: DisciplineRecord) {
    if (!user) return;
    if (!canReviewEntries) {
      toast.error("Phiếu vi phạm phải do Ban Thi đua hoặc Trưởng ban thẩm định.");
      return;
    }

    // Chặn người lập tự duyệt (No Self-Approval)
    if (record.reportedByUid === user.uid) {
      toast.error("Vi phạm quy tắc liêm chính: Bạn là người ghi nhận phiếu này, không được phép tự duyệt phiếu của chính mình.");
      return;
    }

    try {
      await reviewDisciplineViolation({
        entryId: record.id,
        decision: "approved",
      });
      toast.success(`Đã duyệt thành công phiếu vi phạm cho lớp ${record.className}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi khi duyệt phiếu: " + msg);
    }
  }

  // MỞ MODAL XỬ LÝ (TRẢ LẠI HOẶC TỪ CHỐI)
  function handleOpenActionModal(record: DisciplineRecord, type: "returned" | "rejected") {
    if (!canReviewEntries) {
      toast.error("Phiếu vi phạm phải do Ban Thi đua hoặc Trưởng ban thẩm định.");
      return;
    }
    setActionRecord(record);
    setActionType(type);
    setActionNote("");
  }

  // XÁC NHẬN TRẢ LẠI HOẶC TỪ CHỐI
  async function handleSubmitAction() {
    if (!actionRecord || !actionType) return;

    if (!actionNote.trim()) {
      toast.error(`Vui lòng nhập lý do cụ thể khi ${actionType === "returned" ? "trả lại" : "từ chối"} phiếu.`);
      return;
    }

    setIsSubmittingAction(true);
    try {
      await reviewDisciplineViolation({
        entryId: actionRecord.id,
        decision: actionType,
        reviewNote: actionNote.trim(),
      });

      toast.success(
        actionType === "returned"
          ? `Đã trả lại phiếu vi phạm cho ${actionRecord.reportedByName} để bổ sung.`
          : `Đã từ chối phiếu vi phạm cho lớp ${actionRecord.className}.`,
      );

      setActionRecord(null);
      setActionType(null);
      setActionNote("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi khi xử lý: " + msg);
    } finally {
      setIsSubmittingAction(false);
    }
  }

  // Helper hiển thị tone Badge
  function getStatusBadge(status: DisciplineEntryStatus) {
    switch (status) {
      case "pending":
        return <Badge tone="warning">Chờ duyệt</Badge>;
      case "approved":
        return <Badge tone="success">Đã duyệt</Badge>;
      case "returned":
        return <Badge tone="warning">Trả lại</Badge>;
      case "rejected":
        return <Badge tone="danger">Từ chối</Badge>;
      default:
        return <Badge tone="neutral">{status}</Badge>;
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
        <div className="space-y-6 pb-16">
          {/* HEADER TRANG */}
          <PageHeader
            eyebrow="Ban Thi đua"
            title="Duyệt phiếu ghi nhận vi phạm"
            description="Thẩm định, phê duyệt hoặc trả lại các phiếu vi phạm do Ban Kỷ luật ghi nhận. Tuân thủ nguyên tắc liêm chính và phân tách nhiệm vụ (No Self-Approval)."
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push("/competition/weekly-finalize")}
                  className="gap-2"
                >
                  <FileCheck className="h-4 w-4" />
                  Tổng kết & Ký điểm
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push("/competition/leaderboard")}
                  className="gap-2"
                >
                  <ListChecks className="h-4 w-4" />
                  Bảng xếp hạng
                </Button>
              </div>
            }
          />

          {/* KIỂM TRA PHÂN QUYỀN BAN THI ĐUA */}
          {permissionChecking ? (
            <Card className="p-8 text-center space-y-3">
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
            </Card>
          ) : !hasPermission ? (
            <Card className="p-8 text-center border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
              <ShieldAlert className="h-12 w-12 text-amber-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-foreground">Bạn chưa có quyền Ban Thi đua</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                Tài khoản này chưa được Ban Giám Hiệu hoặc Quản trị viên phân công vào Ban Thi đua trong năm học này.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="secondary" onClick={() => router.push("/dashboard")}>
                  Về trang chủ
                </Button>
              </div>
            </Card>
          ) : (
            <>
              {!canReviewEntries ? (
                <Card className="p-4 border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 text-sm">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 mt-0.5 text-blue-600" />
                    <p>
                      BGH đang ở chế độ giám sát. Việc duyệt, trả lại hoặc từ chối phiếu phải do Ban Thi đua hoặc Trưởng ban Kỷ luật & Thi đua thực hiện.
                    </p>
                  </div>
                </Card>
              ) : null}
              {/* THỐNG KÊ KPI TỔNG QUAN THEO TRẠNG THÁI */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  onClick={() => setActiveTabStatus("pending")}
                  className={cn(
                    "p-3.5 rounded-2xl border bg-card text-card-foreground shadow-sm cursor-pointer transition-all text-center",
                    activeTabStatus === "pending"
                      ? "ring-2 ring-amber-500 border-amber-500 bg-amber-50/60 dark:bg-amber-950/30"
                      : "hover:bg-muted/30",
                  )}
                >
                  <div className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Chờ duyệt
                  </div>
                  <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">{stats.pending}</div>
                </div>

                <div
                  onClick={() => setActiveTabStatus("approved")}
                  className={cn(
                    "p-3.5 rounded-2xl border bg-card text-card-foreground shadow-sm cursor-pointer transition-all text-center",
                    activeTabStatus === "approved"
                      ? "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30"
                      : "hover:bg-muted/30",
                  )}
                >
                  <div className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Đã duyệt
                  </div>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{stats.approved}</div>
                </div>

                <div
                  onClick={() => setActiveTabStatus("returned")}
                  className={cn(
                    "p-3.5 rounded-2xl border bg-card text-card-foreground shadow-sm cursor-pointer transition-all text-center",
                    activeTabStatus === "returned"
                      ? "ring-2 ring-orange-500 border-orange-500 bg-orange-50/60 dark:bg-orange-950/30"
                      : "hover:bg-muted/30",
                  )}
                >
                  <div className="text-xs font-semibold uppercase text-orange-700 dark:text-orange-400 flex items-center justify-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Bị trả lại
                  </div>
                  <div className="text-2xl font-black text-orange-700 dark:text-orange-300 mt-1">{stats.returned}</div>
                </div>

                <div
                  onClick={() => setActiveTabStatus("rejected")}
                  className={cn(
                    "p-3.5 rounded-2xl border bg-card text-card-foreground shadow-sm cursor-pointer transition-all text-center",
                    activeTabStatus === "rejected"
                      ? "ring-2 ring-rose-500 border-rose-500 bg-rose-50/60 dark:bg-rose-950/30"
                      : "hover:bg-muted/30",
                  )}
                >
                  <div className="text-xs font-semibold uppercase text-rose-700 dark:text-rose-400 flex items-center justify-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" />
                    Đã từ chối
                  </div>
                  <div className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">{stats.rejected}</div>
                </div>
              </div>

              {/* THÔNG BÁO THÔNG MINH KHI TUẦN HIỆN TẠI ĐÃ DUYỆT XONG NHƯNG CÁC TUẦN KHÁC VẪN CÒN PHIẾU CHỜ DUYỆT */}
              {selectedWeekId !== "all" && yearStats.pending > 0 && stats.pending === 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-amber-300 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 text-xs shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      Tuần bạn đang chọn đã thẩm định xong ({stats.approved} phiếu đã duyệt). Hiện toàn trường còn{" "}
                      <strong className="underline decoration-amber-500 font-bold">{yearStats.pending} phiếu</strong>{" "}
                      chờ duyệt ở các tuần khác trong năm học.
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedWeekId("all");
                      setActiveTabStatus("pending");
                    }}
                    className="text-xs h-7 px-3 whitespace-nowrap self-start sm:self-center font-medium shadow-none"
                  >
                    Xem {yearStats.pending} phiếu chờ duyệt
                  </Button>
                </div>
              )}

              {/* BỘ LỌC ĐIỀU KIỆN */}
              <Card className="p-4 space-y-3">
                <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                  {/* TÌM KIẾM TỪ KHÓA */}
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tìm học sinh, lỗi vi phạm, người ghi..."
                      className="pl-9 text-xs"
                    />
                  </div>

                  {/* CÁC DROPDOWN LỌC */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
                    {/* NĂM HỌC */}
                    <div>
                      <select
                        value={selectedSchoolYearId}
                        onChange={(e) => setSelectedSchoolYearId(e.target.value)}
                        className="w-full text-xs rounded-xl border border-input bg-background px-2.5 py-2 focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                      >
                        {schoolYears.map((sy) => (
                          <option key={sy.id} value={sy.id}>
                            {sy.name || sy.code}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* TUẦN THI ĐUA */}
                    <div>
                      <select
                        value={selectedWeekId}
                        onChange={(e) => setSelectedWeekId(e.target.value)}
                        className="w-full text-xs rounded-xl border border-input bg-background px-2.5 py-2 focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                      >
                        <option value="all">
                          Tất cả các tuần {yearStats.pending > 0 ? `(${yearStats.pending} chờ duyệt)` : ""}
                        </option>
                        {weeks.map((w) => {
                          const weekPending = entries.filter((e) => e.weekId === w.id && e.status === "pending").length;
                          return (
                            <option key={w.id} value={w.id}>
                              Tuần {w.weekNumber} {weekPending > 0 ? `(${weekPending} chờ duyệt)` : ""} {w.status === "locked" ? "🔒 (Khóa)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* LỚP HỌC */}
                    <div>
                      <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="w-full text-xs rounded-xl border border-input bg-background px-2.5 py-2 focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                      >
                        <option value="all">Tất cả các lớp</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            Lớp {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* NHÓM VI PHẠM */}
                    <div>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full text-xs rounded-xl border border-input bg-background px-2.5 py-2 focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                      >
                        <option value="all">Tất cả nhóm lỗi</option>
                        {disciplineCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {disciplineCategoryLabels[cat]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* TÙY CHỌN XEM TẤT CẢ TRẠNG THÁI */}
                <div className="flex items-center justify-between text-xs pt-1 border-t">
                  <div className="text-muted-foreground">
                    Hiển thị <strong>{filteredEntries.length}</strong> phiếu phù hợp.
                  </div>
                  {activeTabStatus !== "all" && (
                    <button
                      onClick={() => setActiveTabStatus("all")}
                      className="text-primary hover:underline font-semibold"
                    >
                      Xem tất cả trạng thái ({stats.total})
                    </button>
                  )}
                </div>
              </Card>

              {/* DANH SÁCH PHIẾU CHỜ DUYỆT / ĐÃ XỬ LÝ */}
              {loadingEntries ? (
                <Card className="p-8 text-center space-y-3">
                  <Skeleton className="h-6 w-48 mx-auto" />
                  <Skeleton className="h-4 w-64 mx-auto" />
                </Card>
              ) : filteredEntries.length === 0 ? (
                <Card className="p-8">
                  <EmptyState
                    icon={<CheckCircle2 className="h-8 w-8 text-muted-foreground" />}
                    title={
                      activeTabStatus === "pending"
                        ? "Không có phiếu nào đang chờ duyệt"
                        : "Không tìm thấy phiếu vi phạm phù hợp"
                    }
                    description={
                      activeTabStatus === "pending"
                        ? "Tuyệt vời! Tất cả các phiếu ghi nhận vi phạm đã được thẩm định xong."
                        : "Vui lòng thay đổi bộ lọc tuần, lớp hoặc từ khóa tìm kiếm để xem các phiếu khác."
                    }
                  />
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredEntries.map((item) => {
                    const isSelfRecorded = user && item.reportedByUid === user.uid;
                    const canApprove = item.status === "pending" && !isSelfRecorded && canReviewEntries;

                    return (
                      <Card
                        key={item.id}
                        className={cn(
                          "p-4 transition-all hover:shadow-sm border space-y-3",
                          item.status === "pending" && "border-amber-300 bg-amber-50/20 dark:border-amber-900/60 dark:bg-amber-950/10",
                          item.status === "approved" && "border-emerald-200 bg-emerald-50/10 dark:border-emerald-900/40",
                          item.status === "returned" && "border-orange-200 bg-orange-50/15 dark:border-orange-900/40",
                          item.status === "rejected" && "border-rose-200 bg-rose-50/15 dark:border-rose-900/40",
                        )}
                      >
                        {/* HÀNG HEADER PHIẾU */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-base text-foreground">
                              Lớp {item.className}
                            </span>
                            <span className="text-muted-foreground text-xs">•</span>
                            <span className="text-xs text-muted-foreground font-medium">
                              Ngày {item.occurredDate}
                              {item.period ? ` (Tiết ${item.period})` : ""}
                            </span>
                            <span className="text-muted-foreground text-xs">•</span>
                            <Badge tone={item.category === "ky_luat" ? "danger" : item.category === "hoc_tap" ? "info" : "neutral"}>
                              {disciplineCategoryLabels[item.category] || item.category}
                            </Badge>
                            {getStatusBadge(item.status)}
                          </div>

                          {/* ĐIỂM SỐ */}
                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <span
                              className={cn(
                                "font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-lg",
                                item.totalPoints < 0
                                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                              )}
                            >
                              {item.totalPoints > 0 ? `+${item.totalPoints}` : item.totalPoints} đ
                            </span>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingRecord(item)}
                              className="h-8 gap-1 text-xs"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Chi tiết
                            </Button>
                          </div>
                        </div>

                        {/* NỘI DUNG VI PHẠM */}
                        <div className="text-sm space-y-1.5">
                          <div className="font-semibold text-foreground flex items-center gap-2">
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {item.criterionCode}
                            </span>
                            <span>{item.criterionName}</span>
                          </div>

                          <div className="text-xs text-muted-foreground">
                            <strong>Đối tượng: </strong>
                            <span className="text-foreground font-medium">
                              {item.scope === "student" ? (
                                item.studentNamesText || `${item.studentIds?.length || 0} học sinh`
                              ) : (
                                "Tập thể lớp"
                              )}
                            </span>
                            <span className="ml-2 font-medium text-muted-foreground">
                              ({item.unitPoints}đ / lượt × {item.quantity})
                            </span>
                          </div>

                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 pt-0.5">
                            <span>
                              Người ghi: <strong className="text-foreground">{item.reportedByName}</strong>
                            </span>
                            <span>•</span>
                            <span>Thời điểm gửi: {formatTimestamp(item.createdAt)}</span>
                            {item.attachmentUrls && item.attachmentUrls.length > 0 && (
                              <>
                                <span>•</span>
                                <a
                                  href={item.attachmentUrls[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Xem minh chứng
                                </a>
                              </>
                            )}
                          </div>

                          {item.note && (
                            <div className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded-lg border mt-1">
                              "{item.note}"
                            </div>
                          )}
                        </div>

                        {/* PHẢN HỒI ĐÃ XỬ LÝ (NẾU CÓ) */}
                        {item.status !== "pending" && item.reviewedByUid && (
                          <div className="p-2.5 rounded-lg border bg-muted/40 text-xs space-y-1">
                            <div className="flex items-center justify-between font-semibold text-foreground">
                              <span>Người thẩm định: {item.reviewedByName}</span>
                              <span className="text-muted-foreground font-normal">
                                {formatTimestamp(item.reviewedAt)}
                              </span>
                            </div>
                            {item.reviewNote && (
                              <p className="text-muted-foreground">
                                <strong>Lý do / Ý kiến:</strong> {item.reviewNote}
                              </p>
                            )}
                          </div>
                        )}

                        {/* CẢNH BÁO TỰ DUYỆT (SELF-APPROVAL WARNING) */}
                        {item.status === "pending" && isSelfRecorded && (
                          <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-100/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                            <span>
                              <strong>Quy tắc liêm chính:</strong> Bạn là người lập phiếu này, không được phép tự duyệt phiếu của chính mình. Vui lòng để thành viên khác trong Ban Thi đua thẩm định.
                            </span>
                          </div>
                        )}

                        {/* HÀNG NÚT THAO TÁC DUYỆT (CHỈ HIỂN THỊ KHI PENDING) */}
                        {item.status === "pending" && (
                          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenActionModal(item, "rejected")}
                              disabled={!canReviewEntries}
                              className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                              Từ chối
                            </Button>

                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenActionModal(item, "returned")}
                              disabled={!canReviewEntries}
                              className="h-8 gap-1.5 text-xs text-orange-600 hover:text-orange-700"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Trả lại
                            </Button>

                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!canApprove}
                              onClick={() => handleApprove(item)}
                              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              Duyệt phiếu (+{item.totalPoints}đ)
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* MODAL XEM CHI TIẾT PHIẾU */}
          {viewingRecord && (
            <Modal
              open={Boolean(viewingRecord)}
              onOpenChange={(open) => {
                if (!open) setViewingRecord(null);
              }}
              title={`Chi tiết phiếu vi phạm: Lớp ${viewingRecord.className}`}
            >
              <div className="space-y-4 text-xs">
                {/* TRẠNG THÁI & ĐIỂM */}
                <div className="p-3 rounded-xl bg-muted/40 border flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground font-medium">Trạng thái thẩm định</div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(viewingRecord.status)}
                      <span className="text-xs text-muted-foreground font-mono">
                        (Mã: {viewingRecord.id.substring(0, 10)}...)
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground font-medium">Điểm tác động</div>
                    <div
                      className={cn(
                        "font-mono font-extrabold text-lg",
                        viewingRecord.totalPoints < 0 ? "text-red-600" : "text-emerald-600",
                      )}
                    >
                      {viewingRecord.totalPoints > 0 ? `+${viewingRecord.totalPoints}` : viewingRecord.totalPoints} điểm
                    </div>
                  </div>
                </div>

                {/* THÔNG TIN CHI TIẾT */}
                <div className="grid grid-cols-2 gap-3 border-y py-3">
                  <div>
                    <span className="text-muted-foreground">Lớp học:</span>{" "}
                    <strong className="text-foreground">{viewingRecord.className}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Thời gian:</span>{" "}
                    <strong className="text-foreground">
                      {viewingRecord.occurredDate} {viewingRecord.period ? `(Tiết ${viewingRecord.period})` : ""}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Người lập:</span>{" "}
                    <strong className="text-foreground">{viewingRecord.reportedByName}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Thời điểm gửi:</span>{" "}
                    <strong className="text-foreground">{formatTimestamp(viewingRecord.createdAt)}</strong>
                  </div>
                </div>

                {/* NỘI DUNG VI PHẠM */}
                <div className="space-y-1.5 bg-muted/20 p-3 rounded-xl border">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <Badge tone={viewingRecord.category === "ky_luat" ? "danger" : viewingRecord.category === "hoc_tap" ? "info" : "neutral"}>
                      {disciplineCategoryLabels[viewingRecord.category]}
                    </Badge>
                    <span>
                      [{viewingRecord.criterionCode}] {viewingRecord.criterionName}
                    </span>
                  </div>

                  <div className="pt-1 text-muted-foreground">
                    <strong>Đối tượng vi phạm: </strong>
                    <span className="text-foreground font-medium">
                      {viewingRecord.scope === "student" ? viewingRecord.studentNamesText : "Tập thể lớp"}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground">Định mức quy chế: </span>
                    <strong className="text-foreground">
                      {viewingRecord.unitPoints}đ / lượt (Số lượng: {viewingRecord.quantity})
                    </strong>
                  </div>

                  {viewingRecord.note && (
                    <div className="pt-1 text-muted-foreground">
                      <strong>Ghi chú: </strong>
                      <span className="text-foreground">{viewingRecord.note}</span>
                    </div>
                  )}

                  {viewingRecord.attachmentUrls && viewingRecord.attachmentUrls.length > 0 && (
                    <div className="pt-2">
                      <strong className="text-muted-foreground">Minh chứng đính kèm: </strong>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {viewingRecord.attachmentUrls.map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-primary font-medium underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Minh chứng {idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* LỊCH SỬ THẨM ĐỊNH */}
                {viewingRecord.reviewedByUid && (
                  <div className="p-3 rounded-xl border space-y-1.5 bg-muted/10">
                    <div className="font-bold text-foreground">Kết quả thẩm định của Ban Thi đua:</div>
                    <div className="text-muted-foreground">
                      Người thẩm định: <strong className="text-foreground">{viewingRecord.reviewedByName}</strong>
                    </div>
                    <div className="text-muted-foreground">
                      Thời điểm: <strong className="text-foreground">{formatTimestamp(viewingRecord.reviewedAt)}</strong>
                    </div>
                    {viewingRecord.reviewNote && (
                      <div className="p-2 rounded bg-muted/50 border mt-1 text-foreground">
                        <strong>Lý do / Ý kiến:</strong> {viewingRecord.reviewNote}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t">
                  <Button variant="secondary" onClick={() => setViewingRecord(null)}>
                    Đóng
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* MODAL TRẢ LẠI HOẶC TỪ CHỐI (BẮT BUỘC NHẬP LÝ DO) */}
          {actionRecord && actionType && (
            <Modal
              open={Boolean(actionRecord && actionType)}
              onOpenChange={(open) => {
                if (!open) {
                  setActionRecord(null);
                  setActionType(null);
                  setActionNote("");
                }
              }}
              title={actionType === "returned" ? "Trả lại phiếu vi phạm để bổ sung" : "Từ chối phiếu vi phạm"}
            >
              <div className="space-y-4 text-xs">
                <div
                  className={cn(
                    "p-3 rounded-xl border",
                    actionType === "returned"
                      ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 text-orange-900 dark:text-orange-200"
                      : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 text-rose-900 dark:text-rose-200",
                  )}
                >
                  <p className="font-semibold">
                    {actionType === "returned"
                      ? "Phiếu sẽ được chuyển về người ghi nhận kèm lý do để họ bổ sung thông tin hoặc minh chứng."
                      : "Phiếu sẽ bị từ chối chính thức và không được tính điểm thi đua cho lớp."}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Lớp: <strong>{actionRecord.className}</strong> • Mục lỗi: <strong>{actionRecord.criterionName}</strong>
                  </p>
                </div>

                <div>
                  <Label htmlFor="actionReason" className="font-bold text-xs text-foreground">
                    Lý do {actionType === "returned" ? "trả lại" : "từ chối"} *
                  </Label>
                  <textarea
                    id="actionReason"
                    rows={3}
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder={
                      actionType === "returned"
                        ? "Vui lòng nhập rõ yêu cầu bổ sung (VD: Thiếu ảnh minh chứng, cần ghi rõ tên học sinh...)"
                        : "Vui lòng nhập lý do từ chối (VD: Đã được giáo viên bộ môn xử lý trực tiếp, không đủ căn cứ...)"
                    }
                    className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="secondary"
                    disabled={isSubmittingAction}
                    onClick={() => {
                      setActionRecord(null);
                      setActionType(null);
                    }}
                  >
                    Hủy bỏ
                  </Button>

                  <Button
                    variant="primary"
                    disabled={isSubmittingAction || !actionNote.trim()}
                    onClick={handleSubmitAction}
                    className={cn(
                      "text-white",
                      actionType === "returned" ? "bg-orange-600 hover:bg-orange-700" : "bg-rose-600 hover:bg-rose-700",
                    )}
                  >
                    {isSubmittingAction
                      ? "Đang xử lý..."
                      : actionType === "returned"
                        ? "Xác nhận trả lại"
                        : "Xác nhận từ chối"}
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
