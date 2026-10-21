import * as XLSX from "xlsx";
import { disciplineCategoryLabels, type DisciplineCategory } from "@school/shared";

export type ExportDisciplineExcelOptions = {
  schoolYearName: string;
  weekNumber: number;
  className: string;
  isLocked: boolean;
  isSigned: boolean;
  approvalData?: {
    approvalId?: string;
    version?: number;
    signerName?: string;
    signerEmail?: string;
    signedAt?: string;
    contentHashSha256?: string;
  } | null;
  criteriaSummary: {
    criterionId: string;
    criterionCode: string;
    criterionName: string;
    category: DisciplineCategory;
    unitPoints: number;
    quantity: number;
    totalPoints: number;
    studentNamesText: string;
  }[];
  allEntries: {
    id: string;
    occurredDate: string;
    period?: number | null;
    studentNamesText?: string;
    criterionCode?: string;
    criterionName: string;
    category: DisciplineCategory;
    totalPoints: number;
    reportedByName: string;
    reviewedByName?: string;
    status: string;
    note?: string;
  }[];
  finalScore: number;
  totalPlus: number;
  totalMinus: number;
  basePoints?: number;
};

export function exportHomeroomDisciplineExcel(options: ExportDisciplineExcelOptions) {
  const {
    schoolYearName,
    weekNumber,
    className,
    isLocked,
    isSigned,
    approvalData,
    criteriaSummary,
    allEntries,
    finalScore,
    totalPlus,
    totalMinus,
    basePoints = 600,
  } = options;

  const wb = XLSX.utils.book_new();

  // ==========================================================================
  // SHEET 1: BANG_DIEM (BẢNG ĐIỂM THI ĐUA 33 TIÊU CHÍ)
  // ==========================================================================
  const watermarkText = isLocked
    ? "BẢN CHÍNH THỨC – ĐÃ KÝ XÁC NHẬN"
    : isSigned
      ? "BẢN ĐÃ KÝ XÁC NHẬN (CHƯA KHÓA SỔ)"
      : "BẢN TẠM TÍNH – CHƯA CHỐT";

  const bangDiemRows: (string | number)[][] = [
    [`BẢNG ĐIỂM THI ĐUA LỚP ${className}`],
    [`Năm học: ${schoolYearName} | Tuần thi đua: ${weekNumber} | ${watermarkText}`],
    [],
    [
      "STT",
      "NHÓM",
      "MÃ",
      "TIÊU CHÍ THI ĐUA",
      "ĐỊNH MỨC",
      "SỐ LẦN VI PHẠM",
      "HỌC SINH VI PHẠM / GHI CHÚ",
      "ĐIỂM",
    ],
  ];

  criteriaSummary.forEach((crit, index) => {
    bangDiemRows.push([
      index + 1,
      disciplineCategoryLabels[crit.category] || crit.category,
      crit.criterionCode,
      crit.criterionName,
      crit.unitPoints,
      crit.quantity > 0 ? crit.quantity : 0,
      crit.quantity > 0 ? crit.studentNamesText || "Tập thể lớp" : "",
      crit.totalPoints,
    ]);
  });

  bangDiemRows.push(
    [],
    ["", "", "", "", "", "Điểm gốc ban đầu:", "", `+${basePoints}`],
    ["", "", "", "", "", "Tổng điểm cộng:", "", `+${totalPlus}`],
    ["", "", "", "", "", "Tổng điểm trừ:", "", `-${totalMinus}`],
    ["", "", "", "", "", "ĐIỂM CHỐT TUẦN (100 + Cộng - Trừ):", "", `${finalScore} điểm`],
    [],
    [
      "",
      "",
      "",
      "",
      `Người tổng kết ký: ${approvalData?.signerName || (isSigned ? "Đã ký" : "Chưa ký")}`,
      "",
      `Thời gian ký: ${approvalData?.signedAt || "—"}`,
      "",
    ],
  );

  const wsBangDiem = XLSX.utils.aoa_to_sheet(bangDiemRows);

  // Cấu hình độ rộng cột cho BANG_DIEM
  wsBangDiem["!cols"] = [
    { wch: 6 },  // STT
    { wch: 15 }, // Nhóm
    { wch: 10 }, // Mã
    { wch: 45 }, // Tiêu chí
    { wch: 12 }, // Định mức
    { wch: 16 }, // Số lần
    { wch: 40 }, // Học sinh
    { wch: 12 }, // Điểm
  ];

  XLSX.utils.book_append_sheet(wb, wsBangDiem, "BANG_DIEM");

  // ==========================================================================
  // SHEET 2: CHI_TIET (DANH SÁCH TỪNG PHIẾU VI PHẠM ĐÃ DUYỆT)
  // ==========================================================================
  const chiTietRows: (string | number)[][] = [
    [
      "Mã phiếu",
      "Ngày vi phạm",
      "Tiết",
      "Lớp",
      "Học sinh vi phạm",
      "Mã lỗi",
      "Nội dung vi phạm",
      "Điểm",
      "Người ghi nhận",
      "Người thẩm định",
      "Trạng thái",
      "Ghi chú",
    ],
  ];

  allEntries.forEach((e) => {
    chiTietRows.push([
      e.id,
      e.occurredDate,
      e.period ? `Tiết ${e.period}` : "—",
      className,
      e.studentNamesText || "Tập thể lớp",
      e.criterionCode || "—",
      e.criterionName,
      e.totalPoints,
      e.reportedByName,
      e.reviewedByName || "—",
      e.status === "approved" ? "Đã duyệt" : e.status === "pending" ? "Chờ duyệt" : e.status,
      e.note || "",
    ]);
  });

  const wsChiTiet = XLSX.utils.aoa_to_sheet(chiTietRows);
  wsChiTiet["!cols"] = [
    { wch: 16 }, // Mã phiếu
    { wch: 14 }, // Ngày
    { wch: 10 }, // Tiết
    { wch: 10 }, // Lớp
    { wch: 30 }, // Học sinh
    { wch: 10 }, // Mã lỗi
    { wch: 35 }, // Nội dung
    { wch: 10 }, // Điểm
    { wch: 22 }, // Người ghi
    { wch: 22 }, // Người duyệt
    { wch: 14 }, // Trạng thái
    { wch: 30 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, wsChiTiet, "CHI_TIET");

  // ==========================================================================
  // SHEET 3: XAC_MINH (HỒ SƠ BẢO CHỨNG SHA-256 VÀ TÍNH TOÀN VẸN)
  // ==========================================================================
  const xacMinhRows: (string | number)[][] = [
    ["THÔNG TIN BẢO CHỨNG", "GIÁ TRỊ / HƯỚNG DẪN XÁC THỰC"],
    ["Lớp học", className],
    ["Tuần thi đua", `Tuần ${weekNumber}`],
    ["Năm học", schoolYearName],
    ["Mã bản tổng kết (Approval ID)", approvalData?.approvalId || "Chưa phát sinh"],
    ["Phiên bản bảng điểm", approvalData?.version ? `v${approvalData.version}` : (isSigned ? "v1" : "Bản tạm tính")],
    ["Họ và tên người ký xác nhận", approvalData?.signerName || (isSigned ? "Đã ký xác nhận" : "Chưa ký")],
    ["Thời điểm ký trên máy chủ", approvalData?.signedAt || (isSigned ? "Đã ghi nhận" : "Chưa ký")],
    ["Mã băm SHA-256 snapshot", approvalData?.contentHashSha256 || (isSigned ? "Đã sinh mã băm" : "Chưa phát sinh (Chờ ký)")],
    [
      "Trạng thái xác thực",
      isLocked
        ? "ĐÃ KHÓA SỔ CHÍNH THỨC (BẤT BIẾN)"
        : isSigned
          ? "ĐÃ KÝ XÁC NHẬN (ĐANG MỞ)"
          : "BẢN TẠM TÍNH – CHƯA KHÓA",
    ],
    [],
    [
      "Lưu ý pháp lý",
      "Mã băm SHA-256 được tạo tự động tại máy chủ tin cậy từ snapshot 33 tiêu chí nhằm bảo chứng tính toàn vẹn dữ liệu, chống can thiệp hoặc sửa điểm ngoài luồng; không tự nhận là chữ ký số pháp lý theo Luật Giao dịch điện tử.",
    ],
    [
      "Hướng dẫn kiểm chứng",
      "Để đối chiếu tính nguyên bản, truy cập phần mềm mục 'Xác minh SHA-256' hoặc đối chiếu chuỗi SHA-256 với bản lưu trên máy chủ Firebase.",
    ],
  ];

  const wsXacMinh = XLSX.utils.aoa_to_sheet(xacMinhRows);
  wsXacMinh["!cols"] = [
    { wch: 30 },
    { wch: 80 },
  ];

  XLSX.utils.book_append_sheet(wb, wsXacMinh, "XAC_MINH");

  // Xuất file
  const fileName = `THI_DUA_LOP_${className.replace(/\s+/g, "_")}_TUAN_${weekNumber}_${isLocked ? "CHINH_THUC" : "TAM_TINH"}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ============================================================================
// 2. XUẤT BÁO CÁO THI ĐUA TOÀN TRƯỜNG (SCHOOL-WIDE DISCIPLINE EXCEL)
// ============================================================================

export type SchoolwideClassRankingItem = {
  rank: number;
  grade: number | string;
  classId: string;
  className: string;
  homeroomTeacherName: string;
  basePoints?: number;
  totalPlus: number;
  totalMinus: number;
  finalScore: number;
  classification?: string;
  assignedSignerName?: string;
  signerName?: string;
  signedAt?: string;
  version?: number;
  isSigned: boolean;
  isLocked: boolean;
  contentHashSha256?: string;
};

export type ExportSchoolDisciplineExcelOptions = {
  schoolYearName: string;
  semesterName?: string;
  weekNumber: number;
  isWeekLocked: boolean;
  classesRanking: SchoolwideClassRankingItem[];
  classSnapshots?: Record<
    string,
    {
      criteriaSummary: {
        criterionCode: string;
        criterionName: string;
        category: DisciplineCategory;
        unitPoints: number;
        quantity: number;
        totalPoints: number;
      }[];
      finalScore: number;
      totalPlus: number;
      totalMinus: number;
    }
  >;
};

export function exportSchoolDisciplineExcel(options: ExportSchoolDisciplineExcelOptions) {
  const {
    schoolYearName,
    semesterName = "Học kỳ I",
    weekNumber,
    isWeekLocked,
    classesRanking,
    classSnapshots = {},
  } = options;

  const wb = XLSX.utils.book_new();

  const watermarkText = isWeekLocked
    ? "BẢN CHÍNH THỨC TOÀN TRƯỜNG – ĐÃ KHÓA SỔ & KÝ XÁC NHẬN"
    : "BẢN TẠM TÍNH – CHƯA CHỐT TOÀN TRƯỜNG";

  // ==========================================================================
  // SHEET 1: XEP_HANG (BẢNG XẾP HẠNG THI ĐUA TOÀN TRƯỜNG)
  // ==========================================================================
  const xepHangRows: (string | number)[][] = [
    ["BẢNG TỔNG HỢP VÀ XẾP HẠNG THI ĐUA NỀN NẾP TOÀN TRƯỜNG"],
    [`Năm học: ${schoolYearName} | ${semesterName} | Tuần: ${weekNumber}`],
    [`Tình trạng: ${watermarkText}`],
    [],
    [
      "HẠNG",
      "KHỐI",
      "LỚP",
      "GIÁO VIÊN CHỦ NHIỆM",
      "ĐIỂM BAN ĐẦU",
      "ĐIỂM CỘNG (+)",
      "ĐIỂM TRỪ (-)",
      "TỔNG ĐIỂM",
      "XẾP LOẠI",
      "TRẠNG THÁI XÁC NHẬN",
      "PHIÊN BẢN",
    ],
  ];

  let totalSchoolPlus = 0;
  let totalSchoolMinus = 0;
  let totalSchoolScore = 0;

  classesRanking.forEach((item) => {
    totalSchoolPlus += item.totalPlus;
    totalSchoolMinus += item.totalMinus;
    totalSchoolScore += item.finalScore;

    const statusText = item.isLocked
      ? "Đã khóa sổ"
      : item.isSigned
        ? "Đã ký xác nhận"
        : "Chưa ký";

    xepHangRows.push([
      item.rank,
      `Khối ${item.grade}`,
      item.className,
      item.homeroomTeacherName || "Chưa phân công",
      item.basePoints || 600,
      item.totalPlus,
      item.totalMinus,
      item.finalScore,
      item.classification || (item.finalScore >= 580 ? "Tốt" : item.finalScore >= 550 ? "Khá" : item.finalScore >= 500 ? "Trung bình" : "Yếu"),
      statusText,
      item.version ? `v${item.version}` : "v1",
    ]);
  });

  // Hàng thống kê tổng kết
  const avgScore = classesRanking.length > 0 ? (totalSchoolScore / classesRanking.length).toFixed(1) : 0;
  xepHangRows.push([]);
  xepHangRows.push([
    "TỔNG KẾT",
    "—",
    `${classesRanking.length} lớp`,
    "—",
    "—",
    totalSchoolPlus,
    totalSchoolMinus,
    `ĐTB: ${avgScore}`,
    "—",
    isWeekLocked ? "ĐÃ KHÓA SỔ" : "CHƯA KHÓA",
    "—",
  ]);

  const wsXepHang = XLSX.utils.aoa_to_sheet(xepHangRows);
  wsXepHang["!cols"] = [
    { wch: 8 },  // Hạng
    { wch: 10 }, // Khối
    { wch: 12 }, // Lớp
    { wch: 25 }, // GVCN
    { wch: 14 }, // Điểm ban đầu
    { wch: 14 }, // Điểm cộng
    { wch: 14 }, // Điểm trừ
    { wch: 14 }, // Tổng điểm
    { wch: 14 }, // Xếp loại
    { wch: 22 }, // Trạng thái
    { wch: 12 }, // Phiên bản
  ];

  XLSX.utils.book_append_sheet(wb, wsXepHang, "XEP_HANG");

  // ==========================================================================
  // SHEET 2: SO_KY_XAC_NHAN (SỔ KÝ XÁC NHẬN VÀ BẢO CHỨNG SHA-256)
  // ==========================================================================
  const soKyRows: (string | number)[][] = [
    ["SỔ KÝ XÁC NHẬN TỔNG KẾT THI ĐUA NỀN NẾP TOÀN TRƯỜNG"],
    [`Năm học: ${schoolYearName} | Tuần: ${weekNumber} | ${watermarkText}`],
    [],
    [
      "STT",
      "KHỐI",
      "LỚP",
      "GIÁO VIÊN CHỦ NHIỆM",
      "NGƯỜI ĐƯỢC PHÂN CÔNG",
      "NGƯỜI KÝ XÁC NHẬN",
      "THỜI ĐIỂM KÝ",
      "PHIÊN BẢN",
      "MÃ BĂM SHA-256 SNAPSHOT (BẢO CHỨNG TOÀN VẸN)",
      "TRẠNG THÁI",
    ],
  ];

  classesRanking.forEach((item, index) => {
    soKyRows.push([
      index + 1,
      `Khối ${item.grade}`,
      item.className,
      item.homeroomTeacherName || "Chưa phân công",
      item.assignedSignerName || "Chưa phân công",
      item.signerName || (item.isSigned ? "Đã ký xác nhận" : "Chưa ký"),
      item.signedAt || "—",
      item.version ? `v${item.version}` : "v1",
      item.contentHashSha256 || (item.isSigned ? "Đã băm SHA-256" : "Chưa phát sinh"),
      item.isLocked ? "ĐÃ KHÓA SỔ" : item.isSigned ? "ĐÃ KÝ" : "CHƯA KÝ",
    ]);
  });

  soKyRows.push([]);
  soKyRows.push([
    "Ghi chú bảo mật",
    "Mã băm SHA-256 trên từng snapshot được tạo tự động bởi máy chủ Firebase Functions; nghiêm cấm chỉnh sửa dữ liệu thủ công sau khi đã ký xác nhận.",
  ]);

  const wsSoKy = XLSX.utils.aoa_to_sheet(soKyRows);
  wsSoKy["!cols"] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 12 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 20 },
    { wch: 12 },
    { wch: 68 }, // Mã SHA-256 64 hex
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, wsSoKy, "SO_KY_XAC_NHAN");

  // ==========================================================================
  // CÁC SHEET CHI TIẾT TỪNG LỚP (BẢO VỆ RIÊNG TƯ - KHÔNG CÔNG BỐ TÊN HỌC SINH)
  // ==========================================================================
  Object.entries(classSnapshots).forEach(([classId, snap]) => {
    const classInfo = classesRanking.find((c) => c.classId === classId);
    const sheetName = classInfo?.className ? classInfo.className.replace(/[^a-zA-Z0-9]/g, "") : classId.substring(0, 10);

    const lopRows: (string | number)[][] = [
      [`BẢNG ĐIỂM TIÊU CHÍ NỀN NẾP - LỚP ${classInfo?.className || classId}`],
      [`Tuần ${weekNumber} | GVCN: ${classInfo?.homeroomTeacherName || "—"} | Điểm tuần: ${snap.finalScore}`],
      [],
      ["STT", "NHÓM", "MÃ", "TIÊU CHÍ", "ĐỊNH MỨC", "SỐ LƯỢNG", "TỔNG ĐIỂM"],
    ];

    snap.criteriaSummary.forEach((crit, idx) => {
      lopRows.push([
        idx + 1,
        disciplineCategoryLabels[crit.category] || crit.category,
        crit.criterionCode,
        crit.criterionName,
        crit.unitPoints,
        crit.quantity,
        crit.totalPoints,
      ]);
    });

    lopRows.push([]);
    lopRows.push([
      "TỔNG",
      "—",
      "—",
      "—",
      "—",
      `Cộng: +${snap.totalPlus} | Trừ: -${snap.totalMinus}`,
      snap.finalScore,
    ]);

    const wsLop = XLSX.utils.aoa_to_sheet(lopRows);
    wsLop["!cols"] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 10 },
      { wch: 35 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, wsLop, sheetName.substring(0, 31));
  });

  const fileName = `THI_DUA_TOAN_TRUONG_TUAN_${weekNumber}_${isWeekLocked ? "CHINH_THUC" : "TAM_TINH"}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
