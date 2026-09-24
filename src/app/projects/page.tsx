"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/primitives";
import { Icon } from "@/components/icons";

type Project = {
  id: string; name: string; description: string; color: string; type: "initiative" | "recurring" | "custom"; status: string;
  counts: { emails: number; meetings: number; people: number; notes: number };
};
type Person = { id: string; name: string; title: string };

const TYPE_LABEL = { initiative: "Initiative", recurring: "Recurring", custom: "Custom" } as const;
const COLORS = ["teal", "indigo", "amber", "rose", "slate", "green"] as const;

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/projects");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Projects could not be loaded.");
      setProjects(data.projects as Project[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Projects could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/people").then((response) => response.ok ? response.json() : null).then((data) => setPeople(data?.people ?? [])).catch(() => setPeople([]));
  }, [load]);

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Organize</p>
        <h1 className="t-title mt-2">Projects</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Group email, meetings, people, and notes by what they are for, instead of when they arrived.
          The assistant suggests where new email belongs; nothing is filed without your tap.
        </p>
      </header>

      {error && <Card><p role="alert" className="text-sm">{error}</p><button className="btn mt-3" onClick={() => void load()}>Try again</button></Card>}
      {!projects && !error && <div className="project-grid" aria-busy="true">{[0, 1, 2, 3].map((key) => <div key={key} className="shimmer h-[170px] rounded-3xl" />)}</div>}

      {projects && (
        <div className="project-grid">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="project-card tap" data-color={project.color}>
              <span className="project-type">{TYPE_LABEL[project.type]}</span>
              <span className="project-card-name">{project.name}</span>
              <span className="muted t-caption line-clamp-2">{project.description}</span>
              <span className="project-card-meta">
                <span>{project.counts.emails} email{project.counts.emails === 1 ? "" : "s"}</span>
                <span>{project.counts.meetings} meeting{project.counts.meetings === 1 ? "" : "s"}</span>
                <span>{project.counts.people} people</span>
              </span>
            </Link>
          ))}
          {!creating && (
            <button type="button" className="project-card project-new tap" onClick={() => setCreating(true)}>
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="plus" /></span>
              <span className="project-card-name">New project</span>
              <span className="muted t-caption">An initiative, a recurring meeting, or anything that matters to you</span>
            </button>
          )}
        </div>
      )}

      {creating && <NewProject people={people} onCancel={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />}
    </div>
  );
}

function NewProject({ people, onCancel, onCreated }: { people: Person[]; onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"initiative" | "recurring" | "custom">("initiative");
  const [color, setColor] = useState<(typeof COLORS)[number]>("teal");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, type, color, memberIds: members }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The project could not be created.");
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New project">
      <form className="project-form" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="e.g. Holiday assortment review" /></label>
        <label>What it is for<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={400} rows={2} /></label>
        <div className="flex flex-wrap gap-3">
          <label>Kind
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="initiative">Initiative</option>
              <option value="recurring">Recurring management activity</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>Color
            <select value={color} onChange={(event) => setColor(event.target.value as typeof color)}>
              {COLORS.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="text-xs font-semibold muted mb-2">People</legend>
          <div className="people-picker">
            {people.map((person) => (
              <button key={person.id} type="button" className="chip tap" aria-pressed={members.includes(person.id)} onClick={() => setMembers((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])}>
                {person.name}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="triage-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || name.trim().length < 2}>{busy ? "Creating…" : "Create project"}</button>
        </div>
      </form>
    </Card>
  );
}
