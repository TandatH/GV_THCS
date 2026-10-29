import ExcelJS from "exceljs";
import type {
  ExamRoom,
  ExamSession,
  ExamSlot,
  ExamStudentAssignment,
  ExamSubject,
  ExamSupervisorAssignment,
} from "@school/shared";

const FONT_NAME = "Times New Roman";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF333333" } },
  left: { style: "thin", color: { argb: "FF333333" } },
  bottom: { style: "thin", color: { argb: "FF333333" } },
  right: { style: "thin", color: { argb: "FF333333" } },
};

const doubleBottomBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF333333" } },
  left: { style: "thin", color: { argb: "FF333333" } },
  bottom: { style: "double", color: { argb: "FF333333" } },
  right: { style: "thin", color: { argb: "FF333333" } },
};

async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string) {
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
 * Xây dựng nội dung và định dạng cho 1 Sheet Danh sách thí sinh & ký nộp bài theo phòng thi
 */
export function buildRoomRosterWorksheet(
  ws: ExcelJS.Worksheet,
  params: {
    session: ExamSession;
    room: ExamRoom;
    subjectName: string;
    slotInfo?: { date: string; shiftNumber: number; startTime: string; endTime: string };
    students: ExamStudentAssignment[];
    supervisorsText: string;
  }
) {
  const { session, room, subjectName, slotInfo, students, supervisorsText } = params;

  // Cấu hình in ấn chuẩn khổ A4 dọc để dán bảng tin / cửa phòng thi
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
    showGridLines: true,
  };

  // Cài đặt độ rộng cột (Tổng cộng vừa khít khổ in A4)
  ws.columns = [
    { key: "stt", width: 6 },
    { key: "sbd", width: 15 },
    { key: "maHs", width: 13 },
    { key: "hoTen", width: 26 },
    { key: "lop", width: 10 },
    { key: "soBan", width: 10 },
    { key: "soTo", width: 9 },
    { key: "chuKy", width: 16 },
    { key: "ghiChu", width: 15 },
  ];

  // Dòng 1: Tiêu đề cơ quan & Quốc hiệu
  const r1 = ws.addRow([
    "TRƯỜNG TRUNG HỌC CƠ SỞ",
    "",
    "",
    "",
    "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    "",
    "",
    "",
    "",
  ]);
  r1.height = 20;
  ws.mergeCells("A1:D1");
  ws.mergeCells("E1:I1");
  const cA1 = ws.getCell("A1");
  cA1.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: "FF0F172A" } };
  cA1.alignment = { vertical: "middle", horizontal: "center" };
  const cE1 = ws.getCell("E1");
  cE1.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: "FF0F172A" } };
  cE1.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng 2: Hội đồng & Tiêu ngữ
  const r2 = ws.addRow([
    "HỘI ĐỒNG COI KIỂM TRA ĐỊNH KỲ",
    "",
    "",
    "",
    "Độc lập - Tự do - Hạnh phúc",
    "",
    "",
    "",
    "",
  ]);
  r2.height = 18;
  ws.mergeCells("A2:D2");
  ws.mergeCells("E2:I2");
  const cA2 = ws.getCell("A2");
  cA2.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: "FF334155" } };
  cA2.alignment = { vertical: "middle", horizontal: "center" };
  const cE2 = ws.getCell("E2");
  cE2.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FF0F172A" } };
  cE2.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng 3: Khoảng cách
  const r3 = ws.addRow([]);
  r3.height = 6;

  // Dòng 4: Tiêu đề chính
  const r4 = ws.addRow([
    "DANH SÁCH THÍ SINH PHÒNG THI & KÝ NỘP BÀI",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  r4.height = 26;
  ws.mergeCells("A4:I4");
  const cA4 = ws.getCell("A4");
  cA4.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: "FF0F172A" } };
  cA4.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng 5: Tên đợt kiểm tra
  const r5 = ws.addRow([
    `Đợt kiểm tra: ${session.name.toUpperCase()}`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  r5.height = 20;
  ws.mergeCells("A5:I5");
  const cA5 = ws.getCell("A5");
  cA5.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF1E3A8A" } };
  cA5.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng 6: Thông tin Phòng thi & Môn thi
  const r6 = ws.addRow([
    `Phòng thi: ${room.roomCode} (${room.physicalRoomName || "Phòng học"})`,
    "",
    "",
    "",
    `Môn thi: ${subjectName} — Khối ${room.gradeLevel}`,
    "",
    "",
    "",
    "",
  ]);
  r6.height = 20;
  ws.mergeCells("A6:D6");
  ws.mergeCells("E6:I6");
  const cA6 = ws.getCell("A6");
  cA6.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
  cA6.alignment = { vertical: "middle", horizontal: "left" };
  const cE6 = ws.getCell("E6");
  cE6.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
  cE6.alignment = { vertical: "middle", horizontal: "left" };

  // Dòng 7: Thời gian & Tổng số thí sinh
  const slotDateText = slotInfo?.date ? `Ngày thi: ${slotInfo.date}` : "Ngày thi: —";
  const slotTimeText = slotInfo?.startTime
    ? `(Ca ${slotInfo.shiftNumber || 1}: ${slotInfo.startTime} – ${slotInfo.endTime})`
    : "";
  const r7 = ws.addRow([
    `${slotDateText} ${slotTimeText}`,
    "",
    "",
    "",
    `Tổng số thí sinh: ${students.length} học sinh`,
    "",
    "",
    "",
    "",
  ]);
  r7.height = 20;
  ws.mergeCells("A7:D7");
  ws.mergeCells("E7:I7");
  const cA7 = ws.getCell("A7");
  cA7.font = { name: FONT_NAME, size: 10.5, color: { argb: "FF334155" } };
  cA7.alignment = { vertical: "middle", horizontal: "left" };
  const cE7 = ws.getCell("E7");
  cE7.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: "FF0F172A" } };
  cE7.alignment = { vertical: "middle", horizontal: "left" };

  // Dòng 8: Giám thị
  const r8 = ws.addRow([
    `Cán bộ coi thi: ${supervisorsText || "Chưa phân công"}`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  r8.height = 20;
  ws.mergeCells("A8:I8");
  const cA8 = ws.getCell("A8");
  cA8.font = { name: FONT_NAME, size: 10.5, italic: true, color: { argb: "FF334155" } };
  cA8.alignment = { vertical: "middle", horizontal: "left" };

  // Dòng 9: Khoảng trống trước bảng
  const r9 = ws.addRow([]);
  r9.height = 8;

  // Dòng 10: Tiêu đề cột (Headers)
  const headers = [
    "STT",
    "SỐ BÁO DANH",
    "MÃ HỌC SINH",
    "HỌ VÀ TÊN THÍ SINH",
    "LỚP",
    "SỐ BÀN",
    "SỐ TỜ",
    "CHỮ KÝ THÍ SINH",
    "GHI CHÚ",
  ];
  const r10 = ws.addRow(headers);
  r10.height = 28;
  for (let c = 1; c <= headers.length; c++) {
    const cell = r10.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }

  // Dữ liệu học sinh
  const sortedStudents = [...students].sort(
    (a, b) => (a.deskNumber || 0) - (b.deskNumber || 0) || a.candidateNumber.localeCompare(b.candidateNumber)
  );

  sortedStudents.forEach((st, idx) => {
    let note = "";
    if (st.attendance === "absent_with_reason") note = "Vắng có phép";
    else if (st.attendance === "absent_without_reason") note = "Vắng K.phép";
    else if (st.note) note = st.note;

    const rowValues = [
      idx + 1,
      st.candidateNumber,
      st.studentCode || "—",
      st.studentName,
      st.className,
      st.deskNumber ?? idx + 1,
      "", // Số tờ giấy thi để trống khi in ra học sinh tự điền
      "", // Chữ ký thí sinh
      note,
    ];

    const dataRow = ws.addRow(rowValues);
    dataRow.height = 24; // Chiều cao rộng rãi, dễ ký tên và đọc rõ từ xa khi dán cửa phòng
    const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";

    for (let c = 1; c <= 9; c++) {
      const cell = dataRow.getCell(c);
      const isBold = c === 2 || c === 6; // SBD (cột 2) và Số bàn (cột 6) in đậm to rõ
      cell.font = {
        name: FONT_NAME,
        size: c === 2 ? 11.5 : 10.5,
        bold: isBold,
        color: { argb: "FF0F172A" },
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = thinBorder;

      // Căn lề
      let align: ExcelJS.Alignment["horizontal"] = "center";
      if (c === 4) align = "left"; // Họ tên
      if (c === 9) align = "left"; // Ghi chú

      cell.alignment = {
        vertical: "middle",
        horizontal: align,
        wrapText: c === 4 || c === 9,
      };
    }
  });

  // Chân bảng: Thống kê & Chữ ký
  const rBlank1 = ws.addRow([]);
  rBlank1.height = 10;

  const statRowIndex = ws.rowCount + 1;
  const rStats = ws.addRow([
    `* Thống kê phòng thi: Có mặt: ..... / ${students.length} ; Vắng: ..... (Có phép: ..... , K.phép: .....) ; Số bài thi: ..... bài ; Số tờ giấy thi: ..... tờ.`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  rStats.height = 20;
  ws.mergeCells(`A${statRowIndex}:I${statRowIndex}`);
  const cStats = ws.getCell(`A${statRowIndex}`);
  cStats.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: "FF334155" } };
  cStats.alignment = { vertical: "middle", horizontal: "left" };

  const rBlank2 = ws.addRow([]);
  rBlank2.height = 10;

  // Dòng Ngày tháng năm
  const dateRowIndex = ws.rowCount + 1;
  const rDate = ws.addRow(["", "", "", "", "", "", "Ngày ..... tháng ..... năm 20....", "", ""]);
  rDate.height = 20;
  ws.mergeCells(`G${dateRowIndex}:I${dateRowIndex}`);
  const cDate = ws.getCell(`G${dateRowIndex}`);
  cDate.font = { name: FONT_NAME, size: 10.5, italic: true, color: { argb: "FF0F172A" } };
  cDate.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng chức danh ký tên
  const signRowIndex = ws.rowCount + 1;
  const rSign = ws.addRow([
    "",
    "CÁN BỘ COI THI 1",
    "",
    "",
    "CÁN BỘ COI THI 2",
    "",
    "THƯ KÝ / CHỦ TỊCH HỘI ĐỒNG",
    "",
    "",
  ]);
  rSign.height = 22;
  ws.mergeCells(`B${signRowIndex}:D${signRowIndex}`);
  ws.mergeCells(`E${signRowIndex}:F${signRowIndex}`);
  ws.mergeCells(`G${signRowIndex}:I${signRowIndex}`);

  const cSign1 = ws.getCell(`B${signRowIndex}`);
  cSign1.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
  cSign1.alignment = { vertical: "middle", horizontal: "center" };

  const cSign2 = ws.getCell(`E${signRowIndex}`);
  cSign2.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
  cSign2.alignment = { vertical: "middle", horizontal: "center" };

  const cSign3 = ws.getCell(`G${signRowIndex}`);
  cSign3.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
  cSign3.alignment = { vertical: "middle", horizontal: "center" };

  // Dòng "(Ký và ghi rõ họ tên)"
  const subSignRowIndex = ws.rowCount + 1;
  const rSubSign = ws.addRow([
    "",
    "(Ký và ghi rõ họ tên)",
    "",
    "",
    "(Ký và ghi rõ họ tên)",
    "",
    "(Ký và ghi rõ họ tên)",
    "",
    "",
  ]);
  rSubSign.height = 18;
  ws.mergeCells(`B${subSignRowIndex}:D${subSignRowIndex}`);
  ws.mergeCells(`E${subSignRowIndex}:F${subSignRowIndex}`);
  ws.mergeCells(`G${subSignRowIndex}:I${subSignRowIndex}`);

  const cSub1 = ws.getCell(`B${subSignRowIndex}`);
  cSub1.font = { name: FONT_NAME, size: 9.5, italic: true, color: { argb: "FF64748B" } };
  cSub1.alignment = { vertical: "middle", horizontal: "center" };

  const cSub2 = ws.getCell(`E${subSignRowIndex}`);
  cSub2.font = { name: FONT_NAME, size: 9.5, italic: true, color: { argb: "FF64748B" } };
  cSub2.alignment = { vertical: "middle", horizontal: "center" };

  const cSub3 = ws.getCell(`G${subSignRowIndex}`);
  cSub3.font = { name: FONT_NAME, size: 9.5, italic: true, color: { argb: "FF64748B" } };
  cSub3.alignment = { vertical: "middle", horizontal: "center" };

  // Khoảng trống ký tên
  const rBlankSign = ws.addRow([]);
  rBlankSign.height = 45;
}

/**
 * 1. Xuất file Bảng Tổng Hợp Lịch Thi & Phân Công Giám Thị Toàn Trường
 */
export async function exportExamMasterScheduleExcel(params: {
  session: ExamSession;
  slots: ExamSlot[];
  subjects: ExamSubject[];
  rooms: ExamRoom[];
  supervisors: ExamSupervisorAssignment[];
}) {
  const { session, slots, subjects, rooms, supervisors } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Phần mềm Quản lý Giáo viên & Khảo thí THCS";
  wb.lastModifiedBy = "Admin";
  wb.created = new Date();
  wb.modified = new Date();

  // --- SHEET 1: LỊCH THI THEO CA & MÔN ---
  const wsSchedule = wb.addWorksheet("Lich_Thi_Tong_Hop");
  wsSchedule.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    showGridLines: true,
  };

  wsSchedule.columns = [
    { key: "stt", width: 7 },
    { key: "ngay", width: 14 },
    { key: "ca", width: 10 },
    { key: "gio", width: 18 },
    { key: "thoiluong", width: 14 },
    { key: "khoi", width: 10 },
    { key: "mon", width: 26 },
    { key: "hinhthuc", width: 24 },
    { key: "sophong", width: 12 },
  ];

  // Header cơ quan
  const sR1 = wsSchedule.addRow(["TRƯỜNG TRUNG HỌC CƠ SỞ", "", "", "", "", "", "", "", ""]);
  sR1.height = 20;
  wsSchedule.mergeCells("A1:D1");
  const sCA1 = wsSchedule.getCell("A1");
  sCA1.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
  sCA1.alignment = { vertical: "middle", horizontal: "left" };

  // Tiêu đề chính
  const sR2 = wsSchedule.addRow(["BẢNG TỔNG HỢP LỊCH KIỂM TRA ĐỊNH KỲ", "", "", "", "", "", "", "", ""]);
  sR2.height = 26;
  wsSchedule.mergeCells("A2:I2");
  const sCA2 = wsSchedule.getCell("A2");
  sCA2.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: "FF0F172A" } };
  sCA2.alignment = { vertical: "middle", horizontal: "center" };

  // Phụ đề
  const sR3 = wsSchedule.addRow([
    `Đợt: ${session.name.toUpperCase()} (Thời gian: từ ${session.startDate} đến ${session.endDate})`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  sR3.height = 20;
  wsSchedule.mergeCells("A3:I3");
  const sCA3 = wsSchedule.getCell("A3");
  sCA3.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: "FF1E3A8A" } };
  sCA3.alignment = { vertical: "middle", horizontal: "center" };

  wsSchedule.addRow([]).height = 6;

  // Header bảng
  const sHeaders = [
    "STT",
    "NGÀY THI",
    "CA THI",
    "KHUNG GIỜ",
    "THỜI LƯỢNG",
    "KHỐI",
    "MÔN THI",
    "HÌNH THỨC",
    "SỐ PHÒNG",
  ];
  const sHeaderRow = wsSchedule.addRow(sHeaders);
  sHeaderRow.height = 28;
  for (let c = 1; c <= sHeaders.length; c++) {
    const cell = sHeaderRow.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }

  let stt = 1;
  const sortedSlots = [...slots].sort((a, b) => a.date.localeCompare(b.date) || a.shiftNumber - b.shiftNumber);

  sortedSlots.forEach((slot) => {
    const slotSubjects = subjects.filter((sub) => sub.slotId === slot.id);
    if (slotSubjects.length === 0) {
      const row = wsSchedule.addRow([
        stt++,
        slot.date,
        `Ca ${slot.shiftNumber}`,
        `${slot.startTime} – ${slot.endTime}`,
        `${slot.durationMinutes} phút`,
        "—",
        "Chưa gán môn thi",
        "—",
        0,
      ]);
      row.height = 24;
      for (let c = 1; c <= 9; c++) {
        const cell = row.getCell(c);
        cell.font = { name: FONT_NAME, size: 10.5, color: { argb: "FF64748B" } };
        cell.border = thinBorder;
        cell.alignment = { vertical: "middle", horizontal: c === 7 ? "left" : "center" };
      }
    } else {
      slotSubjects.forEach((sub, sIdx) => {
        const subRooms = rooms.filter((r) => r.examSubjectId === sub.id && r.slotId === slot.id);
        const row = wsSchedule.addRow([
          stt++,
          slot.date,
          `Ca ${slot.shiftNumber}`,
          `${slot.startTime} – ${slot.endTime}`,
          `${sub.durationMinutes || slot.durationMinutes} phút`,
          `Khối ${sub.gradeLevel}`,
          sub.subjectName,
          sub.paperFormat || "Trắc nghiệm + Tự luận",
          subRooms.length,
        ]);
        row.height = 24;
        const bg = sIdx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
        for (let c = 1; c <= 9; c++) {
          const cell = row.getCell(c);
          cell.font = {
            name: FONT_NAME,
            size: 10.5,
            bold: c === 7 || c === 9,
            color: { argb: "FF0F172A" },
          };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          cell.border = thinBorder;
          cell.alignment = { vertical: "middle", horizontal: c === 7 || c === 8 ? "left" : "center" };
        }
      });
    }
  });

  // --- SHEET 2: TỔNG HỢP PHÂN CÔNG GIÁM THỊ ---
  const wsSupervisors = wb.addWorksheet("Phan_Cong_Giam_Thi");
  wsSupervisors.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    showGridLines: true,
  };

  wsSupervisors.columns = [
    { key: "stt", width: 7 },
    { key: "hoTen", width: 28 },
    { key: "maGv", width: 14 },
    { key: "ngay", width: 14 },
    { key: "ca", width: 10 },
    { key: "phong", width: 20 },
    { key: "vaiTro", width: 24 },
  ];

  const supR1 = wsSupervisors.addRow(["BẢNG TỔNG HỢP PHÂN CÔNG CÁN BỘ COI THI", "", "", "", "", "", ""]);
  supR1.height = 26;
  wsSupervisors.mergeCells("A1:G1");
  const supCA1 = wsSupervisors.getCell("A1");
  supCA1.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: "FF0F172A" } };
  supCA1.alignment = { vertical: "middle", horizontal: "center" };

  const supR2 = wsSupervisors.addRow([`Đợt kiểm tra: ${session.name.toUpperCase()}`, "", "", "", "", "", ""]);
  supR2.height = 20;
  wsSupervisors.mergeCells("A2:G2");
  const supCA2 = wsSupervisors.getCell("A2");
  supCA2.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF1E3A8A" } };
  supCA2.alignment = { vertical: "middle", horizontal: "center" };

  wsSupervisors.addRow([]).height = 6;

  const supHeaders = [
    "STT",
    "HỌ VÀ TÊN GIÁM THỊ",
    "MÃ GV",
    "NGÀY THI",
    "CA THI",
    "PHÒNG THI",
    "VỊ TRÍ PHÂN CÔNG",
  ];
  const supHeaderRow = wsSupervisors.addRow(supHeaders);
  supHeaderRow.height = 28;
  for (let c = 1; c <= supHeaders.length; c++) {
    const cell = supHeaderRow.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }

  const sortedSupervisors = [...supervisors].sort(
    (a, b) =>
      a.teacherName.localeCompare(b.teacherName, "vi") ||
      a.date.localeCompare(b.date) ||
      a.shiftNumber - b.shiftNumber
  );

  sortedSupervisors.forEach((sup, idx) => {
    const room = rooms.find((r) => r.id === sup.examRoomId);
    const roleLabel =
      sup.role === "chief" ? "Giám thị 1 (Chính)" : sup.role === "assistant" ? "Giám thị 2" : "Giám thị hành lang";

    const row = wsSupervisors.addRow([
      idx + 1,
      sup.teacherName,
      sup.teacherCode || "—",
      sup.date,
      `Ca ${sup.shiftNumber}`,
      room?.physicalRoomName || room?.roomCode || "—",
      roleLabel,
    ]);
    row.height = 24;
    const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = {
        name: FONT_NAME,
        size: 10.5,
        bold: c === 2,
        color: { argb: "FF0F172A" },
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 2 || c === 6 || c === 7 ? "left" : "center",
      };
    }
  });

  const fileName = `LICH_THI_VA_GIAM_THI_${session.code || "TONG_HOP"}.xlsx`;
  await downloadWorkbook(wb, fileName);
}

