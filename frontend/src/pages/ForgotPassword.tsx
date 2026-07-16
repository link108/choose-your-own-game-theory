import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.requestPasswordReset(email.trim());
      setSent(res.detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1>Reset your password</h1>
      <p className="muted">
        Enter the email you signed up with and we'll send you a reset link.
      </p>
      <div className="card">
        {sent ? (
          <p>{sent}</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <button className="btn btn-primary" onClick={submit} disabled={busy || !email.trim()}>
              {busy ? "One moment…" : "Send reset link"}
            </button>
            {error && <div className="error">{error}</div>}
          </div>
        )}
      </div>
      <p className="muted">
        <Link to="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
