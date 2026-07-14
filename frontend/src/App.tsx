import { Link, NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Library from "./pages/Library";
import Play from "./pages/Play";
import Review from "./pages/Review";
import ScenarioBuilder from "./pages/ScenarioBuilder";
import ScenarioDetail from "./pages/ScenarioDetail";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="row">
          <Link to="/" className="brand">
            Scenario Sim
          </Link>
          <nav className="nav">
            <NavLink to="/library">Library</NavLink>
            <NavLink to="/" end>
              Your scenarios
            </NavLink>
          </nav>
        </div>
        <Link to="/scenarios/new" className="btn btn-primary">
          New scenario
        </Link>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/scenarios/new" element={<ScenarioBuilder />} />
          <Route path="/scenarios/:id" element={<ScenarioDetail />} />
          <Route path="/scenarios/:id/edit" element={<ScenarioBuilder />} />
          <Route path="/play/:id" element={<Play />} />
          <Route path="/review/:id" element={<Review />} />
        </Routes>
      </main>
    </div>
  );
}
