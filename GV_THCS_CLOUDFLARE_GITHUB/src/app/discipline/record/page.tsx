"use client";

import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  GraduationCap,
  History,
  Info,
  Layers,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
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
  disciplineCategories,
  disciplineCategoryLabels,
  disciplineUnitTypeLabels,
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
import { recordDisciplineViolation, type RecordDisciplineViolationInput } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";

type OptionRow = DocumentData & { id: string; name?: string; code?: string; isActive?: boolean };
type WeekRow = DocumentData & { id: string; weekNumber: number; schoolYearId: string; status?: string };
type StudentOption = DocumentData & { id: string; studentCode: string; fullName: string; classId: string; className: string };
type CriterionOption = DocumentData & {
  id: string;
  code: string;
  name: string;
  category: DisciplineCategory;
  unitType: "per_student" | "per_occurrence" | "per_unit";
  defaultPoints: number;
  displayUnitText?: string;
  scope: "student" | "class" | "both";
  isActive?: boolean;
};

function RecordDisciplineForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");
  const { user, role } = useAuth();

  // Kiểm tra phân quyền Ban Kỷ luật
  const [hasDisciplinePermission, setHasDisciplinePermission] = useState<boolean | null>(null);
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [permissionChecking, setPermissionChecking] = useState<boolean>(true);

  // Dữ liệu phiếu cần sửa (nếu có editId)
  const [editingEntry, setEditingEntry] = useState<DocumentData | null>(null);
  const [loadingEdit, setLoadingEdit] = useState<boolean>(false);

  // Danh mục nền
  const [schoolYears, setSchoolYears] = useState<OptionRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [classes, setClasses] = useState<OptionRow[]>([]);
  const [criteria, setCriteria] = useState<CriterionOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);

  // Dữ liệu Form
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [occurredDate, setOccurredDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [period, setPeriod] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // Tiêu chí & nhóm
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("all");
  const [selectedCriterionId, setSelectedCriterionId] = useState<string>("");
  const [criterionSearchTerm, setCriterionSearchTerm] = useState<string>("");

  // Phạm vi & Học sinh
  const [scope, setScope] = useState<"student" | "class">("student");
  const [selectedStudents, setSelectedStudents] = useState<StudentOption[]>([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);

  // Ghi chú & minh chứng
  const [note, setNote] = useState<string>("");
  const [attachmentUrl, setAttachmentUrl] = useState<string>("");

  // Trạng thái gửi form
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  // 0. TẢI DỮ LIỆU PHIẾU BỊ TRẢ LẠI KHI CÓ editId
  useEffect(() => {
    if (!editId) {
      setEditingEntry(null);
      return;
    }
    async function fetchEditEntry() {
      setLoadingEdit(true);
      try {
        const snap = await getDoc(doc(firestore, "disciplineEntries", editId!));
        if (snap.exists()) {
          const data = snap.data();
          setEditingEntry(data);
          if (data.schoolYearId) setSelectedSchoolYearId(data.schoolYearId);
          if (data.weekId) setSelectedWeekId(data.weekId);
          if (data.occurredDate) setOccurredDate(data.occurredDate);
          if (data.period) setPeriod(String(data.period));
          if (data.classId) setSelectedClassId(data.classId);
          if (data.criterionId) setSelectedCriterionId(data.criterionId);
          if (data.scope) setScope(data.scope);
          if (data.quantity) setQuantity(data.quantity);
          if (data.note) setNote(data.note || "");
          if (data.attachmentUrls && data.attachmentUrls.length > 0) {
            setAttachmentUrl(data.attachmentUrls[0]);
          }
        }
      } catch (err) {
        console.error("Lỗi tải phiếu cần sửa:", err);
      } finally {
        setLoadingEdit(false);
      }
    }
    fetchEditEntry();
  }, [editId]);

  // 1. KIỂM TRA PHÂN QUYỀN BAN KỶ LUẬT CỦA USER
  useEffect(() => {
    async function checkPermission() {
      if (!user) return;
      setPermissionChecking(true);
      // Admin hoặc BGH mặc nhiên có quyền
      if (role === "admin" || role === "bgh") {
        setHasDisciplinePermission(true);
        setAssignedClassIds([]); // Rỗng = Toàn trường
        setPermissionChecking(false);
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult();
        const claims = tokenResult.claims;

        // Kiểm tra custom claims
        if (claims.isDisciplineCommittee === true || claims.disciplineRole === "discipline_committee") {
          setHasDisciplinePermission(true);
          const claimClasses = (claims.assignedClassIds as string[]) || [];
          setAssignedClassIds(claimClasses);
          setPermissionChecking(false);
          return;
        }

        // Kiểm tra document phân quyền trong Firestore
        const assignDocRef = doc(firestore, "disciplineAssignments", `${user.uid}_discipline_committee`);
        const assignSnap = await getDoc(assignDocRef);

        if (assignSnap.exists() && assignSnap.data()?.isActive !== false) {
          setHasDisciplinePermission(true);
          const docClasses = (assignSnap.data()?.assignedClassIds as string[]) || [];
          setAssignedClassIds(docClasses);
        } else {
          setHasDisciplinePermission(false);
        }
      } catch (err) {
        console.error("Lỗi kiểm tra quyền Ban Kỷ luật:", err);
        setHasDisciplinePermission(false);
      } finally {
        setPermissionChecking(false);
      }
    }

    checkPermission();
  }, [user, role]);

  // 2. TẢI DANH MỤC NỀN (Năm học, Tuần, Tiêu chí)
  useEffect(() => {
    // Năm học
    const unsubYears = onSnapshot(collection(firestore, "schoolYears"), (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
      setSchoolYears(rows);
      if (rows.length > 0 && !selectedSchoolYearId) {
        const active = rows.find((y) => y.isActive) || rows[0];
        setSelectedSchoolYearId(active.id);
      }
    });

    // Tiêu chí 33 mục
    const unsubCriteria = onSnapshot(collection(firestore, "disciplineCriteria"), (snapshot) => {
      const rows = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() })) as CriterionOption[];
      const activeRows = rows.filter((c) => c.isActive !== false);
      activeRows.sort((a, b) => a.code.localeCompare(b.code));
      setCriteria(activeRows);
      if (activeRows.length > 0 && !selectedCriterionId) {
        setSelectedCriterionId(activeRows[0].id);
      }
    });

    return () => {
      unsubYears();
      unsubCriteria();
    };
  }, [selectedSchoolYearId, selectedCriterionId]);

  // 3. TẢI TUẦN THI ĐUA & LỚP THEO NĂM HỌC
  useEffect(() => {
    if (!selectedSchoolYearId) return;

    // Tuần thi đua
    const qWeeks = query(
      collection(firestore, "disciplineWeeks"),
      where("schoolYearId", "==", selectedSchoolYearId),
    );
    const unsubWeeks = onSnapshot(qWeeks, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as WeekRow[];
      rows.sort((a, b) => a.weekNumber - b.weekNumber);
      setWeeks(rows);
      if (rows.length > 0 && !selectedWeekId) {
        const activeWeek = rows.find((w) => w.status !== "locked") || rows[0];
        setSelectedWeekId(activeWeek.id);
      }
    });

    // Lớp học
    const qClasses = query(
      collection(firestore, "classes"),
      where("schoolYearId", "==", selectedSchoolYearId),
    );
    const unsubClasses = onSnapshot(qClasses, (snapshot) => {
      const allRows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];

      // LỌC THEO PHẠM VI LỚP ĐƯỢC PHÂN CÔNG (ASSIGNED CLASSES SCOPE)
      let availableClasses = allRows;
      if (assignedClassIds.length > 0) {
        availableClasses = allRows.filter((c) => assignedClassIds.includes(c.id));
      }

      setClasses(availableClasses);
      if (availableClasses.length > 0) {
        if (!selectedClassId || !availableClasses.some((c) => c.id === selectedClassId)) {
          setSelectedClassId(availableClasses[0].id);
        }
      } else {
        setSelectedClassId("");
      }
    });

    return () => {
      unsubWeeks();
      unsubClasses();
    };
  }, [selectedSchoolYearId, selectedWeekId, selectedClassId, assignedClassIds]);

  // 4. KHI ĐỔI LỚP: BẮT BUỘC XÓA SẠCH HỌC SINH ĐÃ CHỌN TRƯỚC ĐÓ VÀ TẢI HỌC SINH MỚI
  useEffect(() => {
    // Reset danh sách học sinh đã chọn khi lớp thay đổi
    setSelectedStudents([]);
    setStudentSearchTerm("");

    if (!selectedClassId) {
      setStudents([]);
      return;
    }

    const qStudents = query(
      collection(firestore, "students"),
      where("classId", "==", selectedClassId),
    );

    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as StudentOption[];
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setStudents(rows);

      if (editingEntry?.studentIds && Array.isArray(editingEntry.studentIds) && editingEntry.classId === selectedClassId) {
        const matched = rows.filter((r) => editingEntry.studentIds.includes(r.id));
        if (matched.length > 0) {
          setSelectedStudents(matched);
        }
      }
    });

    return () => unsubStudents();
  }, [selectedClassId]);

  // Tiêu chí đang chọn
  const activeCriterion = useMemo(() => {
    return criteria.find((c) => c.id === selectedCriterionId);
  }, [criteria, selectedCriterionId]);

  // Tuần đang chọn
  const activeWeek = useMemo(() => {
    return weeks.find((w) => w.id === selectedWeekId);
  }, [weeks, selectedWeekId]);

  // Lớp đang chọn
  const activeClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  // Tự động đồng bộ số lượng khi chọn học sinh cá nhân
  const effectiveQuantity = useMemo(() => {
    if (scope === "student") {
      return Math.max(1, selectedStudents.length);
    }
    return Math.max(1, quantity);
  }, [scope, selectedStudents.length, quantity]);

  // Tính điểm tổng dự kiến
  const estimatedTotalPoints = useMemo(() => {
    if (!activeCriterion) return 0;
    return activeCriterion.defaultPoints * effectiveQuantity;
  }, [activeCriterion, effectiveQuantity]);

  // Lọc tiêu chí hiển thị
  const filteredCriteria = useMemo(() => {
    return criteria.filter((c) => {
      const matchCat = selectedCategoryTab === "all" || c.category === selectedCategoryTab;
      const term = criterionSearchTerm.trim().toLowerCase();
      const matchSearch =
        !term || c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
  }, [criteria, selectedCategoryTab, criterionSearchTerm]);

  // Lọc học sinh trong lớp để chọn
  const filteredStudents = useMemo(() => {
    const term = studentSearchTerm.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(term) ||
        s.studentCode.toLowerCase().includes(term),
    );
  }, [students, studentSearchTerm]);

  // Thêm/Xóa học sinh khỏi danh sách vi phạm
  function handleToggleStudent(student: StudentOption) {
    const exists = selectedStudents.some((s) => s.id === student.id);
    if (exists) {
      setSelectedStudents(selectedStudents.filter((s) => s.id !== student.id));
    } else {
      setSelectedStudents([...selectedStudents, student]);
    }
  }

  // Xóa nhanh học sinh đã chọn
  function handleRemoveStudent(studentId: string) {
    setSelectedStudents(selectedStudents.filter((s) => s.id !== studentId));
  }

  // GỬI PHIẾU GHI NHẬN VI PHẠM
  async function handleSubmitRecord(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedClassId || !activeClass) {
      toast.error("Vui lòng chọn lớp học.");
      return;
    }

    if (!selectedWeekId || !activeWeek) {
      toast.error("Vui lòng chọn tuần thi đua.");
      return;
    }

    if (activeWeek.status === "locked") {
      toast.error("Tuần thi đua này đã bị khóa sổ. Không thể ghi nhận thêm.");
      return;
    }

    if (!selectedCriterionId || !activeCriterion) {
      toast.error("Vui lòng chọn một mục tiêu chí vi phạm.");
      return;
    }

    if (scope === "student" && selectedStudents.length === 0) {
      toast.error("Vui lòng chọn ít nhất một học sinh vi phạm.");
      return;
    }

    // Khóa bấm gửi liên tục
    setIsSubmitting(true);
    // Tạo idempotencyKey duy nhất chống trùng lặp do mạng hoặc bấm nhiều lần
    const idempotencyKey = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const payload: RecordDisciplineViolationInput = {
        entryId: editId || undefined,
        classId: selectedClassId,
        weekId: selectedWeekId,
        schoolYearId: selectedSchoolYearId,
        criterionId: selectedCriterionId,
        criterionCode: activeCriterion.code,
        scope,
        studentIds: scope === "student" ? selectedStudents.map((s) => s.id) : [],
        studentNamesText: scope === "student" ? selectedStudents.map((s) => s.fullName).join("; ") : "Tập thể lớp",
        quantity: effectiveQuantity,
        occurredDate,
        date: occurredDate,
        period: period ? Number(period) : undefined,
        students:
          scope === "student"
            ? selectedStudents.map((s) => ({ studentId: s.id, studentName: s.fullName }))
            : [],
        note: note.trim(),
        attachmentUrls: attachmentUrl.trim() ? [attachmentUrl.trim()] : [],
        idempotencyKey,
      };

      await recordDisciplineViolation(payload);

      if (editId) {
        toast.success("Đã cập nhật và gửi lại phiếu vi phạm, đang chờ Ban Thi đua duyệt.");
        router.push("/discipline/my-records");
      } else {
        toast.success("Đã gửi ghi nhận, đang chờ Ban Thi đua duyệt.");
        setSubmitSuccess(true);

        // Reset form nhưng giữ nguyên Lớp và Tuần để tiện ghi nhận tiếp
        setSelectedStudents([]);
        setNote("");
        setAttachmentUrl("");
        setQuantity(1);

        // Tắt trạng thái thành công sau 4 giây
        setTimeout(() => setSubmitSuccess(false), 4000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Lỗi ghi nhận vi phạm:", err);
      toast.error("Lỗi ghi nhận: " + msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh", "giaovien", "totruong"]}>
      <Shell>
        <div className="max-w-2xl mx-auto space-y-6 pb-12">
          {/* HEADER TRANG */}
          <PageHeader
            eyebrow="Ban Kỷ luật"
            title="Ghi nhận vi phạm học sinh"
            description="Giao diện ghi nhận nhanh các vi phạm nề nếp, kỷ luật và học tập dành riêng cho thành viên Ban Kỷ luật."
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/discipline/my-records")}
                className="gap-2"
              >
                <History className="h-4 w-4" />
                Lịch sử ghi nhận
              </Button>
            }
          />

          {/* KIỂM TRA PHÂN QUYỀN BAN KỶ LUẬT */}
          {permissionChecking ? (
            <Card className="p-6 text-center space-y-3">
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
            </Card>
          ) : !hasDisciplinePermission ? (
            <Card className="p-8 text-center border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
              <ShieldAlert className="h-12 w-12 text-amber-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-foreground">Bạn chưa có quyền Ban Kỷ luật</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                Tài khoản này chưa được Ban Giám Hiệu hoặc Quản trị viên phân công vào Ban Kỷ luật trong năm học này.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="secondary" onClick={() => router.push("/dashboard")}>
                  Về trang chủ
                </Button>
              </div>
            </Card>
          ) : (
            <form onSubmit={handleSubmitRecord} className="space-y-6">
              {/* THÔNG BÁO SỬA PHIẾU BỊ TRẢ LẠI */}
              {editingEntry && (
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm space-y-2 animate-in fade-in">
                  <div className="font-bold flex items-center gap-2 text-base">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                    Chế độ cập nhật: Đang sửa phiếu vi phạm bị trả lại
                  </div>
                  {editingEntry.reviewNote && (
                    <div className="p-2.5 rounded-lg bg-amber-100/70 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-xs">
                      <strong>Ý kiến từ Ban Thi đua ({editingEntry.reviewedByName || "Người duyệt"}):</strong>{" "}
                      {editingEntry.reviewNote}
                    </div>
                  )}
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Vui lòng điều chỉnh thông tin hoặc bổ sung minh chứng theo yêu cầu và bấm{" "}
                    <strong>Cập nhật & Gửi lại</strong> bên dưới.
                  </p>
                </div>
              )}

              {/* THÔNG BÁO THÀNH CÔNG NỔI BẬT */}
              {submitSuccess && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300 transition-all animate-in fade-in">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
                  <div className="text-sm">
                    <strong>Đã gửi ghi nhận thành công!</strong> Phiếu vi phạm đang ở trạng thái <em>Chờ duyệt</em>. Điểm thi đua sẽ được cộng/trừ chính thức sau khi Ban Thi đua phê duyệt.
                  </div>
                </div>
              )}

              {/* BƯỚC 1: THỜI GIAN & LỚP HỌC */}
              <Card className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-primary uppercase tracking-wide border-b pb-2">
                  <Calendar className="h-4 w-4" />
                  1. Thời gian & Lớp học
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* TUẦN THI ĐUA */}
                  <div>
                    <Label htmlFor="recordWeekSelect" className="text-xs font-semibold">Tuần thi đua *</Label>
                    <select
                      id="recordWeekSelect"
                      value={selectedWeekId}
                      onChange={(e) => setSelectedWeekId(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-semibold shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                      required
                    >
                      {weeks.map((w) => (
                        <option key={w.id} value={w.id}>
                          Tuần {w.weekNumber} {w.status === "locked" ? "🔒 (Đã khóa)" : "(Đang mở)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* LỚP HỌC */}
                  <div>
                    <Label htmlFor="recordClassSelect" className="text-xs font-semibold">
                      Lớp học * {assignedClassIds.length > 0 && <span className="text-[11px] text-muted-foreground font-normal">(Lớp được phân công)</span>}
                    </Label>
                    <select
                      id="recordClassSelect"
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-bold text-primary shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                      required
                    >
                      {classes.length === 0 ? (
                        <option value="">Không có lớp trong phạm vi phụ trách</option>
                      ) : (
                        classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            Lớp {c.name || c.code}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* NGÀY XẢY RA */}
                  <div>
                    <Label htmlFor="recordDate" className="text-xs font-semibold">Ngày vi phạm *</Label>
                    <Input
                      id="recordDate"
                      type="date"
                      value={occurredDate}
                      onChange={(e) => setOccurredDate(e.target.value)}
                      required
                    />
                  </div>

                  {/* TIẾT HỌC */}
                  <div>
                    <Label htmlFor="recordPeriod" className="text-xs font-semibold">Tiết học (Tùy chọn)</Label>
                    <select
                      id="recordPeriod"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="">-- Cả buổi / Không rõ tiết --</option>
                      <option value="1">Tiết 1</option>
                      <option value="2">Tiết 2</option>
                      <option value="3">Tiết 3</option>
                      <option value="4">Tiết 4</option>
                      <option value="5">Tiết 5</option>
                      <option value="6">Tiết 6 (Chiều)</option>
                      <option value="7">Tiết 7 (Chiều)</option>
                      <option value="8">Tiết 8 (Chiều)</option>
                      <option value="9">Tiết 9 (Chiều)</option>
                    </select>
                  </div>
                </div>
              </Card>

              {/* BƯỚC 2: CHỌN MỤC TIÊU CHÍ VI PHẠM (33 TIÊU CHÍ) */}
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-primary uppercase tracking-wide">
                    <ListChecks className="h-4 w-4" />
                    2. Mục vi phạm (33 Tiêu chí)
                  </div>
                  {activeCriterion && (
                    <span className="font-mono font-bold text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {activeCriterion.code}
                    </span>
                  )}
                </div>

                {/* TABS LỌC NHANH NHÓM */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-muted rounded-xl text-xs font-semibold text-center">
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryTab("all")}
                    className={cn(
                      "py-1.5 rounded-lg transition-all",
                      selectedCategoryTab === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryTab("ky_luat")}
                    className={cn(
                      "py-1.5 rounded-lg transition-all",
                      selectedCategoryTab === "ky_luat" ? "bg-red-600 text-white shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    Kỷ luật (19)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryTab("hoc_tap")}
                    className={cn(
                      "py-1.5 rounded-lg transition-all",
                      selectedCategoryTab === "hoc_tap" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    Học tập (11)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryTab("ghi_chu")}
                    className={cn(
                      "py-1.5 rounded-lg transition-all",
                      selectedCategoryTab === "ghi_chu" ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    Ghi chú (3)
                  </button>
                </div>

                {/* TÌM KIẾM TIÊU CHÍ */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm nhanh tên vi phạm hoặc mã lỗi (KL-01, HT-01...)"
                    value={criterionSearchTerm}
                    onChange={(e) => setCriterionSearchTerm(e.target.value)}
                    className="pl-9 text-xs"
                  />
                </div>

                {/* DANH SÁCH CHỌN TIÊU CHÍ */}
                <div className="max-h-56 overflow-y-auto space-y-1.5 border rounded-xl p-2 bg-muted/20">
                  {filteredCriteria.length === 0 ? (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      Không tìm thấy tiêu chí nào phù hợp.
                    </div>
                  ) : (
                    filteredCriteria.map((c) => {
                      const isSelected = c.id === selectedCriterionId;
                      const isMinus = c.defaultPoints < 0;

                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelectedCriterionId(c.id)}
                          className={cn(
                            "p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start justify-between gap-2",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                              : "border-border bg-card hover:bg-muted/40",
                          )}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-bold text-foreground">
                              <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-muted">
                                {c.code}
                              </span>
                              <span>{c.name}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Đơn vị: {c.displayUnitText || disciplineUnitTypeLabels[c.unitType] || c.unitType}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span
                              className={cn(
                                "font-bold font-mono px-2 py-0.5 rounded text-xs",
                                isMinus
                                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                              )}
                            >
                              {c.defaultPoints > 0 ? `+${c.defaultPoints}` : c.defaultPoints} đ
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

              {/* BƯỚC 3: ĐỐI TƯỢNG VI PHẠM & HỌC SINH */}
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-primary uppercase tracking-wide">
                    <Users className="h-4 w-4" />
                    3. Đối tượng vi phạm
                  </div>

                  {/* SWITCH PHẠM VI */}
                  <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setScope("student")}
                      className={cn(
                        "px-2.5 py-1 rounded-md transition-all",
                        scope === "student" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      Cá nhân học sinh
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("class")}
                      className={cn(
                        "px-2.5 py-1 rounded-md transition-all",
                        scope === "class" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      Tập thể lớp
                    </button>
                  </div>
                </div>

                {scope === "student" ? (
                  <div className="space-y-3">
                    {/* HỌC SINH ĐÃ CHỌN (TAGS) */}
                    <div>
                      <Label className="text-xs font-semibold">
                        Học sinh vi phạm đã chọn ({selectedStudents.length}):
                      </Label>

                      {selectedStudents.length === 0 ? (
                        <div className="p-3 bg-muted/40 rounded-xl text-xs text-muted-foreground italic text-center border">
                          Chưa chọn học sinh nào. Vui lòng bấm chọn học sinh ở danh sách bên dưới.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 p-2 bg-muted/30 rounded-xl border max-h-28 overflow-y-auto">
                          {selectedStudents.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold"
                            >
                              <span>{s.fullName}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">({s.studentCode})</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveStudent(s.id)}
                                className="hover:bg-primary/20 rounded p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* DANH SÁCH HỌC SINH CỦA LỚP ĐỂ CHỌN */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">
                          Danh sách học sinh lớp {activeClass?.name} ({students.length}):
                        </Label>
                        <span className="text-[11px] text-muted-foreground">Chạm để chọn / bỏ chọn</span>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Tìm học sinh theo tên hoặc mã số..."
                          value={studentSearchTerm}
                          onChange={(e) => setStudentSearchTerm(e.target.value)}
                          className="pl-9 text-xs"
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1 border rounded-xl bg-background">
                        {filteredStudents.length === 0 ? (
                          <div className="col-span-2 text-center py-4 text-xs text-muted-foreground">
                            {students.length === 0
                              ? "Lớp này chưa có danh sách học sinh. Vui lòng thêm học sinh trước."
                              : "Không tìm thấy học sinh phù hợp."}
                          </div>
                        ) : (
                          filteredStudents.map((s) => {
                            const isSelected = selectedStudents.some((item) => item.id === s.id);

                            return (
                              <button
                                type="button"
                                key={s.id}
                                onClick={() => handleToggleStudent(s)}
                                className={cn(
                                  "p-2 rounded-lg text-left text-xs transition-all flex items-center justify-between border",
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                                    : "border-border/60 hover:bg-muted/50 text-foreground",
                                )}
                              >
                                <div>
                                  <div className="font-semibold">{s.fullName}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{s.studentCode}</div>
                                </div>
                                {isSelected ? (
                                  <Check className="h-4 w-4 text-primary shrink-0" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* LỖI TẬP THỂ LỚP */
                  <div className="p-3 bg-muted/30 rounded-xl border space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <GraduationCap className="h-4 w-4 text-primary" />
                      Lỗi vi phạm áp dụng cho: <strong>Tập thể lớp {activeClass?.name}</strong>
                    </div>

                    <div>
                      <Label htmlFor="collectiveQuantity" className="text-xs font-semibold">
                        Số lượng / Số lần vi phạm:
                      </Label>
                      <Input
                        id="collectiveQuantity"
                        type="number"
                        min={1}
                        max={100}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                        className="w-32 font-bold text-center"
                      />
                    </div>
                  </div>
                )}
              </Card>

              {/* BƯỚC 4: GHI CHÚ, MINH CHỨNG & BẢNG ĐIỂM DỰ KIẾN */}
              <Card className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-primary uppercase tracking-wide border-b pb-2">
                  <FileText className="h-4 w-4" />
                  4. Chi tiết & Tổng điểm dự kiến
                </div>

                <div>
                  <Label htmlFor="recordNote" className="text-xs font-semibold">Ghi chú cụ thể</Label>
                  <textarea
                    id="recordNote"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Mô tả hoàn cảnh vi phạm, giáo viên bộ môn ghi nhận..."
                    className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <Label htmlFor="attachmentUrl" className="text-xs font-semibold">Link ảnh minh chứng (nếu có)</Label>
                  <Input
                    id="attachmentUrl"
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    placeholder="https://drive.google.com/... hoặc link ảnh nội bộ"
                  />
                </div>

                {/* BẢNG TỔNG HỢP XEM LẠI TRƯỚC KHI BẤM GỬI */}
                <div className="p-4 rounded-xl border bg-muted/40 space-y-2 text-xs">
                  <div className="font-bold text-sm text-foreground flex items-center justify-between border-b pb-1.5">
                    <span>Xác nhận thông tin ghi nhận:</span>
                    <Badge tone={activeCriterion && activeCriterion.defaultPoints < 0 ? "danger" : "success"}>
                      {activeCriterion?.category ? disciplineCategoryLabels[activeCriterion.category] : ""}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                    <div>Lớp vi phạm: <strong className="text-foreground">{activeClass?.name}</strong></div>
                    <div>Thời gian: <strong className="text-foreground">Tuần {activeWeek?.weekNumber} ({occurredDate})</strong></div>
                    <div>Mục lỗi: <strong className="text-foreground">{activeCriterion?.code} — {activeCriterion?.name}</strong></div>
                    <div>Đối tượng: <strong className="text-foreground">{scope === "student" ? `${selectedStudents.length} bạn` : "Tập thể lớp"}</strong></div>
                    <div>Định mức quy chế: <strong className="text-foreground">{activeCriterion?.defaultPoints}đ / {activeCriterion?.displayUnitText || "lượt"}</strong></div>
                    <div>Số lượng: <strong className="text-foreground">{effectiveQuantity}</strong></div>
                  </div>

                  <div className="border-t pt-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">Tổng điểm dự kiến:</span>
                    <span
                      className={cn(
                        "font-mono font-extrabold text-base px-2.5 py-0.5 rounded-lg",
                        estimatedTotalPoints < 0
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                      )}
                    >
                      {estimatedTotalPoints > 0 ? `+${estimatedTotalPoints}` : estimatedTotalPoints} điểm
                    </span>
                  </div>
                </div>

                {/* NÚT BẤM GỬI */}
                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting || (scope === "student" && selectedStudents.length === 0)}
                  className="w-full text-base font-bold shadow-md gap-2"
                >
                  <Send className="h-5 w-5" />
                  {isSubmitting
                    ? editId
                      ? "Đang gửi lại..."
                      : "Đang gửi ghi nhận..."
                    : editId
                      ? "Cập nhật & Gửi lại phiếu vi phạm"
                      : "Gửi ghi nhận vi phạm"}
                </Button>
              </Card>
            </form>
          )}
        </div>
      </Shell>
    </RoleGuard>
  );
}

export default function RecordDisciplinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center p-12 text-center text-muted-foreground">
          Đang tải biểu mẫu ghi nhận vi phạm...
        </div>
      }
    >
      <RecordDisciplineForm />
    </Suspense>
  );
}
