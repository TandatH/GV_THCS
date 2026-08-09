export type AiScheduleRequirement = {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherType: "co_huu" | "thinh_giang";
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  roomId: string;
  roomName: string;
  campusId: string;
  departmentId: string;
  periodsPerWeek: number;
};

export type AiScheduleExisting = {
  teacherId: string;
  classId: string;
  roomId: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
};

export type AiScheduleAvailability = {
  teacherId: string;
  approvedSlots: string[];
};

export type AiScheduleTeacher = {
  teacherId: string;
  teacherType: "co_huu" | "thinh_giang";
  standardPeriodsPerWeek: number | null;
};

export type AiScheduleRequest = {
  semesterId: string;
  schoolYearId: string;
  weekStart: string;
  periods: number[];
  requirements: AiScheduleRequirement[];
  existingSchedules: AiScheduleExisting[];
  availability: AiScheduleAvailability[];
  teachers: AiScheduleTeacher[];
  options: {
    maxConsecutivePeriods: number;
    spreadSameRequirementAcrossDays: boolean;
    preferEarlierPeriods: boolean;
    enforceStandardPeriods: boolean;
    maxSolveSeconds: number;
  };
};

export type AiScheduleSuggestion = {
  requirementId: string;
  lessonIndex: number;
  teacherId: string;
  subjectId: string;
  classId: string;
  roomId: string;
  campusId: string;
  departmentId: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
};

export type AiScheduleResponse = {
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN";
  schedules: AiScheduleSuggestion[];
  diagnostics: string[];
  objectiveValue?: number;
  solveSeconds?: number;
};
