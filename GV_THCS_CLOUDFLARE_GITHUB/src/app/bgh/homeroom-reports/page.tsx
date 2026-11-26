"use client";

import {
  getClassGrade,
  homeroomPrincipalRatingLabels,
  type HomeroomPrincipalRating,
  type HomeroomWeeklyReport,
} from "@school/shared";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  Grid3X3,
  Layers,
  ListChecks,
  MessageSquare,
  Printer,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { HomeroomReportDetailView } from "@/components/homeroom/report-detail-view";
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
import {
  buildHomeroomWeekOptions,
  submissionTypeLabel,
} from "@/lib/homeroom-activity-book";
import { cn } from "@/lib/utils";

type ClassRow = DocumentData & {
  id: string;
  name?: string;
  code?: string;
  grade?: number | string;
  gradeLevel?: number | string;
  schoolLevel?: string;
  homeroomTeacherId?: string;
};

type TeacherRow = DocumentData & {
  id: string;
  fullName?: string;
  name?: string;
};

type WeekDoc = {
  id: string;
  weekNumber: number;
  schoolYearId: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  isLocked?: boolean;
  schoolLevel?: string;
};

const QUICK_FEEDBACK_TEMPLATES = [
  "Đã xem. Biểu dương nề nếp và tinh thần học tập của lớp tuần qua.",
  "Đã xem. Đề nghị GVCN lưu ý theo dõi thêm tình hình chuyên cần và đi trễ của lớp.",
  "BGH ghi nhận kiến nghị của lớp và sẽ phối hợp xử lý trong tuần tới.",
  "Ảnh chụp sổ sinh hoạt rõ ràng, đầy đủ nội dung. Tiếp tục phát huy.",
  "Ảnh chụp hơi mờ, tuần tới thầy/cô chụp rõ nét hơn để BGH dễ theo dõi nhé.",
];

