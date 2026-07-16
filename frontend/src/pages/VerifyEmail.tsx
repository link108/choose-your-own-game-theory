import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type State = "verifying" | "done" | "failed";

export default function VerifyEmail() {
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>(token ? "verifying" : "failed");
  const [error, setError] = useState(token ? "" : "This verification link is missing its token.");
  const fired = useRef(false);

  useEffect(() => {
    if (!token || fired.current) return; // guard StrictMode's double effect
    fired.current = true;
    api
      .verifyEmail(token)
      .then(async () => {
        await refresh().catch(() => {});
        setState("done");
      })
      .catch((e) => {
        setError((e as Error).message);
        setState("failed");
      });
  }, [token, refresh]);

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1>Email verification</h1>
      <div className="card">
        {state === "verifying" && <p className="muted">Verifying…</p>}
        {state === "done" && (
          <p>
            Your email is verified. <Link to="/">Back to your scenarios</Link>
          </p>
        )}
        {state === "failed" && (
          <div className="error">
            {error} — sign in and use the "Resend verification email" button to get a fresh link.
          </div>
        )}
      </div>
    </div>
  );
}
