"use client";

import type { ScheduleInput } from "@school/shared";
import {
  BrainCircuit,
  CalendarCheck2,
  CirclePlus,
  Clock3,
  Info,
  Loader2,
  Play,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { collection, limit, onSnapshot, query, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { generateScheduleWithCpSat } from "@/features/ai-scheduler/callable";
import type {
  AiScheduleRequest,
  AiScheduleRequirement,
  AiScheduleResponse,
  AiScheduleSuggestion,
} from "@/features/ai-scheduler/types";
import { createOrUpdateSchedule, firebaseErrorMessage } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { currentWeekStartDateOnly } from "@/lib/date-only";
import { classGrade, gradeScopeForSubject, teacherCanTeachClass } from "@/lib/teaching-assignments";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";

type CatalogRow = DocumentData & { id: string };
type ScheduleRow = DocumentData & { id: string };
type AvailabilityRow = DocumentData & { id: string };
type ScheduleMode = "fill_missing" | "reoptimize_selected";

type RequirementForm = {
  teacherId: string;
  subjectId: string;
  classId: string;
  roomId: string;
  periodsPerWeek: string;
};

const emptyRequirement: RequirementForm = {
  teacherId: "",
  subjectId: "",
  classId: "",
  roomId: "",
  periodsPerWeek: "1",
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function catalogName(row: CatalogRow | undefined | null) {
  if (!row) return "";
  return textValue(row.fullName)
    || textValue(row.name)
    || textValue(row.displayName)
    || textValue(row.code)
    || textValue(row.email)
    || row.id;
}

function activeRows(rows: CatalogRow[]) {
  return rows
    .filter((row) => row.isActive !== false && row.status !== "inactive" && row.status !== "archived")
    .sort((a, b) => catalogName(a).localeCompare(catalogName(b), "vi"));
}

function periodNumber(row: CatalogRow) {
  return Number(row.periodNumber ?? row.order ?? row.period ?? 0);
}

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function futureDeadlineIso() {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
}

function scheduleTeacherId(row: ScheduleRow) {
  return textValue(row.actualTeacherId) || textValue(row.teacherId);
}

function schedulePeriodCount(row: ScheduleRow) {
  const start = Number(row.startPeriod);
  const end = Number(row.endPeriod);
  return Number.isInteger(start) && Number.isInteger(end) && end > start ? end - start : 0;
}

function scheduleMatchesRequirement(row: ScheduleRow, requirement: AiScheduleRequirement) {
  return scheduleTeacherId(row) === requirement.teacherId
    && textValue(row.subjectId) === requirement.subjectId
    && textValue(row.classId) === requirement.classId
    && textValue(row.roomId) === requirement.roomId;
}

function sameScheduleSlot(row: ScheduleRow, suggestion: AiScheduleSuggestion) {
  return scheduleTeacherId(row) === suggestion.teacherId
    && textValue(row.subjectId) === suggestion.subjectId
    && textValue(row.classId) === suggestion.classId
    && textValue(row.roomId) === suggestion.roomId
    && Number(row.dayOfWeek) === suggestion.dayOfWeek
    && Number(row.startPeriod) === suggestion.startPeriod
    && Number(row.endPeriod) === suggestion.endPeriod;
}

function resourceSlotKeys(input: {
  teacherId: string;
  classId: string;
  roomId: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
}) {
  const keys = new Set<string>();
  for (let period = input.startPeriod; period < input.endPeriod; period += 1) {
    keys.add(`teacher:${input.teacherId}:${input.dayOfWeek}:${period}`);
    keys.add(`class:${input.classId}:${input.dayOfWeek}:${period}`);
    keys.add(`room:${input.roomId}:${input.dayOfWeek}:${period}`);
  }
  return keys;
}

function existingResourceSlotKeys(row: ScheduleRow) {
  return resourceSlotKeys({
    teacherId: scheduleTeacherId(row),
    classId: textValue(row.classId),
    roomId: textValue(row.roomId),
    dayOfWeek: Number(row.dayOfWeek),
    startPeriod: Number(row.startPeriod),
    endPeriod: Number(row.endPeriod),
  });
}

function suggestionResourceSlotKeys(suggestion: AiScheduleSuggestion) {
  return resourceSlotKeys({
    teacherId: suggestion.teacherId,
    classId: suggestion.classId,
    roomId: suggestion.roomId,
    dayOfWeek: suggestion.dayOfWeek,
    startPeriod: suggestion.startPeriod,
    endPeriod: suggestion.endPeriod,
  });
}

export default function AiSchedulerPage() {
  const [teachers, setTeachers] = useState<CatalogRow[]>([]);
  const [subjects, setSubjects] = useState<CatalogRow[]>([]);
  const [classes, setClasses] = useState<CatalogRow[]>([]);
  const [rooms, setRooms] = useState<CatalogRow[]>([]);
  const [semesters, setSemesters] = useState<CatalogRow[]>([]);
  const [timeSlots, setTimeSlots] = useState<CatalogRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  const [semesterId, setSemesterId] = useState("");
  const [weekStart, setWeekStart] = useState(currentWeekStartDateOnly());
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("fill_missing");
  const [requirementForm, setRequirementForm] = useState<RequirementForm>(emptyRequirement);
  const [requirements, setRequirements] = useState<AiScheduleRequirement[]>([]);

  const [maxConsecutivePeriods, setMaxConsecutivePeriods] = useState("3");
  const [spreadAcrossDays, setSpreadAcrossDays] = useState(true);
  const [preferEarlierPeriods, setPreferEarlierPeriods] = useState(true);
  const [enforceStandardPeriods, setEnforceStandardPeriods] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<AiScheduleResponse | null>(null);
  const [proposalError, setProposalError] = useState("");
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  useEffect(() => {
    setDataError("");
    let readyCount = 0;
    const markReady = () => {
      readyCount += 1;
      if (readyCount >= 8) setLoading(false);
    };
    const watch = (
      collectionName: string,
      setter: (rows: CatalogRow[]) => void,
      sorter: (rows: CatalogRow[]) => CatalogRow[] = activeRows,
    ) => onSnapshot(
      query(collection(firestore, collectionName), limit(1000)),
      (snapshot) => {
        setter(sorter(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))));
        markReady();
      },
      (error) => {
        setDataError(`Không thể tải ${collectionName}: ${firebaseDataErrorMessage(error)}`);
        setLoading(false);
      },
    );

    const unsubscribers = [
      watch("teachers", setTeachers),
      watch("subjects", setSubjects),
      watch("classes", setClasses),
      watch("rooms", setRooms),
      watch("semesters", setSemesters),
      watch("timeSlots", setTimeSlots, (rows) => rows.filter((row) => row.isActive !== false && periodNumber(row) > 0).sort((a, b) => periodNumber(a) - periodNumber(b))),
      onSnapshot(
        query(collection(firestore, "schedules"), limit(1500)),
        (snapshot) => {
          setSchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
          markReady();
        },
        (error) => {
          setDataError(`Không thể tải schedules: ${firebaseDataErrorMessage(error)}`);
          setLoading(false);
        },
      ),
      onSnapshot(
        query(collection(firestore, "teacherAvailability"), limit(1000)),
        (snapshot) => {
          setAvailability(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
          markReady();
        },
        (error) => {
          setDataError(`Không thể tải teacherAvailability: ${firebaseDataErrorMessage(error)}`);
          setLoading(false);
        },
      ),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    if (!semesterId && semesters.length > 0) setSemesterId(semesters[0].id);
  }, [semesterId, semesters]);

  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === requirementForm.teacherId) ?? null,
    [requirementForm.teacherId, teachers],
  );

  const availableSubjects = useMemo(() => {
    if (!selectedTeacher) return subjects;
    const assigned = Array.isArray(selectedTeacher.subjectIds) ? selectedTeacher.subjectIds.map(String) : [];
    return assigned.length > 0 ? subjects.filter((subject) => assigned.includes(subject.id)) : subjects;
  }, [selectedTeacher, subjects]);

  const availableClasses = useMemo(() => {
    if (!selectedTeacher || !requirementForm.subjectId) return classes;
    return classes.filter((schoolClass) => teacherCanTeachClass(selectedTeacher, requirementForm.subjectId, schoolClass));
  }, [classes, requirementForm.subjectId, selectedTeacher]);

  const selectedSemester = useMemo(
    () => semesters.find((semester) => semester.id === semesterId) ?? null,
    [semesterId, semesters],
  );

  const weekExistingSchedules = useMemo(
    () => schedules.filter((row) => row.status !== "cancelled" && textValue(row.semesterId) === semesterId && textValue(row.weekStart) === weekStart),
    [schedules, semesterId, weekStart],
  );

  const existingByRequirement = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const requirement of requirements) {
      map.set(
        requirement.id,
        weekExistingSchedules.filter((row) => scheduleMatchesRequirement(row, requirement)),
      );
    }
    return map;
  }, [requirements, weekExistingSchedules]);

  const existingPeriodsByRequirement = useMemo(() => {
    const map = new Map<string, number>();
    for (const requirement of requirements) {
      const total = (existingByRequirement.get(requirement.id) ?? [])
        .reduce((sum, row) => sum + schedulePeriodCount(row), 0);
      map.set(requirement.id, total);
    }
    return map;
  }, [existingByRequirement, requirements]);

  const selectedExistingScheduleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rows of existingByRequirement.values()) {
      for (const row of rows) ids.add(row.id);
    }
    return ids;
  }, [existingByRequirement]);

  const lockedExistingSchedules = useMemo(
    () => scheduleMode === "reoptimize_selected"
      ? weekExistingSchedules.filter((row) => !selectedExistingScheduleIds.has(row.id))
      : weekExistingSchedules,
    [scheduleMode, selectedExistingScheduleIds, weekExistingSchedules],
  );

  const effectiveRequirements = useMemo(() => requirements
    .map((requirement) => {
      if (scheduleMode === "reoptimize_selected") return requirement;
      const existingPeriods = existingPeriodsByRequirement.get(requirement.id) ?? 0;
      return {
        ...requirement,
        periodsPerWeek: Math.max(0, requirement.periodsPerWeek - existingPeriods),
      };
    })
    .filter((requirement) => requirement.periodsPerWeek > 0),
  [existingPeriodsByRequirement, requirements, scheduleMode]);

  const proposalByRequirement = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of proposal?.schedules ?? []) {
      map.set(item.requirementId, (map.get(item.requirementId) ?? 0) + 1);
    }
    return map;
  }, [proposal]);

  function setRequirementField<K extends keyof RequirementForm>(key: K, value: RequirementForm[K]) {
    setRequirementForm((current) => ({ ...current, [key]: value }));
  }

  function addRequirement() {
    setProposal(null);
    setProposalError("");
    const teacher = teachers.find((row) => row.id === requirementForm.teacherId);
    const subject = subjects.find((row) => row.id === requirementForm.subjectId);
    const schoolClass = classes.find((row) => row.id === requirementForm.classId);
    const room = rooms.find((row) => row.id === requirementForm.roomId);
    const periodsPerWeek = Number(requirementForm.periodsPerWeek);

    if (!teacher || !subject || !schoolClass || !room) {
      setProposalError("Vui lòng chọn đủ giáo viên, môn học, lớp và phòng học.");
      return;
    }
    if (!Number.isInteger(periodsPerWeek) || periodsPerWeek < 1 || periodsPerWeek > 20) {
      setProposalError("Số tiết/tuần phải từ 1 đến 20.");
      return;
    }
    const teacherSubjectIds = Array.isArray(teacher.subjectIds) ? teacher.subjectIds.map(String) : [];
    if (teacherSubjectIds.length > 0 && !teacherSubjectIds.includes(subject.id)) {
      setProposalError("Môn đã chọn không nằm trong danh sách môn được phân công của giáo viên.");
      return;
    }
    if (!teacherCanTeachClass(teacher, subject.id, schoolClass)) {
      const grade = classGrade(schoolClass);
      const allowedGrades = gradeScopeForSubject(teacher, subject.id);
      setProposalError(`Giáo viên không được phân công dạy ${catalogName(subject)} cho khối ${grade ?? "của lớp này"}.${allowedGrades.length ? ` Khối được phép: ${allowedGrades.join(", ")}.` : ""}`);
      return;
    }
    const classCampus = textValue(schoolClass.campusId);
    const roomCampus = textValue(room.campusId);
    if (classCampus && roomCampus && classCampus !== roomCampus) {
      setProposalError("Lớp học và phòng học đang thuộc hai cơ sở khác nhau.");
      return;
    }
    const departmentId = textValue(teacher.departmentId) || textValue(subject.departmentId);
    if (!departmentId) {
      setProposalError("Giáo viên/môn học chưa được gán bộ môn.");
      return;
    }

    const duplicate = requirements.find((item) =>
      item.teacherId === teacher.id
      && item.subjectId === subject.id
      && item.classId === schoolClass.id
      && item.roomId === room.id,
    );
    if (duplicate) {
      setRequirements((current) => current.map((item) => item.id === duplicate.id
        ? { ...item, periodsPerWeek: item.periodsPerWeek + periodsPerWeek }
        : item));
      setRequirementForm((current) => ({ ...emptyRequirement, teacherId: current.teacherId }));
      return;
    }

    setRequirements((current) => [...current, {
      id: randomId(),
      teacherId: teacher.id,
      teacherName: catalogName(teacher),
      teacherType: teacher.teacherType === "thinh_giang" ? "thinh_giang" : "co_huu",
      subjectId: subject.id,
      subjectName: catalogName(subject),
      classId: schoolClass.id,
      className: catalogName(schoolClass),
      roomId: room.id,
      roomName: catalogName(room),
      campusId: roomCampus || classCampus || textValue(teacher.campusId),
      departmentId,
      periodsPerWeek,
    }]);
    setRequirementForm((current) => ({ ...emptyRequirement, teacherId: current.teacherId }));
  }

  function removeRequirement(id: string) {
    setRequirements((current) => current.filter((item) => item.id !== id));
    setProposal(null);
    setAppliedCount(0);
  }

  async function generateProposal() {
    setProposalError("");
    setProposal(null);
    setAppliedCount(0);
    if (!semesterId || !selectedSemester) {
      setProposalError("Vui lòng chọn học kỳ.");
      return;
    }
    if (!weekStart) {
      setProposalError("Vui lòng chọn tuần bắt đầu.");
      return;
    }
    if (requirements.length === 0) {
      setProposalError("Hãy thêm ít nhất một nhu cầu cần xếp.");
      return;
    }
    if (effectiveRequirements.length === 0) {
      setProposalError("Các phân công đã đủ số tiết/tuần theo lịch hiện có, không còn tiết thiếu để xếp.");
      return;
    }
    const periods = timeSlots.map(periodNumber).filter((value) => value > 0);
    if (periods.length === 0) {
      setProposalError("Chưa có danh sách tiết học đang hoạt động.");
      return;
    }
    const schoolYearId = textValue(selectedSemester.schoolYearId);
    if (!schoolYearId) {
      setProposalError("Học kỳ chưa được liên kết với năm học.");
      return;
    }

    const teacherIds = new Set(effectiveRequirements.map((item) => item.teacherId));
    const request: AiScheduleRequest = {
      semesterId,
      schoolYearId,
      weekStart,
      periods,
      requirements: effectiveRequirements,
      existingSchedules: lockedExistingSchedules.map((row) => ({
        teacherId: textValue(row.actualTeacherId) || textValue(row.teacherId),
        classId: textValue(row.classId),
        roomId: textValue(row.roomId),
        dayOfWeek: Number(row.dayOfWeek),
        startPeriod: Number(row.startPeriod),
        endPeriod: Number(row.endPeriod),
      })),
      availability: availability
        .filter((row) => teacherIds.has(textValue(row.teacherId)) && textValue(row.semesterId) === semesterId && textValue(row.reviewStatus) === "approved")
        .map((row) => ({
          teacherId: textValue(row.teacherId),
          approvedSlots: Array.isArray(row.approvedSlots)
            ? row.approvedSlots.map(String)
            : Array.isArray(row.slots) ? row.slots.map(String) : [],
        })),
      teachers: teachers
        .filter((row) => teacherIds.has(row.id))
        .map((row) => ({
          teacherId: row.id,
          teacherType: row.teacherType === "thinh_giang" ? "thinh_giang" : "co_huu",
          standardPeriodsPerWeek: row.standardPeriodsPerWeek == null ? null : Number(row.standardPeriodsPerWeek),
        })),
      options: {
        maxConsecutivePeriods: Math.max(1, Math.min(8, Number(maxConsecutivePeriods) || 3)),
        spreadSameRequirementAcrossDays: spreadAcrossDays,
        preferEarlierPeriods,
        enforceStandardPeriods,
        maxSolveSeconds: 20,
      },
    };

    setGenerating(true);
    try {
      const result = await generateScheduleWithCpSat(request);
      setProposal(result);
      if (result.status === "OPTIMAL" || result.status === "FEASIBLE") {
        toast.success(`CP-SAT đã tạo phương án ${result.schedules.length} tiết.`);
      }
    } catch (error) {
      setProposalError(firebaseErrorMessage(error));
    } finally {
      setGenerating(false);
    }
  }

  async function applyProposal() {
    if (!proposal || !["OPTIMAL", "FEASIBLE"].includes(proposal.status) || proposal.schedules.length === 0) return;
    if (!selectedSemester) return;

    const schoolYearId = textValue(selectedSemester.schoolYearId);
    setApplying(true);
    setProposalError("");
    setAppliedCount(0);

    const requirementById = new Map(requirements.map((item) => [item.id, item]));
    const schedulePayload = (
      suggestion: AiScheduleSuggestion,
      requirement: AiScheduleRequirement,
      id?: string,
    ): ScheduleInput => ({
      id,
      teacherId: suggestion.teacherId,
      subjectId: suggestion.subjectId,
      classId: suggestion.classId,
      roomId: suggestion.roomId,
      campusId: suggestion.campusId,
      departmentId: suggestion.departmentId,
      semesterId,
      schoolYearId,
      weekStart,
      dayOfWeek: suggestion.dayOfWeek,
      startPeriod: suggestion.startPeriod,
      endPeriod: suggestion.endPeriod,
      status: "scheduled",
      cancellationReason: "",
      confirmationDeadline: requirement.teacherType === "thinh_giang" ? futureDeadlineIso() : undefined,
    });

    const cancellationPayload = (row: ScheduleRow): ScheduleInput => ({
      id: row.id,
      teacherId: scheduleTeacherId(row),
      subjectId: textValue(row.subjectId),
      classId: textValue(row.classId),
      roomId: textValue(row.roomId),
      campusId: textValue(row.campusId),
      departmentId: textValue(row.departmentId),
      semesterId: textValue(row.semesterId) || semesterId,
      schoolYearId: textValue(row.schoolYearId) || schoolYearId,
      weekStart: textValue(row.weekStart) || weekStart,
      dayOfWeek: Number(row.dayOfWeek),
      startPeriod: Number(row.startPeriod),
      endPeriod: Number(row.endPeriod),
      status: "cancelled",
      cancellationReason: "Điều chỉnh khi xếp lại thời khóa biểu bằng CP-SAT.",
    });

    let completed = 0;

    try {
      if (scheduleMode === "fill_missing") {
        for (const suggestion of proposal.schedules) {
          const requirement = requirementById.get(suggestion.requirementId);
          if (!requirement) throw new Error("Không tìm thấy nhu cầu gốc của một tiết đề xuất.");
          await createOrUpdateSchedule(schedulePayload(suggestion, requirement));
          completed += 1;
          setAppliedCount(completed);
        }

        toast.success(`Đã bổ sung ${completed}/${proposal.schedules.length} tiết qua backend hiện tại.`);
        return;
      }

      type UpdatePlan = {
        existing: ScheduleRow;
        suggestion: AiScheduleSuggestion;
        requirement: AiScheduleRequirement;
        oldKeys: Set<string>;
        targetKeys: Set<string>;
      };

      const updates: UpdatePlan[] = [];
      const creates: Array<{ suggestion: AiScheduleSuggestion; requirement: AiScheduleRequirement }> = [];
      const cancellations: ScheduleRow[] = [];
      let unchanged = 0;

      for (const requirement of requirements) {
        const existingRows = [...(existingByRequirement.get(requirement.id) ?? [])]
          .sort((a, b) => Number(a.dayOfWeek) - Number(b.dayOfWeek) || Number(a.startPeriod) - Number(b.startPeriod));
        const suggestions = proposal.schedules
          .filter((item) => item.requirementId === requirement.id)
          .slice()
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriod - b.startPeriod);

        const remainingExisting = [...existingRows];
        const remainingSuggestions = [...suggestions];

        // Giữ nguyên những tiết solver đề xuất đúng vị trí hiện tại để giảm thay đổi không cần thiết.
        for (let index = remainingSuggestions.length - 1; index >= 0; index -= 1) {
          const suggestion = remainingSuggestions[index];
          const existingIndex = remainingExisting.findIndex((row) => sameScheduleSlot(row, suggestion));
          if (existingIndex < 0) continue;
          remainingExisting.splice(existingIndex, 1);
          remainingSuggestions.splice(index, 1);
          unchanged += 1;
        }

        const paired = Math.min(remainingExisting.length, remainingSuggestions.length);
        for (let index = 0; index < paired; index += 1) {
          const existing = remainingExisting[index];
          const suggestion = remainingSuggestions[index];
          updates.push({
            existing,
            suggestion,
            requirement,
            oldKeys: existingResourceSlotKeys(existing),
            targetKeys: suggestionResourceSlotKeys(suggestion),
          });
        }

        cancellations.push(...remainingExisting.slice(paired));
        for (const suggestion of remainingSuggestions.slice(paired)) {
          creates.push({ suggestion, requirement });
        }
      }

      // Hủy các lịch dư trước để giải phóng lock. Chỉ các lịch thuộc phân công đã chọn mới nằm ở đây.
      for (const row of cancellations) {
        await createOrUpdateSchedule(cancellationPayload(row));
      }

      // Các update có thể đổi chỗ cho nhau. Xử lý theo dependency của lock cũ;
      // nếu gặp chu trình A<->B thì tạm hủy một lịch để phá chu trình rồi cập nhật lại cùng id.
      const pending = updates.map((item) => ({
        ...item,
        activeOldKeys: new Set(item.oldKeys),
        temporarilyCancelled: false,
      }));

      while (pending.length > 0) {
        const oldOwner = new Map<string, string>();
        for (const item of pending) {
          for (const key of item.activeOldKeys) oldOwner.set(key, item.existing.id);
        }

        const readyIndex = pending.findIndex((item) => {
          for (const key of item.targetKeys) {
            const owner = oldOwner.get(key);
            if (owner && owner !== item.existing.id) return false;
          }
          return true;
        });

        if (readyIndex >= 0) {
          const [item] = pending.splice(readyIndex, 1);
          await createOrUpdateSchedule(schedulePayload(item.suggestion, item.requirement, item.existing.id));
          completed += 1;
          setAppliedCount(Math.min(proposal.schedules.length, unchanged + completed));
          continue;
        }

        // Không có lịch nào di chuyển được => đang có vòng phụ thuộc lock.
        // Tạm hủy một lịch qua chính backend hiện tại để giải phóng vị trí cũ.
        const breaker = pending.find((item) => !item.temporarilyCancelled);
        if (!breaker) {
          throw new Error("Không thể phá vòng xung đột khi áp dụng phương án xếp lại.");
        }
        await createOrUpdateSchedule(cancellationPayload(breaker.existing));
        breaker.activeOldKeys.clear();
        breaker.temporarilyCancelled = true;
      }

      for (const item of creates) {
        await createOrUpdateSchedule(schedulePayload(item.suggestion, item.requirement));
        completed += 1;
        setAppliedCount(Math.min(proposal.schedules.length, unchanged + completed));
      }

      setAppliedCount(proposal.schedules.length);
      toast.success(
        `Đã xếp lại ${proposal.schedules.length} tiết: giữ nguyên ${unchanged}, cập nhật/tạo ${completed}, hủy ${cancellations.length} lịch dư.`,
      );
    } catch (error) {
      setProposalError(
        `Đã xử lý một phần phương án. Backend dừng vì: ${firebaseErrorMessage(error)}. ` +
        "Hãy tải lại trang để xem trạng thái thực tế trước khi thao tác tiếp.",
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <Shell>
        <PageHeader
          eyebrow="OR-Tools CP-SAT"
          title="AI hỗ trợ xếp thời khóa biểu"
          description="Solver chỉ đề xuất Thứ/Tiết. Khi áp dụng, từng lịch vẫn đi qua createOrUpdateSchedule hiện tại để backend kiểm tra xung đột và lưu dữ liệu."
          actions={(
            <Button variant="secondary" asChild>
              <a href="/admin/schedules/"><CalendarCheck2 className="h-4 w-4" />Quay lại TKB</a>
            </Button>
          )}
        />

        {dataError ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{dataError}</div> : null}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
        ) : (
          <div className="space-y-5">
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><BrainCircuit className="h-6 w-6" /></div>
                <div>
                  <h2 className="font-bold">1. Chọn tuần và chế độ xếp</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Chọn cách AI xử lý lịch hiện có trước khi khai báo tổng số tiết/tuần của từng phân công.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left transition ${scheduleMode === "fill_missing" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"}`}
                  onClick={() => { setScheduleMode("fill_missing"); setProposal(null); setProposalError(""); setAppliedCount(0); }}
                >
                  <span className="font-semibold">Bổ sung phần còn thiếu</span>
                  <span className="mt-1 block text-xs text-muted-foreground">An toàn nhất. Toàn bộ lịch đang có được khóa. Số tiết nhập là tổng cần có/tuần; AI tự trừ số tiết đã tồn tại và chỉ xếp phần thiếu.</span>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left transition ${scheduleMode === "reoptimize_selected" ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500" : "border-border hover:bg-muted/40"}`}
                  onClick={() => { setScheduleMode("reoptimize_selected"); setProposal(null); setProposalError(""); setAppliedCount(0); }}
                >
                  <span className="font-semibold">Xếp lại các phân công đã chọn</span>
                  <span className="mt-1 block text-xs text-muted-foreground">AI được di chuyển lịch cũ của đúng các phân công bạn thêm ở bước 2. Các lịch khác vẫn khóa và không bị đụng tới.</span>
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Học kỳ</Label>
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={semesterId} onChange={(event) => { setSemesterId(event.target.value); setProposal(null); }}>
                    <option value="">Chọn học kỳ</option>
                    {semesters.map((row) => <option key={row.id} value={row.id}>{catalogName(row)}</option>)}
                  </select>
                </div>
                <div><Label>Tuần bắt đầu</Label><Input type="date" value={weekStart} onChange={(event) => { setWeekStart(event.target.value); setProposal(null); }} /></div>
              </div>
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                {scheduleMode === "fill_missing" ? (
                  <><strong>{weekExistingSchedules.length}</strong> lịch hiện có trong tuần đang được khóa. AI chỉ bổ sung số tiết còn thiếu.</>
                ) : (
                  <><strong>{selectedExistingScheduleIds.size}</strong> lịch thuộc các phân công đã chọn có thể được bố trí lại; <strong>{lockedExistingSchedules.length}</strong> lịch còn lại vẫn là ràng buộc cứng.</>
                )}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-border p-5">
                <h2 className="font-bold">2. Khai báo nhu cầu tiết cần xếp</h2>
                <p className="mt-1 text-sm text-muted-foreground">Mỗi dòng là một phân công: giáo viên – môn – lớp – phòng – <strong>tổng số tiết cần có trong tuần</strong>. Bạn không cần tự chọn Thứ/Tiết.</p>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-5">
                <div>
                  <Label>Giáo viên</Label>
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={requirementForm.teacherId} onChange={(event) => setRequirementForm({ ...emptyRequirement, teacherId: event.target.value })}>
                    <option value="">Chọn GV</option>
                    {teachers.map((row) => <option key={row.id} value={row.id}>{catalogName(row)}{row.teacherType === "thinh_giang" ? " · TG" : ""}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Môn</Label>
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={requirementForm.subjectId} onChange={(event) => setRequirementForm((current) => { const nextSubjectId = event.target.value; const currentClass = classes.find((row) => row.id === current.classId); return { ...current, subjectId: nextSubjectId, classId: selectedTeacher && currentClass && !teacherCanTeachClass(selectedTeacher, nextSubjectId, currentClass) ? "" : current.classId }; })}>
                    <option value="">Chọn môn</option>
                    {availableSubjects.map((row) => <option key={row.id} value={row.id}>{catalogName(row)}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Lớp</Label>
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={requirementForm.classId} onChange={(event) => setRequirementField("classId", event.target.value)}>
                    <option value="">Chọn lớp</option>
                    {availableClasses.map((row) => <option key={row.id} value={row.id}>{catalogName(row)}</option>)}
                  </select>
                  {selectedTeacher && requirementForm.subjectId ? <p className="mt-1 text-xs text-muted-foreground">Chỉ hiển thị lớp thuộc khối giáo viên được phân công.</p> : null}
                </div>
                <div>
                  <Label>Phòng</Label>
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={requirementForm.roomId} onChange={(event) => setRequirementField("roomId", event.target.value)}>
                    <option value="">Chọn phòng</option>
                    {rooms.map((row) => <option key={row.id} value={row.id}>{catalogName(row)}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Số tiết/tuần</Label>
                  <div className="flex gap-2"><Input min="1" max="20" type="number" value={requirementForm.periodsPerWeek} onChange={(event) => setRequirementField("periodsPerWeek", event.target.value)} /><Button type="button" onClick={addRequirement}><CirclePlus className="h-4 w-4" />Thêm</Button></div>
                </div>
              </div>

              {requirements.length === 0 ? (
                <EmptyState icon={<Clock3 className="h-6 w-6" />} title="Chưa có nhu cầu cần xếp" description="Ví dụ: Nguyễn Văn A – Toán – 7A1 – Phòng 7A1 – 4 tiết/tuần." />
              ) : (
                <div className="overflow-x-auto border-t border-border">
                  <table className="data-table min-w-[900px]">
                    <thead><tr><th>Giáo viên</th><th>Môn</th><th>Lớp</th><th>Phòng</th><th>Tổng tiết/tuần</th><th>Đang có</th><th>AI cần xếp</th><th>Solver đã xếp</th><th /></tr></thead>
                    <tbody>{requirements.map((item) => {
                      const existingPeriods = existingPeriodsByRequirement.get(item.id) ?? 0;
                      const needToSchedule = scheduleMode === "reoptimize_selected"
                        ? item.periodsPerWeek
                        : Math.max(0, item.periodsPerWeek - existingPeriods);
                      return (
                      <tr key={item.id}>
                        <td><span className="font-semibold">{item.teacherName}</span><p className="text-xs text-muted-foreground">{item.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}</p></td>
                        <td>{item.subjectName}</td><td>{item.className}</td><td>{item.roomName}</td>
                        <td><Badge tone="info">{item.periodsPerWeek}</Badge></td>
                        <td>{existingPeriods}</td>
                        <td><Badge tone={needToSchedule > 0 ? "warning" : "success"}>{needToSchedule}</Badge></td>
                        <td>{proposal ? `${proposalByRequirement.get(item.id) ?? 0}/${needToSchedule}` : "—"}</td>
                        <td className="text-right"><Button size="sm" variant="ghost" onClick={() => removeRequirement(item.id)}><Trash2 className="h-4 w-4" /></Button></td>
                      </tr>
                    );})}</tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="font-bold">3. Quy tắc tối ưu</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"><input className="mt-1" type="checkbox" checked={spreadAcrossDays} onChange={(event) => setSpreadAcrossDays(event.target.checked)} /><span><strong>Dàn đều cùng môn/lớp trong tuần</strong><span className="mt-1 block text-xs text-muted-foreground">Hạn chế dồn nhiều tiết của cùng một phân công vào một ngày.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"><input className="mt-1" type="checkbox" checked={preferEarlierPeriods} onChange={(event) => setPreferEarlierPeriods(event.target.checked)} /><span><strong>Ưu tiên tiết sớm</strong><span className="mt-1 block text-xs text-muted-foreground">Chỉ là tiêu chí mềm; không làm sai ràng buộc cứng.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"><input className="mt-1" type="checkbox" checked={enforceStandardPeriods} onChange={(event) => setEnforceStandardPeriods(event.target.checked)} /><span><strong>Không vượt định mức GV cơ hữu</strong><span className="mt-1 block text-xs text-muted-foreground">Nếu bật, số tiết hiện có + tiết mới không vượt standardPeriodsPerWeek.</span></span></label>
                <div className="rounded-xl border border-border p-3"><Label>Tối đa tiết liên tiếp/GV</Label><Input min="1" max="8" type="number" value={maxConsecutivePeriods} onChange={(event) => setMaxConsecutivePeriods(event.target.value)} /></div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="lg" loading={generating} disabled={requirements.length === 0 || !semesterId} onClick={() => void generateProposal()}><Sparkles className="h-5 w-5" />AI xếp lịch bằng CP-SAT</Button>
                <span className="text-xs text-muted-foreground">Không có Gemini/OpenAI API. OR-Tools chỉ tính toán ràng buộc.</span>
              </div>
              {proposalError ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{proposalError}</div> : null}
            </Card>

            {generating ? (
              <Card className="flex min-h-48 items-center justify-center gap-3 p-8 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" />CP-SAT đang tìm phương án tối ưu…</Card>
            ) : proposal ? (
              <Card className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold">4. Phương án đề xuất</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Trạng thái solver: {proposal.status}{proposal.solveSeconds != null ? ` · ${proposal.solveSeconds.toFixed(2)} giây` : ""}</p>
                  </div>
                  <Badge tone={proposal.status === "OPTIMAL" ? "success" : proposal.status === "FEASIBLE" ? "info" : "danger"}>{proposal.status}</Badge>
                </div>
                {proposal.diagnostics.length > 0 ? <div className="border-b border-border bg-amber-50 p-4 text-sm text-amber-800">{proposal.diagnostics.map((message) => <p key={message}>• {message}</p>)}</div> : null}
                {proposal.schedules.length === 0 ? (
                  <EmptyState icon={<Info className="h-6 w-6" />} title="Chưa có phương án khả thi" description="Kiểm tra chẩn đoán phía trên, tăng khung giờ rảnh hoặc điều chỉnh nhu cầu tiết." />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="data-table min-w-[900px]"><thead><tr><th>Giáo viên</th><th>Môn</th><th>Lớp</th><th>Thứ</th><th>Tiết</th><th>Phòng</th></tr></thead><tbody>{proposal.schedules
                        .slice()
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriod - b.startPeriod)
                        .map((item) => {
                          const req = requirements.find((row) => row.id === item.requirementId);
                          return <tr key={`${item.requirementId}_${item.lessonIndex}`}><td className="font-semibold">{req?.teacherName || item.teacherId}</td><td>{req?.subjectName || item.subjectId}</td><td>{req?.className || item.classId}</td><td>Thứ {item.dayOfWeek}</td><td>Tiết {item.startPeriod}</td><td>{req?.roomName || item.roomId}</td></tr>;
                        })}</tbody></table>
                    </div>
                    <div className="flex flex-col gap-3 border-t border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm"><strong>{proposal.schedules.length}</strong> tiết đề xuất. {appliedCount > 0 ? <span className="text-emerald-700">Đã áp dụng {appliedCount} tiết.</span> : <span className="text-muted-foreground">Chưa ghi Firestore.</span>}</div>
                      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={applying} onClick={() => void generateProposal()}><Play className="h-4 w-4" />Xếp lại</Button><Button loading={applying} disabled={appliedCount === proposal.schedules.length} onClick={() => void applyProposal()}><Save className="h-4 w-4" />Áp dụng qua backend hiện tại</Button></div>
                    </div>
                  </>
                )}
              </Card>
            ) : null}

            <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>CP-SAT không ghi Firestore trực tiếp. Chế độ <strong>Bổ sung</strong> chỉ tạo phần thiếu; chế độ <strong>Xếp lại</strong> chỉ cập nhật/hủy/tạo các lịch thuộc phân công đã chọn. Mọi thao tác vẫn gọi <code>createOrUpdateSchedule</code> hiện tại, nên Auth, App Check, xung đột, giờ rảnh thỉnh giảng và các quy tắc backend vẫn là lớp quyết định cuối cùng.</p>
            </div>
          </div>
        )}
      </Shell>
    </RoleGuard>
  );
}
