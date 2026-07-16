import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function ResetPassword() {
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.resetPassword(token, password);
      applySession(res); // resetting also signs you in
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1>Reset your password</h1>
        <div className="card">
          <div className="error">This reset link is missing its token.</div>
        </div>
        <p className="muted">
          <Link to="/forgot-password">Request a new reset link</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1>Choose a new password</h1>
      <div className="card">
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={busy || password.length < 8}
          >
            {busy ? "One moment…" : "Set new password"}
          </button>
          {error && (
            <div className="error">
              {error} — <Link to="/forgot-password">request a new link</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
