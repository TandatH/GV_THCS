import * as XLSX from "xlsx";

export type StudentTemplateRow = {
  studentCode: string;
  fullName: string;
};

export type SubjectColumn = {
  id: string;
  code: string;
  name: string;
};

export function downloadClassGradeTemplate(params: {
  className: string;
  periodName: string;
  students: StudentTemplateRow[];
  subjects: SubjectColumn[];
}) {
  const { className, periodName, students, subjects } = params;

  // Xây dựng danh sách dòng dữ liệu
  const rows = students.length > 0
    ? students.map((s, idx) => {
        const row: Record<string, unknown> = {
          "STT": idx + 1,
          "Mã học sinh": s.studentCode,
          "Họ và tên": s.fullName,
        };
        // Cột các môn học
        subjects.forEach((sub) => {
          row[sub.name] = "";
        });
        return row;
      })
    : [
        {
          "STT": 1,
          "Mã học sinh": "HS0601",
          "Họ và tên": "Nguyễn Văn An",
          ...subjects.reduce<Record<string, unknown>>((acc, sub) => {
            acc[sub.name] = 8.5;
            return acc;
          }, {}),
        },
        {
          "STT": 2,
          "Mã học sinh": "HS0602",
          "Họ và tên": "Trần Thị Bình",
          ...subjects.reduce<Record<string, unknown>>((acc, sub) => {
            acc[sub.name] = 4.0;
            return acc;
          }, {}),
        },
      ];

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bang_Diem");

  const sanitizedPeriod = periodName.replace(/[/\\?%*:|"<>]/g, "_");
  const sanitizedClass = className.replace(/[/\\?%*:|"<>]/g, "_");
  XLSX.writeFile(wb, `Mau_Nhap_Diem_${sanitizedClass}_${sanitizedPeriod}.xlsx`);
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

export function exportHomeroomWeakStudentsExcel(params: {
  className: string;
  periodName: string;
  rows: WeakStudentExportRow[];
}) {
  const { className, periodName, rows } = params;

  const data = rows.map((r) => ({
    "STT": r.stt,
    "Mã học sinh": r.studentCode,
    "Họ và tên": r.fullName,
    "Lớp": r.className,
    "Các môn yếu (< 5.0)": r.weakSubjectsText,
    "SĐT Phụ huynh": r.parentPhone || "",
    "Họ tên Phụ huynh": r.parentName || "",
    "Trạng thái nhắc nhở": r.statusText,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoc_Sinh_Can_Nhac_Nho");

  const sanitizedPeriod = periodName.replace(/[/\\?%*:|"<>]/g, "_");
  const sanitizedClass = className.replace(/[/\\?%*:|"<>]/g, "_");
  XLSX.writeFile(wb, `Danh_Sach_Hoc_Sinh_Yeu_${sanitizedClass}_${sanitizedPeriod}.xlsx`);
}

export type MatrixExportRow = {
  stt: number;
  studentCode: string;
  fullName: string;
  scores: Record<string, number | string>;
  averageScore?: number | null;
  weakCount: number;
};

export function exportClassGradeMatrixExcel(params: {
  className: string;
  periodName: string;
  subjects: SubjectColumn[];
  rows: MatrixExportRow[];
}) {
  const { className, periodName, subjects, rows } = params;

  const data = rows.map((r) => {
    const item: Record<string, unknown> = {
      "STT": r.stt,
      "Mã học sinh": r.studentCode,
      "Họ và tên": r.fullName,
    };
    subjects.forEach((s) => {
      item[s.name] = r.scores[s.id] !== undefined ? r.scores[s.id] : "";
    });
    item["Điểm trung bình"] = r.averageScore !== null && r.averageScore !== undefined ? r.averageScore : "";
    item["Số môn yếu"] = r.weakCount;
    return item;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "So_Diem_Tong_Hop");

  const sanitizedPeriod = periodName.replace(/[/\\?%*:|"<>]/g, "_");
  const sanitizedClass = className.replace(/[/\\?%*:|"<>]/g, "_");
  XLSX.writeFile(wb, `So_Diem_${sanitizedClass}_${sanitizedPeriod}.xlsx`);
}
