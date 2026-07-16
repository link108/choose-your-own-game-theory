import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await signIn(mode, email.trim(), password);
      navigate(from);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
      <p className="muted">
        {mode === "login"
          ? "Your scenarios and playthroughs follow your account across devices."
          : "Registering keeps everything you've made as a guest and syncs it across devices."}
      </p>
      <div className="card">
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder={mode === "register" ? "Password (min 8 characters)" : "Password"}
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={busy || !email.trim() || password.length < 8}
          >
            {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
          {error && <div className="error">{error}</div>}
          {mode === "login" && (
            <Link to="/forgot-password" className="muted">
              Forgot password?
            </Link>
          )}
        </div>
      </div>
      <p className="muted">
        {mode === "login" ? (
          <>
            No account yet?{" "}
            <button className="btn" onClick={() => setMode("register")}>
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button className="btn" onClick={() => setMode("login")}>
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
