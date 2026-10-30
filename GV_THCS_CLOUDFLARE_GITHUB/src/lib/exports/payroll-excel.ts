import ExcelJS from "exceljs";
import type { ScheduleWithMeta, TeacherPayrollSummaryRow, TeachingLevel } from "@/app/admin/payroll/types";
import { payrollStatusLabelVi, statusLabelVi } from "@/app/admin/payroll/types";

// ============================================================================
// STYLING & CONSTANTS
// ============================================================================
const FONT_NAME = "Arial";
const SCHOOL_NAME = "TRƯỜNG TIỂU HỌC & THCS PHỔ CẬP TAM HÀ";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

const headerBorder: Partial<ExcelJS.Borders> = {
  top: { style: "medium", color: { argb: "FF0F172A" } },
  left: { style: "thin", color: { argb: "FF475569" } },
  bottom: { style: "medium", color: { argb: "FF0F172A" } },
  right: { style: "thin", color: { argb: "FF475569" } },
};

const subtotalBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF334155" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "double", color: { argb: "FF0F172A" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

// ============================================================================
// HELPERS FOR RECOGNIZING HOMEROOM PERIOD (SINH HOẠT LỚP)
// ============================================================================

/**
 * Kiểm tra xem môn học / tiết dạy có phải là tiết Sinh hoạt lớp (SHL) hay không.
 * Hỗ trợ nhận diện các mẫu tên: "Sinh Hoạt Lớp", "Sinh Hoạt Lớp 1".."9", "SHL", "HĐTN, HN", mã "SUBJ-SHL"
 */
export function isHomeroomSubject(
  subjectName?: string,
  subjectCode?: string,
  subjectId?: string
): boolean {
  const normName = (subjectName || "").toLowerCase().trim();
  const normCode = (subjectCode || "").toUpperCase().trim();
  const normId = (subjectId || "").toLowerCase().trim();

  // Kiểm tra mã môn
  if (normCode.includes("SHL") || normCode.includes("SINH_HOAT") || normCode.includes("SINHHOAT")) {
    return true;
  }
  // Kiểm tra ID
  if (normId.includes("shl") || normId.includes("sinh_hoat") || normId.includes("sinhhoat")) {
    return true;
  }
  // Kiểm tra tên hiển thị môn học
  if (
    normName.includes("sinh hoạt lớp") ||
    normName.includes("sinh hoat lop") ||
    normName === "shl" ||
    normName.startsWith("shl ") ||
    normName.endsWith(" shl") ||
    normName.includes("tiết sinh hoạt") ||
    normName.includes("tiet sinh hoat")
  ) {
    return true;
  }

  return false;
}

/**
 * Tải workbook xuống trình duyệt
 */
export async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Tạo khối tiêu đề đầu bảng tính
 */
function addSheetHeader(
  ws: ExcelJS.Worksheet,
  title: string,
  monthText: string,
  filterNote: string,
  colSpan: number
) {
  const lastColLetter = getColumnLetter(colSpan);

  // Dòng 1: Tên đơn vị / Trường
  ws.mergeCells(`A1:${lastColLetter}1`);
  const r1 = ws.getRow(1);
  r1.height = 20;
  const c1 = ws.getCell("A1");
  c1.value = SCHOOL_NAME;
  c1.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FF475569" } };
  c1.alignment = { vertical: "middle", horizontal: "left" };

  // Dòng 2: Tiêu đề báo cáo
  ws.mergeCells(`A2:${lastColLetter}2`);
  const r2 = ws.getRow(2);
  r2.height = 32;
  const c2 = ws.getCell("A2");
  c2.value = title;
  c2.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: "FF1E3A8A" } };
  c2.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng 3: Kỳ thống kê
  ws.mergeCells(`A3:${lastColLetter}3`);
  const r3 = ws.getRow(3);
  r3.height = 20;
  const c3 = ws.getCell("A3");
  c3.value = `Kỳ thống kê: ${monthText}`;
  c3.font = { name: FONT_NAME, size: 11, bold: true, italic: true, color: { argb: "FF334155" } };
  c3.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng 4: Bộ lọc & thời gian xuất
  ws.mergeCells(`A4:${lastColLetter}4`);
  const r4 = ws.getRow(4);
  r4.height = 18;
  const c4 = ws.getCell("A4");
  const nowStr = new Date().toLocaleString("vi-VN", { hour12: false });
  c4.value = `Ghi chú bộ lọc: ${filterNote || "Toàn trường"} · Xuất lúc: ${nowStr}`;
  c4.font = { name: FONT_NAME, size: 9, italic: true, color: { argb: "FF64748B" } };
  c4.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng 5: Dòng trống ngăn cách
  ws.getRow(5).height = 10;
}

/**
 * Chuyển số cột (1-indexed) thành chữ cái Excel (A, B... Z, AA, AB...)
 */
function getColumnLetter(colIndex: number): string {
  let letter = "";
  while (colIndex > 0) {
    const mod = (colIndex - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    colIndex = Math.floor((colIndex - mod) / 26);
  }
  return letter;
}

/**
 * Cấu hình in ấn khổ A4 cho worksheet
 */
function applyPageSetup(ws: ExcelJS.Worksheet, orientation: "portrait" | "landscape" = "landscape") {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
    showGridLines: true,
  };
}

