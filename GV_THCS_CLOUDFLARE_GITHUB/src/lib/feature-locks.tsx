"use client";

import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Lock, Unlock, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge, Button, Card } from "@/components/ui";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";

export type FeatureKey =
  | "homeroom_discipline"
  | "homeroom_grades"
  | "homeroom_activity_book"
  | "competition_leaderboard"
  | "discipline_record"
  | "competition_review"
  | "competition_weekly_finalize"
  | "teacher_schedule"
  | "teacher_availability"
  | "teacher_leave_requests"
  | "teacher_exam_duty"
  | "teacher_attendance"
  | "teacher_payroll"
  | "teacher_evaluations";

export type FeatureCategory = "chu_nhiem" | "thi_dua" | "chuyen_mon";

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
  path: string;
  category: FeatureCategory;
}

export const FEATURE_CATEGORIES: Record<FeatureCategory, { label: string; description: string }> = {
  chu_nhiem: {
    label: "Lớp Chủ Nhiệm",
    description: "Các chức năng quản lý nề nếp thi đua và sổ điểm của giáo viên chủ nhiệm.",
  },
  thi_dua: {
    label: "Ban Thi Đua & Kỷ Luật",
    description: "Ghi nhận vi phạm, duyệt điểm, xếp hạng và ký sổ thi đua tuần.",
  },
  chuyen_mon: {
    label: "Chuyên Môn & Giảng Dạy",
    description: "Thời khóa biểu, đăng ký giờ trống, nghỉ phép, coi thi, chấm công và thù lao.",
  },
};

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  // Lớp chủ nhiệm
  {
    key: "homeroom_discipline",
    label: "Lớp chủ nhiệm — Nề nếp thi đua",
    description: "GVCN theo dõi điểm thi đua, học sinh vi phạm của lớp và gửi khiếu nại.",
    path: "/teacher/homeroom/discipline",
    category: "chu_nhiem",
  },
  {
    key: "homeroom_grades",
    label: "Lớp chủ nhiệm — Sổ điểm & Cảnh báo",
    description: "GVCN xem ma trận điểm, cảnh báo học sinh yếu và gửi nhắc nhở phụ huynh.",
    path: "/teacher/homeroom/grades",
    category: "chu_nhiem",
  },
  {
    key: "homeroom_activity_book",
    label: "Sổ Sinh Hoạt GVCN (Báo cáo tuần)",
    description: "GVCN điền form hoặc chụp ảnh sổ sinh hoạt hàng tuần gửi Hiệu trưởng/BGH xem và nhận xét.",
    path: "/teacher/homeroom/activity-book",
    category: "chu_nhiem",
  },

  // Ban thi đua
  {
    key: "competition_leaderboard",
    label: "Bảng xếp hạng thi đua",
    description: "Bảng xếp hạng tuần giữa các lớp học trong toàn trường và theo khối.",
    path: "/competition/leaderboard",
    category: "thi_dua",
  },
  {
    key: "discipline_record",
    label: "Ghi nhận vi phạm nề nếp",
    description: "Ghi nhận vi phạm của học sinh hoặc tập thể lớp (Sao Đỏ, Giám thị, GV).",
    path: "/discipline/record",
    category: "thi_dua",
  },
  {
    key: "competition_review",
    label: "Duyệt vi phạm thi đua",
    description: "Ban Thi Đua rà soát, duyệt hoặc từ chối các phiếu vi phạm nề nếp.",
    path: "/competition/review",
    category: "thi_dua",
  },
  {
    key: "competition_weekly_finalize",
    label: "Tổng kết & Ký điểm tuần",
    description: "Tổng hợp điểm tuần, ký xác nhận số và xuất biên bản thi đua.",
    path: "/competition/weekly-finalize",
    category: "thi_dua",
  },

  // Chuyên môn
  {
    key: "teacher_schedule",
    label: "Thời khóa biểu & Lịch dạy",
    description: "Xem thời khóa biểu cá nhân và xác nhận phân công giảng dạy.",
    path: "/teacher/schedule",
    category: "chuyen_mon",
  },
  {
    key: "teacher_availability",
    label: "Đăng ký giờ trống",
    description: "Đăng ký nguyện vọng khung giờ dạy trống trong học kỳ trước hạn chót.",
    path: "/teacher/availability",
    category: "chuyen_mon",
  },
  {
    key: "teacher_leave_requests",
    label: "Đơn xin nghỉ phép",
    description: "Tạo đơn xin nghỉ phép, chọn tiết ảnh hưởng và tải minh chứng.",
    path: "/teacher/leave-requests",
    category: "chuyen_mon",
  },
  {
    key: "teacher_exam_duty",
    label: "Lịch coi thi & Đổi ca",
    description: "Xem phân công coi thi, phòng thi, bạn coi thi và đề xuất đổi ca.",
    path: "/teacher/exam-duty",
    category: "chuyen_mon",
  },
  {
    key: "teacher_attendance",
    label: "Chấm công & Giờ dạy",
    description: "Đối soát số tiết dạy thực tế, dạy thay và nghỉ phép hàng tháng.",
    path: "/teacher/attendance",
    category: "chuyen_mon",
  },
  {
    key: "teacher_payroll",
    label: "Bảng thù lao & Lương",
    description: "Theo dõi bảng tính thù lao giảng dạy và trạng thái thanh toán.",
    path: "/teacher/payroll",
    category: "chuyen_mon",
  },
  {
    key: "teacher_evaluations",
    label: "Kết quả đánh giá chuyên môn",
    description: "Xem kết quả đánh giá chuyên môn giáo viên đã được công bố.",
    path: "/teacher/evaluations",
    category: "chuyen_mon",
  },
];

