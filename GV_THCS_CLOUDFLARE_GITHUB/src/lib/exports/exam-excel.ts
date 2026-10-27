import * as XLSX from "xlsx";
import type {
  ExamRoom,
  ExamSession,
  ExamSlot,
  ExamStudentAssignment,
  ExamSubject,
  ExamSupervisorAssignment,
} from "@school/shared";

/**
 * 1. Xuất file Bảng Tổng Hợp Lịch Thi & Phân Công Giám Thị Toàn Trường
 */
export function exportExamMasterScheduleExcel(params: {
  session: ExamSession;
  slots: ExamSlot[];
  subjects: ExamSubject[];
  rooms: ExamRoom[];
  supervisors: ExamSupervisorAssignment[];
}) {
  const { session, slots, subjects, rooms, supervisors } = params;

  const wb = XLSX.utils.book_new();

  // --- SHEET 1: LỊCH THI THEO CA & MÔN ---
  const scheduleRows: (string | number)[][] = [
    ["TRƯỜNG TRUNG HỌC CƠ SỞ"],
    [`HỘI ĐỒNG KIỂM TRA ĐỊNH KỲ: ${session.name.toUpperCase()}`],
    [`Thời gian tổ chức: Từ ngày ${session.startDate} đến ngày ${session.endDate}`],
    [],
    ["STT", "NGÀY THI", "CA THI", "KHUNG GIỜ", "THỜI LƯỢNG", "KHỐI", "MÔN THI", "HÌNH THỨC", "SỐ PHÒNG"],
  ];

  let stt = 1;
  const sortedSlots = [...slots].sort((a, b) => a.date.localeCompare(b.date) || a.shiftNumber - b.shiftNumber);

  sortedSlots.forEach((slot) => {
    const slotSubjects = subjects.filter((sub) => sub.slotId === slot.id);
    if (slotSubjects.length === 0) {
      scheduleRows.push([
        stt++,
        slot.date,
        `Ca ${slot.shiftNumber}`,
        `${slot.startTime} – ${slot.endTime}`,
        `${slot.durationMinutes} phút`,
        "—",
        "Chưa gán môn",
        "—",
        0,
      ]);
    } else {
      slotSubjects.forEach((sub) => {
        const subRooms = rooms.filter((r) => r.examSubjectId === sub.id && r.slotId === slot.id);
        scheduleRows.push([
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
      });
    }
  });

  const wsSchedule = XLSX.utils.aoa_to_sheet(scheduleRows);
  wsSchedule["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 10 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 24 },
    { wch: 22 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSchedule, "Lich_Thi_Tong_Hop");

  // --- SHEET 2: TỔNG HỢP PHÂN CÔNG GIÁM THỊ ---
  const supervisorRows: (string | number)[][] = [
    ["BẢNG TỔNG HỢP PHÂN CÔNG CÁN BỘ COI THI"],
    [`Đợt kiểm tra: ${session.name}`],
    [],
    ["STT", "HỌ VÀ TÊN GIÁM THỊ", "MÃ GV", "NGÀY THI", "CA THI", "PHÒNG THI", "VỊ TRÍ PHÂN CÔNG"],
  ];

  const sortedSupervisors = [...supervisors].sort(
    (a, b) => a.teacherName.localeCompare(b.teacherName, "vi") || a.date.localeCompare(b.date) || a.shiftNumber - b.shiftNumber,
  );

  sortedSupervisors.forEach((sup, idx) => {
    const room = rooms.find((r) => r.id === sup.examRoomId);
    const roleLabel =
      sup.role === "chief" ? "Giám thị 1 (Chính)" : sup.role === "assistant" ? "Giám thị 2" : "Giám thị hành lang";

    supervisorRows.push([
      idx + 1,
      sup.teacherName,
      sup.teacherCode || "—",
      sup.date,
      `Ca ${sup.shiftNumber}`,
      room?.physicalRoomName || room?.roomCode || "—",
      roleLabel,
    ]);
  });

  const wsSupervisors = XLSX.utils.aoa_to_sheet(supervisorRows);
  wsSupervisors["!cols"] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSupervisors, "Phan_Cong_Giam_Thi");

  const fileName = `LICH_THI_VA_GIAM_THI_${session.code || "TONG_HOP"}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * 2. Xuất Danh Sách Thí Sinh & Phiếu Thu Bài Theo Từng Phòng Thi (Mẫu Chuẩn Bộ GD&ĐT)
 */
export function exportExamRoomRosterExcel(params: {
  session: ExamSession;
  room: ExamRoom;
  subjectName: string;
  slotInfo?: { date: string; shiftNumber: number; startTime: string; endTime: string };
  students: ExamStudentAssignment[];
  supervisorsText: string;
}) {
  const { session, room, subjectName, slotInfo, students, supervisorsText } = params;

  const wb = XLSX.utils.book_new();

  const rows: (string | number)[][] = [
    ["TRƯỜNG TRUNG HỌC CƠ SỞ"],
    ["DANH SÁCH THÍ SINH DỰ THI VÀ KÝ NỘP BÀI"],
    [`Đợt kiểm tra: ${session.name}`],
    [
      `Phòng thi: ${room.roomCode} (${room.physicalRoomName}) | Môn thi: ${subjectName} (Khối ${room.gradeLevel})`,
    ],
    [
      `Ngày thi: ${slotInfo?.date || "—"} | Khung giờ: ${slotInfo?.startTime || ""} – ${slotInfo?.endTime || ""} (Ca ${slotInfo?.shiftNumber || 1})`,
    ],
    [`Cán bộ coi thi: ${supervisorsText || "Chưa phân công"} | Tổng số thí sinh: ${students.length}`],
    [],
    [
      "STT",
      "SỐ BÁO DANH",
      "MÃ HỌC SINH",
      "HỌ VÀ TÊN THÍ SINH",
      "LỚP",
      "SỐ BÀN",
      "SỐ TỜ",
      "CHỮ KÝ THÍ SINH",
      "ĐIỂM SỐ",
      "GHI CHÚ",
    ],
  ];

  const sortedStudents = [...students].sort(
    (a, b) => (a.deskNumber || 0) - (b.deskNumber || 0) || a.candidateNumber.localeCompare(b.candidateNumber),
  );

  sortedStudents.forEach((st, idx) => {
    rows.push([
      idx + 1,
      st.candidateNumber,
      st.studentCode || "—",
      st.studentName,
      st.className,
      st.deskNumber,
      "", // Số tờ giấy thi để trống khi in ra
      "", // Chữ ký thí sinh
      "", // Điểm số
      st.attendance === "absent_with_reason" ? "Vắng có phép" : st.attendance === "absent_without_reason" ? "Vắng không phép" : "",
    ]);
  });

  // Chân trang ký tên
  rows.push([]);
  rows.push([
    "",
    "",
    "",
    "CÁN BỘ COI THI 1",
    "",
    "",
    "",
    "CÁN BỘ COI THI 2",
    "",
    "THƯ KÝ HỘI ĐỒNG",
  ]);
  rows.push([
    "",
    "",
    "",
    "(Ký và ghi rõ họ tên)",
    "",
    "",
    "",
    "(Ký và ghi rõ họ tên)",
    "",
    "(Ký và ghi rõ họ tên)",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 10 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Phong_${room.roomCode}`);

  const fileName = `DANH_SACH_PHONG_THI_${room.roomCode}_${subjectName.replace(/\s+/g, "_")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * 3. Xuất Phiếu Báo Lịch Coi Thi Cá Nhân Cho Giáo Viên
 */
export function exportTeacherDutyScheduleExcel(params: {
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

  const wb = XLSX.utils.book_new();

  const rows: (string | number)[][] = [
    ["TRƯỜNG TRUNG HỌC CƠ SỞ"],
    ["PHIẾU BÁO NHIỆM VỤ COI THI CÁ NHÂN"],
    [`Đợt kiểm tra: ${sessionName}`],
    [`Họ và tên giáo viên: ${teacherName} ${teacherCode ? `(Mã: ${teacherCode})` : ""}`],
    [],
    ["STT", "NGÀY THI", "CA THI", "KHUNG GIỜ", "PHÒNG THI", "MÔN THI", "KHỐI", "NHIỆM VỤ", "GIÁM THỊ CÙNG PHÒNG"],
  ];

  duties.forEach((d, idx) => {
    rows.push([
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
  });

  rows.push([]);
  rows.push(["Lưu ý:", "Đề nghị quý Thầy/Cô có mặt tại Hội đồng thi trước giờ làm bài 15 phút để nhận đề và hồ sơ thi."]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 10 },
    { wch: 22 },
    { wch: 26 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Lich_Coi_Thi");

  const fileName = `LICH_COI_THI_${teacherName.replace(/\s+/g, "_")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
