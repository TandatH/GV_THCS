"use client";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Button, Card, Input, Label } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firebaseErrorMessage } from "@/lib/firebase/callables";
import { markOwnPasswordChanged } from "@/lib/firebase/password-callables";

export default function ChangePasswordPage() {
  const { claims, refreshClaims, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const usesPasswordProvider = useMemo(
    () => Boolean(user?.providerData.some((provider) => provider.providerId === "password")),
    [user],
  );
  const mustChangePassword = claims?.mustChangePassword === true;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user?.email) {
      setError("Tài khoản hiện tại không có email để xác thực lại.");
      return;
    }
    if (!usesPasswordProvider) {
      setError("Tài khoản này không đăng nhập bằng email/mật khẩu. Vui lòng dùng phương thức đăng nhập tương ứng.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Xác nhận mật khẩu mới chưa khớp.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }

    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      try {
        await markOwnPasswordChanged();
        await user.getIdToken(true);
        await refreshClaims();
      } catch (syncError) {
        console.error("Password changed but account flag sync failed", syncError);
        setError("Mật khẩu đã đổi thành công nhưng trạng thái tài khoản chưa đồng bộ. Vui lòng đăng xuất, đăng nhập lại hoặc liên hệ Quản trị viên để được hỗ trợ.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Đã đổi mật khẩu thành công. Vui lòng sử dụng mật khẩu mới cho các lần đăng nhập tiếp theo.");
      toast.success("Đã đổi mật khẩu thành công.");
    } catch (submitError) {
      const message = firebaseErrorMessage(submitError);
      if (message.includes("auth/wrong-password") || message.includes("invalid-credential")) {
        setError("Mật khẩu hiện tại không chính xác.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["giaovien", "bgh", "totruong", "admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Tài khoản"
          title="Đổi mật khẩu"
          description="Xác thực mật khẩu hiện tại và thiết lập mật khẩu mới để bảo mật tài khoản."
        />

        <div className="mx-auto max-w-2xl">
          {mustChangePassword ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Hệ thống vừa cấp lại mật khẩu tạm thời cho tài khoản này. Vui lòng đổi mật khẩu mới để tiếp tục sử dụng hệ thống.
            </div>
          ) : null}

          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold">Bảo mật tài khoản</h2>
                <p className="mt-1 text-sm text-muted-foreground">Mật khẩu mới tối thiểu 8 ký tự. Vui lòng bảo mật thông tin tài khoản.</p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              <div>
                <Label>Mật khẩu hiện tại</Label>
                <div className="relative">
                  <Input
                    autoComplete="current-password"
                    className="pr-11"
                    required
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                  <button type="button" onClick={() => setShowCurrent((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showCurrent ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label>Mật khẩu mới</Label>
                <div className="relative">
                  <Input
                    autoComplete="new-password"
                    className="pr-11"
                    minLength={8}
                    required
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <button type="button" onClick={() => setShowNew((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showNew ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label>Nhập lại mật khẩu mới</Label>
                <Input autoComplete="new-password" minLength={8} required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>

              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
              {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Hệ thống yêu cầu xác thực mật khẩu hiện tại để đảm bảo an toàn.</div>
                <Button loading={submitting} type="submit"><KeyRound className="h-4 w-4" />Đổi mật khẩu</Button>
              </div>
            </form>
          </Card>
        </div>
      </Shell>
    </RoleGuard>
  );
}
