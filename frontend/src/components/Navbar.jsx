import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "../store/authSlice";
import { useTheme } from "../context/ThemeContext";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../store/notificationsSlice";
import {
  Home, LayoutDashboard, LogOut, LogIn, UserPlus,
  Building2, Sun, Moon, User, Menu, X, Bell, BellDot,
  CheckCheck,
} from "lucide-react";

const NavLink = ({ to, active, icon: Icon, label, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm font-semibold transition-all duration-200 ${
      active
        ? "bg-brand text-white shadow-b"
        : "text-[var(--c-text-3)] hover:text-[var(--c-text-1)] hover:bg-[var(--c-surface-3)]"
    }`}
  >
    <Icon size={14} strokeWidth={active ? 2.5 : 2} />
    <span className="hidden sm:inline">{label}</span>
  </Link>
);

// ── Notification type → accent color ─────────────────────────────────────────
const typeColor = (type) => {
  if (!type) return "var(--c-brand)";
  if (type.includes("PAYMENT")) return "var(--c-success)";
  if (type.includes("MAINTENANCE")) return "#f59e0b";
  if (type.includes("LEASE") || type.includes("INVITE")) return "var(--c-brand)";
  return "var(--c-text-3)";
};

function NotificationItem({ n, onRead }) {
  return (
    <div
      className="flex gap-3 px-4 py-3 transition-colors duration-150 cursor-pointer"
      style={{
        background: n.isRead ? "transparent" : "var(--c-brand-subtle)",
        borderBottom: "1px solid var(--c-border)",
      }}
      onClick={() => !n.isRead && onRead(n.id)}
    >
      <div
        className="mt-0.5 w-2 h-2 rounded-full shrink-0"
        style={{ background: n.isRead ? "transparent" : typeColor(n.type), marginTop: 6 }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-snug" style={{ color: n.isRead ? "var(--c-text-3)" : "var(--c-text-1)" }}>
          {n.message}
        </p>
        <span className="text-[10px] mt-0.5 block" style={{ color: "var(--c-text-4)" }}>
          {new Date(n.createdAt).toLocaleString("en-IN", {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

export default function Navbar() {
  const { user } = useSelector((s) => s.auth);
  const { items: notifications } = useSelector((s) => s.notifications);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

  const unread = notifications.filter((n) => !n.isRead).length;

  // Scroll detection
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Fetch notifications when logged in, poll every 30s
  useEffect(() => {
    if (!user) return;
    dispatch(fetchNotifications());
    const interval = setInterval(() => dispatch(fetchNotifications()), 30_000);
    return () => clearInterval(interval);
  }, [user, dispatch]);

  // Close bell popover on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const fn = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [bellOpen]);

  const handleLogout = () => {
    dispatch(logoutUser()).then(() => navigate("/"));
  };

  const isActive = (p) =>
    p === "/" ? location.pathname === "/" : location.pathname.startsWith(p);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "glass border-b" : "bg-transparent"
      }`}
      style={{ borderColor: "var(--c-nav-border)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[60px]">

          {/* Brand */}
          <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <div
              className="w-8 h-8 rounded-[10px] flex items-center justify-center transition-all duration-200 group-hover:scale-105"
              style={{ background: "linear-gradient(135deg, var(--c-brand) 0%, var(--c-accent) 100%)", boxShadow: "var(--shadow-brand)" }}
            >
              <Building2 size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-lg tracking-tight" style={{ color: "var(--c-text-1)" }}>
              Prop<span className="brand-text">Riva</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" active={isActive("/")} icon={Home} label="Home" />
            {user && (
              <NavLink
                to="/dashboard"
                active={isActive("/dashboard") || isActive("/property")}
                icon={LayoutDashboard}
                label="Dashboard"
              />
            )}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2">

            {/* Theme toggle */}
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="w-8 h-8 rounded-[10px] flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer"
              style={{ background: "var(--c-surface-3)", border: "1.5px solid var(--c-border)", color: "var(--c-text-3)" }}
            >
              {isDark ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
            </button>

            {/* Notification Bell — only when logged in */}
            {user && (
              <div className="relative" ref={bellRef}>
                <button
                  id="notification-bell"
                  aria-label="Notifications"
                  onClick={() => setBellOpen((v) => !v)}
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer relative"
                  style={{
                    background: bellOpen ? "var(--c-brand-subtle)" : "var(--c-surface-3)",
                    border: `1.5px solid ${bellOpen ? "var(--c-brand-ring)" : "var(--c-border)"}`,
                    color: bellOpen ? "var(--c-brand)" : "var(--c-text-3)",
                  }}
                >
                  {unread > 0 ? <BellDot size={14} strokeWidth={2} /> : <Bell size={14} strokeWidth={2} />}
                  {unread > 0 && (
                    <span
                      className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                      style={{ background: "var(--c-error, #ef4444)", lineHeight: 1 }}
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </button>

                {/* Bell Popover */}
                {bellOpen && (
                  <div
                    className="absolute right-0 mt-2 w-80 rounded-2xl overflow-hidden anim-scale"
                    style={{
                      background: "var(--c-surface)",
                      border: "1px solid var(--c-border)",
                      boxShadow: "var(--shadow-lg)",
                      transformOrigin: "top right",
                    }}
                  >
                    {/* Popover header */}
                    <div
                      className="flex items-center justify-between px-4 py-3 border-b"
                      style={{ borderColor: "var(--c-border)", background: "var(--c-surface-2)" }}
                    >
                      <span className="text-sm font-bold" style={{ color: "var(--c-text-1)" }}>
                        Notifications {unread > 0 && (
                          <span
                            className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)" }}
                          >
                            {unread} new
                          </span>
                        )}
                      </span>
                      {unread > 0 && (
                        <button
                          onClick={() => dispatch(markAllNotificationsRead())}
                          className="flex items-center gap-1 text-[10px] font-semibold cursor-pointer transition-colors hover:opacity-70"
                          style={{ color: "var(--c-brand)" }}
                        >
                          <CheckCheck size={11} /> Mark all read
                        </button>
                      )}
                    </div>

                    {/* Notification list */}
                    <div className="max-h-72 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="py-10 text-center" style={{ color: "var(--c-text-4)" }}>
                          <Bell size={22} className="mx-auto mb-2 opacity-40" />
                          <p className="text-xs">You're all caught up!</p>
                        </div>
                      ) : (
                        notifications.slice(0, 30).map((n) => (
                          <NotificationItem
                            key={n.id}
                            n={n}
                            onRead={(id) => dispatch(markNotificationRead(id))}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Auth actions */}
            {user ? (
              <div className="hidden md:flex items-center gap-2">
                {/* Avatar chip */}
                <div
                  className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full"
                  style={{ background: "var(--c-surface-3)", border: "1.5px solid var(--c-border)" }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, var(--c-brand), var(--c-accent))" }}
                  >
                    {user.name ? user.name.charAt(0).toUpperCase() : <User size={12} />}
                  </div>
                  <div className="leading-tight">
                    <div className="text-xs font-bold" style={{ color: "var(--c-text-1)" }}>{user.name}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--c-text-4)" }}>
                      {user.role?.toLowerCase()}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "var(--c-error-subtle, #fef2f2)",
                    color: "var(--c-error)",
                    border: "1.5px solid rgba(239,68,68,0.25)",
                  }}
                >
                  <LogOut size={13} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-sm font-bold transition-all duration-200 hover:-translate-y-0.5"
                  style={{ color: "var(--c-brand)", background: "var(--c-brand-subtle)", border: "1.5px solid var(--c-brand-ring)" }}
                >
                  <LogIn size={14} />
                  Login
                </Link>
                <Link to="/register" className="btn-primary text-sm !py-[7px] !px-4">
                  <UserPlus size={14} />
                  Sign Up
                </Link>
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-[10px] transition-colors cursor-pointer"
              style={{ background: "var(--c-surface-3)", border: "1.5px solid var(--c-border)", color: "var(--c-text-2)" }}
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          className="md:hidden border-t px-4 py-4 flex flex-col gap-2 anim-up"
          style={{ background: "var(--c-nav-bg)", borderColor: "var(--c-border)" }}
        >
          <NavLink to="/" active={isActive("/")} icon={Home} label="Home" onClick={() => setMobileOpen(false)} />
          {user && (
            <NavLink
              to="/dashboard"
              active={isActive("/dashboard") || isActive("/property")}
              icon={LayoutDashboard}
              label="Dashboard"
              onClick={() => setMobileOpen(false)}
            />
          )}
          {user ? (
            <button
              onClick={() => { handleLogout(); setMobileOpen(false); }}
              className="flex items-center gap-1.5 w-full px-3 py-2 rounded-[10px] text-sm font-bold transition-colors cursor-pointer"
              style={{ color: "var(--c-error)", background: "var(--c-error-subtle, #fef2f2)" }}
            >
              <LogOut size={14} /> Logout
            </button>
          ) : (
            <>
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-sm font-bold"
                style={{ color: "var(--c-brand)", background: "var(--c-brand-subtle)" }}
                onClick={() => setMobileOpen(false)}
              >
                <LogIn size={14} /> Login
              </Link>
              <Link
                to="/register"
                className="btn-primary w-full"
                onClick={() => setMobileOpen(false)}
              >
                <UserPlus size={14} /> Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
