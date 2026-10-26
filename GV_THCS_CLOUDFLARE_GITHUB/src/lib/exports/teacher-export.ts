import ExcelJS from "exceljs";
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

// ============================================================================
// STYLING HELPERS & CONSTANTS FOR EXCELJS
// ============================================================================
const FONT_NAME = "Arial";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

const doubleBottomBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "double", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

function addSheetHeader(
  ws: ExcelJS.Worksheet,
  title: string,
  schoolYearText: string,
  colCount = 10,
) {
  const lastColLetter = String.fromCharCode(64 + colCount);

  // Dòng 1: Tiêu đề lớn
  ws.mergeCells(`A1:${lastColLetter}1`);
  const row1 = ws.getRow(1);
  row1.height = 36;
  const cellTitle = ws.getCell("A1");
  cellTitle.value = title;
  cellTitle.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: "FF0F172A" } };
  cellTitle.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng 2: Năm học
  ws.mergeCells(`A2:${lastColLetter}2`);
  const row2 = ws.getRow(2);
  row2.height = 24;
  const cellYear = ws.getCell("A2");
  cellYear.value = schoolYearText;
  cellYear.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: "FF1E3A8A" } };
  cellYear.alignment = { vertical: "middle", horizontal: "center" };
}

function addSectionBanner(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  title: string,
) {
  ws.mergeCells(`A${rowNumber}:B${rowNumber}`);
  const row = ws.getRow(rowNumber);
  row.height = 26;

  const cellA = ws.getCell(`A${rowNumber}`);
  cellA.value = title;

  [`A${rowNumber}`, `B${rowNumber}`].forEach((pos) => {
    const c = ws.getCell(pos);
    c.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF003366" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
    c.border = thinBorder;
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
}

const standardHeaders = [
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
];

const standardAlignments: ExcelJS.Alignment["horizontal"][] = [
  "center", // 1. STT
  "left",   // 2. Họ tên
  "left",   // 3. Chức vụ
  "center", // 4. Ngày sinh
  "left",   // 5. Địa chỉ
  "center", // 6. SĐT
  "left",   // 7. Email
  "center", // 8. Bằng cấp
  "center", // 9. Tôn giáo
  "left",   // 10. Số tài khoản
];

function addTableHeader(ws: ExcelJS.Worksheet, rowNumber: number) {
  const row = ws.getRow(rowNumber);
  row.values = standardHeaders;
  row.height = 30;

  for (let c = 1; c <= standardHeaders.length; c++) {
    const cell = row.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
}

function addDataRow(
  ws: ExcelJS.Worksheet,
  values: (string | number)[],
  isEven: boolean,
) {
  const row = ws.addRow(values);
  row.height = 25;
  const bg = isEven ? "FFFFFFFF" : "FFF8FAFC";

  standardAlignments.forEach((align, idx) => {
    const cell = row.getCell(idx + 1);
    const isBold = idx === 1 || idx === 7; // Họ tên (cột 2) and Bằng cấp (cột 8)
    cell.font = {
      name: FONT_NAME,
      size: 10.5,
      bold: isBold,
      color: { argb: "FF0F172A" },
    };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    cell.border = thinBorder;
    cell.alignment = {
      vertical: "middle",
      horizontal: align,
      wrapText: align === "left",
    };
  });
}

function setStandardColWidths(ws: ExcelJS.Worksheet) {
  const widths = [7, 28, 30, 16, 42, 16, 32, 18, 16, 32];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/**
 * Xuất file Excel định dạng chuyên nghiệp, đẹp chuẩn, có viền, màu sắc, cỡ chữ và căn lề tự động
 * theo đúng biểu mẫu "THÔNG TIN GIÁO VIÊN PHỔ CẬP TAM HÀ"
 */
export async function exportTeachersToExcel(
  teachersList: TeacherRow[],
  classesList: CatalogRow[],
  subjectsList: CatalogRow[],
  departmentsList: CatalogRow[],
  schoolYearName = "2025 - 2026",
) {
  const cleanYearText = schoolYearName.toUpperCase().startsWith("NĂM HỌC")
    ? schoolYearName.toUpperCase()
    : `NĂM HỌC ${schoolYearName}`;

  const primaryTeachers = teachersList.filter((t) =>
    normalizeSchoolLevels(t.schoolLevels).includes("primary"),
  );
  const secondaryTeachers = teachersList.filter((t) =>
    normalizeSchoolLevels(t.schoolLevels).includes("secondary"),
  );

  function buildTamHaValues(t: TeacherRow, index: number) {
    const homeroomClasses = getTeacherHomeroomClassNames(t.id, classesList);
    const subjectNames = getTeacherSubjectNames(t, subjectsList);
    const pos = getTeacherPositionTitle(t, homeroomClasses, subjectNames);
    const bankInfo = t.bankAccountNumber
      ? (t.bankName ? `${t.bankAccountNumber} (${t.bankName})` : `${t.bankAccountNumber}`)
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Phổ Cập Tam Hà";
  wb.created = new Date();

  // ==========================================================================
  // SHEET 1: MẪU CHUẨN TAM HÀ (Cả Tiểu học & THCS theo đúng mẫu hình)
  // ==========================================================================
  const wsTamHa = wb.addWorksheet("Mẫu chuẩn Tam Hà", {
    views: [{ showGridLines: true }],
  });
  setStandardColWidths(wsTamHa);

  addSheetHeader(wsTamHa, "THÔNG TIN GIÁO VIÊN  PHỔ CẬP TAM HÀ", cleanYearText, 10);

  // 1. Phân hệ TIỂU HỌC
  addSectionBanner(wsTamHa, 3, "TIỂU HỌC");
  addTableHeader(wsTamHa, 4);

  if (primaryTeachers.length > 0) {
    primaryTeachers.forEach((t, i) => {
      addDataRow(wsTamHa, buildTamHaValues(t, i), i % 2 === 0);
    });
  } else {
    const emptyRow = wsTamHa.addRow(["—", "Chưa có dữ liệu giáo viên tiểu học", "", "", "", "", "", "", "", ""]);
    emptyRow.height = 24;
    for (let c = 1; c <= 10; c++) {
      const cell = emptyRow.getCell(c);
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }

  // Dòng trống phân cách
  const blankRow = wsTamHa.addRow([]);
  blankRow.height = 16;

  // 2. Phân hệ TRUNG HỌC CƠ SỞ
  const secBannerRowIndex = wsTamHa.rowCount + 1;
  addSectionBanner(wsTamHa, secBannerRowIndex, "TRUNG HỌC CƠ SỞ");
  const secHeaderRowIndex = secBannerRowIndex + 1;
  addTableHeader(wsTamHa, secHeaderRowIndex);

  if (secondaryTeachers.length > 0) {
    secondaryTeachers.forEach((t, i) => {
      addDataRow(wsTamHa, buildTamHaValues(t, i), i % 2 === 0);
    });
  } else {
    const emptyRow = wsTamHa.addRow(["—", "Chưa có dữ liệu giáo viên THCS", "", "", "", "", "", "", "", ""]);
    emptyRow.height = 24;
    for (let c = 1; c <= 10; c++) {
      const cell = emptyRow.getCell(c);
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }

  // Dòng Tổng kết
  const summaryRow = wsTamHa.addRow([
    "TỔNG CỘNG",
    "",
    "",
    `Toàn trường: ${teachersList.length} giáo viên  |  Tiểu học: ${primaryTeachers.length} GV  |  THCS: ${secondaryTeachers.length} GV`,
  ]);
  const sumIdx = summaryRow.number;
  wsTamHa.mergeCells(`A${sumIdx}:C${sumIdx}`);
  wsTamHa.mergeCells(`D${sumIdx}:J${sumIdx}`);
  summaryRow.height = 28;

  for (let c = 1; c <= 10; c++) {
    const cell = summaryRow.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = doubleBottomBorder;
    cell.alignment = { vertical: "middle", horizontal: c <= 3 ? "center" : "left" };
  }

  // ==========================================================================
  // SHEET 2: CẤP 1 - TIỂU HỌC (Riêng biệt)
  // ==========================================================================
  const wsPrimary = wb.addWorksheet("Cấp 1 - Tiểu học", {
    views: [{ showGridLines: true }],
  });
  setStandardColWidths(wsPrimary);

  addSheetHeader(wsPrimary, "THÔNG TIN GIÁO VIÊN  PHỔ CẬP TAM HÀ - CẤP TIỂU HỌC", cleanYearText, 10);
  addSectionBanner(wsPrimary, 3, "TIỂU HỌC");
  addTableHeader(wsPrimary, 4);

  primaryTeachers.forEach((t, i) => {
    addDataRow(wsPrimary, buildTamHaValues(t, i), i % 2 === 0);
  });

  const sumRowPrimary = wsPrimary.addRow([
    "TỔNG CỘNG",
    "",
    "",
    `Tổng số: ${primaryTeachers.length} giáo viên Cấp 1 (Tiểu học)`,
  ]);
  const sumPIdx = sumRowPrimary.number;
  wsPrimary.mergeCells(`A${sumPIdx}:C${sumPIdx}`);
  wsPrimary.mergeCells(`D${sumPIdx}:J${sumPIdx}`);
  sumRowPrimary.height = 28;
  for (let c = 1; c <= 10; c++) {
    const cell = sumRowPrimary.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = doubleBottomBorder;
    cell.alignment = { vertical: "middle", horizontal: c <= 3 ? "center" : "left" };
  }

  // ==========================================================================
  // SHEET 3: CẤP 2 - THCS (Riêng biệt)
  // ==========================================================================
  const wsSecondary = wb.addWorksheet("Cấp 2 - THCS", {
    views: [{ showGridLines: true }],
  });
  setStandardColWidths(wsSecondary);

  addSheetHeader(wsSecondary, "THÔNG TIN GIÁO VIÊN  PHỔ CẬP TAM HÀ - CẤP THCS", cleanYearText, 10);
  addSectionBanner(wsSecondary, 3, "TRUNG HỌC CƠ SỞ");
  addTableHeader(wsSecondary, 4);

  secondaryTeachers.forEach((t, i) => {
    addDataRow(wsSecondary, buildTamHaValues(t, i), i % 2 === 0);
  });

  const sumRowSecondary = wsSecondary.addRow([
    "TỔNG CỘNG",
    "",
    "",
    `Tổng số: ${secondaryTeachers.length} giáo viên Cấp 2 (THCS)`,
  ]);
  const sumSIdx = sumRowSecondary.number;
  wsSecondary.mergeCells(`A${sumSIdx}:C${sumSIdx}`);
  wsSecondary.mergeCells(`D${sumSIdx}:J${sumSIdx}`);
  sumRowSecondary.height = 28;
  for (let c = 1; c <= 10; c++) {
    const cell = sumRowSecondary.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = doubleBottomBorder;
    cell.alignment = { vertical: "middle", horizontal: c <= 3 ? "center" : "left" };
  }

  // ==========================================================================
  // SHEET 4: TOÀN TRƯỜNG (CHI TIẾT ĐẦY ĐỦ 23 CỘT QUẢN TRỊ & TÀI CHÍNH)
  // ==========================================================================
  const wsDetail = wb.addWorksheet("Toàn trường (Chi tiết)", {
    views: [{ showGridLines: true }],
  });

  const detailHeaders = [
    "STT",
    "Mã giáo viên",
    "Họ và tên",
    "Chức vụ",
    "Ngày sinh",
    "Địa chỉ gia đình",
    "SĐT",
    "Email",
    "Bằng cấp",
    "Tôn giáo",
    "Tên ngân hàng",
    "Số tài khoản (STK)",
    "Cấp học",
    "Tổ / Bộ môn",
    "Môn giảng dạy (GVBM)",
    "Lớp chủ nhiệm (GVCN)",
    "Vai trò",
    "Chuyên môn đào tạo",
    "Loại giáo viên",
    "Số tiết chuẩn/tuần",
    "Đơn giá/tiết",
    "Ngày vào làm",
    "Trạng thái",
  ];

  const detailWidths = [7, 16, 26, 28, 15, 38, 16, 28, 16, 14, 22, 22, 16, 22, 26, 22, 20, 24, 15, 16, 15, 15, 16];
  detailWidths.forEach((w, i) => {
    wsDetail.getColumn(i + 1).width = w;
  });

  addSheetHeader(wsDetail, "DANH SÁCH GIÁO VIÊN TOÀN TRƯỜNG (CHI TIẾT HỒ SƠ)", cleanYearText, detailHeaders.length);

  // Table header row 3
  const dHeaderRow = wsDetail.getRow(4);
  dHeaderRow.values = detailHeaders;
  dHeaderRow.height = 30;
  for (let c = 1; c <= detailHeaders.length; c++) {
    const cell = dHeaderRow.getCell(c);
    cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } }; // Navy blue header
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }

  function getDepartmentName(deptId: unknown) {
    const dId = textValue(deptId);
    if (!dId) return "";
    const d = departmentsList.find((item) => item.id === dId);
    return textValue(d?.name) || textValue(d?.code) || dId;
  }

  teachersList.forEach((teacher, idx) => {
    const homeroomClasses = getTeacherHomeroomClassNames(teacher.id, classesList);
    const subjectNames = getTeacherSubjectNames(teacher, subjectsList);
    const departmentName = getDepartmentName(teacher.departmentId);
    const levels = normalizeSchoolLevels(teacher.schoolLevels);
    const levelText = levels.length === 2 ? "Tiểu học + THCS" : levels[0] === "primary" ? "Tiểu học" : "THCS";
    const pos = getTeacherPositionTitle(teacher, homeroomClasses, subjectNames);

    const values = [
      idx + 1,
      teacher.teacherCode || teacher.id,
      teacher.fullName || "",
      pos,
      formatDob(teacher.dob),
      teacher.address || "",
      teacher.phone || "",
      teacher.email || "",
      teacher.degree || "Đại học",
      teacher.religion || "Không",
      teacher.bankName || "",
      teacher.bankAccountNumber || "",
      levelText,
      departmentName || "—",
      subjectNames,
      homeroomClasses ? `Lớp ${homeroomClasses}` : "Không chủ nhiệm",
      teachingRoleLabel(teacher.teachingRole),
      teacher.specialization || "",
      teacher.teacherType === "co_huu" ? "Cơ hữu" : "Thỉnh giảng",
      teacher.standardPeriodsPerWeek ?? "",
      teacher.ratePerPeriod ?? "",
      teacher.startDate || "",
      teacher.status === "inactive" ? "Ngừng hoạt động" : "Đang hoạt động",
    ];

    const row = wsDetail.addRow(values);
    row.height = 24;
    const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";

    for (let c = 1; c <= detailHeaders.length; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT_NAME, size: 10, color: { argb: "FF0F172A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = thinBorder;
      // Align center for dates, status, codes, degrees
      const isCenter = [1, 2, 5, 7, 9, 10, 12, 13, 17, 19, 20, 21, 22, 23].includes(c);
      cell.alignment = {
        vertical: "middle",
        horizontal: isCenter ? "center" : "left",
        wrapText: !isCenter,
      };
    }
  });

  // Download buffer in browser
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `THONG_TIN_GIAO_VIEN_TAM_HA_${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success(
    `Đã xuất file Excel đẹp chuẩn (${teachersList.length} giáo viên) với định dạng ô, màu sắc và viền hoàn chỉnh!`,
  );
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
