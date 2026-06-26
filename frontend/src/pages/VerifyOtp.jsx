import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { verifyOtp, resendOtp, clearAuthError, clearSuccessMessage } from "../store/authSlice";
import { ShieldCheck, Mail, Loader2, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

export default function VerifyOtp() {
  const { otpEmail, loading, error, successMessage } = useSelector((s) => s.auth);
  const [emailInput, setEmailInput] = useState(otpEmail || "");
  const [otp, setOtp] = useState("");
  const [errs, setErrs] = useState({});
  const [cooldown, setCooldown] = useState(0);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => { dispatch(clearAuthError()); dispatch(clearSuccessMessage()); }, [dispatch]);
  useEffect(() => { if (otpEmail) setEmailInput(otpEmail); }, [otpEmail]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validate = () => {
    const e = {};
    if (!emailInput) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(emailInput)) e.email = "Enter a valid email";
    if (!otp) e.otp = "Verification code is required";
    else if (!/^[0-9]{6}$/.test(otp)) e.otp = "Must be exactly 6 digits";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleVerify = (e) => {
    e.preventDefault();
    if (!validate()) return;
    dispatch(verifyOtp({ email: emailInput, otp })).then((action) => {
      if (!action.error) setTimeout(() => navigate("/login"), 1500);
    });
  };

  const handleResend = () => {
    if (!emailInput || !/\S+@\S+\.\S+/.test(emailInput)) {
      setErrs({ email: "Enter a valid email to resend" });
      return;
    }
    dispatch(resendOtp(emailInput)).then((action) => {
      if (!action.error) setCooldown(30);
    });
  };

  return (
    <div
      className="flex-1 flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: "var(--c-bg)" }}
    >
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="w-full max-w-[420px] relative anim-up">

        {/* Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "var(--c-brand-subtle)",
              border: "2px solid var(--c-brand-ring)",
              boxShadow: "var(--shadow-brand)",
            }}
          >
            <ShieldCheck size={30} style={{ color: "var(--c-brand)" }} strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight" style={{ color: "var(--c-text-1)" }}>
            Verify Your Email
          </h1>
          <p className="text-sm mt-2 px-4" style={{ color: "var(--c-text-3)" }}>
            {otpEmail ? (
              <><span className="font-semibold" style={{ color: "var(--c-text-2)" }}>{otpEmail}</span> — enter the 6‑digit code we sent.</>
            ) : (
              "Enter your email and the verification code we sent."
            )}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2.5 p-3.5 rounded-xl mb-5 text-sm"
              style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }}
              role="alert"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {successMessage && (
            <div
              className="flex items-start gap-2.5 p-3.5 rounded-xl mb-5 text-sm"
              style={{ background: "var(--c-success-subtle, #ecfdf5)", color: "var(--c-success)", border: "1px solid rgba(16,185,129,0.2)" }}
            >
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleVerify} noValidate className="flex flex-col gap-6">

            {/* Email — only if not pre-filled */}
            {!otpEmail && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--c-text-4)" }} />
                  <input
                    type="email" value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); if (errs.email) setErrs((p) => ({ ...p, email: "" })); }}
                    placeholder="you@example.com"
                    className={`field ${errs.email ? "field-error" : ""}`}
                  />
                </div>
                {errs.email && <span className="text-xs font-medium" style={{ color: "var(--c-error)" }}>{errs.email}</span>}
              </div>
            )}

            {/* OTP input */}
            <div className="flex flex-col items-center gap-3">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
                6-Digit Code
              </label>
              <input
                type="text" value={otp}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  if (v.length <= 6) { setOtp(v); if (errs.otp) setErrs((p) => ({ ...p, otp: "" })); }
                }}
                placeholder="000000"
                maxLength={6}
                className={`w-[200px] text-center text-3xl font-bold tracking-[0.55rem] py-3.5 rounded-xl outline-none transition-all duration-150 ${errs.otp ? "field-error" : ""}`}
                style={{
                  background: "var(--c-surface-2)",
                  border: `2px solid ${errs.otp ? "var(--c-error)" : "var(--c-border)"}`,
                  color: "var(--c-text-1)",
                  fontFamily: "var(--font-display)",
                }}
                onFocus={(e) => {
                  if (!errs.otp) e.target.style.borderColor = "var(--c-brand)";
                  e.target.style.boxShadow = "0 0 0 3px var(--c-brand-ring)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = errs.otp ? "var(--c-error)" : "var(--c-border)";
                  e.target.style.boxShadow = "none";
                }}
              />
              {errs.otp && <span className="text-xs font-medium" style={{ color: "var(--c-error)" }}>{errs.otp}</span>}
            </div>

            <button
              id="verify-otp-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full !py-3"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /><span>Verifying…</span></>
              ) : (
                <><ShieldCheck size={16} /><span>Verify Code</span></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm" style={{ color: "var(--c-text-3)" }}>
            Didn't receive it?{" "}
            {cooldown > 0 ? (
              <span className="font-bold" style={{ color: "var(--c-text-2)" }}>Resend in {cooldown}s</span>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading}
                className="inline-flex items-center gap-1 font-bold transition-colors cursor-pointer bg-transparent border-none disabled:opacity-50"
                style={{ color: "var(--c-brand)" }}
              >
                <RefreshCw size={12} /> Resend OTP
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
