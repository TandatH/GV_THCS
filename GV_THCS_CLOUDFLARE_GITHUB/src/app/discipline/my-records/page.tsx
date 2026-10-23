"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileEdit,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
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

type OptionRow = DocumentData & { id: string; name?: string; code?: string; isActive?: boolean };
type WeekRow = DocumentData & { id: string; weekNumber: number; schoolYearId: string; status?: string };

export default function MyDisciplineRecordsPage() {
  const router = useRouter();
  const { user, role } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [records, setRecords] = useState<DisciplineRecord[]>([]);

  // Quyền xem toàn trường và Chế độ xem
  const [canViewAll, setCanViewAll] = useState<boolean>(false);
  const [viewScope, setViewScope] = useState<"my" | "all">("my");

  // Danh mục lọc
  const [schoolYears, setSchoolYears] = useState<OptionRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [classes, setClasses] = useState<OptionRow[]>([]);

  // Bộ lọc
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [filterWeekId, setFilterWeekId] = useState<string>("all");
  const [filterClassId, setFilterClassId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Modal chi tiết phiếu
  const [viewingRecord, setViewingRecord] = useState<DisciplineRecord | null>(null);

  // KIỂM TRA QUYỀN XEM TOÀN TRƯỜNG (Admin, BGH, Ban Thi đua, Trưởng ban Kỷ luật)
  useEffect(() => {
    async function checkViewAll() {
      if (!user) return;
      if (role === "admin" || role === "bgh") {
        setCanViewAll(true);
        return;
      }
      try {
        const tokenResult = await user.getIdTokenResult();
        const claims = tokenResult.claims;
        if (
          claims.isCompetitionCommittee === true ||
          claims.isDisciplineHead === true ||
          claims.isDisciplineCommittee === true ||
          ["competition_committee", "discipline_head", "discipline_and_competition_head"].includes(
            String(claims.disciplineRole || ""),
          )
        ) {
          setCanViewAll(true);
          return;
        }

        const assignmentRefs = [
          doc(firestore, "disciplineAssignments", `${user.uid}_competition_committee`),
          doc(firestore, "disciplineAssignments", `${user.uid}_discipline_head`),
          doc(firestore, "disciplineAssignments", `${user.uid}_discipline_and_competition_head`),
        ];
        const snaps = await Promise.all(assignmentRefs.map((ref) => getDoc(ref)));
        if (snaps.some((s) => s.exists() && s.data()?.isActive !== false)) {
          setCanViewAll(true);
        }
      } catch (err) {
        console.error("Lỗi kiểm tra quyền xem lịch sử toàn trường:", err);
      }
    }
    checkViewAll();
  }, [user, role]);

  // 1. TẢI DANH MỤC NỀN
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

        const clsRows = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
        clsRows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setClasses(clsRows);
      } catch (err) {
        console.error("Lỗi tải danh mục:", err);
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
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as WeekRow[];
      rows.sort((a, b) => b.weekNumber - a.weekNumber);
      setWeeks(rows);
    });
    return () => unsubWeeks();
  }, [selectedSchoolYearId]);

  // 3. TẢI DANH SÁCH PHIẾU GHI NHẬN (THEO PHẠM VI "MY" HOẶC "ALL")
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const qEntries =
      viewScope === "all" && selectedSchoolYearId
        ? query(
            collection(firestore, "disciplineEntries"),
            where("schoolYearId", "==", selectedSchoolYearId),
          )
        : query(
            collection(firestore, "disciplineEntries"),
            where("reportedByUid", "==", user.uid),
          );

    const unsubEntries = onSnapshot(
      qEntries,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as DisciplineRecord[];
        // Sắp xếp ngày giảm dần
        rows.sort((a, b) => {
          if (a.occurredDate !== b.occurredDate) {
            return b.occurredDate.localeCompare(a.occurredDate);
          }
          const timeA = typeof a.createdAt === "object" && a.createdAt !== null ? (a.createdAt as any).seconds || 0 : 0;
          const timeB = typeof b.createdAt === "object" && b.createdAt !== null ? (b.createdAt as any).seconds || 0 : 0;
          return timeB - timeA;
        });
        setRecords(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Lỗi tải lịch sử ghi nhận:", err);
        toast.error("Không thể tải danh sách phiếu ghi nhận.");
        setLoading(false);
      },
    );

    return () => unsubEntries();
  }, [user, viewScope, selectedSchoolYearId]);

  // Lọc phạm vi tuần và lớp trước khi tính KPI và lọc trạng thái
  const scopedRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterWeekId !== "all" && r.weekId !== filterWeekId) return false;
      if (filterClassId !== "all" && r.classId !== filterClassId) return false;
      return true;
    });
  }, [records, filterWeekId, filterClassId]);

  // Thống kê nhanh theo trạng thái TRONG PHẠM VI BỘ LỌC ĐANG CHỌN (Tuần, Lớp)
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let returned = 0;
    let rejected = 0;

    for (const r of scopedRecords) {
      if (r.status === "pending") pending++;
      else if (r.status === "approved") approved++;
      else if (r.status === "returned") returned++;
      else if (r.status === "rejected") rejected++;
    }

    return { total: scopedRecords.length, pending, approved, returned, rejected };
  }, [scopedRecords]);

  // Danh sách đã lọc theo trạng thái và từ khóa tìm kiếm
  const filteredRecords = useMemo(() => {
    return scopedRecords.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchCriterion =
          (r.criterionName || "").toLowerCase().includes(term) ||
          (r.criterionCode || "").toLowerCase().includes(term);
        const matchStudent = (r.studentNamesText || "").toLowerCase().includes(term);
        const matchClass = (r.className || "").toLowerCase().includes(term);
        const matchNote = (r.note || "").toLowerCase().includes(term);
        if (!matchCriterion && !matchStudent && !matchClass && !matchNote) return false;
      }
      return true;
    });
  }, [scopedRecords, filterStatus, searchTerm]);

  // Helper hiển thị tone Badge theo status
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
          {/* HEADER */}
          <PageHeader
            eyebrow={viewScope === "all" ? "Quản lý thi đua" : "Ban Kỷ luật"}
            title="Lịch sử ghi nhận vi phạm"
            description={
              viewScope === "all"
                ? "Theo dõi toàn bộ các phiếu ghi nhận vi phạm của toàn trường trong năm học, xem tiến độ thẩm định của Ban Thi đua."
                : "Theo dõi tất cả các phiếu ghi nhận do bạn gửi lên, xem tiến độ phê duyệt của Ban Thi đua và chỉnh sửa bổ sung các phiếu bị trả lại."
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {canViewAll && (
                  <div className="flex items-center bg-muted/70 p-1 rounded-xl border border-input">
                    <button
                      type="button"
                      onClick={() => setViewScope("my")}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-lg transition-all",
                        viewScope === "my"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Phiếu của tôi
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewScope("all")}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-lg transition-all",
                        viewScope === "all"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Toàn trường
                    </button>
                  </div>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push("/discipline/record")}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Ghi nhận vi phạm mới
                </Button>
              </div>
            }
          />

          {/* KPI CARDS THỐNG KÊ */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="p-3 text-center border">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Tổng số phiếu</div>
              <div className="text-2xl font-black text-foreground mt-1">{stats.total}</div>
            </Card>

            <Card className="p-3 text-center border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
              <div className="text-xs text-amber-700 dark:text-amber-400 font-semibold uppercase flex items-center justify-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Chờ duyệt
              </div>
              <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">{stats.pending}</div>
            </Card>

            <Card className="p-3 text-center border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold uppercase flex items-center justify-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Đã duyệt
              </div>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{stats.approved}</div>
            </Card>

            <Card className="p-3 text-center border-orange-200 bg-orange-50/40 dark:bg-orange-950/20">
              <div className="text-xs text-orange-700 dark:text-orange-400 font-semibold uppercase flex items-center justify-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Bị trả lại
              </div>
              <div className="text-2xl font-black text-orange-700 dark:text-orange-300 mt-1">{stats.returned}</div>
            </Card>

            <Card className="p-3 text-center border-rose-200 bg-rose-50/40 dark:bg-rose-950/20">
              <div className="text-xs text-rose-700 dark:text-rose-400 font-semibold uppercase flex items-center justify-center gap-1">
                <XCircle className="h-3.5 w-3.5" />
                Từ chối
              </div>
              <div className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">{stats.rejected}</div>
            </Card>
          </div>

          {/* BỘ LỌC VÀ TÌM KIẾM */}
          <Card className="p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              {/* Ô TÌM KIẾM */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm học sinh, lỗi, ghi chú..."
                  className="pl-9 text-xs"
                />
              </div>

              {/* CÁC DROPDOWN LỌC */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full md:w-auto">
                {/* LỌC TUẦN */}
                <div>
                  <select
                    value={filterWeekId}
                    onChange={(e) => setFilterWeekId(e.target.value)}
                    className="w-full text-xs rounded-xl border border-input bg-background px-2.5 py-2 focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                  >
                    <option value="all">Tất cả các tuần</option>
                    {weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        Tuần {w.weekNumber}
                      </option>
                    ))}
                  </select>
                </div>

                {/* LỌC LỚP */}
                <div>
                  <select
                    value={filterClassId}
                    onChange={(e) => setFilterClassId(e.target.value)}
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

                {/* LỌC TRẠNG THÁI */}
                <div className="col-span-2 sm:col-span-1">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full text-xs rounded-xl border border-input bg-background px-2.5 py-2 focus:border-primary focus:ring-1 focus:ring-primary font-semibold"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="pending">Chờ duyệt ({stats.pending})</option>
                    <option value="approved">Đã duyệt ({stats.approved})</option>
                    <option value="returned">Bị trả lại ({stats.returned})</option>
                    <option value="rejected">Từ chối ({stats.rejected})</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          {/* DANH SÁCH PHIẾU GHI NHẬN */}
          {loading ? (
            <Card className="p-8 text-center space-y-3">
              <Skeleton className="h-6 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
            </Card>
          ) : filteredRecords.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                icon={<ListChecks className="h-8 w-8 text-muted-foreground" />}
                title="Chưa có phiếu vi phạm nào"
                description={
                  searchTerm || filterStatus !== "all" || filterClassId !== "all" || filterWeekId !== "all"
                    ? "Không tìm thấy phiếu vi phạm nào phù hợp với bộ lọc hiện tại."
                    : viewScope === "all"
                    ? "Chưa có phiếu vi phạm nào được ghi nhận trên toàn trường trong năm học này."
                    : "Bạn chưa gửi phiếu ghi nhận vi phạm nào. Hãy bấm 'Ghi nhận vi phạm mới' để bắt đầu."
                }
                action={
                  <Button variant="secondary" size="sm" onClick={() => router.push("/discipline/record")}>
                    Ghi nhận vi phạm mới
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((item) => {
                const isReturned = item.status === "returned";
                const isRejected = item.status === "rejected";

                return (
                  <Card
                    key={item.id}
                    className={cn(
                      "p-4 transition-all hover:shadow-sm border",
                      isReturned && "border-orange-300 bg-orange-50/20 dark:border-orange-900/60 dark:bg-orange-950/10",
                      isRejected && "border-rose-300 bg-rose-50/20 dark:border-rose-900/60 dark:bg-rose-950/10",
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                      {/* Cột trái: Thời gian, Lớp, Trạng thái */}
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

                      {/* Cột phải: Điểm và Thao tác */}
                      <div className="flex items-center gap-3 self-end sm:self-center">
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

                        {/* NÚT BỔ SUNG & GỬI LẠI DÀNH CHO PHIẾU BỊ TRẢ LẠI */}
                        {isReturned && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => router.push(`/discipline/record?editId=${item.id}`)}
                            className="h-8 gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                          >
                            <FileEdit className="h-3.5 w-3.5" />
                            Cập nhật & Gửi lại
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* HÀNG NỘI DUNG VI PHẠM */}
                    <div className="pt-3 text-sm space-y-1.5">
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {item.criterionCode}
                        </span>
                        <span>{item.criterionName}</span>
                      </div>

                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div>
                          <strong>Đối tượng: </strong>
                          <span className="text-foreground">
                            {item.scope === "student" ? (
                              item.studentNamesText || `${item.studentIds?.length || 0} học sinh`
                            ) : (
                              "Tập thể lớp"
                            )}
                          </span>
                          {item.quantity > 1 && (
                            <span className="ml-2 font-medium text-muted-foreground">
                              (Số lượng: {item.quantity})
                            </span>
                          )}
                        </div>
                        {viewScope === "all" && item.reportedByName && (
                          <div className="text-xs">
                            <strong>Người lập: </strong>
                            <span className="text-foreground font-medium">{item.reportedByName}</span>
                          </div>
                        )}
                      </div>

                      {item.note && (
                        <div className="text-xs text-muted-foreground italic">
                          "{item.note}"
                        </div>
                      )}
                    </div>

                    {/* Ý KIẾN TRẢ LẠI / TỪ CHỐI TỪ BAN THI ĐUA */}
                    {(isReturned || isRejected) && (
                      <div className="mt-3 p-3 rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-100/50 dark:bg-orange-950/30 text-xs text-orange-900 dark:text-orange-200 space-y-1">
                        <div className="font-bold flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            Phản hồi từ Ban Thi đua ({item.reviewedByName || "Người duyệt"}):
                          </span>
                          <span className="font-normal text-muted-foreground">
                            {formatTimestamp(item.reviewedAt)}
                          </span>
                        </div>
                        <p className="pl-5 text-foreground font-medium">
                          {item.reviewNote ? item.reviewNote : "Không có ghi chú cụ thể."}
                        </p>
                        {isReturned && (
                          <p className="pl-5 text-xs text-orange-700 dark:text-orange-300">
                            → Vui lòng bấm <strong>Cập nhật & Gửi lại</strong> để bổ sung thông tin hoặc minh chứng theo yêu cầu.
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* MODAL XEM CHI TIẾT PHIẾU GHI NHẬN */}
          {viewingRecord && (
            <Modal
              open={Boolean(viewingRecord)}
              onOpenChange={(open) => {
                if (!open) setViewingRecord(null);
              }}
              title={`Chi tiết phiếu vi phạm: ${viewingRecord.className}`}
            >
              <div className="space-y-4 text-xs">
                {/* TRẠNG THÁI & ĐIỂM */}
                <div className="p-3 rounded-xl bg-muted/40 border flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground font-medium">Trạng thái phê duyệt</div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(viewingRecord.status)}
                      <span className="text-xs text-muted-foreground font-mono">
                        (Mã phiếu: {viewingRecord.id.substring(0, 10)}...)
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground font-medium">Điểm dự kiến</div>
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
                    <span className="text-muted-foreground">Người ghi nhận:</span>{" "}
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
                    <span className="text-muted-foreground">Định mức theo quy chế: </span>
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

                {/* THÔNG TIN XÉT DUYỆT CỦA BAN THI ĐUA */}
                <div className="p-3 rounded-xl border space-y-2 bg-muted/10">
                  <div className="font-bold text-foreground flex items-center justify-between">
                    <span>Kết quả xem xét từ Ban Thi đua:</span>
                    {getStatusBadge(viewingRecord.status)}
                  </div>

                  {viewingRecord.reviewedByUid ? (
                    <div className="space-y-1 text-muted-foreground">
                      <div>
                        Người xem xét: <strong className="text-foreground">{viewingRecord.reviewedByName}</strong>
                      </div>
                      <div>
                        Thời gian xem xét: <strong className="text-foreground">{formatTimestamp(viewingRecord.reviewedAt)}</strong>
                      </div>
                      {viewingRecord.reviewNote && (
                        <div className="p-2 rounded bg-muted/50 border mt-1 text-foreground">
                          <strong>Ý kiến / Lý do: </strong> {viewingRecord.reviewNote}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Phiếu đang trong hàng đợi phê duyệt của Ban Thi đua.
                    </p>
                  )}
                </div>

                {/* NÚT THAO TÁC TRONG MODAL */}
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="secondary" onClick={() => setViewingRecord(null)}>
                    Đóng
                  </Button>
                  {viewingRecord.status === "returned" && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        const id = viewingRecord.id;
                        setViewingRecord(null);
                        router.push(`/discipline/record?editId=${id}`);
                      }}
                      className="gap-1 bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      <FileEdit className="h-4 w-4" />
                      Cập nhật & Gửi lại
                    </Button>
                  )}
                </div>
              </div>
            </Modal>
          )}
        </div>
      </Shell>
    </RoleGuard>
  );
}