interface FeatureLocksContextValue {
  locks: Record<string, boolean>;
  loading: boolean;
  isLocked: (key: FeatureKey) => boolean;
  toggleLock: (key: FeatureKey, nextState?: boolean) => Promise<void>;
  setBatchLocks: (keys: FeatureKey[], locked: boolean) => Promise<void>;
}

const FeatureLocksContext = createContext<FeatureLocksContextValue>({
  locks: {},
  loading: true,
  isLocked: () => false,
  toggleLock: async () => {},
  setBatchLocks: async () => {},
});

export function FeatureLocksProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [locks, setLocks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(firestore, "publicSettings", "featureLocks"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const parsed: Record<string, boolean> = {};
          if (data && typeof data === "object") {
            Object.entries(data).forEach(([k, v]) => {
              if (typeof v === "boolean") parsed[k] = v;
            });
          }
          setLocks(parsed);
        } else {
          setLocks({});
        }
        setLoading(false);
      },
      (err) => {
        console.error("Lỗi lắng nghe featureLocks:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const isLocked = useMemo(() => {
    return (key: FeatureKey): boolean => Boolean(locks[key]);
  }, [locks]);

  const toggleLock = async (key: FeatureKey, nextState?: boolean) => {
    if (role !== "admin" && role !== "bgh") {
      toast.error("Chỉ Quản trị viên hoặc BGH mới có quyền khóa/mở chức năng!");
      return;
    }
    const current = Boolean(locks[key]);
    const target = typeof nextState === "boolean" ? nextState : !current;

    const featureDef = FEATURE_DEFINITIONS.find((f) => f.key === key);
    const label = featureDef?.label || key;

    try {
      await setDoc(
        doc(firestore, "publicSettings", "featureLocks"),
        {
          [key]: target,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "",
        },
        { merge: true }
      );
      toast.success(target ? `Đã KHÓA mục "${label}".` : `Đã MỞ KHÓA mục "${label}".`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể cập nhật khóa: ${msg}`);
    }
  };

  const setBatchLocks = async (keys: FeatureKey[], locked: boolean) => {
    if (role !== "admin" && role !== "bgh") {
      toast.error("Chỉ Quản trị viên hoặc BGH mới có quyền khóa/mở chức năng!");
      return;
    }
    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid || "",
    };
    keys.forEach((k) => {
      updates[k] = locked;
    });

    try {
      await setDoc(doc(firestore, "publicSettings", "featureLocks"), updates, { merge: true });
      toast.success(locked ? `Đã khóa ${keys.length} mục đã chọn.` : `Đã mở khóa ${keys.length} mục đã chọn.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi cập nhật: ${msg}`);
    }
  };

  return (
    <FeatureLocksContext.Provider value={{ locks, loading, isLocked, toggleLock, setBatchLocks }}>
      {children}
    </FeatureLocksContext.Provider>
  );
}

export function useFeatureLocks() {
  return useContext(FeatureLocksContext);
}

/**
 * Component bọc quanh nội dung trang:
 * - Nếu bị khóa và là Giáo viên: Hiển thị thông báo đã bị khóa, chặn thao tác.
 * - Nếu bị khóa nhưng là Admin/BGH: Hiển thị cảnh báo đang khóa kèm nút mở nhanh, nhưng vẫn cho phép Admin xem và quản trị.
 */
export function FeatureLockGuard({
  featureKey,
  children,
}: {
  featureKey: FeatureKey;
  children: ReactNode;
}) {
  const router = useRouter();
  const { role } = useAuth();
  const { isLocked, toggleLock, loading } = useFeatureLocks();

  const locked = isLocked(featureKey);
  const isAdminOrBgh = role === "admin" || role === "bgh";
  const def = FEATURE_DEFINITIONS.find((f) => f.key === featureKey);
  const label = def?.label || "Chức năng";

  if (loading) {
    return <>{children}</>;
  }

  // Nếu bị khóa và người dùng không phải Admin/BGH
  if (locked && !isAdminOrBgh) {
    return (
      <Card className="p-8 text-center max-w-lg mx-auto my-12 border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 mb-4">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Chức năng đang tạm khóa</h2>
        <Badge tone="warning" className="mt-2 inline-flex items-center gap-1">
          🔒 {label}
        </Badge>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          Mục này hiện đang được Quản trị viên tạm khóa để tiến hành rà soát hoặc điều chỉnh dữ liệu. Khi nhà trường mở lại, bạn sẽ có thể tiếp tục truy cập bình thường.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="secondary" onClick={() => router.push("/teacher/dashboard")}>
            Về trang tổng quan
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      {locked && isAdminOrBgh && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3.5 flex flex-wrap items-center justify-between gap-3 text-amber-900 dark:text-amber-200 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Mục <strong>{label}</strong> hiện đang <strong>TẠM KHÓA</strong> đối với Giáo viên. (Admin/BGH vẫn có quyền xem & thao tác)</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5 h-8 text-xs border-amber-300 hover:bg-amber-100"
            onClick={() => toggleLock(featureKey, false)}
          >
            <Unlock className="h-3.5 w-3.5 text-emerald-600" />
            Mở khóa mục này ngay
          </Button>
        </div>
      )}
      {children}
    </>
  );
}

/**
 * Nút bật/tắt khóa trực tiếp trên thanh công cụ của trang dành cho Admin/BGH
 */
export function AdminFeatureLockButton({ featureKey }: { featureKey: FeatureKey }) {
  const { role } = useAuth();
  const { isLocked, toggleLock } = useFeatureLocks();

  if (role !== "admin" && role !== "bgh") return null;

  const locked = isLocked(featureKey);

  return (
    <Button
      size="sm"
      variant={locked ? "secondary" : "ghost"}
      onClick={() => toggleLock(featureKey)}
      className={`gap-1.5 text-xs h-8 ${
        locked
          ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40"
          : "text-muted-foreground hover:text-foreground"
      }`}
      title={locked ? "Nhấp để mở khóa chức năng này cho giáo viên" : "Nhấp để tạm khóa chức năng này đối với giáo viên"}
    >
      {locked ? (
        <>
          <Lock className="h-3.5 w-3.5 text-amber-600" />
          <span>Đang khóa (Mở)</span>
        </>
      ) : (
        <>
          <Unlock className="h-3.5 w-3.5 text-slate-400" />
          <span>Khóa mục này</span>
        </>
      )}
    </Button>
  );
}
