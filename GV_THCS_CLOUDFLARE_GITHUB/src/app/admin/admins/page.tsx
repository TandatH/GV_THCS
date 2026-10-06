"use client";

import {
  CirclePlus,
  Copy,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UnlockKeyhole,
  UserRoundCog,
} from "lucide-react";
import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import {
  createAdminAccount,
  deleteAdminAccount,
  resetAdminPassword,
  setAdminAccountStatus,
} from "@/lib/firebase/admin-account-callables";
import { firebaseErrorMessage } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { formatDate, initials } from "@/lib/utils";

type AdminRow = DocumentData & { id: string };

type Credential = {
  fullName: string;
  email: string;
  temporaryPassword: string;
  title: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isAdminActive(row: AdminRow) {
  return row.isActive !== false && row.status !== "locked" && row.status !== "inactive";
}

function generateTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%";
  const all = `${upper}${lower}${digits}${symbols}`;
  const pick = (source: string) => source[crypto.getRandomValues(new Uint32Array(1))[0] % source.length];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 12) chars.push(pick(all));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
}

export default function AdminAccountsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyUid, setBusyUid] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [credential, setCredential] = useState<Credential | null>(null);
  const [changePasswordTarget, setChangePasswordTarget] = useState<AdminRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    const unsubscribe = onSnapshot(
      query(collection(firestore, "users"), where("role", "==", "admin")),
      (snapshot) => {
        const next = snapshot.docs
          .map((document): AdminRow => ({ id: document.id, ...document.data() } as AdminRow))
          .sort((a, b) => (text(a.displayName || a.fullName || a.email)).localeCompare(text(b.displayName || b.fullName || b.email), "vi"));
        setRows(next);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoadError("Không thể tải danh sách quản trị viên.");
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    if (!keyword) return rows;
    return rows.filter((row) => {
      const haystack = `${text(row.displayName)} ${text(row.fullName)} ${text(row.email)} ${row.id}`.toLocaleLowerCase("vi");
      return haystack.includes(keyword);
    });
  }, [rows, search]);

  const activeAdminCount = rows.filter(isAdminActive).length;

  function openCreate() {
    setFullName("");
    setEmail("");
    setPassword(generateTemporaryPassword());
    setCreateOpen(true);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Đã sao chép.");
    } catch {
      toast.error("Không thể sao chép tự động. Vui lòng sao chép thủ công.");
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error("Vui lòng nhập họ tên và email.");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }

    setSaving(true);
    try {
      const result = await createAdminAccount({
        fullName: fullName.trim(),
        email: email.trim(),
        ...(password ? { password } : {}),
      });
      setCreateOpen(false);
      setCredential({
        title: "Tài khoản Admin đã được tạo",
        fullName: result.fullName,
        email: result.email,
        temporaryPassword: result.temporaryPassword,
      });
      toast.success("Đã tạo quản trị viên mới.");
    } catch (error) {
      toast.error(firebaseErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function openChangePassword(row: AdminRow) {
    setChangePasswordTarget(row);
    const generated = generateTemporaryPassword();
    setNewPassword(generated);
    setConfirmPassword(generated);
  }

  async function submitChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!changePasswordTarget) return;
    if (newPassword.length < 8) {
      toast.error("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Hai lần nhập mật khẩu chưa khớp.");
      return;
    }

    const name = text(changePasswordTarget.displayName || changePasswordTarget.fullName || changePasswordTarget.email) || "quản trị viên";
    setBusyUid(changePasswordTarget.id);
    try {
      const result = await resetAdminPassword(changePasswordTarget.id, newPassword);
      setChangePasswordTarget(null);
      setCredential({
        title: "Đã đổi mật khẩu Admin",
        fullName: name,
        email: text(changePasswordTarget.email),
        temporaryPassword: result.temporaryPassword,
      });
      toast.success("Đã đổi mật khẩu quản trị viên.");
    } catch (error) {
      toast.error(firebaseErrorMessage(error));
    } finally {
      setBusyUid("");
    }
  }

  async function handleReset(row: AdminRow) {
    const name = text(row.displayName || row.fullName || row.email) || "quản trị viên";
    if (!window.confirm(`Reset mật khẩu của ${name}? Mật khẩu cũ sẽ không còn sử dụng được.`)) return;

    setBusyUid(row.id);
    try {
      const result = await resetAdminPassword(row.id);
      setCredential({
        title: "Đã reset mật khẩu Admin",
        fullName: name,
        email: text(row.email),
        temporaryPassword: result.temporaryPassword,
      });
      toast.success("Đã reset mật khẩu.");
    } catch (error) {
      toast.error(firebaseErrorMessage(error));
    } finally {
      setBusyUid("");
    }
  }

  async function handleStatus(row: AdminRow) {
    const active = isAdminActive(row);
    const nextEnabled = !active;
    const name = text(row.displayName || row.fullName || row.email) || "quản trị viên";
    const message = nextEnabled
      ? `Mở khóa tài khoản ${name}?`
      : `Khóa tài khoản ${name}? Người này sẽ không thể đăng nhập lại.`;
    if (!window.confirm(message)) return;

    setBusyUid(row.id);
    try {
      await setAdminAccountStatus(row.id, nextEnabled);
      toast.success(nextEnabled ? "Đã mở khóa quản trị viên." : "Đã khóa quản trị viên.");
    } catch (error) {
      toast.error(firebaseErrorMessage(error));
    } finally {
      setBusyUid("");
    }
  }

  async function handleDelete(row: AdminRow) {
    const name = text(row.displayName || row.fullName || row.email) || "quản trị viên";
    const confirmation = window.prompt(
      `Xóa vĩnh viễn tài khoản ${name}?\nNhập chính xác XOA ADMIN để xác nhận.`,
      "",
    );
    if (confirmation !== "XOA ADMIN") return;

    setBusyUid(row.id);
    try {
      await deleteAdminAccount(row.id);
      toast.success("Đã xóa quản trị viên.");
    } catch (error) {
      toast.error(firebaseErrorMessage(error));
    } finally {
      setBusyUid("");
    }
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Quản trị hệ thống"
          title="Quản lý quản trị viên"
          description="Tạo và quản lý các tài khoản Admin. Hệ thống luôn bảo vệ để còn ít nhất một quản trị viên hoạt động."
          actions={
            <Button onClick={openCreate}>
              <CirclePlus className="h-4 w-4" />
              Thêm Admin
            </Button>
          }
        />

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Tổng Admin</p>
            <p className="mt-1 text-3xl font-bold">{rows.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Đang hoạt động</p>
            <p className="mt-1 text-3xl font-bold text-emerald-600">{activeAdminCount}</p>
          </Card>
          <Card className="border-amber-200 bg-amber-50/60 p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold text-amber-900">Bảo vệ quản trị viên</p>
                <p className="mt-1 text-sm leading-5 text-amber-800">Hệ thống luôn duy trì tối thiểu một tài khoản quản trị viên hoạt động.</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên hoặc email..." className="pl-9" />
            </div>
            <p className="text-sm text-muted-foreground">{filteredRows.length} tài khoản</p>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : loadError ? (
            <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Không tải được dữ liệu" description={loadError} />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              icon={<UserRoundCog className="h-6 w-6" />}
              title="Chưa có quản trị viên phù hợp"
              description={search ? "Không có tài khoản nào khớp từ khóa tìm kiếm." : "Hãy tạo thêm quản trị viên để có tài khoản dự phòng."}
              action={!search ? <Button onClick={openCreate}><CirclePlus className="h-4 w-4" />Thêm quản trị viên</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Quản trị viên</th>
                    <th className="px-5 py-3">Trạng thái</th>
                    <th className="px-5 py-3">Ngày tạo</th>
                    <th className="px-5 py-3">Đổi MK gần nhất</th>
                    <th className="px-5 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map((row) => {
                    const active = isAdminActive(row);
                    const current = row.id === user?.uid;
                    const name = text(row.displayName || row.fullName) || text(row.email) || row.id;
                    const busy = busyUid === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-muted/30">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 font-bold text-blue-700">
                              {initials(name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-semibold">{name}</p>
                                {current ? <Badge tone="info">Bạn</Badge> : null}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{text(row.email) || "—"}</p>
                              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">UID: {row.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge tone={active ? "success" : "danger"}>{active ? "Đang hoạt động" : "Đã khóa"}</Badge>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{formatDate(row.createdAt)}</td>
                        <td className="px-5 py-4 text-muted-foreground">{formatDate(row.passwordResetAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => openChangePassword(row)}>
                              <KeyRound className="h-4 w-4" /> Đổi MK
                            </Button>
                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void handleReset(row)}>
                              <RefreshCw className="h-4 w-4" /> Cấp lại MK
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy || current}
                              title={current ? "Không thể tự khóa tài khoản đang đăng nhập" : undefined}
                              onClick={() => void handleStatus(row)}
                            >
                              {active ? <LockKeyhole className="h-4 w-4" /> : <UnlockKeyhole className="h-4 w-4" />}
                              {active ? "Khóa" : "Mở"}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy || current}
                              title={current ? "Không thể tự xóa tài khoản đang đăng nhập" : undefined}
                              onClick={() => void handleDelete(row)}
                            >
                              <Trash2 className="h-4 w-4" /> Xóa
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Thêm quản trị viên"
          description="Khởi tạo tài khoản quản trị viên mới với đầy đủ quyền quản lý hệ thống."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Hủy</Button>
              <Button form="create-admin-form" type="submit" loading={saving}>Lưu tài khoản</Button>
            </div>
          }
        >
          <form id="create-admin-form" onSubmit={submitCreate} className="space-y-4">
            <div>
              <Label htmlFor="admin-name">Họ và tên</Label>
              <Input id="admin-name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyễn Văn A" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="admin-email">Email đăng nhập</Label>
              <Input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin2@truong.edu.vn" autoComplete="off" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label htmlFor="admin-password">Mật khẩu ban đầu</Label>
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => setPassword(generateTemporaryPassword())}>
                  <RefreshCw className="h-3.5 w-3.5" /> Tạo mật khẩu khác
                </button>
              </div>
              <div className="flex gap-2">
                <Input id="admin-password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
                <Button type="button" variant="secondary" onClick={() => void copy(password)} disabled={!password} aria-label="Sao chép mật khẩu">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Vui lòng sao chép và bàn giao mật khẩu ngay. Vì lý do bảo mật, bạn sẽ không thể xem lại sau khi đóng hộp thoại.</p>
            </div>
          </form>
        </Modal>

        <Modal
          open={changePasswordTarget !== null}
          onOpenChange={(open) => { if (!open) setChangePasswordTarget(null); }}
          title="Đổi mật khẩu quản trị viên"
          description={changePasswordTarget ? `Đặt mật khẩu mới cho ${text(changePasswordTarget.displayName || changePasswordTarget.fullName || changePasswordTarget.email) || changePasswordTarget.id}.` : "Đặt mật khẩu mới."}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setChangePasswordTarget(null)}>Hủy</Button>
              <Button form="change-admin-password-form" type="submit" loading={Boolean(changePasswordTarget && busyUid === changePasswordTarget.id)}>Đổi mật khẩu</Button>
            </div>
          }
        >
          <form id="change-admin-password-form" className="space-y-4" onSubmit={submitChangePassword}>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label htmlFor="new-admin-password">Mật khẩu mới</Label>
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => { const value = generateTemporaryPassword(); setNewPassword(value); setConfirmPassword(value); }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Tạo mật khẩu mạnh
                </button>
              </div>
              <div className="flex gap-2">
                <Input id="new-admin-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
                <Button type="button" variant="secondary" onClick={() => void copy(newPassword)} disabled={!newPassword}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <Label htmlFor="confirm-admin-password">Nhập lại mật khẩu mới</Label>
              <Input id="confirm-admin-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
              Mật khẩu mới sẽ có hiệu lực ngay lập tức và các phiên đăng nhập trước đó sẽ tự động đăng xuất.
            </div>
          </form>
        </Modal>

        <Modal
          open={credential !== null}
          onOpenChange={(open) => { if (!open) setCredential(null); }}
          title={credential?.title || "Thông tin đăng nhập"}
          description="Hãy sao chép và chuyển mật khẩu cho đúng quản trị viên qua kênh an toàn."
          footer={<div className="flex justify-end"><Button onClick={() => setCredential(null)}>Đã lưu thông tin</Button></div>}
        >
          {credential ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-sm font-semibold">{credential.fullName}</p>
                <p className="mt-1 text-sm text-muted-foreground">{credential.email}</p>
              </div>
              <div>
                <Label>Mật khẩu tạm</Label>
                <div className="flex gap-2">
                  <Input value={credential.temporaryPassword} readOnly className="font-mono font-semibold" />
                  <Button variant="secondary" onClick={() => void copy(credential.temporaryPassword)}>
                    <Copy className="h-4 w-4" /> Sao chép
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                Mật khẩu tạm chỉ hiển thị một lần. Vui lòng bàn giao an toàn và yêu cầu người dùng đổi mật khẩu khi đăng nhập lần đầu.
              </div>
            </div>
          ) : null}
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
