"use client";

/* eslint-disable @next/next/no-img-element */

import type { Role, SchoolLevel, TeacherInput, TeachingRole } from "@school/shared";
import { CirclePlus, Copy, ImagePlus, KeyRound, PencilLine, RotateCcw, Search, ShieldCheck, Trash2, Upload, UsersRound } from "lucide-react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, type DocumentData } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { createTeacherAccount, firebaseErrorMessage, setUserRole } from "@/lib/firebase/callables";
import { resetTeacherPassword } from "@/lib/firebase/password-callables";
import { deleteTeacherAccount } from "@/lib/firebase/teacher-admin-callables";
import { firebaseStorage, firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { todayDateOnly } from "@/lib/date-only";
import { formatCurrency, initials } from "@/lib/utils";
import { toast } from "sonner";

type TeacherRow = DocumentData & { id: string };
type CatalogRow = DocumentData & { id: string };

type TeachingAssignmentForm = {
  subjectId: string;
  gradeLevels: number[];
};

type FormState = {
  teacherCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentId: string;
  subjectIds: string[];
  schoolLevels: SchoolLevel[];
  teachingRole: TeachingRole;
  teachingAssignments: TeachingAssignmentForm[];
  specialization: string;
  degree: string;
  startDate: string;
  teacherType: "co_huu" | "thinh_giang";
  standardPeriodsPerWeek: string;
  ratePerPeriod: string;
  campusId: string;
  contractType: string;
  contractNumber: string;
  contractExpiresAt: string;
  avatarUrl: string;
  status: "active" | "inactive";
  password: string;
};

const initialForm: FormState = {
  teacherCode: "",
  fullName: "",
  email: "",
  phone: "",
  departmentId: "",
  subjectIds: [],
  schoolLevels: ["secondary"],
  teachingRole: "bo_mon",
  teachingAssignments: [],
  specialization: "",
  degree: "Đại học",
  startDate: todayDateOnly(),
  teacherType: "co_huu",
  standardPeriodsPerWeek: "20",
  ratePerPeriod: "",
  campusId: "",
  contractType: "",
  contractNumber: "",
  contractExpiresAt: "",
  avatarUrl: "",
  status: "active",
  password: "",
};

function teacherStatus(value: unknown) {
  return value === "inactive" ? { label: "Ngừng hoạt động", tone: "danger" as const } : { label: "Đang hoạt động", tone: "success" as const };
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function catalogName(rows: CatalogRow[], id: unknown) {
  const value = textValue(id);
  if (!value) return "";
  const row = rows.find((item) => item.id === value);
  return textValue(row?.name) || textValue(row?.code) || value;
}

function activeCatalogRows(rows: CatalogRow[]) {
  return rows
    .filter((row) => row.isActive !== false && row.status !== "inactive" && row.status !== "archived")
    .sort((first, second) => catalogName([first], first.id).localeCompare(catalogName([second], second.id), "vi"));
}

function schoolLevelForGrade(grade: number): SchoolLevel | "" {
  if (grade >= 1 && grade <= 5) return "primary";
  if (grade >= 6 && grade <= 9) return "secondary";
  return "";
}

function gradeOfSubject(subject: CatalogRow | undefined) {
  const grade = Number(subject?.grade ?? subject?.gradeLevel ?? 0);
  return Number.isInteger(grade) && grade >= 1 && grade <= 9 ? grade : 0;
}

function normalizeSchoolLevels(value: unknown): SchoolLevel[] {
  if (Array.isArray(value)) {
    const levels = value.filter((item): item is SchoolLevel => item === "primary" || item === "secondary");
    if (levels.length > 0) return [...new Set(levels)];
  }
  return ["secondary"];
}

function gradesForSchoolLevels(levels: SchoolLevel[]) {
  const grades: number[] = [];
  if (levels.includes("primary")) grades.push(1, 2, 3, 4, 5);
  if (levels.includes("secondary")) grades.push(6, 7, 8, 9);
  return grades;
}

function subjectMatchesSchoolLevels(subject: CatalogRow, levels: SchoolLevel[]) {
  const explicitLevel = textValue(subject.schoolLevel);
  if (explicitLevel === "both") return true;
  if (explicitLevel === "primary" || explicitLevel === "secondary") return levels.includes(explicitLevel);
  const grade = gradeOfSubject(subject);
  const inferred = schoolLevelForGrade(grade);
  return !inferred || levels.includes(inferred);
}

function eligibleGradesForSubject(subject: CatalogRow, levels: SchoolLevel[]) {
  const grade = gradeOfSubject(subject);
  if (grade) return levels.includes(schoolLevelForGrade(grade) as SchoolLevel) ? [grade] : [];
  return gradesForSchoolLevels(levels);
}

function departmentMatchesSchoolLevels(department: CatalogRow, levels: SchoolLevel[]) {
  const level = textValue(department.schoolLevel);
  if (!level) return true; // Bộ môn cũ chưa gắn cấp học: giữ tương thích dữ liệu hiện hữu.
  if (level === "both") return true;
  if (levels.length === 2) return false; // GV dạy cả hai cấp phải thuộc tổ dùng chung hai cấp.
  return levels.includes(level as SchoolLevel);
}

function schoolLevelLabel(value: unknown) {
  const levels = normalizeSchoolLevels(value);
  if (levels.length === 2) return "Tiểu học + THCS";
  return levels[0] === "primary" ? "Tiểu học" : "THCS";
}

function teachingRoleLabel(value: unknown) {
  if (value === "chu_nhiem") return "Chủ nhiệm";
  if (value === "ca_hai") return "Chủ nhiệm + bộ môn";
  return "Bộ môn";
}

function generateTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%";
  const all = `${upper}${lower}${digits}${symbols}`;
  const pick = (source: string) => source[crypto.getRandomValues(new Uint32Array(1))[0] % source.length];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 12) chars.push(pick(all));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
}