// ============================================================================
// SHEET 1: BẢNG TỔNG HỢP THEO GIÁO VIÊN & CẤP HỌC (TONG_HOP_GIAO_VIEN)
// ============================================================================
interface TeacherAttendanceBreakdown {
  distinctDates: string[];
  homeroomPeriods: number;
  academicPeriods: number;
  substituteDetails: string;
}

function calculateTeacherAttendanceBreakdown(
  teacherId: string,
  schedules: ScheduleWithMeta[]
): TeacherAttendanceBreakdown {
  const teacherSchedules = schedules.filter(
    (s) =>
      s.effectiveTeacherId === teacherId &&
      s.effectiveStatus !== "absent"
  );

  const datesSet = new Set<string>();
  let homeroomPeriods = 0;
  let academicPeriods = 0;

  for (const s of teacherSchedules) {
    if (s.calculatedDate) {
      datesSet.add(s.calculatedDate);
    }
    const isSHL = isHomeroomSubject(s.resolvedSubjectName, s.subjectCode, s.subjectId);
    const count = s.periodCountNum || 1;
    if (isSHL) {
      homeroomPeriods += count;
    } else {
      academicPeriods += count;
    }
  }

  // Sắp xếp ngày dạy tăng dần
  const distinctDates = Array.from(datesSet).sort();

  // Thống kê dạy thay ai
  const subSchedules = teacherSchedules.filter((s) => s.isSubstituted);
  let substituteDetails = "—";
  if (subSchedules.length > 0) {
    // Nhóm theo tên giáo viên được thay
    const originalMap = new Map<string, { periods: number; dates: Set<string> }>();
    for (const sub of subSchedules) {
      const origName = sub.originalTeacherName || sub.resolvedTeacherName || "GV khác";
      const existing = originalMap.get(origName) || { periods: 0, dates: new Set<string>() };
      existing.periods += sub.periodCountNum || 1;
      if (sub.formattedDate) existing.dates.add(sub.formattedDate.slice(0, 5)); // DD/MM
      originalMap.set(origName, existing);
    }

    const detailParts: string[] = [];
    for (const [name, info] of originalMap.entries()) {
      const dateList = Array.from(info.dates).join(", ");
      detailParts.push(`${name} (${info.periods} tiết: ${dateList})`);
    }
    substituteDetails = detailParts.join("; ");
  }

  return {
    distinctDates,
    homeroomPeriods,
    academicPeriods,
    substituteDetails,
  };
}