function BghHomeroomReportsContent() {
  const searchParams = useSearchParams();
  const queryWeekNum = Number(searchParams.get("week") || "");
  const { user } = useAuth();

  // Base metadata
  const [schoolYears, setSchoolYears] = useState<DocumentData[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [disciplineWeeks, setDisciplineWeeks] = useState<WeekDoc[]>([]);
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number>(1);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachersMap, setTeachersMap] = useState<Map<string, TeacherRow>>(new Map());
  const [loadingBase, setLoadingBase] = useState(true);

  // All reports for selectedSchoolYearId
  const [reports, setReports] = useState<HomeroomWeeklyReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // UI view & filters
  const [activeView, setActiveView] = useState<"weekly" | "matrix">("weekly");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [matrixWindowStart, setMatrixWindowStart] = useState<number>(1);

  // Detail & Review modal
  const [selectedReport, setSelectedReport] = useState<HomeroomWeeklyReport | null>(null);
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<HomeroomPrincipalRating | "">("");
  const [savingFeedback, setSavingFeedback] = useState(false);

  // 1. Load SchoolYears, Classes, Teachers
  useEffect(() => {
    async function loadBase() {
      setLoadingBase(true);
      try {
        const [sySnap, clsSnap, teacherSnap] = await Promise.all([
          getDocs(collection(firestore, "schoolYears")),
          getDocs(collection(firestore, "classes")),
          getDocs(collection(firestore, "teachers")),
        ]);

        const allSyRows = sySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentData[];
        const activeSyRows = allSyRows.filter((y) => y.isActive === true);
        const syRows =
          activeSyRows.length > 0 ? activeSyRows : allSyRows.filter((y) => y.isActive !== false);
        setSchoolYears(syRows);
        if (syRows.length > 0) {
          setSelectedSchoolYearId(syRows[0].id);
        }

        const clsRows = (clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ClassRow[]).filter(
          (c) => c.isActive !== false,
        );
        clsRows.sort((a, b) =>
          String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "vi", {
            numeric: true,
          }),
        );
        setClasses(clsRows);

        const tMap = new Map<string, TeacherRow>();
        teacherSnap.docs.forEach((d) => {
          tMap.set(d.id, { id: d.id, ...d.data() });
        });
        setTeachersMap(tMap);
      } catch (err) {
        console.error("Lỗi tải dữ liệu trường:", err);
        toast.error("Không thể tải danh sách lớp và giáo viên.");
      } finally {
        setLoadingBase(false);
      }
    }

    loadBase();
  }, []);

  // 2. Listen to disciplineWeeks
  useEffect(() => {
    if (!selectedSchoolYearId) return;
    const qWeeks = query(
      collection(firestore, "disciplineWeeks"),
      where("schoolYearId", "==", selectedSchoolYearId),
    );
    const unsub = onSnapshot(qWeeks, (snap) => {
      setDisciplineWeeks(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as WeekDoc[]);
    });
    return () => unsub();
  }, [selectedSchoolYearId]);

  const weekOptions = useMemo(() => {
    if (!selectedSchoolYearId) return [];
    return buildHomeroomWeekOptions(selectedSchoolYearId, disciplineWeeks);
  }, [selectedSchoolYearId, disciplineWeeks]);

  const autoSelectedWeekRef = useRef(false);

  // Default week once disciplineWeeks arrive (or from query param)
  useEffect(() => {
    if (weekOptions.length === 0) return;
    if (Number.isInteger(queryWeekNum) && queryWeekNum >= 1 && queryWeekNum <= 52) {
      setSelectedWeekNumber(queryWeekNum);
      setMatrixWindowStart(Math.max(1, queryWeekNum - 7));
      autoSelectedWeekRef.current = true;
      return;
    }
    if (autoSelectedWeekRef.current) return;
    if (disciplineWeeks.length === 0) return;

    const current = weekOptions.find((w) => w.isCurrent);
    if (current) {
      setSelectedWeekNumber(current.weekNumber);
      setMatrixWindowStart(Math.max(1, current.weekNumber - 7));
      autoSelectedWeekRef.current = true;
      return;
    }
    const latest = disciplineWeeks
      .filter((w) => (w.schoolLevel || "secondary") === "secondary")
      .sort((a, b) => b.weekNumber - a.weekNumber)[0];
    if (latest) {
      setSelectedWeekNumber(latest.weekNumber);
      setMatrixWindowStart(Math.max(1, latest.weekNumber - 7));
      autoSelectedWeekRef.current = true;
    }
  }, [weekOptions, disciplineWeeks, queryWeekNum]);

  // 3. Listen to all reports for selectedSchoolYearId
  useEffect(() => {
    if (!selectedSchoolYearId) {
      setReports([]);
      return;
    }
    setLoadingReports(true);
    const qReports = query(
      collection(firestore, "homeroomWeeklyReports"),
      where("schoolYearId", "==", selectedSchoolYearId),
    );
    const unsub = onSnapshot(
      qReports,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<HomeroomWeeklyReport, "id">),
        }));
        setReports(rows);
        setLoadingReports(false);
      },
      (err) => {
        console.error("Lỗi tải báo cáo Sổ SH GVCN:", err);
        toast.error("Không thể tải danh sách báo cáo Sổ SH GVCN.");
        setLoadingReports(false);
      },
    );
    return () => unsub();
  }, [selectedSchoolYearId]);

  const currentWeek = useMemo(
    () => weekOptions.find((w) => w.weekNumber === selectedWeekNumber) || weekOptions[0],
    [weekOptions, selectedWeekNumber],
  );

  // Map reports for quick lookup: `${weekNumber}_${classId}` -> report
  const reportLookup = useMemo(() => {
    const map = new Map<string, HomeroomWeeklyReport>();
    for (const r of reports) {
      map.set(`${r.weekNumber}_${r.classId}`, r);
    }
    return map;
  }, [reports]);

  // Build rows for all classes in the selected week
  const weeklyClassRows = useMemo(() => {
    return classes.map((cls) => {
      const report = reportLookup.get(`${selectedWeekNumber}_${cls.id}`) || null;
      const teacher = cls.homeroomTeacherId ? teachersMap.get(cls.homeroomTeacherId) : undefined;
      const teacherName =
        report?.teacherName ||
        String(teacher?.fullName || teacher?.name || "Chưa phân công GVCN");
      const grade = Number(getClassGrade(cls) || cls.grade || cls.gradeLevel || 0);
      return {
        classRow: cls,
        classId: cls.id,
        className: String(cls.name || cls.code || cls.id),
        grade,
        teacherName,
        report,
      };
    });
  }, [classes, reportLookup, selectedWeekNumber, teachersMap]);

  // Stats for selected week
  const weekStats = useMemo(() => {
    let submitted = 0;
    let reviewed = 0;
    let draft = 0;
    let missing = 0;
    let photoSubmissions = 0;
    let formSubmissions = 0;
    let withRecommendations = 0;

    for (const row of weeklyClassRows) {
      const r = row.report;
      if (!r) {
        missing += 1;
        continue;
      }
      if (r.status === "reviewed") {
        reviewed += 1;
        submitted += 1;
      } else if (r.status === "submitted") {
        submitted += 1;
      } else {
        draft += 1;
      }

      if (r.status === "submitted" || r.status === "reviewed") {
        if (r.submissionType === "photo_only") photoSubmissions += 1;
        else if (r.submissionType === "form_only") formSubmissions += 1;
        else if (r.submissionType === "hybrid") {
          photoSubmissions += 1;
          formSubmissions += 1;
        }
      }
      if (r.formData?.teacherRecommendations?.trim()) {
        withRecommendations += 1;
      }
    }

    return {
      total: weeklyClassRows.length,
      submitted,
      reviewed,
      draft,
      missing,
      photoSubmissions,
      formSubmissions,
      withRecommendations,
    };
  }, [weeklyClassRows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return weeklyClassRows.filter((row) => {
      if (gradeFilter !== "all" && String(row.grade) !== gradeFilter) return false;
      if (q) {
        const hitClass = row.className.toLowerCase().includes(q);
        const hitTeacher = row.teacherName.toLowerCase().includes(q);
        if (!hitClass && !hitTeacher) return false;
      }

      const r = row.report;
      if (statusFilter === "submitted_pending") {
        return r?.status === "submitted";
      }
      if (statusFilter === "reviewed") {
        return r?.status === "reviewed";
      }
      if (statusFilter === "missing") {
        return !r || r.status === "draft";
      }
      if (statusFilter === "photos") {
        return Boolean(r && (r.photos?.length || 0) > 0);
      }
      if (statusFilter === "recommendations") {
        return Boolean(r?.formData?.teacherRecommendations?.trim());
      }
      return true;
    });
  }, [weeklyClassRows, gradeFilter, statusFilter, searchTerm]);

  function openReviewModal(report: HomeroomWeeklyReport) {
    setSelectedReport(report);
    setFeedbackContent(report.principalFeedback?.feedbackContent || "");
    setFeedbackRating(report.principalFeedback?.rating || "");
  }

  async function handleSavePrincipalFeedback() {
    if (!user || !selectedReport) return;
    const trimmed = feedbackContent.trim();
    if (!trimmed) {
      toast.warning("Vui lòng nhập nội dung nhận xét hoặc chọn mẫu nhận xét nhanh.");
      return;
    }

    setSavingFeedback(true);
    try {
      const reviewerName = (user.displayName || user.email || "Hiệu trưởng / BGH").slice(0, 150);
      const feedbackPayload: Record<string, unknown> = {
        reviewedByUid: user.uid,
        reviewedByName: reviewerName,
        reviewedAt: serverTimestamp(),
        feedbackContent: trimmed.slice(0, 5000),
        isAcknowledgedByTeacher: false,
      };
      if (feedbackRating) {
        feedbackPayload.rating = feedbackRating;
      }

      await updateDoc(doc(firestore, "homeroomWeeklyReports", selectedReport.id), {
        status: "reviewed",
        principalFeedback: feedbackPayload,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });

      toast.success(
        `Đã lưu nhận xét cho Lớp ${selectedReport.className} (Tuần ${selectedReport.weekNumber}).`,
      );
      setSelectedReport(null);
    } catch (err) {
      console.error("Lỗi lưu nhận xét BGH:", err);
      toast.error("Không thể lưu nhận xét. Vui lòng thử lại.");
    } finally {
      setSavingFeedback(false);
    }
  }

  function handleExportExcel() {
    if (weeklyClassRows.length === 0) {
      toast.warning("Không có dữ liệu lớp học để xuất.");
      return;
    }

    const exportData = weeklyClassRows.map((row, idx) => {
      const r = row.report;
      const statusText = !r
        ? "Chưa nộp"
        : r.status === "reviewed"
          ? "BGH đã xem & nhận xét"
          : r.status === "submitted"
            ? "Đã gửi BGH"
            : "Bản nháp";

      return {
        STT: idx + 1,
        Lớp: row.className,
        Khối: row.grade || "",
        "Giáo viên chủ nhiệm": row.teacherName,
        "Trạng thái": statusText,
        "Hình thức nộp": r ? submissionTypeLabel(r.submissionType) : "—",
        "Số ảnh đính kèm": r?.photos?.length || 0,
        "Sĩ số / Có mặt": r?.formData
          ? `${r.formData.presentCount}/${r.formData.totalStudents}`
          : "—",
        "HS vắng không phép": r?.formData?.absentWithoutPermission || "",
        "Kiến nghị với BGH": r?.formData?.teacherRecommendations || r?.photoNote || "",
        "Nhận xét Hiệu trưởng": r?.principalFeedback?.feedbackContent || "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Tuan_${selectedWeekNumber}`);
    XLSX.writeFile(workbook, `So_SH_GVCN_Tuan_${selectedWeekNumber}.xlsx`);
    toast.success(`Đã xuất báo cáo Tuần ${selectedWeekNumber} ra Excel.`);
  }

  const matrixWeekNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(matrixWindowStart, 28));
    return Array.from({ length: 8 }, (_, idx) => start + idx).filter((n) => n <= 35);
  }, [matrixWindowStart]);

  const gradeOptions = useMemo(() => {
    const set = new Set<number>();
    classes.forEach((c) => {
      const g = Number(getClassGrade(c) || c.grade || c.gradeLevel || 0);
      if (g > 0) set.add(g);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [classes]);

  return (
    <RoleGuard allowedRoles={["bgh", "admin"]}>
      <Shell>
        <div className="space-y-6">
          <div className="print:hidden">
            <PageHeader
              title="Kiểm tra SỔ SH GVCN toàn trường"
              description="Theo dõi tiến độ nộp báo cáo sinh hoạt lớp của giáo viên chủ nhiệm qua từng tuần, xem form hoặc ảnh chụp sổ giấy và gửi ý kiến chỉ đạo."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={handleExportExcel}>
                    <Download className="h-4 w-4" />
                    Xuất Excel Tuần {selectedWeekNumber}
                  </Button>
                </div>
              }
            />
          </div>

          {loadingBase ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : (
            <>
              {/* Top Controls & KPIs */}
              <Card className="p-4 sm:p-5 print:hidden">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
                  <div className="md:col-span-3">
                    <Label htmlFor="bghYear">Năm học</Label>
                    <select
                      id="bghYear"
                      value={selectedSchoolYearId}
                      onChange={(e) => setSelectedSchoolYearId(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary"
                    >
                      {schoolYears.map((sy) => (
                        <option key={sy.id} value={sy.id}>
                          {sy.name || sy.code || sy.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <Label htmlFor="bghWeek">Tuần theo dõi</Label>
                    <select
                      id="bghWeek"
                      value={selectedWeekNumber}
                      onChange={(e) => setSelectedWeekNumber(Number(e.target.value))}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary"
                    >
                      {weekOptions.map((w) => (
                        <option key={w.weekNumber} value={w.weekNumber}>
                          {w.label}
                          {w.isCurrent ? " [Tuần hiện tại]" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-5 flex flex-wrap items-center justify-end gap-2">
                    <div className="inline-flex rounded-xl border border-border bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setActiveView("weekly")}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                          activeView === "weekly"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <ListChecks className="h-3.5 w-3.5" />
                        Danh sách Tuần {selectedWeekNumber}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveView("matrix")}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                          activeView === "matrix"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Grid3X3 className="h-3.5 w-3.5" />
                        Ma trận qua các tuần
                      </button>
                    </div>
                  </div>
                </div>

                {/* KPI summary cards */}
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-border bg-slate-50/70 p-3.5">
                    <p className="text-xs font-medium text-muted-foreground">Đã nộp Tuần {selectedWeekNumber}</p>
                    <p className="mt-1 text-2xl font-bold text-primary">
                      {weekStats.submitted}
                      <span className="text-sm font-normal text-muted-foreground">/{weekStats.total} lớp</span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {weekStats.formSubmissions} Form • {weekStats.photoSubmissions} Ảnh chụp
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                    <p className="text-xs font-medium text-emerald-800">BGH đã xem & nhận xét</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-700">{weekStats.reviewed}</p>
                    <p className="mt-1 text-[11px] text-emerald-800/80">
                      Còn {Math.max(0, weekStats.submitted - weekStats.reviewed)} báo cáo chờ duyệt
                    </p>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
                    <p className="text-xs font-medium text-rose-800">Chưa nộp báo cáo</p>
                    <p className="mt-1 text-2xl font-bold text-rose-700">{weekStats.missing}</p>
                    <p className="mt-1 text-[11px] text-rose-800/80">
                      {weekStats.draft > 0 ? `+ ${weekStats.draft} lớp đang lưu nháp` : "Cần đôn đốc nộp sổ"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                    <p className="text-xs font-medium text-amber-900">Có kiến nghị gửi BGH</p>
                    <p className="mt-1 text-2xl font-bold text-amber-700">
                      {weekStats.withRecommendations}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-800/80">
                      Lớp có đề xuất cần Hiệu trưởng xem
                    </p>
                  </div>
                </div>
              </Card>

              {activeView === "weekly" ? (
                <Card className="overflow-hidden">
                  {/* Filters */}
                  <div className="flex flex-col gap-3 border-b border-border bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative w-full sm:w-56">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Tìm lớp hoặc tên GVCN..."
                          className="h-9 bg-white pl-9 text-xs"
                        />
                      </div>

                      <select
                        value={gradeFilter}
                        onChange={(e) => setGradeFilter(e.target.value)}
                        className="h-9 rounded-xl border border-border bg-white px-3 text-xs font-medium outline-none focus:border-primary"
                      >
                        <option value="all">Tất cả khối</option>
                        {gradeOptions.map((g) => (
                          <option key={g} value={String(g)}>
                            Khối {g}
                          </option>
                        ))}
                      </select>

                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-9 rounded-xl border border-border bg-white px-3 text-xs font-medium outline-none focus:border-primary"
                      >
                        <option value="all">Tất cả trạng thái</option>
                        <option value="submitted_pending">Đã gửi (Chờ Hiệu trưởng xem)</option>
                        <option value="reviewed">Đã nhận xét</option>
                        <option value="missing">Chưa nộp / Nháp</option>
                        <option value="photos">Có đính kèm ảnh chụp</option>
                        <option value="recommendations">Có kiến nghị với BGH</option>
                      </select>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Hiển thị <strong className="text-foreground">{filteredRows.length}</strong> /{" "}
                      {weeklyClassRows.length} lớp
                    </p>
                  </div>

                  {/* Table */}
                  {loadingReports ? (
                    <div className="p-6">
                      <Skeleton className="h-64 w-full" />
                    </div>
                  ) : filteredRows.length === 0 ? (
                    <EmptyState
                      icon={<ClipboardList className="h-6 w-6" />}
                      title="Không có lớp phù hợp bộ lọc"
                      description="Hãy thử xóa từ khóa tìm kiếm hoặc chọn lại trạng thái lọc."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Lớp</th>
                            <th>Giáo viên chủ nhiệm</th>
                            <th>Trạng thái</th>
                            <th>Hình thức nộp</th>
                            <th>Tóm tắt nhanh / Kiến nghị</th>
                            <th className="text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRows.map((row) => {
                            const r = row.report;
                            const photoCount = r?.photos?.length || 0;
                            const rec = r?.formData?.teacherRecommendations?.trim();
                            const note = r?.photoNote?.trim();

                            return (
                              <tr key={row.classId}>
                                <td className="font-bold text-foreground">
                                  Lớp {row.className}
                                </td>
                                <td className="text-sm text-foreground">{row.teacherName}</td>
                                <td>
                                  {!r ? (
                                    <Badge tone="danger">Chưa nộp</Badge>
                                  ) : r.status === "reviewed" ? (
                                    <Badge tone="success">Đã xem & nhận xét</Badge>
                                  ) : r.status === "submitted" ? (
                                    <Badge tone="info">Đã gửi (Chờ xem)</Badge>
                                  ) : (
                                    <Badge tone="warning">Bản nháp</Badge>
                                  )}
                                </td>
                                <td>
                                  {r ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {r.submissionType === "form_only" ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                                          <FileText className="h-3.5 w-3.5 text-primary" />
                                          Form điện tử
                                        </span>
                                      ) : r.submissionType === "photo_only" ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
                                          <Camera className="h-3.5 w-3.5" />
                                          {photoCount} ảnh chụp
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                          <Layers className="h-3.5 w-3.5" />
                                          Form + {photoCount} ảnh
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="max-w-xs">
                                  {r ? (
                                    <div className="space-y-1 text-xs">
                                      {r.formData && r.formData.totalStudents > 0 ? (
                                        <p className="text-muted-foreground">
                                          Sĩ số:{" "}
                                          <strong className="text-foreground">
                                            {r.formData.presentCount}/{r.formData.totalStudents}
                                          </strong>
                                          {r.formData.tardyCount > 0
                                            ? ` • Đi trễ: ${r.formData.tardyCount}`
                                            : ""}
                                        </p>
                                      ) : null}
                                      {rec ? (
                                        <p className="truncate font-medium text-amber-800" title={rec}>
                                          ⚠ Kiến nghị: {rec}
                                        </p>
                                      ) : note ? (
                                        <p className="truncate text-slate-600" title={note}>
                                          Ghi chú: {note}
                                        </p>
                                      ) : null}
                                      {r.principalFeedback?.feedbackContent ? (
                                        <p className="truncate text-emerald-700">
                                          ✓ BGH: {r.principalFeedback.feedbackContent}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      GVCN chưa cập nhật tuần {selectedWeekNumber}
                                    </span>
                                  )}
                                </td>
                                <td className="text-right">
                                  {r ? (
                                    <Button
                                      size="sm"
                                      variant={r.status === "submitted" ? "primary" : "secondary"}
                                      onClick={() => openReviewModal(r)}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      {r.status === "reviewed" ? "Xem lại" : "Xem & Nhận xét"}
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">
                                      Chờ GVCN
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              ) : (
                /* MATRIX VIEW ACROSS WEEKS */
                <Card className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50/70 p-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        Ma trận theo dõi nộp Sổ SH GVCN qua các tuần
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Bấm trực tiếp vào từng ô tuần của lớp để xem chi tiết báo cáo hoặc nhận xét.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={matrixWindowStart <= 1}
                        onClick={() => setMatrixWindowStart((prev) => Math.max(1, prev - 8))}
                      >
                        8 tuần trước
                      </Button>
                      <span className="text-xs font-semibold text-foreground">
                        Tuần {matrixWeekNumbers[0]} → Tuần {matrixWeekNumbers[matrixWeekNumbers.length - 1]}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={matrixWindowStart + 8 > 35}
                        onClick={() => setMatrixWindowStart((prev) => Math.min(28, prev + 8))}
                      >
                        8 tuần sau
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 bg-muted">Lớp</th>
                          <th>GVCN</th>
                          {matrixWeekNumbers.map((wk) => (
                            <th key={wk} className="text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedWeekNumber(wk);
                                  setActiveView("weekly");
                                }}
                                className="hover:text-primary hover:underline"
                                title={`Xem danh sách Tuần ${wk}`}
                              >
                                T{wk}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {classes
                          .filter((cls) => {
                            if (gradeFilter === "all") return true;
                            const g = Number(getClassGrade(cls) || cls.grade || cls.gradeLevel || 0);
                            return String(g) === gradeFilter;
                          })
                          .map((cls) => {
                            const teacher = cls.homeroomTeacherId
                              ? teachersMap.get(cls.homeroomTeacherId)
                              : undefined;
                            const tName = String(teacher?.fullName || teacher?.name || "—");
                            return (
                              <tr key={cls.id}>
                                <td className="sticky left-0 z-10 bg-card font-bold">
                                  {cls.name || cls.code}
                                </td>
                                <td className="whitespace-nowrap text-xs text-muted-foreground">
                                  {tName}
                                </td>
                                {matrixWeekNumbers.map((wk) => {
                                  const rep = reportLookup.get(`${wk}_${cls.id}`);
                                  return (
                                    <td key={wk} className="text-center">
                                      {rep ? (
                                        <button
                                          type="button"
                                          onClick={() => openReviewModal(rep)}
                                          className={cn(
                                            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition",
                                            rep.status === "reviewed"
                                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                              : rep.status === "submitted"
                                                ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                                                : "bg-amber-100 text-amber-800 hover:bg-amber-200",
                                          )}
                                          title={
                                            rep.status === "reviewed"
                                              ? "BGH đã nhận xét — Bấm để xem"
                                              : rep.status === "submitted"
                                                ? "GVCN đã nộp — Bấm để xem"
                                                : "Bản nháp"
                                          }
                                        >
                                          {rep.status === "reviewed"
                                            ? "✓"
                                            : rep.submissionType === "photo_only"
                                              ? "📷"
                                              : "•"}
                                        </button>
                                      ) : (
                                        <span className="text-xs text-slate-300">—</span>
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

                  <div className="flex flex-wrap items-center gap-4 border-t border-border bg-slate-50/60 px-4 py-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-100 font-bold text-emerald-800">
                        ✓
                      </span>
                      BGH đã xem & nhận xét
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-100 font-bold text-blue-800">
                        •
                      </span>
                      Đã nộp Form (chờ xem)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-100 font-bold text-blue-800">
                        📷
                      </span>
                      Đã nộp Ảnh chụp (chờ xem)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-amber-100 font-bold text-amber-800">
                        •
                      </span>
                      GVCN lưu nháp
                    </span>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Detail & Principal Review Modal */}
        <Modal
          open={Boolean(selectedReport)}
          onOpenChange={(open) => {
            if (!open) setSelectedReport(null);
          }}
          title={
            selectedReport
              ? `Sổ SH GVCN — Lớp ${selectedReport.className} (Tuần ${selectedReport.weekNumber})`
              : "Chi tiết Sổ SH GVCN"
          }
          description={
            selectedReport
              ? `GVCN: ${selectedReport.teacherName} • Hình thức: ${submissionTypeLabel(selectedReport.submissionType)}`
              : undefined
          }
          wide
          footer={
            selectedReport ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setSelectedReport(null)}
                >
                  Đóng
                </Button>
                <Button
                  variant="primary"
                  loading={savingFeedback}
                  onClick={handleSavePrincipalFeedback}
                >
                  <Send className="h-4 w-4" />
                  Lưu nhận xét & Đánh dấu Đã xem
                </Button>
              </div>
            ) : null
          }
        >
          {selectedReport ? (
            <div className="space-y-6">
              <HomeroomReportDetailView
                report={selectedReport}
                weekLabel={
                  weekOptions.find((w) => w.weekNumber === selectedReport.weekNumber)?.label
                }
              />

              {/* Principal Feedback Input Section */}
              <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-4 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <span>Ý kiến nhận xét / Chỉ đạo của Hiệu trưởng & BGH</span>
                  </div>

                  <div className="w-full sm:w-56">
                    <select
                      value={feedbackRating}
                      onChange={(e) =>
                        setFeedbackRating(e.target.value as HomeroomPrincipalRating | "")
                      }
                      className="h-9 w-full rounded-xl border border-border bg-white px-3 text-xs font-medium outline-none focus:border-primary"
                    >
                      <option value="">-- Xếp loại sổ (tùy chọn) --</option>
                      {(Object.keys(homeroomPrincipalRatingLabels) as HomeroomPrincipalRating[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {homeroomPrincipalRatingLabels[key]}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                {/* Quick feedback chips */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_FEEDBACK_TEMPLATES.map((tpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFeedbackContent(tpl)}
                      className="rounded-full border border-border bg-white px-3 py-1 text-[11px] font-medium text-slate-700 transition hover:border-primary hover:bg-primary/5 hover:text-primary"
                    >
                      + {tpl}
                    </button>
                  ))}
                </div>

                <div>
                  <textarea
                    rows={3}
                    value={feedbackContent}
                    onChange={(e) => setFeedbackContent(e.target.value)}
                    placeholder="Nhập nhận xét, đánh giá hoặc chỉ đạo cụ thể gửi đến Giáo viên chủ nhiệm lớp..."
                    className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </Modal>
      </Shell>
    </RoleGuard>
  );
}

export default function BghHomeroomReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <BghHomeroomReportsContent />
    </Suspense>
  );
}
