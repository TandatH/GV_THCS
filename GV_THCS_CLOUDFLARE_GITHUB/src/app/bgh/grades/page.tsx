"use client";

import { useState, useEffect, useMemo, ChangeEvent } from "react";
import {
  FileSpreadsheet,
  Upload,
  Download,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  BookOpen,
  GraduationCap,
  Calendar,
  Lock,
  Unlock,
  Trash2,
  Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { downloadClassGradeTemplate, type SubjectColumn } from "@/lib/exports/grades-excel";
import {
  isGradeWeak,
  gradePeriodTypes,
  type GradePeriodType,
  getClassGrade,
  isSubjectMatchingClassGrade,
  getSubjectPriority,
} from "@school/shared";

type Row = { id: string; [key: string]: any };

type ParsedGradeRow = {
  index: number;
  studentCode: string;
  studentName: string;
  studentId?: string;
  classId?: string;
  className?: string;
  subjectScores: Record<string, { subjectId: string; subjectName: string; score: number | null; isWeak: boolean }>;
  isValid: boolean;
  error?: string;
  weakCount: number;
};

export default function BghGradesPage() {
  const { user, claims } = useAuth();
  const schoolLevel = (typeof claims?.schoolLevel === "string" ? claims.schoolLevel : "secondary") as "primary" | "secondary" | "all";

  // Data lists
  const [periods, setPeriods] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [schoolYears, setSchoolYears] = useState<Row[]>([]);
  const [semesters, setSemesters] = useState<Row[]>([]);
  const [summaries, setSummaries] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab: 'overview' | 'import' | 'periods'
  const [activeTab, setActiveTab] = useState<"overview" | "import" | "periods">("import");

  // Selection states
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState("");

  // Excel Import state
  const [importFileName, setImportFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedGradeRow[]>([]);
  const [detectedSubjects, setDetectedSubjects] = useState<SubjectColumn[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // New Period Modal state
  const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);
  const [newPeriodName, setNewPeriodName] = useState("");
  const [newPeriodType, setNewPeriodType] = useState<GradePeriodType>("midterm");
  const [newPeriodYearId, setNewPeriodYearId] = useState("");
  const [newPeriodSemesterId, setNewPeriodSemesterId] = useState("");
  const [isCreatingPeriod, setIsCreatingPeriod] = useState(false);

  // 1. Subscribe to Firestore collections
  useEffect(() => {
    const unsubPeriods = onSnapshot(collection(firestore, "gradePeriods"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPeriods(list);
      if (list.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(list[0].id);
      }
    });

    const unsubClasses = onSnapshot(collection(firestore, "classes"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
      setClasses(list);
      if (list.length > 0 && !selectedClassId) {
        setSelectedClassId(list[0].id);
      }
    });

    const unsubSubjects = onSnapshot(collection(firestore, "subjects"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      setSubjects(list);
    });

    const unsubStudents = onSnapshot(collection(firestore, "students"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      setStudents(list);
    });

    const unsubYears = onSnapshot(collection(firestore, "schoolYears"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      setSchoolYears(list);
      if (list.length > 0 && !newPeriodYearId) {
        setNewPeriodYearId(list[0].id);
      }
    });

    const unsubSemesters = onSnapshot(collection(firestore, "semesters"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      setSemesters(list);
      if (list.length > 0 && !newPeriodSemesterId) {
        setNewPeriodSemesterId(list[0].id);
      }
      setLoading(false);
    });

    return () => {
      unsubPeriods();
      unsubClasses();
      unsubSubjects();
      unsubStudents();
      unsubYears();
      unsubSemesters();
    };
  }, []);

  // Subscribe to summaries for selected period
  useEffect(() => {
    if (!selectedPeriodId) {
      setSummaries([]);
      return;
    }
    const unsubSummaries = onSnapshot(collection(firestore, "studentPeriodSummaries"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Row)
        .filter((d) => d.periodId === selectedPeriodId);
      setSummaries(list);
    });
    return () => unsubSummaries();
  }, [selectedPeriodId]);

  // Active period object
  const activePeriod = useMemo(() => {
    return periods.find((p) => p.id === selectedPeriodId);
  }, [periods, selectedPeriodId]);

  // Active class object
  const activeClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  // Students in selected class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students.filter((s) => s.classId === selectedClassId && s.isActive !== false);
  }, [students, selectedClassId]);

  // Grade level of active class (e.g. 6 for 6A1, 7 for 7A1)
  const targetGrade = useMemo(() => {
    return getClassGrade(activeClass);
  }, [activeClass]);

  // Filtered subjects for template & detection: strictly match class grade & exclude homeroom (SHL)
  const relevantSubjects = useMemo(() => {
    return subjects
      .filter((s) => isSubjectMatchingClassGrade(s, targetGrade))
      .map((s) => ({
        id: s.id,
        code: String(s.code || "").toUpperCase(),
        name: String(s.name || s.code || ""),
      }))
      .sort((a, b) => {
        const pA = getSubjectPriority(a.name);
        const pB = getSubjectPriority(b.name);
        if (pA !== pB) return pA - pB;
        return a.name.localeCompare(b.name, "vi");
      });
  }, [subjects, targetGrade]);

  // Download template for selected class
  async function handleDownloadTemplate() {
    if (!activeClass) {
      toast.error("Vui lòng chọn lớp học trước khi tải mẫu!");
      return;
    }
    const studentRows = classStudents.map((s) => ({
      studentCode: s.studentCode || "",
      fullName: s.fullName || "",
    }));

    const currentYear = schoolYears.find((y) => y.id === activePeriod?.schoolYearId);

    try {
      await downloadClassGradeTemplate({
        className: activeClass.name || activeClass.code || "Lop",
        periodName: activePeriod?.name || "Dot_Diem",
        schoolYearName: currentYear?.name || currentYear?.code || "",
        students: studentRows,
        subjects: relevantSubjects,
      });
      toast.success(
        `Đã tải mẫu Excel cho lớp ${activeClass.name || ""} (gồm ${relevantSubjects.length} môn khối ${targetGrade || ""})`
      );
    } catch (err) {
      console.error(err);
      toast.error("Không thể tạo file Excel mẫu.");
    }
  }

  // Handle Excel upload
  function handleExcelUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedPeriodId) {
      toast.error("Vui lòng chọn hoặc tạo Đợt điểm trước khi tải file!");
      return;
    }

    if (!selectedClassId) {
      toast.error("Vui lòng chọn Lớp học tương ứng trước khi tải file!");
      return;
    }

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        // Đọc toàn bộ các hàng dưới dạng mảng 2 chiều
        const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
        if (!sheetRows || sheetRows.length === 0) {
          toast.error("File Excel không có dữ liệu!");
          return;
        }

        // Tìm dòng header thông minh (chứa "Mã học sinh" / "Mã HS" hoặc "Họ và tên")
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(sheetRows.length, 10); r++) {
          const row = sheetRows[r];
          if (Array.isArray(row)) {
            const rowStr = row.map((cell) => String(cell || "").toLowerCase().trim());
            const hasCode = rowStr.some((c) =>
              ["mã học sinh", "mã hs", "mahs", "code", "mã"].includes(c)
            );
            const hasName = rowStr.some((c) =>
              ["họ và tên", "họ tên", "hoten", "name", "họ và tên học sinh"].includes(c)
            );
            if (hasCode || (hasName && rowStr.some((c) => c.includes("toán") || c.includes("văn") || c === "stt"))) {
              headerRowIdx = r;
              break;
            }
          }
        }

        if (headerRowIdx === -1) {
          headerRowIdx = 0;
        }

        const rawHeaders = (sheetRows[headerRowIdx] as unknown[]).map((h) => String(h || "").trim());
        const dataRows = sheetRows.slice(headerRowIdx + 1);

        // Map column index to subjects
        const matchedSubjectCols: { sub: SubjectColumn; colIdx: number }[] = [];

        rawHeaders.forEach((header, colIdx) => {
          const cleanHeader = header.trim().toLowerCase();
          if (
            ["stt", "mã học sinh", "mã hs", "mahs", "code", "họ và tên", "họ tên", "hoten", "name", "lớp", "class"].includes(
              cleanHeader
            )
          ) {
            return;
          }

          // Khớp với môn học thuộc danh mục áp dụng của khối này
          const found = relevantSubjects.find(
            (sub) =>
              sub.name.toLowerCase() === cleanHeader ||
              sub.code.toLowerCase() === cleanHeader ||
              cleanHeader.includes(sub.name.toLowerCase()) ||
              sub.name.toLowerCase().includes(cleanHeader)
          );

          if (found && !matchedSubjectCols.some((m) => m.sub.id === found.id)) {
            matchedSubjectCols.push({ sub: found, colIdx });
          }
        });

        if (matchedSubjectCols.length === 0) {
          toast.error("Không nhận diện được cột môn học nào khớp với danh mục môn học của khối này!");
          return;
        }

        setDetectedSubjects(matchedSubjectCols.map((m) => m.sub));

        // Xác định vị trí cột Mã HS và Họ Tên
        const codeColIdx = rawHeaders.findIndex((h) =>
          ["mã học sinh", "mã hs", "mahs", "code", "mã"].includes(h.toLowerCase().trim())
        );
        const nameColIdx = rawHeaders.findIndex((h) =>
          ["họ và tên", "họ tên", "hoten", "name", "họ và tên học sinh"].includes(h.toLowerCase().trim())
        );

        // Map students of this class by studentCode & fullName
        const studentCodeMap = new Map<string, Row>();
        const studentNameMap = new Map<string, Row>();
        classStudents.forEach((st) => {
          if (st.studentCode) studentCodeMap.set(st.studentCode.trim().toUpperCase(), st);
          if (st.fullName) studentNameMap.set(st.fullName.trim().toLowerCase(), st);
        });

        // Parse each row
        const parsed: ParsedGradeRow[] = [];
        let validIdx = 1;

        for (const row of dataRows) {
          if (!Array.isArray(row) || row.length === 0) continue;

          const firstCell = String(row[0] || "").trim();
          // Bỏ qua dòng ghi chú hoặc hướng dẫn ở chân bảng
          if (firstCell.startsWith("*") || firstCell.toLowerCase().startsWith("hướng dẫn") || firstCell.toLowerCase().startsWith("ghi chú")) {
            continue;
          }

          const rawCode = codeColIdx !== -1 ? String(row[codeColIdx] || "").trim().toUpperCase() : "";
          const rawName = nameColIdx !== -1 ? String(row[nameColIdx] || "").trim() : "";

          // Bỏ qua dòng trống cả mã và tên
          if (!rawCode && !rawName) continue;

          const student = studentCodeMap.get(rawCode) || (rawName ? studentNameMap.get(rawName.toLowerCase()) : undefined);

          const subjectScores: Record<string, { subjectId: string; subjectName: string; score: number | null; isWeak: boolean }> = {};
          let weakCount = 0;
          let rowError = "";

          if (!student) {
            rowError = `Không tìm thấy học sinh [${rawCode || rawName || "Chưa rõ"}] trong lớp ${activeClass?.name || ""}`;
          }

          matchedSubjectCols.forEach(({ sub, colIdx }) => {
            const val = row[colIdx];

            if (val === undefined || val === null || String(val).trim() === "") {
              subjectScores[sub.id] = {
                subjectId: sub.id,
                subjectName: sub.name,
                score: null,
                isWeak: false,
              };
            } else {
              const strVal = String(val).trim();
              if (strVal.toLowerCase() === "đ" || strVal.toLowerCase() === "d" || strVal.toLowerCase() === "pass") {
                subjectScores[sub.id] = {
                  subjectId: sub.id,
                  subjectName: sub.name,
                  score: 10,
                  isWeak: false,
                };
              } else if (strVal.toLowerCase() === "cđ" || strVal.toLowerCase() === "cd" || strVal.toLowerCase() === "fail") {
                weakCount++;
                subjectScores[sub.id] = {
                  subjectId: sub.id,
                  subjectName: sub.name,
                  score: 0,
                  isWeak: true,
                };
              } else {
                const num = Number(strVal.replace(",", "."));
                if (isNaN(num) || num < 0 || num > 10) {
                  rowError = `Điểm môn ${sub.name} không hợp lệ ("${val}"). Thang điểm phải từ 0 đến 10.`;
                  subjectScores[sub.id] = {
                    subjectId: sub.id,
                    subjectName: sub.name,
                    score: null,
                    isWeak: false,
                  };
                } else {
                  const weak = isGradeWeak(num);
                  if (weak) weakCount++;
                  subjectScores[sub.id] = {
                    subjectId: sub.id,
                    subjectName: sub.name,
                    score: Math.round(num * 10) / 10,
                    isWeak: weak,
                  };
                }
              }
            }
          });

          parsed.push({
            index: validIdx++,
            studentCode: student?.studentCode || rawCode,
            studentName: student?.fullName || rawName,
            studentId: student?.id,
            classId: activeClass?.id,
            className: activeClass?.name,
            subjectScores,
            isValid: !rowError && Boolean(student?.id),
            error: rowError,
            weakCount,
          });
        }

        setParsedRows(parsed);
        const validCount = parsed.filter((r) => r.isValid).length;
        const totalWeak = parsed.reduce((acc, r) => acc + (r.weakCount > 0 ? 1 : 0), 0);

        toast.success(
          `Đã đọc ${parsed.length} dòng. Nhận diện ${matchedSubjectCols.length} môn học khối ${targetGrade || ""}. Hợp lệ: ${validCount}/${parsed.length}.`
        );
        if (totalWeak > 0) {
          toast.warning(`Phát hiện ${totalWeak} học sinh có ít nhất một môn điểm < 5.0 cần nhắc nhở.`);
        }
      } catch (err) {
        console.error(err);
        toast.error("Có lỗi xảy ra khi xử lý file Excel. Vui lòng kiểm tra định dạng file!");
      }
    };

    reader.readAsBinaryString(file);
    // Reset file input
    e.target.value = "";
  }

  // Save imported grades to Firestore
  async function handleSaveGrades() {
    if (!activePeriod || !activeClass) {
      toast.error("Thiếu thông tin Đợt điểm hoặc Lớp học!");
      return;
    }

    const validRows = parsedRows.filter((r) => r.isValid && r.studentId);
    if (validRows.length === 0) {
      toast.error("Không có dòng dữ liệu hợp lệ nào để lưu!");
      return;
    }

    setIsSaving(true);
    try {
      const periodId = activePeriod.id;
      const classId = activeClass.id;
      const className = activeClass.name || activeClass.code || "";
      const schoolYearId = activePeriod.schoolYearId || "";
      const semesterId = activePeriod.semesterId || "";

      // Firestore batch size limit is 500 operations. We chunk operations.
      const BATCH_SIZE = 400;
      let currentBatch = writeBatch(firestore);
      let opCount = 0;

      for (const row of validRows) {
        const studentId = row.studentId!;
        const studentCode = row.studentCode;
        const studentName = row.studentName;

        let totalScore = 0;
        let countScore = 0;
        const weakSubjectNames: string[] = [];
        const summarySubjectMap: Record<string, unknown> = {};

        // 1. Write individual studentGrades
        for (const sub of detectedSubjects) {
          const entry = row.subjectScores[sub.id];
          if (entry && entry.score !== null) {
            totalScore += entry.score;
            countScore++;
            if (entry.isWeak) {
              weakSubjectNames.push(`${sub.name} (${entry.score})`);
            }

            summarySubjectMap[sub.id] = {
              subjectId: sub.id,
              subjectCode: sub.code,
              subjectName: sub.name,
              score: entry.score,
              isWeak: entry.isWeak,
            };

            const gradeDocId = `${periodId}_${studentId}_${sub.id}`;
            const gradeDocRef = doc(firestore, "studentGrades", gradeDocId);

            currentBatch.set(gradeDocRef, {
              periodId,
              schoolYearId,
              semesterId,
              classId,
              className,
              studentId,
              studentCode,
              studentName,
              subjectId: sub.id,
              subjectCode: sub.code,
              subjectName: sub.name,
              score: entry.score,
              evaluationType: "score",
              isWeak: entry.isWeak,
              updatedAt: serverTimestamp(),
              updatedBy: user?.email || user?.uid || "admin",
            });
            opCount++;

            if (opCount >= BATCH_SIZE) {
              await currentBatch.commit();
              currentBatch = writeBatch(firestore);
              opCount = 0;
            }
          }
        }

        // 2. Write studentPeriodSummary
        const avg = countScore > 0 ? Math.round((totalScore / countScore) * 10) / 10 : null;
        const summaryDocId = `${periodId}_${studentId}`;
        const summaryDocRef = doc(firestore, "studentPeriodSummaries", summaryDocId);

        currentBatch.set(summaryDocRef, {
          periodId,
          schoolYearId,
          semesterId,
          classId,
          className,
          studentId,
          studentCode,
          studentName,
          subjectScores: summarySubjectMap,
          averageScore: avg,
          weakSubjectCount: weakSubjectNames.length,
          weakSubjectNames,
          hasWeakSubjects: weakSubjectNames.length > 0,
          updatedAt: serverTimestamp(),
          updatedBy: user?.email || user?.uid || "admin",
        });
        opCount++;

        if (opCount >= BATCH_SIZE) {
          await currentBatch.commit();
          currentBatch = writeBatch(firestore);
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await currentBatch.commit();
      }

      toast.success(`Đã lưu thành công điểm số cho ${validRows.length} học sinh lớp ${className}!`);
      // Clear parsed preview
      setParsedRows([]);
      setImportFileName("");
      setActiveTab("overview");
    } catch (err) {
      console.error(err);
      toast.error("Lưu dữ liệu thất bại! Vui lòng kiểm tra quyền hoặc thử lại.");
    } finally {
      setIsSaving(false);
    }
  }

  // Create new period
  async function handleCreatePeriod() {
    if (!newPeriodName.trim()) {
      toast.error("Vui lòng nhập tên đợt điểm!");
      return;
    }
    if (!newPeriodYearId || !newPeriodSemesterId) {
      toast.error("Vui lòng chọn năm học và học kỳ!");
      return;
    }

    setIsCreatingPeriod(true);
    try {
      const periodRef = doc(collection(firestore, "gradePeriods"));
      await setDoc(periodRef, {
        name: newPeriodName.trim(),
        schoolYearId: newPeriodYearId,
        semesterId: newPeriodSemesterId,
        periodType: newPeriodType,
        schoolLevel,
        status: "published",
        createdAt: serverTimestamp(),
        createdBy: user?.email || user?.uid || "admin",
      });

      toast.success(`Đã tạo đợt điểm "${newPeriodName}" thành công!`);
      setSelectedPeriodId(periodRef.id);
      setShowNewPeriodModal(false);
      setNewPeriodName("");
    } catch (err) {
      console.error(err);
      toast.error("Không thể tạo đợt điểm. Vui lòng thử lại!");
    } finally {
      setIsCreatingPeriod(false);
    }
  }

  // Toggle lock period
  async function handleTogglePeriodStatus(period: Row) {
    const nextStatus = period.status === "locked" ? "published" : "locked";
    try {
      await setDoc(
        doc(firestore, "gradePeriods", period.id),
        { status: nextStatus, updatedAt: serverTimestamp() },
        { merge: true }
      );
      toast.success(nextStatus === "locked" ? "Đã khóa đợt điểm." : "Đã mở khóa đợt điểm.");
    } catch {
      toast.error("Thao tác thất bại.");
    }
  }

  // Delete period
  async function handleDeletePeriod(periodId: string) {
    if (!confirm("Bạn có chắc chắn muốn xóa đợt điểm này? Toàn bộ điểm liên quan vẫn cần xóa thủ công nếu đã nhập.")) {
      return;
    }
    try {
      await deleteDoc(doc(firestore, "gradePeriods", periodId));
      toast.success("Đã xóa đợt điểm.");
    } catch {
      toast.error("Không thể xóa đợt điểm.");
    }
  }

  // Compute stats for overview tab
  const overviewStats = useMemo(() => {
    const totalStudentsInPeriod = summaries.length;
    const weakStudents = summaries.filter((s) => s.hasWeakSubjects);
    const classesWithGrades = new Set(summaries.map((s) => s.classId)).size;

    // Weak subject frequency
    const weakSubjectTally: Record<string, number> = {};
    summaries.forEach((s) => {
      if (s.subjectScores) {
        Object.values(s.subjectScores as Record<string, { isWeak: boolean; subjectName: string }>).forEach((entry) => {
          if (entry.isWeak && entry.subjectName) {
            weakSubjectTally[entry.subjectName] = (weakSubjectTally[entry.subjectName] || 0) + 1;
          }
        });
      }
    });

    const topWeakSubjects = Object.entries(weakSubjectTally)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalStudentsInPeriod,
      weakStudentCount: weakStudents.length,
      weakRate: totalStudentsInPeriod > 0 ? Math.round((weakStudents.length / totalStudentsInPeriod) * 100) : 0,
      classesWithGrades,
      topWeakSubjects,
    };
  }, [summaries]);

  // Filtered summaries for overview table
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (selectedClassId && s.classId !== selectedClassId) return false;
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        String(s.studentName || "").toLowerCase().includes(q) ||
        String(s.studentCode || "").toLowerCase().includes(q) ||
        String(s.className || "").toLowerCase().includes(q)
      );
    });
  }, [summaries, selectedClassId, searchFilter]);

  return (
    <RoleGuard allowedRoles={["bgh", "admin"]}>
      <Shell>
        <PageHeader
          title="Quản Lý Điểm Số & Đợt Đánh Giá"
          description="Tải lên bảng điểm Excel từ các môn học, tự động đối soát và phát hiện học sinh yếu môn để hỗ trợ GVCN nhắc nhở kịp thời."
        />

        {/* Global Toolbar: Select Period & Actions */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Đợt đánh giá / Điểm số</Label>
              <select
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.status === "locked" ? "(Đã khóa)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {activePeriod && (
              <div className="mt-4 flex items-center gap-2">
                <Badge tone={activePeriod.status === "locked" ? "danger" : "success"}>
                  {activePeriod.status === "locked" ? "Đã khóa" : "Đang mở"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Loại: {activePeriod.periodType === "midterm" ? "Giữa kỳ" : activePeriod.periodType === "final" ? "Cuối kỳ" : "Thường xuyên"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowNewPeriodModal(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Tạo đợt điểm mới
            </Button>
          </div>
        </div>

        {/* Tabs switcher */}
        <div className="mb-6 flex border-b border-border">
          <button
            onClick={() => setActiveTab("import")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "import"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Upload className="h-4 w-4" />
            Nhập điểm từ Excel
          </button>
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Tổng quan điểm & Cảnh báo ({summaries.length})
          </button>
          <button
            onClick={() => setActiveTab("periods")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "periods"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Calendar className="h-4 w-4" />
            Danh sách các đợt điểm ({periods.length})
          </button>
        </div>

        {/* TAB 1: IMPORT FROM EXCEL */}
        {activeTab === "import" && (
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="mb-2 text-base font-bold text-foreground">Bước 1: Chọn lớp và tải file mẫu Excel</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Hệ thống sẽ tạo file Excel chứa sẵn danh sách học sinh của lớp cùng các cột môn học tương ứng. Bạn chỉ cần điền điểm rồi tải lên lại.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="importClassSelect" className="text-xs">Lớp học cần nhập điểm</Label>
                  <select
                    id="importClassSelect"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                    value={selectedClassId}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      setParsedRows([]);
                    }}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.code}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 flex items-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleDownloadTemplate}
                    disabled={!selectedClassId}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4 text-primary" />
                    Tải mẫu Excel lớp {activeClass?.name || ""} (.xlsx)
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="mb-2 text-base font-bold text-foreground">Bước 2: Tải lên file điểm đã điền</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Hỗ trợ file `.xlsx` hoặc `.xls`. Hệ thống tự động so khớp mã học sinh và phát hiện các môn điểm dưới 5.0.
              </p>

              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-8 text-center transition hover:border-primary/50">
                <FileSpreadsheet className="mb-3 h-12 w-12 text-primary" />
                <p className="mb-1 text-sm font-semibold text-foreground">
                  {importFileName ? `Đã chọn: ${importFileName}` : "Kéo và thả file Excel vào đây, hoặc bấm để chọn"}
                </p>
                <p className="mb-4 text-xs text-muted-foreground">Dung lượng tối đa 10MB (.xlsx, .xls)</p>
                <label className="cursor-pointer">
                  <Button variant="primary" size="sm" asChild>
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      Chọn file Excel
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleExcelUpload}
                  />
                </label>
              </div>
            </Card>

            {/* PREVIEW TABLE */}
            {parsedRows.length > 0 && (
              <Card className="overflow-hidden p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Bước 3: Kiểm tra dữ liệu xem trước</h3>
                    <p className="text-xs text-muted-foreground">
                      Tổng số: <strong>{parsedRows.length}</strong> học sinh | Nhận diện:{" "}
                      <strong>{detectedSubjects.length}</strong> môn học | Học sinh có môn yếu:{" "}
                      <strong className="text-rose-600">
                        {parsedRows.filter((r) => r.weakCount > 0).length} em
                      </strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="primary"
                      onClick={handleSaveGrades}
                      loading={isSaving}
                      className="gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Lưu {parsedRows.filter((r) => r.isValid).length} kết quả vào hệ thống
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="data-table min-w-[900px]">
                    <thead>
                      <tr>
                        <th className="w-12 text-center">STT</th>
                        <th className="w-28">Mã HS</th>
                        <th className="w-48">Họ và tên</th>
                        {detectedSubjects.map((sub) => (
                          <th key={sub.id} className="text-center">
                            {sub.name}
                          </th>
                        ))}
                        <th className="w-24 text-center">Môn yếu</th>
                        <th className="w-36">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row) => (
                        <tr key={row.index} className={!row.isValid ? "bg-rose-50/50 dark:bg-rose-950/20" : ""}>
                          <td className="text-center font-medium text-muted-foreground">{row.index}</td>
                          <td>
                            <code className="rounded bg-muted px-2 py-0.5 text-xs font-bold">
                              {row.studentCode || "-"}
                            </code>
                          </td>
                          <td className="font-semibold text-foreground">{row.studentName || "-"}</td>
                          {detectedSubjects.map((sub) => {
                            const entry = row.subjectScores[sub.id];
                            const score = entry?.score;
                            const isWeak = entry?.isWeak;
                            return (
                              <td key={sub.id} className="text-center">
                                {score !== null && score !== undefined ? (
                                  <span
                                    className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                                      isWeak
                                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                                        : "text-foreground"
                                    }`}
                                  >
                                    {score}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="text-center">
                            {row.weakCount > 0 ? (
                              <Badge tone="danger">{row.weakCount} môn</Badge>
                            ) : (
                              <Badge tone="success">Đạt</Badge>
                            )}
                          </td>
                          <td>
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Hợp lệ
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"
                                title={row.error}
                              >
                                <XCircle className="h-3.5 w-3.5" /> Lỗi đối chiếu
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* TAB 2: OVERVIEW & WEAK STUDENTS ALERT */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Quick Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Tổng học sinh đã nhập điểm</p>
                <p className="mt-1 text-2xl font-black text-foreground">{overviewStats.totalStudentsInPeriod} em</p>
                <p className="text-xs text-muted-foreground mt-1">Từ {overviewStats.classesWithGrades} lớp học</p>
              </Card>

              <Card className="p-4 border-rose-200 bg-rose-50/30 dark:bg-rose-950/10">
                <p className="text-xs text-rose-700 font-semibold">Học sinh có môn yếu (&lt; 5.0)</p>
                <p className="mt-1 text-2xl font-black text-rose-600">{overviewStats.weakStudentCount} em</p>
                <p className="text-xs text-rose-600 mt-1">Chiếm {overviewStats.weakRate}% số học sinh</p>
              </Card>

              <Card className="p-4 sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-1 font-semibold">Môn học có nhiều học sinh yếu nhất:</p>
                {overviewStats.topWeakSubjects.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {overviewStats.topWeakSubjects.slice(0, 4).map((sub) => (
                      <Badge key={sub.name} tone="danger" className="text-xs">
                        {sub.name}: {sub.count} em
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-600 font-medium">Không có môn nào bị điểm yếu!</p>
                )}
              </Card>
            </div>

            {/* Filter toolbar */}
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Tìm theo tên hoặc mã học sinh..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>

                  <div>
                    <select
                      className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                      <option value="">-- Tất cả các lớp --</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          Lớp {c.name || c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Hiển thị <strong>{filteredSummaries.length}</strong> học sinh
                </div>
              </div>
            </Card>

            {/* Summaries Table */}
            <Card className="overflow-hidden">
              {filteredSummaries.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-8 w-8" />}
                  title="Chưa có dữ liệu điểm"
                  description="Hãy chuyển sang tab 'Nhập điểm từ Excel' để tải dữ liệu điểm cho lớp."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[850px]">
                    <thead>
                      <tr>
                        <th className="w-12 text-center">STT</th>
                        <th className="w-28">Mã HS</th>
                        <th className="w-48">Họ và tên</th>
                        <th className="w-24">Lớp</th>
                        <th className="w-28 text-center">Điểm TB</th>
                        <th>Danh sách môn yếu (&lt; 5.0)</th>
                        <th className="w-32 text-center">Đánh giá</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSummaries.map((row, idx) => (
                        <tr key={row.id}>
                          <td className="text-center font-medium text-muted-foreground">{idx + 1}</td>
                          <td>
                            <code className="rounded bg-muted px-2 py-0.5 text-xs font-bold">
                              {row.studentCode}
                            </code>
                          </td>
                          <td className="font-semibold text-foreground">{row.studentName}</td>
                          <td>
                            <Badge tone="neutral">{row.className || "-"}</Badge>
                          </td>
                          <td className="text-center font-bold">
                            {row.averageScore !== null && row.averageScore !== undefined ? row.averageScore : "-"}
                          </td>
                          <td>
                            {row.weakSubjectNames && row.weakSubjectNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {row.weakSubjectNames.map((name: string, i: number) => (
                                  <Badge key={i} tone="danger" className="text-xs">
                                    {name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-emerald-600 font-medium">Không có</span>
                            )}
                          </td>
                          <td className="text-center">
                            {row.hasWeakSubjects ? (
                              <Badge tone="danger">Cần nhắc nhở</Badge>
                            ) : (
                              <Badge tone="success">Đạt yêu cầu</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 3: PERIODS MANAGEMENT */}
        {activeTab === "periods" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-foreground">Danh mục Đợt đánh giá điểm</h3>
                <p className="text-xs text-muted-foreground">
                  Quản lý các đợt thi, đợt kiểm tra định kỳ trong năm học.
                </p>
              </div>
              <Button onClick={() => setShowNewPeriodModal(true)} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Tạo đợt mới
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {periods.map((p) => (
                <Card key={p.id} className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-bold text-foreground text-base">{p.name}</h4>
                      <Badge tone={p.status === "locked" ? "danger" : "success"}>
                        {p.status === "locked" ? "Đã khóa" : "Đang mở"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Hình thức: {p.periodType === "midterm" ? "Kiểm tra Giữa kỳ" : p.periodType === "final" ? "Kiểm tra Cuối kỳ" : "Kiểm tra Thường xuyên"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePeriodStatus(p)}
                      className="text-xs gap-1"
                    >
                      {p.status === "locked" ? (
                        <>
                          <Unlock className="h-3.5 w-3.5 text-emerald-600" /> Mở khóa
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5 text-amber-600" /> Khóa đợt
                        </>
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePeriod(p.id)}
                      className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* MODAL: CREATE NEW PERIOD */}
        {showNewPeriodModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md p-6 space-y-4">
              <h3 className="text-lg font-bold text-foreground">Tạo Đợt Điểm Mới</h3>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="periodNameInput">Tên đợt điểm</Label>
                  <Input
                    id="periodNameInput"
                    placeholder="VD: Kiểm tra Giữa kỳ 1 (2026-2027)"
                    value={newPeriodName}
                    onChange={(e) => setNewPeriodName(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="periodTypeSelect">Loại đợt kiểm tra</Label>
                  <select
                    id="periodTypeSelect"
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={newPeriodType}
                    onChange={(e) => setNewPeriodType(e.target.value as GradePeriodType)}
                  >
                    <option value="midterm">Giữa học kỳ</option>
                    <option value="final">Cuối học kỳ</option>
                    <option value="regular">Thường xuyên</option>
                    <option value="monthly">Đánh giá theo tháng</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="periodYearSelect">Năm học</Label>
                    <select
                      id="periodYearSelect"
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      value={newPeriodYearId}
                      onChange={(e) => setNewPeriodYearId(e.target.value)}
                    >
                      {schoolYears.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name || y.code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="periodSemesterSelect">Học kỳ</Label>
                    <select
                      id="periodSemesterSelect"
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      value={newPeriodSemesterId}
                      onChange={(e) => setNewPeriodSemesterId(e.target.value)}
                    >
                      {semesters.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowNewPeriodModal(false)}
                >
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreatePeriod}
                  loading={isCreatingPeriod}
                >
                  Tạo đợt điểm
                </Button>
              </div>
            </Card>
          </div>
        )}
      </Shell>
    </RoleGuard>
  );
}
