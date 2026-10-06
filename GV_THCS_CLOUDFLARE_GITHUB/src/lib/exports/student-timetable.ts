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

const DAY_LABELS: Record<number, string> = {
  2: "THỨ HAI",
  3: "THỨ BA",
  4: "THỨ TƯ",
  5: "THỨ NĂM",
  6: "THỨ SÁU",
  7: "THỨ BẢY",
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

function periodLabel(row: Row, fallback: number): { name: string; time: string } {
  const name = text(row.name) || text(row.displayName) || `Tiết ${fallback}`;
  const start = text(row.startTime);
  const end = text(row.endTime);
  return {
    name,
    time: start && end ? `${start} – ${end}` : "",
  };
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

function formatRoom(rawRoom: string) {
  const r = (rawRoom || "").trim();
  if (!r || r === "—" || r === "-" || r.toLowerCase() === "chưa rõ" || r.toLowerCase() === "chưa có") {
    return "";
  }
  if (/^(phòng|p\.|sân|khu|nhà|hội trường|lab|bãi)/i.test(r)) {
    return `(${r})`;
  }
  return `(Phòng ${r})`;
}

function findHomeroomTeacher(classRow: Row | undefined, classSchedules: Row[], input: StudentTimetableExportInput): string {
  if (classRow) {
    const directId = text(classRow.homeroomTeacherId) || text(classRow.teacherId) || text(classRow.advisorTeacherId);
    if (directId) {
      const found = catalogName(input.teachers, directId);
      if (found && found !== directId) return found;
    }
    const directName = text(classRow.homeroomTeacherName) || text(classRow.teacherName);
    if (directName) return directName;
  }

  const shlSchedule = classSchedules.find((s) => {
    const sName = (text(s.subjectName) || catalogName(input.subjects, s.subjectId)).toLowerCase();
    return sName.includes("sinh hoạt lớp") || sName.includes("chủ nhiệm") || sName.includes("shl");
  });

  if (shlSchedule) {
    const tName = text(shlSchedule.teacherName) || catalogName(input.teachers, shlSchedule.actualTeacherId || shlSchedule.teacherId);
    if (tName) return tName;
  }

  return "";
}

function findHomeroomRoom(classRow: Row | undefined, input: StudentTimetableExportInput): string {
  if (!classRow) return "";
  const rName = text(classRow.roomName) || catalogName(input.rooms, classRow.roomId);
  if (!rName || rName === "—" || rName === "-") return "";
  if (/^(phòng|p\.|sân|khu|nhà|hội trường|lab)/i.test(rName)) {
    return rName;
  }
  return `Phòng ${rName}`;
}

function cleanClassName(rawName: string) {
  return rawName.replace(/^lớp\s+/i, "").trim() || rawName;
}

function plainCell(value: string, style = "Content", mergeAcross = 0) {
  const merge = mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : "";
  const escaped = xml(value).replaceAll("\r\n", "&#10;").replaceAll("\n", "&#10;");
  return `<Cell ss:StyleID="${style}"${merge}><Data ss:Type="String">${escaped}</Data></Cell>`;
}

function scheduleCellXml(matches: Row[], input: StudentTimetableExportInput, classRow?: Row) {
  if (matches.length === 0) {
    return `<Cell ss:StyleID="Empty"><Data ss:Type="String">—</Data></Cell>`;
  }

  const items = matches.map((schedule) => {
    let subject = text(schedule.subjectName) || catalogName(input.subjects, schedule.subjectId) || "Môn học";
    subject = subject.replace(/^môn:\s*/i, "").trim();

    let teacher = text(schedule.teacherName)
      || catalogName(input.teachers, schedule.actualTeacherId || schedule.teacherId)
      || "";
    teacher = teacher.replace(/^gv:\s*/i, "").trim();

    let room = text(schedule.roomName) || catalogName(input.rooms, schedule.roomId);
    if (!room && classRow) {
      room = text(classRow.roomName) || catalogName(input.rooms, classRow.roomId);
    }
    room = room.replace(/^phòng:\s*/i, "").trim();
    const formattedRoom = formatRoom(room);

    let html = `<html:B><html:Font html:Color="#1E3A8A" html:Size="10">${xml(subject.toUpperCase())}</html:Font></html:B>`;
    if (teacher) {
      html += `&#10;<html:Font html:Color="#2563EB" html:Size="9">GV: ${xml(teacher)}</html:Font>`;
    }
    if (formattedRoom) {
      html += `&#10;<html:Font html:Color="#64748B" html:Size="8.5">${xml(formattedRoom)}</html:Font>`;
    }
    return html;
  });

  const content = items.join('&#10;<html:Font html:Color="#CBD5E1">────────</html:Font>&#10;');
  return `<Cell ss:StyleID="Content"><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40">${content}</ss:Data></Cell>`;
}

export function buildStudentTimetableWorkbook(input: StudentTimetableExportInput): StudentTimetableWorkbook {
  const monday = dateOnly(input.weekStart);
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
    const rawClassName = catalogName(input.classes, classId)
      || text(activeSchedules.find((schedule) => text(schedule.classId) === classId)?.className)
      || classId;
    classNames.push(rawClassName);
    const sheetName = safeSheetName(rawClassName, usedSheetNames);
    const classSchedules = activeSchedules.filter((schedule) => text(schedule.classId) === classId);
    const classRow = input.classes.find((item) => item.id === classId);
    const classLevel = text(classSchedules[0]?.schoolLevel) || rowSchoolLevel(classRow) || "secondary";

    const hasSaturday = classSchedules.some((schedule) => Number(schedule.dayOfWeek) === 7);
    const dayNumbers = [2, 3, 4, 5, 6];
    if (hasSaturday) dayNumbers.push(7);
    const lastDayDate = addDays(monday, dayNumbers[dayNumbers.length - 1] - 2);

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

    const colSpan = dayNumbers.length; // Merge across from 0..colSpan = colSpan + 1 columns
    const halfCols = Math.floor(colSpan / 2);
    const restCols = colSpan - halfCols - 1;

    // Header row
    const headerCells = [
      `<Cell ss:StyleID="Header"><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40"><html:B><html:Font html:Color="#FFFFFF" html:Size="10">TIẾT / GIỜ</html:Font></html:B></ss:Data></Cell>`,
    ];
    for (const day of dayNumbers) {
      const dayDate = addDays(monday, day - 2);
      const dayTitle = DAY_LABELS[day] || `THỨ ${day}`;
      const dateStr = viDate(dayDate);
      headerCells.push(
        `<Cell ss:StyleID="Header"><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40"><html:B><html:Font html:Color="#FFFFFF" html:Size="10">${xml(dayTitle)}</html:Font></html:B>&#10;<html:Font html:Size="9" html:Color="#FFFFFF">${xml(dateStr)}</html:Font></ss:Data></Cell>`,
      );
    }

    // Grid rows
    const rows: string[] = [];
    periods.forEach((period) => {
      const periodInfo = periodRows.get(period);
      const { name, time } = periodInfo ? periodLabel(periodInfo, period) : { name: `Tiết ${period}`, time: "" };

      let periodHtml = `<html:B><html:Font html:Color="#1E3A8A" html:Size="9.5">${xml(name)}</html:Font></html:B>`;
      if (time) {
        periodHtml += `&#10;<html:Font html:Color="#64748B" html:Size="8.5">${xml(time)}</html:Font>`;
      }
      const periodCell = `<Cell ss:StyleID="Period"><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40">${periodHtml}</ss:Data></Cell>`;

      const dayCells = dayNumbers.map((day) => {
        const matches = classSchedules.filter((schedule) =>
          Number(schedule.dayOfWeek) === day
          && period >= Number(schedule.startPeriod || 0)
          && period < Number(schedule.endPeriod || 0),
        );
        return scheduleCellXml(matches, input, classRow);
      });

      rows.push(`<Row ss:Height="66">${periodCell}${dayCells.join("")}</Row>`);

      // Lunch break divider
      if (period === 5 && periods.some((p) => p >= 6)) {
        rows.push(`<Row ss:Height="24"><Cell ss:StyleID="SessionBreak" ss:MergeAcross="${colSpan}"><Data ss:Type="String">── NGHỈ TRƯA ──</Data></Cell></Row>`);
      }
    });

    // Subtitle information
    const cleanedClassName = cleanClassName(rawClassName);
    const homeroomTeacher = findHomeroomTeacher(classRow, classSchedules, input);
    const homeroomRoom = findHomeroomRoom(classRow, input);

    const subtitleParts: string[] = [`Lớp: ${cleanedClassName}`];
    if (homeroomTeacher) subtitleParts.push(`GVCN: ${homeroomTeacher}`);
    if (homeroomRoom) subtitleParts.push(`Phòng học: ${homeroomRoom}`);
    subtitleParts.push(`Tuần áp dụng: ${viDate(monday)} – ${viDate(lastDayDate)}`);

    const subtitleText = subtitleParts.join("   ·   ");
    const schoolTitle = (text(input.schoolName) || "TRƯỜNG PHỔ THÔNG LIÊN CẤP").toUpperCase();

    const columnDefinitions = [
      `<Column ss:Width="95"/>`,
      ...dayNumbers.map(() => `<Column ss:Width="185"/>`),
    ].join("");

    return `<Worksheet ss:Name="${xml(sheetName)}">
      <Table>
        ${columnDefinitions}
        <Row ss:Height="28">${plainCell(schoolTitle, "School", colSpan)}</Row>
        <Row ss:Height="32">${plainCell("THỜI KHÓA BIỂU HỌC SINH", "Title", colSpan)}</Row>
        <Row ss:Height="24">${plainCell(subtitleText, "Subtitle", colSpan)}</Row>
        <Row ss:Height="38">${headerCells.join("")}</Row>
        ${rows.join("")}
        <Row ss:Height="24">${plainCell("Ghi chú: Học sinh có mặt tại phòng học trước giờ học 15 phút. Khi có thay đổi về lịch học, nhà trường sẽ thông báo qua GVCN.", "Note", colSpan)}</Row>
        <Row ss:Height="16"/>
        <Row ss:Height="22">
          <Cell ss:StyleID="SignLabel" ss:MergeAcross="${halfCols}"><Data ss:Type="String">NGƯỜI LẬP BIỂU</Data></Cell>
          <Cell ss:StyleID="SignLabel" ss:MergeAcross="${restCols}"><Data ss:Type="String">BAN GIÁM HIỆU DUYỆT</Data></Cell>
        </Row>
        <Row ss:Height="18">
          <Cell ss:StyleID="SignSub" ss:MergeAcross="${halfCols}"><Data ss:Type="String">(Ký và ghi rõ họ tên)</Data></Cell>
          <Cell ss:StyleID="SignSub" ss:MergeAcross="${restCols}"><Data ss:Type="String">(Ký tên và đóng dấu)</Data></Cell>
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
    <Author>Hệ thống Quản lý Thời khóa biểu</Author>
    <Created>${new Date().toISOString()}</Created>
  </DocumentProperties>
  <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
    <WindowHeight>12000</WindowHeight><WindowWidth>22000</WindowWidth>
    <ProtectStructure>False</ProtectStructure><ProtectWindows>False</ProtectWindows>
  </ExcelWorkbook>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10"/>
    </Style>
    <Style ss:ID="School">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="12" ss:Bold="1" ss:Color="#1E3A8A"/>
    </Style>
    <Style ss:ID="Title">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="16" ss:Bold="1" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="Subtitle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Italic="1" ss:Color="#334155"/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E3A8A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E3A8A"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E3A8A"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E3A8A"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Period">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#1E293B"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Content">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#0F172A"/>
      <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Empty">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#94A3B8"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="SessionBreak">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Italic="1" ss:Color="#475569"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Note">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Italic="1" ss:Color="#64748B"/>
    </Style>
    <Style ss:ID="SignLabel">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#1E293B"/>
    </Style>
    <Style ss:ID="SignSub">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Italic="1" ss:Color="#64748B"/>
    </Style>
  </Styles>
  ${worksheets}
</Workbook>`;

  const schoolNameLower = (input.schoolName || "").toLowerCase();
  const prefix = schoolNameLower.includes("tiểu học") || schoolNameLower.includes("tieu hoc")
    ? "TKB_Tieu_Hoc"
    : (schoolNameLower.includes("thcs") || schoolNameLower.includes("trung học cơ sở"))
      ? "TKB_THCS"
      : "TKB_hoc_sinh";

  const suffix = input.classId
    ? (catalogName(input.classes, input.classId) || input.classId).replace(/[^\p{L}\p{N}_-]+/gu, "_")
    : "tat_ca_lop";

  return {
    xml: workbookXml,
    fileName: `${prefix}_${input.weekStart}_${suffix}.xml`,
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
