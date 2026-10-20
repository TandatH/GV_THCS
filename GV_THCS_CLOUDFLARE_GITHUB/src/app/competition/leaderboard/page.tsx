"use client";

import {
  AlertCircle,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Download,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  History,
  Layers,
  ListChecks,
  Lock,
  Medal,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Unlock,
  User,
  Users,
  X,
} from "lucide-react";
import {
  collection,
  doc,
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
  lockWeeklyDiscipline,
  reopenWeeklyDiscipline,
} from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { cn, formatDate } from "@/lib/utils";

type OptionRow = DocumentData & { id: string; name?: string; code?: string; grade?: number | string; homeroomTeacherId?: string };
type WeekRow = DocumentData & { id: string; weekNumber: number; schoolYearId: string; status?: string; isLocked?: boolean; lockedAt?: any; lockedByName?: string };
type ClassScoreRow = DocumentData & {
  id: string;
  weekId: string;
  weekNumber: number;
  classId: string;
  className: string;
  grade?: string;
  homeroomTeacherId?: string;
  basePoints: number;
  totalPlus: number;
  totalMinus: number;
  finalScore: number;
  activeApprovalId?: string;
  activeVersion?: number;
  contentHashSha256?: string;
  isSigned?: boolean;
  isLocked?: boolean;
};

type TeacherRow = DocumentData & { id: string; fullName?: string; email?: string };

