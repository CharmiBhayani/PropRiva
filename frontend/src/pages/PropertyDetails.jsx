import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchPropertyDetails, clearCurrentProperty } from "../store/propertiesSlice";
import { inviteTenant, clearInviteSuccess, clearLeaseError } from "../store/leasesSlice";
import { fetchPropertyAnalysis, clearPropertyAnalysis } from "../store/advisorySlice";
import {
  Building2, MapPin, DollarSign, ArrowLeft,
  Send, CheckCircle2, AlertCircle, Loader2, Mail,
  Users, Clock, XCircle, User, Sparkles, Gauge,
  TrendingUp, ShieldAlert, Award, FileText, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";

export default function PropertyDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { currentProperty, loading: propLoading, error: propError } = useSelector((s) => s.properties);
  const { loading: inviteLoading, error: inviteError, inviteSuccess } = useSelector((s) => s.leases);
  const { data: analysis, loading: analysisLoading, error: analysisError } = useSelector((s) => s.advisory.property);
  const [tenantEmail, setTenantEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [showMlPanel, setShowMlPanel] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  // Helper: format as INR
  const fmtINR = (v) => {
    if (!v && v !== 0) return "N/A";
    return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  };

  const [mlForm, setMlForm] = useState({
    property_type:   "Residential Apartment",
    zip_code:        "Thane", // represents Locality/City
    bedrooms:        2,
    furnishing:      1.0,
    age:             5,
    total_floors:    7,
    floors:          3,
    balconies:       1,
    sqft:            1000,
    listed_price:    "",
  });

  useEffect(() => {
    dispatch(fetchPropertyDetails(Number(id)));
    return () => {
      dispatch(clearCurrentProperty());
      dispatch(clearInviteSuccess());
      dispatch(clearLeaseError());
      dispatch(clearPropertyAnalysis());
    };
  }, [dispatch, id]);

  useEffect(() => {
    if (currentProperty) {
      // Use pincode (storing Locality) or city
      const zip_code = currentProperty.pincode || currentProperty.city || "Thane";
      const estPrice = currentProperty.listedPrice ? String(currentProperty.listedPrice) : "";
      setMlForm((prev) => ({
        ...prev,
        zip_code,
        listed_price: estPrice,
      }));
    }
  }, [currentProperty]);

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
                {currentProperty.address}, {currentProperty.city}, {currentProperty.state}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: "rgba(16,185,129,0.1)", color: "var(--c-success)" }}
            >
              <span className="font-bold text-lg" style={{ color: "var(--c-success)" }}>₹</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: "var(--c-text-4)" }}>
                Monthly Rent
              </span>
              <span className="text-xl font-display font-bold" style={{ color: "var(--c-text-1)" }}>
                ₹{currentProperty.rentAmount?.toLocaleString("en-IN")}
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

      {/* ── AI Property Valuation & Advisory ── */}
      <div className="rounded-2xl p-6" style={cardStyle}>
        <div className="flex items-center justify-between pb-3 border-b mb-5" style={{ borderColor: "var(--c-border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(37,99,235,0.12)", color: "var(--c-brand)" }}>
              <Sparkles size={16} />
            </div>
            <h2 className="text-base font-bold" style={{ color: "var(--c-text-1)" }}>
              AI Property Valuation & Investment Advisor
            </h2>
          </div>
          <button
            onClick={() => setShowMlPanel(!showMlPanel)}
            className="btn-ghost !py-1.5 !px-3 !text-xs flex items-center gap-1"
          >
            {showMlPanel ? "Hide Section" : "Show Section"}
            {showMlPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {showMlPanel && (
          <div className="flex flex-col gap-6">
            {/* Description */}
            <p className="text-xs" style={{ color: "var(--c-text-3)" }}>
              Get ML-powered Mumbai property valuations (₹), rental estimates, appreciation forecasts, risk analysis, and AI investment narrative using models M1–M6 trained on Mumbai real estate data.
            </p>

            {/* Input Config Form */}
            <div className="rounded-xl border p-4" style={{ background: "var(--c-surface-2)", borderColor: "var(--c-border)" }}>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-3 cursor-pointer"
                style={{ color: "var(--c-text-2)" }}
              >
                <span>1. Configure Mumbai Property Parameters</span>
                {showConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showConfig && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">

                  {/* Property Type */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Property Type</label>
                    <select
                      id="property-type"
                      value={mlForm.property_type}
                      onChange={(e) => setMlForm({ ...mlForm, property_type: e.target.value })}
                      className="field !pl-4 !py-1.5"
                    >
                      {[
                        'Residential Apartment', 'Independent House/Villa', 
                        'Independent/Builder Floor', 'Serviced Apartments', 'Studio Apartment'
                      ].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* Locality */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Locality</label>
                    <select
                      id="locality"
                      value={mlForm.zip_code}
                      onChange={(e) => setMlForm({ ...mlForm, zip_code: e.target.value })}
                      className="field !pl-4 !py-1.5"
                    >
                      {[
                        'Central Mumbai suburbs', 'Mira Road And Beyond', 'Mumbai Andheri-Dahisar', 
                        'Mumbai Beyond Thane', 'Mumbai Harbour', 'Mumbai South West', 
                        'Navi Mumbai', 'South Mumbai', 'Thane'
                      ].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* Bedrooms */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Bedrooms (BHK)</label>
                    <select
                      id="bedrooms"
                      value={mlForm.bedrooms}
                      onChange={(e) => setMlForm({ ...mlForm, bedrooms: parseInt(e.target.value) })}
                      className="field !pl-4 !py-1.5"
                    >
                      {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v} BHK</option>)}
                    </select>
                  </div>

                  {/* Furnishing */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Furnishing</label>
                    <select
                      id="furnishing"
                      value={mlForm.furnishing}
                      onChange={(e) => setMlForm({ ...mlForm, furnishing: parseFloat(e.target.value) })}
                      className="field !pl-4 !py-1.5"
                    >
                      {[
                        [0, "Unfurnished"],
                        [1, "Semi-Furnished"],
                        [2, "Furnished"],
                        [3, "Fully Furnished"],
                        [4, "Luxury Furnished"]
                      ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>

                  {/* Property Age */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Property Age (Years)</label>
                    <input
                      id="property-age"
                      type="number" min="0" max="100"
                      value={mlForm.age}
                      onChange={(e) => setMlForm({ ...mlForm, age: e.target.value === '' ? '' : parseInt(e.target.value) })}
                      className="field !pl-4 !py-1.5"
                    />
                  </div>

                  {/* Total Floors */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Total Floors</label>
                    <input
                      id="total-floors"
                      type="number" min="1" max="100"
                      value={mlForm.total_floors}
                      onChange={(e) => setMlForm({ ...mlForm, total_floors: e.target.value === '' ? '' : parseInt(e.target.value) })}
                      className="field !pl-4 !py-1.5"
                    />
                  </div>

                  {/* Floor Number */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Floor Number</label>
                    <input
                      id="floor-number"
                      type="number" min="0" max="100"
                      value={mlForm.floors}
                      onChange={(e) => setMlForm({ ...mlForm, floors: e.target.value === '' ? '' : parseInt(e.target.value) })}
                      className="field !pl-4 !py-1.5"
                    />
                  </div>

                  {/* Balconies */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Balconies</label>
                    <select
                      id="balconies"
                      value={mlForm.balconies}
                      onChange={(e) => setMlForm({ ...mlForm, balconies: parseInt(e.target.value) })}
                      className="field !pl-4 !py-1.5"
                    >
                      {[0, 1, 2, 3, 4].map((v) => <option key={v} value={v}>{v} Balconies</option>)}
                    </select>
                  </div>

                  {/* Area */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Area (sq.ft.)</label>
                    <input
                      id="area-sqft"
                      type="number"
                      value={mlForm.sqft}
                      onChange={(e) => setMlForm({ ...mlForm, sqft: e.target.value === '' ? '' : parseInt(e.target.value) })}
                      className="field !pl-4 !py-1.5"
                    />
                  </div>

                  {/* Listed Price */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-3)" }}>Listed Price (₹) *</label>
                    <input
                      id="listed-price"
                      type="number"
                      value={mlForm.listed_price}
                      onChange={(e) => setMlForm({ ...mlForm, listed_price: e.target.value })}
                      placeholder="e.g. 12000000"
                      className="field !pl-4 !py-1.5"
                      required
                    />
                  </div>

                </div>
              )}

              <div className="flex justify-end gap-3 mt-4 pt-3 border-t" style={{ borderColor: "var(--c-border)" }}>
                <button
                  type="button"
                  onClick={() => dispatch(clearPropertyAnalysis())}
                  className="btn-ghost !py-1.5 !px-4 !text-xs"
                >
                  Clear Results
                </button>
                <button
                  id="run-ai-analysis"
                  type="button"
                  disabled={analysisLoading}
                  onClick={() => {
                    dispatch(fetchPropertyAnalysis({
                      property_type:   mlForm.property_type,
                      zip_code:        mlForm.zip_code, // represents Locality
                      bedrooms:        parseInt(mlForm.bedrooms),
                      furnishing:      parseFloat(mlForm.furnishing),
                      age:             parseInt(mlForm.age),
                      total_floors:    parseInt(mlForm.total_floors),
                      floors:          parseInt(mlForm.floors),
                      balconies:       parseInt(mlForm.balconies),
                      sqft:            parseInt(mlForm.sqft),
                      listed_price:    mlForm.listed_price ? parseFloat(mlForm.listed_price) : null,
                    }));
                    setShowConfig(false);
                  }}
                  className="btn-primary !py-1.5 !px-5 !text-xs"
                >
                  {analysisLoading ? (
                    <><Loader2 size={12} className="animate-spin" /> Running AI...</>
                  ) : (
                    <><Sparkles size={12} /> Run AI Valuation Analysis</>
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {analysisError && (
              <div className="flex items-start gap-2 p-3.5 rounded-xl text-xs" style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)" }}>
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}

            {/* Results Output */}
            {analysis && (
              <div className="flex flex-col gap-5 anim-up">
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
                  2. Analysis Reports
                </h3>

                {/* Mumbai Scorecards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {/* Estimated Value ₹ */}
                  <div className="rounded-xl p-4 border flex flex-col gap-1.5" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <div className="flex items-center gap-1.5" style={{ color: "var(--c-text-3)" }}>
                      <Gauge size={13} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Estimated Value</span>
                    </div>
                    <span className="text-lg font-bold" style={{ color: "var(--c-text-1)" }}>
                      {fmtINR(analysis.m1?.estimated_value)}
                    </span>
                    {analysis.m1?.ci_low && (
                      <span className="text-[9px]" style={{ color: "var(--c-text-4)" }}>
                        Range: {fmtINR(analysis.m1.ci_low)} – {fmtINR(analysis.m1.ci_high)}
                      </span>
                    )}
                    {analysis.m1?.overvalued_flag && analysis.m1.overvalued_flag !== "fair" && (
                      <span className="text-[9px] font-semibold" style={{ color: analysis.m1.overvalued_flag === "overvalued" ? "var(--c-error)" : "var(--c-success)" }}>
                        {analysis.m1.overvalued_flag === "overvalued" ? "⬆ Overvalued" : "⬇ Undervalued"} by {Math.abs(analysis.m1.gap_pct).toFixed(1)}%
                      </span>
                    )}
                  </div>

                  {/* Estimated Rent ₹/mo */}
                  <div className="rounded-xl p-4 border flex flex-col gap-1.5" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <div className="flex items-center gap-1.5" style={{ color: "var(--c-text-3)" }}>
                      <span className="font-bold text-xs" style={{ color: "var(--c-text-3)" }}>₹</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">Est. Monthly Rent</span>
                    </div>
                    <span className="text-lg font-bold" style={{ color: "var(--c-text-1)" }}>
                      {fmtINR(analysis.m2?.monthly_rent)}<span className="text-xs font-normal">/mo</span>
                    </span>
                    {analysis.m2?.gross_yield && (
                      <span className="text-[9px]" style={{ color: "var(--c-text-4)" }}>
                        Gross Yield: {analysis.m2.gross_yield.toFixed(1)}% · Net: {analysis.m2.net_yield?.toFixed(1)}%
                      </span>
                    )}
                    <span className="text-[9px]" style={{ color: "var(--c-text-4)" }}>
                      Avg Mumbai Yield: 2–3.5% p.a.
                    </span>
                  </div>

                  {/* Appreciation */}
                  <div className="rounded-xl p-4 border flex flex-col gap-1.5" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <div className="flex items-center gap-1.5" style={{ color: "var(--c-text-3)" }}>
                      <TrendingUp size={13} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Appreciation (12m)</span>
                    </div>
                    <span className="text-lg font-bold" style={{ color: "var(--c-success)" }}>
                      {analysis.m3?.appreciation_12m_pct !== undefined ? (
                        `+${(analysis.m3.appreciation_12m_pct).toFixed(1)}%`
                      ) : (
                        "N/A"
                      )}
                    </span>
                    <div className="text-xs text-slate-500 mt-1">
                      {analysis.m3?.appreciation_3m_pct !== undefined && (
                        <div className="mb-0.5">3m forecast: +{analysis.m3.appreciation_3m_pct.toFixed(1)}%</div>
                      )}
                      {analysis.m3?.appreciation_6m_pct !== undefined && (
                        <div className="mb-0.5">6m forecast: +{analysis.m3.appreciation_6m_pct.toFixed(1)}%</div>
                      )}
                      {analysis.m3?.appreciation_9m_pct !== undefined && (
                        <div className="mb-0.5">9m forecast: +{analysis.m3.appreciation_9m_pct.toFixed(1)}%</div>
                      )}
                      {analysis.m3?.ci_low_12m && analysis.m3?.ci_high_12m && (
                        <div>
                          12m Range: ₹{analysis.m3.ci_low_12m.toLocaleString('en-IN')} - ₹{analysis.m3.ci_high_12m.toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                    {analysis.m3?.confidence_band && (
                      <span className="text-[9px]" style={{ color: "var(--c-text-4)" }}>
                        Confidence: {analysis.m3.confidence_band}
                      </span>
                    )}
                  </div>

                  {/* Investment Grade */}
                  <div className="rounded-xl p-4 border flex flex-col gap-1.5" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <div className="flex items-center gap-1.5" style={{ color: "var(--c-text-3)" }}>
                      <Award size={13} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Investment Grade</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold uppercase" style={{ color: "var(--c-brand)" }}>
                        {analysis.m5?.grade || "N/A"}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--c-brand-subtle)", color: "var(--c-brand)" }}>
                        {analysis.m5?.signal || "HOLD"}
                      </span>
                    </div>
                    <span className="text-[9px]" style={{ color: "var(--c-text-4)" }}>
                      Risk Tier: <strong style={{ color: "var(--c-text-2)" }}>{analysis.m6?.risk_tier || "Low"}</strong> (score {Math.round(analysis.m6?.risk_score || 0)})
                    </span>
                  </div>
                </div>

                {/* Narrative Assessment */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Thesis Narrative */}
                  {analysis.m5?.narrative && (
                    <div className="rounded-xl p-4 border flex flex-col gap-2" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--c-text-2)" }}>
                        <FileText size={12} style={{ color: "var(--c-brand)" }} />
                        AI Investment Thesis
                      </h4>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-2)" }}>
                        {analysis.m5.narrative}
                      </p>
                    </div>
                  )}

                  {/* Risk Factors */}
                  <div className="rounded-xl p-4 border flex flex-col gap-2" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--c-text-2)" }}>
                      <ShieldAlert size={12} style={{ color: "var(--c-error)" }} />
                      AI Risk Assessment
                    </h4>
                    {analysis.m6?.narrative ? (
                      <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-2)" }}>
                        {analysis.m6.narrative}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5 mt-1">
                        {analysis.m6?.top_factors?.map((f, i) => (
                          <div key={i} className="flex justify-between items-center text-[11px]">
                            <span style={{ color: "var(--c-text-3)" }}>{f}</span>
                            <span className="font-semibold" style={{ color: "var(--c-error)" }}>
                              {analysis.m6.factor_contributions?.[f]?.toFixed(1)}% contribution
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
