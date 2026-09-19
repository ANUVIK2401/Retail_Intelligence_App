"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Empty, Reason } from "@/components/primitives";

type Member = {
  email: string;
  actorId: string;
  personaName: string;
  personaTitle: string;
  admin: boolean;
  origin: "config" | "invited";
};

type Role = { id: string; name: string; title: string; function: string; roles: string[] };

type Payload = {
  members: Member[];
  roles: Role[];
  durable: boolean;
  actingAdmin: string;
};

export default function AdminPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [actorId, setActorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/members");
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      setDenied(body.error ?? "Only an administrator can manage members.");
      return;
    }
    if (!res.ok) {
      setNotice({ kind: "error", text: "The member directory could not be loaded." });
      return;
    }
    const body: Payload = await res.json();
    setData(body);
    setActorId((current) => current || body.roles[0]?.id || "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    if (!email.trim() || !actorId) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), actorId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice({ kind: "error", text: body.error ?? "The member could not be added." });
        return;
      }
      setNotice({
        kind: "ok",
        text: `${body.member.email} can now sign in as ${body.member.personaName}.`,
      });
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice({ kind: "error", text: body.error ?? "The member could not be removed." });
        return;
      }
      setNotice({ kind: "ok", text: `${target} can no longer sign in.` });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (denied) {
    return (
      <div className="space-y-5">
        <header className="page-head enter">
          <p className="page-eyebrow">Deployment</p>
          <h1 className="t-title mt-2">Administration</h1>
        </header>
        <Card title="Not available to this account">
          <p className="text-[13px] leading-relaxed">{denied}</p>
          <Reason>
            Administrators are named in the deployment&apos;s `ADMIN_EMAILS` setting. Being
            an executive in the directory does not grant administration.
          </Reason>
        </Card>
      </div>
    );
  }

  if (!data) return <p className="muted py-10 text-center text-sm">Loading…</p>;

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Deployment</p>
        <h1 className="t-title mt-2">Administration</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Onboard people and assign the role they act as. The policy engine decides what
          each role may do — this page never grants a permission directly.
        </p>
      </header>

      <Card title="Onboard a member">
        <div className="space-y-3">
          <div>
            <label htmlFor="member-email" className="text-[12px] font-medium">
              Google account email
            </label>
            <input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@pacsun.com"
              className="tap mt-1 w-full rounded-lg border px-3 text-sm"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                minHeight: 44,
              }}
            />
          </div>

          <div>
            <label htmlFor="member-role" className="text-[12px] font-medium">
              Acts as
            </label>
            <select
              id="member-role"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="tap mt-1 w-full rounded-lg border px-3 text-sm"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                minHeight: 44,
              }}
            >
              {data.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.title}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-primary"
            style={{ minHeight: 44 }}
            disabled={busy || !email.trim()}
            onClick={() => void invite()}
          >
            {busy ? "Saving…" : "Onboard member"}
          </button>
        </div>

        {notice && (
          <p
            className="mt-3 text-[13px] leading-relaxed"
            style={{ color: notice.kind === "ok" ? "var(--low)" : "var(--high)" }}
          >
            {notice.text}
          </p>
        )}

        <Reason>
          Sign-in is allow-listed. A person who is not on this list cannot sign in even
          with a valid Google account, and the role they are assigned is the identity the
          policy engine evaluates on every request.
        </Reason>

        {!data.durable && (
          <p className="mt-3 text-[12px]" style={{ color: "var(--medium)" }}>
            No database is configured, so members added here live only in this server
            process and disappear on restart. Set <code>DATABASE_URL</code> to make
            onboarding durable.
          </p>
        )}
      </Card>

      <Card title={`Members (${data.members.length})`}>
        {data.members.length === 0 ? (
          <Empty>No members yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {data.members.map((m) => (
              <li key={m.email} className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium break-all">
                    {m.email}
                    {m.admin && (
                      <span className="badge badge-low ml-2" style={{ verticalAlign: "middle" }}>
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="muted text-xs">
                    {m.actorId
                      ? `Acts as ${m.personaName} — ${m.personaTitle}`
                      : m.personaTitle}
                  </p>
                  <p className="muted text-[11px]">
                    {m.origin === "config"
                      ? "From deployment configuration"
                      : "Onboarded here"}
                  </p>
                </div>
                {m.origin === "invited" && m.email !== data.actingAdmin && (
                  <button
                    className="btn text-[11px]"
                    style={{ minHeight: 44 }}
                    disabled={busy}
                    onClick={() => void remove(m.email)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="What administration is, and is not">
        <p className="muted text-[13px] leading-relaxed">
          An administrator decides <em>who</em> may sign in and <em>which role</em> they
          hold. An administrator does not gain access to other people&apos;s mail,
          calendars, or workspaces: every read is still evaluated against the role they
          act as. An administrator mapped to a marketing role still cannot open a
          restricted thread, and that refusal is recorded in the audit trail like any
          other.
        </p>
      </Card>
    </div>
  );
}
