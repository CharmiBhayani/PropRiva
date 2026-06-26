import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useDispatch } from "react-redux";
import { fetchCurrentUser } from "./store/authSlice";
import { ThemeProvider } from "./context/ThemeContext";

import Navbar from "./components/Navbar";
import PrivateRoute from "./components/PrivateRoute";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyOtp from "./pages/VerifyOtp";
import Dashboard from "./pages/Dashboard";
import PropertyDetails from "./pages/PropertyDetails";

function AppInner() {
  const dispatch = useDispatch();
  useEffect(() => { dispatch(fetchCurrentUser()); }, [dispatch]);

  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-dvh" style={{ background: "var(--c-bg)", color: "var(--c-text-1)" }}>
        <Navbar />
        <main className="flex-auto flex flex-col">
          <Routes>
            <Route path="/"           element={<Home />} />
            <Route path="/login"      element={<Login />} />
            <Route path="/register"   element={<Register />} />
            <Route path="/verify-otp" element={<VerifyOtp />} />

            <Route path="/dashboard" element={
              <PrivateRoute><Dashboard /></PrivateRoute>
            } />
            <Route path="/property/:id" element={
              <PrivateRoute><PropertyDetails /></PrivateRoute>
            } />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