type CredentialResult = {
  teacherId: string;
  fullName: string;
  email: string;
  temporaryPassword: string;
};

function formFromTeacher(row: TeacherRow, subjects: CatalogRow[]): FormState {
  const contract = typeof row.contract === "object" && row.contract ? row.contract as Record<string, unknown> : {};
  const schoolLevels = normalizeSchoolLevels(row.schoolLevels);
  const subjectIds = Array.isArray(row.subjectIds) ? row.subjectIds.map(String) : textValue(row.subjectIds).split(",").map((value) => value.trim()).filter(Boolean);
  const storedAssignments = Array.isArray(row.teachingAssignments) ? row.teachingAssignments : [];
  const teachingAssignments: TeachingAssignmentForm[] = storedAssignments.length > 0
    ? storedAssignments.map((assignment) => {
        const item = assignment as Record<string, unknown>;
        return {
          subjectId: textValue(item.subjectId),
          gradeLevels: Array.isArray(item.gradeLevels) ? item.gradeLevels.map(Number).filter((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 9) : [],
        };
      }).filter((assignment) => assignment.subjectId && assignment.gradeLevels.length > 0)
    : subjectIds.map((subjectId) => {
        const subject = subjects.find((item) => item.id === subjectId);
        const eligible = subject ? eligibleGradesForSubject(subject, schoolLevels) : gradesForSchoolLevels(schoolLevels);
        return { subjectId, gradeLevels: eligible };
      });
  return {
    teacherCode: textValue(row.teacherCode),
    fullName: textValue(row.fullName),
    email: textValue(row.email),
    phone: textValue(row.phone),
    departmentId: textValue(row.departmentId),
    subjectIds,
    schoolLevels,
    teachingRole: row.teachingRole === "chu_nhiem" || row.teachingRole === "ca_hai" ? row.teachingRole : "bo_mon",
    teachingAssignments,
    specialization: textValue(row.specialization),
    degree: textValue(row.degree) || "Đại học",
    startDate: textValue(row.startDate) || todayDateOnly(),
    teacherType: row.teacherType === "thinh_giang" ? "thinh_giang" : "co_huu",
    standardPeriodsPerWeek: row.standardPeriodsPerWeek === null || row.standardPeriodsPerWeek === undefined ? "" : String(row.standardPeriodsPerWeek),
    ratePerPeriod: row.ratePerPeriod === null || row.ratePerPeriod === undefined ? "" : String(row.ratePerPeriod),
    campusId: textValue(row.campusId),
    contractType: textValue(contract.type),
    contractNumber: textValue(contract.number),
    contractExpiresAt: textValue(contract.expiresAt),
    avatarUrl: textValue(row.avatarUrl),
    status: row.status === "inactive" ? "inactive" : "active",
    password: "",
  };
}

export default function TeachersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherRow | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [roleForm, setRoleForm] = useState<{ email: string; role: Role; departmentId: string }>({
    email: "",
    role: "giaovien",
    departmentId: "",
  });
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [roleMessage, setRoleMessage] = useState("");
  const [roleError, setRoleError] = useState("");
  const [avatarTarget, setAvatarTarget] = useState<TeacherRow | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [departments, setDepartments] = useState<CatalogRow[]>([]);
  const [subjects, setSubjects] = useState<CatalogRow[]>([]);
  const [campuses, setCampuses] = useState<CatalogRow[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [temporaryPasswords, setTemporaryPasswords] = useState<Record<string, string>>({});
  const [resettingTeacherId, setResettingTeacherId] = useState("");
  const [deletingTeacherId, setDeletingTeacherId] = useState("");
  const [credentialResult, setCredentialResult] = useState<CredentialResult | null>(null);

  useEffect(() => {
    const teachersQuery = query(collection(firestore, "teachers"), orderBy("fullName"), limit(200));
    return onSnapshot(
      teachersQuery,
      (snapshot) => {
        setRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        setLoading(false);
      },
      () => {
        setError("Không thể tải danh sách giáo viên. Hãy kiểm tra Firestore Rules và dữ liệu.");
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    setCatalogError("");
    const watch = (collectionName: string, setter: (rows: CatalogRow[]) => void) => onSnapshot(
      query(collection(firestore, collectionName), limit(500)),
      (snapshot) => setter(activeCatalogRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })))),
      (snapshotError) => setCatalogError(firebaseDataErrorMessage(snapshotError)),
    );
    const unsubscribers = [watch("departments", setDepartments), watch("subjects", setSubjects), watch("campuses", setCampuses)];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      const matchesKeyword = !keyword || [row.fullName, row.email, row.phone, row.departmentId, row.specialization]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(keyword));
      const matchesType = typeFilter === "all" || row.teacherType === typeFilter;
      const levels = normalizeSchoolLevels(row.schoolLevels);
      const matchesLevel = levelFilter === "all" || levels.includes(levelFilter as SchoolLevel);
      return matchesKeyword && matchesType && matchesLevel;
    });
  }, [levelFilter, rows, search, typeFilter]);

  const availableDepartments = useMemo(
    () => departments.filter((department) => departmentMatchesSchoolLevels(department, form.schoolLevels)),
    [departments, form.schoolLevels],
  );

  const availableSubjects = useMemo(
    () => subjects.filter((subject) => (!form.departmentId || subject.departmentId === form.departmentId) && subjectMatchesSchoolLevels(subject, form.schoolLevels)),
    [form.departmentId, form.schoolLevels, subjects],
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSchoolLevel(level: SchoolLevel, checked: boolean) {
    setForm((current) => {
      const nextLevels = checked
        ? [...new Set([...current.schoolLevels, level])]
        : current.schoolLevels.filter((item) => item !== level);
      if (nextLevels.length === 0) return current;
      const nextAssignments = current.teachingAssignments
        .map((assignment) => {
          const subject = subjects.find((item) => item.id === assignment.subjectId);
          const allowed = subject ? eligibleGradesForSubject(subject, nextLevels) : gradesForSchoolLevels(nextLevels);
          return { ...assignment, gradeLevels: assignment.gradeLevels.filter((grade) => allowed.includes(grade)) };
        })
        .filter((assignment) => assignment.gradeLevels.length > 0);
      const nextSubjectIds = current.subjectIds.filter((subjectId) => nextAssignments.some((assignment) => assignment.subjectId === subjectId));
      const currentDepartment = departments.find((item) => item.id === current.departmentId);
      const departmentId = currentDepartment && departmentMatchesSchoolLevels(currentDepartment, nextLevels) ? current.departmentId : "";
      return { ...current, schoolLevels: nextLevels, departmentId, subjectIds: departmentId ? nextSubjectIds : [], teachingAssignments: departmentId ? nextAssignments : [] };
    });
  }

  function selectDepartment(departmentId: string) {
    setForm((current) => ({ ...current, departmentId, subjectIds: [], teachingAssignments: [] }));
  }

  function toggleSubject(subject: CatalogRow, checked: boolean) {
    setForm((current) => {
      if (!checked) {
        return {
          ...current,
          subjectIds: current.subjectIds.filter((id) => id !== subject.id),
          teachingAssignments: current.teachingAssignments.filter((assignment) => assignment.subjectId !== subject.id),
        };
      }
      const gradeLevels = eligibleGradesForSubject(subject, current.schoolLevels);
      if (gradeLevels.length === 0) return current;
      return {
        ...current,
        subjectIds: [...new Set([...current.subjectIds, subject.id])],
        teachingAssignments: [
          ...current.teachingAssignments.filter((assignment) => assignment.subjectId !== subject.id),
          { subjectId: subject.id, gradeLevels },
        ],
      };
    });
  }

  function toggleAssignmentGrade(subjectId: string, grade: number, checked: boolean) {
    setForm((current) => {
      const assignment = current.teachingAssignments.find((item) => item.subjectId === subjectId);
      if (!assignment) return current;
      const gradeLevels = checked
        ? [...new Set([...assignment.gradeLevels, grade])].sort((a, b) => a - b)
        : assignment.gradeLevels.filter((item) => item !== grade);
      if (gradeLevels.length === 0) {
        return {
          ...current,
          subjectIds: current.subjectIds.filter((id) => id !== subjectId),
          teachingAssignments: current.teachingAssignments.filter((item) => item.subjectId !== subjectId),
        };
      }
      return {
        ...current,
        teachingAssignments: current.teachingAssignments.map((item) => item.subjectId === subjectId ? { ...item, gradeLevels } : item),
      };
    });
  }

  function openCreate() {
    setEditingTeacher(null);
    setForm({ ...initialForm, password: generateTemporaryPassword() });
    setFormError("");
    setSuccessMessage("");
    setOpen(true);
  }

  function openEdit(row: TeacherRow) {
    setEditingTeacher(row);
    setForm(formFromTeacher(row, subjects));
    setFormError("");
    setSuccessMessage("");
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    setSuccessMessage("");
    try {
      if (!user) {
        throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      }
      if (form.schoolLevels.length === 0) {
        throw new Error("Vui lòng chọn ít nhất một cấp học phụ trách.");
      }
      if (form.subjectIds.length === 0) {
        throw new Error("Vui lòng chọn ít nhất một môn giảng dạy.");
      }
      if (form.teachingAssignments.length !== form.subjectIds.length || form.teachingAssignments.some((assignment) => assignment.gradeLevels.length === 0)) {
        throw new Error("Mỗi môn giảng dạy cần có ít nhất một khối phụ trách.");
      }
      const teacher: TeacherInput = {
        teacherCode: form.teacherCode.trim(),
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        departmentId: form.departmentId,
        subjectIds: form.subjectIds,
        schoolLevels: form.schoolLevels,
        teachingRole: form.teachingRole,
        teachingAssignments: form.teachingAssignments,
        specialization: form.specialization,
        degree: form.degree,
        startDate: form.startDate,
        teacherType: form.teacherType,
        standardPeriodsPerWeek: form.teacherType === "co_huu" ? Number(form.standardPeriodsPerWeek) : null,
        ratePerPeriod: form.teacherType === "thinh_giang" ? Number(form.ratePerPeriod) : null,
        campusId: form.campusId,
        status: form.status,
        avatarUrl: form.avatarUrl.trim(),
        contract: {
          type: form.contractType,
          number: form.contractNumber,
          expiresAt: form.contractExpiresAt,
        },
        userId: editingTeacher ? textValue(editingTeacher.userId) : "",
      };
      if (editingTeacher) {
        await setDoc(doc(firestore, "teachers", editingTeacher.id), {
          ...teacher,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          isActive: teacher.status === "active",
        }, { merge: true });
        setSuccessMessage("Đã cập nhật hồ sơ giáo viên.");
        toast.success("Đã cập nhật hồ sơ giáo viên.");
      } else {
        const result = await createTeacherAccount({ teacher, password: form.password || undefined });
        const temporaryPassword = form.password || "";
        if (temporaryPassword) {
          setTemporaryPasswords((current) => ({ ...current, [result.teacherId]: temporaryPassword }));
          setCredentialResult({
            teacherId: result.teacherId,
            fullName: teacher.fullName,
            email: teacher.email,
            temporaryPassword,
          });
        }
        setSuccessMessage("Đã tạo tài khoản và hồ sơ giáo viên thành công.");
        setForm(initialForm);
        setOpen(false);
      }
      if (editingTeacher) setTimeout(() => setOpen(false), 700);
    } catch (submitError) {
      setFormError(editingTeacher ? firebaseDataErrorMessage(submitError) : firebaseErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRoleAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoleSubmitting(true);
    setRoleMessage("");
    setRoleError("");
    try {
      await setUserRole({
        email: roleForm.email.trim(),
        role: roleForm.role,
        departmentId: roleForm.role === "totruong" ? roleForm.departmentId.trim() : roleForm.departmentId.trim() || undefined,
      });
      setRoleMessage("Đã cập nhật phân quyền. Người dùng cần đăng nhập lại để nhận Custom Claims mới.");
    } catch (submitError) {
      setRoleError(firebaseErrorMessage(submitError));
    } finally {
      setRoleSubmitting(false);
    }
  }

  async function copyTeacherId(teacherId: string) {
    try {
      await navigator.clipboard.writeText(teacherId);
      toast.success("Đã copy ID giáo viên.");
    } catch {
      toast.error("Không thể copy tự động. Bạn có thể bôi đen ID để copy thủ công.");
    }
  }

  async function copyTemporaryPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Đã copy mật khẩu tạm.");
    } catch {
      toast.error("Không thể copy tự động. Hãy copy thủ công.");
    }
  }

  async function deleteTeacher(row: TeacherRow) {
    const name = textValue(row.fullName) || textValue(row.email) || row.id;
    const confirmation = window.prompt(
      `Xóa vĩnh viễn giáo viên “${name}”?\nNếu giáo viên còn lớp chủ nhiệm, TKB, đánh giá, chấm công, lương... backend sẽ chặn.\nNhập XOA GIAO VIEN để xác nhận.`,
      "",
    );
    if (confirmation !== "XOA GIAO VIEN") return;

    setDeletingTeacherId(row.id);
    try {
      await deleteTeacherAccount(row.id);
      setTemporaryPasswords((current) => { const next = { ...current }; delete next[row.id]; return next; });
      toast.success("Đã xóa giáo viên và tài khoản đăng nhập liên quan.");
    } catch (deleteError) {
      toast.error(firebaseErrorMessage(deleteError));
    } finally {
      setDeletingTeacherId("");
    }
  }

  async function resetPasswordForTeacher(row: TeacherRow) {
    const teacherName = textValue(row.fullName) || textValue(row.email) || row.id;
    const confirmed = window.confirm(`Reset mật khẩu cho ${teacherName}? Giáo viên sẽ bị thu hồi phiên đăng nhập cũ và phải đổi mật khẩu tạm sau khi đăng nhập lại.`);
    if (!confirmed) return;

    setResettingTeacherId(row.id);
    try {
      const result = await resetTeacherPassword(row.id);
      setTemporaryPasswords((current) => ({ ...current, [row.id]: result.temporaryPassword }));
      setCredentialResult({
        teacherId: row.id,
        fullName: teacherName,
        email: textValue(row.email),
        temporaryPassword: result.temporaryPassword,
      });
      toast.success("Đã reset mật khẩu giáo viên.");
    } catch (resetError) {
      toast.error(firebaseErrorMessage(resetError));
    } finally {
      setResettingTeacherId("");
    }
  }

  async function uploadTeacherAvatar() {
    if (!user || !avatarTarget || !avatarFile) return;
    setAvatarSubmitting(true);
    setAvatarError("");
    try {
      const ownerId = textValue(avatarTarget.userId) || avatarTarget.id;
      const extension = avatarFile.name.split(".").pop() || "jpg";
      const storagePath = `avatars/${ownerId}/${avatarTarget.id}-${Date.now()}.${extension}`;
      const storageRef = ref(firebaseStorage, storagePath);
      await uploadBytes(storageRef, avatarFile, { contentType: avatarFile.type });
      const avatarUrl = await getDownloadURL(storageRef);
      await setDoc(doc(firestore, "teachers", avatarTarget.id), {
        avatarUrl,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      }, { merge: true });
      toast.success("Đã cập nhật hình giáo viên.");
      setAvatarTarget(null);
      setAvatarFile(null);
    } catch (uploadError) {
      setAvatarError(firebaseDataErrorMessage(uploadError));
    } finally {
      setAvatarSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Quản trị nhân sự"
          title="Quản lý giáo viên"
          description="Quản lý giáo viên Tiểu học và THCS trong cùng hệ thống, gồm cấp học, vai trò, môn và khối được phép giảng dạy."
          actions={
            <Button onClick={openCreate}>
              <CirclePlus className="h-4 w-4" />
              Thêm giáo viên
            </Button>
          }
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {catalogError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Không thể tải đầy đủ danh mục: {catalogError}</div> : null}

        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Card className="p-5"><p className="text-sm text-muted-foreground">Tổng giáo viên</p><p className="mt-2 text-3xl font-extrabold">{rows.length}</p></Card>
          <Card className="p-5"><p className="text-sm text-muted-foreground">Cơ hữu</p><p className="mt-2 text-3xl font-extrabold">{rows.filter((row) => row.teacherType === "co_huu").length}</p></Card>
          <Card className="p-5"><p className="text-sm text-muted-foreground">Thỉnh giảng</p><p className="mt-2 text-3xl font-extrabold">{rows.filter((row) => row.teacherType === "thinh_giang").length}</p></Card>
        </div>

        <Card className="mb-5 p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold">Phân quyền</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cập nhật Custom Claims cho admin, tổ trưởng hoặc giáo viên qua Cloud Function setUserRole.</p>
            </div>
          </div>
          <form className="grid gap-4 lg:grid-cols-[1.3fr_.8fr_1fr_auto] lg:items-end" onSubmit={submitRoleAssignment}>
            <div><Label>Email đăng nhập</Label><Input required type="email" value={roleForm.email} onChange={(event) => setRoleForm((current) => ({ ...current, email: event.target.value }))} placeholder="giaovien@truong.edu.vn" /></div>
            <div><Label>Vai trò</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={roleForm.role} onChange={(event) => setRoleForm((current) => ({ ...current, role: event.target.value as Role }))}><option value="admin">Quản trị viên</option><option value="totruong">Tổ trưởng</option><option value="giaovien">Giáo viên</option></select></div>
            <div><Label>Bộ môn phụ trách</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" required={roleForm.role === "totruong"} value={roleForm.departmentId} onChange={(event) => setRoleForm((current) => ({ ...current, departmentId: event.target.value }))}><option value="">{roleForm.role === "totruong" ? "Chọn bộ môn" : "Không bắt buộc"}</option>{departments.map((row) => <option key={row.id} value={row.id}>{catalogName(departments, row.id)}</option>)}</select></div>
            <Button loading={roleSubmitting} type="submit">Phân quyền</Button>
          </form>
          {roleError ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{roleError}</div> : null}
          {roleMessage ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{roleMessage}</div> : null}
        </Card>

        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="font-semibold">Mật khẩu:</span> Firebase Authentication không cho đọc lại mật khẩu hiện tại. Bảng bên dưới chỉ hiển thị <span className="font-semibold">mật khẩu tạm vừa tạo/reset trong phiên Admin này</span>. Sau khi giáo viên tự đổi mật khẩu, Admin không thể xem mật khẩu mới; khi cần, dùng nút <span className="font-semibold">Reset MK</span>.
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, email, bộ môn…" />
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
                <option value="all">Tất cả cấp học</option>
                <option value="primary">Tiểu học</option>
                <option value="secondary">THCS</option>
              </select>
              <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">Tất cả loại giáo viên</option>
                <option value="co_huu">Giáo viên cơ hữu</option>
                <option value="thinh_giang">Giáo viên thỉnh giảng</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
          ) : filteredRows.length === 0 ? (
            <EmptyState icon={<UsersRound className="h-6 w-6" />} title="Chưa có giáo viên" description="Thêm giáo viên đầu tiên hoặc thay đổi điều kiện tìm kiếm." action={<Button onClick={openCreate}>Thêm giáo viên</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1540px]">
                <thead><tr><th>ID giáo viên</th><th>Giáo viên</th><th>Bộ môn</th><th>Cấp học</th><th>Vai trò</th><th>Loại</th><th>Chuyên môn</th><th>Định mức / đơn giá</th><th>Mật khẩu tạm</th><th>Đổi MK</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const status = teacherStatus(row.status);
                    return (
                      <tr key={row.id}>
                        <td><div className="flex items-center gap-2"><code className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">{row.id}</code><Button size="sm" variant="ghost" onClick={() => copyTeacherId(row.id)} aria-label="Copy ID giáo viên"><Copy className="h-4 w-4" /></Button></div></td>
                        <td><div className="flex items-center gap-3">{row.avatarUrl ? <img alt={row.fullName || "Giáo viên"} className="h-10 w-10 rounded-full object-cover ring-1 ring-border" src={String(row.avatarUrl)} /> : <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">{initials(row.fullName)}</div>}<div><p className="font-semibold">{row.fullName || "Chưa cập nhật"}</p><p className="text-xs text-muted-foreground">{row.email || row.phone || row.id}</p></div></div></td>
                        <td>{catalogName(departments, row.departmentId) || "—"}</td>
                        <td><Badge tone={normalizeSchoolLevels(row.schoolLevels).includes("primary") ? "success" : "info"}>{schoolLevelLabel(row.schoolLevels)}</Badge></td>
                        <td>{teachingRoleLabel(row.teachingRole)}</td>
                        <td><Badge tone={row.teacherType === "co_huu" ? "info" : "warning"}>{row.teacherType === "co_huu" ? "Cơ hữu" : "Thỉnh giảng"}</Badge></td>
                        <td><p className="max-w-52 truncate">{row.specialization || "—"}</p><p className="text-xs text-muted-foreground">{row.degree || ""}</p></td>
                        <td>{row.teacherType === "co_huu" ? `${row.standardPeriodsPerWeek ?? 0} tiết/tuần` : formatCurrency(Number(row.ratePerPeriod || 0)) + "/tiết"}</td>
                        <td>
                          {temporaryPasswords[row.id] ? <div className="flex items-center gap-1"><code className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">{temporaryPasswords[row.id]}</code><Button size="sm" variant="ghost" onClick={() => copyTemporaryPassword(temporaryPasswords[row.id])} aria-label="Copy mật khẩu tạm"><Copy className="h-4 w-4" /></Button></div> : <span className="text-xs text-muted-foreground">Không thể đọc MK hiện tại</span>}
                        </td>
                        <td><Badge tone={row.mustChangePassword === true ? "warning" : "success"}>{row.mustChangePassword === true ? "Phải đổi MK" : "Đã đổi / bình thường"}</Badge></td>
                        <td><Badge tone={status.tone}>{status.label}</Badge></td>
                        <td><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => openEdit(row)}><PencilLine className="h-4 w-4" />Sửa</Button><Button size="sm" variant="danger" loading={deletingTeacherId === row.id} onClick={() => void deleteTeacher(row)}><Trash2 className="h-4 w-4" />Xóa</Button><Button size="sm" variant="secondary" loading={resettingTeacherId === row.id} onClick={() => resetPasswordForTeacher(row)}><RotateCcw className="h-4 w-4" />Reset MK</Button><Button size="sm" variant="secondary" onClick={() => { setAvatarTarget(row); setAvatarFile(null); setAvatarError(""); }}><ImagePlus className="h-4 w-4" />Ảnh</Button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal
          open={open}
          onOpenChange={setOpen}
          title={editingTeacher ? "Sửa thông tin giáo viên" : "Thêm giáo viên"}
          description={editingTeacher ? "Cập nhật hồ sơ giáo viên trong Cloud Firestore. Nếu thay đổi phân quyền, dùng mục Phân quyền ở phía trên." : "Cloud Function sẽ tạo Firebase Auth user, Custom Claims và hồ sơ Firestore trong một quy trình an toàn."}
          wide
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Hủy</Button><Button loading={submitting} form="teacher-form" type="submit">{editingTeacher ? "Lưu thay đổi" : "Tạo giáo viên"}</Button></div>}
        >
          <form id="teacher-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <div><Label>Mã giáo viên</Label><Input value={form.teacherCode} onChange={(e) => setField("teacherCode", e.target.value.toUpperCase())} placeholder="Để trống để hệ thống tự tạo" /></div>
            <div><Label>Họ và tên</Label><Input required value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} /></div>
            <div><Label>Email</Label><Input required type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} /></div>
            <div><Label>Số điện thoại</Label><Input required value={form.phone} onChange={(e) => setField("phone", e.target.value)} /></div>
            <div className="sm:col-span-2">
              <Label>Cấp học phụ trách</Label>
              <div className="mt-1 flex flex-wrap gap-3 rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.schoolLevels.includes("primary")} onChange={(event) => toggleSchoolLevel("primary", event.target.checked)} />Tiểu học (khối 1–5)</label>
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.schoolLevels.includes("secondary")} onChange={(event) => toggleSchoolLevel("secondary", event.target.checked)} />THCS (khối 6–9)</label>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Một giáo viên có thể phụ trách một hoặc cả hai cấp học.</p>
            </div>
            <div><Label>Vai trò giảng dạy</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={form.teachingRole} onChange={(e) => setField("teachingRole", e.target.value as TeachingRole)}><option value="chu_nhiem">Giáo viên chủ nhiệm</option><option value="bo_mon">Giáo viên bộ môn</option><option value="ca_hai">Chủ nhiệm + bộ môn</option></select></div>
            <div><Label>Bộ môn / tổ chuyên môn</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" required value={form.departmentId} onChange={(e) => selectDepartment(e.target.value)}><option value="">Chọn bộ môn</option>{availableDepartments.map((row) => <option key={row.id} value={row.id}>{catalogName(departments, row.id)}</option>)}</select></div>
            <div><Label>Cơ sở chính</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" required value={form.campusId} onChange={(e) => setField("campusId", e.target.value)}><option value="">Chọn cơ sở</option>{campuses.map((row) => <option key={row.id} value={row.id}>{catalogName(campuses, row.id)}</option>)}</select></div>
            <div className="sm:col-span-2">
              <Label>Môn và khối được phân công</Label>
              <div className="mt-1 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                {availableSubjects.map((subject) => {
                  const checked = form.subjectIds.includes(subject.id);
                  const eligibleGrades = eligibleGradesForSubject(subject, form.schoolLevels);
                  const assignedGrades = form.teachingAssignments.find((assignment) => assignment.subjectId === subject.id)?.gradeLevels ?? [];
                  return <div className="rounded-lg border border-border/70 px-3 py-2" key={subject.id}>
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={checked} onChange={(event) => toggleSubject(subject, event.target.checked)} /><span>{catalogName(subjects, subject.id)}</span></label>
                    {checked ? <div className="mt-2 flex flex-wrap gap-2 pl-6">{eligibleGrades.map((grade) => <label key={grade} className="flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs"><input type="checkbox" checked={assignedGrades.includes(grade)} onChange={(event) => toggleAssignmentGrade(subject.id, grade, event.target.checked)} />Khối {grade}</label>)}</div> : null}
                  </div>;
                })}
                {availableSubjects.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có môn phù hợp với cấp học và bộ môn đã chọn.</p> : null}
              </div>
              {form.subjectIds.length === 0 ? <p className="mt-1 text-xs text-amber-700">Chọn ít nhất một môn và khối giảng dạy.</p> : null}
            </div>
            <div><Label>Chuyên môn</Label><Input required value={form.specialization} onChange={(e) => setField("specialization", e.target.value)} /></div>
            <div><Label>Trình độ</Label><Input required value={form.degree} onChange={(e) => setField("degree", e.target.value)} /></div>
            <div><Label>Ngày vào làm</Label><Input required type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} /></div>
            <div><Label>Loại giáo viên</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={form.teacherType} onChange={(e) => setField("teacherType", e.target.value as FormState["teacherType"])}><option value="co_huu">Cơ hữu</option><option value="thinh_giang">Thỉnh giảng</option></select></div>
            {form.teacherType === "co_huu" ? <div><Label>Số tiết chuẩn/tuần</Label><Input required min="1" type="number" value={form.standardPeriodsPerWeek} onChange={(e) => setField("standardPeriodsPerWeek", e.target.value)} /></div> : <div><Label>Đơn giá/tiết</Label><Input required min="1" type="number" value={form.ratePerPeriod} onChange={(e) => setField("ratePerPeriod", e.target.value)} /></div>}
            <div><Label>Trạng thái</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={form.status} onChange={(e) => setField("status", e.target.value as FormState["status"])}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></div>
            <div><Label>URL hình giáo viên</Label><Input type="url" value={form.avatarUrl} onChange={(e) => setField("avatarUrl", e.target.value)} placeholder="https://..." /></div>
            {!editingTeacher ? <div><Label>Mật khẩu tạm ban đầu</Label><div className="flex gap-2"><Input minLength={8} type="text" value={form.password} onChange={(e) => setField("password", e.target.value)} /><Button type="button" variant="secondary" onClick={() => setField("password", generateTemporaryPassword())} aria-label="Tạo mật khẩu tạm mới"><KeyRound className="h-4 w-4" /></Button></div><p className="mt-1 text-xs text-muted-foreground">Giáo viên sẽ phải đổi mật khẩu này sau khi đăng nhập.</p></div> : null}
            <div><Label>Loại hợp đồng</Label><Input value={form.contractType} onChange={(e) => setField("contractType", e.target.value)} /></div>
            <div><Label>Số hợp đồng</Label><Input value={form.contractNumber} onChange={(e) => setField("contractNumber", e.target.value)} /></div>
            <div><Label>Ngày hết hạn</Label><Input type="date" value={form.contractExpiresAt} onChange={(e) => setField("contractExpiresAt", e.target.value)} /></div>
            {formError ? <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div> : null}
            {successMessage ? <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}
          </form>
        </Modal>

        <Modal
          open={Boolean(credentialResult)}
          onOpenChange={(next) => { if (!next) setCredentialResult(null); }}
          title="Mật khẩu tạm của giáo viên"
          description="Chỉ gửi mật khẩu này trực tiếp cho giáo viên. Sau khi giáo viên tự đổi mật khẩu, Firebase không cho Admin đọc lại mật khẩu mới."
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCredentialResult(null)}>Đóng</Button>{credentialResult ? <Button onClick={() => copyTemporaryPassword(credentialResult.temporaryPassword)}><Copy className="h-4 w-4" />Copy mật khẩu</Button> : null}</div>}
        >
          {credentialResult ? <div className="space-y-4">
            <div className="rounded-xl border border-border p-4">
              <p className="font-semibold">{credentialResult.fullName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{credentialResult.email || credentialResult.teacherId}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Mật khẩu tạm</p>
              <div className="mt-2 flex items-center gap-2"><code className="text-xl font-extrabold tracking-wide text-amber-950">{credentialResult.temporaryPassword}</code><Button size="sm" variant="secondary" onClick={() => copyTemporaryPassword(credentialResult.temporaryPassword)}><Copy className="h-4 w-4" /></Button></div>
              <p className="mt-2 text-xs text-amber-800">Tài khoản đang ở trạng thái phải đổi mật khẩu.</p>
            </div>
          </div> : null}
        </Modal>

        <Modal
          open={Boolean(avatarTarget)}
          onOpenChange={(next) => { if (!next) { setAvatarTarget(null); setAvatarFile(null); setAvatarError(""); } }}
          title="Thêm hình giáo viên"
          description="Chọn file JPEG, PNG hoặc WebP. Ảnh sẽ được lưu vào Firebase Storage và gắn vào hồ sơ giáo viên."
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAvatarTarget(null)}>Hủy</Button><Button loading={avatarSubmitting} disabled={!avatarFile} onClick={uploadTeacherAvatar}><Upload className="h-4 w-4" />Tải ảnh lên</Button></div>}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              {avatarTarget?.avatarUrl ? <img alt={avatarTarget.fullName || "Giáo viên"} className="h-14 w-14 rounded-full object-cover" src={String(avatarTarget.avatarUrl)} /> : <div className="grid h-14 w-14 rounded-full bg-blue-50 text-sm font-bold text-blue-700 place-items-center">{initials(avatarTarget?.fullName)}</div>}
              <div>
                <p className="font-semibold">{avatarTarget?.fullName || "Giáo viên"}</p>
                <p className="text-xs text-muted-foreground">ID: {avatarTarget?.id || "—"}</p>
              </div>
            </div>
            <div>
              <Label>File hình</Label>
              <Input accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
            </div>
            {avatarError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{avatarError}</div> : null}
          </div>
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
