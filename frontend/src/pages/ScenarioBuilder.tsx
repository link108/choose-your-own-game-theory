import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, NPC, Role, ScenarioFields } from "../api";

const EMPTY: ScenarioFields = {
  title: "",
  category: "",
  premise: "",
  setting: "",
  tone: "",
  goal: "",
  gm_notes: "",
  roles: [],
  npcs: [],
};

export default function ScenarioBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [concept, setConcept] = useState("");
  const [fields, setFields] = useState<ScenarioFields>(EMPTY);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) {
      api
        .getScenario(id)
        .then((s) =>
          setFields({
            title: s.title,
            category: s.category,
            premise: s.premise,
            setting: s.setting,
            tone: s.tone,
            goal: s.goal,
            gm_notes: s.gm_notes,
            roles: s.roles,
            npcs: s.npcs,
          }),
        )
        .catch((e) => setError(e.message));
    }
  }, [id]);

  const set = (patch: Partial<ScenarioFields>) => setFields((f) => ({ ...f, ...patch }));

  const draft = async () => {
    setDrafting(true);
    setError("");
    try {
      // the draft endpoint returns no category; keep the field defined
      setFields({ ...EMPTY, ...(await api.draftScenario(concept)) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = id
        ? await api.updateScenario(id, fields)
        : await api.createScenario(fields);
      navigate(`/scenarios/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const setRole = (i: number, patch: Partial<Role>) =>
    set({ roles: fields.roles.map((r, j) => (i === j ? { ...r, ...patch } : r)) });
  const setNpc = (i: number, patch: Partial<NPC>) =>
    set({ npcs: fields.npcs.map((n, j) => (i === j ? { ...n, ...patch } : n)) });

  return (
    <div>
      <h1>{id ? "Edit scenario" : "New scenario"}</h1>

      {!id && (
        <div className="card">
          <label className="field">
            <span>Describe your scenario idea in a sentence or two</span>
            <textarea
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. A newly promoted engineering manager must handle a top performer who is burning out and considering quitting mid-project."
            />
          </label>
          <button className="btn btn-primary" onClick={draft} disabled={drafting || !concept.trim()}>
            {drafting ? "Drafting…" : "Draft it with AI"}
          </button>
          <span className="muted" style={{ marginLeft: "0.8rem" }}>
            or fill in the fields yourself below
          </span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="card">
        <label className="field">
          <span>Title</span>
          <input value={fields.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="field">
          <span>Premise — the situation and what's at stake</span>
          <textarea value={fields.premise} onChange={(e) => set({ premise: e.target.value })} />
        </label>
        <label className="field">
          <span>Setting — where/when, background the player knows</span>
          <textarea value={fields.setting} onChange={(e) => set({ setting: e.target.value })} />
        </label>
        <label className="field">
          <span>Tone (e.g. "corporate-realistic", "high-fantasy, dramatic")</span>
          <input value={fields.tone} onChange={(e) => set({ tone: e.target.value })} />
        </label>
        <label className="field">
          <span>Goal — what counts as success/failure; defines when it ends</span>
          <textarea value={fields.goal} onChange={(e) => set({ goal: e.target.value })} />
        </label>
        <label className="field">
          <span>GM notes — hidden context only the game master sees</span>
          <textarea value={fields.gm_notes} onChange={(e) => set({ gm_notes: e.target.value })} />
        </label>
      </div>

      <div className="card">
        <h2>Playable roles</h2>
        {fields.roles.map((role, i) => (
          <div className="subcard" key={i}>
            <label className="field">
              <span>Name</span>
              <input value={role.name} onChange={(e) => setRole(i, { name: e.target.value })} />
            </label>
            <label className="field">
              <span>Description (visible to everyone)</span>
              <textarea
                value={role.description}
                onChange={(e) => setRole(i, { description: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Private info (only this character knows)</span>
              <textarea
                value={role.private_info}
                onChange={(e) => setRole(i, { private_info: e.target.value })}
              />
            </label>
            <button
              className="btn btn-danger"
              onClick={() => set({ roles: fields.roles.filter((_, j) => j !== i) })}
            >
              Remove role
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            set({ roles: [...fields.roles, { name: "", description: "", private_info: "" }] })
          }
        >
          Add role
        </button>
      </div>

      <div className="card">
        <h2>NPCs</h2>
        {fields.npcs.map((npc, i) => (
          <div className="subcard" key={i}>
            <label className="field">
              <span>Name</span>
              <input value={npc.name} onChange={(e) => setNpc(i, { name: e.target.value })} />
            </label>
            <label className="field">
              <span>Description (visible to the player)</span>
              <textarea
                value={npc.description}
                onChange={(e) => setNpc(i, { description: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Hidden agenda (GM only)</span>
              <textarea
                value={npc.hidden_agenda}
                onChange={(e) => setNpc(i, { hidden_agenda: e.target.value })}
              />
            </label>
            <button
              className="btn btn-danger"
              onClick={() => set({ npcs: fields.npcs.filter((_, j) => j !== i) })}
            >
              Remove NPC
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            set({ npcs: [...fields.npcs, { name: "", description: "", hidden_agenda: "" }] })
          }
        >
          Add NPC
        </button>
      </div>

      <button
        className="btn btn-primary"
        onClick={save}
        disabled={saving || !fields.title.trim() || fields.roles.length === 0}
      >
        {saving ? "Saving…" : "Save scenario"}
      </button>
      {fields.roles.length === 0 && (
        <span className="muted" style={{ marginLeft: "0.8rem" }}>
          add at least one playable role to save
        </span>
      )}
    </div>
  );
}
