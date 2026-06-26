import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginUser, clearAuthError, setOtpEmail } from "../store/authSlice";
import { Mail, Lock, AlertCircle, Loader2, Building2, ArrowRight } from "lucide-react";

export default function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errs, setErrs] = useState({});
  const { loading, error, user } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => { dispatch(clearAuthError()); }, [dispatch]);
  useEffect(() => { if (user) navigate("/dashboard"); }, [user, navigate]);

  const validate = () => {
    const e = {};
    if (!formData.email) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = "Enter a valid email";
    if (!formData.password) e.password = "Password is required";
    else if (formData.password.length < 6) e.password = "At least 6 characters";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (errs[name]) setErrs((p) => ({ ...p, [name]: "" }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    dispatch(loginUser(formData)).then((action) => {
      if (action.error) {
        if (action.payload?.includes("verify your email")) {
          dispatch(setOtpEmail(formData.email));
          navigate("/verify-otp");
        }
      } else {
        navigate("/dashboard");
      }
    });
  };

  return (
    <div
      className="flex-1 flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: "var(--c-bg)" }}
    >
      {/* Background glow */}
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="w-full max-w-[420px] relative anim-up">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "linear-gradient(135deg, var(--c-brand) 0%, var(--c-accent) 100%)",
              boxShadow: "var(--shadow-brand-lg)",
            }}
          >
            <Building2 size={26} className="text-white" strokeWidth={2.5} />
          </div>
          <h1
            className="text-2xl font-display font-bold tracking-tight"
            style={{ color: "var(--c-text-1)" }}
          >
            Welcome back
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--c-text-3)" }}>
            Sign in to manage your properties
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
          {/* Error banner */}
          {error && (
            <div
              className="flex items-start gap-2.5 p-3.5 rounded-xl mb-6 text-sm"
              style={{ background: "var(--c-error-subtle, #fef2f2)", color: "var(--c-error)", border: "1px solid rgba(239,68,68,0.2)" }}
              role="alert"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
                Email Address
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--c-text-4)" }} />
                <input
                  type="email" name="email" id="email"
                  value={formData.email} onChange={handleChange}
                  placeholder="you@example.com"
                  className={`field ${errs.email ? "field-error" : ""}`}
                  aria-invalid={!!errs.email}
                  required
                />
              </div>
              {errs.email && <span className="text-xs font-medium" style={{ color: "var(--c-error)" }}>{errs.email}</span>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--c-text-4)" }} />
                <input
                  type="password" name="password" id="password"
                  value={formData.password} onChange={handleChange}
                  placeholder="••••••••"
                  className={`field ${errs.password ? "field-error" : ""}`}
                  aria-invalid={!!errs.password}
                  required
                />
              </div>
              {errs.password && <span className="text-xs font-medium" style={{ color: "var(--c-error)" }}>{errs.password}</span>}
            </div>

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-1 !py-3"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /><span>Signing in…</span></>
              ) : (
                <><span>Sign In</span><ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: "var(--c-text-3)" }}>
            Don't have an account?{" "}
            <Link
              to="/register"
              className="font-bold transition-colors hover:opacity-80"
              style={{ color: "var(--c-brand)" }}
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
