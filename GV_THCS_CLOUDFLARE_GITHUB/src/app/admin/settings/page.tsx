"use client";

import { Lock, Save, Settings2, ShieldCheck, Sliders, Unlock, WalletCards } from "lucide-react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, Input, Label, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import {
  useFeatureLocks,
  FEATURE_DEFINITIONS,
  FEATURE_CATEGORIES,
  type FeatureKey,
  type FeatureCategory,
} from "@/lib/feature-locks";

type SettingsForm = {
  schoolName: string;
  enforceHardLimit: boolean;
  defaultTravelSlots: string;
  defaultTeachingWeeks: string;
  primaryDefaultRate: string;
  secondaryDefaultRate: string;
};

const initialForm: SettingsForm = {
  schoolName: "Trường THCS",
  enforceHardLimit: false,
  defaultTravelSlots: "1",
  defaultTeachingWeeks: "4",
  primaryDefaultRate: "120000",
  secondaryDefaultRate: "150000",
};

function FeatureLocksManager() {
  const { isLocked, toggleLock, setBatchLocks, loading } = useFeatureLocks();
  const [updating, setUpdating] = useState(false);

  const categories: FeatureCategory[] = ["chu_nhiem", "thi_dua", "chuyen_mon"];
  const allKeys = FEATURE_DEFINITIONS.map((f) => f.key);
  const lockedCount = allKeys.filter((k) => isLocked(k)).length;

  const handleUnlockAll = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn MỞ KHÓA TẤT CẢ các chức năng cho Giáo viên không?")) return;
    setUpdating(true);
    await setBatchLocks(allKeys, false);
    setUpdating(false);
  };

  const handleLockAll = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn TẠM KHÓA TẤT CẢ các chức năng đối với Giáo viên không?")) return;
    setUpdating(true);
    await setBatchLocks(allKeys, true);
    setUpdating(false);
  };

  return (
    <Card className="p-5 mt-6 border-slate-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
        <div className="flex gap-3 items-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-700">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base">Quản lý Khóa / Mở từng mục cho Giáo viên</h2>
              <Badge tone={lockedCount > 0 ? "warning" : "success"}>
                {lockedCount > 0 ? `Đang khóa ${lockedCount}/${allKeys.length} mục` : "Tất cả đang mở"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Chủ động bật/tắt quyền truy cập từng chức năng đối với tài khoản Giáo viên. Khi nào Admin muốn mở thì mở, chưa cần thì khóa lại. Admin/BGH luôn có toàn quyền truy cập.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            disabled={updating || loading}
            onClick={handleUnlockAll}
          >
            <Unlock className="h-3.5 w-3.5" />
            Mở tất cả
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="text-xs gap-1 border-rose-300 text-rose-700 hover:bg-rose-50"
            disabled={updating || loading}
            onClick={handleLockAll}
          >
            <Lock className="h-3.5 w-3.5" />
            Khóa tất cả
          </Button>
        </div>
      </div>

      <div className="space-y-6 pt-5">
        {categories.map((catKey) => {
          const cat = FEATURE_CATEGORIES[catKey];
          const items = FEATURE_DEFINITIONS.filter((f) => f.category === catKey);

          return (
            <div key={catKey} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
                    {cat.label}
                  </h3>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBatchLocks(items.map((i) => i.key), false)}
                    className="text-[11px] text-emerald-600 hover:underline font-semibold"
                  >
                    Mở nhóm
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setBatchLocks(items.map((i) => i.key), true)}
                    className="text-[11px] text-rose-600 hover:underline font-semibold"
                  >
                    Khóa nhóm
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => {
                  const locked = isLocked(item.key);

                  return (
                    <div
                      key={item.key}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                        locked
                          ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 dark:bg-slate-900"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={item.path}
                            className="font-bold text-xs text-foreground hover:text-primary transition line-clamp-1"
                            title={`Mở trang: ${item.path}`}
                          >
                            {item.label}
                          </Link>
                          {locked ? (
                            <Badge tone="danger" className="text-[10px] px-2 py-0.5 gap-1 shrink-0">
                              <Lock className="h-2.5 w-2.5" /> Đang khóa
                            </Badge>
                          ) : (
                            <Badge tone="success" className="text-[10px] px-2 py-0.5 gap-1 shrink-0">
                              <Unlock className="h-2.5 w-2.5" /> Đang mở
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
                          {item.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400 truncate font-mono">
                          {item.path}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          className={`h-7 px-2.5 text-xs font-semibold gap-1 ${
                            locked
                              ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              : "border-rose-300 text-rose-700 hover:bg-rose-50"
                          }`}
                          onClick={() => toggleLock(item.key)}
                        >
                          {locked ? (
                            <>
                              <Unlock className="h-3 w-3" /> Mở khóa
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3" /> Khóa lại
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      getDoc(doc(firestore, "systemSettings", "app")),
      getDoc(doc(firestore, "systemSettings", "workload")),
      getDoc(doc(firestore, "systemSettings", "travel")),
      getDoc(doc(firestore, "systemSettings", "payroll")),
    ]).then(([app, workload, travel, payroll]) => {
      if (!active) return;
      setForm({
        schoolName: String(app.data()?.schoolName || initialForm.schoolName),
        enforceHardLimit: workload.data()?.enforceHardLimit === true,
        defaultTravelSlots: String(travel.data()?.defaultTravelSlots ?? initialForm.defaultTravelSlots),
        defaultTeachingWeeks: String(payroll.data()?.defaultTeachingWeeks ?? initialForm.defaultTeachingWeeks),
        primaryDefaultRate: String(payroll.data()?.primaryDefaultRate ?? initialForm.primaryDefaultRate),
        secondaryDefaultRate: String(payroll.data()?.secondaryDefaultRate ?? initialForm.secondaryDefaultRate),
      });
    }).catch((loadError) => {
      if (active) setError(firebaseDataErrorMessage(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError("");
    try {
      const travelSlots = Number(form.defaultTravelSlots);
      const teachingWeeks = Number(form.defaultTeachingWeeks);
      const primaryRate = Number(form.primaryDefaultRate || 120000);
      const secondaryRate = Number(form.secondaryDefaultRate || 150000);

      if (!Number.isInteger(travelSlots) || travelSlots < 0 || travelSlots > 10) {
        throw new Error("Số tiết di chuyển mặc định phải từ 0 đến 10.");
      }
      if (!Number.isFinite(teachingWeeks) || teachingWeeks < 0 || teachingWeeks > 6) {
        throw new Error("Số tuần giảng dạy mặc định phải từ 0 đến 6.");
      }
      const audit = { updatedAt: serverTimestamp(), updatedBy: user.uid, isActive: true };
      await Promise.all([
        setDoc(doc(firestore, "systemSettings", "app"), {
          schoolName: form.schoolName.trim(),
          timezone: "Asia/Ho_Chi_Minh",
          ...audit,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        }, { merge: true }),
        setDoc(doc(firestore, "systemSettings", "workload"), {
          enforceHardLimit: form.enforceHardLimit,
          ...audit,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        }, { merge: true }),
        setDoc(doc(firestore, "systemSettings", "travel"), {
          defaultTravelSlots: travelSlots,
          ...audit,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        }, { merge: true }),
        setDoc(doc(firestore, "systemSettings", "payroll"), {
          defaultTeachingWeeks: teachingWeeks,
          primaryDefaultRate: primaryRate,
          secondaryDefaultRate: secondaryRate,
          ...audit,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        }, { merge: true }),
      ]);
      toast.success("Đã lưu cấu hình vận hành.");
    } catch (saveError) {
      setError(firebaseDataErrorMessage(saveError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Cấu hình vận hành"
          title="Cài đặt hệ thống"
          description="Thiết lập các quy tắc vận hành về định mức giảng dạy, di chuyển giữa cơ sở và tổng hợp chuyên môn."
        />

        {error ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        {loading ? <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div> : (
          <form className="space-y-5" onSubmit={save}>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <div className="mb-5 flex gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Settings2 className="h-5 w-5" /></div><div><h2 className="font-bold">Thông tin chung</h2><p className="mt-1 text-sm text-muted-foreground">Múi giờ hệ thống được thiết lập theo giờ Việt Nam (GMT+7).</p></div></div>
                <Label>Tên trường</Label>
                <Input required value={form.schoolName} onChange={(event) => setForm((current) => ({ ...current, schoolName: event.target.value }))} />
                <div className="mt-4"><Label>Múi giờ</Label><Input disabled value="Asia/Ho_Chi_Minh" /></div>
              </Card>

              <Card className="p-5">
                <div className="mb-5 flex gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-bold">Xếp thời khóa biểu</h2><p className="mt-1 text-sm text-muted-foreground">Cảnh báo vượt định mức luôn được ghi; lựa chọn dưới đây quyết định có chặn lưu hay không.</p></div></div>
                <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm"><input className="mt-1" type="checkbox" checked={form.enforceHardLimit} onChange={(event) => setForm((current) => ({ ...current, enforceHardLimit: event.target.checked }))} /><span><strong>Chặn lịch vượt định mức tuần</strong><span className="mt-1 block text-muted-foreground">Nên để tắt khi mới triển khai; hệ thống vẫn đánh dấu cảnh báo để BGH xem xét.</span></span></label>
                <div className="mt-4"><Label>Số tiết cần để di chuyển giữa hai cơ sở</Label><Input min="0" max="10" type="number" value={form.defaultTravelSlots} onChange={(event) => setForm((current) => ({ ...current, defaultTravelSlots: event.target.value }))} /><p className="mt-1 text-xs text-muted-foreground">Đặt 0 nếu trường chỉ có một cơ sở.</p></div>
              </Card>

              <Card className="p-5 lg:col-span-2">
                <div className="mb-5 flex gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><WalletCards className="h-5 w-5" /></div><div><h2 className="font-bold">Tổng hợp tiết dạy và thù lao</h2><p className="mt-1 text-sm text-muted-foreground">Giá trị mặc định chỉ dùng khi tháng chưa được cấu hình riêng trong lịch năm học.</p></div></div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>Số tuần giảng dạy mặc định/tháng</Label>
                    <Input min="0" max="6" step="0.1" type="number" value={form.defaultTeachingWeeks} onChange={(event) => setForm((current) => ({ ...current, defaultTeachingWeeks: event.target.value }))} />
                    <p className="mt-1 text-xs text-amber-700">Trước khi khóa kỳ thù lao, cần đối chiếu số tuần thực tế.</p>
                  </div>
                  <div>
                    <Label>Đơn giá Cấp 1 mặc định (VND/tiết)</Label>
                    <Input min="0" step="10000" type="number" value={form.primaryDefaultRate} onChange={(event) => setForm((current) => ({ ...current, primaryDefaultRate: event.target.value }))} placeholder="120000" />
                    <p className="mt-1 text-xs text-muted-foreground">Áp dụng cho tiết Tiểu học khi chưa có đơn giá riêng.</p>
                  </div>
                  <div>
                    <Label>Đơn giá Cấp 2 mặc định (VND/tiết)</Label>
                    <Input min="0" step="10000" type="number" value={form.secondaryDefaultRate} onChange={(event) => setForm((current) => ({ ...current, secondaryDefaultRate: event.target.value }))} placeholder="150000" />
                    <p className="mt-1 text-xs text-muted-foreground">Áp dụng cho tiết THCS khi chưa có đơn giá riêng.</p>
                  </div>
                </div>
              </Card>
            </div>
            <div className="flex justify-end"><Button loading={submitting} type="submit"><Save className="h-4 w-4" />Lưu cấu hình</Button></div>
          </form>
        )}

        <FeatureLocksManager />
      </Shell>
    </RoleGuard>
  );
}
