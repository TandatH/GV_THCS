import * as XLSX from "xlsx";
import { toast } from "sonner";
import type { SchoolLevel } from "@school/shared";
import type { DocumentData } from "firebase/firestore";

type TeacherRow = DocumentData & { id: string };
type CatalogRow = DocumentData & { id: string };

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeSchoolLevels(value: unknown): SchoolLevel[] {
  if (Array.isArray(value)) {
    const levels = value.filter((item): item is SchoolLevel => item === "primary" || item === "secondary");
    if (levels.length > 0) return [...new Set(levels)];
  }
  return ["secondary"];
}

export function teachingRoleLabel(value: unknown): string {
  if (value === "chu_nhiem") return "Giáo viên chủ nhiệm";
  if (value === "ca_hai") return "Chủ nhiệm + bộ môn";
  return "Giáo viên bộ môn";
}

export function formatDob(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (m) {
    const day = m[3].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    const year = m[1];
    return `${day}/${month}/${year}`;
  }
  return trimmed;
}

export function getTeacherSubjectNames(teacher: TeacherRow, subjectsList: CatalogRow[]): string {
  const subjectIds: string[] = [];
  if (Array.isArray(teacher.teachingAssignments) && teacher.teachingAssignments.length > 0) {
    for (const a of teacher.teachingAssignments) {
      if (a.subjectId && !subjectIds.includes(a.subjectId)) {
        subjectIds.push(a.subjectId);
      }
    }
  }
  if (Array.isArray(teacher.subjectIds)) {
    for (const id of teacher.subjectIds) {
      if (id && !subjectIds.includes(id)) {
        subjectIds.push(id);
      }
    }
  } else if (typeof teacher.subjectIds === "string" && teacher.subjectIds) {
    for (const id of teacher.subjectIds.split(",")) {
      const trimmed = id.trim();
      if (trimmed && !subjectIds.includes(trimmed)) {
        subjectIds.push(trimmed);
      }
    }
  }

  const names = subjectIds
    .map((id) => {
      const s = subjectsList.find((item) => item.id === id);
      return s?.name || s?.code || id;
    })
    .filter(Boolean);

  return names.length > 0 ? names.join(", ") : "—";
}

export function getTeacherHomeroomClassNames(teacherId: string, classesList: CatalogRow[]): string {
  const homerooms = classesList
    .filter((c) => c.homeroomTeacherId === teacherId)
    .map((c) => c.name || c.code || c.id);

  return homerooms.length > 0 ? homerooms.join(", ") : "";
}

export function getTeacherPositionTitle(
  teacher: TeacherRow,
  homeroomClasses: string,
  subjectNames: string,
): string {
  if (teacher.positionTitle && typeof teacher.positionTitle === "string" && teacher.positionTitle.trim()) {
    return teacher.positionTitle.trim();
  }
  const isHomeroom = Boolean(homeroomClasses);
  const hasSubjects = Boolean(subjectNames && subjectNames !== "—");

  if (isHomeroom && hasSubjects) {
    return `GVCN Lớp ${homeroomClasses} - GVBM ${subjectNames}`;
  }
  if (isHomeroom) {
    return `GVCN Lớp ${homeroomClasses}`;
  }
  if (hasSubjects) {
    return `GVBM ${subjectNames}`;
  }
  if (teacher.teachingRole === "chu_nhiem") return "Giáo viên chủ nhiệm";
  if (teacher.teachingRole === "ca_hai") return "Chủ nhiệm + bộ môn";
  return "Giáo viên bộ môn";
}

/**
 * Xuất file Excel chuẩn mẫu theo đúng biểu mẫu "THÔNG TIN GIÁO VIÊN PHỔ CẬP TAM HÀ"
 * Gồm các cột: STT | HỌ TÊN GV | Chức vụ | Ngày sinh | Địa chỉ gia đình | SĐT | Địa chỉ Email | Bằng cấp | Tôn giáo | Số tài khoản
 */
