import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchProperties, createProperty, clearPropertyError } from "../store/propertiesSlice";
import {
  fetchMaintenanceRequests,
  approveMaintenance,
  adjustRentMaintenance,
  rejectMaintenance,
} from "../store/maintenanceSlice";
import { fetchPortfolioAnalysis, clearPortfolioAnalysis } from "../store/advisorySlice";
import {
  Building2, Plus, MapPin, DollarSign, X,
  AlertCircle, Loader2, Landmark, ArrowRight, Home,
  Wrench, Check, Ban, Receipt,
  ChevronDown, ChevronUp, Clock, CheckCircle2, RefreshCcw, Sparkles, Gauge,
  TrendingUp, ShieldAlert, Award, FileText, BarChart2, ShieldCheck,
} from "lucide-react";

// ── Maintenance Status Badge ──────────────────────────────────────────────────

const STATUS_META = {
  PENDING:              { label: "Pending",          color: "#f59e0b",          bg: "rgba(245,158,11,0.1)" },
  APPROVED_PAID_DIRECTLY: { label: "Approved & Paid",  color: "var(--c-success)", bg: "rgba(16,185,129,0.1)" },
  APPROVED_RENT_ADJUSTED: { label: "Rent Adjusted",  color: "var(--c-brand)",   bg: "var(--c-brand-subtle)" },
  REJECTED:             { label: "Rejected",         color: "var(--c-error)",   bg: "rgba(239,68,68,0.08)" },
};
const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status, color: "var(--c-text-3)", bg: "var(--c-surface-3)" };
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
};

// ── Field Wrapper ─────────────────────────────────────────────────────────────

function F({ label, error, optional, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
        {label}{optional && <span className="normal-case font-medium ml-1" style={{ color: "var(--c-text-4)" }}>(optional)</span>}
      </label>
      {children}
      {error && <span className="text-xs font-medium" style={{ color: "var(--c-error)" }}>{error}</span>}
    </div>
  );
}

// ── Reject Reason Modal ───────────────────────────────────────────────────────

function RejectModal({ request, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden anim-scale"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--c-border)", background: "var(--c-surface-2)" }}>
          <span className="font-bold text-sm" style={{ color: "var(--c-text-1)" }}>Reject Maintenance Request</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{ color: "var(--c-text-3)" }}><X size={15} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <p className="text-xs" style={{ color: "var(--c-text-3)" }}>
            Rejecting: <strong style={{ color: "var(--c-text-1)" }}>{request.description}</strong> (${request.cost})
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>Reason (optional)</label>
            <textarea
              rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Bill seems too high, please provide photo proof"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none resize-none focus:ring-2"
              style={{ background: "var(--c-surface)", border: "1.5px solid var(--c-border)", color: "var(--c-text-1)" }}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-ghost !py-2 !px-4 !text-sm flex-1">Cancel</button>
            <button
              onClick={() => onConfirm(reason)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
              style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)", border: "1.5px solid rgba(239,68,68,0.25)" }}
            >
              <Ban size={13} /> Confirm Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Maintenance Panel ─────────────────────────────────────────────────────────

