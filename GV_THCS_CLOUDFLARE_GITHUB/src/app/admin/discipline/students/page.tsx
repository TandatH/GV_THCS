"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  UserCheck,
  UserX,
  Users,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
import { cn } from "@/lib/utils";

type StudentRow = DocumentData & {
  id: string;
  studentCode: string;
  fullName: string;
  gender: "nam" | "nu" | "khac";
  dob?: string;
  classId: string;
  className: string;
  schoolYearId: string;
  parentPhone?: string;
  address?: string;
  isActive: boolean;
};

type OptionRow = DocumentData & { id: string; name?: string; code?: string; isActive?: boolean };

type ImportPreviewRow = {
  index: number;
  studentCode: string;
  fullName: string;
  gender: "nam" | "nu" | "khac";
  dob?: string;
  parentPhone?: string;
  isExisting: boolean;
  isValid: boolean;
  errorMessage?: string;
};

export default function StudentsManagementPage() {
  const { user } = useAuth();

  // Danh mục năm học và lớp học
  const [schoolYears, setSchoolYears] = useState<OptionRow[]>([]);
  const [classes, setClasses] = useState<OptionRow[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // Dữ liệu học sinh
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Modal thêm/sửa học sinh thủ công
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [formData, setFormData] = useState({
    studentCode: "",
    fullName: "",
    gender: "nam" as "nam" | "nu" | "khac",
    dob: "",
    parentPhone: "",
    address: "",
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modal Import Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Tải danh sách Năm học
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

  // 2. Tải danh sách Lớp học theo Năm học đã chọn
  useEffect(() => {
    if (!selectedSchoolYearId) return;
    const q = query(
      collection(firestore, "classes"),
      where("schoolYearId", "==", selectedSchoolYearId),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as OptionRow[];
      setClasses(rows);
      if (rows.length > 0) {
        if (!selectedClassId || !rows.some((c) => c.id === selectedClassId)) {
          setSelectedClassId(rows[0].id);
        }
      } else {
        setSelectedClassId("");
      }
    });
    return () => unsub();
  }, [selectedSchoolYearId, selectedClassId]);

  // 3. Tải danh sách Học sinh theo Lớp đã chọn
  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(firestore, "students"),
      where("classId", "==", selectedClassId),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as StudentRow[];
        setStudents(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Lỗi tải học sinh:", err);
        toast.error("Không thể tải danh sách học sinh: " + err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [selectedClassId]);

  // Lọc học sinh theo từ khóa tìm kiếm
  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (s) =>
        s.fullName?.toLowerCase().includes(term) ||
        s.studentCode?.toLowerCase().includes(term) ||
        s.parentPhone?.includes(term),
    );
  }, [students, searchTerm]);

  const selectedClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  // Mở modal Thêm mới học sinh
  function handleOpenCreate() {
    setEditingStudent(null);
    setFormData({
      studentCode: "",
      fullName: "",
      gender: "nam",
      dob: "",
      parentPhone: "",
      address: "",
      isActive: true,
    });
    setIsFormModalOpen(true);
  }

  // Mở modal Sửa học sinh
  function handleOpenEdit(student: StudentRow) {
    setEditingStudent(student);
    setFormData({
      studentCode: student.studentCode || "",
      fullName: student.fullName || "",
      gender: student.gender || "nam",
      dob: student.dob || "",
      parentPhone: student.parentPhone || "",
      address: student.address || "",
      isActive: student.isActive !== false,
    });
    setIsFormModalOpen(true);
  }

  // Lưu học sinh (Thêm/Sửa)
  async function handleSaveStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId || !selectedClass) {
      toast.error("Vui lòng chọn lớp học trước.");
      return;
    }

    const code = formData.studentCode.trim();
    const name = formData.fullName.trim();

    if (!code) {
      toast.error("Mã học sinh không được để trống.");
      return;
    }
    if (!name) {
      toast.error("Họ và tên học sinh không được để trống.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Kiểm tra trùng mã học sinh trong trường
      const checkQuery = query(
        collection(firestore, "students"),
        where("studentCode", "==", code),
        where("schoolYearId", "==", selectedSchoolYearId),
      );
      const checkSnap = await getDocs(checkQuery);
      const duplicate = checkSnap.docs.find((d) => d.id !== editingStudent?.id);
      if (duplicate) {
        toast.error(`Mã học sinh "${code}" đã tồn tại trong năm học này.`);
        setIsSubmitting(false);
        return;
      }

      if (editingStudent) {
        // Cập nhật
        const docRef = doc(firestore, "students", editingStudent.id);
        await setDoc(
          docRef,
          {
            studentCode: code,
            fullName: name,
            gender: formData.gender,
            dob: formData.dob || "",
            parentPhone: formData.parentPhone.trim(),
            address: formData.address.trim(),
            isActive: formData.isActive,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || "admin",
          },
          { merge: true },
        );
        toast.success(`Đã cập nhật học sinh ${name}.`);
      } else {
        // Thêm mới
        const newDocId = `${selectedClassId}_${code}`;
        const docRef = doc(firestore, "students", newDocId);
        await setDoc(docRef, {
          studentCode: code,
          fullName: name,
          gender: formData.gender,
          dob: formData.dob || "",
          classId: selectedClassId,
          className: selectedClass.name || selectedClass.code || "",
          schoolYearId: selectedSchoolYearId,
          parentPhone: formData.parentPhone.trim(),
          address: formData.address.trim(),
          isActive: formData.isActive,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || "admin",
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "admin",
        });
        toast.success(`Đã thêm học sinh ${name} vào lớp ${selectedClass.name}.`);
      }

      setIsFormModalOpen(false);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Lỗi lưu học sinh:", err);
      toast.error("Lỗi khi lưu học sinh: " + errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Đổi trạng thái kích hoạt nhanh
  async function handleToggleActive(student: StudentRow) {
    try {
      const docRef = doc(firestore, "students", student.id);
      const nextActive = !student.isActive;
      await setDoc(
        docRef,
        {
          isActive: nextActive,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "admin",
        },
        { merge: true },
      );
      toast.success(
        `Đã ${nextActive ? "kích hoạt" : "vô hiệu hóa"} học sinh ${student.fullName}.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lỗi đổi trạng thái: " + msg);
    }
  }

  // Tải file mẫu Excel
  function handleDownloadSampleExcel() {
    const sampleData = [
      {
        "Mã học sinh": "HS0601",
        "Họ và tên": "Nguyễn Văn An",
        "Giới tính": "Nam",
        "Ngày sinh (YYYY-MM-DD)": "2012-05-15",
        "Số điện thoại phụ huynh": "0987654321",
      },
      {
        "Mã học sinh": "HS0602",
        "Họ và tên": "Trần Thị Bình",
        "Giới tính": "Nữ",
        "Ngày sinh (YYYY-MM-DD)": "2012-08-20",
        "Số điện thoại phụ huynh": "0912345678",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_Sach_Hoc_Sinh");
    XLSX.writeFile(wb, `Mau_Danh_Sach_Hoc_Sinh_${selectedClass?.name || "Lop"}.xlsx`);
  }

  // Đọc file Excel tải lên
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        if (rawJson.length === 0) {
          toast.error("File Excel không có dữ liệu.");
          return;
        }

        // Tạo map các mã học sinh đã có trong lớp để đối chiếu
        const existingCodeMap = new Set(students.map((s) => s.studentCode.trim().toLowerCase()));

        const rows: ImportPreviewRow[] = rawJson.map((row, idx) => {
          const rawCode = String(row["Mã học sinh"] || row["Mã HS"] || row["MaHS"] || row["Code"] || "").trim();
          const rawName = String(row["Họ và tên"] || row["Họ tên"] || row["HoTen"] || row["Name"] || "").trim();
          const rawGender = String(row["Giới tính"] || row["GioiTinh"] || "nam").trim().toLowerCase();
          const rawDob = String(row["Ngày sinh (YYYY-MM-DD)"] || row["Ngày sinh"] || row["NgaySinh"] || "").trim();
          const rawPhone = String(row["Số điện thoại phụ huynh"] || row["SĐT"] || row["Phone"] || "").trim();

          let gender: "nam" | "nu" | "khac" = "nam";
          if (rawGender.includes("nữ") || rawGender === "nu" || rawGender === "female") gender = "nu";
          else if (rawGender === "khác" || rawGender === "khac") gender = "khac";

          const isValid = Boolean(rawCode && rawName);
          const isExisting = existingCodeMap.has(rawCode.toLowerCase());

          return {
            index: idx + 1,
            studentCode: rawCode,
            fullName: rawName,
            gender,
            dob: rawDob,
            parentPhone: rawPhone,
            isExisting,
            isValid,
            errorMessage: !isValid ? "Thiếu Mã hoặc Họ tên học sinh" : undefined,
          };
        });

        setPreviewRows(rows);
        setIsImportModalOpen(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error("Không thể đọc file Excel: " + msg);
      }
    };

    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Thực hiện lưu danh sách học sinh từ Preview vào Firestore
  async function handleConfirmImport() {
    if (!selectedClassId || !selectedClass) {
      toast.error("Vui lòng chọn lớp học.");
      return;
    }

    const validRows = previewRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      toast.error("Không có dòng dữ liệu hợp lệ nào để nhập.");
      return;
    }

    setIsImporting(true);
    try {
      const batch = writeBatch(firestore);

      for (const row of validRows) {
        const docId = `${selectedClassId}_${row.studentCode}`;
        const docRef = doc(firestore, "students", docId);

        batch.set(
          docRef,
          {
            studentCode: row.studentCode,
            fullName: row.fullName,
            gender: row.gender,
            dob: row.dob || "",
            classId: selectedClassId,
            className: selectedClass.name || selectedClass.code || "",
            schoolYearId: selectedSchoolYearId,
            parentPhone: row.parentPhone || "",
            isActive: true,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || "admin",
            createdAt: serverTimestamp(),
            createdBy: user?.uid || "admin",
          },
          { merge: true },
        );
      }

      await batch.commit();
      toast.success(`Đã nhập thành công ${validRows.length} học sinh vào lớp ${selectedClass.name}.`);
      setIsImportModalOpen(false);
      setPreviewRows([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Lỗi batch import học sinh:", err);
      toast.error("Lỗi khi nhập học sinh: " + msg);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <div className="space-y-6">
          <PageHeader
            title="Quản lý học sinh"
            description="Quản lý danh sách học sinh theo khối lớp, hỗ trợ thêm thủ công và import danh sách từ Excel."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadSampleExcel}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Mẫu Excel
                </Button>

                <label>
                  <Button
                    variant="secondary"
                    size="sm"
                    asChild
                    className="gap-2 cursor-pointer"
                  >
                    <span>
                      <Upload className="h-4 w-4" />
                      Nhập Excel
                    </span>
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>

                <Button
                  size="sm"
                  onClick={handleOpenCreate}
                  className="gap-2"
                  disabled={!selectedClassId}
                >
                  <Plus className="h-4 w-4" />
                  Thêm học sinh
                </Button>
              </div>
            }
          />

          {/* THANH BỘ LỌC NĂM HỌC VÀ LỚP */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="schoolYearSelect" className="text-xs font-semibold uppercase text-muted-foreground">
                  Năm học
                </Label>
                <select
                  id="schoolYearSelect"
                  value={selectedSchoolYearId}
                  onChange={(e) => setSelectedSchoolYearId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {schoolYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name || y.code} {y.isActive ? "(Đang hoạt động)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="classSelect" className="text-xs font-semibold uppercase text-muted-foreground">
                  Lớp học
                </Label>
                <select
                  id="classSelect"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  disabled={classes.length === 0}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {classes.length === 0 ? (
                    <option value="">Chưa có lớp học</option>
                  ) : (
                    classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.code}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <Label htmlFor="searchStudent" className="text-xs font-semibold uppercase text-muted-foreground">
                  Tìm kiếm
                </Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="searchStudent"
                    placeholder="Mã hoặc họ tên học sinh..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* DANH SÁCH HỌC SINH */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-base">
                  Danh sách học sinh {selectedClass ? `— ${selectedClass.name}` : ""}
                </h3>
                <Badge tone="neutral">
                  {filteredStudents.length} học sinh
                </Badge>
              </div>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <EmptyState
                icon={<GraduationCap className="h-6 w-6" />}
                title="Chưa có học sinh nào"
                description={
                  searchTerm
                    ? "Không tìm thấy học sinh phù hợp với từ khóa tìm kiếm."
                    : "Lớp học này hiện chưa có học sinh. Hãy thêm học sinh thủ công hoặc nhập từ Excel."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase font-medium">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">STT</th>
                      <th className="py-3 px-4">Mã học sinh</th>
                      <th className="py-3 px-4">Họ và tên</th>
                      <th className="py-3 px-4">Giới tính</th>
                      <th className="py-3 px-4">Ngày sinh</th>
                      <th className="py-3 px-4">SĐT Phụ huynh</th>
                      <th className="py-3 px-4 text-center">Trạng thái</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStudents.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-4 text-center text-muted-foreground">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-medium">{s.studentCode}</td>
                        <td className="py-3 px-4 font-semibold text-foreground">{s.fullName}</td>
                        <td className="py-3 px-4">
                          <Badge tone="neutral">
                            {s.gender === "nu" ? "Nữ" : s.gender === "khac" ? "Khác" : "Nam"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{s.dob || "—"}</td>
                        <td className="py-3 px-4 text-muted-foreground">{s.parentPhone || "—"}</td>
                        <td className="py-3 px-4 text-center">
                          {s.isActive !== false ? (
                            <Badge tone="success">
                              Đang học
                            </Badge>
                          ) : (
                            <Badge tone="neutral">
                              Tạm dừng
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(s)}
                              title="Sửa thông tin"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(s)}
                              title={s.isActive !== false ? "Tạm dừng học" : "Kích hoạt lại"}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* MODAL THÊM / SỬA HỌC SINH */}
          <Modal
            open={isFormModalOpen}
            onOpenChange={setIsFormModalOpen}
            title={editingStudent ? "Sửa thông tin học sinh" : "Thêm học sinh mới"}
          >
            <form onSubmit={handleSaveStudent} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="studentCode">Mã học sinh *</Label>
                  <Input
                    id="studentCode"
                    value={formData.studentCode}
                    onChange={(e) => setFormData({ ...formData, studentCode: e.target.value })}
                    placeholder="VD: HS0601"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="fullName">Họ và tên *</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="VD: Nguyễn Văn An"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="gender">Giới tính</Label>
                  <select
                    id="gender"
                    value={formData.gender}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gender: e.target.value as "nam" | "nu" | "khac",
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="nam">Nam</option>
                    <option value="nu">Nữ</option>
                    <option value="khac">Khác</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="dob">Ngày sinh</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="parentPhone">SĐT phụ huynh</Label>
                  <Input
                    id="parentPhone"
                    value={formData.parentPhone}
                    onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                    placeholder="VD: 0987654321"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Địa chỉ</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="VD: Phường 1, TP..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  Đang học (hoạt động)
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Đang lưu..." : editingStudent ? "Cập nhật" : "Lưu học sinh"}
                </Button>
              </div>
            </form>
          </Modal>

          {/* MODAL XÁC NHẬN PREVIEW IMPORT EXCEL */}
          <Modal
            open={isImportModalOpen}
            onOpenChange={setIsImportModalOpen}
            title={`Xem trước dữ liệu Excel: ${importFileName}`}
          >
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-muted/40 rounded-lg flex items-center justify-between text-sm">
                <div>
                  Lớp tiếp nhận: <strong className="text-primary">{selectedClass?.name}</strong>
                </div>
                <div className="flex gap-2">
                  <Badge tone="neutral">Tổng: {previewRows.length} dòng</Badge>
                  <Badge tone="success">
                    Hợp lệ: {previewRows.filter((r) => r.isValid && !r.isExisting).length} mới
                  </Badge>
                  {previewRows.some((r) => r.isExisting) && (
                    <Badge tone="warning">
                      Đã có: {previewRows.filter((r) => r.isExisting).length}
                    </Badge>
                  )}
                  {previewRows.some((r) => !r.isValid) && (
                    <Badge tone="danger">
                      Lỗi: {previewRows.filter((r) => !r.isValid).length}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border rounded-md">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted sticky top-0 font-medium text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 px-3 text-center">STT</th>
                      <th className="py-2 px-3">Mã HS</th>
                      <th className="py-2 px-3">Họ và tên</th>
                      <th className="py-2 px-3">Giới tính</th>
                      <th className="py-2 px-3">Ngày sinh</th>
                      <th className="py-2 px-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewRows.map((r) => (
                      <tr key={r.index} className={cn(!r.isValid && "bg-destructive/10")}>
                        <td className="py-2 px-3 text-center text-muted-foreground">{r.index}</td>
                        <td className="py-2 px-3 font-mono font-medium">{r.studentCode || "—"}</td>
                        <td className="py-2 px-3 font-semibold">{r.fullName || "—"}</td>
                        <td className="py-2 px-3 uppercase">{r.gender}</td>
                        <td className="py-2 px-3 text-muted-foreground">{r.dob || "—"}</td>
                        <td className="py-2 px-3">
                          {!r.isValid ? (
                            <span className="text-destructive font-medium flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> {r.errorMessage}
                            </span>
                          ) : r.isExisting ? (
                            <span className="text-amber-600 font-medium flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Đã có (sẽ cập nhật)
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Sẵn sàng thêm
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded">
                💡 <strong>Lưu ý:</strong> Hệ thống kiểm tra trùng mã học sinh. Các học sinh đã có mã trong lớp sẽ được cập nhật thông tin mới nhất mà không làm mất liên kết lịch sử.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="secondary"
                  onClick={() => setIsImportModalOpen(false)}
                  disabled={isImporting}
                >
                  Hủy bỏ
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={isImporting || previewRows.filter((r) => r.isValid).length === 0}
                  className="gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {isImporting ? "Đang nhập..." : `Xác nhận nhập (${previewRows.filter((r) => r.isValid).length} học sinh)`}
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </Shell>
    </RoleGuard>
  );
}
