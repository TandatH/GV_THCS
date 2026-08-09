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
} from "@/features/ai-scheduler/types";
import { createOrUpdateSchedule, firebaseErrorMessage } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { currentWeekStartDateOnly } from "@/lib/date-only";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";

type CatalogRow = DocumentData & { id: string };
type ScheduleRow = DocumentData & { id: string };
type AvailabilityRow = DocumentData & { id: string };

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

  const selectedSemester = useMemo(
    () => semesters.find((semester) => semester.id === semesterId) ?? null,
    [semesterId, semesters],
  );

  const weekExistingSchedules = useMemo(
    () => schedules.filter((row) => row.status !== "cancelled" && textValue(row.semesterId) === semesterId && textValue(row.weekStart) === weekStart),
    [schedules, semesterId, weekStart],
  );

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

    const teacherIds = new Set(requirements.map((item) => item.teacherId));
    const request: AiScheduleRequest = {
      semesterId,
      schoolYearId,
      weekStart,
      periods,
      requirements,
      existingSchedules: weekExistingSchedules.map((row) => ({
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
    let completed = 0;
    try {
      for (const suggestion of proposal.schedules) {
        const requirement = requirements.find((item) => item.id === suggestion.requirementId);
        if (!requirement) throw new Error("Không tìm thấy nhu cầu gốc của một tiết đề xuất.");
        const payload: ScheduleInput = {
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
        };
        await createOrUpdateSchedule(payload);
        completed += 1;
        setAppliedCount(completed);
      }
      toast.success(`Đã áp dụng ${completed}/${proposal.schedules.length} tiết qua backend hiện tại.`);
    } catch (error) {
      setProposalError(`Đã áp dụng ${completed}/${proposal.schedules.length} tiết. Backend dừng ở tiết tiếp theo: ${firebaseErrorMessage(error)}`);
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
                  <h2 className="font-bold">1. Chọn tuần cần xếp</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Lịch đã có trong tuần được xem là lịch khóa: CP-SAT không di chuyển và không xếp đè.</p>
                </div>
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
                <strong>{weekExistingSchedules.length}</strong> lịch hiện có trong tuần sẽ được giữ nguyên và dùng làm ràng buộc cứng.
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-border p-5">
                <h2 className="font-bold">2. Khai báo nhu cầu tiết cần xếp</h2>
                <p className="mt-1 text-sm text-muted-foreground">Mỗi dòng là một phân công: giáo viên – môn – lớp – phòng – số tiết/tuần. Bạn không cần tự chọn Thứ/Tiết.</p>
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
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={requirementForm.subjectId} onChange={(event) => setRequirementField("subjectId", event.target.value)}>
                    <option value="">Chọn môn</option>
                    {availableSubjects.map((row) => <option key={row.id} value={row.id}>{catalogName(row)}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Lớp</Label>
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={requirementForm.classId} onChange={(event) => setRequirementField("classId", event.target.value)}>
                    <option value="">Chọn lớp</option>
                    {classes.map((row) => <option key={row.id} value={row.id}>{catalogName(row)}</option>)}
                  </select>
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
                    <thead><tr><th>Giáo viên</th><th>Môn</th><th>Lớp</th><th>Phòng</th><th>Tiết/tuần</th><th>Solver đã xếp</th><th /></tr></thead>
                    <tbody>{requirements.map((item) => (
                      <tr key={item.id}>
                        <td><span className="font-semibold">{item.teacherName}</span><p className="text-xs text-muted-foreground">{item.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}</p></td>
                        <td>{item.subjectName}</td><td>{item.className}</td><td>{item.roomName}</td>
                        <td><Badge tone="info">{item.periodsPerWeek}</Badge></td>
                        <td>{proposal ? `${proposalByRequirement.get(item.id) ?? 0}/${item.periodsPerWeek}` : "—"}</td>
                        <td className="text-right"><Button size="sm" variant="ghost" onClick={() => removeRequirement(item.id)}><Trash2 className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}</tbody>
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
              <p>CP-SAT không ghi dữ liệu trực tiếp. Nút <strong>Áp dụng</strong> vẫn gọi hàm <code>createOrUpdateSchedule</code> đang có, nên Auth, App Check, kiểm tra xung đột, giờ rảnh thỉnh giảng và quy tắc backend hiện tại vẫn là lớp quyết định cuối cùng.</p>
            </div>
          </div>
        )}
      </Shell>
    </RoleGuard>
  );
}
