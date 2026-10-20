"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  GraduationCap,
  ListFilter,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Wand2,
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
  type DocumentData,
} from "firebase/firestore";
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
  assignDisciplineRole,
  assignWeeklyDisciplineSigner,
  type AssignDisciplineRoleInput,
  type AssignWeeklyDisciplineSignerInput,
} from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";

type TeacherRow = DocumentData & {
  id: string;
  fullName: string;
  teacherCode?: string;
  email?: string;
  userId?: string;
};

type OptionRow = DocumentData & {
  id: string;
  name?: string;
  code?: string;
  isActive?: boolean;
  homeroomTeacherId?: string;
};

type AssignmentRow = DocumentData & {
  id: string;
  userUid: string;
  userEmail: string;
  userFullName: string;
  roleType: "discipline_committee" | "competition_committee";
  assignedClassIds?: string[];
  schoolYearId: string;
  isActive: boolean;
  assignedByName?: string;
  createdAt?: unknown;
};

type WeekRow = DocumentData & {
  id: string;
  weekNumber: number;
  schoolYearId: string;
  startDate?: string;
  endDate?: string;
  status?: "active" | "locked";
};

type SignerAssignmentRow = DocumentData & {
  id: string;
  weekId: string;
  weekNumber: number;
  classId: string;
  className: string;
  schoolYearId: string;
  assignedSignerUid: string;
  assignedSignerName: string;
  assignedSignerEmail: string;
  isActive: boolean;
};

