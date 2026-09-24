type Row = Record<string, unknown> & { id: string };

export type StudentTimetableExportInput = {
  schoolName?: string;
  weekStart: string;
  classId?: string;
  schedules: Row[];
  classes: Row[];
  subjects: Row[];
  teachers: Row[];
  rooms: Row[];
  timeSlots: Row[];
};

export type StudentTimetableWorkbook = {
  xml: string;
  fileName: string;
  worksheetCount: number;
  scheduleCount: number;
  classNames: string[];
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function catalogName(rows: Row[], id: unknown) {
  const value = text(id);
  const row = rows.find((item) => item.id === value);
  return row
    ? text(row.fullName) || text(row.name) || text(row.displayName) || text(row.code) || row.id
    : value;
}

function xml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function dateOnly(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Tuần bắt đầu không hợp lệ.");
  return date;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function viDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function periodNumber(row: Row) {
  return Number(row.periodNumber ?? row.order ?? row.period ?? 0);
}

function numericGrade(value: unknown) {
  const grade = Number(value);
  return Number.isInteger(grade) && grade >= 1 && grade <= 9 ? grade : 0;
}

function schoolLevelForGrade(grade: number) {
  if (grade >= 1 && grade <= 5) return "primary";
  if (grade >= 6 && grade <= 9) return "secondary";
  return "";
}

function rowSchoolLevel(row: Row | undefined | null) {
  const explicit = text(row?.schoolLevel);
  if (explicit === "primary" || explicit === "secondary") return explicit;
  return schoolLevelForGrade(numericGrade(row?.grade ?? row?.gradeLevel));
}

function timeSlotSchoolLevel(row: Row) {
  const explicit = text(row.schoolLevel);
  return explicit === "primary" || explicit === "secondary" ? explicit : "secondary";
}

function periodLabel(row: Row, fallback: number) {
  const name = text(row.name) || text(row.displayName) || `Tiết ${fallback}`;
  const start = text(row.startTime);
  const end = text(row.endTime);
  return start && end ? `${name}\n${start}–${end}` : name;
}

function safeSheetName(value: string, used: Set<string>) {
  const base = (value || "Lớp")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Lớp";
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    const suffix = ` ${index}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function cell(value: string, style = "Content", mergeAcross = 0) {
  const merge = mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : "";
  return `<Cell ss:StyleID="${style}"${merge}><Data ss:Type="String">${xml(value)}</Data></Cell>`;
}

function scheduleCellText(schedule: Row, input: StudentTimetableExportInput, classRow?: Row) {
  const subject = text(schedule.subjectName) || catalogName(input.subjects, schedule.subjectId) || "Môn học";
  const teacher = text(schedule.teacherName)
    || catalogName(input.teachers, schedule.actualTeacherId || schedule.teacherId)
    || "Chưa rõ giáo viên";
  let room = text(schedule.roomName) || catalogName(input.rooms, schedule.roomId);
  if (!room && classRow) {
    room = text(classRow.roomName) || catalogName(input.rooms, classRow.roomId);
  }
  const roomDisplay = room ? `Phòng: ${room}` : "Phòng: —";

  return [
    `Môn: ${subject}`,
    `GV: ${teacher}`,
    roomDisplay,
  ].join("\n");
}

export function buildStudentTimetableWorkbook(input: StudentTimetableExportInput): StudentTimetableWorkbook {
  const monday = dateOnly(input.weekStart);
  const friday = addDays(monday, 4);
  const activeSchedules = input.schedules.filter((schedule) =>
    schedule.status !== "cancelled"
    && text(schedule.weekStart) === input.weekStart
    && (!input.classId || text(schedule.classId) === input.classId),
  );

  if (activeSchedules.length === 0) throw new Error("Không có lịch phù hợp để xuất.");

  const classIds = [...new Set(activeSchedules.map((schedule) => text(schedule.classId)).filter(Boolean))]
    .sort((first, second) => catalogName(input.classes, first).localeCompare(catalogName(input.classes, second), "vi"));

  const usedSheetNames = new Set<string>();
  const classNames: string[] = [];

  const worksheets = classIds.map((classId) => {
    const className = catalogName(input.classes, classId)
      || text(activeSchedules.find((schedule) => text(schedule.classId) === classId)?.className)
      || classId;
    classNames.push(className);
    const sheetName = safeSheetName(className, usedSheetNames);
    const classSchedules = activeSchedules.filter((schedule) => text(schedule.classId) === classId);
    const classRow = input.classes.find((item) => item.id === classId);
    const classLevel = text(classSchedules[0]?.schoolLevel) || rowSchoolLevel(classRow) || "secondary";
    const configuredPeriods = input.timeSlots
      .filter((slot) => slot.isActive !== false && periodNumber(slot) > 0 && timeSlotSchoolLevel(slot) === classLevel)
      .sort((first, second) => periodNumber(first) - periodNumber(second));
    const scheduleMaxPeriod = classSchedules.reduce(
      (max, schedule) => Math.max(max, Number(schedule.endPeriod || 1) - 1),
      0,
    );
    const configuredMaxPeriod = configuredPeriods.reduce((max, slot) => Math.max(max, periodNumber(slot)), 0);
    const maxPeriod = Math.max(scheduleMaxPeriod, configuredMaxPeriod, 1);
    const periods = Array.from({ length: maxPeriod }, (_, index) => index + 1);
    const periodRows = new Map(configuredPeriods.map((slot) => [periodNumber(slot), slot]));

    const headerCells = [cell("Tiết", "Header")];
    for (let day = 2; day <= 6; day += 1) {
      headerCells.push(cell(`Thứ ${day}\n${viDate(addDays(monday, day - 2))}`, "Header"));
    }

    const rows: string[] = [];
    periods.forEach((period) => {
      const periodInfo = periodRows.get(period);
      const values = [cell(periodInfo ? periodLabel(periodInfo, period) : `Tiết ${period}`, "Period")];
      for (let day = 2; day <= 6; day += 1) {
        const matches = classSchedules.filter((schedule) =>
          Number(schedule.dayOfWeek) === day
          && period >= Number(schedule.startPeriod || 0)
          && period < Number(schedule.endPeriod || 0),
        );
        const content = matches.map((schedule) => scheduleCellText(schedule, input, classRow)).join("\n────────\n");
        values.push(cell(content || "—", content ? "Content" : "Empty"));
      }
      rows.push(`<Row ss:Height="54">${values.join("")}</Row>`);
      // Add lunch break divider after Period 5 if there are afternoon periods
      if (period === 5 && periods.some((p) => p >= 6)) {
        rows.push(`<Row ss:Height="22"><Cell ss:StyleID="SessionBreak" ss:MergeAcross="5"><Data ss:Type="String">── NGHỈ TRƯA ──</Data></Cell></Row>`);
      }
    });

    return `<Worksheet ss:Name="${xml(sheetName)}">
      <Table>
        <Column ss:Width="92"/>
        <Column ss:Width="170"/><Column ss:Width="170"/><Column ss:Width="170"/>
        <Column ss:Width="170"/><Column ss:Width="170"/>
        <Row ss:Height="28">${cell(text(input.schoolName) || "TRƯỜNG PHỔ THÔNG LIÊN CẤP", "School", 5)}</Row>
        <Row ss:Height="32">${cell("THỜI KHÓA BIỂU HỌC SINH", "Title", 5)}</Row>
        <Row ss:Height="24">${cell(`Lớp: ${className} · Tuần áp dụng: ${viDate(monday)} – ${viDate(friday)}`, "Subtitle", 5)}</Row>
        <Row ss:Height="36">${headerCells.join("")}</Row>
        ${rows.join("")}
        <Row ss:Height="24">${cell("Ghi chú: Học sinh có mặt tại phòng học trước giờ học 15 phút. Vui lòng theo dõi thông báo của nhà trường khi có lịch điều chỉnh.", "Note", 5)}</Row>
        <Row ss:Height="16"/>
        <Row ss:Height="22">
          <Cell ss:StyleID="SignLabel" ss:MergeAcross="2"><Data ss:Type="String">NGƯỜI LẬP BIỂU</Data></Cell>
          <Cell ss:StyleID="SignLabel" ss:MergeAcross="2"><Data ss:Type="String">BAN GIÁM HIỆU DUYỆT</Data></Cell>
        </Row>
        <Row ss:Height="18">
          <Cell ss:StyleID="SignSub" ss:MergeAcross="2"><Data ss:Type="String">(Ký và ghi rõ họ tên)</Data></Cell>
          <Cell ss:StyleID="SignSub" ss:MergeAcross="2"><Data ss:Type="String">(Ký tên và đóng dấu)</Data></Cell>
        </Row>
      </Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        <DisplayGridlines/>
        <FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane>
        <ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios>
        <PageSetup><Layout x:Orientation="Landscape"/><Header x:Margin="0.3"/><Footer x:Margin="0.3"/><PageMargins x:Bottom="0.5" x:Left="0.3" x:Right="0.3" x:Top="0.5"/></PageSetup>
        <FitToPage/>
        <Print><FitWidth>1</FitWidth><FitHeight>0</FitHeight><ValidPrinterInfo/></Print>
      </WorksheetOptions>
    </Worksheet>`;
  }).join("");

  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>Hệ thống quản lý giáo viên</Author>
    <Created>${new Date().toISOString()}</Created>
  </DocumentProperties>
  <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
    <WindowHeight>12000</WindowHeight><WindowWidth>22000</WindowWidth>
    <ProtectStructure>False</ProtectStructure><ProtectWindows>False</ProtectWindows>
  </ExcelWorkbook>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Segoe UI" ss:Size="10"/></Style>
    <Style ss:ID="Border"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
    </Borders></Style>
    <Style ss:ID="School"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Segoe UI" ss:Size="12" ss:Bold="1" ss:Color="#1E3A8A"/></Style>
    <Style ss:ID="Title"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Segoe UI" ss:Size="16" ss:Bold="1" ss:Color="#0F172A"/></Style>
    <Style ss:ID="Subtitle"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Segoe UI" ss:Size="11" ss:Italic="1" ss:Color="#334155"/></Style>
    <Style ss:ID="Header" ss:Parent="Border"><Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E40AF" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Period" ss:Parent="Border"><Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#1E3A8A"/><Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Content" ss:Parent="Border"><Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#0F172A"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Empty" ss:Parent="Border"><Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#94A3B8"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/></Style>
    <Style ss:ID="SessionBreak"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Segoe UI" ss:Size="9" ss:Bold="1" ss:Color="#475569"/><Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Note"><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Segoe UI" ss:Size="9" ss:Italic="1" ss:Color="#64748B"/></Style>
    <Style ss:ID="SignLabel"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#1E293B"/></Style>
    <Style ss:ID="SignSub"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Segoe UI" ss:Size="9" ss:Italic="1" ss:Color="#64748B"/></Style>
  </Styles>
  ${worksheets}
</Workbook>`;

  const suffix = input.classId
    ? (catalogName(input.classes, input.classId) || input.classId).replace(/[^\p{L}\p{N}_-]+/gu, "_")
    : "tat_ca_lop";

  return {
    xml: workbookXml,
    fileName: `TKB_hoc_sinh_${input.weekStart}_${suffix}.xml`,
    worksheetCount: classIds.length,
    scheduleCount: activeSchedules.length,
    classNames,
  };
}

export function downloadStudentTimetableWorkbook(workbook: StudentTimetableWorkbook) {
  const blob = new Blob(["\uFEFF", workbook.xml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = workbook.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
