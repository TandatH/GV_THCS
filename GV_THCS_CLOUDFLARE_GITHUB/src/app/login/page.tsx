"use client";

import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Button, Input, Label } from "@/components/ui";
import { dashboardPathForRole } from "@/features/auth/auth-provider";
import { useAuth } from "@/features/auth/use-auth";
import { firebaseErrorMessage } from "@/lib/firebase/callables";

export default function LoginPage() {
  const router = useRouter();
  const { loading, role, user, signInWithEmail, signInWithGoogle, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user && role) router.replace(dashboardPathForRole(role));
  }, [loading, role, router, user]);

  async function submitEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setSuccess(false);
    try {
      await signInWithEmail(email, password);
    } catch (error) {
      setMessage(firebaseErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitGoogleLogin() {
    setSubmitting(true);
    setMessage("");
    setSuccess(false);
    try {
      await signInWithGoogle();
    } catch (error) {
      setMessage(firebaseErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setMessage("Vui lòng nhập email trước khi yêu cầu đặt lại mật khẩu.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      await sendPasswordReset(email);
      setSuccess(true);
      setMessage("Đã gửi email đặt lại mật khẩu nếu tài khoản tồn tại.");
    } catch (error) {
      setSuccess(false);
      setMessage(firebaseErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-3 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-7xl overflow-hidden rounded-[28px] bg-white shadow-2xl sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-700 via-slate-800 to-cyan-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl bg-white/12 px-4 py-3 backdrop-blur">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-md">
                <img src="/logo.png" alt="Logo" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="font-bold">GV Manager</p>
                <p className="text-xs text-blue-100">Quản lý giáo viên</p>
              </div>
            </div>
            <h1 className="mt-16 max-w-xl text-5xl font-extrabold leading-[1.12] tracking-tight">
              Không gian làm việc thống nhất cho nhà trường.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-blue-100">
              Quản lý hồ sơ, thời khóa biểu, đơn nghỉ phép, đánh giá chuyên môn, chấm công và thù lao trong một nền tảng đồng bộ và bảo mật.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Phân quyền chặt chẽ theo vai trò",
              "Bảo mật và an toàn dữ liệu",
              "Tự động hóa xếp lịch thông minh",
              "Tương thích đa nền tảng thiết bị",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-3 text-sm backdrop-blur">
                <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-200" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center bg-background px-5 py-10 sm:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="inline-flex items-center gap-3">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm border border-slate-200">
                  <img src="/logo.png" alt="Logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <span className="text-lg font-bold text-slate-900 block leading-tight">GV Manager</span>
                  <span className="text-xs text-muted-foreground block">Quản lý giáo viên</span>
                </div>
              </div>
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">Chào mừng trở lại</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Đăng nhập hệ thống</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Sử dụng tài khoản đã được nhà trường cấp quyền.
            </p>

            <form className="mt-8 space-y-5" onSubmit={submitEmailLogin}>
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" className="pl-10" autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="admin@truong.edu.vn" required type="email" value={email} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mật khẩu</Label>
                  <button className="mb-1.5 text-xs font-semibold text-primary hover:underline" disabled={submitting} onClick={resetPassword} type="button">
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" className="px-10" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword((value) => !value)} type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {message ? (
                <div className={`rounded-xl border px-4 py-3 text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                  {message}
                </div>
              ) : null}

              <Button className="w-full" size="lg" loading={submitting} type="submit">
                Đăng nhập
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              hoặc
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button className="w-full" size="lg" variant="secondary" loading={submitting} onClick={submitGoogleLogin} type="button">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-extrabold text-blue-600 shadow-sm">G</span>
              Tiếp tục với Google
            </Button>

            <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
              Khi đăng nhập, bạn đồng ý tuân thủ quy định bảo mật và sử dụng dữ liệu của nhà trường.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