export default function DisciplineAssignmentsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"roles" | "signers">("roles");

  // Dữ liệu danh mục
  const [schoolYears, setSchoolYears] = useState<OptionRow[]>([]);
  const [classes, setClasses] = useState<OptionRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);

  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");

  // Tab 1: Phân quyền Ban Kỷ luật & Ban Thi đua
  const [roleAssignments, setRoleAssignments] = useState<AssignmentRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState<boolean>(true);
  const [isAssignRoleModalOpen, setIsAssignRoleModalOpen] = useState<boolean>(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedRoleType, setSelectedRoleType] = useState<"discipline_committee" | "competition_committee">("discipline_committee");
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [isAllClasses, setIsAllClasses] = useState<boolean>(true);
  const [isSubmittingRole, setIsSubmittingRole] = useState<boolean>(false);

  // Tab 2: Phân công người ký theo tuần và lớp
  const [signerAssignments, setSignerAssignments] = useState<SignerAssignmentRow[]>([]);
  const [loadingSigners, setLoadingSigners] = useState<boolean>(true);
  const [isAssignSignerModalOpen, setIsAssignSignerModalOpen] = useState<boolean>(false);
  const [targetClassForSigner, setTargetClassForSigner] = useState<OptionRow | null>(null);
  const [selectedSignerTeacherId, setSelectedSignerTeacherId] = useState<string>("");
  const [isSubmittingSigner, setIsSubmittingSigner] = useState<boolean>(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState<boolean>(false);

  // 1. Tải Năm học
  useEffect(() => {
    const unsub = onSnapshot(collection(firestore, "schoolYears"), (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
      setSchoolYears(rows);
      if (!selectedSchoolYearId && rows.length > 0) {
        const activeYear = rows.find((y) => y.isActive) || rows[0];
        setSelectedSchoolYearId(activeYear.id);
      }
    });
    return () => unsub();
  }, [selectedSchoolYearId]);

  // 2. Tải Lớp học & Giáo viên
  useEffect(() => {
    if (!selectedSchoolYearId) return;
    const qClasses = query(collection(firestore, "classes"), where("schoolYearId", "==", selectedSchoolYearId));
    const unsubClasses = onSnapshot(qClasses, (snapshot) => {
      setClasses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[]);
    });

    const unsubTeachers = onSnapshot(collection(firestore, "teachers"), (snapshot) => {
      setTeachers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as TeacherRow[]);
    });

    return () => {
      unsubClasses();
      unsubTeachers();
    };
  }, [selectedSchoolYearId]);

  // 3. Tải Tuần thi đua
  useEffect(() => {
    if (!selectedSchoolYearId) return;
    const qWeeks = query(collection(firestore, "disciplineWeeks"), where("schoolYearId", "==", selectedSchoolYearId));
    const unsubWeeks = onSnapshot(qWeeks, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as WeekRow[];
      rows.sort((a, b) => a.weekNumber - b.weekNumber);
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
  }, [selectedSchoolYearId, selectedWeekId]);

  // 4. Tải Phân quyền Ban Kỷ luật & Ban Thi đua (Tab 1)
  useEffect(() => {
    if (!selectedSchoolYearId) return;
    setLoadingRoles(true);
    const q = query(collection(firestore, "disciplineAssignments"), where("schoolYearId", "==", selectedSchoolYearId));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setRoleAssignments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as AssignmentRow[]);
        setLoadingRoles(false);
      },
      (err) => {
        console.error("Lỗi tải phân quyền ban:", err);
        setLoadingRoles(false);
      },
    );

    return () => unsub();
  }, [selectedSchoolYearId]);

  // 5. Tải Phân công người ký xác nhận theo tuần (Tab 2)
  useEffect(() => {
    if (!selectedWeekId) {
      setSignerAssignments([]);
      setLoadingSigners(false);
      return;
    }

    setLoadingSigners(true);
    const q = query(collection(firestore, "disciplineWeeklySignerAssignments"), where("weekId", "==", selectedWeekId));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setSignerAssignments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as SignerAssignmentRow[]);
        setLoadingSigners(false);
      },
      (err) => {
        console.error("Lỗi tải người ký:", err);
        setLoadingSigners(false);
      },
    );

    return () => unsub();
  }, [selectedWeekId]);

  // Map tìm tên lớp theo ID
  const classMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((c) => map.set(c.id, c.name || c.code || c.id));
    return map;
  }, [classes]);

  // Map tìm giáo viên theo ID
  const teacherMap = useMemo(() => {
    const map = new Map<string, TeacherRow>();
    teachers.forEach((t) => map.set(t.id, t));
    return map;
  }, [teachers]);

  // Map signer assignments theo classId
  const signerMap = useMemo(() => {
    const map = new Map<string, SignerAssignmentRow>();
    signerAssignments.forEach((s) => map.set(s.classId, s));
    return map;
  }, [signerAssignments]);

  const selectedWeek = useMemo(() => {
    return weeks.find((w) => w.id === selectedWeekId);
  }, [weeks, selectedWeekId]);

  // Xử lý Cấp quyền Ban Kỷ luật / Ban Thi đua
  async function handleAssignRole(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeacherId) {
      toast.error("Vui lòng chọn giáo viên để phân quyền.");
      return;
    }

    const teacher = teacherMap.get(selectedTeacherId);
    if (!teacher) {
      toast.error("Không tìm thấy thông tin giáo viên.");
      return;
    }

    const userUid = teacher.userId || teacher.id;
    if (!userUid) {
      toast.error("Giáo viên này chưa được liên kết tài khoản đăng nhập (chưa có UID).");
      return;
    }

    setIsSubmittingRole(true);
    try {
      const payload: AssignDisciplineRoleInput = {
        userUid,
        roleType: selectedRoleType,
        action: "assign",
        assignedClassIds: isAllClasses ? [] : assignedClassIds,
        schoolYearId: selectedSchoolYearId,
      };

      await assignDisciplineRole(payload);
      toast.success(
        `Đã phân quyền ${selectedRoleType === "discipline_committee" ? "Ban Kỷ luật" : "Ban Thi đua"} cho ${teacher.fullName}.`,
      );
      setIsAssignRoleModalOpen(false);
      setSelectedTeacherId("");
      setAssignedClassIds([]);
      setIsAllClasses(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Lỗi phân quyền:", err);
      toast.error("Lỗi khi phân quyền: " + msg);
    } finally {
      setIsSubmittingRole(false);
    }
  }

  // Thu hồi quyền Ban Kỷ luật / Ban Thi đua
  async function handleRevokeRole(assignment: AssignmentRow) {
    if (!confirm(`Bạn có chắc chắn muốn thu hồi quyền ${assignment.roleType === "discipline_committee" ? "Ban Kỷ luật" : "Ban Thi đua"} của ${assignment.userFullName}?`)) {
      return;
    }

    try {
      await assignDisciplineRole({
        userUid: assignment.userUid,
        roleType: assignment.roleType,
        action: "revoke",
        schoolYearId: selectedSchoolYearId,
      });
      toast.success(`Đã thu hồi quyền của ${assignment.userFullName}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi thu hồi quyền: " + msg);
    }
  }

  // Mở modal phân công người ký cho 1 lớp
  function handleOpenAssignSigner(targetClass: OptionRow) {
    setTargetClassForSigner(targetClass);
    // Mặc định chọn GVCN của lớp đó nếu có
    if (targetClass.homeroomTeacherId) {
      setSelectedSignerTeacherId(targetClass.homeroomTeacherId);
    } else {
      setSelectedSignerTeacherId("");
    }
    setIsAssignSignerModalOpen(true);
  }

  // Lưu phân công người ký cho 1 lớp
  async function handleSaveSigner(e: React.FormEvent) {
    e.preventDefault();
    if (!targetClassForSigner || !selectedWeek || !selectedSignerTeacherId) {
      toast.error("Vui lòng chọn đầy đủ thông tin.");
      return;
    }

    const teacher = teacherMap.get(selectedSignerTeacherId);
    if (!teacher) {
      toast.error("Không tìm thấy thông tin người được phân công.");
      return;
    }

    const signerUid = teacher.userId || teacher.id;
    const signerEmail = teacher.email || `${signerUid}@school.edu.vn`;

    setIsSubmittingSigner(true);
    try {
      const payload: AssignWeeklyDisciplineSignerInput = {
        schoolYearId: selectedSchoolYearId,
        weekId: selectedWeek.id,
        classId: targetClassForSigner.id,
        signerUid,
        signerName: teacher.fullName,
        signerEmail,
      };

      await assignWeeklyDisciplineSigner(payload);
      toast.success(
        `Đã phân công ${teacher.fullName} ký xác nhận tuần ${selectedWeek.weekNumber} cho lớp ${targetClassForSigner.name}.`,
      );
      setIsAssignSignerModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Lỗi phân công người ký:", err);
      toast.error("Lỗi phân công người ký: " + msg);
    } finally {
      setIsSubmittingSigner(false);
    }
  }

  // Tự động gán toàn bộ GVCN làm người ký cho tuần này
  async function handleAutoAssignAllHomeroomTeachers() {
    if (!selectedWeek) {
      toast.error("Vui lòng chọn tuần thi đua trước.");
      return;
    }

    const unassignedClasses = classes.filter((c) => c.homeroomTeacherId);
    if (unassignedClasses.length === 0) {
      toast.error("Không tìm thấy lớp nào có Giáo viên chủ nhiệm để gán tự động.");
      return;
    }

    if (!confirm(`Tự động phân công GVCN của ${unassignedClasses.length} lớp làm người ký xác nhận cho Tuần ${selectedWeek.weekNumber}?`)) {
      return;
    }

    setIsAutoAssigning(true);
    let successCount = 0;
    try {
      for (const c of unassignedClasses) {
        const teacher = teacherMap.get(c.homeroomTeacherId!);
        if (teacher) {
          const signerUid = teacher.userId || teacher.id;
          const signerEmail = teacher.email || `${signerUid}@school.edu.vn`;

          await assignWeeklyDisciplineSigner({
            schoolYearId: selectedSchoolYearId,
            weekId: selectedWeek.id,
            classId: c.id,
            signerUid,
            signerName: teacher.fullName,
            signerEmail,
          });
          successCount++;
        }
      }
      toast.success(`Đã tự động phân công thành công ${successCount} lớp.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi tự động phân công: " + msg);
    } finally {
      setIsAutoAssigning(false);
    }
  }

  // Tạo nhanh tuần thi đua nếu chưa có tuần nào
  async function handleCreateWeekFast() {
    if (!selectedSchoolYearId) return;
    const nextNum = weeks.length + 1;
    const weekId = `week_${nextNum}`;
    try {
      await setDoc(
        doc(firestore, "disciplineWeeks", weekId),
        {
          id: weekId,
          weekNumber: nextNum,
          schoolYearId: selectedSchoolYearId,
          name: `Tuần ${nextNum}`,
          status: "active",
          createdAt: serverTimestamp(),
          createdBy: user?.uid || "admin",
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "admin",
          isActive: true,
        },
        { merge: true },
      );
      toast.success(`Đã tạo Tuần thi đua ${nextNum}.`);
      setSelectedWeekId(weekId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi tạo tuần: " + msg);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <div className="space-y-6">
          <PageHeader
            title="Phân công nhân sự Thi đua & Kỷ luật"
            description="Ủy quyền thành viên Ban Kỷ luật, Ban Thi đua và phân công người tổng kết, ký xác nhận bảng điểm từng lớp theo tuần."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === "roles" ? (
                  <Button size="sm" onClick={() => setIsAssignRoleModalOpen(true)} className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Cấp quyền thành viên ban
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    {weeks.length === 0 && (
                      <Button variant="secondary" size="sm" onClick={handleCreateWeekFast} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Tạo Tuần thi đua
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleAutoAssignAllHomeroomTeachers}
                      disabled={isAutoAssigning || !selectedWeek}
                      className="gap-2"
                    >
                      <Wand2 className="h-4 w-4 text-primary" />
                      {isAutoAssigning ? "Đang gán..." : "Gán nhanh tất cả GVCN"}
                    </Button>
                  </div>
                )}
              </div>
            }
          />

          {/* BỘ LỌC NĂM HỌC & CHỌN TAB CHÍNH */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* TABS */}
            <div className="flex items-center gap-2 border-b md:border-b-0 pb-2 md:pb-0">
              <button
                type="button"
                onClick={() => setActiveTab("roles")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2",
                  activeTab === "roles"
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                Ban Kỷ luật & Ban Thi đua ({roleAssignments.filter((r) => r.isActive).length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("signers")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2",
                  activeTab === "signers"
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                )}
              >
                <GraduationCap className="h-4 w-4" />
                Người ký xác nhận tuần ({classes.length} lớp)
              </button>
            </div>

            {/* BỘ LỌC NĂM HỌC */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">Năm học:</span>
              <select
                value={selectedSchoolYearId}
                onChange={(e) => setSelectedSchoolYearId(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {schoolYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name || y.code} {y.isActive ? "(Hiện hành)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* NỘI DUNG TAB 1: PHÂN QUYỀN BAN KỶ LUẬT & BAN THI ĐUA */}
          {activeTab === "roles" && (
            <Card className="overflow-hidden">
              <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-base">Danh sách nhân sự được phân quyền</h3>
                  <p className="text-xs text-muted-foreground">
                    Cấp quyền ghi nhận vi phạm (Ban Kỷ luật) hoặc duyệt điểm (Ban Thi đua) mà không thay đổi vai trò tài khoản gốc.
                  </p>
                </div>
              </div>

              {loadingRoles ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : roleAssignments.length === 0 ? (
                <EmptyState
                  icon={<Shield className="h-6 w-6" />}
                  title="Chưa có nhân sự nào được phân quyền"
                  description="Hãy bấm nút 'Cấp quyền thành viên ban' ở trên để ủy quyền cho giáo viên phụ trách Kỷ luật hoặc Thi đua."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase font-medium">
                      <tr>
                        <th className="py-3 px-4">Họ và tên</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Ban phụ trách</th>
                        <th className="py-3 px-4">Phạm vi lớp theo dõi</th>
                        <th className="py-3 px-4 text-center">Trạng thái</th>
                        <th className="py-3 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {roleAssignments.map((r) => {
                        const isDiscipline = r.roleType === "discipline_committee";
                        const hasSpecificClasses = r.assignedClassIds && r.assignedClassIds.length > 0;

                        return (
                          <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                            <td className="py-3 px-4 font-semibold text-foreground">{r.userFullName}</td>
                            <td className="py-3 px-4 text-muted-foreground">{r.userEmail}</td>
                            <td className="py-3 px-4">
                              {isDiscipline ? (
                                <Badge tone="danger">
                                  Ban Kỷ luật (Ghi nhận vi phạm)
                                </Badge>
                              ) : (
                                <Badge tone="info">
                                  Ban Thi đua (Duyệt điểm)
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {isDiscipline ? (
                                hasSpecificClasses ? (
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {r.assignedClassIds!.map((cid) => (
                                      <span key={cid} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-medium">
                                        {classMap.get(cid) || cid}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs font-medium text-emerald-600">Toàn trường (Tất cả các lớp)</span>
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">Toàn trường</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {r.isActive !== false ? (
                                <Badge tone="success">Hoạt động</Badge>
                              ) : (
                                <Badge tone="neutral">Đã thu hồi</Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {r.isActive !== false && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevokeRole(r)}
                                  className="text-destructive hover:bg-destructive/10 gap-1"
                                  title="Thu hồi quyền"
                                >
                                  <UserMinus className="h-4 w-4" /> Thu hồi
                                </Button>
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
          )}

          {/* NỘI DUNG TAB 2: PHÂN CÔNG NGƯỜI KÝ XÁC NHẬN THEO TUẦN VÀ LỚP */}
          {activeTab === "signers" && (
            <div className="space-y-4">
              {/* CHỌN TUẦN THI ĐUA */}
              <Card className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    <div>
                      <Label htmlFor="weekSelect" className="text-xs font-semibold uppercase text-muted-foreground">
                        Tuần thi đua
                      </Label>
                      <select
                        id="weekSelect"
                        value={selectedWeekId}
                        onChange={(e) => setSelectedWeekId(e.target.value)}
                        className="mt-1 block w-60 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-semibold"
                      >
                        {weeks.length === 0 ? (
                          <option value="">Chưa có tuần thi đua</option>
                        ) : (
                          weeks.map((w) => (
                            <option key={w.id} value={w.id}>
                              Tuần {w.weekNumber} {w.status === "locked" ? "🔒 (Đã khóa sổ)" : "(Đang mở)"}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground max-w-md bg-muted/30 p-2.5 rounded-lg border">
                    💡 <strong>Quy trình ký xác nhận:</strong> Mỗi lớp bắt buộc phải có người được phân công (ưu tiên GVCN hoặc thành viên Ban Thi đua phụ trách lớp). Người được phân công sẽ tổng kết điểm và ký xác nhận điện tử trước khi Ban Thi đua khóa sổ tuần.
                  </div>
                </div>
              </Card>

              {/* BẢNG PHÂN CÔNG TỪNG LỚP */}
              <Card className="overflow-hidden">
                {loadingSigners ? (
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : classes.length === 0 ? (
                  <EmptyState
                    icon={<GraduationCap className="h-6 w-6" />}
                    title="Chưa có dữ liệu lớp học"
                    description="Vui lòng tạo lớp học trong năm học này trước khi phân công."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase font-medium">
                        <tr>
                          <th className="py-3 px-4 w-12 text-center">STT</th>
                          <th className="py-3 px-4">Lớp học</th>
                          <th className="py-3 px-4">Giáo viên chủ nhiệm</th>
                          <th className="py-3 px-4">Người tổng kết & ký tuần này</th>
                          <th className="py-3 px-4 text-center">Trạng thái phân công</th>
                          <th className="py-3 px-4 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {classes.map((c, index) => {
                          const gvcn = c.homeroomTeacherId ? teacherMap.get(c.homeroomTeacherId) : null;
                          const signerAssignment = signerMap.get(c.id);

                          return (
                            <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                              <td className="py-3 px-4 text-center text-muted-foreground">{index + 1}</td>
                              <td className="py-3 px-4 font-bold text-foreground">{c.name || c.code}</td>
                              <td className="py-3 px-4">
                                {gvcn ? (
                                  <div>
                                    <div className="font-medium text-foreground">{gvcn.fullName}</div>
                                    <div className="text-xs text-muted-foreground">{gvcn.email || "—"}</div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Chưa gán GVCN</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {signerAssignment ? (
                                  <div>
                                    <div className="font-semibold text-primary">{signerAssignment.assignedSignerName}</div>
                                    <div className="text-xs text-muted-foreground">{signerAssignment.assignedSignerEmail}</div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-amber-600 font-medium">Chưa phân công người ký</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {signerAssignment ? (
                                  <Badge tone="success">
                                    Đã phân công
                                  </Badge>
                                ) : (
                                  <Badge tone="neutral">Chờ phân công</Badge>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleOpenAssignSigner(c)}
                                  disabled={!selectedWeek}
                                >
                                  {signerAssignment ? "Đổi người ký" : "Phân công"}
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
            </div>
          )}

          {/* MODAL CẤP QUYỀN BAN KỶ LUẬT / BAN THI ĐUA */}
          <Modal
            open={isAssignRoleModalOpen}
            onOpenChange={setIsAssignRoleModalOpen}
            title="Cấp quyền thành viên Ban Kỷ luật / Ban Thi đua"
          >
            <form onSubmit={handleAssignRole} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="teacherSelect">Chọn Giáo viên / Nhân sự *</Label>
                <select
                  id="teacherSelect"
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">-- Chọn giáo viên --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName} {t.teacherCode ? `(${t.teacherCode})` : ""} - {t.email || "Chưa có email"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="roleTypeSelect">Vai trò phân công *</Label>
                <select
                  id="roleTypeSelect"
                  value={selectedRoleType}
                  onChange={(e) => setSelectedRoleType(e.target.value as "discipline_committee" | "competition_committee")}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                >
                  <option value="discipline_committee">Ban Kỷ luật (Ghi nhận vi phạm học sinh)</option>
                  <option value="competition_committee">Ban Thi đua (Duyệt điểm & Tổng kết thi đua)</option>
                </select>
              </div>

              {selectedRoleType === "discipline_committee" && (
                <div className="space-y-2 p-3 bg-muted/40 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Phạm vi lớp theo dõi & ghi nhận</Label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAllClasses}
                        onChange={(e) => setIsAllClasses(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span>Toàn trường (Tất cả các lớp)</span>
                    </label>
                  </div>

                  {!isAllClasses && (
                    <div className="grid grid-cols-2 gap-2 pt-2 max-h-48 overflow-y-auto">
                      {classes.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-xs p-1 rounded hover:bg-background cursor-pointer">
                          <input
                            type="checkbox"
                            checked={assignedClassIds.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) setAssignedClassIds([...assignedClassIds, c.id]);
                              else setAssignedClassIds(assignedClassIds.filter((id) => id !== c.id));
                            }}
                            className="rounded border-input text-primary focus:ring-primary"
                          />
                          <span>{c.name || c.code}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsAssignRoleModalOpen(false)}
                  disabled={isSubmittingRole}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmittingRole}>
                  {isSubmittingRole ? "Đang xử lý..." : "Xác nhận cấp quyền"}
                </Button>
              </div>
            </form>
          </Modal>

          {/* MODAL PHÂN CÔNG NGƯỜI KÝ CHO 1 LỚP */}
          <Modal
            open={isAssignSignerModalOpen}
            onOpenChange={setIsAssignSignerModalOpen}
            title={`Phân công người ký: Lớp ${targetClassForSigner?.name}`}
          >
            <form onSubmit={handleSaveSigner} className="space-y-4 pt-2">
              <div className="p-3 bg-muted/30 rounded-md text-xs space-y-1">
                <div>Tuần thi đua: <strong>Tuần {selectedWeek?.weekNumber}</strong></div>
                <div>Lớp học: <strong>{targetClassForSigner?.name}</strong></div>
              </div>

              <div>
                <Label htmlFor="signerSelect">Chọn người tổng kết & ký xác nhận *</Label>
                <select
                  id="signerSelect"
                  value={selectedSignerTeacherId}
                  onChange={(e) => setSelectedSignerTeacherId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">-- Chọn giáo viên / người ký --</option>
                  {teachers.map((t) => {
                    const isHomeroom = t.id === targetClassForSigner?.homeroomTeacherId;
                    return (
                      <option key={t.id} value={t.id}>
                        {t.fullName} {isHomeroom ? "⭐ (GVCN lớp này)" : ""} - {t.email || ""}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Khuyến nghị: Chọn Giáo viên chủ nhiệm của lớp hoặc Ủy viên Ban Thi đua phụ trách khối.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsAssignSignerModalOpen(false)}
                  disabled={isSubmittingSigner}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmittingSigner}>
                  {isSubmittingSigner ? "Đang lưu..." : "Lưu phân công"}
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      </Shell>
    </RoleGuard>
  );
}