export function exportTeachersToExcel(
  teachersList: TeacherRow[],
  classesList: CatalogRow[],
  subjectsList: CatalogRow[],
  departmentsList: CatalogRow[],
  schoolYearName = "2025 - 2026",
) {
  const standardColWidths = [
    { wch: 6 },  // STT
    { wch: 26 }, // HỌ TÊN GV
    { wch: 28 }, // Chức vụ
    { wch: 15 }, // Ngày sinh
    { wch: 38 }, // Địa chỉ gia đình
    { wch: 15 }, // SĐT
    { wch: 28 }, // Địa chỉ Email
    { wch: 20 }, // Bằng cấp
    { wch: 14 }, // Tôn giáo
    { wch: 30 }, // Số tài khoản
  ];

  const primaryTeachers = teachersList.filter((t) =>
    normalizeSchoolLevels(t.schoolLevels).includes("primary"),
  );
  const secondaryTeachers = teachersList.filter((t) =>
    normalizeSchoolLevels(t.schoolLevels).includes("secondary"),
  );

  const cleanYearText = schoolYearName.toUpperCase().startsWith("NĂM HỌC")
    ? schoolYearName.toUpperCase()
    : `NĂM HỌC ${schoolYearName}`;

  function buildTamHaRow(t: TeacherRow, index: number) {
    const homeroomClasses = getTeacherHomeroomClassNames(t.id, classesList);
    const subjectNames = getTeacherSubjectNames(t, subjectsList);
    const pos = getTeacherPositionTitle(t, homeroomClasses, subjectNames);
    const bankInfo = t.bankAccountNumber
      ? (t.bankName ? `'${t.bankAccountNumber} (${t.bankName})` : `'${t.bankAccountNumber}`)
      : "";

    return [
      index + 1,
      t.fullName || "",
      pos,
      formatDob(t.dob),
      t.address || "",
      t.phone || "",
      t.email || "",
      t.degree || "Đại học",
      t.religion || "Không",
      bankInfo,
    ];
  }

  const wb = XLSX.utils.book_new();

  // ==========================================================
  // SHEET 1: MẪU CHUẨN TAM HÀ (Gồm cả Tiểu học & THCS như trong hình)
  // ==========================================================
  const aoaTamHa: any[][] = [];
  const mergesTamHa: XLSX.Range[] = [];

  // Dòng 1: Tiêu đề lớn
  aoaTamHa.push(["THÔNG TIN GIÁO VIÊN  PHỔ CẬP TAM HÀ", "", "", "", "", "", "", "", "", ""]);
  mergesTamHa.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });

  // Dòng 2: Năm học
  aoaTamHa.push([cleanYearText, "", "", "", "", "", "", "", "", ""]);
  mergesTamHa.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });

  // Dòng 3: Khối TIỂU HỌC
  aoaTamHa.push(["TIỂU HỌC", "", "", "", "", "", "", "", "", ""]);
  mergesTamHa.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } });

  // Dòng 4: Tiêu đề bảng
  aoaTamHa.push([
    "STT",
    "HỌ TÊN GV",
    "Chức vụ",
    "Ngày sinh",
    "Địa chỉ gia đình",
    "SĐT",
    "Địa chỉ Email",
    "Bằng cấp",
    "Tôn giáo",
    "Số tài khoản",
  ]);

  // Dữ liệu Tiểu học
  primaryTeachers.forEach((t, i) => {
    aoaTamHa.push(buildTamHaRow(t, i));
  });

  if (primaryTeachers.length === 0) {
    aoaTamHa.push(["-", "Chưa có giáo viên tiểu học", "", "", "", "", "", "", "", ""]);
  }

  // Phân cách dòng trống
  aoaTamHa.push([]);

  // Khối TRUNG HỌC CƠ SỞ
  const secondaryTitleRowIdx = aoaTamHa.length;
  aoaTamHa.push(["TRUNG HỌC CƠ SỞ", "", "", "", "", "", "", "", "", ""]);
  mergesTamHa.push({ s: { r: secondaryTitleRowIdx, c: 0 }, e: { r: secondaryTitleRowIdx, c: 1 } });

  // Tiêu đề bảng THCS
  aoaTamHa.push([
    "STT",
    "HỌ TÊN GV",
    "Chức vụ",
    "Ngày sinh",
    "Địa chỉ gia đình",
    "SĐT",
    "Địa chỉ Email",
    "Bằng cấp",
    "Tôn giáo",
    "Số tài khoản",
  ]);

  // Dữ liệu THCS
  secondaryTeachers.forEach((t, i) => {
    aoaTamHa.push(buildTamHaRow(t, i));
  });

  if (secondaryTeachers.length === 0) {
    aoaTamHa.push(["-", "Chưa có giáo viên THCS", "", "", "", "", "", "", "", ""]);
  }

  const wsTamHa = XLSX.utils.aoa_to_sheet(aoaTamHa);
  wsTamHa["!merges"] = mergesTamHa;
  wsTamHa["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsTamHa, "Mẫu chuẩn Tam Hà");

  // ==========================================================
  // SHEET 2: CẤP 1 - TIỂU HỌC (Riêng biệt)
  // ==========================================================
  const aoaPrimary: any[][] = [];
  const mergesPrimary: XLSX.Range[] = [];
  aoaPrimary.push(["THÔNG TIN GIÁO VIÊN  PHỔ CẬP TAM HÀ - CẤP TIỂU HỌC", "", "", "", "", "", "", "", "", ""]);
  mergesPrimary.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
  aoaPrimary.push([cleanYearText, "", "", "", "", "", "", "", "", ""]);
  mergesPrimary.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });
  aoaPrimary.push(["TIỂU HỌC", "", "", "", "", "", "", "", "", ""]);
  mergesPrimary.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } });
  aoaPrimary.push([
    "STT",
    "HỌ TÊN GV",
    "Chức vụ",
    "Ngày sinh",
    "Địa chỉ gia đình",
    "SĐT",
    "Địa chỉ Email",
    "Bằng cấp",
    "Tôn giáo",
    "Số tài khoản",
  ]);
  primaryTeachers.forEach((t, i) => {
    aoaPrimary.push(buildTamHaRow(t, i));
  });
  const wsPrimary = XLSX.utils.aoa_to_sheet(aoaPrimary);
  wsPrimary["!merges"] = mergesPrimary;
  wsPrimary["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsPrimary, "Cấp 1 - Tiểu học");

  // ==========================================================
  // SHEET 3: CẤP 2 - THCS (Riêng biệt)
  // ==========================================================
  const aoaSecondary: any[][] = [];
  const mergesSecondary: XLSX.Range[] = [];
  aoaSecondary.push(["THÔNG TIN GIÁO VIÊN  PHỔ CẬP TAM HÀ - CẤP THCS", "", "", "", "", "", "", "", "", ""]);
  mergesSecondary.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
  aoaSecondary.push([cleanYearText, "", "", "", "", "", "", "", "", ""]);
  mergesSecondary.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });
  aoaSecondary.push(["TRUNG HỌC CƠ SỞ", "", "", "", "", "", "", "", "", ""]);
  mergesSecondary.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } });
  aoaSecondary.push([
    "STT",
    "HỌ TÊN GV",
    "Chức vụ",
    "Ngày sinh",
    "Địa chỉ gia đình",
    "SĐT",
    "Địa chỉ Email",
    "Bằng cấp",
    "Tôn giáo",
    "Số tài khoản",
  ]);
  secondaryTeachers.forEach((t, i) => {
    aoaSecondary.push(buildTamHaRow(t, i));
  });
  const wsSecondary = XLSX.utils.aoa_to_sheet(aoaSecondary);
  wsSecondary["!merges"] = mergesSecondary;
  wsSecondary["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsSecondary, "Cấp 2 - THCS");

  // ==========================================================
  // SHEET 4: TOÀN TRƯỜNG (CHI TIẾT ĐẦY ĐỦ THUỘC TÍNH HỒ SƠ)
  // ==========================================================
  function getDepartmentName(deptId: unknown) {
    const dId = textValue(deptId);
    if (!dId) return "";
    const d = departmentsList.find((item) => item.id === dId);
    return textValue(d?.name) || textValue(d?.code) || dId;
  }

  const detailRows = teachersList.map((teacher, index) => {
    const homeroomClasses = getTeacherHomeroomClassNames(teacher.id, classesList);
    const subjectNames = getTeacherSubjectNames(teacher, subjectsList);
    const departmentName = getDepartmentName(teacher.departmentId);
    const levels = normalizeSchoolLevels(teacher.schoolLevels);
    const levelText = levels.length === 2 ? "Tiểu học + THCS" : levels[0] === "primary" ? "Tiểu học" : "THCS";
    const pos = getTeacherPositionTitle(teacher, homeroomClasses, subjectNames);

    return {
      "STT": index + 1,
      "Mã giáo viên": teacher.teacherCode || teacher.id,
      "Họ và tên": teacher.fullName || "",
      "Chức vụ": pos,
      "Ngày sinh": formatDob(teacher.dob),
      "Địa chỉ gia đình": teacher.address || "",
      "SĐT": teacher.phone || "",
      "Địa chỉ Email": teacher.email || "",
      "Bằng cấp": teacher.degree || "Đại học",
      "Tôn giáo": teacher.religion || "Không",
      "Tên ngân hàng": teacher.bankName || "",
      "Số tài khoản (STK)": teacher.bankAccountNumber ? `'${teacher.bankAccountNumber}` : "",
      "Cấp học": levelText,
      "Tổ / Bộ môn": departmentName || "—",
      "Môn giảng dạy (GVBM)": subjectNames,
      "Lớp chủ nhiệm (GVCN)": homeroomClasses ? `Lớp ${homeroomClasses}` : "Không chủ nhiệm",
      "Vai trò": teachingRoleLabel(teacher.teachingRole),
      "Chuyên môn đào tạo": teacher.specialization || "",
      "Loại giáo viên": teacher.teacherType === "co_huu" ? "Cơ hữu" : "Thỉnh giảng",
      "Số tiết chuẩn/tuần": teacher.standardPeriodsPerWeek ?? "",
      "Đơn giá/tiết": teacher.ratePerPeriod ?? "",
      "Ngày vào làm": teacher.startDate || "",
      "Trạng thái": teacher.status === "inactive" ? "Ngừng hoạt động" : "Đang hoạt động",
    };
  });

  const wsAll = XLSX.utils.json_to_sheet(detailRows.length > 0 ? detailRows : [{}]);
  XLSX.utils.book_append_sheet(wb, wsAll, "Toàn trường (Chi tiết)");

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `THONG_TIN_GIAO_VIEN_TAM_HA_${dateStr}.xlsx`);
  toast.success(`Đã xuất Excel mẫu chuẩn Tam Hà (${teachersList.length} giáo viên) thành công!`);
}

