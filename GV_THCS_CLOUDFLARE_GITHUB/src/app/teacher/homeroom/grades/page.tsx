"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  GraduationCap,
  MessageSquare,
  Phone,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import {
  exportHomeroomWeakStudentsExcel,
  exportClassGradeMatrixExcel,
  type SubjectColumn,
} from "@/lib/exports/grades-excel";
import {
  generateZaloReminderMessage,
  reminderStatuses,
  type ReminderStatus,
} from "@school/shared";

type Row = { id: string; [key: string]: any };

type StudentSummary = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  classId: string;
  className: string;
  periodId: string;
  averageScore?: number | null;
  weakSubjectCount: number;
  weakSubjectNames: string[];
  hasWeakSubjects: boolean;
  subjectScores: Record<
    string,
    {
      subjectId: string;
      subjectCode: string;
      subjectName: string;
      score: number | null;
      isWeak: boolean;
    }
  >;
};

function HomeroomGradesContent() {
  const { user, claims } = useAuth();

  // Teacher & Homeroom classes
  const [checkingHomeroom, setCheckingHomeroom] = useState(true);
  const [teacherId, setTeacherId] = useState("");
  const [homeroomClasses, setHomeroomClasses] = useState<Row[]>([]);
  const [activeClassId, setActiveClassId] = useState("");

  // Collections
  const [periods, setPeriods] = useState<Row[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [reminders, setReminders] = useState<Record<string, Row>>({}); // key: studentId

  // Tab: 'warnings' | 'matrix'
  const [activeTab, setActiveTab] = useState<"warnings" | "matrix">("warnings");
  const [warningFilter, setWarningFilter] = useState<"all" | "pending" | "handled">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal: Reminder Dialog
  const [selectedStudentForReminder, setSelectedStudentForReminder] = useState<StudentSummary | null>(null);
  const [reminderContent, setReminderContent] = useState("");
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus>("pending");
  const [parentFeedback, setParentFeedback] = useState("");
  const [isSavingReminder, setIsSavingReminder] = useState(false);

  // 1. Resolve Teacher and Homeroom Classes
  useEffect(() => {
    async function resolveHomeroom() {
      if (!user) return;
      setCheckingHomeroom(true);

      let tId = "";
      try {
        const teacherContext = await getCurrentTeacherContext(user.uid);
        tId = teacherContext.teacherId;
        setTeacherId(tId);
      } catch {
        // User may be Admin/BGH without teacherId
      }

      const unsubClasses = onSnapshot(collection(firestore, "classes"), (snap) => {
        const allCls = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
        let myClasses = allCls;

        if (tId) {
          myClasses = allCls.filter((c) => c.homeroomTeacherId === tId);
        }

        // If Admin/BGH, allow seeing all classes if not assigned as homeroom
        if (myClasses.length === 0 && (claims?.role === "admin" || claims?.role === "bgh")) {
          myClasses = allCls;
        }

        myClasses.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
        setHomeroomClasses(myClasses);

        if (myClasses.length > 0 && !activeClassId) {
          setActiveClassId(myClasses[0].id);
        }
        setCheckingHomeroom(false);
      });

      return () => unsubClasses();
    }

    void resolveHomeroom();
  }, [user, claims]);

  // 2. Fetch Periods & Subjects
  useEffect(() => {
    const unsubPeriods = onSnapshot(collection(firestore, "gradePeriods"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPeriods(list);
      if (list.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(list[0].id);
      }
    });

    const unsubSubjects = onSnapshot(collection(firestore, "subjects"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
      setSubjects(list);
    });

    return () => {
      unsubPeriods();
      unsubSubjects();
    };
  }, []);

  // 3. Fetch Students of the active class
  useEffect(() => {
    if (!activeClassId) {
      setStudents([]);
      return;
    }
    const unsubStudents = onSnapshot(collection(firestore, "students"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Row)
        .filter((s) => s.classId === activeClassId && s.isActive !== false);
      list.sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || ""), "vi"));
      setStudents(list);
    });
    return () => unsubStudents();
  }, [activeClassId]);

  // 4. Fetch Student Grade Summaries for active class & selected period
  useEffect(() => {
    if (!activeClassId || !selectedPeriodId) {
      setSummaries([]);
      return;
    }
    const unsubSummaries = onSnapshot(collection(firestore, "studentPeriodSummaries"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as StudentSummary))
        .filter((d) => d.classId === activeClassId && d.periodId === selectedPeriodId);
      list.sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || ""), "vi"));
      setSummaries(list);
    });
    return () => unsubSummaries();
  }, [activeClassId, selectedPeriodId]);

  // 5. Fetch Reminders for active class & selected period
  useEffect(() => {
    if (!activeClassId || !selectedPeriodId) {
      setReminders({});
      return;
    }
    const unsubReminders = onSnapshot(collection(firestore, "gradeReminders"), (snap) => {
      const map: Record<string, Row> = {};
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() } as Row;
        if (data.classId === activeClassId && data.periodId === selectedPeriodId) {
          map[data.studentId] = data;
        }
      });
      setReminders(map);
    });
    return () => unsubReminders();
  }, [activeClassId, selectedPeriodId]);

  // Current selected objects
  const activeClass = useMemo(() => {
    return homeroomClasses.find((c) => c.id === activeClassId);
  }, [homeroomClasses, activeClassId]);

  const activePeriod = useMemo(() => {
    return periods.find((p) => p.id === selectedPeriodId);
  }, [periods, selectedPeriodId]);

  // Map student info
  const studentInfoMap = useMemo(() => {
    const map = new Map<string, Row>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  // Weak Students list
  const weakStudents = useMemo(() => {
    return summaries.filter((s) => s.hasWeakSubjects);
  }, [summaries]);

  // Quick stats
  const stats = useMemo(() => {
    const totalStudents = students.length || summaries.length;
    const weakCount = weakStudents.length;
    const weakPercent = totalStudents > 0 ? Math.round((weakCount / totalStudents) * 100) : 0;

    // Count by reminder status
    let remindedCount = 0;
    weakStudents.forEach((st) => {
      const rem = reminders[st.studentId];
      if (rem && (rem.status === "reminded" || rem.status === "parent_contacted" || rem.status === "resolved")) {
        remindedCount++;
      }
    });

    // Subject breakdown
    const subjectWeakCount: Record<string, number> = {};
    weakStudents.forEach((st) => {
      if (st.subjectScores) {
        Object.values(st.subjectScores).forEach((sub) => {
          if (sub.isWeak && sub.subjectName) {
            subjectWeakCount[sub.subjectName] = (subjectWeakCount[sub.subjectName] || 0) + 1;
          }
        });
      }
    });

    const topWeak = Object.entries(subjectWeakCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalStudents,
      weakCount,
      weakPercent,
      remindedCount,
      pendingCount: weakCount - remindedCount,
      topWeak,
    };
  }, [students, summaries, weakStudents, reminders]);

  // Filtered weak students list
  const filteredWeakStudents = useMemo(() => {
    return weakStudents.filter((st) => {
      const rem = reminders[st.studentId];
      const status = (rem?.status as ReminderStatus) || "pending";

      if (warningFilter === "pending" && status !== "pending") return false;
      if (warningFilter === "handled" && status === "pending") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        st.studentName.toLowerCase().includes(q) ||
        st.studentCode.toLowerCase().includes(q)
      );
    });
  }, [weakStudents, reminders, warningFilter, searchQuery]);

  // Filtered all students for matrix
  const matrixStudents = useMemo(() => {
    return summaries.filter((st) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        st.studentName.toLowerCase().includes(q) ||
        st.studentCode.toLowerCase().includes(q)
      );
    });
  }, [summaries, searchQuery]);

  // Columns for matrix
  const matrixSubjectColumns: SubjectColumn[] = useMemo(() => {
    // Only show subjects that have at least one score in summaries
    const subIdsInUse = new Set<string>();
    summaries.forEach((s) => {
      if (s.subjectScores) {
        Object.keys(s.subjectScores).forEach((id) => subIdsInUse.add(id));
      }
    });

    return subjects
      .filter((s) => subIdsInUse.has(s.id))
      .map((s) => ({
        id: s.id,
        code: s.code || "",
        name: s.name || s.code || "",
      }));
  }, [subjects, summaries]);

  // Open Reminder Dialog
  function handleOpenReminderModal(student: StudentSummary) {
    setSelectedStudentForReminder(student);
    const existing = reminders[student.studentId];
    if (existing) {
      setReminderContent(existing.reminderContent || "");
      setReminderStatus(existing.status || "pending");
      setParentFeedback(existing.parentFeedback || "");
    } else {
      // Auto generate message template
      const weakSubs = Object.values(student.subjectScores || {})
        .filter((sub) => sub.isWeak)
        .map((sub) => ({ subjectName: sub.subjectName, score: sub.score ?? "Chưa đạt" }));

      const template = generateZaloReminderMessage({
        studentName: student.studentName,
        className: activeClass?.name || "",
        periodName: activePeriod?.name || "Kỳ kiểm tra",
        weakSubjects: weakSubs,
      });

      setReminderContent(template);
      setReminderStatus("pending");
      setParentFeedback("");
    }
  }

  // Copy Zalo message to clipboard
  async function handleCopyZaloMessage() {
    if (!reminderContent) return;
    try {
      await navigator.clipboard.writeText(reminderContent);
      toast.success("Đã sao chép nội dung tin nhắn Zalo vào bộ nhớ tạm!");
    } catch {
      toast.error("Không thể tự động sao chép. Bạn hãy bôi đen và copy thủ công nhé.");
    }
  }

  // Save Reminder Note
  async function handleSaveReminder() {
    if (!selectedStudentForReminder || !activeClass || !activePeriod) return;

    setIsSavingReminder(true);
    try {
      const studentId = selectedStudentForReminder.studentId;
      const reminderDocId = `${activePeriod.id}_${studentId}`;
      const reminderRef = doc(firestore, "gradeReminders", reminderDocId);

      const weakSubs = Object.values(selectedStudentForReminder.subjectScores || {})
        .filter((sub) => sub.isWeak)
        .map((sub) => ({ subjectName: sub.subjectName, score: sub.score ?? "Chưa đạt" }));

      const studentData = studentInfoMap.get(studentId);

      await setDoc(
        reminderRef,
        {
          periodId: activePeriod.id,
          classId: activeClass.id,
          studentId,
          studentCode: selectedStudentForReminder.studentCode,
          studentName: selectedStudentForReminder.studentName,
          homeroomTeacherId: teacherId || user?.uid || "",
          weakSubjects: weakSubs,
          reminderContent: reminderContent.trim(),
          status: reminderStatus,
          parentPhone: studentData?.parentPhone || "",
          parentFeedback: parentFeedback.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast.success("Đã lưu trạng thái nhắc nhở thành công!");
      setSelectedStudentForReminder(null);
    } catch (err) {
      console.error(err);
      toast.error("Không thể lưu nhắc nhở. Vui lòng kiểm tra quyền!");
    } finally {
      setIsSavingReminder(false);
    }
  }

  // Export Weak Students Excel
  function handleExportWeakStudents() {
    if (!activeClass || !activePeriod) return;

    const rows = filteredWeakStudents.map((st, idx) => {
      const info = studentInfoMap.get(st.studentId);
      const rem = reminders[st.studentId];
      const status = (rem?.status as ReminderStatus) || "pending";
      const statusText =
        status === "resolved"
          ? "Đã tiến bộ"
          : status === "parent_contacted"
          ? "Đã liên hệ PH"
          : status === "reminded"
          ? "Đã nhắc nhở"
          : "Chưa nhắc nhở";

      return {
        stt: idx + 1,
        studentCode: st.studentCode,
        fullName: st.studentName,
        className: activeClass.name || "",
        weakSubjectsText: st.weakSubjectNames.join(", "),
        parentPhone: info?.parentPhone,
        parentName: info?.parentName,
        statusText,
      };
    });

    exportHomeroomWeakStudentsExcel({
      className: activeClass.name || "Lop",
      periodName: activePeriod.name || "Dot_Diem",
      rows,
    });
    toast.success("Đã xuất danh sách học sinh cần nhắc nhở ra file Excel!");
  }

  // Export Matrix Excel
  function handleExportMatrix() {
    if (!activeClass || !activePeriod) return;

    const rows = matrixStudents.map((st, idx) => {
      const scores: Record<string, number | string> = {};
      matrixSubjectColumns.forEach((col) => {
        const val = st.subjectScores?.[col.id]?.score;
        scores[col.id] = val !== null && val !== undefined ? val : "";
      });

      return {
        stt: idx + 1,
        studentCode: st.studentCode,
        fullName: st.studentName,
        scores,
        averageScore: st.averageScore,
        weakCount: st.weakSubjectCount,
      };
    });

    exportClassGradeMatrixExcel({
      className: activeClass.name || "Lop",
      periodName: activePeriod.name || "Dot_Diem",
      subjects: matrixSubjectColumns,
      rows,
    });
    toast.success("Đã xuất sổ điểm tổng hợp cả lớp ra file Excel!");
  }

  // Helper render status badge
  function renderReminderStatusBadge(status?: string) {
    if (status === "resolved") return <Badge tone="success">Đã tiến bộ</Badge>;
    if (status === "parent_contacted") return <Badge tone="info">Đã liên hệ PH</Badge>;
    if (status === "reminded") return <Badge tone="warning">Đã nhắc nhở</Badge>;
    return <Badge tone="neutral">Chưa nhắc nhở</Badge>;
  }

  return (
    <Shell>
      <PageHeader
        title="Lớp Chủ Nhiệm — Điểm Số & Cảnh Báo Học Tập"
        description="Theo dõi điểm thi, nắm bắt danh sách các em học sinh có môn học dưới trung bình (< 5.0) để nhắc nhở và phối hợp với phụ huynh."
      />

      {/* Checking homeroom states */}
      {checkingHomeroom ? (
        <Card className="p-8 text-center space-y-3">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </Card>
      ) : homeroomClasses.length === 0 ? (
        <Card className="p-8 text-center border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <GraduationCap className="h-12 w-12 text-amber-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-foreground">Bạn chưa được phân công chủ nhiệm lớp nào</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Vui lòng liên hệ Ban Giám Hiệu hoặc Quản trị viên để được cập nhật thông tin phân công chủ nhiệm.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Top Selector Toolbar */}
          <Card className="p-4 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                {homeroomClasses.length > 1 && (
                  <div>
                    <Label htmlFor="classSelect" className="text-xs font-semibold">Lớp chủ nhiệm</Label>
                    <select
                      id="classSelect"
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-bold text-primary focus:border-primary focus:ring-1 focus:ring-primary"
                      value={activeClassId}
                      onChange={(e) => setActiveClassId(e.target.value)}
                    >
                      {homeroomClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          Lớp {c.name || c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <Label htmlFor="periodSelect" className="text-xs font-semibold">Đợt đánh giá / Điểm số</Label>
                  <select
                    id="periodSelect"
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeClass && (
                <div className="flex items-center gap-2">
                  <Badge tone="info" className="text-sm px-3 py-1">
                    Lớp {activeClass.name || activeClass.code}
                  </Badge>
                  <Badge tone="neutral" className="text-sm px-3 py-1">
                    Sĩ số: {stats.totalStudents} học sinh
                  </Badge>
                </div>
              )}
            </div>
          </Card>

          {/* Quick Warning Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="p-4 border-rose-200 bg-rose-50/40 dark:bg-rose-950/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                <p className="text-xs font-bold text-rose-700">Học sinh có môn yếu (&lt; 5.0)</p>
              </div>
              <p className="mt-2 text-3xl font-black text-rose-600">{stats.weakCount} em</p>
              <p className="text-xs text-rose-700/80 mt-1">Chiếm {stats.weakPercent}% sĩ số cả lớp</p>
            </Card>

            <Card className="p-4 border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-amber-600" />
                <p className="text-xs font-bold text-amber-700">Cần liên hệ nhắc nhở</p>
              </div>
              <p className="mt-2 text-3xl font-black text-amber-600">{stats.pendingCount} em</p>
              <p className="text-xs text-amber-700/80 mt-1">Chưa liên hệ phụ huynh</p>
            </Card>

            <Card className="p-4 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-xs font-bold text-emerald-700">Đã nhắc / Trao đổi PH</p>
              </div>
              <p className="mt-2 text-3xl font-black text-emerald-600">{stats.remindedCount} em</p>
              <p className="text-xs text-emerald-700/80 mt-1">Đã có ghi nhận theo dõi</p>
            </Card>

            <Card className="p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Môn học yếu nhiều nhất lớp:</p>
              {stats.topWeak.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {stats.topWeak.slice(0, 3).map((sub) => (
                    <Badge key={sub.name} tone="danger" className="text-xs">
                      {sub.name}: {sub.count} em
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-emerald-600 font-semibold mt-2">Lớp không có học sinh yếu môn!</p>
              )}
            </Card>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("warnings")}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
                activeTab === "warnings"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              Cảnh báo học sinh yếu ({weakStudents.length})
            </button>
            <button
              onClick={() => setActiveTab("matrix")}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
                activeTab === "matrix"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Sổ điểm tổng hợp cả lớp ({summaries.length})
            </button>
          </div>

          {/* TAB 1: WEAK STUDENTS & REMINDERS */}
          {activeTab === "warnings" && (
            <div className="space-y-4">
              {/* Search & Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9 h-10 text-xs"
                      placeholder="Tìm theo tên hoặc mã HS..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center rounded-xl border border-border bg-card p-1">
                    <button
                      onClick={() => setWarningFilter("all")}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        warningFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      }`}
                    >
                      Tất cả ({weakStudents.length})
                    </button>
                    <button
                      onClick={() => setWarningFilter("pending")}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        warningFilter === "pending" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      }`}
                    >
                      Chưa nhắc ({stats.pendingCount})
                    </button>
                    <button
                      onClick={() => setWarningFilter("handled")}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        warningFilter === "handled" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      }`}
                    >
                      Đã xử lý ({stats.remindedCount})
                    </button>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportWeakStudents}
                  disabled={filteredWeakStudents.length === 0}
                  className="gap-2 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Xuất danh sách nhắc nhở (.xlsx)
                </Button>
              </div>

              {/* Weak Students List Cards */}
              {filteredWeakStudents.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
                  title="Tuyệt vời! Không có học sinh nào bị điểm yếu"
                  description="Tất cả học sinh trong lớp đều đạt điểm trên trung bình (≥ 5.0) ở đợt đánh giá này."
                />
              ) : (
                <div className="grid gap-3">
                  {filteredWeakStudents.map((st) => {
                    const studentData = studentInfoMap.get(st.studentId);
                    const rem = reminders[st.studentId];
                    const phone = studentData?.parentPhone || "";
                    const parentName = studentData?.parentName || "Phụ huynh";

                    return (
                      <Card
                        key={st.studentId}
                        className="p-4 transition hover:border-primary/40 hover:shadow-soft"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700 font-bold dark:bg-rose-950 dark:text-rose-300">
                              !
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-foreground text-sm">{st.studentName}</h4>
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
                                  {st.studentCode}
                                </code>
                                {renderReminderStatusBadge(rem?.status)}
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground font-medium">Môn yếu:</span>
                                {st.weakSubjectNames.map((name, i) => (
                                  <Badge key={i} tone="danger" className="text-xs font-bold">
                                    {name}
                                  </Badge>
                                ))}
                              </div>

                              {phone && (
                                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>PH: {parentName}</span>
                                  <a
                                    href={`tel:${phone}`}
                                    className="flex items-center gap-1 font-semibold text-primary hover:underline"
                                  >
                                    <Phone className="h-3 w-3" />
                                    {phone}
                                  </a>
                                </div>
                              )}

                              {rem?.parentFeedback && (
                                <p className="mt-2 text-xs italic text-slate-600 dark:text-slate-400 bg-muted/60 p-2 rounded-lg">
                                  <strong>Phản hồi PH:</strong> {rem.parentFeedback}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant={rem?.status && rem.status !== "pending" ? "secondary" : "primary"}
                              size="sm"
                              onClick={() => handleOpenReminderModal(st)}
                              className="gap-1.5 text-xs"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              {rem ? "Xem & Sửa nhắc nhở" : "Nhắc nhở & Mẫu Zalo"}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLASS SCORE MATRIX */}
          {activeTab === "matrix" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9 h-10 text-xs"
                    placeholder="Tìm theo tên học sinh..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportMatrix}
                  disabled={matrixStudents.length === 0}
                  className="gap-2 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Xuất sổ điểm lớp (.xlsx)
                </Button>
              </div>

              <Card className="overflow-hidden">
                {matrixStudents.length === 0 ? (
                  <EmptyState
                    icon={<FileSpreadsheet className="h-8 w-8" />}
                    title="Chưa có dữ liệu điểm cho lớp"
                    description="Ban Giám Hiệu chưa tải bảng điểm đợt này lên cho lớp của bạn."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table min-w-[950px]">
                      <thead>
                        <tr>
                          <th className="w-12 text-center">STT</th>
                          <th className="w-24">Mã HS</th>
                          <th className="w-44">Họ và tên</th>
                          {matrixSubjectColumns.map((col) => (
                            <th key={col.id} className="text-center font-bold">
                              {col.name}
                            </th>
                          ))}
                          <th className="w-24 text-center">Điểm TB</th>
                          <th className="w-24 text-center">Môn yếu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrixStudents.map((st, idx) => (
                          <tr key={st.id}>
                            <td className="text-center font-medium text-muted-foreground">{idx + 1}</td>
                            <td>
                              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-bold">
                                {st.studentCode}
                              </code>
                            </td>
                            <td className="font-semibold text-foreground">{st.studentName}</td>
                            {matrixSubjectColumns.map((col) => {
                              const scoreObj = st.subjectScores?.[col.id];
                              const score = scoreObj?.score;
                              const isWeak = scoreObj?.isWeak;

                              return (
                                <td key={col.id} className="text-center">
                                  {score !== null && score !== undefined ? (
                                    <span
                                      className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                                        isWeak
                                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {score}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="text-center font-bold">
                              {st.averageScore !== null && st.averageScore !== undefined ? st.averageScore : "-"}
                            </td>
                            <td className="text-center">
                              {st.weakSubjectCount > 0 ? (
                                <Badge tone="danger">{st.weakSubjectCount} môn</Badge>
                              ) : (
                                <Badge tone="success">0</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* MODAL: REMINDER & ZALO MESSAGE */}
          {selectedStudentForReminder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <Card className="w-full max-w-lg p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Nhắc Nhở & Mẫu Tin Nhắn Phụ Huynh
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Học sinh: <strong>{selectedStudentForReminder.studentName}</strong> ({selectedStudentForReminder.studentCode})
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedStudentForReminder(null)}
                  >
                    ✕
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label htmlFor="zaloMsgInput" className="text-xs">
                        Nội dung tin nhắn mẫu (Gửi Zalo / SMS cho Phụ huynh)
                      </Label>
                      <button
                        type="button"
                        onClick={handleCopyZaloMessage}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <Copy className="h-3 w-3" />
                        Sao chép tin nhắn
                      </button>
                    </div>
                    <textarea
                      id="zaloMsgInput"
                      rows={6}
                      className="w-full rounded-xl border border-input bg-background p-3 text-xs leading-relaxed text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                      value={reminderContent}
                      onChange={(e) => setReminderContent(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="statusSelect" className="text-xs">
                      Trạng thái theo dõi nhắc nhở
                    </Label>
                    <select
                      id="statusSelect"
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold"
                      value={reminderStatus}
                      onChange={(e) => setReminderStatus(e.target.value as ReminderStatus)}
                    >
                      <option value="pending">Chưa nhắc nhở</option>
                      <option value="reminded">Đã nhắc nhở học sinh tại lớp</option>
                      <option value="parent_contacted">Đã liên hệ trao đổi với Phụ huynh</option>
                      <option value="resolved">Học sinh đã có tiến bộ</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="parentFeedbackInput" className="text-xs">
                      Ghi chú thêm / Phản hồi từ Phụ huynh
                    </Label>
                    <Input
                      id="parentFeedbackInput"
                      placeholder="VD: Phụ huynh hứa sẽ kiểm tra bài tập về nhà mỗi tối..."
                      value={parentFeedback}
                      onChange={(e) => setParentFeedback(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-border">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedStudentForReminder(null)}
                  >
                    Đóng
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveReminder}
                    loading={isSavingReminder}
                  >
                    Lưu trạng thái
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

export default function HomeroomGradesPage() {
  return (
    <RoleGuard allowedRoles={["giaovien", "totruong", "bgh", "admin"]}>
      <Suspense fallback={<div className="p-8 text-center"><Skeleton className="h-12 w-48 mx-auto" /></div>}>
        <HomeroomGradesContent />
      </Suspense>
    </RoleGuard>
  );
}
