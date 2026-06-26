import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchPropertyDetails, clearCurrentProperty } from "../store/propertiesSlice";
import { inviteTenant, clearInviteSuccess, clearLeaseError } from "../store/leasesSlice";
import {
  Building2, MapPin, IndianRupee, ArrowLeft,
  Send, CheckCircle2, AlertCircle, Loader2, Mail,
  Users, Clock, XCircle, User,
} from "lucide-react";

export default function PropertyDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { currentProperty, loading: propLoading, error: propError } = useSelector((s) => s.properties);
  const { loading: inviteLoading, error: inviteError, inviteSuccess } = useSelector((s) => s.leases);
  const [tenantEmail, setTenantEmail] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    dispatch(fetchPropertyDetails(Number(id)));
    return () => {
      dispatch(clearCurrentProperty());
      dispatch(clearInviteSuccess());
      dispatch(clearLeaseError());
    };
  }, [dispatch, id]);

  const handleInvite = (e) => {
    e.preventDefault();
    setFormError("");
    dispatch(clearInviteSuccess());
    dispatch(clearLeaseError());
    if (!tenantEmail.trim()) { setFormError("Tenant email is required"); return; }
    if (!/\S+@\S+\.\S+/.test(tenantEmail)) { setFormError("Enter a valid email address"); return; }
    dispatch(inviteTenant({ propertyId: Number(id), tenantEmail })).then((action) => {
      if (!action.error) {
        setTenantEmail("");
        dispatch(fetchPropertyDetails(Number(id)));
      }
    });
  };

  /* Loading */
  if (propLoading && !currentProperty) {
    return (
      <div className="flex-1 flex justify-center items-center py-32">
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--c-brand)" }} />
      </div>
    );
  }

  /* Error */
  if (propError || !currentProperty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center anim-up">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)" }}
        >
          <AlertCircle size={30} />
        </div>
        <h2 className="text-2xl font-display font-bold mb-2" style={{ color: "var(--c-text-1)" }}>
          Error Loading Property
        </h2>
        <p className="mb-7" style={{ color: "var(--c-text-3)" }}>{propError || "Property not found"}</p>
        <Link to="/dashboard" className="btn-primary">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const activeLease   = currentProperty.leases?.find((l) => l.status === "ACTIVE");
  const pendingLeases = currentProperty.leases?.filter((l) => l.status === "PENDING") || [];
  const pastLeases    = currentProperty.leases?.filter((l) => l.status === "REJECTED") || [];

  const cardStyle = {
    background: "var(--c-surface)",
    border: "1px solid var(--c-border)",
    boxShadow: "var(--shadow-sm)",
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex flex-col gap-6 flex-1 anim-up">

      {/* Back */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-bold transition-colors w-fit hover:-translate-x-0.5 transition-transform"
        style={{ color: "var(--c-text-3)" }}
        onMouseEnter={(e) => e.currentTarget.style.color = "var(--c-brand)"}
        onMouseLeave={(e) => e.currentTarget.style.color = "var(--c-text-3)"}
      >
        <ArrowLeft size={14} /> Back to Dashboard
      </Link>

      {/* ── Property Header Card ── */}
      <div className="rounded-2xl p-6 sm:p-8" style={cardStyle}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)" }}
            >
              <Building2 size={24} strokeWidth={2} />
            </div>
            <div>
              <h1
                className="text-2xl sm:text-3xl font-display font-bold tracking-tight leading-tight"
                style={{ color: "var(--c-text-1)" }}
              >
                {currentProperty.title}
              </h1>
              {currentProperty.description && (
                <p className="text-sm mt-2 leading-relaxed max-w-2xl" style={{ color: "var(--c-text-3)" }}>
                  {currentProperty.description}
                </p>
              )}
            </div>
          </div>
          <span
            className="badge self-start shrink-0"
            style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)", border: "1px solid rgba(16,185,129,0.2)" }}
          >
            <CheckCircle2 size={10} /> Active
          </span>
        </div>

        {/* Detail grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t"
          style={{ borderColor: "var(--c-border)" }}
        >
          <div className="flex items-start gap-3.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: "var(--c-accent-subtle, #f0f9ff)", color: "var(--c-accent)" }}
            >
              <MapPin size={17} strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: "var(--c-text-4)" }}>
                Location
              </span>
              <span className="text-sm font-semibold leading-relaxed" style={{ color: "var(--c-text-1)" }}>
                {currentProperty.address}, {currentProperty.city}, {currentProperty.state} – {currentProperty.pincode}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)" }}
            >
              <IndianRupee size={17} strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: "var(--c-text-4)" }}>
                Monthly Rent
              </span>
              <span className="text-xl font-display font-bold" style={{ color: "var(--c-text-1)" }}>
                ₹{currentProperty.rentAmount?.toLocaleString()}
                <span className="text-xs font-semibold ml-1" style={{ color: "var(--c-text-4)" }}>/ month</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lease + History Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">

        {/* Lease Status / Invite */}
        <div className="rounded-2xl p-6 flex flex-col gap-5" style={cardStyle}>
          <h2
            className="text-base font-bold flex items-center gap-2 pb-3 border-b"
            style={{ color: "var(--c-text-1)", borderColor: "var(--c-border)" }}
          >
            <Users size={16} style={{ color: "var(--c-text-3)" }} />
            Lease Status
          </h2>

          {activeLease ? (
            <div className="flex flex-col gap-4">
              <span
                className="badge w-fit"
                style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)", border: "1px solid rgba(16,185,129,0.2)" }}
              >
                <CheckCircle2 size={10} /> Active Lease
              </span>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl p-4"
                style={{ background: "var(--c-surface-2)", border: "1px solid var(--c-border)" }}
              >
                {[
                  { label: "Tenant Name",  val: activeLease.tenant?.name  },
                  { label: "Tenant Email", val: activeLease.tenant?.email },
                  ...(activeLease.tenant?.phone ? [{ label: "Phone", val: activeLease.tenant.phone, full: true }] : []),
                ].map(({ label, val, full }) => (
                  <div key={label} className={full ? "sm:col-span-2" : ""}>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: "var(--c-text-4)" }}>
                      {label}
                    </span>
                    <span className="text-sm font-semibold break-all" style={{ color: "var(--c-text-1)" }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div
                className="flex items-center gap-2 text-sm p-3.5 rounded-xl"
                style={{ background: "var(--c-surface-3)", color: "var(--c-text-3)", border: "1px solid var(--c-border)" }}
              >
                <AlertCircle size={14} className="shrink-0" />
                <span>No active tenant lease registered.</span>
              </div>

              <form onSubmit={handleInvite} noValidate className="flex flex-col gap-3">
                <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--c-text-2)" }}>
                  <Send size={13} style={{ color: "var(--c-brand)" }} />
                  Invite a Tenant
                </h3>

                {inviteError && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl text-xs"
                    style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }}
                    role="alert"
                  >
                    <AlertCircle size={12} className="shrink-0" />
                    <span>{inviteError}</span>
                  </div>
                )}
                {inviteSuccess && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl text-xs"
                    style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)", border: "1px solid rgba(16,185,129,0.2)" }}
                  >
                    <CheckCircle2 size={12} className="shrink-0" />
                    <span>Invitation sent successfully!</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
                    Tenant's Email
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--c-text-4)" }} />
                    <input
                      type="email" id="tenantEmail" value={tenantEmail}
                      onChange={(e) => { setTenantEmail(e.target.value); if (formError) setFormError(""); }}
                      placeholder="tenant@example.com"
                      className={`field ${formError ? "field-error" : ""}`}
                    />
                  </div>
                  {formError && <span className="text-xs font-medium" style={{ color: "var(--c-error)" }}>{formError}</span>}
                </div>

                <button
                  id="send-invite"
                  type="submit"
                  disabled={inviteLoading}
                  className="btn-primary w-full !py-2.5 !text-sm mt-1"
                >
                  {inviteLoading
                    ? <><Loader2 size={14} className="animate-spin" /><span>Sending…</span></>
                    : <><Send size={13} /><span>Send Lease Invitation</span></>}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Invitation History */}
        <div className="rounded-2xl p-6 flex flex-col gap-5" style={cardStyle}>
          <h2
            className="text-base font-bold flex items-center gap-2 pb-3 border-b"
            style={{ color: "var(--c-text-1)", borderColor: "var(--c-border)" }}
          >
            <Clock size={16} style={{ color: "var(--c-text-3)" }} />
            Invitation History
          </h2>

          {pendingLeases.length === 0 && pastLeases.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <User size={26} className="mb-2" style={{ color: "var(--c-text-4)" }} />
              <p className="text-sm" style={{ color: "var(--c-text-3)" }}>No pending or past invitations found.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {pendingLeases.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3
                    className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: "var(--c-text-4)" }}
                  >
                    <Clock size={10} /> Pending Invites
                  </h3>
                  {pendingLeases.map((l) => (
                    <div
                      key={l.id}
                      className="flex justify-between items-center gap-3 p-3.5 rounded-xl"
                      style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}
                    >
                      <div className="min-w-0">
                        <span className="block text-sm font-bold truncate" style={{ color: "var(--c-text-1)" }}>{l.tenant?.email}</span>
                        <span className="block text-xs" style={{ color: "var(--c-text-4)" }}>
                          Sent: {new Date(l.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="badge shrink-0" style={{ background: "rgba(245,158,11,0.1)", color: "var(--c-warning)", border: "1px solid rgba(245,158,11,0.25)" }}>
                        Pending
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {pastLeases.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3
                    className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: "var(--c-text-4)" }}
                  >
                    <XCircle size={10} /> Declined
                  </h3>
                  {pastLeases.map((l) => (
                    <div
                      key={l.id}
                      className="flex justify-between items-center gap-3 p-3.5 rounded-xl opacity-70"
                      style={{ background: "var(--c-surface-3)", border: "1px solid var(--c-border)" }}
                    >
                      <span className="block text-sm font-semibold truncate min-w-0" style={{ color: "var(--c-text-3)" }}>
                        {l.tenant?.email}
                      </span>
                      <span className="badge shrink-0" style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        Declined
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
