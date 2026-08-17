"use client";

import { CheckCircle2, Clock3, Save } from "lucide-react";
import { collection, getDocs, limit, query, where, type DocumentData } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firebaseFunctions, firestore } from "@/lib/firebase/client";
import { firebaseErrorMessage } from "@/lib/firebase/callables";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { FirebaseUiError, firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { cn, formatDate } from "@/lib/utils";

const days = [2, 3, 4, 5, 6, 7];
type SchoolLevel = "primary" | "secondary";
type SemesterRow = DocumentData & { id: string };
type TimeSlotRow = DocumentData & { id: string };

type TeacherAvailabilitySaveInput = {
  semesterId: string;
  slots: string[];
  status: "draft" | "submitted";
};

type TeacherAvailabilitySaveOutput = {
  ok: true;
  availabilityId: string;
};

const saveTeacherAvailabilityCallable = httpsCallable<
  TeacherAvailabilitySaveInput,
  TeacherAvailabilitySaveOutput
>(firebaseFunctions, "saveTeacherAvailability");

async function saveTeacherAvailability(input: TeacherAvailabilitySaveInput) {
  return (await saveTeacherAvailabilityCallable(input)).data;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate(): Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isActiveSemester(semester: SemesterRow) {
  if (semester.isActive === false) return false;
  if (["inactive", "closed", "da_dong"].includes(String(semester.status))) return false;
  return true;
}

function deadlineForSemester(semester?: SemesterRow | null) {
  return asDate(
    semester?.availabilityDeadline
      ?? semester?.availabilityRegistrationDeadline
      ?? semester?.registrationDeadline,
  );
}

function semesterTitle(semester: SemesterRow) {
  return String(semester.name || semester.title || semester.code || semester.id);
}

function teacherSchoolLevels(profile: DocumentData): SchoolLevel[] {
  if (Array.isArray(profile.schoolLevels)) {
    const levels = profile.schoolLevels
      .map(String)
      .filter((level): level is SchoolLevel => level === "primary" || level === "secondary");
    if (levels.length > 0) return [...new Set(levels)];
  }
  // Hồ sơ cũ trước khi mở rộng Tiểu học được hiểu là THCS.
  return ["secondary"];
}

function timeSlotSchoolLevel(slot: TimeSlotRow): SchoolLevel {
  // timeSlots cũ chưa có schoolLevel được hiểu là THCS để tương thích ngược.
  return slot.schoolLevel === "primary" ? "primary" : "secondary";
}

function periodNumber(slot: TimeSlotRow) {
  const value = Number(slot.periodNumber ?? slot.order ?? slot.period ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function schoolLevelLabel(level: SchoolLevel) {
  return level === "primary" ? "Tiểu học" : "THCS";
}

function canonicalSlot(level: SchoolLevel, dayOfWeek: number, timeSlotId: string) {
  return `${level}:${dayOfWeek}:${timeSlotId}`;
}

function normalizeStoredSlot(raw: unknown, timeSlots: TimeSlotRow[]): string | null {
  const value = String(raw ?? "").trim();
  const scoped = /^(primary|secondary):([2-7]):([^:]+)$/.exec(value);
  if (scoped) {
    const level = scoped[1] as SchoolLevel;
    const day = Number(scoped[2]);
    const token = scoped[3];
    const byId = timeSlots.find((slot) => slot.id === token && timeSlotSchoolLevel(slot) === level && slot.isActive !== false);
    if (byId) return canonicalSlot(level, day, byId.id);
    // Hỗ trợ dữ liệu trung gian dạng primary:5:2 / secondary:5:2.
    if (/^\d+$/.test(token)) {
      const byPeriod = timeSlots.find((slot) => timeSlotSchoolLevel(slot) === level && periodNumber(slot) === Number(token) && slot.isActive !== false);
      if (byPeriod) return canonicalSlot(level, day, byPeriod.id);
    }
    return null;
  }

  // Dữ liệu cũ 5:2 được hiểu là THCS.
  const legacy = /^([2-7]):([1-9][0-9]?)$/.exec(value);
  if (legacy) {
    const day = Number(legacy[1]);
    const period = Number(legacy[2]);
    const byPeriod = timeSlots.find((slot) => timeSlotSchoolLevel(slot) === "secondary" && periodNumber(slot) === period && slot.isActive !== false);
    return byPeriod ? canonicalSlot("secondary", day, byPeriod.id) : null;
  }
  return null;
}

function slotRowLabel(slot: TimeSlotRow) {
  const period = periodNumber(slot);
  const start = textValue(slot.startTime) || "?";
  const end = textValue(slot.endTime) || "?";
  return { title: `Tiết ${period}`, time: `${start}–${end}` };
}

export default function AvailabilityPage() {
  const { loading: authLoading, user } = useAuth();
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherType, setTeacherType] = useState("");
  const [schoolLevels, setSchoolLevels] = useState<SchoolLevel[]>(["secondary"]);
  const [selectedSchoolLevel, setSelectedSchoolLevel] = useState<SchoolLevel>("secondary");
  const [semesters, setSemesters] = useState<SemesterRow[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [status, setStatus] = useState<"draft" | "submitted">("draft");
  const [reviewStatus, setReviewStatus] = useState<"not_submitted" | "pending" | "approved" | "rejected">("not_submitted");
  const [reviewNote, setReviewNote] = useState("");
  const [contextLoading, setContextLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedSemester = useMemo(
    () => semesters.find((semester) => semester.id === semesterId) ?? null,
    [semesterId, semesters],
  );
  const deadline = deadlineForSemester(selectedSemester);
  const deadlinePassed = Boolean(deadline && deadline.getTime() < Date.now());
  const availabilityId = useMemo(
    () => (teacherId && semesterId ? `${teacherId}_${semesterId}` : null),
    [semesterId, teacherId],
  );
  const selectedLevelTimeSlots = useMemo(
    () => timeSlots
      .filter((slot) => slot.isActive !== false && timeSlotSchoolLevel(slot) === selectedSchoolLevel && periodNumber(slot) > 0)
      .sort((a, b) => periodNumber(a) - periodNumber(b)),
    [selectedSchoolLevel, timeSlots],
  );
  const selectedCounts = useMemo(() => {
    const result: Record<SchoolLevel, number> = { primary: 0, secondary: 0 };
    for (const slot of slots) {
      if (slot.startsWith("primary:")) result.primary += 1;
      else if (slot.startsWith("secondary:")) result.secondary += 1;
    }
    return result;
  }, [slots]);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    const uid = user.uid;

    async function loadContext() {
      setContextLoading(true);
      setError("");
      try {
        const [teacherContext, semesterSnapshot, timeSlotSnapshot] = await Promise.all([
          getCurrentTeacherContext(uid),
          getDocs(query(collection(firestore, "semesters"), limit(50))),
          getDocs(query(collection(firestore, "timeSlots"), limit(100))),
        ]);
        if (teacherContext.teacherProfile.isActive === false || teacherContext.teacherProfile.status === "inactive") {
          throw new FirebaseUiError("PERMISSION_DENIED", "Hồ sơ giáo viên đã ngừng hoạt động.");
        }
        const activeSemesters = semesterSnapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .filter(isActiveSemester);
        if (activeSemesters.length === 0) {
          throw new FirebaseUiError("FAILED_PRECONDITION", "Chưa có học kỳ đang hoạt động để đăng ký khung giờ rảnh.");
        }
        const nextTimeSlots: TimeSlotRow[] = timeSlotSnapshot.docs
          .map((document) => ({ id: document.id, ...document.data() } as TimeSlotRow))
          .filter((slot) => slot.isActive !== false && periodNumber(slot) > 0);
        const nextSchoolLevels = teacherSchoolLevels(teacherContext.teacherProfile);
        if (!active) return;
        setTeacherId(teacherContext.teacherId);
        setTeacherName(String(teacherContext.teacherProfile.fullName || teacherContext.userProfile.displayName || "Giáo viên"));
        setTeacherType(String(teacherContext.teacherProfile.teacherType || ""));
        setSchoolLevels(nextSchoolLevels);
        setSelectedSchoolLevel((current) => nextSchoolLevels.includes(current) ? current : nextSchoolLevels[0]);
        setSemesters(activeSemesters);
        setTimeSlots(nextTimeSlots);
        setSemesterId((current) => activeSemesters.some((semester) => semester.id === current) ? current : activeSemesters[0].id);
      } catch (loadError) {
        if (active) setError(firebaseDataErrorMessage(loadError));
      } finally {
        if (active) setContextLoading(false);
      }
    }

    void loadContext();
    return () => {
      active = false;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (!availabilityId || timeSlots.length === 0) return;
    let active = true;
    setAvailabilityLoading(true);
    setError("");
    const availabilityQuery = query(
      collection(firestore, "teacherAvailability"),
      where("teacherId", "==", teacherId),
      where("semesterId", "==", semesterId),
      limit(1),
    );
    void getDocs(availabilityQuery)
      .then((snapshot) => {
        if (!active) return;
        const document = snapshot.docs[0];
        const data = document?.data();
        const normalized = Array.isArray(data?.slots)
          ? [...new Set(data.slots.map((slot: unknown) => normalizeStoredSlot(slot, timeSlots)).filter((slot): slot is string => Boolean(slot)))]
          : [];
        setSlots(normalized);
        const nextStatus = data?.status === "submitted" ? "submitted" : "draft";
        setStatus(nextStatus);
        setReviewStatus(
          data?.reviewStatus === "approved" || data?.reviewStatus === "rejected"
            ? data.reviewStatus
            : nextStatus === "submitted"
              ? "pending"
              : "not_submitted",
        );
        setReviewNote(typeof data?.reviewNote === "string" ? data.reviewNote : "");
      })
      .catch((loadError) => active && setError(firebaseDataErrorMessage(loadError)))
      .finally(() => active && setAvailabilityLoading(false));
    return () => {
      active = false;
    };
  }, [availabilityId, semesterId, teacherId, timeSlots]);

  function toggleSlot(slot: string) {
    if (deadlinePassed || saving) return;
    setSlots((current) => current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]);
  }

  async function save(nextStatus: "draft" | "submitted") {
    if (!availabilityId || !teacherId || !semesterId || !user) return;
    if (teacherType !== "thinh_giang") {
      setError("Chức năng đăng ký khung giờ rảnh chỉ áp dụng cho giáo viên thỉnh giảng.");
      return;
    }
    if (nextStatus === "submitted" && slots.length === 0) {
      setError("Vui lòng chọn ít nhất một khung giờ có thể dạy trước khi gửi đăng ký.");
      return;
    }
    if (deadlinePassed) {
      setError("Thời hạn đăng ký khung giờ rảnh cho học kỳ này đã kết thúc.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveTeacherAvailability({ semesterId, slots, status: nextStatus });
      setStatus(nextStatus);
      setReviewStatus(nextStatus === "submitted" ? "pending" : "not_submitted");
      setReviewNote("");
      const message = nextStatus === "submitted"
        ? "Đã gửi đăng ký khung giờ rảnh và đang chờ quản trị viên duyệt."
        : "Đã lưu bản nháp.";
      toast.success(message);
    } catch (saveError) {
      setError(firebaseErrorMessage(saveError) || "Không thể lưu khung giờ rảnh.");
    } finally {
      setSaving(false);
    }
  }

  const busy = contextLoading || availabilityLoading || saving;
  const canEdit = Boolean(teacherType === "thinh_giang" && availabilityId && !deadlinePassed && !error && !contextLoading);
  const reviewLabel = status === "draft"
    ? "Bản nháp"
    : reviewStatus === "approved"
      ? "Đã duyệt"
      : reviewStatus === "rejected"
        ? "Bị từ chối"
        : "Chờ duyệt";
  const reviewTone = status === "draft" ? "warning" : reviewStatus === "approved" ? "success" : reviewStatus === "rejected" ? "danger" : "info";

  return (
    <RoleGuard allowedRoles={["giaovien"]}>
      <Shell>
        <PageHeader
          eyebrow="Lịch cá nhân"
          title="Đăng ký khung giờ rảnh"
          description="Dành cho giáo viên thỉnh giảng. Nhiều giáo viên có thể cùng đăng ký một khung giờ rảnh; hệ thống chỉ dùng các ô đã được duyệt để xếp lịch và vẫn kiểm tra trùng lịch khi phân công."
          actions={<Badge tone={reviewTone}>{reviewLabel}</Badge>}
        />

        {contextLoading ? (
          <Card className="p-5"><Skeleton className="h-72 w-full" /></Card>
        ) : teacherType !== "thinh_giang" ? (
          <Card>
            <EmptyState
              icon={<Clock3 className="h-6 w-6" />}
              title="Không cần đăng ký khung giờ rảnh"
              description="Chức năng này chỉ áp dụng cho giáo viên thỉnh giảng. Giáo viên cơ hữu được xếp theo thời khóa biểu và quy định phân công chung của nhà trường."
            />
          </Card>
        ) : semesters.length === 0 ? (
          <Card>
            <EmptyState icon={<Clock3 className="h-6 w-6" />} title="Chưa có học kỳ đang hoạt động" description="Vui lòng liên hệ quản trị viên để mở học kỳ đăng ký khung giờ rảnh." />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="mb-1.5 text-sm font-medium">Giáo viên</p>
                  <div className="h-11 rounded-xl border border-border bg-muted px-3 py-2 text-sm font-semibold">{teacherName}</div>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Học kỳ đang hoạt động</p>
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
                    {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semesterTitle(semester)}</option>)}
                  </select>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Cấp học đăng ký</p>
                  {schoolLevels.length > 1 ? (
                    <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold" value={selectedSchoolLevel} onChange={(event) => setSelectedSchoolLevel(event.target.value as SchoolLevel)}>
                      {schoolLevels.map((level) => <option key={level} value={level}>{schoolLevelLabel(level)}</option>)}
                    </select>
                  ) : (
                    <div className="h-11 rounded-xl border border-border bg-muted px-3 py-2 text-sm font-semibold">{schoolLevelLabel(schoolLevels[0])}</div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={saving} disabled={!canEdit || busy} onClick={() => save("draft")}><Save className="h-4 w-4" />Lưu nháp</Button>
                <Button loading={saving} disabled={!canEdit || busy} onClick={() => save("submitted")}><CheckCircle2 className="h-4 w-4" />Gửi đăng ký</Button>
              </div>
            </div>

            {deadline ? (
              <div className={cn("mx-4 mt-4 rounded-xl border px-4 py-3 text-sm", deadlinePassed ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-200 bg-blue-50 text-blue-700")}>
                {deadlinePassed ? "Thời hạn đăng ký khung giờ rảnh cho học kỳ này đã kết thúc." : `Hạn đăng ký: ${formatDate(deadline)}`}
              </div>
            ) : null}
            {status === "submitted" ? (
              <div className={cn(
                "mx-4 mt-4 rounded-xl border px-4 py-3 text-sm",
                reviewStatus === "approved" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                reviewStatus === "rejected" && "border-rose-200 bg-rose-50 text-rose-700",
                reviewStatus === "pending" && "border-amber-200 bg-amber-50 text-amber-800",
              )}>
                {reviewStatus === "approved"
                  ? "Quản trị viên đã duyệt. AI và người xếp lịch chỉ được dùng đúng các ô Tiểu học/THCS đã chọn."
                  : reviewStatus === "rejected"
                    ? `Đăng ký bị từ chối${reviewNote ? `: ${reviewNote}` : ". Hãy điều chỉnh và gửi lại."}`
                    : "Đăng ký đang chờ quản trị viên duyệt."}
              </div>
            ) : null}
            {error ? <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground sm:px-6">
              <span className="font-semibold text-foreground">Đã chọn:</span>{" "}
              Tiểu học {selectedCounts.primary} ô · THCS {selectedCounts.secondary} ô. Các lựa chọn ở hai cấp được lưu chung trong một đăng ký của giáo viên.
            </div>

            <div className="overflow-x-auto p-4 sm:p-6">
              {availabilityLoading ? (
                <Skeleton className="h-[520px] min-w-[760px]" />
              ) : selectedLevelTimeSlots.length === 0 ? (
                <EmptyState
                  icon={<Clock3 className="h-6 w-6" />}
                  title={`Chưa có tiết ${schoolLevelLabel(selectedSchoolLevel)}`}
                  description={`Quản trị viên cần tạo bộ tiết dành cho ${schoolLevelLabel(selectedSchoolLevel)} trong mục Thiết lập hệ thống → Tiết học.`}
                />
              ) : (
                <div className="min-w-[820px]">
                  <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-blue-700"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Khung giờ bạn có thể dạy</span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Chưa chọn</span>
                  </div>
                  <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    Đang xem bộ tiết <strong>{schoolLevelLabel(selectedSchoolLevel)}</strong>. Nhiều giáo viên thỉnh giảng được phép cùng chọn một ô rảnh. Mỗi ô vẫn được lưu theo <strong>cấp học + thứ + mã tiết</strong>.
                  </div>
                  <div className="grid grid-cols-[150px_repeat(6,minmax(96px,1fr))] gap-2">
                    <div className="grid place-items-center rounded-xl bg-muted p-3 text-sm font-semibold"><Clock3 className="mr-2 inline h-4 w-4" />Tiết / giờ</div>
                    {days.map((day) => <div key={day} className="grid place-items-center rounded-xl bg-muted p-3 text-sm font-semibold">Thứ {day}</div>)}
                    {selectedLevelTimeSlots.map((timeSlot) => {
                      const label = slotRowLabel(timeSlot);
                      return (
                        <div key={timeSlot.id} className="contents">
                          <div className="grid place-items-center rounded-xl border border-border bg-card p-2 text-center text-sm font-semibold">
                            <span>{label.title}</span>
                            <span className="mt-0.5 text-xs font-normal text-muted-foreground">{label.time}</span>
                          </div>
                          {days.map((day) => {
                            const slot = canonicalSlot(selectedSchoolLevel, day, timeSlot.id);
                            const selected = slots.includes(slot);
                            return (
                              <button
                                key={slot}
                                type="button"
                                disabled={deadlinePassed || saving}
                                onClick={() => toggleSlot(slot)}
                                title={`${schoolLevelLabel(selectedSchoolLevel)} · Thứ ${day} · ${label.title} · ${label.time}`}
                                className={cn(
                                  "min-h-14 rounded-xl border p-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed",
                                  selected && "border-primary bg-primary text-white shadow-sm",
                                  !selected && "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-blue-50 hover:text-blue-700",
                                )}
                              >
                                {selected ? "Có thể dạy" : "Chọn"}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </Shell>
    </RoleGuard>
  );
}