export default function CompetitionLeaderboardPage() {
  const router = useRouter();
  const { user, role } = useAuth();

  // Danh mục nền
  const [schoolYears, setSchoolYears] = useState<OptionRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [classes, setClasses] = useState<OptionRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);

  // Lựa chọn
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");

  // Dữ liệu bảng điểm các lớp trong tuần
  const [loadingScores, setLoadingScores] = useState<boolean>(true);
  const [classScores, setClassScores] = useState<ClassScoreRow[]>([]);
  const [pendingEntriesCount, setPendingEntriesCount] = useState<number>(0);

  // Modal Khóa sổ
  const [isLockModalOpen, setIsLockModalOpen] = useState<boolean>(false);
  const [isLocking, setIsLocking] = useState<boolean>(false);

  // Modal Mở khóa
  const [isReopenModalOpen, setIsReopenModalOpen] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>("");
  const [isReopening, setIsReopening] = useState<boolean>(false);

  // 1. TẢI DANH MỤC NỀN
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const [sySnap, clsSnap, tchSnap] = await Promise.all([
          getDocs(query(collection(firestore, "schoolYears"), where("isActive", "==", true))),
          getDocs(query(collection(firestore, "classes"), where("isActive", "==", true))),
          getDocs(collection(firestore, "teachers")),
        ]);

        const syRows = sySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
        setSchoolYears(syRows);
        if (syRows.length > 0 && !selectedSchoolYearId) {
          setSelectedSchoolYearId(syRows[0].id);
        }

        const clsRows = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
        clsRows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setClasses(clsRows);

        const tchRows = tchSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as TeacherRow[];
        setTeachers(tchRows);
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
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as WeekRow[];
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

  // 3. TẢI ĐIỂM CÁC LỚP VÀ KIỂM TRA PHIẾU CHỜ DUYỆT TRONG TUẦN
  useEffect(() => {
    if (!selectedWeekId) {
      setClassScores([]);
      setLoadingScores(false);
      return;
    }

    setLoadingScores(true);

    // Lấy điểm các lớp
    const qScores = query(
      collection(firestore, "classWeeklyScores"),
      where("weekId", "==", selectedWeekId),
    );
    const unsubScores = onSnapshot(qScores, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ClassScoreRow[];
      setClassScores(rows);
      setLoadingScores(false);
    });

    // Kiểm tra số phiếu pending trong tuần
    const qPending = query(
      collection(firestore, "disciplineEntries"),
      where("weekId", "==", selectedWeekId),
      where("status", "==", "pending"),
    );
    const unsubPending = onSnapshot(qPending, (snapshot) => {
      setPendingEntriesCount(snapshot.size);
    });

    return () => {
      unsubScores();
      unsubPending();
    };
  }, [selectedWeekId]);

  // Tuần đang chọn
  const activeWeek = useMemo(() => weeks.find((w) => w.id === selectedWeekId), [weeks, selectedWeekId]);
  const isWeekLocked = activeWeek?.status === "locked" || activeWeek?.isLocked === true;

  // Bản đồ giáo viên chủ nhiệm
  const teacherMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teachers) {
      map.set(t.id, t.fullName || t.email || t.id);
    }
    return map;
  }, [teachers]);

  // Bản đồ thông tin lớp (để lấy GVCN và khối nếu classScores chưa có)
  const classMap = useMemo(() => {
    const map = new Map<string, OptionRow>();
    for (const c of classes) {
      map.set(c.id, c);
    }
    return map;
  }, [classes]);

  // Hợp nhất toàn bộ các lớp (cả lớp đã có điểm và lớp chưa có điểm)
  const mergedClassRankings = useMemo(() => {
    const list = classes.map((c) => {
      const score = classScores.find((s) => s.classId === c.id);
      const grade = String(c.grade || (c.name ? c.name.charAt(0) : ""));
      const homeroomTeacherId = c.homeroomTeacherId;
      const teacherName = homeroomTeacherId ? teacherMap.get(homeroomTeacherId) || "—" : "—";

      if (score) {
        return {
          classId: c.id,
          className: c.name || score.className,
          grade,
          teacherName,
          basePoints: score.basePoints || 100,
          totalPlus: score.totalPlus || 0,
          totalMinus: score.totalMinus || 0,
          finalScore: score.finalScore ?? 100,
          isSigned: Boolean(score.isSigned),
          isLocked: isWeekLocked || Boolean(score.isLocked),
          activeVersion: score.activeVersion,
          contentHashSha256: score.contentHashSha256,
        };
      }

      // Lớp chưa có bản ghi điểm: mặc định 100 điểm, chưa ký
      return {
        classId: c.id,
        className: c.name || c.id,
        grade,
        teacherName,
        basePoints: 100,
        totalPlus: 0,
        totalMinus: 0,
        finalScore: 100,
        isSigned: false,
        isLocked: isWeekLocked,
        activeVersion: undefined,
        contentHashSha256: undefined,
      };
    });

    // Lọc theo Khối
    const filtered = selectedGrade === "all" ? list : list.filter((item) => item.grade === selectedGrade);

    // Sắp xếp thứ hạng: Điểm cao nhất đứng trước, nếu bằng điểm thì lớp ít điểm trừ hơn đứng trước
    filtered.sort((a, b) => {
      if (b.finalScore !== a.finalScore) {
        return b.finalScore - a.finalScore;
      }
      if (a.totalMinus !== b.totalMinus) {
        return a.totalMinus - b.totalMinus; // Ít điểm trừ hơn xếp trên
      }
      return a.className.localeCompare(b.className);
    });

    return filtered;
  }, [classes, classScores, teacherMap, isWeekLocked, selectedGrade]);

  // Thống kê tiến độ ký của tuần
  const signingProgress = useMemo(() => {
    let signedCount = 0;
    for (const c of classes) {
      const score = classScores.find((s) => s.classId === c.id);
      if (score?.isSigned) signedCount++;
    }
    return {
      totalClasses: classes.length,
      signedClasses: signedCount,
      isAllSigned: classes.length > 0 && signedCount === classes.length,
    };
  }, [classes, classScores]);

  // THỰC HIỆN KHÓA SỔ TUẦN THI ĐUA (ADMIN/BGH)
  async function handleLockWeek() {
    if (!selectedWeekId) return;

    if (pendingEntriesCount > 0) {
      toast.error(`Còn ${pendingEntriesCount} phiếu vi phạm đang chờ duyệt. Cần xử lý hết trước khi khóa sổ.`);
      return;
    }

    if (!signingProgress.isAllSigned) {
      toast.error(`Mới có ${signingProgress.signedClasses}/${signingProgress.totalClasses} lớp được ký xác nhận. Vui lòng ký đủ các lớp trước khi khóa sổ.`);
      return;
    }

    setIsLocking(true);
    try {
      await lockWeeklyDiscipline({ weekId: selectedWeekId });
      toast.success("Đã khóa sổ thi đua tuần thành công! Kết quả đã trở thành chính thức.");
      setIsLockModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi khóa sổ: " + msg);
    } finally {
      setIsLocking(false);
    }
  }

  // THỰC HIỆN MỞ KHÓA TUẦN THI ĐUA (ADMIN/BGH)
  async function handleReopenWeek() {
    if (!selectedWeekId) return;

    if (reopenReason.trim().length < 5) {
      toast.error("Vui lòng nhập lý do mở khóa chi tiết (ít nhất 5 ký tự).");
      return;
    }

    setIsReopening(true);
    try {
      await reopenWeeklyDiscipline({
        weekId: selectedWeekId,
        reason: reopenReason.trim(),
      });
      toast.success("Đã mở khóa tuần thi đua thành công! Bạn có thể điều chỉnh và ký lại điểm.");
      setIsReopenModalOpen(false);
      setReopenReason("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi mở khóa: " + msg);
    } finally {
      setIsReopening(false);
    }
  }

  // Helper hiển thị biểu tượng thứ hạng
  function renderRankBadge(index: number) {
    if (index === 0) {
      return (
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-sm">
          🥇 1
        </span>
      );
    }
    if (index === 1) {
      return (
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-slate-300 text-slate-900 font-black text-xs shadow-sm">
          🥈 2
        </span>
      );
    }
    if (index === 2) {
      return (
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-amber-600 text-white font-black text-xs shadow-sm">
          🥉 3
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-muted font-bold text-xs text-muted-foreground">
        #{index + 1}
      </span>
    );
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh", "giaovien", "totruong"]}>
      <Shell>
        <div className="space-y-6 pb-20">
          {/* HEADER TRANG */}
          <PageHeader
            eyebrow="Ban Thi đua"
            title="Bảng xếp hạng thi đua tuần"
            description="Xếp hạng thứ tự thi đua của các lớp theo tuần và khối. Phân biệt rõ bảng điểm tạm tính với kết quả chính thức đã khóa sổ."
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
                  onClick={() => router.push("/competition/review")}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Duyệt vi phạm
                </Button>
              </div>
            }
          />

          {/* THANH TRẠNG THÁI TUẦN THI ĐUA */}
          <Card
            className={cn(
              "p-4 border transition-all",
              isWeekLocked
                ? "border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20"
                : "border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20",
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {isWeekLocked ? (
                  <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                    <Lock className="h-6 w-6" />
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                    <Unlock className="h-6 w-6" />
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-foreground">
                      Tuần {activeWeek?.weekNumber || "—"}: {isWeekLocked ? "KẾT QUẢ THI ĐUA CHÍNH THỨC" : "BẢNG ĐIỂM TẠM TÍNH"}
                    </h3>
                    <Badge tone={isWeekLocked ? "success" : "warning"}>
                      {isWeekLocked ? "ĐÃ KHÓA SỔ" : "ĐANG MỞ"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isWeekLocked
                      ? "Tuần thi đua đã được Ban Giám Hiệu khóa sổ chính thức. Bảng điểm và mã hash được lưu trữ bất biến."
                      : `Đã ký xác nhận ${signingProgress.signedClasses}/${signingProgress.totalClasses} lớp. Còn ${pendingEntriesCount} phiếu vi phạm đang chờ duyệt.`}
                  </p>
                </div>
              </div>

              {/* THAO TÁC KHÓA SỔ / MỞ KHÓA DÀNH CHO ADMIN & BGH */}
              {(role === "admin" || role === "bgh") && (
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {isWeekLocked ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsReopenModalOpen(true)}
                      className="gap-1.5 text-xs text-amber-700 hover:text-amber-800"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      Mở khóa tuần
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setIsLockModalOpen(true)}
                      disabled={pendingEntriesCount > 0 || !signingProgress.isAllSigned}
                      className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Khóa sổ chính thức
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* BỘ LỌC CHỌN NĂM HỌC, TUẦN VÀ KHỐI */}
          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* CHỌN NĂM HỌC */}
              <div>
                <Label htmlFor="leadSchoolYear" className="text-xs font-semibold">Năm học</Label>
                <select
                  id="leadSchoolYear"
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
                <Label htmlFor="leadWeek" className="text-xs font-semibold">Tuần thi đua</Label>
                <select
                  id="leadWeek"
                  value={selectedWeekId}
                  onChange={(e) => setSelectedWeekId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {weeks.map((w) => (
                    <option key={w.id} value={w.id}>
                      Tuần {w.weekNumber} {w.status === "locked" ? "🔒 (Khóa sổ)" : "(Đang mở)"}
                    </option>
                  ))}
                </select>
              </div>

              {/* LỌC THEO KHỐI */}
              <div>
                <Label htmlFor="leadGrade" className="text-xs font-semibold">Phạm vi khối</Label>
                <select
                  id="leadGrade"
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="all">Toàn trường (Tất cả các khối)</option>
                  <option value="6">Khối 6</option>
                  <option value="7">Khối 7</option>
                  <option value="8">Khối 8</option>
                  <option value="9">Khối 9</option>
                </select>
              </div>
            </div>
          </Card>

          {/* BẢNG XẾP HẠNG THI ĐUA */}
          <Card className="overflow-hidden border">
            <div className="p-4 bg-muted/30 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <div>
                  <h3 className="font-bold text-sm text-foreground">
                    Bảng xếp hạng: Tuần {activeWeek?.weekNumber} {selectedGrade !== "all" ? `(Khối ${selectedGrade})` : "(Toàn trường)"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Tổng số {mergedClassRankings.length} lớp tham gia xếp hạng thi đua.
                  </p>
                </div>
              </div>

              <div>
                <Badge tone={isWeekLocked ? "success" : "neutral"}>
                  {isWeekLocked ? "Chính thức" : "Tạm tính"}
                </Badge>
              </div>
            </div>

            {loadingScores ? (
              <div className="p-8 text-center space-y-3">
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-4 w-64 mx-auto" />
              </div>
            ) : mergedClassRankings.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={<Trophy className="h-8 w-8 text-muted-foreground" />}
                  title="Chưa có dữ liệu xếp hạng"
                  description="Không tìm thấy dữ liệu lớp nào trong khối đã chọn."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b font-bold text-muted-foreground uppercase text-[10px]">
                    <tr>
                      <th className="p-3 w-16 text-center">Hạng</th>
                      <th className="p-3 w-24">Lớp</th>
                      <th className="p-3 w-20 text-center">Khối</th>
                      <th className="p-3 min-w-[160px]">Giáo viên chủ nhiệm</th>
                      <th className="p-3 w-24 text-center">Điểm gốc</th>
                      <th className="p-3 w-24 text-center">Điểm cộng</th>
                      <th className="p-3 w-24 text-center">Điểm trừ</th>
                      <th className="p-3 w-28 text-right font-black">Điểm cuối tuần</th>
                      <th className="p-3 w-32 text-center">Xác nhận</th>
                      <th className="p-3 w-28 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mergedClassRankings.map((row, index) => {
                      return (
                        <tr
                          key={row.classId}
                          className={cn(
                            "transition-colors hover:bg-muted/20",
                            index === 0 && "bg-amber-50/30 dark:bg-amber-950/20 font-medium",
                            index === 1 && "bg-slate-50/30 dark:bg-slate-900/20",
                            index === 2 && "bg-orange-50/20 dark:bg-orange-950/15",
                          )}
                        >
                          {/* THỨ HẠNG */}
                          <td className="p-3 text-center">
                            {renderRankBadge(index)}
                          </td>

                          {/* TÊN LỚP */}
                          <td className="p-3 font-bold text-base text-foreground">
                            {row.className}
                          </td>

                          {/* KHỐI */}
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-muted font-semibold text-muted-foreground">
                              Khối {row.grade}
                            </span>
                          </td>

                          {/* GVCN */}
                          <td className="p-3 font-medium text-foreground">
                            {row.teacherName}
                          </td>

                          {/* ĐIỂM GỐC */}
                          <td className="p-3 text-center font-mono text-muted-foreground">
                            +{row.basePoints}
                          </td>

                          {/* ĐIỂM CỘNG */}
                          <td className="p-3 text-center font-mono font-semibold text-emerald-600">
                            {row.totalPlus > 0 ? `+${row.totalPlus}` : "0"}
                          </td>

                          {/* ĐIỂM TRỪ */}
                          <td className="p-3 text-center font-mono font-semibold text-red-600">
                            {row.totalMinus > 0 ? `-${row.totalMinus}` : "0"}
                          </td>

                          {/* ĐIỂM CUỐI TUẦN */}
                          <td className="p-3 text-right">
                            <span className="font-mono font-black text-base text-primary px-2 py-0.5 rounded bg-primary/10">
                              {row.finalScore} đ
                            </span>
                          </td>

                          {/* TRẠNG THÁI XÁC NHẬN */}
                          <td className="p-3 text-center">
                            {row.isSigned ? (
                              <Badge tone="success">
                                Đã ký {row.activeVersion ? `(v${row.activeVersion})` : ""}
                              </Badge>
                            ) : (
                              <Badge tone="warning">Tạm tính</Badge>
                            )}
                          </td>

                          {/* THAO TÁC */}
                          <td className="p-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/competition/weekly-finalize?weekId=${selectedWeekId}&classId=${row.classId}`)}
                              className="h-7 text-xs gap-1"
                            >
                              <Eye className="h-3 w-3" />
                              Chi tiết
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* MODAL KHÓA SỔ CHÍNH THỨC */}
          {isLockModalOpen && (
            <Modal
              open={isLockModalOpen}
              onOpenChange={(open) => {
                if (!open) setIsLockModalOpen(false);
              }}
              title={`Khóa sổ thi đua: Tuần ${activeWeek?.weekNumber}`}
            >
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 space-y-1.5">
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Đủ điều kiện khóa sổ tuần thi đua:
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    <li>Đã hoàn tất ký xác nhận toàn bộ <strong>{signingProgress.signedClasses}/{signingProgress.totalClasses}</strong> lớp học.</li>
                    <li>Không còn phiếu vi phạm nào đang chờ duyệt.</li>
                    <li>Điểm số và thứ hạng của các lớp sẽ được lưu trữ bất biến.</li>
                  </ul>
                </div>

                <p className="text-muted-foreground">
                  Sau khi khóa sổ, Ban Kỷ luật và giáo viên sẽ không thể gửi thêm vi phạm hoặc chỉnh sửa điểm của tuần này trừ khi Ban Giám Hiệu thực hiện Mở khóa (Reopen).
                </p>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="secondary" disabled={isLocking} onClick={() => setIsLockModalOpen(false)}>
                    Hủy bỏ
                  </Button>
                  <Button
                    variant="primary"
                    disabled={isLocking}
                    onClick={handleLockWeek}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {isLocking ? "Đang khóa sổ..." : "Xác nhận khóa sổ chính thức"}
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* MODAL MỞ KHÓA TUẦN THI ĐUA */}
          {isReopenModalOpen && (
            <Modal
              open={isReopenModalOpen}
              onOpenChange={(open) => {
                if (!open) {
                  setIsReopenModalOpen(false);
                  setReopenReason("");
                }
              }}
              title={`Mở khóa tuần thi đua: Tuần ${activeWeek?.weekNumber}`}
            >
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Lưu ý quan trọng khi mở khóa tuần:
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tuần thi đua sẽ được chuyển về trạng thái Đang mở (`open`). Các bảng điểm cần điều chỉnh sẽ được đánh dấu phiên bản cũ là `superseded` và yêu cầu ký lại phiên bản mới $v(n+1)$ kèm lý do điều chỉnh.
                  </p>
                </div>

                <div>
                  <Label htmlFor="reopenReasonInput" className="font-bold text-xs text-foreground">
                    Lý do mở khóa tuần thi đua *
                  </Label>
                  <textarea
                    id="reopenReasonInput"
                    rows={3}
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Nhập lý do cụ thể (VD: Điều chỉnh theo quyết định giải quyết khiếu nại của lớp 7A...)"
                    className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="secondary" disabled={isReopening} onClick={() => setIsReopenModalOpen(false)}>
                    Hủy bỏ
                  </Button>
                  <Button
                    variant="primary"
                    disabled={isReopening || reopenReason.trim().length < 5}
                    onClick={handleReopenWeek}
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    {isReopening ? "Đang mở khóa..." : "Xác nhận mở khóa tuần"}
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
