import type { HomeroomReportFormData, HomeroomSubmissionType } from "@school/shared";

export interface HomeroomWeekOption {
  weekNumber: number;
  weekKey: string; // `${schoolYearId}_w${weekNumber}`
  weekId?: string;
  label: string;
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  isLocked?: boolean;
  isCurrent?: boolean;
}

export function createEmptyHomeroomForm(totalStudents = 0): HomeroomReportFormData {
  return {
    meetingDate: new Date().toISOString().slice(0, 10),
    totalStudents,
    presentCount: totalStudents,
    absentWithPermission: "",
    absentWithoutPermission: "",
    tardyCount: 0,
    disciplineOverview: "",
    disciplineRankOrScore: "",
    notableViolations: "",
    academicOverview: "",
    goodSessionsCount: 0,
    badSessionsCount: 0,
    commendations: "",
    parentCoordination: "",
    movementActivities: "",
    nextWeekPlan: "",
    teacherRecommendations: "",
  };
}

export function hasMeaningfulFormContent(form: HomeroomReportFormData): boolean {
  const textFields = [
    form.absentWithPermission,
    form.absentWithoutPermission,
    form.disciplineOverview,
    form.disciplineRankOrScore,
    form.notableViolations,
    form.academicOverview,
    form.commendations,
    form.parentCoordination,
    form.movementActivities,
    form.nextWeekPlan,
    form.teacherRecommendations,
  ];
  return (
    textFields.some((val) => (val || "").trim().length > 0) ||
    form.totalStudents > 0 ||
    form.tardyCount > 0 ||
    form.goodSessionsCount > 0 ||
    form.badSessionsCount > 0
  );
}

export function buildHomeroomWeekOptions(
  schoolYearId: string,
  disciplineWeeks: Array<{
    id: string;
    weekNumber: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    isLocked?: boolean;
    schoolLevel?: string;
  }>,
): HomeroomWeekOption[] {
  const byNumber = new Map<number, (typeof disciplineWeeks)[number]>();
  for (const w of disciplineWeeks) {
    if ((w.schoolLevel || "secondary") !== "secondary") continue;
    if (Number.isInteger(w.weekNumber) && w.weekNumber >= 1 && w.weekNumber <= 52) {
      byNumber.set(w.weekNumber, w);
    }
  }

  const maxWeek = Math.max(35, ...Array.from(byNumber.keys()));
  const todayIso = new Date().toISOString().slice(0, 10);
  const options: HomeroomWeekOption[] = [];

  for (let weekNum = 1; weekNum <= maxWeek; weekNum += 1) {
    const doc = byNumber.get(weekNum);
    const dateRange =
      doc?.startDate && doc?.endDate
        ? `${formatShortVnDate(doc.startDate)} - ${formatShortVnDate(doc.endDate)}`
        : undefined;
    const isCurrent = Boolean(
      doc?.startDate && doc?.endDate && todayIso >= doc.startDate && todayIso <= doc.endDate,
    );
    options.push({
      weekNumber: weekNum,
      weekKey: `${schoolYearId}_w${weekNum}`,
      weekId: doc?.id,
      label: `Tuần ${weekNum}${dateRange ? ` (${dateRange})` : ""}`,
      dateRange,
      startDate: doc?.startDate,
      endDate: doc?.endDate,
      isLocked: doc?.status === "locked" || doc?.isLocked === true,
      isCurrent,
    });
  }

  return options;
}

function formatShortVnDate(isoDate?: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function submissionTypeLabel(type: HomeroomSubmissionType): string {
  switch (type) {
    case "form_only":
      return "Form điện tử";
    case "photo_only":
      return "Ảnh chụp sổ giấy";
    case "hybrid":
      return "Form + Ảnh chụp";
    default:
      return "Báo cáo";
  }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Nén và (tùy chọn) xoay ảnh phía trình duyệt bằng Canvas trước khi tải lên Firebase Storage.
 * Giúp ảnh chụp từ điện thoại (~5-10MB) giảm còn ~600KB-1.2MB mà vẫn giữ chữ viết tay sắc nét.
 */
export async function processImageForUpload(
  file: File,
  options: { maxDimension?: number; quality?: number; rotateDegrees?: number } = {},
): Promise<{ blob: Blob; width: number; height: number; fileName: string }> {
  const maxDimension = options.maxDimension ?? 2048;
  const quality = options.quality ?? 0.84;
  const rotateDegrees = ((options.rotateDegrees ?? 0) % 360 + 360) % 360;

  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
  const scaledW = Math.max(1, Math.round(srcW * scale));
  const scaledH = Math.max(1, Math.round(srcH * scale));

  const swapAxes = rotateDegrees === 90 || rotateDegrees === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapAxes ? scaledH : scaledW;
  canvas.height = swapAxes ? scaledW : scaledH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Trình duyệt không hỗ trợ xử lý ảnh Canvas.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (rotateDegrees !== 0) {
    ctx.rotate((rotateDegrees * Math.PI) / 180);
  }
  ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Không thể nén ảnh."));
      },
      "image/jpeg",
      quality,
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "so_sh_gvcn";
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    fileName: `${baseName}.jpg`,
  };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không thể đọc tệp hình ảnh."));
    };
    img.src = objectUrl;
  });
}