export function exportTeachersToXml(
  teachersList: TeacherRow[],
  classesList: CatalogRow[],
  subjectsList: CatalogRow[],
  departmentsList: CatalogRow[],
  schoolYearName = "2025 - 2026",
) {
  function getDepartmentName(deptId: unknown) {
    const dId = textValue(deptId);
    if (!dId) return "";
    const d = departmentsList.find((item) => item.id === dId);
    return textValue(d?.name) || textValue(d?.code) || dId;
  }

  function escapeXml(str: unknown): string {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function teacherToXml(teacher: TeacherRow, index: number): string {
    const homeroomClasses = getTeacherHomeroomClassNames(teacher.id, classesList);
    const subjectNames = getTeacherSubjectNames(teacher, subjectsList);
    const departmentName = getDepartmentName(teacher.departmentId);
    const levels = normalizeSchoolLevels(teacher.schoolLevels);
    const levelText = levels.length === 2 ? "Tiểu học + THCS" : levels[0] === "primary" ? "Tiểu học" : "THCS";
    const pos = getTeacherPositionTitle(teacher, homeroomClasses, subjectNames);

    return `    <GiaoVien stt="${index + 1}" id="${escapeXml(teacher.id)}">
      <MaGiaoVien>${escapeXml(teacher.teacherCode || teacher.id)}</MaGiaoVien>
      <HoVaTen>${escapeXml(teacher.fullName)}</HoVaTen>
      <ChucVu>${escapeXml(pos)}</ChucVu>
      <NgaySinh>${escapeXml(formatDob(teacher.dob))}</NgaySinh>
      <DiaChiGiaDinh>${escapeXml(teacher.address || "")}</DiaChiGiaDinh>
      <SoDienThoai>${escapeXml(teacher.phone)}</SoDienThoai>
      <Email>${escapeXml(teacher.email)}</Email>
      <BangCap>${escapeXml(teacher.degree || "Đại học")}</BangCap>
      <TonGiao>${escapeXml(teacher.religion || "Không")}</TonGiao>
      <TaiKhoanNganHang>
        <TenNganHang>${escapeXml(teacher.bankName || "")}</TenNganHang>
        <SoTaiKhoan>${escapeXml(teacher.bankAccountNumber || "")}</SoTaiKhoan>
      </TaiKhoanNganHang>
      <CapHoc>${escapeXml(levelText)}</CapHoc>
      <ToChuyenMon>${escapeXml(departmentName)}</ToChuyenMon>
      <MonGiangDayGVBM>${escapeXml(subjectNames)}</MonGiangDayGVBM>
      <LopChuNhiemGVCN>${escapeXml(homeroomClasses ? `Lớp ${homeroomClasses}` : "Không chủ nhiệm")}</LopChuNhiemGVCN>
      <VaiTro>${escapeXml(teachingRoleLabel(teacher.teachingRole))}</VaiTro>
      <ChuyenMon>${escapeXml(teacher.specialization || "")}</ChuyenMon>
      <LoaiGiaoVien>${escapeXml(teacher.teacherType === "co_huu" ? "Cơ hữu" : "Thỉnh giảng")}</LoaiGiaoVien>
      <SoTietChuanTuan>${escapeXml(teacher.standardPeriodsPerWeek ?? "")}</SoTietChuanTuan>
      <NgayVaoLam>${escapeXml(teacher.startDate || "")}</NgayVaoLam>
      <TrangThai>${escapeXml(teacher.status === "inactive" ? "Ngừng hoạt động" : "Đang hoạt động")}</TrangThai>
    </GiaoVien>`;
  }

  const primaryTeachers = teachersList.filter((t) =>
    normalizeSchoolLevels(t.schoolLevels).includes("primary"),
  );
  const secondaryTeachers = teachersList.filter((t) =>
    normalizeSchoolLevels(t.schoolLevels).includes("secondary"),
  );

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<ThongTinGiaoVien donVi="PHỔ CẬP TAM HÀ" namHoc="${escapeXml(schoolYearName)}" thoiDiemXuat="${new Date().toISOString()}">
  <PhanHe_Cap1_TieuHoc soLuong="${primaryTeachers.length}">
${primaryTeachers.map((t, idx) => teacherToXml(t, idx)).join("\n")}
  </PhanHe_Cap1_TieuHoc>
  <PhanHe_Cap2_THCS soLuong="${secondaryTeachers.length}">
${secondaryTeachers.map((t, idx) => teacherToXml(t, idx)).join("\n")}
  </PhanHe_Cap2_THCS>
</ThongTinGiaoVien>`;

  const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `THONG_TIN_GIAO_VIEN_TAM_HA_${new Date().toISOString().slice(0, 10)}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`Đã xuất file XML thông tin giáo viên Tam Hà (${teachersList.length} giáo viên) thành công!`);
}
