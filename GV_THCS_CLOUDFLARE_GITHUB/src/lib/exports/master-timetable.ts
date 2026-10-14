type Row = Record<string, unknown> & { id: string };

export type MasterTimetableExportInput = {
  schoolName?: string;
  schoolYear?: string;
  weekStart: string;
  schoolLevel?: "primary" | "secondary" | "all";
  schedules: Row[];
  classes: Row[];
  subjects: Row[];
  teachers: Row[];
  rooms: Row[];
  timeSlots?: Row[];
};

export type MasterTimetableWorkbook = {
  xml: string;
  fileName: string;
  levelName: string;
  scheduleCount: number;
  classCount: number;
};

const DAY_LABELS: Record<number, string> = {
  2: "THỨ 2",
  3: "THỨ 3",
  4: "THỨ 4",
  5: "THỨ 5",
  6: "THỨ 6",
  7: "THỨ 7",
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

function viDayMonth(date: Date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}

function viFullDate(date: Date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function numericGrade(value: unknown) {
  const grade = Number(value);
  return Number.isInteger(grade) && grade >= 1 && grade <= 9 ? grade : 0;
}

function inferGradeFromName(name: unknown): number {
  const str = String(name ?? "").trim();
  const match = /(?:khối|khoi|lớp|lop|g|cls[_-]\d{4}[_-]g)?\s*0?([1-9])(?:[.\-_a-z/]|\b)/i.exec(str);
  if (match) return Number(match[1]);
  return 0;
}

function classGrade(classRow: Row | undefined): number {
  if (!classRow) return 0;
  return numericGrade(classRow.grade ?? classRow.gradeLevel) || inferGradeFromName(classRow.name ?? classRow.code);
}

function classSchoolLevel(classRow: Row | undefined): "primary" | "secondary" | "" {
  if (!classRow) return "";
  const explicit = text(classRow.schoolLevel);
  if (explicit === "primary" || explicit === "secondary") return explicit;
  const grade = classGrade(classRow);
  if (grade >= 1 && grade <= 5) return "primary";
  if (grade >= 6 && grade <= 9) return "secondary";
  return "";
}

function formatClassName(raw: string) {
  const trimmed = raw.trim();
  if (/^lớp\s+/i.test(trimmed)) {
    return `LỚP ${trimmed.replace(/^lớp\s+/i, "").toUpperCase()}`;
  }
  return `LỚP ${trimmed.toUpperCase()}`;
}

export function formatSubjectCode(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const lower = s.toLowerCase();

  if (lower.includes("khoa học tự nhiên - hoá") || lower.includes("khtn - hoá") || lower.includes("khtn-hóa")) return "KHTN-Hóa";
  if (lower.includes("khoa học tự nhiên - lý") || lower.includes("khtn - lý") || lower.includes("khtn-lý")) return "KHTN-LÝ";
  if (lower.includes("khoa học tự nhiên - sinh") || lower.includes("khtn - sinh")) return "KHTN-Sinh";
  if (lower.includes("khoa học tự nhiên") || lower === "khtn") return "KHTN";
  if (lower.includes("lịch sử và địa lí") || lower.includes("lịch sử và địa lý") || lower.includes("ls-đl") || lower.includes("ls&đl") || lower.includes("lsđl")) return "LS-ĐL";
  if (lower.includes("giáo dục công dân") || lower === "gdcd" || lower === "cd") return "CD";
  if (lower.includes("giáo dục địa phương") || lower === "gdđp") return "GDĐP";
  if (lower.includes("giáo dục thể chất") || lower === "gdtc" || lower.includes("thể dục")) return "GDTC";
  if (lower.includes("công nghệ") || lower.includes("c.nghệ")) return "C.NGHỆ";
  if (lower.includes("tin học")) return "TIN HỌC";
  if (lower.includes("âm nhạc")) return "ÂM NHẠC";
  if (lower.includes("mĩ thuật") || lower.includes("mỹ thuật")) return "MĨ THUẬT";
  if (lower.includes("hoạt động trải nghiệm") || lower.includes("sinh hoạt dưới cờ") || lower.includes("sinh hoạt lớp") || lower.includes("shcn") || lower.includes("hđtn")) return "SHCN/HĐTN";
  if (lower.includes("tiếng việt")) return "TIẾNG VIỆT";
  if (lower.includes("ngữ văn") || lower === "văn") return "VĂN";
  if (lower.includes("tiếng anh") || lower.includes("anh văn") || lower === "anh") return "ANH";
  if (lower.includes("toán")) return "TOÁN";

  return s.replace(/\s+[1-9]$/, "").toUpperCase();
}

function formatTeacherDisplay(schedule: Row, input: MasterTimetableExportInput): string {
  const subjectName = (text(schedule.subjectName) || catalogName(input.subjects, schedule.subjectId)).toLowerCase();
  const roomName = (text(schedule.roomName) || catalogName(input.rooms, schedule.roomId)).toLowerCase();

  // Special case for physical education (GDTC) on playground/sân trường
  if ((subjectName.includes("thể chất") || subjectName === "gdtc") && (roomName.includes("sân") || roomName.includes("san"))) {
    return "-Sân Trường-";
  }

  let teacher = text(schedule.teacherName)
    || catalogName(input.teachers, schedule.actualTeacherId || schedule.teacherId)
    || "";
  teacher = teacher.replace(/^gv:\s*/i, "").trim();

  // If teacher name is empty but room has info like Sân Trường
  if (!teacher && (roomName.includes("sân") || roomName.includes("san"))) {
    return "-Sân Trường-";
  }

  return teacher;
}

function safeSheetName(value: string, used: Set<string>) {
  const base = (value || "TKB")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "TKB";
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

/**
 * Builds a single master sheet for either primary (Cấp 1) or secondary (Cấp 2).
 */
function buildMasterWorksheet(
  targetLevel: "primary" | "secondary",
  input: MasterTimetableExportInput,
  monday: Date,
  usedSheetNames: Set<string>,
): { worksheetXml: string; scheduleCount: number; classCount: number } {
  // Filter active schedules for this level and week
  const levelSchedules = input.schedules.filter((s) => {
    if (s.status === "cancelled") return false;
    if (text(s.weekStart) !== input.weekStart) return false;
    const cls = input.classes.find((c) => c.id === s.classId);
    const lvl = text(s.schoolLevel) || classSchoolLevel(cls) || "secondary";
    return lvl === targetLevel;
  });

  // Filter classes for this level
  const levelClasses = input.classes
    .filter((c) => classSchoolLevel(c) === targetLevel && c.isActive !== false && c.status !== "inactive")
    .sort((a, b) => {
      const gA = classGrade(a);
      const gB = classGrade(b);
      if (gA !== gB) return gA - gB;
      const nA = text(a.name) || a.id;
      const nB = text(b.name) || b.id;
      return nA.localeCompare(nB, "vi", { numeric: true });
    });

  const hasSaturday = levelSchedules.some((s) => Number(s.dayOfWeek) === 7);
  const weekdays = [2, 3, 4, 5, 6];
  if (hasSaturday) weekdays.push(7);

  const lastDayDate = addDays(monday, weekdays[weekdays.length - 1] - 2);

  // School Year title
  const monYear = monday.getFullYear();
  const monMonth = monday.getMonth() + 1;
  const schoolYear = input.schoolYear || (monMonth >= 8 ? `${monYear}-${monYear + 1}` : `${monYear - 1}-${monYear}`);
  const titleText = `THỜI KHOÁ BIỂU NĂM HỌC ${schoolYear}`;
  const subtitleText = `Áp dụng từ ngày ${viDayMonth(monday)}->${viFullDate(lastDayDate)}`;

  // Afternoon periods: 4 periods (6..9) or 5 periods (6..10)
  // Morning periods: 4 periods (1..4) or 5 periods (1..5)
  const maxMorningPeriod = 4;
  const maxAfternoonPeriod = 4;

  const totalCols = 1 + weekdays.length * 4;

  // Group classes by grade
  const classesByGrade = new Map<number, Row[]>();
  levelClasses.forEach((cls) => {
    const g = classGrade(cls);
    if (!classesByGrade.has(g)) classesByGrade.set(g, []);
    classesByGrade.get(g)!.push(cls);
  });
  const sortedGrades = [...classesByGrade.keys()].sort((a, b) => a - b);

  // -------------------------------------------------------------
  // CA SÁNG SECTION
  // Check if Cấp 2 follows the rotational room/grade pattern like Image 2:
  // e.g. Max 1 grade per morning day, and classes share 3 branch rooms (P.3.5, P.NX2, P.TV1)
  // -------------------------------------------------------------
  const morningSchedules = levelSchedules.filter((s) => Number(s.startPeriod || 0) <= 5);

  let isRotationalMorning = false;
  let rotationalBranchRows: Array<{
    branchIndex: number;
    roomName: string;
    classCodes: string;
    classes: Row[];
  }> = [];

  if (targetLevel === "secondary") {
    // Check if on each day at most 1 grade is scheduled in the morning
    const morningDaysWithSingleGrade = weekdays.every((day) => {
      const daySchedules = morningSchedules.filter((s) => Number(s.dayOfWeek) === day);
      if (daySchedules.length === 0) return true;
      const gradesOnDay = new Set(daySchedules.map((s) => {
        const cls = input.classes.find((c) => c.id === s.classId);
        return classGrade(cls);
      }));
      return gradesOnDay.size <= 1;
    });

    if (morningDaysWithSingleGrade) {
      isRotationalMorning = true;

      // Group classes by branch suffix (e.g. 1, 2, 3 from 6/1, 6/2, 6/3 or 6.1, 6.2, 6.3)
      const branchMap = new Map<number, Row[]>();
      levelClasses.forEach((cls) => {
        const cName = text(cls.name) || text(cls.code);
        const match = /[./_-]([1-9])\b/.exec(cName) || /\b([1-9])$/.exec(cName);
        const branch = match ? Number(match[1]) : 1;
        if (!branchMap.has(branch)) branchMap.set(branch, []);
        branchMap.get(branch)!.push(cls);
      });

      const branchIndices = [...branchMap.keys()].sort((a, b) => a - b);
      rotationalBranchRows = branchIndices.map((bIdx) => {
        const bClasses = branchMap.get(bIdx)!;
        // Find room used by these classes in morning
        let detectedRoom = "";
        for (const cls of bClasses) {
          const sWithRoom = morningSchedules.find((s) => s.classId === cls.id && (s.roomId || s.roomName));
          if (sWithRoom) {
            detectedRoom = text(sWithRoom.roomName) || catalogName(input.rooms, sWithRoom.roomId);
            if (detectedRoom) break;
          }
        }
        if (!detectedRoom && bClasses[0]) {
          detectedRoom = text(bClasses[0].roomName) || catalogName(input.rooms, bClasses[0].roomId);
        }
        // Fallback standard room names if available
        if (!detectedRoom) {
          if (bIdx === 1) detectedRoom = "P.3.5";
          else if (bIdx === 2) detectedRoom = "P.NX2";
          else if (bIdx === 3) detectedRoom = "P.TV1";
          else detectedRoom = `Phòng ${bIdx}`;
        }

        const classList = bClasses
          .map((c) => {
            const raw = text(c.name) || text(c.code) || c.id;
            return raw.replace(/^lớp\s+/i, "");
          })
          .join(", ");

        return {
          branchIndex: bIdx,
          roomName: detectedRoom,
          classCodes: `LỚP ${classList}`,
          classes: bClasses,
        };
      });
    }
  }

  // Build CA SÁNG Header Rows
  const morningHeaderRow1: string[] = [
    `<Cell ss:StyleID="DayHeaderYellow"><Data ss:Type="String"></Data></Cell>`,
  ];
  const morningHeaderRow2: string[] = [
    `<Cell ss:StyleID="PeriodHeader"><Data ss:Type="String"></Data></Cell>`,
  ];

  weekdays.forEach((day) => {
    let dayTitle = DAY_LABELS[day] || `THỨ ${day}`;
    if (isRotationalMorning) {
      // Find which grade is on this day in the morning
      const dayMorning = morningSchedules.filter((s) => Number(s.dayOfWeek) === day);
      if (dayMorning.length > 0) {
        const cls = input.classes.find((c) => c.id === dayMorning[0].classId);
        const g = classGrade(cls);
        if (g > 0) {
          dayTitle += `&#10;KHỐI ${g}`;
        }
      } else {
        // Fallback default grade rotation: 2->6, 3->7, 4->7, 5->8, 6->9
        const fallbackGrade = day === 2 ? 6 : day === 3 || day === 4 ? 7 : day === 5 ? 8 : day === 6 ? 9 : 0;
        if (fallbackGrade) dayTitle += `&#10;KHỐI ${fallbackGrade}`;
      }
    }

    morningHeaderRow1.push(
      `<Cell ss:StyleID="DayHeaderYellow" ss:MergeAcross="3"><Data ss:Type="String">${dayTitle}</Data></Cell>`,
    );

    for (let p = 1; p <= maxMorningPeriod; p++) {
      morningHeaderRow2.push(
        `<Cell ss:StyleID="PeriodHeader"><Data ss:Type="String">Tiết ${p}</Data></Cell>`,
      );
    }
  });

  // Build CA SÁNG Data Rows
  const morningDataRows: string[] = [];

  if (isRotationalMorning && rotationalBranchRows.length > 0) {
    rotationalBranchRows.forEach((branch) => {
      const leftCellContent = `<html:B><html:Font html:Color="#C00000" html:Size="9.5">${xml(branch.roomName)}</html:Font></html:B>&#10;<html:B><html:Font html:Color="#C00000" html:Size="8.5">${xml(branch.classCodes)}</html:Font></html:B>`;
      const rowCells: string[] = [
        `<Cell ss:StyleID="ClassLabelYellow"><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40">${leftCellContent}</ss:Data></Cell>`,
      ];

      weekdays.forEach((day) => {
        // Find which class of this branch has schedules on this day
        for (let p = 1; p <= maxMorningPeriod; p++) {
          const matches = morningSchedules.filter((s) => {
            const d = Number(s.dayOfWeek || 0);
            const start = Number(s.startPeriod || 0);
            const end = Number(s.endPeriod || start + 1);
            if (d !== day || p < start || p >= end) return false;
            return branch.classes.some((c) => c.id === s.classId);
          });

          if (matches.length > 0) {
            const items = matches.map((match) => {
              const rawSubj = text(match.subjectName) || catalogName(input.subjects, match.subjectId) || "Môn học";
              const subj = formatSubjectCode(rawSubj);
              const teacher = formatTeacherDisplay(match, input);
              return `<html:B><html:Font html:Size="9.5" html:Color="#000000">${xml(subj)}</html:Font></html:B>&#10;<html:Font html:Size="8.5" html:Color="#333333">${xml(teacher)}</html:Font>`;
            });
            const content = items.join('&#10;<html:Font html:Color="#A6A6A6">───</html:Font>&#10;');
            rowCells.push(
              `<Cell ss:StyleID="ContentCell"><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40">${content}</ss:Data></Cell>`,
            );
          } else {
            rowCells.push(`<Cell ss:StyleID="EmptyCell"><Data ss:Type="String"></Data></Cell>`);
          }
        }
      });

      morningDataRows.push(`<Row ss:Height="46">${rowCells.join("")}</Row>`);
    });
  } else {
    // Non-rotational: render morning rows by class (standard primary or regular secondary)
    sortedGrades.forEach((grade, gIdx) => {
      const gradeClasses = classesByGrade.get(grade) || [];
      gradeClasses.forEach((cls) => {
        const className = formatClassName(text(cls.name) || text(cls.code) || cls.id);
        const rowCells: string[] = [
          `<Cell ss:StyleID="ClassLabelYellow"><Data ss:Type="String">${xml(className)}</Data></Cell>`,
        ];

        weekdays.forEach((day) => {
          for (let p = 1; p <= maxMorningPeriod; p++) {
            const matches = morningSchedules.filter((s) => {
              if (s.classId !== cls.id) return false;
              const d = Number(s.dayOfWeek || 0);
              const start = Number(s.startPeriod || 0);
              const end = Number(s.endPeriod || start + 1);
              return d === day && start <= p && p < end;
            });

            if (matches.length > 0) {
              const items = matches.map((match) => {
                const rawSubj = text(match.subjectName) || catalogName(input.subjects, match.subjectId) || "Môn học";
                const subj = formatSubjectCode(rawSubj);
                const teacher = formatTeacherDisplay(match, input);
                return `<html:B><html:Font html:Size="9.5" html:Color="#000000">${xml(subj)}</html:Font></html:B>&#10;<html:Font html:Size="8.5" html:Color="#333333">${xml(teacher)}</html:Font>`;
              });
              const content = items.join('&#10;<html:Font html:Color="#A6A6A6">───</html:Font>&#10;');
              rowCells.push(
                `<Cell ss:StyleID="ContentCell"><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40">${content}</ss:Data></Cell>`,
              );
            } else {
              rowCells.push(`<Cell ss:StyleID="EmptyCell"><Data ss:Type="String"></Data></Cell>`);
            }
          }
        });

        morningDataRows.push(`<Row ss:Height="40">${rowCells.join("")}</Row>`);
      });

      if (gIdx < sortedGrades.length - 1) {
        morningDataRows.push(
          `<Row ss:Height="8"><Cell ss:StyleID="DividerRow" ss:MergeAcross="${totalCols - 1}"><Data ss:Type="String"></Data></Cell></Row>`,
        );
      }
    });
  }

  // -------------------------------------------------------------
  // CA CHIỀU SECTION
  // In Vietnam, afternoon periods are 6, 7, 8, 9 (slot 6 = Tiết 1 chiều, 7 = Tiết 2, ...)
  // -------------------------------------------------------------
  const afternoonSchedules = levelSchedules.filter((s) => Number(s.startPeriod || 0) > 5);

  const afternoonHeaderRow1: string[] = [
    `<Cell ss:StyleID="DayHeaderYellow"><Data ss:Type="String"></Data></Cell>`,
  ];
  const afternoonHeaderRow2: string[] = [
    `<Cell ss:StyleID="PeriodHeader"><Data ss:Type="String"></Data></Cell>`,
  ];

  weekdays.forEach((day) => {
    const dayTitle = DAY_LABELS[day] || `THỨ ${day}`;
    afternoonHeaderRow1.push(
      `<Cell ss:StyleID="DayHeaderYellow" ss:MergeAcross="3"><Data ss:Type="String">${dayTitle}</Data></Cell>`,
    );

    for (let p = 1; p <= maxAfternoonPeriod; p++) {
      afternoonHeaderRow2.push(
        `<Cell ss:StyleID="PeriodHeader"><Data ss:Type="String">Tiết ${p}</Data></Cell>`,
      );
    }
  });

  const afternoonDataRows: string[] = [];

  sortedGrades.forEach((grade, gIdx) => {
    const gradeClasses = classesByGrade.get(grade) || [];
    gradeClasses.forEach((cls) => {
      const className = formatClassName(text(cls.name) || text(cls.code) || cls.id);
      const rowCells: string[] = [
        `<Cell ss:StyleID="ClassLabelYellow"><Data ss:Type="String">${xml(className)}</Data></Cell>`,
      ];

      weekdays.forEach((day) => {
        for (let pIndex = 1; pIndex <= maxAfternoonPeriod; pIndex++) {
          // Map afternoon period 1..4 to slot period 6..9 (or 1..4 if schedules use relative indexing)
          const slotPeriod = pIndex + 5;
          const matches = afternoonSchedules.filter((s) => {
            if (s.classId !== cls.id) return false;
            const d = Number(s.dayOfWeek || 0);
            const start = Number(s.startPeriod || 0);
            const end = Number(s.endPeriod || start + 1);
            return d === day && ((start <= slotPeriod && slotPeriod < end) || (start <= pIndex && pIndex < end));
          });

          if (matches.length > 0) {
            const items = matches.map((match) => {
              const rawSubj = text(match.subjectName) || catalogName(input.subjects, match.subjectId) || "Môn học";
              const subj = formatSubjectCode(rawSubj);
              const teacher = formatTeacherDisplay(match, input);
              return `<html:B><html:Font html:Size="9.5" html:Color="#000000">${xml(subj)}</html:Font></html:B>&#10;<html:Font html:Size="8.5" html:Color="#333333">${xml(teacher)}</html:Font>`;
            });
            const content = items.join('&#10;<html:Font html:Color="#A6A6A6">───</html:Font>&#10;');
            rowCells.push(
              `<Cell ss:StyleID="ContentCell"><ss:Data ss:Type="String" xmlns="http://www.w3.org/TR/REC-html40">${content}</ss:Data></Cell>`,
            );
          } else {
            rowCells.push(`<Cell ss:StyleID="EmptyCell"><Data ss:Type="String"></Data></Cell>`);
          }
        }
      });

      afternoonDataRows.push(`<Row ss:Height="40">${rowCells.join("")}</Row>`);
    });

    if (gIdx < sortedGrades.length - 1) {
      afternoonDataRows.push(
        `<Row ss:Height="8"><Cell ss:StyleID="DividerRow" ss:MergeAcross="${totalCols - 1}"><Data ss:Type="String"></Data></Cell></Row>`,
      );
    }
  });

  // Column definitions
  const columnXmls = [
    `<Column ss:Width="95"/>`,
    ...Array.from({ length: weekdays.length * 4 }, () => `<Column ss:Width="70"/>`),
  ].join("");

  const sheetTitle = targetLevel === "primary" ? "TKB Tổng Thể Cấp 1" : "TKB Tổng Thể Cấp 2";
  const validSheetName = safeSheetName(sheetTitle, usedSheetNames);

  const worksheetXml = `
  <Worksheet ss:Name="${xml(validSheetName)}">
    <Table>
      ${columnXmls}
      <Row ss:Height="12"/>
      <Row ss:Height="32">
        <Cell ss:StyleID="DocTitle" ss:MergeAcross="${totalCols - 1}"><Data ss:Type="String">${xml(titleText)}</Data></Cell>
      </Row>
      <Row ss:Height="24">
        <Cell ss:StyleID="DocSubtitle" ss:MergeAcross="${totalCols - 1}"><Data ss:Type="String">${xml(subtitleText)}</Data></Cell>
      </Row>
      <Row ss:Height="10"/>

      <!-- CA SÁNG SECTION -->
      <Row ss:Height="24">
        <Cell ss:StyleID="MorningBanner" ss:MergeAcross="2"><Data ss:Type="String">CA SÁNG</Data></Cell>
      </Row>
      <Row ss:Height="28">
        ${morningHeaderRow1.join("")}
      </Row>
      <Row ss:Height="22">
        ${morningHeaderRow2.join("")}
      </Row>
      ${morningDataRows.join("")}

      <Row ss:Height="16"/>

      <!-- CA CHIỀU SECTION -->
      <Row ss:Height="24">
        <Cell ss:StyleID="AfternoonBanner" ss:MergeAcross="2"><Data ss:Type="String">CA CHIỀU</Data></Cell>
      </Row>
      <Row ss:Height="28">
        ${afternoonHeaderRow1.join("")}
      </Row>
      <Row ss:Height="22">
        ${afternoonHeaderRow2.join("")}
      </Row>
      ${afternoonDataRows.join("")}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <DisplayGridlines/>
      <FreezePanes/><FrozenNoSplit/><SplitHorizontal>6</SplitHorizontal><SplitVertical>1</SplitVertical><TopRowBottomPane>6</TopRowBottomPane><LeftColumnRightPane>1</LeftColumnRightPane>
      <PageSetup>
        <Layout x:Orientation="Landscape" x:CenterHorizontal="1"/>
        <Header x:Margin="0.2"/>
        <Footer x:Margin="0.2"/>
        <PageMargins x:Bottom="0.3" x:Left="0.3" x:Right="0.3" x:Top="0.3"/>
      </PageSetup>
      <FitToPage/>
      <Print>
        <FitWidth>1</FitWidth>
        <FitHeight>0</FitHeight>
        <PaperSizeIndex>9</PaperSizeIndex>
        <ValidPrinterInfo/>
      </Print>
    </WorksheetOptions>
  </Worksheet>`;

  return {
    worksheetXml,
    scheduleCount: levelSchedules.length,
    classCount: levelClasses.length,
  };
}

export function buildMasterTimetableWorkbook(input: MasterTimetableExportInput): MasterTimetableWorkbook {
  const monday = dateOnly(input.weekStart);
  const targetLevel = input.schoolLevel || "secondary";

  const usedSheetNames = new Set<string>();
  let worksheetsXml = "";
  let totalSchedules = 0;
  let totalClasses = 0;
  let levelName = "";

  if (targetLevel === "all") {
    levelName = "Toàn trường";
    const primaryResult = buildMasterWorksheet("primary", input, monday, usedSheetNames);
    const secondaryResult = buildMasterWorksheet("secondary", input, monday, usedSheetNames);
    worksheetsXml = primaryResult.worksheetXml + secondaryResult.worksheetXml;
    totalSchedules = primaryResult.scheduleCount + secondaryResult.scheduleCount;
    totalClasses = primaryResult.classCount + secondaryResult.classCount;
  } else if (targetLevel === "primary") {
    levelName = "Cấp 1";
    const result = buildMasterWorksheet("primary", input, monday, usedSheetNames);
    worksheetsXml = result.worksheetXml;
    totalSchedules = result.scheduleCount;
    totalClasses = result.classCount;
  } else {
    levelName = "Cấp 2";
    const result = buildMasterWorksheet("secondary", input, monday, usedSheetNames);
    worksheetsXml = result.worksheetXml;
    totalSchedules = result.scheduleCount;
    totalClasses = result.classCount;
  }

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
    <Style ss:ID="DocTitle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="17" ss:Bold="1" ss:Color="#C00000"/>
    </Style>
    <Style ss:ID="DocSubtitle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="13" ss:Bold="1" ss:Color="#C00000"/>
    </Style>
    <Style ss:ID="MorningBanner">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
      <Interior ss:Color="#92D050" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="AfternoonBanner">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
      <Interior ss:Color="#F8CECC" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="DayHeaderYellow">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
      <Interior ss:Color="#FFFF00" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="PeriodHeader">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#000000"/>
      <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="ClassLabelYellow">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#C00000"/>
      <Interior ss:Color="#FFFF00" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="ContentCell">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A6A6A6"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A6A6A6"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A6A6A6"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A6A6A6"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#000000"/>
      <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="EmptyCell">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A6A6A6"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A6A6A6"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A6A6A6"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A6A6A6"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#999999"/>
      <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="DividerRow">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
        <Border ss:Position="Top" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
      </Borders>
      <Interior ss:Color="#EFEFEF" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${worksheetsXml}
</Workbook>`;

  const levelSlug = targetLevel === "primary" ? "Cap1" : targetLevel === "secondary" ? "Cap2" : "ToanTruong";
  const fileName = `TKB_TongThe_${levelSlug}_${input.weekStart}.xml`;

  return {
    xml: workbookXml,
    fileName,
    levelName,
    scheduleCount: totalSchedules,
    classCount: totalClasses,
  };
}

export function downloadMasterTimetableWorkbook(workbook: MasterTimetableWorkbook) {
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