/**
 * 2. Xuất Danh Sách Thí Sinh & Phiếu Thu Bài Cho Một Phòng Thi Cụ Thể (Mẫu Chuẩn Bộ GD&ĐT In Khổ A4 Dán Cửa Phòng)
 */
export async function exportExamRoomRosterExcel(params: {
  session: ExamSession;
  room: ExamRoom;
  subjectName: string;
  slotInfo?: { date: string; shiftNumber: number; startTime: string; endTime: string };
  students: ExamStudentAssignment[];
  supervisorsText: string;
}) {
  const { room, subjectName } = params;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Phần mềm Quản lý Giáo viên & Khảo thí THCS";
  wb.created = new Date();

  const ws = wb.addWorksheet(`Phong_${room.roomCode}`);
  buildRoomRosterWorksheet(ws, params);

  const fileName = `DANH_SACH_PHONG_THI_${room.roomCode}_${subjectName.replace(/\s+/g, "_")}.xlsx`;
  await downloadWorkbook(wb, fileName);
}

/**
 * 3. Xuất Toàn Bộ Phòng Thi Trong Đợt (Mỗi phòng 1 Sheet chuẩn A4, tiện in 1 lần dán toàn trường)
 */
export async function exportAllExamRoomsExcel(params: {
  session: ExamSession;
  rooms: ExamRoom[];
  subjects: ExamSubject[];
  slots: ExamSlot[];
  supervisors: ExamSupervisorAssignment[];
  allStudents: ExamStudentAssignment[];
}) {
  const { session, rooms, subjects, slots, supervisors, allStudents } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Phần mềm Quản lý Giáo viên & Khảo thí THCS";
  wb.created = new Date();

  // SHEET 1: Danh mục tổng hợp tất cả phòng thi
  const wsIndex = wb.addWorksheet("Danh_Muc_Phong");
  wsIndex.columns = [
    { key: "stt", width: 6 },
    { key: "maPhong", width: 14 },
    { key: "phongHoc", width: 22 },
    { key: "khoi", width: 10 },
    { key: "monThi", width: 22 },
    { key: "ngayThi", width: 14 },
    { key: "caThi", width: 10 },
    { key: "siSo", width: 12 },
    { key: "giamThi", width: 32 },
  ];

  const idxR1 = wsIndex.addRow(["TỔNG HỢP DANH MỤC PHÒNG THI TOÀN TRƯỜNG", "", "", "", "", "", "", "", ""]);
  idxR1.height = 26;
  wsIndex.mergeCells("A1:I1");
  const cIdx1 = wsIndex.getCell("A1");
  cIdx1.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: "FF0F172A" } };
  cIdx1.alignment = { vertical: "middle", horizontal: "center" };

  const idxHeaders = [
    "STT",
    "MÃ PHÒNG THI",
    "ĐỊA ĐIỂM",
    "KHỐI",
    "MÔN THI",
    "NGÀY THI",
    "CA THI",
    "SĨ SỐ",
    "CÁN BỘ COI THI",
  ];
  const idxHeaderRow = wsIndex.addRow(idxHeaders);
  idxHeaderRow.height = 28;
  for (let c = 1; c <= idxHeaders.length; c++) {
    const cell = idxHeaderRow.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }

  const sortedRooms = [...rooms].sort((a, b) => a.roomNumber - b.roomNumber);

  sortedRooms.forEach((rm, i) => {
    const sub = subjects.find((s) => s.id === rm.examSubjectId);
    const slot = slots.find((s) => s.id === rm.slotId);
    const rmSupervisors = supervisors
      .filter((sup) => sup.examRoomId === rm.id)
      .map((sup) => `${sup.teacherName} (${sup.role === "chief" ? "GT1" : "GT2"})`)
      .join(", ");
    const rmStudents = allStudents.filter((st) => st.examRoomId === rm.id);

    const row = wsIndex.addRow([
      i + 1,
      rm.roomCode,
      rm.physicalRoomName || "Phòng học",
      `Khối ${rm.gradeLevel}`,
      sub?.subjectName || "—",
      slot?.date || "—",
      `Ca ${slot?.shiftNumber || 1}`,
      rmStudents.length,
      rmSupervisors || "Chưa phân công",
    ]);
    row.height = 24;
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT_NAME, size: 10.5, bold: c === 2 || c === 8, color: { argb: "FF0F172A" } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 3 || c === 5 || c === 9 ? "left" : "center",
      };
    }

    // TẠO SHEET RIÊNG CHO TỪNG PHÒNG THI
    const cleanSheetName = `Phong_${rm.roomCode}`.replace(/[:\\/?*[\]]/g, "_").slice(0, 31);
    const wsRoom = wb.addWorksheet(cleanSheetName);
    buildRoomRosterWorksheet(wsRoom, {
      session,
      room: rm,
      subjectName: sub?.subjectName || "Môn thi",
      slotInfo: slot
        ? {
            date: slot.date,
            shiftNumber: slot.shiftNumber,
            startTime: slot.startTime,
            endTime: slot.endTime,
          }
        : undefined,
      students: rmStudents,
      supervisorsText: rmSupervisors,
    });
  });

  const fileName = `TAT_CA_PHONG_THI_${session.code || "EXPORT"}.xlsx`;
  await downloadWorkbook(wb, fileName);
}

