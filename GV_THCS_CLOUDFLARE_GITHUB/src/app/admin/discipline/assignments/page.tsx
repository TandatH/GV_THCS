"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Layers,
  ListFilter,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Unlock,
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
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  createSaoDoAccount,
  updateSaoDoAccount,
  resetSaoDoPassword,
  deleteSaoDoAccount,
  type AssignDisciplineRoleInput,
  type AssignWeeklyDisciplineSignerInput,
  type CreateSaoDoAccountInput,
  type UpdateSaoDoAccountInput,
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
  isSaoDo?: boolean;
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

type SaoDoUserRow = DocumentData & {
  id: string;
  fullName: string;
  displayName?: string;
  username?: string;
  email: string;
  userType?: string;
  isSaoDo?: boolean;
  studentClassId?: string | null;
  studentClassName?: string;
  assignedClassIds?: string[];
  schoolYearId?: string;
  isActive?: boolean;
  note?: string;
  createdAt?: unknown;
};

function generateRandom8Chars(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function DisciplineAssignmentsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState<"roles" | "signers" | "saodo">(
    tabParam === "saodo" ? "saodo" : tabParam === "signers" ? "signers" : "roles",
  );

  // Dữ liệu danh mục
  const [schoolYears, setSchoolYears] = useState<OptionRow[]>([]);
  const [classes, setClasses] = useState<OptionRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);

  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");

  // Tab 1: Phân quyền Ban Kỷ luật & Ban Thi đua (Giáo viên)
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

  // Tab 3: Quản lý Đội Sao Đỏ
  const [saoDoUsers, setSaoDoUsers] = useState<SaoDoUserRow[]>([]);
  const [loadingSaoDo, setLoadingSaoDo] = useState<boolean>(true);
  const [saoDoSearchTerm, setSaoDoSearchTerm] = useState<string>("");

  // Modal Tạo tài khoản Sao Đỏ
  const [isCreateSaoDoModalOpen, setIsCreateSaoDoModalOpen] = useState<boolean>(false);
  const [saoDoFullName, setSaoDoFullName] = useState<string>("");
  const [saoDoUsername, setSaoDoUsername] = useState<string>("");
  const [saoDoPassword, setSaoDoPassword] = useState<string>(generateRandom8Chars());
  const [showCreatePassword, setShowCreatePassword] = useState<boolean>(false);
  const [saoDoStudentClassId, setSaoDoStudentClassId] = useState<string>("");
  const [saoDoAssignedClassIds, setSaoDoAssignedClassIds] = useState<string[]>([]);
  const [saoDoNote, setSaoDoNote] = useState<string>("");
  const [isSubmittingCreateSaoDo, setIsSubmittingCreateSaoDo] = useState<boolean>(false);

  // Modal Kết quả tài khoản vừa tạo thành công
  const [createdCredentials, setCreatedCredentials] = useState<{
    fullName: string;
    username: string;
    email: string;
    temporaryPassword?: string;
    assignedClassNames: string[];
  } | null>(null);

  // Modal Sửa phân công Sao Đỏ
  const [isEditSaoDoModalOpen, setIsEditSaoDoModalOpen] = useState<boolean>(false);
  const [editingSaoDo, setEditingSaoDo] = useState<SaoDoUserRow | null>(null);
  const [editFullName, setEditFullName] = useState<string>("");
  const [editStudentClassId, setEditStudentClassId] = useState<string>("");
  const [editAssignedClassIds, setEditAssignedClassIds] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editNote, setEditNote] = useState<string>("");
  const [isSubmittingEditSaoDo, setIsSubmittingEditSaoDo] = useState<boolean>(false);

  // Modal Đổi mật khẩu Sao Đỏ
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState<boolean>(false);
  const [targetSaoDoForPassword, setTargetSaoDoForPassword] = useState<SaoDoUserRow | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState<string>("");
  const [showResetPassword, setShowResetPassword] = useState<boolean>(false);
  const [isSubmittingReset, setIsSubmittingReset] = useState<boolean>(false);

  // Đồng bộ URL param khi chuyển tab
  useEffect(() => {
    if (tabParam === "saodo" && activeTab !== "saodo") {
      setActiveTab("saodo");
    }
  }, [tabParam, activeTab]);

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
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
      rows.sort((a, b) => (a.name || a.code || "").localeCompare(b.name || b.code || ""));
      setClasses(rows);
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

  // 6. Tải danh sách Tài khoản Sao Đỏ (Tab 3)
  useEffect(() => {
    setLoadingSaoDo(true);
    const qSaoDo = query(collection(firestore, "users"), where("userType", "==", "sao_do"));
    const unsub = onSnapshot(
      qSaoDo,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as SaoDoUserRow[];
        rows.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
        setSaoDoUsers(rows);
        setLoadingSaoDo(false);
      },
      (err) => {
        console.error("Lỗi tải danh sách Sao Đỏ:", err);
        setLoadingSaoDo(false);
      },
    );
    return () => unsub();
  }, []);

  // Map tìm tên lớp theo ID
  const classMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((c) => map.set(c.id, c.name || c.code || c.id));
    return map;
  }, [classes]);

  // Nhóm lớp theo khối (Khối 6, 7, 8, 9)
  const classesByGrade = useMemo(() => {
    const groups: Record<string, OptionRow[]> = { "Khối 6": [], "Khối 7": [], "Khối 8": [], "Khối 9": [], "Khác": [] };
    classes.forEach((c) => {
      const name = (c.name || c.code || "").trim();
      if (name.startsWith("6")) groups["Khối 6"].push(c);
      else if (name.startsWith("7")) groups["Khối 7"].push(c);
      else if (name.startsWith("8")) groups["Khối 8"].push(c);
      else if (name.startsWith("9")) groups["Khối 9"].push(c);
      else groups["Khác"].push(c);
    });
    return groups;
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

  // Lọc chỉ giáo viên trong Tab 1 (loại bỏ Sao Đỏ khỏi bảng nhân sự giáo viên)
  const teacherRoleAssignments = useMemo(() => {
    return roleAssignments.filter((r) => !r.isSaoDo);
  }, [roleAssignments]);

  // Lọc danh sách Sao Đỏ theo từ khóa tìm kiếm
  const filteredSaoDoUsers = useMemo(() => {
    if (!saoDoSearchTerm.trim()) return saoDoUsers;
    const term = saoDoSearchTerm.toLowerCase();
    return saoDoUsers.filter(
      (s) =>
        (s.fullName || "").toLowerCase().includes(term) ||
        (s.username || "").toLowerCase().includes(term) ||
        (s.email || "").toLowerCase().includes(term),
    );
  }, [saoDoUsers, saoDoSearchTerm]);

  // Xử lý Cấp quyền Ban Kỷ luật / Ban Thi đua (Giáo viên)
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
      for (const cls of unassignedClasses) {
        const teacher = teacherMap.get(cls.homeroomTeacherId!);
        if (teacher) {
          const signerUid = teacher.userId || teacher.id;
          const signerEmail = teacher.email || `${signerUid}@school.edu.vn`;
          await assignWeeklyDisciplineSigner({
            schoolYearId: selectedSchoolYearId,
            weekId: selectedWeek.id,
            classId: cls.id,
            signerUid,
            signerName: teacher.fullName,
            signerEmail,
          });
          successCount++;
        }
      }
      toast.success(`Đã tự động phân công thành công ${successCount} GVCN ký xác nhận tuần ${selectedWeek.weekNumber}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi khi tự động gán GVCN: " + msg);
    } finally {
      setIsAutoAssigning(false);
    }
  }

  // Tạo nhanh tuần thi đua nếu chưa có
  async function handleCreateWeekFast() {
    if (!selectedSchoolYearId) {
      toast.error("Vui lòng chọn năm học trước.");
      return;
    }
    const nextNum = weeks.length + 1;
    const weekId = `week_${selectedSchoolYearId}_${nextNum}`;
    try {
      await setDoc(
        doc(firestore, "disciplineWeeks", weekId),
        {
          weekNumber: nextNum,
          schoolYearId: selectedSchoolYearId,
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

  // =========================================================================
  // XỬ LÝ QUẢN LÝ TÀI KHOẢN SAO ĐỎ (TAB 3)
  // =========================================================================

  // Mở modal tạo tài khoản Sao Đỏ
  function handleOpenCreateSaoDo() {
    setSaoDoFullName("");
    setSaoDoUsername("");
    setSaoDoPassword(generateRandom8Chars());
    setShowCreatePassword(false);
    setSaoDoStudentClassId("");
    setSaoDoAssignedClassIds([]);
    setSaoDoNote("");
    setIsCreateSaoDoModalOpen(true);
  }

  // Tạo tài khoản Sao Đỏ
  async function handleCreateSaoDoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!saoDoFullName.trim()) {
      toast.error("Vui lòng nhập họ và tên học sinh.");
      return;
    }
    if (!saoDoUsername.trim()) {
      toast.error("Vui lòng nhập tên đăng nhập cho Sao Đỏ.");
      return;
    }
    if (!selectedSchoolYearId) {
      toast.error("Vui lòng chọn năm học.");
      return;
    }

    setIsSubmittingCreateSaoDo(true);
    try {
      const studentClass = classes.find((c) => c.id === saoDoStudentClassId);
      const studentClassName = studentClass ? (studentClass.name || studentClass.code || "") : "";

      const payload: CreateSaoDoAccountInput = {
        fullName: saoDoFullName.trim(),
        username: saoDoUsername.trim(),
        password: saoDoPassword.trim() || undefined,
        studentClassId: saoDoStudentClassId || null,
        studentClassName,
        assignedClassIds: saoDoAssignedClassIds,
        schoolYearId: selectedSchoolYearId,
        note: saoDoNote.trim() || undefined,
      };

      const res = await createSaoDoAccount(payload);
      toast.success(res.message || "Tạo tài khoản Sao Đỏ thành công!");

      setIsCreateSaoDoModalOpen(false);

      // Hiển thị modal thông tin tài khoản vừa tạo để sao chép
      const assignedNames = saoDoAssignedClassIds.map((cid) => classMap.get(cid) || cid);
      setCreatedCredentials({
        fullName: saoDoFullName.trim(),
        username: res.username || saoDoUsername.trim(),
        email: res.email,
        temporaryPassword: res.temporaryPassword || saoDoPassword,
        assignedClassNames: assignedNames,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Lỗi tạo tài khoản Sao Đỏ:", err);
      toast.error("Lỗi tạo tài khoản: " + msg);
    } finally {
      setIsSubmittingCreateSaoDo(false);
    }
  }

  // Mở modal sửa tài khoản Sao Đỏ
  function handleOpenEditSaoDo(saoDo: SaoDoUserRow) {
    setEditingSaoDo(saoDo);
    setEditFullName(saoDo.fullName || saoDo.displayName || "");
    setEditStudentClassId(saoDo.studentClassId || "");
    setEditAssignedClassIds(saoDo.assignedClassIds || []);
    setEditIsActive(saoDo.isActive !== false);
    setEditNote(saoDo.note || "");
    setIsEditSaoDoModalOpen(true);
  }

  // Lưu chỉnh sửa tài khoản Sao Đỏ
  async function handleUpdateSaoDoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSaoDo) return;

    setIsSubmittingEditSaoDo(true);
    try {
      const studentClass = classes.find((c) => c.id === editStudentClassId);
      const studentClassName = studentClass ? (studentClass.name || studentClass.code || "") : "";

      const payload: UpdateSaoDoAccountInput = {
        uid: editingSaoDo.id,
        fullName: editFullName.trim(),
        studentClassId: editStudentClassId || null,
        studentClassName,
        assignedClassIds: editAssignedClassIds,
        schoolYearId: selectedSchoolYearId,
        isActive: editIsActive,
        note: editNote.trim() || undefined,
      };

      const res = await updateSaoDoAccount(payload);
      toast.success(res.message || "Đã cập nhật thông tin Sao Đỏ.");
      setIsEditSaoDoModalOpen(false);
      setEditingSaoDo(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi cập nhật: " + msg);
    } finally {
      setIsSubmittingEditSaoDo(false);
    }
  }

  // Mở modal đổi mật khẩu
  function handleOpenResetPassword(saoDo: SaoDoUserRow) {
    setTargetSaoDoForPassword(saoDo);
    setResetPasswordInput(generateRandom8Chars());
    setShowResetPassword(false);
    setIsResetPasswordModalOpen(true);
  }

  // Đặt lại mật khẩu
  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetSaoDoForPassword) return;

    setIsSubmittingReset(true);
    try {
      const res = await resetSaoDoPassword({
        uid: targetSaoDoForPassword.id,
        password: resetPasswordInput.trim() || undefined,
      });
      toast.success(res.message || "Đã đặt lại mật khẩu thành công!");
      setIsResetPasswordModalOpen(false);
      // Hiển thị lại popup để copy
      setCreatedCredentials({
        fullName: targetSaoDoForPassword.fullName || targetSaoDoForPassword.displayName || "",
        username: targetSaoDoForPassword.username || targetSaoDoForPassword.email,
        email: targetSaoDoForPassword.email,
        temporaryPassword: res.temporaryPassword || resetPasswordInput,
        assignedClassNames: (targetSaoDoForPassword.assignedClassIds || []).map((cid) => classMap.get(cid) || cid),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi đổi mật khẩu: " + msg);
    } finally {
      setIsSubmittingReset(false);
    }
  }

  // Xóa / Vô hiệu hóa tài khoản Sao Đỏ
  async function handleDeleteSaoDo(saoDo: SaoDoUserRow) {
    const name = saoDo.fullName || saoDo.displayName || saoDo.username;
    if (!confirm(`Bạn có chắc chắn muốn xóa hoặc vô hiệu hóa tài khoản Sao Đỏ của học sinh "${name}"?`)) {
      return;
    }

    try {
      const res = await deleteSaoDoAccount({ uid: saoDo.id });
      toast.success(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi xóa tài khoản: " + msg);
    }
  }

  // Sao chép thông tin tài khoản vào Clipboard
  function copyCredentialsToClipboard(creds: {
    fullName: string;
    username: string;
    email: string;
    temporaryPassword?: string;
    assignedClassNames: string[];
  }) {
    const text = [
      `THÔNG TIN TÀI KHOẢN SAO ĐỎ`,
      `Họ và tên: ${creds.fullName}`,
      `Tên đăng nhập: ${creds.username}`,
      `Email hệ thống: ${creds.email}`,
      `Mật khẩu khởi tạo: ${creds.temporaryPassword || "—"}`,
      `Lớp phân công chấm: ${creds.assignedClassNames.length > 0 ? creds.assignedClassNames.join(", ") : "Toàn trường"}`,
      `Học sinh có thể đăng nhập bằng tên "${creds.username}" tại trang đăng nhập hệ thống.`,
    ].join("\n");

    navigator.clipboard.writeText(text);
    toast.success("Đã sao chép thông tin tài khoản vào bộ nhớ tạm!");
  }

  // Toggle chọn cả khối trong modal tạo / sửa
  function toggleGradeSelection(gradeClasses: OptionRow[], currentSelected: string[], setSelected: (val: string[]) => void) {
    const gradeIds = gradeClasses.map((c) => c.id);
    const allSelected = gradeIds.every((id) => currentSelected.includes(id));
    if (allSelected) {
      // Bỏ chọn khối này
      setSelected(currentSelected.filter((id) => !gradeIds.includes(id)));
    } else {
      // Chọn tất cả khối này
      const merged = Array.from(new Set([...currentSelected, ...gradeIds]));
      setSelected(merged);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <div className="space-y-6">
          <PageHeader
            title="Phân công nhân sự Thi đua & Kỷ luật"
            description="Ủy quyền thành viên Ban Kỷ luật, Ban Thi đua, phân công người ký xác nhận bảng điểm và quản lý tài khoản Đội Sao Đỏ."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === "roles" ? (
                  <Button size="sm" onClick={() => setIsAssignRoleModalOpen(true)} className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Cấp quyền thành viên ban
                  </Button>
                ) : activeTab === "signers" ? (
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
                ) : (
                  <Button size="sm" onClick={handleOpenCreateSaoDo} className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Tạo tài khoản Sao Đỏ
                  </Button>
                )}
              </div>
            }
          />

          {/* BỘ LỌC NĂM HỌC & CHỌN TAB CHÍNH */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* TABS */}
            <div className="flex items-center gap-2 border-b md:border-b-0 pb-2 md:pb-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab("roles")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap",
                  activeTab === "roles"
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                Ban Kỷ luật & Ban Thi đua ({teacherRoleAssignments.filter((r) => r.isActive).length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("signers")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap",
                  activeTab === "signers"
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                )}
              >
                <GraduationCap className="h-4 w-4" />
                Người ký xác nhận tuần ({classes.length} lớp)
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("saodo")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap",
                  activeTab === "saodo"
                    ? "bg-amber-500 text-white shadow"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                )}
              >
                <Star className="h-4 w-4 fill-current" />
                Đội Sao Đỏ ({saoDoUsers.filter((s) => s.isActive !== false).length})
              </button>
            </div>

            {/* BỘ LỌC NĂM HỌC */}
            <div className="flex items-center gap-2 shrink-0">
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

          {/* NỘI DUNG TAB 1: PHÂN QUYỀN BAN KỶ LUẬT & BAN THI ĐUA (GIÁO VIÊN) */}
          {activeTab === "roles" && (
            <Card className="overflow-hidden">
              <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-base">Danh sách nhân sự giáo viên được phân quyền</h3>
                  <p className="text-xs text-muted-foreground">
                    Cấp quyền ghi nhận vi phạm (Ban Kỷ luật) hoặc duyệt điểm (Ban Thi đua) cho giáo viên mà không thay đổi vai trò tài khoản gốc.
                  </p>
                </div>
              </div>

              {loadingRoles ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : teacherRoleAssignments.length === 0 ? (
                <EmptyState
                  icon={<Shield className="h-6 w-6" />}
                  title="Chưa có giáo viên nào được phân quyền"
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
                      {teacherRoleAssignments.map((r) => {
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

          {/* NỘI DUNG TAB 3: QUẢN LÝ ĐỘI SAO ĐỎ */}
          {activeTab === "saodo" && (
            <Card className="overflow-hidden">
              <div className="p-4 border-b bg-muted/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                    Danh sách tài khoản Đội Sao Đỏ
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tạo tài khoản học sinh, cấp mật khẩu và phân công phạm vi các lớp theo dõi kỷ luật, nề nếp.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Tìm theo họ tên, username..."
                      value={saoDoSearchTerm}
                      onChange={(e) => setSaoDoSearchTerm(e.target.value)}
                      className="pl-8 text-xs h-9"
                    />
                  </div>
                  <Button size="sm" onClick={handleOpenCreateSaoDo} className="gap-2 shrink-0">
                    <UserPlus className="h-4 w-4" />
                    Tạo tài khoản Sao Đỏ
                  </Button>
                </div>
              </div>

              {loadingSaoDo ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredSaoDoUsers.length === 0 ? (
                <EmptyState
                  icon={<Star className="h-6 w-6 text-amber-500" />}
                  title={saoDoSearchTerm ? "Không tìm thấy học sinh Sao Đỏ nào" : "Chưa có tài khoản Sao Đỏ"}
                  description={
                    saoDoSearchTerm
                      ? "Hãy thử tìm kiếm với từ khóa khác."
                      : "Bấm nút 'Tạo tài khoản Sao Đỏ' ở trên để thêm học sinh và cấp quyền ghi nhận kỷ luật."
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase font-medium">
                      <tr>
                        <th className="py-3 px-4 w-12 text-center">STT</th>
                        <th className="py-3 px-4">Họ và tên học sinh</th>
                        <th className="py-3 px-4">Tên đăng nhập / Email</th>
                        <th className="py-3 px-4">Lớp học sinh</th>
                        <th className="py-3 px-4">Các lớp phụ trách chấm</th>
                        <th className="py-3 px-4 text-center">Trạng thái</th>
                        <th className="py-3 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredSaoDoUsers.map((s, index) => {
                        const assignedClasses = s.assignedClassIds || [];
                        const isActive = s.isActive !== false;

                        return (
                          <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                            <td className="py-3 px-4 text-center text-muted-foreground">{index + 1}</td>
                            <td className="py-3 px-4 font-semibold text-foreground">
                              {s.fullName || s.displayName}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono text-xs bg-muted px-2 py-1 rounded font-semibold text-primary">
                                {s.username || s.email}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {s.studentClassId ? (
                                <Badge tone="info">
                                  {classMap.get(s.studentClassId) || s.studentClassName || s.studentClassId}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Chưa chọn</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {assignedClasses.length > 0 ? (
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {assignedClasses.map((cid) => (
                                    <span
                                      key={cid}
                                      className="text-[11px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-medium"
                                    >
                                      {classMap.get(cid) || cid}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-amber-600 font-medium">Toàn trường (Tất cả lớp)</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isActive ? (
                                <Badge tone="success">Hoạt động</Badge>
                              ) : (
                                <Badge tone="neutral">Đã khóa</Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEditSaoDo(s)}
                                  className="h-8 px-2 text-primary hover:bg-primary/10 gap-1 text-xs"
                                  title="Chỉnh sửa phân công"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Sửa
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenResetPassword(s)}
                                  className="h-8 px-2 text-amber-600 hover:bg-amber-50 gap-1 text-xs"
                                  title="Đổi mật khẩu"
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                  Mật khẩu
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteSaoDo(s)}
                                  className="h-8 px-2 text-destructive hover:bg-destructive/10 text-xs"
                                  title={isActive ? "Vô hiệu hóa hoặc Xóa" : "Xóa vĩnh viễn"}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
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
          )}

          {/* ================================================================= */}
          {/* MODAL 1: CẤP QUYỀN BAN KỶ LUẬT / BAN THI ĐUA (GIÁO VIÊN)           */}
          {/* ================================================================= */}
          <Modal
            open={isAssignRoleModalOpen}
            onOpenChange={setIsAssignRoleModalOpen}
            title="Cấp quyền thành viên Ban Kỷ luật / Ban Thi đua (Giáo viên)"
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

          {/* ================================================================= */}
          {/* MODAL 2: PHÂN CÔNG NGƯỜI KÝ CHO 1 LỚP                            */}
          {/* ================================================================= */}
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

          {/* ================================================================= */}
          {/* MODAL 3: TẠO TÀI KHOẢN SAO ĐỎ                                     */}
          {/* ================================================================= */}
          <Modal
            open={isCreateSaoDoModalOpen}
            onOpenChange={setIsCreateSaoDoModalOpen}
            title="Tạo tài khoản học sinh Đội Sao Đỏ"
          >
            <form onSubmit={handleCreateSaoDoSubmit} className="space-y-4 pt-2 max-h-[80vh] overflow-y-auto pr-1">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  Quyền hạn tài khoản Sao Đỏ
                </div>
                <div className="text-amber-800">
                  Tài khoản có quyền ghi nhận vi phạm nề nếp kỷ luật cho <strong>các lớp được phân công</strong>. Học sinh chỉ thấy danh sách lớp được giao phụ trách khi đăng nhập vào hệ thống.
                </div>
              </div>

              <div>
                <Label htmlFor="saoDoFullName">Họ và tên học sinh Sao Đỏ *</Label>
                <Input
                  id="saoDoFullName"
                  placeholder="Ví dụ: Nguyễn Văn Nam"
                  value={saoDoFullName}
                  onChange={(e) => setSaoDoFullName(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="saoDoUsername">Tên đăng nhập *</Label>
                  <Input
                    id="saoDoUsername"
                    placeholder="Ví dụ: saodo_6a1 hoặc saodo.nam"
                    value={saoDoUsername}
                    onChange={(e) => setSaoDoUsername(e.target.value)}
                    required
                    className="mt-1 font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Chữ cái không dấu, số, dấu chấm hoặc gạch dưới.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="saoDoPassword">Mật khẩu khởi tạo</Label>
                    <button
                      type="button"
                      onClick={() => setSaoDoPassword(generateRandom8Chars())}
                      className="text-[11px] text-primary hover:underline font-semibold"
                    >
                      Sinh mật khẩu mới
                    </button>
                  </div>
                  <div className="relative mt-1">
                    <Input
                      id="saoDoPassword"
                      type={showCreatePassword ? "text" : "password"}
                      value={saoDoPassword}
                      onChange={(e) => setSaoDoPassword(e.target.value)}
                      required
                      className="pr-10 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword(!showCreatePassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="saoDoClassSelect">Lớp của học sinh này (không bắt buộc)</Label>
                <select
                  id="saoDoClassSelect"
                  value={saoDoStudentClassId}
                  onChange={(e) => setSaoDoStudentClassId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Chọn lớp học sinh đang học --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.code}
                    </option>
                  ))}
                </select>
              </div>

              {/* CHỌN CÁC LỚP PHỤ TRÁCH CHẤM */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <Label className="text-xs font-semibold">Phân công các lớp phụ trách chấm *</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Đã chọn: <strong>{saoDoAssignedClassIds.length}</strong> lớp
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSaoDoAssignedClassIds(classes.map((c) => c.id))}
                      className="text-xs h-7 px-2"
                    >
                      Chọn tất cả
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSaoDoAssignedClassIds([])}
                      className="text-xs h-7 px-2 text-destructive"
                    >
                      Bỏ chọn
                    </Button>
                  </div>
                </div>

                {/* Chọn theo khối */}
                <div className="space-y-3 pt-1">
                  {Object.entries(classesByGrade).map(([gradeName, gradeClasses]) => {
                    if (gradeClasses.length === 0) return null;
                    const gradeIds = gradeClasses.map((c) => c.id);
                    const isAllGradeSelected = gradeIds.every((id) => saoDoAssignedClassIds.includes(id));

                    return (
                      <div key={gradeName} className="space-y-1.5">
                        <div className="flex items-center justify-between bg-muted/60 px-2 py-1 rounded">
                          <span className="text-xs font-semibold text-foreground">{gradeName}</span>
                          <button
                            type="button"
                            onClick={() => toggleGradeSelection(gradeClasses, saoDoAssignedClassIds, setSaoDoAssignedClassIds)}
                            className="text-[11px] text-primary hover:underline font-medium"
                          >
                            {isAllGradeSelected ? "Bỏ chọn khối" : "Chọn cả khối"}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-1">
                          {gradeClasses.map((c) => {
                            const isChecked = saoDoAssignedClassIds.includes(c.id);
                            return (
                              <label
                                key={c.id}
                                className={cn(
                                  "flex items-center gap-2 text-xs p-1.5 rounded border transition-colors cursor-pointer",
                                  isChecked
                                    ? "bg-primary/10 border-primary/40 font-medium text-primary"
                                    : "bg-background border-border hover:bg-muted/50",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSaoDoAssignedClassIds([...saoDoAssignedClassIds, c.id]);
                                    } else {
                                      setSaoDoAssignedClassIds(saoDoAssignedClassIds.filter((id) => id !== c.id));
                                    }
                                  }}
                                  className="rounded border-input text-primary focus:ring-primary"
                                />
                                <span>{c.name || c.code}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="saoDoNote">Ghi chú (tùy chọn)</Label>
                <Input
                  id="saoDoNote"
                  placeholder="Ví dụ: Phụ trách trực cổng đầu giờ..."
                  value={saoDoNote}
                  onChange={(e) => setSaoDoNote(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCreateSaoDoModalOpen(false)}
                  disabled={isSubmittingCreateSaoDo}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmittingCreateSaoDo}>
                  {isSubmittingCreateSaoDo ? "Đang tạo tài khoản..." : "Tạo tài khoản Sao Đỏ"}
                </Button>
              </div>
            </form>
          </Modal>

          {/* ================================================================= */}
          {/* MODAL 4: THÔNG TIN TÀI KHOẢN SAO ĐỎ VỪA TẠO (ĐỂ SAO CHÉP)         */}
          {/* ================================================================= */}
          <Modal
            open={createdCredentials !== null}
            onOpenChange={(open) => !open && setCreatedCredentials(null)}
            title="Tài khoản Sao Đỏ đã sẵn sàng"
          >
            {createdCredentials && (
              <div className="space-y-4 pt-2">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    Đã tạo tài khoản thành công!
                  </div>

                  <div className="space-y-1.5 text-xs text-foreground bg-background p-3 rounded-lg border font-mono">
                    <div>
                      <span className="text-muted-foreground font-sans">Họ và tên:</span>{" "}
                      <strong>{createdCredentials.fullName}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-sans">Tên đăng nhập:</span>{" "}
                      <strong className="text-primary">{createdCredentials.username}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-sans">Mật khẩu:</span>{" "}
                      <strong className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {createdCredentials.temporaryPassword}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-sans">Lớp phụ trách:</span>{" "}
                      <span>
                        {createdCredentials.assignedClassNames.length > 0
                          ? createdCredentials.assignedClassNames.join(", ")
                          : "Toàn trường"}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    💡 Học sinh có thể đăng nhập trực tiếp bằng <strong>Tên đăng nhập</strong> hoặc email đầy đủ tại trang đăng nhập.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setCreatedCredentials(null)}
                  >
                    Đóng
                  </Button>
                  <Button
                    type="button"
                    onClick={() => copyCredentialsToClipboard(createdCredentials)}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Sao chép thông tin
                  </Button>
                </div>
              </div>
            )}
          </Modal>

          {/* ================================================================= */}
          {/* MODAL 5: SỬA THÔNG TIN & PHÂN CÔNG SAO ĐỎ                         */}
          {/* ================================================================= */}
          <Modal
            open={isEditSaoDoModalOpen}
            onOpenChange={setIsEditSaoDoModalOpen}
            title={`Sửa thông tin Sao Đỏ: ${editingSaoDo?.fullName || editingSaoDo?.displayName}`}
          >
            <form onSubmit={handleUpdateSaoDoSubmit} className="space-y-4 pt-2 max-h-[80vh] overflow-y-auto pr-1">
              <div>
                <Label htmlFor="editFullName">Họ và tên học sinh *</Label>
                <Input
                  id="editFullName"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="editStudentClassSelect">Lớp học của học sinh</Label>
                  <select
                    id="editStudentClassSelect"
                    value={editStudentClassId}
                    onChange={(e) => setEditStudentClassId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">-- Chọn lớp học sinh --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="editIsActive">Trạng thái tài khoản</Label>
                  <select
                    id="editIsActive"
                    value={editIsActive ? "active" : "disabled"}
                    onChange={(e) => setEditIsActive(e.target.value === "active")}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="active">Đang hoạt động</option>
                    <option value="disabled">Vô hiệu hóa (Khóa)</option>
                  </select>
                </div>
              </div>

              {/* CHỌN CÁC LỚP PHỤ TRÁCH CHẤM */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <Label className="text-xs font-semibold">Phân công các lớp phụ trách chấm *</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Đã chọn: <strong>{editAssignedClassIds.length}</strong> lớp
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditAssignedClassIds(classes.map((c) => c.id))}
                      className="text-xs h-7 px-2"
                    >
                      Chọn tất cả
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditAssignedClassIds([])}
                      className="text-xs h-7 px-2 text-destructive"
                    >
                      Bỏ chọn
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  {Object.entries(classesByGrade).map(([gradeName, gradeClasses]) => {
                    if (gradeClasses.length === 0) return null;
                    const gradeIds = gradeClasses.map((c) => c.id);
                    const isAllGradeSelected = gradeIds.every((id) => editAssignedClassIds.includes(id));

                    return (
                      <div key={gradeName} className="space-y-1.5">
                        <div className="flex items-center justify-between bg-muted/60 px-2 py-1 rounded">
                          <span className="text-xs font-semibold text-foreground">{gradeName}</span>
                          <button
                            type="button"
                            onClick={() => toggleGradeSelection(gradeClasses, editAssignedClassIds, setEditAssignedClassIds)}
                            className="text-[11px] text-primary hover:underline font-medium"
                          >
                            {isAllGradeSelected ? "Bỏ chọn khối" : "Chọn cả khối"}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-1">
                          {gradeClasses.map((c) => {
                            const isChecked = editAssignedClassIds.includes(c.id);
                            return (
                              <label
                                key={c.id}
                                className={cn(
                                  "flex items-center gap-2 text-xs p-1.5 rounded border transition-colors cursor-pointer",
                                  isChecked
                                    ? "bg-primary/10 border-primary/40 font-medium text-primary"
                                    : "bg-background border-border hover:bg-muted/50",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEditAssignedClassIds([...editAssignedClassIds, c.id]);
                                    } else {
                                      setEditAssignedClassIds(editAssignedClassIds.filter((id) => id !== c.id));
                                    }
                                  }}
                                  className="rounded border-input text-primary focus:ring-primary"
                                />
                                <span>{c.name || c.code}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="editNote">Ghi chú (tùy chọn)</Label>
                <Input
                  id="editNote"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsEditSaoDoModalOpen(false)}
                  disabled={isSubmittingEditSaoDo}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmittingEditSaoDo}>
                  {isSubmittingEditSaoDo ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </div>
            </form>
          </Modal>

          {/* ================================================================= */}
          {/* MODAL 6: ĐẶT LẠI MẬT KHẨU SAO ĐỎ                                 */}
          {/* ================================================================= */}
          <Modal
            open={isResetPasswordModalOpen}
            onOpenChange={setIsResetPasswordModalOpen}
            title={`Đặt lại mật khẩu: ${targetSaoDoForPassword?.fullName || targetSaoDoForPassword?.username}`}
          >
            <form onSubmit={handleResetPasswordSubmit} className="space-y-4 pt-2">
              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                <div>Họ và tên: <strong>{targetSaoDoForPassword?.fullName}</strong></div>
                <div>Tên đăng nhập: <strong>{targetSaoDoForPassword?.username || targetSaoDoForPassword?.email}</strong></div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="resetPasswordInput">Mật khẩu mới *</Label>
                  <button
                    type="button"
                    onClick={() => setResetPasswordInput(generateRandom8Chars())}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Sinh mật khẩu mới
                  </button>
                </div>
                <div className="relative mt-1">
                  <Input
                    id="resetPasswordInput"
                    type={showResetPassword ? "text" : "password"}
                    value={resetPasswordInput}
                    onChange={(e) => setResetPasswordInput(e.target.value)}
                    required
                    className="pr-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsResetPasswordModalOpen(false)}
                  disabled={isSubmittingReset}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmittingReset}>
                  {isSubmittingReset ? "Đang đặt lại..." : "Xác nhận đổi mật khẩu"}
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      </Shell>
    </RoleGuard>
  );
}

export default function DisciplineAssignmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center p-12 text-center text-muted-foreground">
          Đang tải trang phân công nhân sự...
        </div>
      }
    >
      <DisciplineAssignmentsContent />
    </Suspense>
  );
}