export function buildTeacherSummaryWorksheet(
  ws: ExcelJS.Worksheet,
  params: {
    summaryRows: TeacherPayrollSummaryRow[];
    schedules: ScheduleWithMeta[];
    selectedMonth: string;
    filterNote?: string;
  }
) {
  const { summaryRows, schedules, selectedMonth, filterNote = "Tất cả giáo viên" } = params;

  applyPageSetup(ws, "landscape");

  const [yearStr, monthStr] = selectedMonth.split("-");
  const monthText = `Tháng ${monthStr || selectedMonth}/${yearStr || ""}`;

  const headers = [
    "STT",
    "Mã GV",
    "Họ và Tên",
    "Cấp học",
    "Tổ bộ môn",
    "Loại HĐ",
    "Số ngày dạy",
    "Danh sách ngày dạy",
    "Tổng tiết thực dạy",
    "Tiết chuyên môn",
    "Tiết Sinh hoạt lớp",
    "Tiết dạy thay (+)",
    "Chi tiết dạy thay ai",
    "Tiết báo vắng (-)",
    "Đơn giá C1 (VNĐ)",
    "Đơn giá C2 (VNĐ)",
    "Điều chỉnh (VNĐ)",
    "Tổng thù lao / Lương (VNĐ)",
    "Trạng thái",
  ];

  const colCount = headers.length;
  addSheetHeader(
    ws,
    "BẢNG TỔNG HỢP CHẤM CÔNG & LƯƠNG THEO GIÁO VIÊN & CẤP HỌC",
    monthText,
    filterNote,
    colCount
  );

  // Dòng Header
  const headerRowIdx = 6;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.height = 34;

  headers.forEach((h, idx) => {
    const colNumber = idx + 1;
    const cell = headerRow.getCell(colNumber);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.border = headerBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    // Highlight cột Tiết Sinh hoạt lớp màu vàng cam để dễ quan sát
    if (h === "Tiết Sinh hoạt lớp") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFB45309" }, // Hổ phách đậm
      };
    } else {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A8A" }, // Navy đậm sang trọng
      };
    }
  });

  // Chia giáo viên theo 3 nhóm Cấp học: Cấp 1, Cấp 2, Cả 2 cấp
  const primaryRows = summaryRows.filter((r) => r.teachingLevel === "PRIMARY");
  const secondaryRows = summaryRows.filter((r) => r.teachingLevel === "SECONDARY");
  const bothRows = summaryRows.filter((r) => r.teachingLevel === "BOTH");

  let currentRowIdx = 7;
  let sttGlobal = 1;

  const renderGroup = (groupTitle: string, groupRows: TeacherPayrollSummaryRow[], groupColor: string) => {
    if (groupRows.length === 0) return;

    // Dòng Banner nhóm cấp học
    const bannerRow = ws.getRow(currentRowIdx);
    bannerRow.height = 24;
    ws.mergeCells(`A${currentRowIdx}:${getColumnLetter(colCount)}${currentRowIdx}`);
    const bannerCell = bannerRow.getCell(1);
    bannerCell.value = `✦ ${groupTitle.toUpperCase()} (${groupRows.length} GIÁO VIÊN)`;
    bannerCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    bannerCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: groupColor },
    };
    bannerCell.border = thinBorder;
    bannerCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    currentRowIdx++;

    const startDataRow = currentRowIdx;

    groupRows.forEach((row) => {
      const breakdown = calculateTeacherAttendanceBreakdown(row.teacherId, schedules);
      const dataRow = ws.getRow(currentRowIdx);
      dataRow.height = 24;

      const totalActual = row.primaryActual + row.secondaryActual;
      const formattedDates = breakdown.distinctDates
        .map((d) => d.slice(8, 10) + "/" + d.slice(5, 7))
        .join(", ");

      const values = [
        sttGlobal++,
        row.teacherCode || "—",
        row.teacherName,
        row.teachingLevelLabel,
        row.departmentName || "—",
        row.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu",
        breakdown.distinctDates.length,
        formattedDates || "—",
        totalActual,
        breakdown.academicPeriods,
        breakdown.homeroomPeriods,
        row.substituteCount,
        breakdown.substituteDetails,
        row.absentCount,
        row.primaryRate || 0,
        row.secondaryRate || 0,
        row.adjustmentAmount || 0,
        row.totalAmount || 0,
        payrollStatusLabelVi(row.status),
      ];

      values.forEach((val, idx) => {
        const cell = dataRow.getCell(idx + 1);
        cell.value = val;
        cell.font = { name: FONT_NAME, size: 9.5 };
        cell.border = thinBorder;

        // Căn lề
        if ([0, 1, 3, 5, 6, 18].includes(idx)) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        } else if ([2, 4, 7, 12].includes(idx)) {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        } else {
          // Các cột số liệu
          cell.alignment = { vertical: "middle", horizontal: "right" };
        }

        // Định dạng số tiền
        if ([14, 15, 16, 17].includes(idx)) {
          cell.numFmt = "#,##0";
        }

        // Tô màu nổi bật cột Tiết Sinh hoạt lớp
        if (idx === 10) {
          if (breakdown.homeroomPeriods > 0) {
            cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: "FFB45309" } };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFEF3C7" }, // Amber light
            };
          }
        }

        // Highlight dòng xen kẽ nhẹ
        if (currentRowIdx % 2 === 0 && idx !== 10) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
      });

      currentRowIdx++;
    });

    const endDataRow = currentRowIdx - 1;

    // Dòng Tổng cộng của nhóm
    const subtotalRow = ws.getRow(currentRowIdx);
    subtotalRow.height = 24;
    subtotalRow.getCell(1).value = "";
    subtotalRow.getCell(2).value = "";
    subtotalRow.getCell(3).value = `Cộng nhóm ${groupTitle}`;
    subtotalRow.getCell(3).font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: "FF0F172A" } };

    // Điền border & font cho toàn bộ dòng tổng nhóm
    for (let c = 1; c <= colCount; c++) {
      const cell = subtotalRow.getCell(c);
      cell.border = subtotalBorder;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      if (c === 7 || (c >= 9 && c <= 12) || c === 14 || c === 17 || c === 18) {
        const colLetter = getColumnLetter(c);
        cell.value = { formula: `SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})` };
        cell.font = { name: FONT_NAME, size: 9.5, bold: true };
        cell.alignment = { vertical: "middle", horizontal: "right" };
        if ([17, 18].includes(c - 1)) cell.numFmt = "#,##0";
      }
    }
    currentRowIdx++;
  };

  renderGroup("Cấp 1 (Tiểu học)", primaryRows, "FFCCFBF1"); // Teal light
  renderGroup("Cấp 2 (THCS)", secondaryRows, "FFE0E7FF"); // Indigo light
  renderGroup("Giáo viên liên cấp (Cả 2 cấp)", bothRows, "FFEDE9FE"); // Purple light

  // Dòng TỔNG CỘNG TOÀN TRƯỜNG
  const grandTotalRow = ws.getRow(currentRowIdx);
  grandTotalRow.height = 28;
  ws.mergeCells(`A${currentRowIdx}:E${currentRowIdx}`);
  const grandLabel = grandTotalRow.getCell(1);
  grandLabel.value = "TỔNG CỘNG TOÀN TRƯỜNG";
  grandLabel.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  grandLabel.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= colCount; c++) {
    const cell = grandTotalRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }, // Slate 900
    };
    cell.border = subtotalBorder;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };

    // Tổng số ngày dạy, tổng tiết thực dạy, tiết chuyên môn, tiết SHL, dạy thay, vắng, tiền
    if (c === 7 || (c >= 9 && c <= 12) || c === 14 || c === 17 || c === 18) {
      let sum = 0;
      if (c === 9) sum = summaryRows.reduce((acc, r) => acc + (r.primaryActual + r.secondaryActual), 0);
      else if (c === 10) {
        sum = summaryRows.reduce((acc, r) => {
          const bd = calculateTeacherAttendanceBreakdown(r.teacherId, schedules);
          return acc + bd.academicPeriods;
        }, 0);
      } else if (c === 11) {
        sum = summaryRows.reduce((acc, r) => {
          const bd = calculateTeacherAttendanceBreakdown(r.teacherId, schedules);
          return acc + bd.homeroomPeriods;
        }, 0);
      } else if (c === 12) sum = summaryRows.reduce((acc, r) => acc + (r.substituteCount || 0), 0);
      else if (c === 14) sum = summaryRows.reduce((acc, r) => acc + (r.absentCount || 0), 0);
      else if (c === 17) sum = summaryRows.reduce((acc, r) => acc + (r.adjustmentAmount || 0), 0);
      else if (c === 18) sum = summaryRows.reduce((acc, r) => acc + (r.totalAmount || 0), 0);

      cell.value = sum;
      cell.alignment = { vertical: "middle", horizontal: "right" };
      if ([17, 18].includes(c)) cell.numFmt = "#,##0";
    }
  }

  // Chữ ký cuối bảng
  const signRowIdx = currentRowIdx + 2;
  const signDateRow = ws.getRow(signRowIdx);
  signDateRow.height = 20;
  ws.mergeCells(`M${signRowIdx}:S${signRowIdx}`);
  const signDateCell = signDateRow.getCell(13);
  const today = new Date();
  signDateCell.value = `Tam Hà, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;
  signDateCell.font = { name: FONT_NAME, size: 10, italic: true };
  signDateCell.alignment = { vertical: "middle", horizontal: "center" };

  const signTitleRow = ws.getRow(signRowIdx + 1);
  signTitleRow.height = 22;
  // Người lập bảng
  ws.mergeCells(`B${signRowIdx + 1}:E${signRowIdx + 1}`);
  const s1 = signTitleRow.getCell(2);
  s1.value = "NGƯỜI LẬP BẢNG";
  s1.font = { name: FONT_NAME, size: 10, bold: true };
  s1.alignment = { vertical: "middle", horizontal: "center" };

  // Kế toán / Chuyên môn
  ws.mergeCells(`G${signRowIdx + 1}:K${signRowIdx + 1}`);
  const s2 = signTitleRow.getCell(7);
  s2.value = "BỘ PHẬN KẾ TOÁN";
  s2.font = { name: FONT_NAME, size: 10, bold: true };
  s2.alignment = { vertical: "middle", horizontal: "center" };

  // Hiệu trưởng
  ws.mergeCells(`M${signRowIdx + 1}:S${signRowIdx + 1}`);
  const s3 = signTitleRow.getCell(13);
  s3.value = "HIỆU TRƯỞNG PHÊ DUYỆT";
  s3.font = { name: FONT_NAME, size: 10, bold: true };
  s3.alignment = { vertical: "middle", horizontal: "center" };

  // Set Column Widths
  const colWidths = [
    6,  // 1. STT
    10, // 2. Mã GV
    22, // 3. Họ tên
    12, // 4. Cấp học
    18, // 5. Tổ bộ môn
    12, // 6. Loại HĐ
    12, // 7. Số ngày dạy
    24, // 8. Danh sách ngày dạy
    15, // 9. Tổng tiết
    14, // 10. Tiết chuyên môn
    16, // 11. Tiết SHL
    13, // 12. Tiết dạy thay
    30, // 13. Chi tiết dạy thay ai
    13, // 14. Tiết vắng
    15, // 15. Đơn giá C1
    15, // 16. Đơn giá C2
    16, // 17. Điều chỉnh
    22, // 18. Tổng lương
    15, // 19. Trạng thái
  ];
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });
}

// ============================================================================
// SHEET 2 & 3: BẢNG CHI TIẾT TIẾT DẠY THEO CẤP HỌC (CHI_TIET_CAP_1, CHI_TIET_CAP_2)
// ============================================================================
export function buildDetailByLevelWorksheet(
  ws: ExcelJS.Worksheet,
  params: {
    schedules: ScheduleWithMeta[];
    level: "PRIMARY" | "SECONDARY";
    selectedMonth: string;
    filterNote?: string;
  }
) {
  const { schedules, level, selectedMonth, filterNote = "" } = params;

  applyPageSetup(ws, "landscape");

  const [yearStr, monthStr] = selectedMonth.split("-");
  const monthText = `Tháng ${monthStr || selectedMonth}/${yearStr || ""}`;
  const levelTitle = level === "PRIMARY" ? "CẤP 1 (TIỂU HỌC)" : "CẤP 2 (THCS)";

  const levelSchedules = schedules
    .filter((s) => s.schoolLevel === level)
    .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate) || a.startPeriodNum - b.startPeriodNum);

  const headers = [
    "STT",
    "Ngày dạy",
    "Thứ",
    "Tiết học",
    "Lớp",
    "Môn học",
    "Giáo viên thực dạy",
    "Giáo viên phân công gốc",
    "Dạy thay ai?",
    "Tổng số tiết",
    "Tiết chuyên môn",
    "Tiết Sinh hoạt lớp",
    "Trạng thái chấm công",
    "Ghi chú / Điều chỉnh",
  ];

  const colCount = headers.length;
  addSheetHeader(
    ws,
    `NHẬT KÝ CHI TIẾT CHẤM CÔNG TIẾT DẠY - ${levelTitle}`,
    monthText,
    filterNote || `Dữ liệu đối soát phân cấp ${levelTitle}`,
    colCount
  );

  // Header row
  const headerRowIdx = 6;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.height = 32;

  headers.forEach((h, idx) => {
    const colNumber = idx + 1;
    const cell = headerRow.getCell(colNumber);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.border = headerBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    if (h === "Tiết Sinh hoạt lớp") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFB45309" }, // Hổ phách nổi bật
      };
    } else if (h === "Dạy thay ai?") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0284C7" }, // Sky 600
      };
    } else {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: level === "PRIMARY" ? "FF0D9488" : "FF4338CA" }, // Teal vs Indigo
      };
    }
  });

  let currentRowIdx = 7;
  let totalPeriodSum = 0;
  let totalAcademicSum = 0;
  let totalHomeroomSum = 0;

  levelSchedules.forEach((item, index) => {
    const row = ws.getRow(currentRowIdx);
    row.height = 22;

    const isSHL = isHomeroomSubject(item.resolvedSubjectName, item.subjectCode, item.subjectId);
    const count = item.periodCountNum || 1;
    const academicPeriods = isSHL ? 0 : count;
    const homeroomPeriods = isSHL ? count : 0;

    totalPeriodSum += count;
    totalAcademicSum += academicPeriods;
    totalHomeroomSum += homeroomPeriods;

    // Xác định dạy thay ai
    let substituteForWho = "—";
    if (item.isSubstituted) {
      substituteForWho = `Dạy thay: ${item.originalTeacherName || item.resolvedTeacherName || "GV vắng"}`;
    }

    const values = [
      index + 1,
      item.formattedDate || item.calculatedDate,
      item.dayName,
      item.periodLabel,
      item.resolvedClassName,
      item.resolvedSubjectName,
      item.effectiveTeacherName,
      item.originalTeacherName || item.resolvedTeacherName || "—",
      substituteForWho,
      count,
      academicPeriods,
      homeroomPeriods,
      statusLabelVi(item.effectiveStatus),
      item.cleanedNote || "—",
    ];

    values.forEach((val, idx) => {
      const cell = row.getCell(idx + 1);
      cell.value = val;
      cell.font = { name: FONT_NAME, size: 9.5 };
      cell.border = thinBorder;

      // Căn lề
      if ([0, 1, 2, 3, 4, 12].includes(idx)) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if ([5, 6, 7, 8, 13].includes(idx)) {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      } else {
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }

      // Tô màu cột Dạy thay ai
      if (idx === 8 && item.isSubstituted) {
        cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: "FF0369A1" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE0F2FE" }, // Sky light
        };
      }

      // Tô màu cột Tiết Sinh hoạt lớp
      if (idx === 11) {
        if (homeroomPeriods > 0) {
          cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: "FFB45309" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEF3C7" }, // Amber light
          };
        }
      }

      // Highlight xen kẽ nhẹ
      if (currentRowIdx % 2 === 0 && idx !== 8 && idx !== 11) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
    });

    currentRowIdx++;
  });

  // Dòng TỔNG CỘNG TIẾT DẠY
  const totalRow = ws.getRow(currentRowIdx);
  totalRow.height = 26;
  ws.mergeCells(`A${currentRowIdx}:I${currentRowIdx}`);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = `TỔNG CỘNG SỐ TIẾT ${levelTitle}`;
  totalLabel.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  totalLabel.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= colCount; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.border = subtotalBorder;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };

    if (c === 10) {
      cell.value = totalPeriodSum;
      cell.alignment = { vertical: "middle", horizontal: "right" };
    } else if (c === 11) {
      cell.value = totalAcademicSum;
      cell.alignment = { vertical: "middle", horizontal: "right" };
    } else if (c === 12) {
      cell.value = totalHomeroomSum;
      cell.alignment = { vertical: "middle", horizontal: "right" };
    }
  }

  // Column widths
  const colWidths = [
    6,  // 1. STT
    13, // 2. Ngày dạy
    11, // 3. Thứ
    13, // 4. Tiết học
    10, // 5. Lớp
    20, // 6. Môn học
    22, // 7. GV thực dạy
    22, // 8. GV gốc
    26, // 9. Dạy thay ai
    13, // 10. Tổng tiết
    15, // 11. Tiết chuyên môn
    17, // 12. Tiết SHL
    18, // 13. Trạng thái
    26, // 14. Ghi chú
  ];
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });
}

// ============================================================================
// SHEET 4: SỔ THEO DÕI DẠY THAY (THEO_DOI_DAY_THAY)
// ============================================================================
export function buildSubstitutionTrackingWorksheet(
  ws: ExcelJS.Worksheet,
  params: {
    schedules: ScheduleWithMeta[];
    selectedMonth: string;
    filterNote?: string;
  }
) {
  const { schedules, selectedMonth, filterNote = "" } = params;

  applyPageSetup(ws, "landscape");

  const [yearStr, monthStr] = selectedMonth.split("-");
  const monthText = `Tháng ${monthStr || selectedMonth}/${yearStr || ""}`;

  const subSchedules = schedules
    .filter((s) => s.isSubstituted)
    .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate) || a.startPeriodNum - b.startPeriodNum);

  const headers = [
    "STT",
    "Ngày dạy",
    "Thứ",
    "Tiết dạy",
    "Cấp học",
    "Lớp",
    "Môn học",
    "Giáo viên thực dạy (Dạy thay)",
    "Dạy thay cho ai (GV vắng/nghỉ)",
    "Số tiết dạy thay",
    "Tiết Sinh hoạt lớp",
    "Trạng thái chấm công",
    "Lý do bàn giao / Ghi chú",
  ];

  const colCount = headers.length;
  addSheetHeader(
    ws,
    "SỔ THEO DÕI & TỔNG HỢP CÔNG TÁC DẠY THAY LIÊN CẤP",
    monthText,
    filterNote || "Thống kê tất cả các buổi dạy thay trong tháng",
    colCount
  );

  // Header row
  const headerRowIdx = 6;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.height = 32;

  headers.forEach((h, idx) => {
    const colNumber = idx + 1;
    const cell = headerRow.getCell(colNumber);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.border = headerBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    if (h === "Dạy thay cho ai (GV vắng/nghỉ)") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDC2626" }, // Đỏ rose nổi bật
      };
    } else if (h === "Tiết Sinh hoạt lớp") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFB45309" }, // Amber
      };
    } else {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0369A1" }, // Sky đậm
      };
    }
  });

  let currentRowIdx = 7;
  let totalSubPeriods = 0;
  let totalShlSubPeriods = 0;

  subSchedules.forEach((item, index) => {
    const row = ws.getRow(currentRowIdx);
    row.height = 22;

    const isSHL = isHomeroomSubject(item.resolvedSubjectName, item.subjectCode, item.subjectId);
    const count = item.periodCountNum || 1;
    totalSubPeriods += count;
    if (isSHL) totalShlSubPeriods += count;

    const values = [
      index + 1,
      item.formattedDate || item.calculatedDate,
      item.dayName,
      item.periodLabel,
      item.schoolLevelLabel,
      item.resolvedClassName,
      item.resolvedSubjectName,
      item.effectiveTeacherName,
      item.originalTeacherName || item.resolvedTeacherName || "—",
      count,
      isSHL ? "Có (Tiết SHL)" : "Không",
      statusLabelVi(item.effectiveStatus),
      item.cleanedNote || "—",
    ];

    values.forEach((val, idx) => {
      const cell = row.getCell(idx + 1);
      cell.value = val;
      cell.font = { name: FONT_NAME, size: 9.5 };
      cell.border = thinBorder;

      if ([0, 1, 2, 3, 4, 5, 9, 10, 11].includes(idx)) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }

      // Tô màu đỏ nhạt cho giáo viên được thay (GV vắng)
      if (idx === 8) {
        cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: "FFB91C1C" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEE2E2" }, // Red light
        };
      }

      // Tô màu vàng cho tiết SHL
      if (idx === 10 && isSHL) {
        cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: "FFB45309" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEF3C7" },
        };
      }

      if (currentRowIdx % 2 === 0 && idx !== 8 && !(idx === 10 && isSHL)) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
    });

    currentRowIdx++;
  });

  // Dòng Tổng kết dạy thay
  const totalRow = ws.getRow(currentRowIdx);
  totalRow.height = 26;
  ws.mergeCells(`A${currentRowIdx}:I${currentRowIdx}`);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = `TỔNG CỘNG: ${subSchedules.length} CA DẠY THAY TRONG THÁNG`;
  totalLabel.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  totalLabel.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= colCount; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.border = subtotalBorder;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };

    if (c === 10) {
      cell.value = totalSubPeriods;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    } else if (c === 11) {
      cell.value = `${totalShlSubPeriods} tiết SHL`;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }

  // Column widths
  const colWidths = [
    6,  // 1. STT
    13, // 2. Ngày dạy
    11, // 3. Thứ
    13, // 4. Tiết dạy
    11, // 5. Cấp học
    10, // 6. Lớp
    20, // 7. Môn học
    22, // 8. GV thực dạy
    24, // 9. Dạy thay cho ai
    14, // 10. Số tiết
    18, // 11. Tiết SHL
    18, // 12. Trạng thái
    28, // 13. Ghi chú
  ];
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });
}

// ============================================================================
// SHEET 5: THỐNG KÊ THEO NGÀY DẠY & CẤP HỌC (THONG_KE_THEO_NGAY)
// ============================================================================
export function buildDailyStatsWorksheet(
  ws: ExcelJS.Worksheet,
  params: {
    schedules: ScheduleWithMeta[];
    selectedMonth: string;
    filterNote?: string;
  }
) {
  const { schedules, selectedMonth, filterNote = "" } = params;

  applyPageSetup(ws, "portrait");

  const [yearStr, monthStr] = selectedMonth.split("-");
  const monthText = `Tháng ${monthStr || selectedMonth}/${yearStr || ""}`;

  // Nhóm theo ngày dạy
  const dateMap = new Map<
    string,
    {
      formattedDate: string;
      dayName: string;
      primaryPeriods: number;
      secondaryPeriods: number;
      academicPeriods: number;
      homeroomPeriods: number;
      substitutePeriods: number;
      teachers: Set<string>;
    }
  >();

  for (const s of schedules) {
    if (!s.calculatedDate) continue;
    const existing = dateMap.get(s.calculatedDate) || {
      formattedDate: s.formattedDate || s.calculatedDate,
      dayName: s.dayName || "",
      primaryPeriods: 0,
      secondaryPeriods: 0,
      academicPeriods: 0,
      homeroomPeriods: 0,
      substitutePeriods: 0,
      teachers: new Set<string>(),
    };

    const count = s.periodCountNum || 1;
    if (s.schoolLevel === "PRIMARY") existing.primaryPeriods += count;
    else existing.secondaryPeriods += count;

    const isSHL = isHomeroomSubject(s.resolvedSubjectName, s.subjectCode, s.subjectId);
    if (isSHL) existing.homeroomPeriods += count;
    else existing.academicPeriods += count;

    if (s.isSubstituted) existing.substitutePeriods += count;
    if (s.effectiveTeacherName) existing.teachers.add(s.effectiveTeacherName);

    dateMap.set(s.calculatedDate, existing);
  }

  const sortedDates = Array.from(dateMap.keys()).sort();

  const headers = [
    "STT",
    "Ngày dạy",
    "Thứ",
    "Tổng số tiết",
    "Tiết Cấp 1",
    "Tiết Cấp 2",
    "Tiết chuyên môn",
    "Tiết Sinh hoạt lớp",
    "Tiết dạy thay",
    "Số GV giảng dạy",
  ];

  const colCount = headers.length;
  addSheetHeader(
    ws,
    "BẢNG THỐNG KÊ TIẾT DẠY THEO TỪNG NGÀY & CẤP HỌC",
    monthText,
    filterNote || "Thống kê tổng hợp mật độ tiết dạy theo từng ngày",
    colCount
  );

  // Header row
  const headerRowIdx = 6;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.height = 30;

  headers.forEach((h, idx) => {
    const colNumber = idx + 1;
    const cell = headerRow.getCell(colNumber);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.border = headerBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    if (h === "Tiết Sinh hoạt lớp") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFB45309" },
      };
    } else {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" }, // Slate 800
      };
    }
  });

  let currentRowIdx = 7;
  let sumTotal = 0;
  let sumP1 = 0;
  let sumP2 = 0;
  let sumAca = 0;
  let sumShl = 0;
  let sumSub = 0;

  sortedDates.forEach((dateStr, idx) => {
    const data = dateMap.get(dateStr)!;
    const totalDayPeriods = data.primaryPeriods + data.secondaryPeriods;

    sumTotal += totalDayPeriods;
    sumP1 += data.primaryPeriods;
    sumP2 += data.secondaryPeriods;
    sumAca += data.academicPeriods;
    sumShl += data.homeroomPeriods;
    sumSub += data.substitutePeriods;

    const row = ws.getRow(currentRowIdx);
    row.height = 22;

    const values = [
      idx + 1,
      data.formattedDate,
      data.dayName,
      totalDayPeriods,
      data.primaryPeriods,
      data.secondaryPeriods,
      data.academicPeriods,
      data.homeroomPeriods,
      data.substitutePeriods,
      data.teachers.size,
    ];

    values.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: FONT_NAME, size: 9.5 };
      cell.border = thinBorder;

      if ([0, 1, 2].includes(cIdx)) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else {
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }

      if (cIdx === 7 && data.homeroomPeriods > 0) {
        cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: "FFB45309" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEF3C7" },
        };
      }

      if (currentRowIdx % 2 === 0 && !(cIdx === 7 && data.homeroomPeriods > 0)) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
    });

    currentRowIdx++;
  });

  // Dòng Tổng kết tháng
  const totalRow = ws.getRow(currentRowIdx);
  totalRow.height = 26;
  ws.mergeCells(`A${currentRowIdx}:C${currentRowIdx}`);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = "TỔNG CỘNG CẢ THÁNG";
  totalLabel.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  totalLabel.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= colCount; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.border = subtotalBorder;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };

    if (c === 4) cell.value = sumTotal;
    else if (c === 5) cell.value = sumP1;
    else if (c === 6) cell.value = sumP2;
    else if (c === 7) cell.value = sumAca;
    else if (c === 8) cell.value = sumShl;
    else if (c === 9) cell.value = sumSub;
    else if (c === 10) cell.value = "—";

    if (c >= 4 && c <= 9) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
    }
  }

  // Column widths
  const colWidths = [
    6,  // 1. STT
    14, // 2. Ngày dạy
    12, // 3. Thứ
    14, // 4. Tổng số tiết
    13, // 5. Tiết Cấp 1
    13, // 6. Tiết Cấp 2
    16, // 7. Tiết chuyên môn
    18, // 8. Tiết SHL
    14, // 9. Tiết dạy thay
    16, // 10. Số GV
  ];
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });
}

// ============================================================================
// MAIN EXPORT FUNCTION: TẠO WORKBOOK VÀ TẢI FILE EXCEL (.XLSX)
// ============================================================================
export interface ExportPayrollExcelOptions {
  selectedMonth: string;
  summaryRows: TeacherPayrollSummaryRow[];
  schedules: ScheduleWithMeta[];
  schoolLevelFilter?: TeachingLevel | "ALL";
  departmentName?: string;
  teacherTypeName?: string;
  searchKeyword?: string;
}

export async function exportPayrollAttendanceExcel(options: ExportPayrollExcelOptions): Promise<string> {
  const {
    selectedMonth,
    summaryRows,
    schedules,
    schoolLevelFilter = "ALL",
    departmentName,
    teacherTypeName,
    searchKeyword,
  } = options;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hệ thống Quản lý Giáo viên & Chấm công";
  wb.lastModifiedBy = "Ban Giám Hiệu";
  wb.created = new Date();
  wb.modified = new Date();

  // Mô tả các tiêu chí lọc đang áp dụng
  const filterParts: string[] = [];
  if (schoolLevelFilter !== "ALL") {
    filterParts.push(
      schoolLevelFilter === "PRIMARY"
        ? "Cấp 1"
        : schoolLevelFilter === "SECONDARY"
          ? "Cấp 2"
          : "Cả 2 cấp"
    );
  }
  if (departmentName && departmentName !== "all") filterParts.push(`Tổ: ${departmentName}`);
  if (teacherTypeName && teacherTypeName !== "all") filterParts.push(`HĐ: ${teacherTypeName}`);
  if (searchKeyword) filterParts.push(`Tìm: "${searchKeyword}"`);
  const filterNote = filterParts.length > 0 ? filterParts.join(" · ") : "Toàn trường (Không lọc)";

  // 1. Sheet Tổng hợp Giáo viên & Cấp học
  const ws1 = wb.addWorksheet("TONG_HOP_GIAO_VIEN", {
    properties: { tabColor: { argb: "FF1E3A8A" } },
  });
  buildTeacherSummaryWorksheet(ws1, {
    summaryRows,
    schedules,
    selectedMonth,
    filterNote,
  });

  // 2. Sheet Chi tiết Cấp 1 (Tiểu học)
  const hasPrimarySchedules = schedules.some((s) => s.schoolLevel === "PRIMARY");
  if (hasPrimarySchedules || schoolLevelFilter === "ALL" || schoolLevelFilter === "PRIMARY") {
    const ws2 = wb.addWorksheet("CHI_TIET_CAP_1", {
      properties: { tabColor: { argb: "FF0D9488" } },
    });
    buildDetailByLevelWorksheet(ws2, {
      schedules,
      level: "PRIMARY",
      selectedMonth,
      filterNote,
    });
  }

  // 3. Sheet Chi tiết Cấp 2 (THCS)
  const hasSecondarySchedules = schedules.some((s) => s.schoolLevel === "SECONDARY");
  if (hasSecondarySchedules || schoolLevelFilter === "ALL" || schoolLevelFilter === "SECONDARY") {
    const ws3 = wb.addWorksheet("CHI_TIET_CAP_2", {
      properties: { tabColor: { argb: "FF4338CA" } },
    });
    buildDetailByLevelWorksheet(ws3, {
      schedules,
      level: "SECONDARY",
      selectedMonth,
      filterNote,
    });
  }

  // 4. Sheet Sổ theo dõi Dạy thay
  const hasSubstitutions = schedules.some((s) => s.isSubstituted);
  if (hasSubstitutions) {
    const ws4 = wb.addWorksheet("THEO_DOI_DAY_THAY", {
      properties: { tabColor: { argb: "FFDC2626" } },
    });
    buildSubstitutionTrackingWorksheet(ws4, {
      schedules,
      selectedMonth,
      filterNote,
    });
  }

  // 5. Sheet Thống kê theo ngày
  const ws5 = wb.addWorksheet("THONG_KE_THEO_NGAY", {
    properties: { tabColor: { argb: "FF1E293B" } },
  });
  buildDailyStatsWorksheet(ws5, {
    schedules,
    selectedMonth,
    filterNote,
  });

  const fileName = `Bao_Cao_Cham_Cong_Tiet_Day_Thang_${selectedMonth}.xlsx`;
  await downloadWorkbook(wb, fileName);
  return fileName;
}
