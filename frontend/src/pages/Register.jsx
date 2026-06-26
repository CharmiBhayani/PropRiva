import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { registerUser, clearAuthError } from "../store/authSlice";
import {
  Mail, Lock, User, Phone, Briefcase, Calendar,
  AlertCircle, Loader2, Building2, ArrowRight,
} from "lucide-react";

const Field = ({ label, optional, icon: Icon, error, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
      {label}{optional && <span className="normal-case font-medium ml-1" style={{ color: "var(--c-text-4)" }}>(optional)</span>}
    </label>
    <div className="relative">
      <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--c-text-4)" }} />
      {children}
    </div>
    {error && <span className="text-xs font-medium" style={{ color: "var(--c-error)" }}>{error}</span>}
  </div>
);

export default function Register() {
  const [formData, setFormData] = useState({
    name: "", email: "", password: "", phone: "", occupation: "", dob: "",
  });
  const [errs, setErrs] = useState({});
  const { loading, error, otpEmail } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => { dispatch(clearAuthError()); }, [dispatch]);
  useEffect(() => { if (otpEmail) navigate("/verify-otp"); }, [otpEmail, navigate]);

  const validate = () => {
    const e = {};
    if (!formData.name.trim()) e.name = "Name is required";
    if (!formData.email) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = "Enter a valid email";
    if (!formData.password) e.password = "Password is required";
    else if (formData.password.length < 6) e.password = "At least 6 characters";
    if (formData.phone && !/^\+?[0-9]{7,15}$/.test(formData.phone.replace(/[\s\-()+]/g, "")))
      e.phone = "Enter a valid phone number";
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
    const payload = { ...formData };
    if (!payload.phone) delete payload.phone;
    if (!payload.occupation) delete payload.occupation;
    if (!payload.dob) delete payload.dob;
    dispatch(registerUser(payload));
  };

  const inputCls = (err) =>
    `field ${err ? "field-error" : ""}`;

  return (
    <div
      className="flex-1 flex items-center justify-center px-4 py-10 relative overflow-hidden"
      style={{ background: "var(--c-bg)" }}
    >
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="w-full max-w-[520px] relative anim-up">

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
          <h1 className="text-2xl font-display font-bold tracking-tight" style={{ color: "var(--c-text-1)" }}>
            Create your account
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--c-text-3)" }}>
            Get started with PropRiva in seconds
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7 sm:p-8"
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            boxShadow: "var(--shadow-md)",
          }}
        >
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

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

            {/* Name */}
            <Field label="Full Name" icon={User} error={errs.name}>
              <input
                type="text" id="name" name="name"
                value={formData.name} onChange={handleChange}
                placeholder="John Doe"
                className={inputCls(errs.name)}
                required
              />
            </Field>

            {/* Email */}
            <Field label="Email Address" icon={Mail} error={errs.email}>
              <input
                type="email" id="email" name="email"
                value={formData.email} onChange={handleChange}
                placeholder="you@example.com"
                className={inputCls(errs.email)}
                required
              />
            </Field>

            {/* Password + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Password" icon={Lock} error={errs.password}>
                <input
                  type="password" id="password" name="password"
                  value={formData.password} onChange={handleChange}
                  placeholder="Min 6 chars"
                  className={inputCls(errs.password)}
                  required
                />
              </Field>
              <Field label="Phone" icon={Phone} error={errs.phone} optional>
                <input
                  type="tel" id="phone" name="phone"
                  value={formData.phone} onChange={handleChange}
                  placeholder="+91 98765 43210"
                  className={inputCls(errs.phone)}
                />
              </Field>
            </div>

            {/* Occupation + DOB */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Occupation" icon={Briefcase} optional>
                <input
                  type="text" id="occupation" name="occupation"
                  value={formData.occupation} onChange={handleChange}
                  placeholder="Software Engineer"
                  className="field"
                />
              </Field>
              <Field label="Date of Birth" icon={Calendar} optional>
                <input
                  type="date" id="dob" name="dob"
                  value={formData.dob} onChange={handleChange}
                  className="field"
                />
              </Field>
            </div>

            {/* Submit */}
            <button
              id="register-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-1 !py-3"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /><span>Creating Account…</span></>
              ) : (
                <><span>Create Account</span><ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: "var(--c-text-3)" }}>
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-bold transition-colors hover:opacity-80"
              style={{ color: "var(--c-brand)" }}
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