/**
 * 4. Xuất Phiếu Báo Lịch Coi Thi Cá Nhân Cho Giáo Viên
 */
export async function exportTeacherDutyScheduleExcel(params: {
  teacherName: string;
  teacherCode?: string;
  sessionName: string;
  duties: {
    date: string;
    shiftNumber: number;
    time: string;
    roomName: string;
    subjectName: string;
    gradeLevel: number;
    role: string;
    partnerName?: string;
  }[];
}) {
  const { teacherName, teacherCode, sessionName, duties } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Phần mềm Quản lý Giáo viên & Khảo thí THCS";
  wb.created = new Date();

  const ws = wb.addWorksheet("Lich_Coi_Thi");
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    showGridLines: true,
  };

  ws.columns = [
    { key: "stt", width: 6 },
    { key: "ngay", width: 14 },
    { key: "ca", width: 10 },
    { key: "gio", width: 18 },
    { key: "phong", width: 20 },
    { key: "mon", width: 22 },
    { key: "khoi", width: 10 },
    { key: "nhiemVu", width: 22 },
    { key: "dongNghiep", width: 26 },
  ];

  // Tiêu đề cơ quan
  const r1 = ws.addRow(["TRƯỜNG TRUNG HỌC CƠ SỞ", "", "", "", "", "", "", "", ""]);
  r1.height = 20;
  ws.mergeCells("A1:D1");
  const cA1 = ws.getCell("A1");
  cA1.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
  cA1.alignment = { vertical: "middle", horizontal: "left" };

  // Tiêu đề chính
  const r2 = ws.addRow(["PHIẾU BÁO NHIỆM VỤ COI THI CÁ NHÂN", "", "", "", "", "", "", "", ""]);
  r2.height = 26;
  ws.mergeCells("A2:I2");
  const cA2 = ws.getCell("A2");
  cA2.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: "FF0F172A" } };
  cA2.alignment = { vertical: "middle", horizontal: "center" };

  // Phụ đề
  const r3 = ws.addRow([`Đợt kiểm tra: ${sessionName.toUpperCase()}`, "", "", "", "", "", "", "", ""]);
  r3.height = 20;
  ws.mergeCells("A3:I3");
  const cA3 = ws.getCell("A3");
  cA3.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF1E3A8A" } };
  cA3.alignment = { vertical: "middle", horizontal: "center" };

  const r4 = ws.addRow([
    `Họ và tên giáo viên: ${teacherName} ${teacherCode ? `(Mã: ${teacherCode})` : ""}`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  r4.height = 20;
  ws.mergeCells("A4:I4");
  const cA4 = ws.getCell("A4");
  cA4.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: "FF334155" } };
  cA4.alignment = { vertical: "middle", horizontal: "center" };

  ws.addRow([]).height = 6;

  const headers = [
    "STT",
    "NGÀY THI",
    "CA THI",
    "KHUNG GIỜ",
    "PHÒNG THI",
    "MÔN THI",
    "KHỐI",
    "NHIỆM VỤ",
    "GIÁM THỊ CÙNG PHÒNG",
  ];
  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  for (let c = 1; c <= headers.length; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }

  duties.forEach((d, idx) => {
    const row = ws.addRow([
      idx + 1,
      d.date,
      `Ca ${d.shiftNumber}`,
      d.time,
      d.roomName,
      d.subjectName,
      `Khối ${d.gradeLevel}`,
      d.role,
      d.partnerName || "—",
    ]);
    row.height = 24;
    const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.font = {
        name: FONT_NAME,
        size: 10.5,
        bold: c === 5 || c === 6 || c === 8,
        color: { argb: "FF0F172A" },
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 5 || c === 6 || c === 8 || c === 9 ? "left" : "center",
      };
    }
  });

  ws.addRow([]).height = 10;
  const noteRow = ws.addRow([
    "Lưu ý: Đề nghị quý Thầy/Cô có mặt tại Hội đồng thi trước giờ làm bài 15 phút để nhận đề và hồ sơ thi.",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  ws.mergeCells(`A${ws.rowCount}:I${ws.rowCount}`);
  const cNote = ws.getCell(`A${ws.rowCount}`);
  cNote.font = { name: FONT_NAME, size: 10.5, italic: true, color: { argb: "FFDC2626" } };
  cNote.alignment = { vertical: "middle", horizontal: "left" };

  const fileName = `LICH_COI_THI_${teacherName.replace(/\s+/g, "_")}.xlsx`;
  await downloadWorkbook(wb, fileName);
}
