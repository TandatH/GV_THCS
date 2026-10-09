"use client";

import { Save, Settings2, ShieldCheck, WalletCards } from "lucide-react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Button, Card, Input, Label, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";

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
      </Shell>
    </RoleGuard>
  );
}
