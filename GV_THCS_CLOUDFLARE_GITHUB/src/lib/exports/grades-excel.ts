import ExcelJS from "exceljs";

export type StudentTemplateRow = {
  studentCode: string;
  fullName: string;
};

export type SubjectColumn = {
  id: string;
  code: string;
  name: string;
};

const FONT_NAME = "Times New Roman";
const DEFAULT_SCHOOL_NAME = "TRƯỜNG THCS TAM HÀ";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

const headerBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF0F172A" } },
  left: { style: "thin", color: { argb: "FF0F172A" } },
  bottom: { style: "medium", color: { argb: "FF0F172A" } },
  right: { style: "thin", color: { argb: "FF0F172A" } },
};

async function triggerDownload(wb: ExcelJS.Workbook, fileName: string) {
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
 * Tải file Excel mẫu nhập điểm theo Lớp:
 * - Bố cục chuẩn sư phạm, tiêu đề trang nhã, màu sắc Navy Blue chuyên nghiệp.
 * - Chỉ gồm các môn học thuộc đúng khối lớp được chọn.
 * - Điền sẵn STT, Mã HS, Họ và tên từ danh sách học sinh của lớp.
 */
export async function downloadClassGradeTemplate(params: {
  className: string;
  periodName: string;
  schoolYearName?: string;
  students: StudentTemplateRow[];
  subjects: SubjectColumn[];
}) {
  const { className, periodName, schoolYearName, students, subjects } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hệ Thống Quản Lý Giáo Viên";
  wb.created = new Date();

  const ws = wb.addWorksheet("Bang_Diem", {
    views: [{ showGridLines: true }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const totalCols = 3 + subjects.length;

  // Dòng 1: Tên đơn vị trường học
  const r1 = ws.addRow([DEFAULT_SCHOOL_NAME]);
  r1.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF1E3A8A" } };
  r1.height = 20;

  // Dòng 2: Tiêu đề bảng điểm
  const r2 = ws.addRow(["BẢNG GHI ĐIỂM KIỂM TRA ĐỊNH KỲ"]);
  r2.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: "FF0F172A" } };
  r2.alignment = { horizontal: "center", vertical: "middle" };
  r2.height = 28;
  ws.mergeCells(2, 1, 2, totalCols);

  // Dòng 3: Thông tin chi tiết lớp & đợt điểm
  const subtitle = `Lớp: ${className}   |   Đợt đánh giá: ${periodName}${schoolYearName ? `   |   Năm học: ${schoolYearName}` : ""}`;
  const r3 = ws.addRow([subtitle]);
  r3.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: "FF475569" } };
  r3.alignment = { horizontal: "center", vertical: "middle" };
  r3.height = 20;
  ws.mergeCells(3, 1, 3, totalCols);

  // Dòng 4: Khoảng cách
  const r4 = ws.addRow([]);
  r4.height = 8;

  // Dòng 5: Hàng tiêu đề cột
  const headerValues = ["STT", "Mã học sinh", "Họ và tên", ...subjects.map((s) => s.name)];
  const headerRow = ws.addRow(headerValues);
  headerRow.height = 30;

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" }, // Navy Blue sang trọng
    };
    cell.alignment = {
      horizontal: colNumber === 3 ? "left" : "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = headerBorder;
  });

  // Thiết lập độ rộng cột
  ws.getColumn(1).width = 7;   // STT
  ws.getColumn(2).width = 15;  // Mã HS
  ws.getColumn(3).width = 26;  // Họ và tên
  subjects.forEach((_, idx) => {
    ws.getColumn(4 + idx).width = 15; // Mỗi môn học
  });

  // Dòng dữ liệu học sinh
  const studentList = students.length > 0
    ? students
    : [
        { studentCode: "HS6101", fullName: "Nguyễn Văn An" },
        { studentCode: "HS6102", fullName: "Trần Thị Bình" },
      ];

  studentList.forEach((st, idx) => {
    const isEven = idx % 2 === 0;
    const rowValues = [idx + 1, st.studentCode, st.fullName, ...subjects.map(() => "")];
    const dataRow = ws.addRow(rowValues);
    dataRow.height = 23;

    dataRow.eachCell((cell, colNumber) => {
      cell.font = {
        name: FONT_NAME,
        size: 11,
        bold: colNumber === 2, // Mã HS in đậm nhẹ
        color: { argb: "FF1E293B" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFFFFFFF" : "FFF8FAFC" }, // Zebra striping
      };
      cell.alignment = {
        horizontal: colNumber === 3 ? "left" : "center",
        vertical: "middle",
      };
      cell.border = thinBorder;

      // Cột điểm số format kiểu số thập phân nếu nhập số
      if (colNumber > 3) {
        cell.numFmt = "0.0";
      }
    });
  });

  // Dòng hướng dẫn / ghi chú dưới cùng
  const emptyRow = ws.addRow([]);
  emptyRow.height = 10;

  const noteRow = ws.addRow([
    "* HƯỚNG DẪN: Nhập điểm số từ 0.0 đến 10.0 (chấp nhận 1 chữ số thập phân). Đối với các môn đánh giá bằng nhận xét, nhập 'Đ' (Đạt) hoặc 'CĐ' (Chưa đạt). Không tự ý thay đổi cột 'Mã học sinh'.",
  ]);
  noteRow.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: "FF64748B" } };
  noteRow.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(noteRow.number, 1, noteRow.number, totalCols);

  const sanitizedPeriod = periodName.replace(/[/\\?%*:|"<>]/g, "_");
  const sanitizedClass = className.replace(/[/\\?%*:|"<>]/g, "_");
  await triggerDownload(wb, `Mau_Nhap_Diem_${sanitizedClass}_${sanitizedPeriod}.xlsx`);
}

export type WeakStudentExportRow = {
  stt: number;
  studentCode: string;
  fullName: string;
  className: string;
  weakSubjectsText: string;
  parentPhone?: string;
  parentName?: string;
  statusText: string;
};

/**
 * Xuất danh sách học sinh có môn yếu dành cho GVCN & BGH theo dõi
 */
export async function exportHomeroomWeakStudentsExcel(params: {
  className: string;
  periodName: string;
  schoolYearName?: string;
  rows: WeakStudentExportRow[];
}) {
  const { className, periodName, schoolYearName, rows } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hệ Thống Quản Lý Giáo Viên";

  const ws = wb.addWorksheet("Hoc_Sinh_Can_Nhac_Nho", {
    views: [{ showGridLines: true }],
  });

  // Header Banner
  ws.addRow([DEFAULT_SCHOOL_NAME]).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FFB91C1C" } };
  const r2 = ws.addRow(["DANH SÁCH HỌC SINH CÓ MÔN YẾU CẦN NHẮC NHỞ & PHỐI HỢP PHỤ HUYNH"]);
  r2.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: "FF991B1B" } };
  r2.alignment = { horizontal: "center", vertical: "middle" };
  r2.height = 26;
  ws.mergeCells(2, 1, 2, 7);

  const r3 = ws.addRow([`Lớp: ${className}   |   Đợt: ${periodName}${schoolYearName ? `   |   Năm học: ${schoolYearName}` : ""}`]);
  r3.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: "FF475569" } };
  r3.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(3, 1, 3, 7);

  ws.addRow([]).height = 8;

  // Table header
  const header = ws.addRow(["STT", "Mã HS", "Họ và tên", "Các môn điểm yếu (< 5.0)", "SĐT Phụ huynh", "Tên Phụ huynh", "Trạng thái nhắc nhở"]);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF991B1B" } }; // Đỏ cảnh báo nổi bật
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = headerBorder;
  });

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 24;
  ws.getColumn(4).width = 34;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 20;
  ws.getColumn(7).width = 22;

  rows.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    const row = ws.addRow([
      r.stt,
      r.studentCode,
      r.fullName,
      r.weakSubjectsText,
      r.parentPhone || "-",
      r.parentName || "-",
      r.statusText,
    ]);
    row.height = 24;

    row.eachCell((cell, col) => {
      cell.font = { name: FONT_NAME, size: 11, color: { argb: "FF1E293B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? "FFFFFFFF" : "FFFDF2F2" } };
      cell.alignment = {
        horizontal: col === 3 || col === 4 || col === 6 ? "left" : "center",
        vertical: "middle",
      };
      cell.border = thinBorder;

      if (col === 4) {
        cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FFB91C1C" } };
      }
    });
  });

  const sanitizedPeriod = periodName.replace(/[/\\?%*:|"<>]/g, "_");
  const sanitizedClass = className.replace(/[/\\?%*:|"<>]/g, "_");
  await triggerDownload(wb, `Danh_Sach_Hoc_Sinh_Yeu_${sanitizedClass}_${sanitizedPeriod}.xlsx`);
}

export type MatrixExportRow = {
  stt: number;
  studentCode: string;
  fullName: string;
  scores: Record<string, number | string>;
  averageScore?: number | null;
  weakCount: number;
};

/**
 * Xuất sổ điểm tổng hợp ma trận cả lớp
 */
export async function exportClassGradeMatrixExcel(params: {
  className: string;
  periodName: string;
  schoolYearName?: string;
  subjects: SubjectColumn[];
  rows: MatrixExportRow[];
}) {
  const { className, periodName, schoolYearName, subjects, rows } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hệ Thống Quản Lý Giáo Viên";

  const ws = wb.addWorksheet("So_Diem_Tong_Hop", {
    views: [{ showGridLines: true }],
  });

  const totalCols = 5 + subjects.length;

  ws.addRow([DEFAULT_SCHOOL_NAME]).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF1E3A8A" } };
  const r2 = ws.addRow(["SỔ ĐIỂM TỔNG HỢP CÁC MÔN HỌC"]);
  r2.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: "FF0F172A" } };
  r2.alignment = { horizontal: "center", vertical: "middle" };
  r2.height = 28;
  ws.mergeCells(2, 1, 2, totalCols);

  const r3 = ws.addRow([`Lớp: ${className}   |   Đợt kiểm tra: ${periodName}${schoolYearName ? `   |   Năm học: ${schoolYearName}` : ""}`]);
  r3.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: "FF475569" } };
  r3.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(3, 1, 3, totalCols);

  ws.addRow([]).height = 8;

  const header = ws.addRow(["STT", "Mã HS", "Họ và tên", ...subjects.map((s) => s.name), "Điểm TB", "Số môn yếu"]);
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = headerBorder;
  });

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 24;
  subjects.forEach((_, i) => {
    ws.getColumn(4 + i).width = 14;
  });
  ws.getColumn(4 + subjects.length).width = 13;
  ws.getColumn(5 + subjects.length).width = 13;

  rows.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    const scoresList = subjects.map((s) => (r.scores[s.id] !== undefined ? r.scores[s.id] : ""));
    const avgText = r.averageScore !== null && r.averageScore !== undefined ? r.averageScore : "";

    const row = ws.addRow([r.stt, r.studentCode, r.fullName, ...scoresList, avgText, r.weakCount]);
    row.height = 23;

    row.eachCell((cell, col) => {
      cell.font = { name: FONT_NAME, size: 11, color: { argb: "FF1E293B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? "FFFFFFFF" : "FFF8FAFC" } };
      cell.alignment = {
        horizontal: col === 3 ? "left" : "center",
        vertical: "middle",
      };
      cell.border = thinBorder;

      // Highlight điểm yếu bằng màu đỏ
      if (col > 3 && col <= 3 + subjects.length) {
        const val = Number(cell.value);
        if (!isNaN(val) && val < 5.0) {
          cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FFDC2626" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }; // Đỏ nhạt
        }
      }

      // Cột số môn yếu
      if (col === 5 + subjects.length && r.weakCount > 0) {
        cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FFDC2626" } };
      }
    });
  });

  const sanitizedPeriod = periodName.replace(/[/\\?%*:|"<>]/g, "_");
  const sanitizedClass = className.replace(/[/\\?%*:|"<>]/g, "_");
  await triggerDownload(wb, `So_Diem_${sanitizedClass}_${sanitizedPeriod}.xlsx`);
}