function MaintenancePanel() {
  const dispatch = useDispatch();
  const { requests, loading, actionLoading, error } = useSelector((s) => s.maintenance);
  const [expanded, setExpanded] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null); // request to reject

  useEffect(() => {
    dispatch(fetchMaintenanceRequests());
  }, [dispatch]);

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  const handleApprove = (id) => dispatch(approveMaintenance(id));
  const handleAdjust  = (id) => dispatch(adjustRentMaintenance(id));
  const handleReject  = (id, reason) => {
    dispatch(rejectMaintenance({ requestId: id, reason }));
    setRejectTarget(null);
  };

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-sm)" }}
    >
      {/* Section header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 border-b cursor-pointer transition-colors hover:bg-[var(--c-surface-2)]"
        style={{ borderColor: "var(--c-border)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
            <Wrench size={18} />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold" style={{ color: "var(--c-text-1)" }}>Maintenance Requests</p>
            <p className="text-xs" style={{ color: "var(--c-text-3)" }}>
              {pending.length} pending · {decided.length} resolved
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
              {pending.length} need action
            </span>
          )}
          {expanded ? <ChevronUp size={16} style={{ color: "var(--c-text-4)" }} /> : <ChevronDown size={16} style={{ color: "var(--c-text-4)" }} />}
        </div>
      </button>

      {expanded && (
        <div className="p-5 flex flex-col gap-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin" size={22} style={{ color: "var(--c-brand)" }} />
            </div>
          ) : requests.length === 0 ? (
            <div className="py-8 text-center flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--c-surface-3)", color: "var(--c-text-4)" }}>
                <Receipt size={20} />
              </div>
              <p className="text-sm" style={{ color: "var(--c-text-3)" }}>No maintenance requests yet.</p>
            </div>
          ) : (
            <>
              {/* Pending requests */}
              {pending.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--c-text-4)" }}>
                    <Clock size={10} /> Awaiting Your Decision
                  </h4>
                  {pending.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl p-4 flex flex-col gap-3"
                      style={{ background: "rgba(245,158,11,0.05)", border: "1.5px solid rgba(245,158,11,0.25)" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color: "var(--c-text-1)" }}>{r.description}</p>
                          <div className="flex flex-wrap gap-2 mt-1 text-xs" style={{ color: "var(--c-text-3)" }}>
                            <span>{r.lease?.property?.title || "—"}</span>
                            <span>·</span>
                            <span>Tenant: <strong style={{ color: "var(--c-text-2)" }}>{r.lease?.tenant?.name || r.lease?.tenant?.email}</strong></span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1 text-xs" style={{ color: "var(--c-text-3)" }}>
                            <span>Vendor: {r.vendorName}</span>
                            {r.billCode && <><span>·</span><span className="font-mono">{r.billCode}</span></>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-lg font-display font-bold" style={{ color: "var(--c-text-1)" }}>${r.cost?.toLocaleString()}</span>
                          {r.invoiceNo && <span className="text-[10px] font-mono" style={{ color: "var(--c-text-4)" }}>{r.invoiceNo}</span>}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t" style={{ borderColor: "rgba(245,158,11,0.2)" }}>
                        <button
                          id={`approve-maint-${r.id}`}
                          onClick={() => handleApprove(r.id)}
                          disabled={actionLoading}
                          className="flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50 transition-all hover:-translate-y-0.5"
                          style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)", border: "1px solid rgba(16,185,129,0.25)" }}
                          title="Pay tenant back directly"
                        >
                          <Check size={12} /> Pay Back
                        </button>
                        <button
                          id={`adjust-maint-${r.id}`}
                          onClick={() => handleAdjust(r.id)}
                          disabled={actionLoading}
                          className="flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50 transition-all hover:-translate-y-0.5"
                          style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)", border: "1px solid var(--c-brand-ring)" }}
                          title="Deduct from next rent"
                        >
                          <RefreshCcw size={12} /> Adjust Rent
                        </button>
                        <button
                          id={`reject-maint-${r.id}`}
                          onClick={() => setRejectTarget(r)}
                          disabled={actionLoading}
                          className="flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50 transition-all hover:-translate-y-0.5"
                          style={{ background: "rgba(239,68,68,0.07)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }}
                          title="Reject this request"
                        >
                          <Ban size={12} /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Resolved requests */}
              {decided.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--c-text-4)" }}>
                    <CheckCircle2 size={10} /> Resolved
                  </h4>
                  {decided.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl px-4 py-3 flex items-center gap-3 opacity-80"
                      style={{ background: "var(--c-surface-3)", border: "1px solid var(--c-border)" }}
                    >
                      <Wrench size={14} className="shrink-0" style={{ color: "var(--c-text-4)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--c-text-2)" }}>{r.description}</p>
                        <p className="text-[10px]" style={{ color: "var(--c-text-4)" }}>
                          {r.vendorName} · ${r.cost}
                          {r.rejectionReason && ` · "${r.rejectionReason}"`}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ background: "rgba(239,68,68,0.08)", color: "var(--c-error)" }}>
                  <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onConfirm={(reason) => handleReject(rejectTarget.id, reason)}
          onClose={() => setRejectTarget(null)}
        />
      )}
    </section>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LandlordDashboard() {
  const dispatch = useDispatch();
  const { list: properties, loading, error } = useSelector((s) => s.properties);
  const { data: portfolioData, loading: portfolioLoading, error: portfolioError } = useSelector((s) => s.advisory.portfolio);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", address: "", city: "", state: "MH", pincode: "", rentAmount: "", listedPrice: "",
  });
  const [errs, setErrs] = useState({});
  const [showPortfolioMl, setShowPortfolioMl] = useState(false);

  useEffect(() => {
    dispatch(fetchProperties());
    return () => {
      dispatch(clearPortfolioAnalysis());
    };
  }, [dispatch]);

  useEffect(() => {
    if (!modalOpen) return;
    const fn = (e) => { if (e.key === "Escape") { e.preventDefault(); setModalOpen(false); } };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [modalOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errs[name]) setErrs((p) => ({ ...p, [name]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.title.trim())   e.title   = "Title is required";
    if (!form.address.trim()) e.address = "Address is required";
    if (!form.city.trim())    e.city    = "Locality is required";
    if (!form.state.trim())   e.state   = "State is required";
    if (!form.rentAmount) e.rentAmount = "Rent amount is required";
    else if (isNaN(form.rentAmount) || Number(form.rentAmount) <= 0) e.rentAmount = "Must be a positive number";
    if (!form.listedPrice) e.listedPrice = "Listed price is required";
    else if (isNaN(form.listedPrice) || Number(form.listedPrice) <= 0) e.listedPrice = "Must be a positive number";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const openModal = () => {
    setForm({ title: "", description: "", address: "", city: "", state: "MH", pincode: "", rentAmount: "", listedPrice: "" });
    setErrs({});
    dispatch(clearPropertyError());
    setModalOpen(true);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!validate()) return;
    dispatch(createProperty({ 
      ...form, 
      pincode: form.city, // Store locality name in pincode column
      rentAmount: parseFloat(form.rentAmount), 
      listedPrice: parseFloat(form.listedPrice) 
    }))
      .then((action) => { if (!action.error) setModalOpen(false); });
  };

  const totalRent = properties.reduce((s, p) => s + (p.rentAmount || 0), 0);



  const inp = (err, extra = "") =>
    `w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-150 ${extra}` +
    (err ? " field-error" : " focus:ring-2");

  const inputStyle = {
    background: "var(--c-surface)",
    border: "1.5px solid var(--c-border)",
    color: "var(--c-text-1)",
  };

  const fmtINR = (v) => {
    if (!v && v !== 0) return "N/A";
    return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="flex flex-col gap-8 anim-up">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight" style={{ color: "var(--c-text-1)" }}>
            My Properties
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--c-text-3)" }}>
            Manage properties, tenants and maintenance requests
          </p>
        </div>
        <button id="open-add-property" onClick={openModal} className="btn-primary">
          <Plus size={16} />
          Add Property
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { icon: Building2, label: "Total Listed",    value: properties.length, suffix: null,   iconBg: "var(--c-brand-subtle)",       iconColor: "var(--c-brand)" },
          { icon: Landmark,  label: "Portfolio Value", value: fmtINR(totalRent), suffix: "/mo", iconBg: "rgba(16,185,129,0.1)", iconColor: "var(--c-success)" },
        ].map(({ icon: Icon, label, value, suffix, iconBg, iconColor }) => (
          <div
            key={label}
            className="rounded-2xl p-5 flex items-center gap-4"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg, color: iconColor }}>
              <Icon size={22} strokeWidth={2} />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: "var(--c-text-4)" }}>{label}</span>
              <span className="text-2xl font-display font-bold leading-tight mt-0.5 block" style={{ color: "var(--c-text-1)" }}>
                {value}
                {suffix && <span className="text-xs font-semibold ml-1" style={{ color: "var(--c-text-4)" }}>{suffix}</span>}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── AI Portfolio Advisory Panel ── */}
      <div
        className="rounded-2xl p-6"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex items-center justify-between pb-3 border-b mb-5" style={{ borderColor: "var(--c-border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(37,99,235,0.12)", color: "var(--c-brand)" }}>
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--c-text-1)" }}>AI Portfolio Advisor</h3>
              <p className="text-[10px]" style={{ color: "var(--c-text-3)" }}>
                Aggregate metrics and health narrative for your properties
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPortfolioMl(!showPortfolioMl)}
            className="btn-ghost !py-1.5 !px-3 !text-xs flex items-center gap-1"
          >
            {showPortfolioMl ? "Hide Analytics" : "Open Advisor"}
            {showPortfolioMl ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {showPortfolioMl && (
          <div className="flex flex-col gap-6">
            {/* Action triggering */}
            <div className="flex justify-between items-center bg-[var(--c-surface-2)] p-4 rounded-xl border border-[var(--c-border)]">
              <span className="text-xs" style={{ color: "var(--c-text-2)" }}>
                Compile all {properties.length} active listings and run portfolio risk & yield diagnostics.
              </span>
              <button
                disabled={portfolioLoading || properties.length === 0}
                onClick={() => dispatch(fetchPortfolioAnalysis({ enable_llm: true }))}
                className="btn-primary !py-1.5 !px-4 !text-xs"
              >
                {portfolioLoading ? (
                  <><Loader2 size={12} className="animate-spin" /> Analyzing...</>
                ) : (
                  <><BarChart2 size={12} /> Run Diagnostics</>
                )}
              </button>
            </div>

            {/* Error */}
            {portfolioError && (
              <div className="flex items-start gap-2 p-3.5 rounded-xl text-xs animate-scale-in" style={{ background: "var(--c-error-subtle)", color: "var(--c-error)" }}>
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{portfolioError}</span>
              </div>
            )}

            {/* Results output */}
            {portfolioData && portfolioData.summary && (
              <div className="flex flex-col gap-6 animate-scale-in">
                {/* Visual grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Total portfolio value */}
                  <div className="rounded-xl p-4 border flex flex-col gap-1" style={{ background: "var(--c-surface-2)", borderColor: "var(--c-border)" }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Est. Market Value</span>
                    <span className="text-lg font-bold" style={{ color: "var(--c-text-1)" }}>
                      {fmtINR(portfolioData.summary.total_value)}
                    </span>
                    <span className="text-[9px] text-[var(--c-text-4)]">
                      {portfolioData.summary.property_count} properties
                    </span>
                  </div>

                  {/* Net annual income */}
                  <div className="rounded-xl p-4 border flex flex-col gap-1" style={{ background: "var(--c-surface-2)", borderColor: "var(--c-border)" }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Net Annual Income</span>
                    <span className="text-lg font-bold" style={{ color: "var(--c-text-1)" }}>
                      {fmtINR(portfolioData.summary.net_annual_income)}
                    </span>
                    <span className="text-[9px] text-[var(--c-text-4)]">
                      Rent: {fmtINR(portfolioData.summary.total_annual_rent)}/yr
                    </span>
                  </div>

                  {/* Yield */}
                  <div className="rounded-xl p-4 border flex flex-col gap-1" style={{ background: "var(--c-surface-2)", borderColor: "var(--c-border)" }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Net / Gross Yield</span>
                    <span className="text-lg font-bold" style={{ color: "var(--c-success)" }}>
                      {portfolioData.summary.net_yield_pct}%
                    </span>
                    <span className="text-[9px] text-[var(--c-text-4)]">
                      Gross: {portfolioData.summary.gross_yield_pct}%
                    </span>
                  </div>

                  {/* Diversification & Risk */}
                  <div className="rounded-xl p-4 border flex flex-col gap-1" style={{ background: "var(--c-surface-2)", borderColor: "var(--c-border)" }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Risk & Diversification</span>
                    <span className="text-lg font-bold" style={{ color: "var(--c-brand)" }}>
                      {portfolioData.summary.avg_risk_score?.toFixed(0)}/100
                    </span>
                    <span className="text-[9px] text-[var(--c-text-4)]">
                      Diversification: {portfolioData.summary.diversification_score?.toFixed(0)}/100
                    </span>
                  </div>
                </div>

                {/* Narrative narrative */}
                {portfolioData.summary.llm_narrative && (
                  <div className="rounded-xl p-5 border flex flex-col gap-3" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--c-text-1)" }}>
                      <FileText size={13} style={{ color: "var(--c-brand)" }} />
                      AI Executive Portfolio Briefing
                    </h4>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-2)" }}>
                      {portfolioData.summary.llm_narrative}
                    </p>
                  </div>
                )}

                {/* Performers & Suggestions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Rebalancing suggestions */}
                  <div className="rounded-xl p-4 border flex flex-col gap-2" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--c-text-1)" }}>
                      <ShieldCheck size={13} style={{ color: "var(--c-success)" }} />
                      Rebalancing Warnings & Suggestions
                    </h4>
                    <ul className="flex flex-col gap-2 pt-1 text-xs">
                      {portfolioData.summary.rebalancing_flags?.map((flag, idx) => (
                        <li key={idx} className="flex gap-2" style={{ color: "var(--c-text-2)" }}>
                          <span className="text-xs font-bold text-[var(--c-brand)] shrink-0">•</span>
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Suggested Next Steps */}
                  <div className="rounded-xl p-4 border flex flex-col gap-2" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--c-text-1)" }}>
                      <TrendingUp size={13} style={{ color: "var(--c-brand)" }} />
                      Next Investment Suggestion
                    </h4>
                    <p className="text-xs leading-relaxed pt-1" style={{ color: "var(--c-text-2)" }}>
                      {portfolioData.summary.next_investment_suggestion}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Maintenance Review Panel ── */}
      <MaintenancePanel />

      {/* Properties grid */}
      {loading && properties.length === 0 ? (
        <div className="flex justify-center py-24">
          <Loader2 className="animate-spin" size={32} style={{ color: "var(--c-brand)" }} />
        </div>
      ) : properties.length === 0 ? (
        <div
          className="rounded-2xl p-14 text-center max-w-lg mx-auto flex flex-col items-center gap-4"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "var(--c-surface-3)", color: "var(--c-text-4)" }}>
            <Home size={30} />
          </div>
          <div>
            <h3 className="text-lg font-bold mb-1" style={{ color: "var(--c-text-1)" }}>No properties yet</h3>
            <p className="text-sm max-w-xs mx-auto" style={{ color: "var(--c-text-3)" }}>
              Add your first listing to invite tenants and set up digital leases.
            </p>
          </div>
          <button onClick={openModal} className="btn-primary">Add Property Now</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl p-6 flex flex-col justify-between card-lift"
              style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-sm)" }}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-base font-bold line-clamp-1 flex-1" style={{ color: "var(--c-text-1)" }}>{p.title}</h3>
                  <span className="badge shrink-0" style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)", border: "1px solid rgba(16,185,129,0.2)" }}>
                    Active
                  </span>
                </div>
                {p.description && (
                  <p className="text-sm line-clamp-2 mb-4 leading-relaxed" style={{ color: "var(--c-text-3)" }}>{p.description}</p>
                )}
                <div className="flex flex-col gap-2 mb-5">
                  <div className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-3)" }}>
                    <MapPin size={13} style={{ color: "var(--c-accent)" }} className="shrink-0" />
                    <span className="truncate">{p.address}, {p.city}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-lg" style={{ color: "var(--c-success)" }}>₹</span>
                    <span className="font-bold" style={{ color: "var(--c-text-1)" }}>{p.rentAmount?.toLocaleString("en-IN")}</span>
                    <span style={{ color: "var(--c-text-3)" }}>/ month</span>
                  </div>
                </div>
              </div>
              <Link
                to={`/property/${p.id}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:gap-3 hover:-translate-y-0.5"
                style={{ background: "var(--c-surface-3)", color: "var(--c-brand)", border: "1px solid var(--c-border)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-brand)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--c-brand)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--c-surface-3)"; e.currentTarget.style.color = "var(--c-brand)"; e.currentTarget.style.borderColor = "var(--c-border)"; }}
              >
                Manage Property <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Property Modal ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          role="dialog" aria-modal="true" aria-labelledby="modal-title"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-[540px] rounded-2xl overflow-hidden anim-scale"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ background: "var(--c-surface-2)", borderColor: "var(--c-border)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)" }}>
                  <Plus size={15} />
                </div>
                <h3 id="modal-title" className="text-base font-bold" style={{ color: "var(--c-text-1)" }}>
                  Add New Property
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                style={{ color: "var(--c-text-3)", background: "transparent" }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
              {error && (
                <div
                  className="flex items-start gap-2 p-3.5 rounded-xl text-sm"
                  style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }}
                  role="alert"
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <F label="Property Title *" error={errs.title}>
                <input type="text" name="title" value={form.title} onChange={handleChange}
                  placeholder="e.g. 2 BHK Apartment in Thane"
                  className={inp(errs.title)} style={inputStyle} required />
              </F>

              <F label="Description" optional>
                <textarea name="description" value={form.description} onChange={handleChange}
                  placeholder="Features, rules, amenities…" rows={2}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-150 resize-none"
                  style={{ ...inputStyle, border: "1.5px solid var(--c-border)" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--c-brand)"; e.target.style.boxShadow = "0 0 0 3px var(--c-brand-ring)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--c-border)"; e.target.style.boxShadow = "none"; }}
                />
              </F>

              <F label="Address *" error={errs.address}>
                <input type="text" name="address" value={form.address} onChange={handleChange}
                  placeholder="Street / Building / Locality" className={inp(errs.address)} style={inputStyle} required />
              </F>

              <div className="grid grid-cols-2 gap-3">
                <F label="Locality *" error={errs.city}>
                  <select name="city" value={form.city} onChange={handleChange}
                    className={inp(errs.city, "!pl-4 !py-2.5")} style={inputStyle} required>
                    <option value="">Select Locality</option>
                    {[
                      'Central Mumbai suburbs', 'Mira Road And Beyond', 'Mumbai Andheri-Dahisar', 
                      'Mumbai Beyond Thane', 'Mumbai Harbour', 'Mumbai South West', 
                      'Navi Mumbai', 'South Mumbai', 'Thane'
                    ].map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </F>

                <F label="State *" error={errs.state}>
                  <input type="text" name="state" value={form.state} onChange={handleChange}
                    placeholder="MH" className={inp(errs.state)} style={inputStyle} required />
                </F>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <F label="Monthly Rent (₹) *" error={errs.rentAmount}>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold pointer-events-none text-sm" style={{ color: "var(--c-text-3)" }}>₹</span>
                    <input type="number" name="rentAmount" value={form.rentAmount} onChange={handleChange}
                      placeholder="35000"
                      className={`pl-8 pr-4 py-2.5 w-full rounded-xl text-sm outline-none transition-all duration-150 ${errs.rentAmount ? "field-error" : ""}`}
                      style={inputStyle} required />
                  </div>
                </F>

                <F label="Listed Price (₹) *" error={errs.listedPrice}>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold pointer-events-none text-sm" style={{ color: "var(--c-text-3)" }}>₹</span>
                    <input type="number" name="listedPrice" value={form.listedPrice} onChange={handleChange}
                      placeholder="12000000"
                      className={`pl-8 pr-4 py-2.5 w-full rounded-xl text-sm outline-none transition-all duration-150 ${errs.listedPrice ? "field-error" : ""}`}
                      style={inputStyle} required />
                  </div>
                </F>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: "var(--c-border)" }}>
                <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost !py-2 !px-4 !text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn-primary !py-2 !px-5 !text-sm">
                  {loading
                    ? <><Loader2 size={14} className="animate-spin" /><span>Creating…</span></>
                    : <span>Add Listing</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
