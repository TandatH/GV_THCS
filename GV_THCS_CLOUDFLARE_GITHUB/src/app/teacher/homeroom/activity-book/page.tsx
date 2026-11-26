"use client";

import {
  getClassGrade,
  homeroomPrincipalRatingLabels,
  type HomeroomReportFormData,
  type HomeroomReportPhoto,
  type HomeroomSubmissionType,
  type HomeroomWeeklyReport,
} from "@school/shared";
import {
  AlertCircle,
  Award,
  BookOpen,
  BookOpenCheck,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  History,
  Layers,
  Loader2,
  MessageSquare,
  Printer,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { HomeroomPhotoLightbox } from "@/components/homeroom/photo-lightbox";
import {
  HomeroomPhotoUploader,
  type PendingHomeroomPhoto,
} from "@/components/homeroom/photo-uploader";
import { HomeroomReportDetailView } from "@/components/homeroom/report-detail-view";
import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  Skeleton,
} from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { AdminFeatureLockButton, FeatureLockGuard } from "@/lib/feature-locks";
import { firebaseStorage, firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import {
  buildHomeroomWeekOptions,
  createEmptyHomeroomForm,
  hasMeaningfulFormContent,
  processImageForUpload,
  submissionTypeLabel,
} from "@/lib/homeroom-activity-book";
import { cn } from "@/lib/utils";

type ClassRow = DocumentData & {
  id: string;
  name?: string;
  code?: string;
  grade?: number | string;
  gradeLevel?: number | string;
  schoolLevel?: string;
  homeroomTeacherId?: string;
};

type WeekDoc = {
  id: string;
  weekNumber: number;
  schoolYearId: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  isLocked?: boolean;
  schoolLevel?: string;
};

function formatClassName(nameOrCode?: string): string {
  if (!nameOrCode) return "—";
  const trimmed = String(nameOrCode).trim();
  return trimmed.toLowerCase().startsWith("lớp") ? trimmed : `Lớp ${trimmed}`;
}

function HomeroomActivityBookContent() {
  const searchParams = useSearchParams();
  const queryWeekNum = Number(searchParams.get("week") || "");
  const { user, role } = useAuth();

  // Teacher & homeroom class state
  const [checkingHomeroom, setCheckingHomeroom] = useState(true);
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [homeroomClasses, setHomeroomClasses] = useState<ClassRow[]>([]);
  const [activeClassId, setActiveClassId] = useState("");
  const [classStudentCount, setClassStudentCount] = useState(0);

  // School years & weeks
  const [schoolYears, setSchoolYears] = useState<DocumentData[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [disciplineWeeks, setDisciplineWeeks] = useState<WeekDoc[]>([]);
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number>(1);

  // Reports loaded for activeClassId
  const [classReports, setClassReports] = useState<HomeroomWeeklyReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Active editor state
  const [submissionType, setSubmissionType] = useState<HomeroomSubmissionType>("form_only");
  const [formData, setFormData] = useState<HomeroomReportFormData>(() => createEmptyHomeroomForm(0));
  const [uploadedPhotos, setUploadedPhotos] = useState<HomeroomReportPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingHomeroomPhoto[]>([]);
  const [removedPhotoPaths, setRemovedPhotoPaths] = useState<string[]>([]);
  const [photoNote, setPhotoNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  // Preview / History modal
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // 1. Resolve homeroom class(es)
  useEffect(() => {
    async function resolveHomeroomClasses() {
      if (!user) return;
      setCheckingHomeroom(true);
      try {
        let tId = "";
        let tName = user.displayName || user.email || "Giáo viên chủ nhiệm";
        try {
          const ctx = await getCurrentTeacherContext(user.uid);
          tId = ctx.teacherId;
          tName = String(ctx.teacherProfile.fullName || ctx.teacherProfile.name || tName);
          setTeacherId(tId);
          setTeacherName(tName);
        } catch {
          setTeacherName(tName);
        }

        const clsSnap = await getDocs(collection(firestore, "classes"));
        const allCls = (clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ClassRow[]).filter(
          (c) => c.isActive !== false,
        );
        allCls.sort((a, b) =>
          String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "vi", {
            numeric: true,
          }),
        );

        let myClasses = tId ? allCls.filter((c) => c.homeroomTeacherId === tId) : [];
        if (myClasses.length === 0 && (role === "admin" || role === "bgh")) {
          myClasses = allCls;
        }

        setHomeroomClasses(myClasses);
        if (myClasses.length > 0) {
          setActiveClassId(myClasses[0].id);
        }
      } catch (err) {
        console.error("Lỗi xác định lớp chủ nhiệm:", err);
        toast.error("Không thể tải thông tin lớp chủ nhiệm.");
      } finally {
        setCheckingHomeroom(false);
      }
    }

    resolveHomeroomClasses();
  }, [user, role]);

  // 2. Fetch school years
  useEffect(() => {
    async function fetchYears() {
      try {
        const sySnap = await getDocs(collection(firestore, "schoolYears"));
        const allRows = sySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentData[];
        const activeRows = allRows.filter((y) => y.isActive === true);
        const rows = activeRows.length > 0 ? activeRows : allRows.filter((y) => y.isActive !== false);
        setSchoolYears(rows);
        if (rows.length > 0 && !selectedSchoolYearId) {
          setSelectedSchoolYearId(rows[0].id);
        }
      } catch (err) {
        console.error("Lỗi tải năm học:", err);
      }
    }
    fetchYears();
  }, []);

  // 3. Listen to disciplineWeeks for date ranges
  useEffect(() => {
    if (!selectedSchoolYearId) return;
    const qWeeks = query(
      collection(firestore, "disciplineWeeks"),
      where("schoolYearId", "==", selectedSchoolYearId),
    );
    const unsub = onSnapshot(qWeeks, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as WeekDoc[];
      setDisciplineWeeks(rows);
    });
    return () => unsub();
  }, [selectedSchoolYearId]);

  const weekOptions = useMemo(() => {
    if (!selectedSchoolYearId) return [];
    return buildHomeroomWeekOptions(selectedSchoolYearId, disciplineWeeks);
  }, [selectedSchoolYearId, disciplineWeeks]);

  const autoSelectedWeekRef = useRef(false);

  // Set default week once disciplineWeeks arrive (or from query param)
  useEffect(() => {
    if (weekOptions.length === 0) return;
    if (Number.isInteger(queryWeekNum) && queryWeekNum >= 1 && queryWeekNum <= 52) {
      setSelectedWeekNumber(queryWeekNum);
      autoSelectedWeekRef.current = true;
      return;
    }
    if (autoSelectedWeekRef.current) return;
    if (disciplineWeeks.length === 0) return;

    const current = weekOptions.find((w) => w.isCurrent);
    if (current) {
      setSelectedWeekNumber(current.weekNumber);
      autoSelectedWeekRef.current = true;
      return;
    }
    const latestConfigured = disciplineWeeks
      .filter((w) => (w.schoolLevel || "secondary") === "secondary")
      .sort((a, b) => b.weekNumber - a.weekNumber)[0];
    if (latestConfigured) {
      setSelectedWeekNumber(latestConfigured.weekNumber);
      autoSelectedWeekRef.current = true;
    }
  }, [weekOptions, disciplineWeeks, queryWeekNum]);

  // 4. Listen to student count for active class
  useEffect(() => {
    if (!activeClassId) {
      setClassStudentCount(0);
      return;
    }
    const qStudents = query(
      collection(firestore, "students"),
      where("classId", "==", activeClassId),
    );
    const unsub = onSnapshot(qStudents, (snap) => {
      setClassStudentCount(snap.size);
    });
    return () => unsub();
  }, [activeClassId]);

  // 5. Listen to all homeroom reports for activeClassId
  useEffect(() => {
    if (!activeClassId) {
      setClassReports([]);
      return;
    }
    setLoadingReports(true);
    const qReports = query(
      collection(firestore, "homeroomWeeklyReports"),
      where("classId", "==", activeClassId),
    );
    const unsub = onSnapshot(
      qReports,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<HomeroomWeeklyReport, "id">),
        }));
        rows.sort((a, b) => a.weekNumber - b.weekNumber);
        setClassReports(rows);
        setLoadingReports(false);
      },
      (err) => {
        console.error("Lỗi tải báo cáo Sổ SH GVCN:", err);
        setLoadingReports(false);
      },
    );
    return () => unsub();
  }, [activeClassId]);

  const currentClass = useMemo(
    () => homeroomClasses.find((c) => c.id === activeClassId),
    [homeroomClasses, activeClassId],
  );

  const currentWeek = useMemo(
    () => weekOptions.find((w) => w.weekNumber === selectedWeekNumber) || weekOptions[0],
    [weekOptions, selectedWeekNumber],
  );

  const activeReportId = useMemo(() => {
    if (!selectedSchoolYearId || !activeClassId || !selectedWeekNumber) return "";
    return `${selectedSchoolYearId}_w${selectedWeekNumber}_${activeClassId}`;
  }, [selectedSchoolYearId, activeClassId, selectedWeekNumber]);

  const existingReport = useMemo(
    () => classReports.find((r) => r.id === activeReportId) || null,
    [classReports, activeReportId],
  );

  // Sync editor state when switching week / class / existing report
  useEffect(() => {
    // Cleanup pending object URLs
    setPendingPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setRemovedPhotoPaths([]);

    if (existingReport) {
      setSubmissionType(existingReport.submissionType || "form_only");
      setFormData({
        ...createEmptyHomeroomForm(classStudentCount),
        ...(existingReport.formData || {}),
      });
      setUploadedPhotos(Array.isArray(existingReport.photos) ? existingReport.photos : []);
      setPhotoNote(existingReport.photoNote || "");
    } else {
      setSubmissionType("form_only");
      setFormData(createEmptyHomeroomForm(classStudentCount));
      setUploadedPhotos([]);
      setPhotoNote("");
    }
  }, [activeReportId, existingReport?.updatedAt?.toString?.() ?? existingReport?.id]);

  // Update default totalStudents when student count resolves and form has 0
  useEffect(() => {
    if (!existingReport && classStudentCount > 0) {
      setFormData((prev) =>
        prev.totalStudents === 0
          ? { ...prev, totalStudents: classStudentCount, presentCount: classStudentCount }
          : prev,
      );
    }
  }, [classStudentCount, existingReport]);

  function updateFormField<K extends keyof HomeroomReportFormData>(
    key: K,
    value: HomeroomReportFormData[K],
  ) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddFiles(files: FileList) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    const maxPhotos = 10;
    const currentTotal = uploadedPhotos.length + pendingPhotos.length;
    const remaining = maxPhotos - currentTotal;

    if (remaining <= 0) {
      toast.warning(`Mỗi tuần chỉ được tải tối đa ${maxPhotos} ảnh.`);
      return;
    }

    const incoming = Array.from(files).slice(0, remaining);
    const validItems: PendingHomeroomPhoto[] = [];

    for (const file of incoming) {
      if (!allowed.includes(file.type) && !file.type.startsWith("image/")) {
        toast.error(`Tệp "${file.name}" không phải là định dạng ảnh hỗ trợ.`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`Ảnh "${file.name}" vượt quá 20MB.`);
        continue;
      }
      validItems.push({
        localId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        rotateDegrees: 0,
      });
    }

    if (validItems.length > 0) {
      setPendingPhotos((prev) => [...prev, ...validItems]);
      if (submissionType === "form_only") {
        // Auto switch to hybrid if form already has text, else photo_only
        setSubmissionType(hasMeaningfulFormContent(formData) ? "hybrid" : "photo_only");
      }
    }
  }

  function handleRemovePending(localId: string) {
    setPendingPhotos((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  }

  function handleRotatePending(localId: string) {
    setPendingPhotos((prev) =>
      prev.map((p) =>
        p.localId === localId ? { ...p, rotateDegrees: (p.rotateDegrees + 90) % 360 } : p,
      ),
    );
  }

  function handleRemoveUploaded(photoId: string) {
    const target = uploadedPhotos.find((p) => p.photoId === photoId);
    if (target?.storagePath) {
      setRemovedPhotoPaths((prev) => [...prev, target.storagePath]);
    }
    setUploadedPhotos((prev) =>
      prev
        .filter((p) => p.photoId !== photoId)
        .map((p, idx) => ({ ...p, pageOrder: idx + 1 })),
    );
  }

  function handleMoveUploaded(index: number, direction: -1 | 1) {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= uploadedPhotos.length) return;
    setUploadedPhotos((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, moved);
      return copy.map((p, idx) => ({ ...p, pageOrder: idx + 1 }));
    });
  }

  async function uploadAllPendingPhotos(): Promise<HomeroomReportPhoto[]> {
    if (pendingPhotos.length === 0) return uploadedPhotos;
    setUploadingPhotos(true);
    const newlyUploaded: HomeroomReportPhoto[] = [];

    try {
      for (let i = 0; i < pendingPhotos.length; i += 1) {
        const item = pendingPhotos[i];
        const processed = await processImageForUpload(item.file, {
          maxDimension: 2048,
          quality: 0.84,
          rotateDegrees: item.rotateDegrees,
        });

        const photoId = `img_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        const storagePath = `homeroom-reports/${selectedSchoolYearId}/${activeClassId}/${currentWeek.weekKey}/${photoId}_${processed.fileName}`;
        const storageRef = ref(firebaseStorage, storagePath);

        await uploadBytes(storageRef, processed.blob, {
          contentType: "image/jpeg",
        });
        const downloadUrl = await getDownloadURL(storageRef);

        newlyUploaded.push({
          photoId,
          url: downloadUrl,
          storagePath,
          fileName: processed.fileName,
          caption: item.caption.trim(),
          pageOrder: uploadedPhotos.length + newlyUploaded.length + 1,
          uploadedAt: new Date().toISOString(),
          sizeBytes: processed.blob.size,
        });
      }

      // Cleanup revoked preview URLs
      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPendingPhotos([]);

      const merged = [...uploadedPhotos, ...newlyUploaded].map((p, idx) => ({
        ...p,
        pageOrder: idx + 1,
      }));
      setUploadedPhotos(merged);
      return merged;
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function saveReport(targetStatus: "draft" | "submitted") {
    if (!user || !currentClass || !selectedSchoolYearId || !currentWeek) {
      toast.error("Thiếu thông tin lớp học hoặc tuần báo cáo.");
      return;
    }

    const effectiveTeacherId = currentClass.homeroomTeacherId || teacherId;
    if (!effectiveTeacherId && role !== "admin" && role !== "bgh") {
      toast.error("Không xác định được mã giáo viên chủ nhiệm.");
      return;
    }

    const totalPhotosAfter = uploadedPhotos.length + pendingPhotos.length;
    const hasForm = hasMeaningfulFormContent(formData);

    if (targetStatus === "submitted") {
      if (submissionType === "form_only" && !hasForm) {
        toast.warning("Vui lòng nhập nội dung báo cáo hoặc chuyển sang chế độ chụp ảnh sổ giấy.");
        return;
      }
      if (submissionType === "photo_only" && totalPhotosAfter === 0) {
        toast.warning("Vui lòng chụp hoặc tải lên ít nhất 1 ảnh trang sổ sinh hoạt.");
        return;
      }
      if (submissionType === "hybrid" && !hasForm && totalPhotosAfter === 0) {
        toast.warning("Vui lòng nhập nội dung form hoặc đính kèm ít nhất 1 ảnh.");
        return;
      }
    }

    setSaving(true);
    try {
      const finalPhotos = await uploadAllPendingPhotos();

      // Delete any removed photos from storage
      for (const path of removedPhotoPaths) {
        try {
          await deleteObject(ref(firebaseStorage, path));
        } catch {
          // Ignore missing storage object
        }
      }
      setRemovedPhotoPaths([]);

      // Determine accurate submissionType based on actual content
      let resolvedType: HomeroomSubmissionType = submissionType;
      if (finalPhotos.length > 0 && hasForm) {
        resolvedType = submissionType === "photo_only" ? "photo_only" : "hybrid";
      } else if (finalPhotos.length > 0 && !hasForm) {
        resolvedType = "photo_only";
      } else if (finalPhotos.length === 0 && hasForm) {
        resolvedType = "form_only";
      }

      const rawGrade = Number(
        getClassGrade(currentClass) || currentClass.grade || currentClass.gradeLevel || 0,
      );
      const classGrade =
        Number.isFinite(rawGrade) && rawGrade >= 0 && rawGrade <= 12 ? Math.trunc(rawGrade) : 0;

      const sanitizedFormData: HomeroomReportFormData = {
        ...formData,
        meetingDate: (formData.meetingDate || "").slice(0, 30),
        totalStudents: Math.max(0, Math.min(200, Math.trunc(Number(formData.totalStudents) || 0))),
        presentCount: Math.max(0, Math.min(200, Math.trunc(Number(formData.presentCount) || 0))),
        tardyCount: Math.max(0, Math.min(500, Math.trunc(Number(formData.tardyCount) || 0))),
        goodSessionsCount: Math.max(
          0,
          Math.min(100, Math.trunc(Number(formData.goodSessionsCount) || 0)),
        ),
        badSessionsCount: Math.max(
          0,
          Math.min(100, Math.trunc(Number(formData.badSessionsCount) || 0)),
        ),
      };

      const reportRef = doc(firestore, "homeroomWeeklyReports", activeReportId);

      const mutablePayload: Record<string, unknown> = {
        weekId: currentWeek.weekId || currentWeek.weekKey,
        className: String(currentClass.name || currentClass.code || activeClassId).slice(0, 100),
        grade: classGrade,
        teacherName: (teacherName || user.displayName || user.email || "GVCN").slice(0, 150),
        submissionType: resolvedType,
        status: targetStatus,
        formData: sanitizedFormData,
        photos: finalPhotos,
        photoNote: photoNote.trim().slice(0, 2000),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

      if (targetStatus === "submitted") {
        mutablePayload.submittedAt = serverTimestamp();
      }

      if (!existingReport) {
        await setDoc(reportRef, {
          ...mutablePayload,
          schoolYearId: selectedSchoolYearId,
          weekKey: currentWeek.weekKey,
          weekNumber: currentWeek.weekNumber,
          classId: activeClassId,
          teacherId: effectiveTeacherId || user.uid,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
      } else {
        await updateDoc(reportRef, mutablePayload);
      }

      toast.success(
        targetStatus === "submitted"
          ? `Đã gửi Sổ SH GVCN Tuần ${currentWeek.weekNumber} lên Hiệu trưởng/BGH!`
          : `Đã lưu bản nháp Tuần ${currentWeek.weekNumber}.`,
      );
    } catch (err) {
      console.error("Lỗi lưu báo cáo Sổ SH GVCN:", err);
      toast.error("Không thể lưu báo cáo. Vui lòng kiểm tra kết nối và thử lại.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAcknowledgeFeedback() {
    if (!user || !existingReport?.principalFeedback) return;
    setAcknowledging(true);
    try {
      await updateDoc(doc(firestore, "homeroomWeeklyReports", existingReport.id), {
        "principalFeedback.isAcknowledgedByTeacher": true,
        "principalFeedback.acknowledgedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      toast.success("Đã xác nhận tiếp thu ý kiến chỉ đạo của Hiệu trưởng / BGH.");
    } catch (err) {
      console.error("Lỗi xác nhận phản hồi:", err);
      toast.error("Không thể xác nhận phản hồi lúc này.");
    } finally {
      setAcknowledging(false);
    }
  }

  const reportsByWeekNumber = useMemo(() => {
    const map = new Map<number, HomeroomWeeklyReport>();
    for (const r of classReports) {
      map.set(r.weekNumber, r);
    }
    return map;
  }, [classReports]);

  const currentYearName = useMemo(() => {
    const sy = schoolYears.find((y) => y.id === selectedSchoolYearId);
    return String(sy?.name || sy?.code || "Năm học hiện tại");
  }, [schoolYears, selectedSchoolYearId]);

  // Build preview object for modal / printing
  const livePreviewReport: HomeroomWeeklyReport = useMemo(
    () => ({
      id: activeReportId,
      schoolYearId: selectedSchoolYearId,
      weekKey: currentWeek?.weekKey || "",
      weekNumber: selectedWeekNumber,
      classId: activeClassId,
      className: String(currentClass?.name || currentClass?.code || ""),
      grade: Number(getClassGrade(currentClass || {}) || 0),
      teacherId,
      teacherName,
      submissionType,
      status: existingReport?.status || "draft",
      formData,
      photos: uploadedPhotos,
      photoNote,
      principalFeedback: existingReport?.principalFeedback,
    }),
    [
      activeReportId,
      selectedSchoolYearId,
      currentWeek,
      selectedWeekNumber,
      activeClassId,
      currentClass,
      teacherId,
      teacherName,
      submissionType,
      existingReport,
      formData,
      uploadedPhotos,
      photoNote,
    ],
  );

  const reviewedCount = useMemo(
    () => classReports.filter((r) => r.status === "reviewed").length,
    [classReports],
  );
  const submittedCount = useMemo(
    () => classReports.filter((r) => r.status === "submitted" || r.status === "reviewed").length,
    [classReports],
  );

  return (
    <RoleGuard allowedRoles={["giaovien", "totruong", "bgh", "admin"]}>
      <Shell>
        <FeatureLockGuard featureKey="homeroom_activity_book">
          <div className="space-y-6">
            <div className="print:hidden">
              <PageHeader
                title="SỔ SH GVCN — Sinh hoạt lớp hàng tuần"
                description="Cập nhật tình hình lớp hàng tuần qua biểu mẫu điện tử hoặc chụp ảnh sổ giấy gửi Hiệu trưởng / BGH xem và nhận xét."
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminFeatureLockButton featureKey="homeroom_activity_book" />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPreviewModalOpen(true)}
                      disabled={!activeClassId}
                    >
                      <Eye className="h-4 w-4" />
                      Xem & In phiếu
                    </Button>
                  </div>
                }
              />
            </div>

            {checkingHomeroom ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-96 w-full" />
              </div>
            ) : homeroomClasses.length === 0 ? (
              <Card className="p-6">
                <EmptyState
                  icon={<BookOpenCheck className="h-6 w-6" />}
                  title="Bạn chưa được phân công làm Giáo viên chủ nhiệm"
                  description="Tài khoản của bạn hiện chưa gắn với lớp chủ nhiệm nào trong năm học này. Nếu có sự nhầm lẫn, vui lòng liên hệ Quản trị viên hoặc Ban Giám Hiệu."
                />
              </Card>
            ) : (
              <>
                {/* Top selector bar & summary KPIs */}
                <Card className="p-4 sm:p-5 print:hidden">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
                    <div className="md:col-span-3">
                      <Label htmlFor="shSchoolYear">Năm học</Label>
                      <select
                        id="shSchoolYear"
                        value={selectedSchoolYearId}
                        onChange={(e) => setSelectedSchoolYearId(e.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary"
                      >
                        {schoolYears.map((sy) => (
                          <option key={sy.id} value={sy.id}>
                            {sy.name || sy.code || sy.id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <Label htmlFor="shClass">Lớp chủ nhiệm</Label>
                      <select
                        id="shClass"
                        value={activeClassId}
                        onChange={(e) => setActiveClassId(e.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary"
                      >
                        {homeroomClasses.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {formatClassName(cls.name || cls.code)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-4">
                      <Label htmlFor="shWeek">Tuần báo cáo</Label>
                      <select
                        id="shWeek"
                        value={selectedWeekNumber}
                        onChange={(e) => setSelectedWeekNumber(Number(e.target.value))}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary"
                      >
                        {weekOptions.map((w) => {
                          const r = reportsByWeekNumber.get(w.weekNumber);
                          const statusMark =
                            r?.status === "reviewed"
                              ? " ✓ (BGH đã xem)"
                              : r?.status === "submitted"
                                ? " • (Đã gửi)"
                                : r?.status === "draft"
                                  ? " ◦ (Nháp)"
                                  : "";
                          return (
                            <option key={w.weekNumber} value={w.weekNumber}>
                              {w.label}
                              {w.isCurrent ? " [Tuần này]" : ""}
                              {statusMark}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="md:col-span-2 flex flex-col justify-end">
                      <div className="flex h-11 items-center justify-center rounded-xl border border-border bg-slate-50 px-3">
                        {existingReport?.status === "reviewed" ? (
                          <Badge tone="success">BGH đã xem</Badge>
                        ) : existingReport?.status === "submitted" ? (
                          <Badge tone="info">Đã gửi BGH</Badge>
                        ) : existingReport?.status === "draft" ? (
                          <Badge tone="warning">Đang lưu nháp</Badge>
                        ) : (
                          <Badge tone="neutral">Chưa nộp tuần {selectedWeekNumber}</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick progress strip across weeks */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5 text-primary" />
                        Đã nộp trong năm:{" "}
                        <strong className="text-foreground">{submittedCount} tuần</strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Hiệu trưởng / BGH đã nhận xét:{" "}
                        <strong className="text-emerald-700">{reviewedCount} tuần</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                      <span className="text-[11px] font-medium">Chuyển nhanh:</span>
                      {[
                        Math.max(1, selectedWeekNumber - 2),
                        Math.max(1, selectedWeekNumber - 1),
                        selectedWeekNumber,
                        Math.min(35, selectedWeekNumber + 1),
                      ]
                        .filter((v, idx, arr) => arr.indexOf(v) === idx)
                        .map((wk) => {
                          const rep = reportsByWeekNumber.get(wk);
                          return (
                            <button
                              key={wk}
                              type="button"
                              onClick={() => setSelectedWeekNumber(wk)}
                              className={cn(
                                "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                                wk === selectedWeekNumber
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : rep?.status === "reviewed"
                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : rep?.status === "submitted"
                                      ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                                      : "bg-muted text-muted-foreground hover:bg-slate-200",
                              )}
                            >
                              T{wk}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </Card>

                {/* Principal Feedback Banner if exists */}
                {existingReport?.principalFeedback?.feedbackContent ? (
                  <Card className="border-emerald-300 bg-emerald-50/70 p-4 sm:p-5 print:hidden">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          <h3 className="text-sm font-bold text-emerald-950">
                            Nhận xét & Chỉ đạo của Hiệu trưởng / BGH — Tuần {selectedWeekNumber}
                          </h3>
                          {existingReport.principalFeedback.rating ? (
                            <Badge tone="success">
                              {homeroomPrincipalRatingLabels[existingReport.principalFeedback.rating]}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-line text-sm leading-6 text-emerald-900">
                          {existingReport.principalFeedback.feedbackContent}
                        </p>
                        <p className="text-xs text-emerald-800/80">
                          Người duyệt:{" "}
                          <strong>{existingReport.principalFeedback.reviewedByName}</strong>
                        </p>
                      </div>

                      <div className="shrink-0">
                        {existingReport.principalFeedback.isAcknowledgedByTeacher ? (
                          <Badge tone="success" className="gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Đã tiếp thu ý kiến
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={acknowledging}
                            onClick={handleAcknowledgeFeedback}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Xác nhận đã tiếp thu
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ) : null}

                {/* Main Editor Card */}
                {loadingReports ? (
                  <Skeleton className="h-96 w-full" />
                ) : (
                  <Card className="overflow-hidden print:hidden">
                    {/* Submission Mode Tabs */}
                    <div className="border-b border-border bg-slate-50/80 p-4 sm:px-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-base font-bold text-foreground">
                            Cập nhật Sổ SH GVCN — {formatClassName(currentClass?.name || currentClass?.code)} • Tuần{" "}
                            {selectedWeekNumber}
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            Chọn nhập trực tiếp trên Form hoặc chụp ảnh sổ giấy tải lên (hoặc kết hợp cả hai).
                          </p>
                        </div>

                        <div className="inline-flex flex-wrap rounded-xl border border-border bg-white p-1 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setSubmissionType("form_only")}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                              submissionType === "form_only"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Điền Form
                          </button>
                          <button
                            type="button"
                            onClick={() => setSubmissionType("photo_only")}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                              submissionType === "photo_only"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <Camera className="h-3.5 w-3.5" />
                            Chụp hình đưa lên
                            {uploadedPhotos.length + pendingPhotos.length > 0 ? (
                              <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-950">
                                {uploadedPhotos.length + pendingPhotos.length}
                              </span>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSubmissionType("hybrid")}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                              submissionType === "hybrid"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <Layers className="h-3.5 w-3.5" />
                            Kết hợp cả hai
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 p-4 sm:p-6">
                      {/* PHOTO UPLOAD SECTION (shown in photo_only or hybrid) */}
                      {(submissionType === "photo_only" || submissionType === "hybrid") && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 border-b border-border pb-2">
                            <Camera className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-bold text-foreground">
                              Phần Ảnh chụp Sổ Sinh Hoạt giấy
                            </h3>
                          </div>

                          <HomeroomPhotoUploader
                            uploadedPhotos={uploadedPhotos}
                            pendingPhotos={pendingPhotos}
                            maxPhotos={10}
                            uploading={uploadingPhotos || saving}
                            onAddFiles={handleAddFiles}
                            onRemoveUploaded={handleRemoveUploaded}
                            onRemovePending={handleRemovePending}
                            onRotatePending={handleRotatePending}
                            onCaptionUploaded={(photoId, caption) =>
                              setUploadedPhotos((prev) =>
                                prev.map((p) => (p.photoId === photoId ? { ...p, caption } : p)),
                              )
                            }
                            onCaptionPending={(localId, caption) =>
                              setPendingPhotos((prev) =>
                                prev.map((p) => (p.localId === localId ? { ...p, caption } : p)),
                              )
                            }
                            onMoveUploaded={handleMoveUploaded}
                            onPreviewPhoto={(idx) => {
                              setLightboxIndex(idx);
                              setLightboxOpen(true);
                            }}
                          />

                          <div>
                            <Label htmlFor="photoNote">
                              Ghi chú nhanh gửi Hiệu trưởng kèm ảnh (tùy chọn)
                            </Label>
                            <textarea
                              id="photoNote"
                              rows={2}
                              value={photoNote}
                              onChange={(e) => setPhotoNote(e.target.value)}
                              placeholder="Ví dụ: Em xin gửi ảnh chụp sổ sinh hoạt tuần này, kính nhờ thầy/cô Hiệu trưởng xem mục kiến nghị cuối trang 2..."
                              className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                            />
                          </div>
                        </div>
                      )}

                      {/* FORM INPUT SECTION (shown in form_only or hybrid) */}
                      {(submissionType === "form_only" || submissionType === "hybrid") && (
                        <div className="space-y-6">
                          {submissionType === "hybrid" ? (
                            <div className="flex items-center gap-2 border-b border-border pt-2 pb-2">
                              <FileText className="h-4 w-4 text-primary" />
                              <h3 className="text-sm font-bold text-foreground">
                                Phần Biểu mẫu Báo cáo Tình hình Lớp
                              </h3>
                            </div>
                          ) : null}

                          {/* Section 1: Attendance & Meeting Date */}
                          <div className="rounded-2xl border border-border bg-slate-50/50 p-4 space-y-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                              <Users className="h-4 w-4 text-primary" />
                              <span>1. Sĩ số & Chuyên cần trong tuần</span>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <Label htmlFor="meetingDate">Ngày sinh hoạt lớp</Label>
                                <Input
                                  id="meetingDate"
                                  type="date"
                                  value={formData.meetingDate || ""}
                                  onChange={(e) => updateFormField("meetingDate", e.target.value)}
                                />
                              </div>
                              <div>
                                <Label htmlFor="totalStudents">Sĩ số lớp</Label>
                                <Input
                                  id="totalStudents"
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={formData.totalStudents}
                                  onChange={(e) =>
                                    updateFormField("totalStudents", Math.max(0, Number(e.target.value) || 0))
                                  }
                                />
                              </div>
                              <div>
                                <Label htmlFor="presentCount">Số HS có mặt</Label>
                                <Input
                                  id="presentCount"
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={formData.presentCount}
                                  onChange={(e) =>
                                    updateFormField("presentCount", Math.max(0, Number(e.target.value) || 0))
                                  }
                                />
                              </div>
                              <div>
                                <Label htmlFor="tardyCount">Số lượt đi trễ tuần</Label>
                                <Input
                                  id="tardyCount"
                                  type="number"
                                  min={0}
                                  max={500}
                                  value={formData.tardyCount}
                                  onChange={(e) =>
                                    updateFormField("tardyCount", Math.max(0, Number(e.target.value) || 0))
                                  }
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <div>
                                <Label htmlFor="absentWithPermission">Học sinh vắng có phép (nếu có)</Label>
                                <textarea
                                  id="absentWithPermission"
                                  rows={2}
                                  value={formData.absentWithPermission || ""}
                                  onChange={(e) =>
                                    updateFormField("absentWithPermission", e.target.value)
                                  }
                                  placeholder="Ví dụ: Nguyễn Văn A (thứ 3 - ốm), Trần Thị B (thứ 5 - việc gia đình)..."
                                  className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                                />
                              </div>
                              <div>
                                <Label htmlFor="absentWithoutPermission">
                                  Học sinh vắng không phép (nếu có)
                                </Label>
                                <textarea
                                  id="absentWithoutPermission"
                                  rows={2}
                                  value={formData.absentWithoutPermission || ""}
                                  onChange={(e) =>
                                    updateFormField("absentWithoutPermission", e.target.value)
                                  }
                                  placeholder="Ghi rõ họ tên, buổi nghỉ và biện pháp đã liên hệ phụ huynh..."
                                  className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Section 2: Discipline & Conduct */}
                          <div className="rounded-2xl border border-border bg-slate-50/50 p-4 space-y-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                                <ClipboardList className="h-4 w-4 text-primary" />
                                <span>2. Tình hình Nền nếp, Kỷ luật & Thi đua</span>
                              </div>
                              <div className="w-full sm:w-56">
                                <Input
                                  value={formData.disciplineRankOrScore || ""}
                                  onChange={(e) =>
                                    updateFormField("disciplineRankOrScore", e.target.value)
                                  }
                                  placeholder="Xếp hạng / Điểm thi đua (VD: Hạng 2)"
                                  className="h-9 bg-white text-xs"
                                />
                              </div>
                            </div>

                            <div>
                              <Label htmlFor="disciplineOverview">
                                Nhận xét chung về nề nếp, đồng phục, vệ sinh, truy bài
                              </Label>
                              <textarea
                                id="disciplineOverview"
                                rows={3}
                                value={formData.disciplineOverview || ""}
                                onChange={(e) => updateFormField("disciplineOverview", e.target.value)}
                                placeholder="Ví dụ: Đa số học sinh thực hiện tốt nội quy, trực nhật sạch sẽ, đồng phục đúng quy định..."
                                className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                              />
                            </div>

                            <div>
                              <Label htmlFor="notableViolations">
                                Học sinh vi phạm nổi bật / Trường hợp cá biệt cần lưu ý
                              </Label>
                              <textarea
                                id="notableViolations"
                                rows={2}
                                value={formData.notableViolations || ""}
                                onChange={(e) => updateFormField("notableViolations", e.target.value)}
                                placeholder="Ghi rõ tên học sinh vi phạm nội quy nhiều lần, mất trật tự, gây gổ... và hướng xử lý của GVCN."
                                className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                              />
                            </div>
                          </div>

                          {/* Section 3: Academic & Commendations */}
                          <div className="rounded-2xl border border-border bg-slate-50/50 p-4 space-y-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                              <BookOpen className="h-4 w-4 text-primary" />
                              <span>3. Tình hình Học tập & Tuyên dương</span>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div>
                                <Label htmlFor="goodSessionsCount">Số tiết học tốt trong tuần</Label>
                                <Input
                                  id="goodSessionsCount"
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={formData.goodSessionsCount}
                                  onChange={(e) =>
                                    updateFormField(
                                      "goodSessionsCount",
                                      Math.max(0, Number(e.target.value) || 0),
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <Label htmlFor="badSessionsCount">Số tiết học chưa tốt (nếu có)</Label>
                                <Input
                                  id="badSessionsCount"
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={formData.badSessionsCount}
                                  onChange={(e) =>
                                    updateFormField(
                                      "badSessionsCount",
                                      Math.max(0, Number(e.target.value) || 0),
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <div>
                              <Label htmlFor="academicOverview">
                                Nhận xét tình hình học tập các bộ môn
                              </Label>
                              <textarea
                                id="academicOverview"
                                rows={3}
                                value={formData.academicOverview || ""}
                                onChange={(e) => updateFormField("academicOverview", e.target.value)}
                                placeholder="Tình hình chuẩn bị bài, phát biểu xây dựng bài, điểm kiểm tra hoặc lưu ý từ giáo viên bộ môn..."
                                className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                              />
                            </div>

                            <div>
                              <Label htmlFor="commendations">
                                Biểu dương / Khen thưởng học sinh tiêu biểu trong tuần
                              </Label>
                              <textarea
                                id="commendations"
                                rows={2}
                                value={formData.commendations || ""}
                                onChange={(e) => updateFormField("commendations", e.target.value)}
                                placeholder="Ghi tên học sinh đạt điểm cao, tiến bộ vượt bậc, nhặt được của rơi, tích cực công tác lớp..."
                                className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                              />
                            </div>
                          </div>

                          {/* Section 4: Parents, Movement & Next Week Plan */}
                          <div className="rounded-2xl border border-border bg-slate-50/50 p-4 space-y-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                              <Sparkles className="h-4 w-4 text-primary" />
                              <span>4. Phối hợp PHHS, Phong trào & Kế hoạch tuần tới</span>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <div>
                                <Label htmlFor="parentCoordination">
                                  Công tác phối hợp Cha mẹ học sinh (PHHS)
                                </Label>
                                <textarea
                                  id="parentCoordination"
                                  rows={3}
                                  value={formData.parentCoordination || ""}
                                  onChange={(e) =>
                                    updateFormField("parentCoordination", e.target.value)
                                  }
                                  placeholder="Đã trao đổi/gặp gỡ phụ huynh em nào? Nội dung phối hợp giáo dục..."
                                  className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                                />
                              </div>
                              <div>
                                <Label htmlFor="movementActivities">
                                  Hoạt động Đội, Phong trào & Lao động
                                </Label>
                                <textarea
                                  id="movementActivities"
                                  rows={3}
                                  value={formData.movementActivities || ""}
                                  onChange={(e) =>
                                    updateFormField("movementActivities", e.target.value)
                                  }
                                  placeholder="Tham gia các hoạt động ngoại khóa, văn nghệ, thể dục thể thao, phong trào trường..."
                                  className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                                />
                              </div>
                            </div>

                            <div>
                              <Label htmlFor="nextWeekPlan">
                                Phương hướng / Nhiệm vụ trọng tâm tuần tiếp theo
                              </Label>
                              <textarea
                                id="nextWeekPlan"
                                rows={3}
                                value={formData.nextWeekPlan || ""}
                                onChange={(e) => updateFormField("nextWeekPlan", e.target.value)}
                                placeholder="Những việc cần tập trung nhắc nhở lớp, kiểm tra giữa kỳ/cuối kỳ, phong trào sắp tới..."
                                className="w-full rounded-xl border border-border bg-white p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                              />
                            </div>

                            <div>
                              <Label htmlFor="teacherRecommendations">
                                Kiến nghị / Đề xuất với Hiệu trưởng & Ban Giám Hiệu (nếu có)
                              </Label>
                              <textarea
                                id="teacherRecommendations"
                                rows={2}
                                value={formData.teacherRecommendations || ""}
                                onChange={(e) =>
                                  updateFormField("teacherRecommendations", e.target.value)
                                }
                                placeholder="Đề xuất sửa chữa cơ sở vật chất lớp học, hỗ trợ học sinh hoàn cảnh khó khăn..."
                                className="w-full rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Footer */}
                      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-muted-foreground">
                          {existingReport?.status === "submitted" ? (
                            <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium">
                              <Clock className="h-3.5 w-3.5" />
                              Báo cáo đã được gửi. Bạn vẫn có thể chỉnh sửa và bấm Cập nhật lại.
                            </span>
                          ) : existingReport?.status === "reviewed" ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              BGH đã xem báo cáo này. Nếu bổ sung thông tin, hãy bấm Gửi cập nhật.
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Hãy kiểm tra kỹ thông tin hoặc độ nét của ảnh trước khi gửi.
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <Button
                            type="button"
                            variant="secondary"
                            loading={saving}
                            onClick={() => saveReport("draft")}
                          >
                            <Save className="h-4 w-4" />
                            Lưu nháp
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            loading={saving}
                            onClick={() => saveReport("submitted")}
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {existingReport?.status === "submitted" || existingReport?.status === "reviewed"
                              ? "Cập nhật báo cáo gửi BGH"
                              : "Gửi báo cáo lên Hiệu trưởng"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Preview & Print Modal */}
          <Modal
            open={previewModalOpen}
            onOpenChange={setPreviewModalOpen}
            title={`Phiếu Sổ SH GVCN — ${formatClassName(currentClass?.name || currentClass?.code)}`}
            description={`${currentYearName} • ${currentWeek?.label || `Tuần ${selectedWeekNumber}`}`}
            wide
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setPreviewModalOpen(false)}>
                  Đóng
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setPreviewModalOpen(false);
                    setTimeout(() => window.print(), 150);
                  }}
                >
                  <Printer className="h-4 w-4" />
                  In phiếu A4
                </Button>
              </div>
            }
          >
            <HomeroomReportDetailView
              report={livePreviewReport}
              weekLabel={currentWeek?.label}
            />
          </Modal>

          {/* Printable A4 Sheet (hidden on screen, visible when printing) */}
          <div className="hidden print:block p-4">
            <div className="mb-4 border-b-2 border-slate-800 pb-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                SỔ SINH HOẠT GIÁO VIÊN CHỦ NHIỆM — {currentYearName}
              </p>
              <h1 className="mt-1 text-xl font-bold text-slate-900">
                BÁO CÁO TÌNH HÌNH LỚP {formatClassName(currentClass?.name || currentClass?.code)} —{" "}
                {currentWeek?.label || `Tuần ${selectedWeekNumber}`}
              </h1>
            </div>
            <HomeroomReportDetailView
              report={livePreviewReport}
              weekLabel={currentWeek?.label}
            />
          </div>

          <HomeroomPhotoLightbox
            photos={uploadedPhotos}
            initialIndex={lightboxIndex}
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
          />
        </FeatureLockGuard>
      </Shell>
    </RoleGuard>
  );
}

export default function HomeroomActivityBookPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <HomeroomActivityBookContent />
    </Suspense>
  );
}
