"use client";

import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  History,
  Layers,
  ListFilter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_DISCIPLINE_CRITERIA,
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
import { firebaseErrorMessage } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";

type CriterionRow = DocumentData & {
  id: string;
  code: string;
  name: string;
  category: DisciplineCategory;
  unitType: "per_student" | "per_occurrence" | "per_unit";
  type: "minus" | "plus";
  defaultPoints: number;
  displayUnitText: string;
  scope: "student" | "class" | "both";
  applicableGrades: number[];
  description?: string;
  displayOrder: number;
  isActive: boolean;
  pointHistory?: {
    oldPoints: number;
    newPoints: number;
    changedAt: string;
    changedBy: string;
    reason: string;
  }[];
};

export default function DisciplineCriteriaPage() {
  const { user, role, claims } = useAuth();
  const [criteria, setCriteria] = useState<CriterionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Phân quyền truy cập
  const [hasCriteriaAccess, setHasCriteriaAccess] = useState<boolean>(true);

  // Modal Thêm điều khoản mới
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newCode, setNewCode] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [newCategory, setNewCategory] = useState<DisciplineCategory>("ky_luat");
  const [newType, setNewType] = useState<"minus" | "plus">("minus");
  const [newPoints, setNewPoints] = useState<number>(2);
  const [newUnitType, setNewUnitType] = useState<"per_student" | "per_occurrence" | "per_unit">("per_student");
  const [newDisplayUnitText, setNewDisplayUnitText] = useState<string>("điểm/HS");
  const [newScope, setNewScope] = useState<"student" | "class" | "both">("student");
  const [newApplicableGrades, setNewApplicableGrades] = useState<number[]>([6, 7, 8, 9]);
  const [newDescription, setNewDescription] = useState<string>("");
  const [isSavingNew, setIsSavingNew] = useState<boolean>(false);

  // Modal Sửa tiêu chí
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingCriterion, setEditingCriterion] = useState<CriterionRow | null>(null);
  const [formName, setFormName] = useState<string>("");
  const [formPoints, setFormPoints] = useState<number>(0);
  const [formDescription, setFormDescription] = useState<string>("");
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [pointChangeReason, setPointChangeReason] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Modal Khởi tạo 33 tiêu chí chuẩn
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

  // Modal xem lịch sử thay đổi mức điểm
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [selectedHistoryCriterion, setSelectedHistoryCriterion] = useState<CriterionRow | null>(null);

  // Kiểm tra quyền: Admin, BGH, Ban Kỷ luật, Ban Thi đua hoặc Trưởng ban
  useEffect(() => {
    if (!user) return;
    if (role === "admin" || role === "bgh") {
      setHasCriteriaAccess(true);
      return;
    }
    const isHeadOrCommittee = Boolean(
      claims?.isCompetitionCommittee ||
      claims?.isDisciplineCommittee ||
      claims?.isDisciplineHead ||
      claims?.isCompetitionHead ||
      claims?.canManageCriteria
    );
    if (isHeadOrCommittee) {
      setHasCriteriaAccess(true);
      return;
    }
    // Tra cứu thêm từ Firestore nếu claims chưa kịp làm mới
    getDocs(query(collection(firestore, "disciplineAssignments"), where("userUid", "==", user.uid), where("isActive", "==", true)))
      .then((snap) => {
        setHasCriteriaAccess(!snap.empty);
      })
      .catch(() => setHasCriteriaAccess(false));
  }, [user, role, claims]);

  // Tải danh sách tiêu chí từ Firestore
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(firestore, "disciplineCriteria"),
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as CriterionRow[];

        // Sắp xếp theo nhóm và displayOrder
        rows.sort((a, b) => {
          if (a.category !== b.category) {
            const catOrder = { ky_luat: 1, hoc_tap: 2, ghi_chu: 3 };
            return (catOrder[a.category] || 99) - (catOrder[b.category] || 99);
          }
          return (a.displayOrder || 0) - (b.displayOrder || 0);
        });

        setCriteria(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Lỗi tải tiêu chí:", err);
        toast.error("Không thể tải danh mục tiêu chí: " + err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  // Lọc tiêu chí theo Tab nhóm và Tìm kiếm
  const filteredCriteria = useMemo(() => {
    return criteria.filter((c) => {
      const matchCat = selectedCategory === "all" || c.category === selectedCategory;
      const term = searchTerm.trim().toLowerCase();
      const matchSearch =
        !term ||
        c.code?.toLowerCase().includes(term) ||
        c.name?.toLowerCase().includes(term) ||
        c.description?.toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
  }, [criteria, selectedCategory, searchTerm]);

  // Đếm số lượng theo nhóm
  const counts = useMemo(() => {
    return {
      all: criteria.length,
      ky_luat: criteria.filter((c) => c.category === "ky_luat").length,
      hoc_tap: criteria.filter((c) => c.category === "hoc_tap").length,
      ghi_chu: criteria.filter((c) => c.category === "ghi_chu").length,
    };
  }, [criteria]);

  // Khởi tạo 33 tiêu chí chuẩn từ Seed Data (Bảo toàn mức điểm đã điều chỉnh)
  async function handleSeedCriteria() {
    setIsSeeding(true);
    try {
      const existingSnap = await getDocs(collection(firestore, "disciplineCriteria"));
      const existingMap = new Map<string, DocumentData>();
      existingSnap.docs.forEach((d) => existingMap.set(d.id, d.data()));

      const batch = writeBatch(firestore);

      for (const item of DEFAULT_DISCIPLINE_CRITERIA) {
        const docRef = doc(firestore, "disciplineCriteria", item.code);
        const existingData = existingMap.get(item.code);

        // Bảo toàn mức điểm và lịch sử điểm nếu tiêu chí đã được tùy chỉnh trước đó
        const pointsToSave =
          existingData?.defaultPoints !== undefined
            ? Number(existingData.defaultPoints)
            : item.defaultPoints;
        const historyToSave = existingData?.pointHistory || [];

        batch.set(
          docRef,
          {
            ...item,
            id: item.code,
            defaultPoints: pointsToSave,
            type: pointsToSave >= 0 ? "plus" : "minus",
            pointHistory: historyToSave,
            createdAt: existingData?.createdAt || serverTimestamp(),
            createdBy: existingData?.createdBy || user?.uid || "admin",
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || "admin",
          },
          { merge: true },
        );
      }

      await batch.commit();
      toast.success("Đã đồng bộ 33 tiêu chí chuẩn (giữ nguyên toàn bộ mức điểm đã tùy chỉnh).");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Lỗi seed tiêu chí:", err);
      toast.error("Lỗi khi khởi tạo tiêu chí: " + msg);
    } finally {
      setIsSeeding(false);
    }
  }

  // Mở modal thêm điều khoản mới
  function handleOpenAdd() {
    const cat = selectedCategory !== "all" ? (selectedCategory as DisciplineCategory) : "ky_luat";
    setNewCategory(cat);
    const prefix = cat === "ky_luat" ? "KL" : cat === "hoc_tap" ? "HT" : "NC";
    const existingCat = criteria.filter((c) => c.category === cat);
    const nextSeq = existingCat.length + 1;
    const suggestedCode = `${prefix}-${String(nextSeq).padStart(3, "0")}`;
    setNewCode(suggestedCode);
    setNewName("");
    setNewType("minus");
    setNewPoints(2);
    setNewUnitType("per_student");
    setNewDisplayUnitText("điểm/HS");
    setNewScope("student");
    setNewApplicableGrades([6, 7, 8, 9]);
    setNewDescription("");
    setIsAddModalOpen(true);
  }

  // Lưu thêm điều khoản quy chế mới
  async function handleAddCriterion(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) {
      toast.error("Vui lòng nhập mã điều khoản (ví dụ: KL-014).");
      return;
    }
    if (!newName.trim()) {
      toast.error("Vui lòng nhập tên điều khoản quy chế.");
      return;
    }

    const code = newCode.trim().toUpperCase();
    const existing = criteria.find((c) => c.code.toUpperCase() === code);
    if (existing) {
      toast.error(`Mã điều khoản "${code}" đã tồn tại. Vui lòng chọn mã khác.`);
      return;
    }

    setIsSavingNew(true);
    try {
      const docRef = doc(firestore, "disciplineCriteria", code);
      const absPoints = Math.abs(Number(newPoints) || 1);
      const pointsToSave = newType === "minus" ? -absPoints : absPoints;
      const displayOrder = criteria.length + 1;

      const newCriterion = {
        id: code,
        code,
        name: newName.trim(),
        category: newCategory,
        type: newType,
        defaultPoints: pointsToSave,
        unitType: newUnitType,
        displayUnitText: newDisplayUnitText || (newUnitType === "per_student" ? "điểm/HS" : "điểm/lần"),
        scope: newScope,
        applicableGrades: newApplicableGrades,
        description: newDescription.trim(),
        displayOrder,
        isActive: true,
        pointHistory: [
          {
            oldPoints: 0,
            newPoints: pointsToSave,
            changedAt: new Date().toISOString(),
            changedBy: user?.displayName || user?.email || user?.uid || "admin",
            reason: "Khởi tạo điều khoản mới",
          },
        ],
        createdAt: serverTimestamp(),
        createdBy: user?.uid || "admin",
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "admin",
      };

      await setDoc(docRef, newCriterion);
      toast.success(`Đã thêm điều khoản "${code} — ${newName}" thành công!`);
      setIsAddModalOpen(false);
    } catch (err: unknown) {
      console.error("Lỗi thêm điều khoản:", err);
      toast.error("Lỗi khi thêm điều khoản: " + firebaseErrorMessage(err));
    } finally {
      setIsSavingNew(false);
    }
  }

  // Tạm dừng hoặc khôi phục áp dụng điều khoản
  async function handleToggleActiveCriterion(criterion: CriterionRow) {
    const nextState = criterion.isActive === false;
    const actionText = nextState ? "kích hoạt áp dụng" : "tạm dừng áp dụng";
    if (!confirm(`Bạn có chắc muốn ${actionText} điều khoản ${criterion.code}: "${criterion.name}"?`)) {
      return;
    }
    try {
      await setDoc(
        doc(firestore, "disciplineCriteria", criterion.id),
        {
          isActive: nextState,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "admin",
        },
        { merge: true },
      );
      toast.success(`Đã ${actionText} điều khoản ${criterion.code}.`);
    } catch (err: unknown) {
      console.error("Lỗi thay đổi trạng thái:", err);
      toast.error("Lỗi: " + firebaseErrorMessage(err));
    }
  }

  // Mở modal sửa tiêu chí
  function handleOpenEdit(criterion: CriterionRow) {
    setEditingCriterion(criterion);
    setFormName(criterion.name || "");
    setFormPoints(criterion.defaultPoints || 0);
    setFormDescription(criterion.description || "");
    setFormIsActive(criterion.isActive !== false);
    setPointChangeReason("");
    setIsEditModalOpen(true);
  }

  // Lưu chỉnh sửa tiêu chí
  async function handleSaveCriterion(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCriterion) return;

    if (!formName.trim()) {
      toast.error("Tên tiêu chí không được để trống.");
      return;
    }

    const pointsChanged = formPoints !== editingCriterion.defaultPoints;
    if (pointsChanged && !pointChangeReason.trim()) {
      toast.error("Vui lòng nhập lý do thay đổi mức điểm quy chế.");
      return;
    }

    setIsSaving(true);
    try {
      const docRef = doc(firestore, "disciplineCriteria", editingCriterion.id);
      const history = editingCriterion.pointHistory ? [...editingCriterion.pointHistory] : [];

      if (pointsChanged) {
        history.push({
          oldPoints: editingCriterion.defaultPoints,
          newPoints: formPoints,
          changedAt: new Date().toISOString(),
          changedBy: user?.displayName || user?.email || user?.uid || "admin",
          reason: pointChangeReason.trim(),
        });
      }

      await setDoc(
        docRef,
        {
          name: formName.trim(),
          defaultPoints: Number(formPoints),
          type: formPoints >= 0 ? "plus" : "minus",
          description: formDescription.trim(),
          isActive: formIsActive,
          pointHistory: history,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "admin",
        },
        { merge: true },
      );

      toast.success(`Đã cập nhật tiêu chí ${editingCriterion.code}.`);
      setIsEditModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Lỗi cập nhật tiêu chí:", err);
      toast.error("Lỗi khi cập nhật tiêu chí: " + msg);
    } finally {
      setIsSaving(false);
    }
  }

  // Mở modal xem lịch sử mức điểm
  function handleOpenHistory(criterion: CriterionRow) {
    setSelectedHistoryCriterion(criterion);
    setIsHistoryModalOpen(true);
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh", "giaovien", "totruong"]}>
      <Shell>
        <div className="space-y-6">
          {!hasCriteriaAccess ? (
            <Card className="p-8 text-center space-y-4">
              <div className="text-amber-600 font-semibold text-lg">Không có quyền quản trị tiêu chí thi đua</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Chỉ Quản trị viên, Ban Giám hiệu, hoặc Giáo viên được phân công Trưởng ban Kỷ luật, Trưởng ban Thi đua mới có quyền cài đặt và chỉnh sửa các điều khoản quy chế này.
              </p>
            </Card>
          ) : (
            <>
              <PageHeader
                title="Danh mục tiêu chí thi đua"
                description="Hệ thống các điều khoản cộng/trừ điểm theo Quy chế thi đua của nhà trường. Ban Kỷ luật & Ban Thi đua có thể cài đặt, điều chỉnh mức điểm hoặc thêm mới điều khoản quy chế."
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleOpenAdd}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Thêm điều khoản mới
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSeedCriteria}
                      disabled={isSeeding}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      {isSeeding ? "Đang khởi tạo..." : "Đồng bộ 33 tiêu chí chuẩn"}
                    </Button>
                  </div>
                }
              />

          {/* THANH TAB NHÓM VÀ TÌM KIẾM */}
          <Card className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* CÁC TAB NHÓM */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                    selectedCategory === "all"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  Tất cả <Badge tone="neutral">{counts.all}</Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCategory("ky_luat")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                    selectedCategory === "ky_luat"
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  Nhóm 1: Kỷ luật <Badge tone="neutral">{counts.ky_luat}</Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCategory("hoc_tap")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                    selectedCategory === "hoc_tap"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  Nhóm 2: Học tập <Badge tone="neutral">{counts.hoc_tap}</Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCategory("ghi_chu")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                    selectedCategory === "ghi_chu"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  Nhóm 3: Ghi chú nề nếp <Badge tone="neutral">{counts.ghi_chu}</Badge>
                </button>
              </div>

              {/* Ô TÌM KIẾM */}
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm mã lỗi hoặc tên tiêu chí..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
            </div>
          </Card>

          {/* BẢNG TIÊU CHÍ */}
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredCriteria.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title="Chưa có tiêu chí nào"
                description={
                  searchTerm
                    ? "Không tìm thấy tiêu chí nào phù hợp với từ khóa."
                    : "Hệ thống chưa có tiêu chí thi đua nào. Hãy bấm nút 'Đồng bộ 33 tiêu chí chuẩn' ở trên để khởi tạo tự động."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase font-medium">
                    <tr>
                      <th className="py-3 px-4 w-16 text-center">Mã</th>
                      <th className="py-3 px-4">Tên tiêu chí / Lỗi vi phạm</th>
                      <th className="py-3 px-4">Nhóm</th>
                      <th className="py-3 px-4 text-center">Mức điểm</th>
                      <th className="py-3 px-4">Đơn vị tính</th>
                      <th className="py-3 px-4 text-center">Phạm vi</th>
                      <th className="py-3 px-4 text-center">Khối</th>
                      <th className="py-3 px-4 text-center">Trạng thái</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredCriteria.map((c) => {
                      const isMinus = c.defaultPoints < 0;
                      return (
                        <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4 text-center">
                            <span
                              className={cn(
                                "font-mono font-bold text-xs px-2 py-0.5 rounded",
                                c.category === "ky_luat"
                                  ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                  : c.category === "hoc_tap"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                  : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
                              )}
                            >
                              {c.code}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">{c.name}</div>
                            {c.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1">{c.description}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              tone={c.category === "ky_luat" ? "danger" : c.category === "hoc_tap" ? "info" : "warning"}
                            >
                              {disciplineCategoryLabels[c.category] || c.category}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center font-bold">
                            <span
                              className={cn(
                                "inline-block px-2 py-0.5 rounded text-xs",
                                isMinus
                                  ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                                  : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                              )}
                            >
                              {c.defaultPoints > 0 ? `+${c.defaultPoints}` : c.defaultPoints} đ
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {c.displayUnitText || disciplineUnitTypeLabels[c.unitType] || c.unitType}
                          </td>
                          <td className="py-3 px-4 text-center text-xs">
                            {c.scope === "student" ? "Học sinh" : c.scope === "class" ? "Tập thể" : "Cả hai"}
                          </td>
                          <td className="py-3 px-4 text-center text-xs font-mono">
                            {c.applicableGrades?.join(", ") || "6, 7, 8, 9"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {c.isActive !== false ? (
                              <Badge tone="success">
                                Áp dụng
                              </Badge>
                            ) : (
                              <Badge tone="neutral">
                                Tạm dừng
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {c.pointHistory && c.pointHistory.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenHistory(c)}
                                  title="Xem lịch sử đổi mức điểm"
                                >
                                  <History className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(c)}
                                title="Chỉnh sửa quy chế tiêu chí"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleActiveCriterion(c)}
                                title={c.isActive !== false ? "Tạm dừng áp dụng" : "Kích hoạt áp dụng lại"}
                              >
                                <Trash2 className={cn("h-4 w-4", c.isActive !== false ? "text-rose-500" : "text-emerald-500")} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* MODAL CHỈNH SỬA TIÊU CHÍ */}
          <Modal
            open={isEditModalOpen}
            onOpenChange={setIsEditModalOpen}
            title={`Chỉnh sửa tiêu chí: ${editingCriterion?.code}`}
          >
            <form onSubmit={handleSaveCriterion} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="criterionCodeView">Mã tiêu chí quy chế</Label>
                <Input id="criterionCodeView" value={editingCriterion?.code || ""} disabled className="bg-muted font-mono font-bold" />
              </div>

              <div>
                <Label htmlFor="criterionName">Tên tiêu chí / Lỗi vi phạm *</Label>
                <Input
                  id="criterionName"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="criterionPoints">Mức điểm (+ hoặc -) *</Label>
                  <Input
                    id="criterionPoints"
                    type="number"
                    value={formPoints}
                    onChange={(e) => setFormPoints(Number(e.target.value))}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Nhập số âm (VD: -5) để trừ điểm, số dương (VD: 10) để cộng điểm.
                  </p>
                </div>

                <div>
                  <Label htmlFor="criterionUnit">Đơn vị tính</Label>
                  <Input
                    id="criterionUnit"
                    value={editingCriterion?.displayUnitText || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              {formPoints !== editingCriterion?.defaultPoints && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    Thay đổi mức điểm quy chế (từ {editingCriterion?.defaultPoints}đ sang {formPoints}đ)
                  </div>
                  <Label htmlFor="changeReason" className="text-xs">
                    Lý do điều chỉnh (bắt buộc để lưu nhật ký kiểm toán) *
                  </Label>
                  <Input
                    id="changeReason"
                    placeholder="VD: Theo quyết định điều chỉnh quy chế thi đua số 15/QĐ..."
                    value={pointChangeReason}
                    onChange={(e) => setPointChangeReason(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    💡 <strong>Bảo toàn dữ liệu:</strong> Mức điểm mới chỉ áp dụng cho các phiếu vi phạm lập sau thời điểm này. Các phiếu đã duyệt hoặc các tuần thi đua đã chốt trước đây hoàn toàn giữ nguyên mức điểm cũ.
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="criterionDesc">Mô tả hướng dẫn áp dụng</Label>
                <textarea
                  id="criterionDesc"
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ghi chú chi tiết về cách chấm, xử lý..."
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formIsActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <Label htmlFor="formIsActive" className="cursor-pointer">
                  Đang áp dụng trong năm học này
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSaving}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Đang lưu..." : "Cập nhật tiêu chí"}
                </Button>
              </div>
            </form>
          </Modal>

          {/* MODAL XEM LỊCH SỬ THAY ĐỔI MỨC ĐIỂM */}
          <Modal
            open={isHistoryModalOpen}
            onOpenChange={setIsHistoryModalOpen}
            title={`Lịch sử điều chỉnh điểm: ${selectedHistoryCriterion?.code} — ${selectedHistoryCriterion?.name}`}
          >
            <div className="space-y-4 pt-2">
              <div className="max-h-72 overflow-y-auto divide-y border rounded-md">
                {selectedHistoryCriterion?.pointHistory?.map((h, index) => (
                  <div key={index} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        Mức điểm: {h.oldPoints}đ → <strong className="text-primary">{h.newPoints}đ</strong>
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(h.changedAt).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Người thực hiện: <span className="font-medium text-foreground">{h.changedBy}</span>
                    </div>
                    <div className="bg-muted/40 p-1.5 rounded text-foreground italic">
                      &ldquo;{h.reason}&rdquo;
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t">
                <Button
                  variant="secondary"
                  onClick={() => setIsHistoryModalOpen(false)}
                >
                  Đóng
                </Button>
              </div>
            </div>
          </Modal>
          {/* MODAL THÊM ĐIỀU KHOẢN MỚI */}
          <Modal
            open={isAddModalOpen}
            onOpenChange={setIsAddModalOpen}
            title="Thêm điều khoản thi đua mới"
          >
            <form onSubmit={handleAddCriterion} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="newCode">Mã điều khoản *</Label>
                  <Input
                    id="newCode"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="VD: KL-014, HT-009, NC-012"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Định dạng viết hoa, không dấu (VD: KL-014)</p>
                </div>

                <div>
                  <Label htmlFor="newCategory">Nhóm quy chế *</Label>
                  <select
                    id="newCategory"
                    value={newCategory}
                    onChange={(e) => {
                      const cat = e.target.value as DisciplineCategory;
                      setNewCategory(cat);
                      const prefix = cat === "ky_luat" ? "KL" : cat === "hoc_tap" ? "HT" : "NC";
                      const count = criteria.filter((c) => c.category === cat).length + 1;
                      setNewCode(`${prefix}-${String(count).padStart(3, "0")}`);
                    }}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ky_luat">Nhóm 1: Kỷ luật</option>
                    <option value="hoc_tap">Nhóm 2: Học tập</option>
                    <option value="ghi_chu">Nhóm 3: Ghi chú nề nếp</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="newName">Tên điều khoản / Nội dung quy chế *</Label>
                <Input
                  id="newName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="VD: Mang dép lê vào lớp, Không học bài, Hát quốc ca to rõ..."
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="newType">Loại điểm *</Label>
                  <select
                    id="newType"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as "minus" | "plus")}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="minus">Điểm trừ (Vi phạm)</option>
                    <option value="plus">Điểm cộng (Khen thưởng)</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="newPoints">Mức điểm *</Label>
                  <Input
                    id="newPoints"
                    type="number"
                    min="1"
                    max="100"
                    value={newPoints}
                    onChange={(e) => setNewPoints(Math.abs(Number(e.target.value)))}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {newType === "minus" ? `Sẽ trừ ${newPoints} điểm` : `Sẽ cộng ${newPoints} điểm`}
                  </p>
                </div>

                <div>
                  <Label htmlFor="newUnitType">Đơn vị tính *</Label>
                  <select
                    id="newUnitType"
                    value={newUnitType}
                    onChange={(e) => {
                      const u = e.target.value as "per_student" | "per_occurrence" | "per_unit";
                      setNewUnitType(u);
                      setNewDisplayUnitText(u === "per_student" ? "điểm/HS" : u === "per_occurrence" ? "điểm/lần" : "điểm/tiết");
                    }}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="per_student">Theo học sinh (điểm/HS)</option>
                    <option value="per_occurrence">Theo lần vi phạm (điểm/lần)</option>
                    <option value="per_unit">Theo đơn vị khác</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="newScope">Đối tượng áp dụng *</Label>
                  <select
                    id="newScope"
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value as "student" | "class" | "both")}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="student">Cá nhân học sinh</option>
                    <option value="class">Tập thể lớp</option>
                    <option value="both">Cả học sinh & tập thể</option>
                  </select>
                </div>

                <div>
                  <Label>Khối lớp áp dụng</Label>
                  <div className="flex items-center gap-4 mt-2">
                    {[6, 7, 8, 9].map((g) => (
                      <label key={g} className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newApplicableGrades.includes(g)}
                          onChange={(e) => {
                            if (e.target.checked) setNewApplicableGrades([...newApplicableGrades, g].sort());
                            else setNewApplicableGrades(newApplicableGrades.filter((x) => x !== g));
                          }}
                          className="rounded border-input text-primary focus:ring-primary"
                        />
                        Khối {g}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="newDescription">Mô tả hướng dẫn áp dụng</Label>
                <textarea
                  id="newDescription"
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Ghi chú thêm về điều khoản, cách xử lý..."
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSavingNew}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSavingNew}>
                  {isSavingNew ? "Đang lưu..." : "Thêm điều khoản"}
                </Button>
              </div>
            </form>
          </Modal>
          </>
          )}
        </div>
      </Shell>
    </RoleGuard>
  );
}
