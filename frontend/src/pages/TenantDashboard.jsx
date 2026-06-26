import React, { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchActiveLeases, fetchPendingInvites, approveLease, rejectLease,
} from "../store/leasesSlice";
import {
  createPaymentOrder, verifyPayment, fetchPaymentHistory,
  clearPaymentError, clearLastPaymentSuccess,
} from "../store/paymentsSlice";
import {
  fileMaintenance, fetchMaintenanceRequests,
  clearMaintenanceError, clearFileSuccess,
} from "../store/maintenanceSlice";
import {
  Building2, MapPin, IndianRupee, User, Check, X,
  AlertCircle, Loader2, MailCheck, Key, CreditCard,
  Wrench, Receipt, Upload, Clock, CheckCircle2, XCircle,
  RotateCcw, History, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Empty({ msg, icon: Icon = Building2 }) {
  return (
    <div
      className="rounded-2xl p-10 text-center flex flex-col items-center gap-3"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--c-surface-3)", color: "var(--c-text-4)" }}>
        <Icon size={24} />
      </div>
      <p className="text-sm" style={{ color: "var(--c-text-3)" }}>{msg}</p>
    </div>
  );
}

const STATUS_META = {
  PENDING:              { label: "Pending Review",    color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  APPROVED_PAID_DIRECTLY: { label: "Approved & Paid",   color: "var(--c-success)", bg: "rgba(16,185,129,0.1)" },
  APPROVED_RENT_ADJUSTED: { label: "Rent Adjusted",  color: "var(--c-brand)",   bg: "var(--c-brand-subtle)" },
  REJECTED:             { label: "Rejected",          color: "var(--c-error)",   bg: "rgba(239,68,68,0.08)" },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status, color: "var(--c-text-3)", bg: "var(--c-surface-3)" };
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: m.bg, color: m.color }}
    >
      {m.label}
    </span>
  );
};

// ── Pay Rent Modal ────────────────────────────────────────────────────────────

