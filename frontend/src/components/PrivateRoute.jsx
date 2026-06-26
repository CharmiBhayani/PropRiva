import React from "react";
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Loader } from "lucide-react";

const PrivateRoute = ({ children }) => {
  const { user, sessionChecking } = useSelector((state) => state.auth);

  if (sessionChecking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24">
        <Loader className="animate-spin text-primary" size={32} />
        <span className="text-sm text-text-muted font-medium">Verifying session…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PrivateRoute;
