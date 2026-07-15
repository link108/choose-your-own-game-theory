import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Admin from "./pages/Admin";
import Home from "./pages/Home";
import Library from "./pages/Library";
import Login from "./pages/Login";
import Play from "./pages/Play";
import Review from "./pages/Review";
import ScenarioBuilder from "./pages/ScenarioBuilder";
import ScenarioDetail from "./pages/ScenarioDetail";

type Theme = "light" | "dark";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) ?? "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setTheme(next)}
    >
      {theme === "dark" ? (
        // sun
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      ) : (
        // moon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}

function AccountControls() {
  const { user, ready, signOut } = useAuth();
  const navigate = useNavigate();

  if (!ready) return null;
  if (!user)
    return (
      <Link to="/login" className="btn">
        Sign in
      </Link>
    );
  return (
    <>
      <span className="muted" title={user.email}>
        {user.email}
      </span>
      <button
        className="btn"
        onClick={() => {
          signOut();
          navigate("/");
        }}
      >
        Sign out
      </button>
    </>
  );
}

function Shell() {
  const { user } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <Link to="/" className="brand">
              Scenario Sim
            </Link>
            <nav className="nav">
              <NavLink to="/library">Library</NavLink>
              <NavLink to="/" end>
                Your scenarios
              </NavLink>
              {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
            </nav>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <AccountControls />
            <Link to="/scenarios/new" className="btn btn-primary">
              New scenario
            </Link>
          </div>
        </div>
      </header>
      <main className="container content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/login" element={<Login />} />
          <Route path="/scenarios/new" element={<ScenarioBuilder />} />
          <Route path="/scenarios/:id" element={<ScenarioDetail />} />
          <Route path="/scenarios/:id/edit" element={<ScenarioBuilder />} />
          <Route path="/play/:id" element={<Play />} />
          <Route path="/review/:id" element={<Review />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
