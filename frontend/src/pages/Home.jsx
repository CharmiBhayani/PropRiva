import React from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  Building2, MailCheck, ShieldCheck, ArrowRight, Sparkles,
  CheckCircle2, TrendingUp, Users, Key, Star,
} from "lucide-react";

const features = [
  {
    icon: Building2,
    title: "Dynamic Listings",
    desc: "Create detailed property listings with address, pricing, and all essential information in under a minute.",
    gradient: "from-blue-500/10 to-blue-600/5",
    iconColor: "text-blue-500",
    ring: "ring-blue-500/20",
  },
  {
    icon: MailCheck,
    title: "Instant Invites",
    desc: "Send secure rental requests directly to tenants' inboxes. No complex forms, just an email.",
    gradient: "from-sky-500/10 to-sky-600/5",
    iconColor: "text-sky-500",
    ring: "ring-sky-500/20",
  },
  {
    icon: ShieldCheck,
    title: "Digital Leases",
    desc: "Tenants approve or reject leases from their own portal — fully digital, auditable, and instant.",
    gradient: "from-emerald-500/10 to-emerald-600/5",
    iconColor: "text-emerald-500",
    ring: "ring-emerald-500/20",
  },
];

const stats = [
  { icon: Building2, value: "2,400+", label: "Properties Listed" },
  { icon: Users,    value: "8,900+", label: "Happy Tenants" },
  { icon: Key,      value: "99.2%",  label: "Lease Success Rate" },
  { icon: Star,     value: "4.9 / 5", label: "Average Rating" },
];

const highlights = [
  "No paperwork required",
  "Invite tenants via email",
  "Real-time lease tracking",
];

export default function Home() {
  const { user } = useSelector((s) => s.auth);

  return (
    <div className="flex flex-col flex-1 w-full">

      {/* ── Hero ── */}
      <section className="relative flex-1 flex items-center overflow-hidden hero-mesh">
        {/* dot grid background */}
        <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" aria-hidden />

        {/* Glow orbs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-40 left-1/4 w-[600px] h-[600px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)" }}
          />
          <div
            className="absolute -bottom-20 right-0 w-[400px] h-[400px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(14,165,233,0.07) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-8 py-24 sm:py-32 text-center w-full">
          {/* Eyebrow badge */}
          <div className="flex justify-center mb-8 anim-up">
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: "var(--c-brand-subtle)",
                color: "var(--c-brand)",
                border: "1px solid var(--c-brand-ring)",
              }}
            >
              <Sparkles size={11} />
              Modern Property Management Platform
            </span>
          </div>

          {/* Heading */}
          <h1
            className="text-4xl sm:text-5xl lg:text-[4rem] font-display font-bold tracking-tight mb-6 leading-[1.08] anim-up delay-100"
            style={{ color: "var(--c-text-1)" }}
          >
            Renting &amp; Leases
            <br />
            <span className="brand-text">Made Effortless</span>
          </h1>

          {/* Sub */}
          <p
            className="text-base sm:text-lg mb-8 max-w-2xl mx-auto leading-relaxed anim-up delay-200"
            style={{ color: "var(--c-text-3)" }}
          >
            PropRiva centralises tenant relationships. Create listings, send secure invitations,
            and manage lease agreements — all from one beautiful dashboard.
          </p>

          {/* Highlights */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-10 anim-up delay-200">
            {highlights.map((h) => (
              <span key={h} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--c-text-3)" }}>
                <CheckCircle2 size={14} style={{ color: "var(--c-success)" }} className="shrink-0" />
                {h}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="flex justify-center items-center gap-3 flex-wrap anim-up delay-300">
            {user ? (
              <Link to="/dashboard" className="btn-primary text-base !py-3 !px-7">
                Go to Dashboard <ArrowRight size={17} />
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary text-base !py-3 !px-7">
                  Get Started Free <ArrowRight size={17} />
                </Link>
                <Link to="/login" className="btn-ghost text-base !py-3 !px-7">
                  Sign In
                </Link>
              </>
            )}
          </div>

          {/* Trust row */}
          <p className="mt-6 text-xs font-medium anim-up delay-300" style={{ color: "var(--c-text-4)" }}>
            Trusted by landlords and tenants across India
          </p>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section
        className="border-y py-6"
        style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)" }}
              >
                <Icon size={17} strokeWidth={2} />
              </div>
              <div>
                <div className="text-lg font-display font-bold leading-none" style={{ color: "var(--c-text-1)" }}>{value}</div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: "var(--c-text-4)" }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 sm:py-24" style={{ background: "var(--c-bg)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center max-w-2xl mx-auto mb-14">
            <span
              className="badge mb-4"
              style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)", border: "1px solid var(--c-brand-ring)" }}
            >
              <TrendingUp size={10} /> Why PropRiva
            </span>
            <h2
              className="text-3xl sm:text-[2.5rem] font-display font-bold tracking-tight mb-4"
              style={{ color: "var(--c-text-1)" }}
            >
              Everything to manage rentals
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "var(--c-text-3)" }}>
              From listing to lease approval — one cohesive platform with zero friction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
            {features.map(({ icon: Icon, title, desc, iconColor, ring }) => (
              <div
                key={title}
                className="relative rounded-2xl p-7 card-lift flex flex-col gap-5 overflow-hidden"
                style={{
                  background: "var(--c-surface)",
                  border: "1px solid var(--c-border)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {/* background glow */}
                <div
                  className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                  style={{ background: "var(--c-brand-subtle)", opacity: 0.5, transform: "translate(30%,-30%)" }}
                  aria-hidden
                />
                <div
                  className={`relative w-11 h-11 rounded-xl flex items-center justify-center ring-2 ${ring} ${iconColor}`}
                  style={{ background: "var(--c-surface-2)" }}
                >
                  <Icon size={22} strokeWidth={1.75} />
                </div>
                <div className="relative">
                  <h3 className="text-base font-bold mb-2" style={{ color: "var(--c-text-1)" }}>{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--c-text-3)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      {!user && (
        <section className="py-16 sm:py-20" style={{ background: "var(--c-surface)" }}>
          <div className="max-w-3xl mx-auto px-4 text-center">
            <div
              className="rounded-3xl px-8 py-12 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, var(--c-brand) 0%, var(--c-accent) 100%)",
                boxShadow: "var(--shadow-brand-lg)",
              }}
            >
              <div className="absolute inset-0 dot-grid opacity-10 pointer-events-none" aria-hidden />
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-white mb-3">
                Start managing properties today
              </h2>
              <p className="text-white/80 text-base mb-8">
                Free to get started. No credit card needed.
              </p>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-white font-bold text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                style={{ color: "var(--c-brand)" }}
              >
                Create Free Account <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer
        className="py-7 border-t"
        style={{ background: "var(--c-surface-2)", borderColor: "var(--c-border)" }}
      >
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--c-brand), var(--c-accent))" }}
            >
              <Building2 size={12} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--c-text-2)" }}>PropRiva</span>
          </div>
          <p className="text-xs" style={{ color: "var(--c-text-4)" }}>
            &copy; {new Date().getFullYear()} PropRiva Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs font-medium" style={{ color: "var(--c-text-4)" }}>
            <span className="cursor-pointer hover:text-brand transition-colors">Privacy</span>
            <span className="cursor-pointer hover:text-brand transition-colors">Terms</span>
            <span className="cursor-pointer hover:text-brand transition-colors">Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