function PayRentModal({ lease, onClose }) {
  const dispatch = useDispatch();
  const { activeOrder, loading, verifying, error } = useSelector((s) => s.payments);
  const [step, setStep] = useState("idle"); // idle | ordering | checkout | success | error

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispatch(clearPaymentError());
      dispatch(clearLastPaymentSuccess());
    };
  }, [dispatch]);

  const effectiveRent = Math.max(0, (lease.property?.rentAmount || 0) - (lease.rentCredits || 0));

  const handlePay = useCallback(async () => {
    setStep("ordering");
    const result = await dispatch(createPaymentOrder(lease.id));
    if (createPaymentOrder.rejected.match(result)) {
      setStep("error");
      return;
    }
    const order = result.payload;

    // ── Open Razorpay Checkout ────────────────────────────────────────────────
    // The Razorpay script is loaded lazily. In dev/test mode the handler below
    // captures the response and sends it to our verify endpoint.
    if (typeof window.Razorpay === "undefined") {
      setStep("error");
      dispatch(clearPaymentError());
      // Inject the Razorpay script dynamically
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => handlePay(); // retry after load
      document.body.appendChild(script);
      return;
    }

    setStep("checkout");

    const options = {
      key: order.keyId,
      amount: order.amount,        // in paise
      currency: order.currency || "INR",
      name: "PropRiva",
      description: `Rent — ${lease.property?.title}`,
      order_id: order.orderId,
      handler: async (response) => {
        setStep("ordering"); // show spinner while verifying
        const verifyResult = await dispatch(verifyPayment({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          leaseId: lease.id,
        }));
        if (verifyPayment.fulfilled.match(verifyResult)) {
          setStep("success");
        } else {
          setStep("error");
        }
      },
      prefill: {},
      theme: { color: "#7c3aed" },
      modal: {
        ondismiss: () => setStep("idle"),
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  }, [dispatch, lease]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      role="dialog" aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden anim-scale"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--c-border)", background: "var(--c-surface-2)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)" }}>
              <CreditCard size={15} />
            </div>
            <span className="text-base font-bold" style={{ color: "var(--c-text-1)" }}>Pay Rent</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{ color: "var(--c-text-3)" }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">

          {/* Lease details */}
          <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "var(--c-surface-3)", border: "1px solid var(--c-border)" }}>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--c-text-1)" }}>
              <Building2 size={14} style={{ color: "var(--c-brand)" }} />
              {lease.property?.title}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--c-text-3)" }}>Monthly Rent</span>
              <span className="font-bold" style={{ color: "var(--c-text-1)" }}>₹{(lease.property?.rentAmount || 0).toLocaleString()}</span>
            </div>
            {(lease.rentCredits || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--c-success)" }}>Maintenance Credit</span>
                <span className="font-bold" style={{ color: "var(--c-success)" }}>− ₹{lease.rentCredits.toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t" style={{ borderColor: "var(--c-border)" }}>
              <span className="font-bold" style={{ color: "var(--c-text-2)" }}>Amount Due</span>
              <span className="text-lg font-display font-bold" style={{ color: "var(--c-success)" }}>₹{effectiveRent.toLocaleString()}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ background: "rgba(239,68,68,0.08)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)" }}>
                <CheckCircle2 size={28} style={{ color: "var(--c-success)" }} />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm" style={{ color: "var(--c-text-1)" }}>Payment Successful!</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--c-text-3)" }}>Your rent has been recorded.</p>
              </div>
              <button onClick={onClose} className="btn-primary !py-2 !px-5 !text-sm">Done</button>
            </div>
          )}

          {/* Action */}
          {step !== "success" && (
            <button
              onClick={handlePay}
              disabled={loading || verifying || step === "ordering" || step === "checkout"}
              className="btn-primary w-full justify-center disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, var(--c-success), #059669)" }}
            >
              {(loading || verifying || step === "ordering") ? (
                <><Loader2 size={15} className="animate-spin" /> Processing…</>
              ) : (
                <><CreditCard size={15} /> Pay ₹{effectiveRent.toLocaleString()} via Razorpay</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── File Maintenance Modal ────────────────────────────────────────────────────

function FileMaintenanceModal({ lease, onClose }) {
  const dispatch = useDispatch();
  const { loading, error, fileSuccess } = useSelector((s) => s.maintenance);
  const [form, setForm] = useState({
    title: "", description: "", vendorName: "", cost: "",
    invoiceNo: "", invoiceDate: "",
  });
  const [errs, setErrs] = useState({});

  useEffect(() => {
    if (fileSuccess) {
      // Re-fetch requests and close
      dispatch(fetchMaintenanceRequests(lease.id));
      dispatch(clearFileSuccess());
      onClose();
    }
  }, [fileSuccess, dispatch, lease.id, onClose]);

  useEffect(() => () => dispatch(clearMaintenanceError()), [dispatch]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errs[name]) setErrs((p) => ({ ...p, [name]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.title.trim())       e.title       = "Title is required";
    if (!form.description.trim()) e.description = "Description is required";
    if (!form.vendorName.trim())  e.vendorName  = "Vendor/service name is required";
    if (!form.cost)               e.cost        = "Cost is required";
    else if (isNaN(form.cost) || Number(form.cost) <= 0) e.cost = "Must be a positive amount";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    dispatch(fileMaintenance({
      leaseId: lease.id,
      title: form.title.trim(),
      description: form.description.trim(),
      vendorName: form.vendorName.trim(),
      cost: parseFloat(form.cost),
      invoiceNo: form.invoiceNo.trim() || undefined,
      invoiceDate: form.invoiceDate || undefined,
    }));
  };

  const inp = (err) =>
    `w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all duration-150 ${err ? "field-error" : "focus:ring-2"}`;
  const inputStyle = { background: "var(--c-surface)", border: "1.5px solid var(--c-border)", color: "var(--c-text-1)" };

  const F = ({ label, error, children, optional }) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
        {label}{optional && <span className="normal-case font-medium ml-1" style={{ color: "var(--c-text-4)" }}>(optional)</span>}
      </label>
      {children}
      {error && <span className="text-xs text-[var(--c-error)]">{error}</span>}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      role="dialog" aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden anim-scale"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--c-border)", background: "var(--c-surface-2)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
              <Wrench size={15} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--c-text-1)" }}>File Repair Bill</p>
              <p className="text-[10px]" style={{ color: "var(--c-text-4)" }}>{lease.property?.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{ color: "var(--c-text-3)" }}>
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5 max-h-[75vh] overflow-y-auto">

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ background: "rgba(239,68,68,0.08)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <F label="Title *" error={errs.title}>
            <input type="text" name="title" value={form.title} onChange={handleChange}
              placeholder="e.g. Kitchen Plumbing Repair" className={inp(errs.title)} style={inputStyle} />
          </F>

          <F label="What needed repair? *" error={errs.description}>
            <textarea
              name="description" value={form.description} onChange={handleChange}
              placeholder="e.g. Leaking kitchen tap fixed by plumber"
              rows={2} className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none resize-none transition-all duration-150 focus:ring-2"
              style={inputStyle}
            />
          </F>

          <F label="Vendor / Service Name *" error={errs.vendorName}>
            <input type="text" name="vendorName" value={form.vendorName} onChange={handleChange}
              placeholder="e.g. Sharma Plumbing Works" className={inp(errs.vendorName)} style={inputStyle} />
          </F>

          <F label="Amount Paid (₹) *" error={errs.cost}>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-sm pointer-events-none" style={{ color: "var(--c-text-3)" }}>₹</span>
              <input type="number" name="cost" value={form.cost} onChange={handleChange}
                placeholder="850"
                className={`pl-8 pr-4 py-2.5 w-full rounded-xl text-sm outline-none transition-all duration-150 ${errs.cost ? "field-error" : "focus:ring-2"}`}
                style={inputStyle} />
            </div>
          </F>

          <div className="grid grid-cols-2 gap-3">
            <F label="Invoice No." optional error={errs.invoiceNo}>
              <input type="text" name="invoiceNo" value={form.invoiceNo} onChange={handleChange}
                placeholder="INV-2024-001" className={inp(errs.invoiceNo)} style={inputStyle} />
            </F>
            <F label="Invoice Date" optional>
              <input type="date" name="invoiceDate" value={form.invoiceDate} onChange={handleChange}
                className={inp(false)} style={inputStyle} />
            </F>
          </div>

          <div
            className="flex items-center gap-2 p-3 rounded-xl text-xs"
            style={{ background: "rgba(245,158,11,0.08)", color: "#92400e", border: "1px solid rgba(245,158,11,0.2)" }}
          >
            <Receipt size={12} className="shrink-0" />
            <span>Your landlord will review this bill and decide to <strong>pay you back</strong> or <strong>adjust from rent</strong>.</span>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: "var(--c-border)" }}>
            <button type="button" onClick={onClose} className="btn-ghost !py-2 !px-4 !text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary !py-2 !px-5 !text-sm">
              {loading
                ? <><Loader2 size={13} className="animate-spin" /> Submitting…</>
                : <><Upload size={13} /> Submit Bill</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Maintenance History for a lease ──────────────────────────────────────────

function MaintenanceHistory({ leaseId }) {
  const dispatch = useDispatch();
  const { requests, loading } = useSelector((s) => s.maintenance);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded) dispatch(fetchMaintenanceRequests(leaseId));
  }, [expanded, leaseId, dispatch]);

  const leaseRequests = requests.filter((r) => r.leaseId === leaseId);

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--c-border)" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors hover:opacity-70"
        style={{ color: "var(--c-text-3)" }}
      >
        <History size={12} />
        Maintenance History
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin" size={16} style={{ color: "var(--c-brand)" }} />
            </div>
          ) : leaseRequests.length === 0 ? (
            <p className="text-xs py-3 text-center" style={{ color: "var(--c-text-4)" }}>No maintenance bills filed yet.</p>
          ) : (
            leaseRequests.map((r) => (
              <div
                key={r.id}
                className="rounded-xl p-3 flex items-start gap-3"
                style={{ background: "var(--c-surface-3)", border: "1px solid var(--c-border)" }}
              >
                <Wrench size={14} className="shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--c-text-1)" }}>{r.description}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: "var(--c-text-4)" }}>
                    <span>{r.vendorName}</span>
                    <span>·</span>
                    <span className="font-semibold" style={{ color: "var(--c-text-2)" }}>₹{r.cost}</span>
                    {r.billCode && <><span>·</span><span className="font-mono">{r.billCode}</span></>}
                  </div>
                  {r.rejectionReason && (
                    <p className="text-[10px] mt-1" style={{ color: "var(--c-error)" }}>Reason: {r.rejectionReason}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TenantDashboard() {
  const dispatch = useDispatch();
  const { activeLeases, pendingInvites, loading, error } = useSelector((s) => s.leases);
  const [payModal, setPayModal] = useState(null);    // lease object or null
  const [maintModal, setMaintModal] = useState(null); // lease object or null

  useEffect(() => {
    dispatch(fetchActiveLeases());
    dispatch(fetchPendingInvites());
  }, [dispatch]);

  const handleApprove = (id) =>
    dispatch(approveLease(id)).then((a) => { if (!a.error) dispatch(fetchActiveLeases()); });
  const handleReject = (id) => dispatch(rejectLease(id));

  return (
    <div className="flex flex-col gap-8 anim-up">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-display font-bold tracking-tight" style={{ color: "var(--c-text-1)" }}>
          Tenant Portal
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-text-3)" }}>
          Manage your rented properties, payments and maintenance
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3.5 rounded-xl text-sm" style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }} role="alert">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Invitations ── */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--c-brand-ring)" }}>
            <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--c-text-1)" }}>
              <MailCheck size={16} style={{ color: "var(--c-brand)" }} />
              Lease Invitations
            </h3>
            <span className="badge" style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)", border: "1px solid var(--c-brand-ring)" }}>
              {pendingInvites.length}
            </span>
          </div>

          {loading && pendingInvites.length === 0 ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={22} style={{ color: "var(--c-brand)" }} /></div>
          ) : pendingInvites.length === 0 ? (
            <Empty icon={MailCheck} msg="No pending invitations right now." />
          ) : (
            <div className="flex flex-col gap-4">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-2xl p-5 transition-all duration-200"
                  style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderLeft: "3px solid var(--c-brand)", boxShadow: "var(--shadow-sm)" }}
                >
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <span className="badge" style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)", border: "1px solid var(--c-brand-ring)" }}>New Invite</span>
                    {inv.createdAt && <span className="text-xs" style={{ color: "var(--c-text-4)" }}>{new Date(inv.createdAt).toLocaleDateString()}</span>}
                  </div>
                  <h4 className="text-base font-bold mb-3" style={{ color: "var(--c-text-1)" }}>{inv.property?.title}</h4>
                  <div className="flex flex-col gap-1.5 mb-4">
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-3)" }}>
                      <MapPin size={13} style={{ color: "var(--c-accent)" }} className="shrink-0" />
                      <span className="truncate">{inv.property?.address}, {inv.property?.city}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <IndianRupee size={13} style={{ color: "var(--c-success)" }} className="shrink-0" />
                      <span className="font-bold" style={{ color: "var(--c-text-1)" }}>₹{inv.property?.rentAmount}</span>
                      <span style={{ color: "var(--c-text-3)" }}>/ month</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-3)" }}>
                      <User size={13} className="shrink-0" style={{ color: "var(--c-text-4)" }} />
                      <span>Landlord: <span className="font-semibold" style={{ color: "var(--c-text-2)" }}>{inv.property?.owner?.name}</span></span>
                    </div>
                  </div>
                  <div className="flex gap-2.5 pt-3 border-t" style={{ borderColor: "var(--c-border)" }}>
                    <button
                      onClick={() => handleApprove(inv.id)}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer disabled:opacity-50 hover:-translate-y-0.5"
                      style={{ background: "var(--c-success)", color: "#fff", border: "none", boxShadow: "0 3px 10px rgba(16,185,129,0.25)" }}
                    >
                      <Check size={13} /> Accept
                    </button>
                    <button
                      onClick={() => handleReject(inv.id)}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer disabled:opacity-50 hover:-translate-y-0.5"
                      style={{ background: "var(--c-surface-3)", color: "var(--c-text-3)", border: "1.5px solid var(--c-border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-error-subtle, #fef2f2)"; e.currentTarget.style.color = "var(--c-error)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--c-surface-3)"; e.currentTarget.style.color = "var(--c-text-3)"; }}
                    >
                      <X size={13} /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Active Leases ── */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "rgba(16,185,129,0.25)" }}>
            <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--c-text-1)" }}>
              <Key size={16} style={{ color: "var(--c-success)" }} />
              Active Leases
            </h3>
            <span className="badge" style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)", border: "1px solid rgba(16,185,129,0.2)" }}>
              {activeLeases.length}
            </span>
          </div>

          {loading && activeLeases.length === 0 ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={22} style={{ color: "var(--c-brand)" }} /></div>
          ) : activeLeases.length === 0 ? (
            <Empty icon={Key} msg="No active leases. Ask your landlord to invite you!" />
          ) : (
            <div className="flex flex-col gap-4">
              {activeLeases.map((lease) => (
                <div
                  key={lease.id}
                  className="rounded-2xl p-5 transition-all duration-200"
                  style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderLeft: "3px solid var(--c-success)", boxShadow: "var(--shadow-sm)" }}
                >
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <span className="badge" style={{ background: "rgba(14,165,233,0.1)", color: "var(--c-accent)", border: "1px solid rgba(14,165,233,0.2)" }}>Renting</span>
                    <span className="badge" style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)", border: "1px solid rgba(16,185,129,0.2)" }}>Active</span>
                  </div>

                  <h4 className="text-base font-bold mb-3" style={{ color: "var(--c-text-1)" }}>{lease.property?.title}</h4>

                  <div className="flex flex-col gap-1.5 mb-4">
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-3)" }}>
                      <MapPin size={13} style={{ color: "var(--c-accent)" }} className="shrink-0" />
                      <span className="truncate">{lease.property?.address}, {lease.property?.city}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <IndianRupee size={13} style={{ color: "var(--c-success)" }} className="shrink-0" />
                      <span className="font-bold" style={{ color: "var(--c-text-1)" }}>₹{lease.property?.rentAmount?.toLocaleString()}</span>
                      <span style={{ color: "var(--c-text-3)" }}>/ month</span>
                    </div>
                    {(lease.rentCredits || 0) > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <RotateCcw size={13} style={{ color: "var(--c-success)" }} className="shrink-0" />
                        <span style={{ color: "var(--c-success)" }} className="font-semibold">
                          ₹{lease.rentCredits} maintenance credit applied
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2.5 pt-3 border-t" style={{ borderColor: "var(--c-border)" }}>
                    <button
                      id={`pay-rent-${lease.id}`}
                      onClick={() => setPayModal(lease)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
                      style={{ background: "var(--c-success)", color: "#fff", boxShadow: "0 3px 10px rgba(16,185,129,0.25)" }}
                    >
                      <CreditCard size={13} /> Pay Rent
                    </button>
                    <button
                      id={`file-maintenance-${lease.id}`}
                      onClick={() => setMaintModal(lease)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
                      style={{ background: "rgba(245,158,11,0.1)", color: "#92400e", border: "1.5px solid rgba(245,158,11,0.3)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f59e0b"; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.1)"; e.currentTarget.style.color = "#92400e"; }}
                    >
                      <Wrench size={13} /> File Repair
                    </button>
                  </div>

                  {/* Maintenance history accordion */}
                  <MaintenanceHistory leaseId={lease.id} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      {payModal   && <PayRentModal      lease={payModal}   onClose={() => setPayModal(null)} />}
      {maintModal && <FileMaintenanceModal lease={maintModal} onClose={() => setMaintModal(null)} />}
    </div>
  );
}
