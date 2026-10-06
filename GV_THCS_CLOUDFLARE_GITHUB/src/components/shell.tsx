"use client";

import type { Role } from "@school/shared";
import { collection, doc, limit, onSnapshot, query, serverTimestamp, setDoc, where, type DocumentData } from "firebase/firestore";
import {
  Bell,
  BookOpen,
  BookOpenCheck,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  School,
  Settings,
  ShieldCheck,
  Star,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { cn, formatDate, initials } from "@/lib/utils";

import { Button } from "./ui";

type MenuItem = { href: string; label: string; icon: LucideIcon };
type NotificationRow = DocumentData & { id: string };

const menuByRole: Record<Role, MenuItem[]> = {
  admin: [
    { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
    { href: "/admin/setup", label: "Thiết lập hệ thống", icon: ListChecks },
    { href: "/admin/teachers", label: "Giáo viên", icon: UsersRound },
    { href: "/admin/admins", label: "Quản trị viên", icon: ShieldCheck },
    { href: "/admin/departments", label: "Bộ môn", icon: School },
    { href: "/admin/subjects", label: "Môn học", icon: BookOpen },
    { href: "/admin/classes", label: "Lớp học", icon: GraduationCap },
    { href: "/admin/rooms", label: "Phòng học", icon: DoorOpen },
    { href: "/admin/campuses", label: "Cơ sở", icon: Building2 },
    { href: "/admin/school-years", label: "Năm học", icon: CalendarDays },
    { href: "/admin/semesters", label: "Học kỳ", icon: CalendarClock },
    { href: "/admin/time-slots", label: "Tiết học", icon: Clock3 },
    { href: "/admin/schedules", label: "Thời khóa biểu", icon: CalendarDays },
    { href: "/admin/leave-requests", label: "Đơn nghỉ phép", icon: CalendarClock },
    { href: "/admin/evaluations", label: "Đánh giá chuyên môn", icon: Star },
    { href: "/admin/payroll", label: "Chấm công & Lương", icon: WalletCards },
    { href: "/admin/settings", label: "Cài đặt", icon: Settings },
  ],
  bgh: [
    { href: "/bgh/dashboard", label: "Tổng quan", icon: LayoutDashboard },
    { href: "/bgh/schedules", label: "Thời khóa biểu", icon: CalendarDays },
    { href: "/bgh/teachers", label: "Giáo viên", icon: UsersRound },
    { href: "/bgh/classes", label: "Lớp học", icon: GraduationCap },
    { href: "/bgh/subjects", label: "Môn học", icon: BookOpen },
    { href: "/bgh/rooms", label: "Phòng học", icon: DoorOpen },
    { href: "/bgh/leave-requests", label: "Đơn nghỉ phép", icon: CalendarClock },
    { href: "/bgh/evaluations", label: "Đánh giá chuyên môn", icon: Star },
  ],
  totruong: [
    { href: "/totruong/dashboard", label: "Tổng quan", icon: LayoutDashboard },
    { href: "/totruong/teachers", label: "Giáo viên tổ bộ môn", icon: UsersRound },
    { href: "/totruong/schedules", label: "Thời khóa biểu", icon: CalendarDays },
    { href: "/totruong/leave-requests", label: "Đơn nghỉ phép", icon: CalendarClock },
    { href: "/totruong/evaluations", label: "Đánh giá chuyên môn", icon: ClipboardCheck },
  ],
  giaovien: [
    { href: "/teacher/dashboard", label: "Tổng quan", icon: LayoutDashboard },
    { href: "/teacher/schedule", label: "Lịch dạy", icon: CalendarDays },
    { href: "/teacher/availability", label: "Đăng ký giờ trống", icon: BookOpenCheck },
    { href: "/teacher/leave-requests", label: "Đơn nghỉ phép", icon: CalendarClock },
    { href: "/teacher/evaluations", label: "Kết quả đánh giá", icon: Star },
    { href: "/teacher/attendance", label: "Chấm công", icon: ClipboardCheck },
    { href: "/teacher/payroll", label: "Bảng thù lao", icon: WalletCards },
    { href: "/teacher/notifications", label: "Thông báo", icon: MessageSquareText },
    { href: "/teacher/change-password", label: "Đổi mật khẩu", icon: KeyRound },
  ],
};

const roleLabel: Record<Role, string> = {
  admin: "Quản trị viên",
  bgh: "Ban Giám Hiệu",
  totruong: "Tổ trưởng bộ môn",
  giaovien: "Giáo viên",
};

function formatRoleLabel(role: Role | null, claims: Record<string, unknown> | null) {
  if (!role) return "Chưa cấp quyền";
  const isTeaching = Boolean(claims?.teacherId);
  const teachingSuffix = isTeaching && role !== "giaovien" ? " • Kiêm giảng dạy" : "";

  if (role === "bgh") {
    const position = claims?.bghPosition === "hieutruong" ? "Hiệu trưởng" : "Phó Hiệu trưởng";
    const level = claims?.schoolLevel === "primary"
      ? "Tiểu học"
      : claims?.schoolLevel === "secondary"
        ? "THCS"
        : "Toàn trường";
    return `${position} (${level})${teachingSuffix}`;
  }
  return `${roleLabel[role]}${teachingSuffix}`;
}

function Sidebar({ collapsed, mobile, onClose }: { collapsed: boolean; mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { claims, role, user, signOutUser } = useAuth();
  const items = role ? menuByRole[role] : [];
  const hasTeachingProfile = Boolean(claims?.teacherId) && role !== "giaovien";
  const teachingItems = [
    { href: "/teacher/schedule", label: "Lịch giảng dạy", icon: CalendarDays },
    { href: "/teacher/availability", label: "Đăng ký giờ trống", icon: BookOpenCheck },
    { href: "/teacher/leave-requests", label: "Đơn nghỉ phép", icon: CalendarClock },
  ];

  async function logout() {
    await signOutUser();
    router.replace("/login");
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-slate-800/70 bg-slate-950 text-slate-100 transition-all",
        !mobile && (collapsed ? "w-[84px]" : "w-[268px]"),
        mobile && "w-[290px] max-w-[86vw]",
      )}
    >
      <div className="flex h-[74px] items-center gap-3 border-b border-slate-800 px-5">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-md shadow-blue-950/30">
          <img src="/logo.png" alt="Logo" className="h-full w-full object-contain" />
        </div>
        {!collapsed || mobile ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">GV Manager</p>
            <p className="truncate text-xs text-slate-400">Quản lý giáo viên</p>
          </div>
        ) : null}
        {mobile ? (
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              onClick={mobile ? onClose : undefined}
              className={cn(
                "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                active
                  ? "bg-blue-600 text-white shadow-md shadow-blue-950/30"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
                collapsed && !mobile && "justify-center px-0",
              )}
              title={collapsed && !mobile ? label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed || mobile ? <span className="truncate">{label}</span> : null}
              {active && (!collapsed || mobile) ? <ChevronRight className="ml-auto h-4 w-4 opacity-70" /> : null}
            </Link>
          );
        })}

        {hasTeachingProfile ? (
          <>
            <div className="my-3 border-t border-slate-800/80" />
            {!collapsed || mobile ? (
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-blue-400">
                Lịch dạy cá nhân
              </p>
            ) : null}
            {teachingItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={mobile ? onClose : undefined}
                  className={cn(
                    "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                    active
                      ? "bg-blue-600 text-white shadow-md shadow-blue-950/30"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
                    collapsed && !mobile && "justify-center px-0",
                  )}
                  title={collapsed && !mobile ? label : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed || mobile ? <span className="truncate">{label}</span> : null}
                  {active && (!collapsed || mobile) ? <ChevronRight className="ml-auto h-4 w-4 opacity-70" /> : null}
                </Link>
              );
            })}
          </>
        ) : null}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className={cn("rounded-xl bg-slate-900 p-3", collapsed && !mobile && "grid place-items-center p-2")}>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-200">
              {initials(user?.displayName || user?.email)}
            </div>
            {!collapsed || mobile ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user?.displayName || user?.email || "Tài khoản"}</p>
                <p className="truncate text-xs text-slate-400">{formatRoleLabel(role, claims)}</p>
              </div>
            ) : null}
          </div>
          {!collapsed || mobile ? (
            <button
              onClick={logout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-200"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, user, claims } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationError, setNotificationError] = useState("");

  const current = useMemo(() => {
    if (!role) return null;
    const baseItems = menuByRole[role] || [];
    const teachingItems = claims?.teacherId ? [
      { href: "/teacher/schedule", label: "Lịch giảng dạy" },
      { href: "/teacher/availability", label: "Đăng ký giờ trống" },
      { href: "/teacher/leave-requests", label: "Đơn nghỉ phép" },
    ] : [];
    return [...baseItems, ...teachingItems].find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  }, [pathname, role, claims?.teacherId]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    setNotificationError("");
    return onSnapshot(
      query(collection(firestore, "notifications"), where("userId", "==", user.uid), limit(30)),
      (snapshot) => {
        const rows: NotificationRow[] = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
        setNotifications(rows.sort((first, second) => Number(second.createdAt?.seconds || 0) - Number(first.createdAt?.seconds || 0)));
      },
      () => setNotificationError("Không thể tải thông báo."),
    );
  }, [user]);

  const unreadCount = notifications.filter((notification) => notification.read !== true).length;

  async function markNotificationRead(notification: NotificationRow) {
    if (!user || notification.read === true) return;
    await setDoc(doc(firestore, "notifications", notification.id), {
      read: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }, { merge: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar collapsed={collapsed} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Đóng menu" />
          <div className="relative h-full w-fit shadow-2xl">
            <Sidebar collapsed={false} mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[84px]" : "lg:pl-[268px]")}>
        <header className="sticky top-0 z-30 flex h-[74px] items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-xl sm:px-6">
          <Button className="lg:hidden" variant="ghost" size="sm" onClick={() => setMobileOpen(true)} aria-label="Mở menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center lg:hidden">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 shadow-sm border border-border">
              <img src="/logo.png" alt="Logo" className="h-full w-full object-contain" />
            </div>
          </div>
          <Button className="hidden lg:inline-flex" variant="ghost" size="sm" onClick={() => setCollapsed((value) => !value)} aria-label="Thu gọn menu">
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hệ thống quản lý giáo viên</p>
            <p className="truncate text-sm font-bold sm:text-base">{current?.label || "Tổng quan"}</p>
          </div>
          <div className="relative">
            <button className="relative rounded-xl p-2.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Thông báo" onClick={() => setNotificationOpen((value) => !value)}>
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
            </button>
            {notificationOpen ? (
              <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                <div className="border-b border-border px-4 py-3">
                  <p className="font-bold">Thông báo</p>
                  <p className="text-xs text-muted-foreground">{unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : "Không có thông báo chưa đọc"}</p>
                </div>
                {notificationError ? <div className="px-4 py-3 text-sm text-rose-700">{notificationError}</div> : notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa có thông báo.</div>
                ) : (
                  <div className="max-h-96 overflow-y-auto py-1">
                    {notifications.map((notification) => {
                      const content = (
                        <div className="flex gap-3 px-4 py-3 text-left transition hover:bg-muted">
                          <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", notification.read === true ? "bg-muted-foreground/30" : "bg-rose-500")} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{notification.title || "Thông báo"}</span>
                            <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.body || "Có cập nhật mới liên quan đến tài khoản của bạn."}</span>
                            <span className="mt-1 block text-[11px] text-muted-foreground">{formatDate(notification.createdAt)}</span>
                          </span>
                        </div>
                      );
                      return notification.href ? (
                        <Link key={notification.id} href={String(notification.href)} onClick={() => { void markNotificationRead(notification); setNotificationOpen(false); }}>{content}</Link>
                      ) : (
                        <button key={notification.id} className="w-full" onClick={() => markNotificationRead(notification)}>{content}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 sm:flex">
            <CircleUserRound className="h-5 w-5 text-primary" />
            <div className="max-w-44">
              <p className="truncate text-xs font-semibold">{user?.displayName || user?.email}</p>
              <p className="truncate text-[11px] text-muted-foreground">{role ? roleLabel[role] : "Chưa cấp quyền"}</p>
            </div>
          </div>
        </header>

        <main className="app-grid-bg min-h-[calc(100vh-74px)] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
