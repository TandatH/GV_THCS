"use client";

import { CheckCircle2, Clock3, Save } from "lucide-react";
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { FirebaseUiError, firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { cn, formatDate } from "@/lib/utils";

const days = [2, 3, 4, 5, 6, 7];
const periods = Array.from({ length: 10 }, (_, index) => index + 1);

type SemesterRow = DocumentData & { id: string };

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
    semester?.availabilityDeadline ??
      semester?.availabilityRegistrationDeadline ??
      semester?.registrationDeadline,
  );
}

function semesterTitle(semester: SemesterRow) {
  return String(semester.name || semester.title || semester.code || semester.id);
}

export default function AvailabilityPage() {
  const { loading: authLoading, user } = useAuth();
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherType, setTeacherType] = useState("");
  const [semesters, setSemesters] = useState<SemesterRow[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [status, setStatus] = useState<"draft" | "submitted">("draft");
  const [reviewStatus, setReviewStatus] = useState<"not_submitted" | "pending" | "approved" | "rejected">("not_submitted");
  const [reviewNote, setReviewNote] = useState("");
  const [contextLoading, setContextLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityExists, setAvailabilityExists] = useState(false);
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

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    const uid = user.uid;

    async function loadContext() {
      setContextLoading(true);
      setError("");
      try {
        const [teacherContext, semesterSnapshot] = await Promise.all([
          getCurrentTeacherContext(uid),
          getDocs(query(collection(firestore, "semesters"), limit(50))),
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
        if (!active) return;
        setTeacherId(teacherContext.teacherId);
        setTeacherName(String(teacherContext.teacherProfile.fullName || teacherContext.userProfile.displayName || "Giáo viên"));
        setTeacherType(String(teacherContext.teacherProfile.teacherType || ""));
        setSemesters(activeSemesters);
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
    if (!availabilityId) return;
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
        setAvailabilityExists(Boolean(document));
        setSlots(Array.isArray(data?.slots) ? data.slots : []);
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
  }, [availabilityId, semesterId, teacherId]);

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
      const reference = doc(firestore, "teacherAvailability", availabilityId);
      const basePayload = {
        teacherId,
        teacherType: "thinh_giang",
        semesterId,
        slots,
        status: nextStatus,
        reviewStatus: nextStatus === "submitted" ? "pending" : "not_submitted",
        reviewNote: "",
        reviewedAt: null,
        reviewedBy: "",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...(nextStatus === "submitted" ? { submittedAt: serverTimestamp() } : {}),
      };
      await setDoc(
        reference,
        availabilityExists
          ? basePayload
          : {
              ...basePayload,
              createdAt: serverTimestamp(),
              createdBy: user.uid,
              isActive: true,
            },
        { merge: availabilityExists },
      );
      setAvailabilityExists(true);
      setStatus(nextStatus);
      setReviewStatus(nextStatus === "submitted" ? "pending" : "not_submitted");
      setReviewNote("");
      const message = nextStatus === "submitted" ? "Đã gửi đăng ký khung giờ rảnh và đang chờ quản trị viên duyệt." : "Đã lưu bản nháp.";
      toast.success(message);
    } catch (saveError) {
      setError(firebaseDataErrorMessage(saveError) || "Tài khoản không có quyền cập nhật khung giờ này.");
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
          description="Dành cho giáo viên thỉnh giảng đăng ký các tiết có thể nhận lớp. Khung giờ được duyệt chỉ là điều kiện để xếp lịch, chưa phải lịch dạy chính thức và chưa được tính thù lao."
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
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="grid gap-3 sm:grid-cols-2">
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
                  ? "Quản trị viên đã duyệt khung giờ này. Nhà trường có thể dùng các ô đã chọn để xếp lịch. Chỉ lịch đã xếp và tiết dạy thực tế được xác nhận mới được tính chấm công/thù lao."
                  : reviewStatus === "rejected"
                    ? `Đăng ký bị từ chối${reviewNote ? `: ${reviewNote}` : ". Hãy điều chỉnh và gửi lại."}`
                    : "Đăng ký đang chờ quản trị viên duyệt."}
              </div>
            ) : null}
            {error ? <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            <div className="overflow-x-auto p-4 sm:p-6">
              {availabilityLoading ? (
                <Skeleton className="h-[520px] min-w-[760px]" />
              ) : (
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[120px_repeat(6,minmax(90px,1fr))] gap-2">
                    <div className="grid place-items-center rounded-xl bg-muted p-3 text-sm font-semibold"><Clock3 className="mr-2 inline h-4 w-4" />Tiết</div>
                    {days.map((day) => <div key={day} className="grid place-items-center rounded-xl bg-muted p-3 text-sm font-semibold">Thứ {day}</div>)}
                    {periods.map((period) => (
                      <div key={`row-${period}`} className="contents">
                        <div className="grid place-items-center rounded-xl border border-border bg-card p-3 text-sm font-semibold">Tiết {period}</div>
                        {days.map((day) => {
                          const slot = `${day}:${period}`;
                          const selected = slots.includes(slot);
                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={deadlinePassed || saving}
                              onClick={() => toggleSlot(slot)}
                              className={cn(
                                "min-h-14 rounded-xl border p-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60",
                                selected ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-blue-50 hover:text-blue-700",
                              )}
                            >
                              {selected ? "Có thể dạy" : "Trống"}
                            </button>
                          );
                        })}
                      </div>
                    ))}
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
