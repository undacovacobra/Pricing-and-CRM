"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserPlus, KeyRound, Trash2 } from "lucide-react";

interface AppUser {
  id: string;
  login: string;
  isUsername: boolean;
  role: "owner" | "designer" | "installer";
  displayName: string;
  isSelf: boolean;
}

export function UsersCard() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  // Add-user form
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"owner" | "designer" | "installer">("installer");
  const [saving, setSaving] = useState(false);

  // Per-user password reset
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok) setUsers(data.users ?? []);
      else setMessage({ text: data.detail || data.error || "Couldn't load users.", tone: "warn" });
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function addUser() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole, displayName: newName }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: `Added ${newName || newUsername}. They can sign in with username "${newUsername.trim().toLowerCase()}".`, tone: "ok" });
        setAdding(false);
        setNewName(""); setNewUsername(""); setNewPassword(""); setNewRole("installer");
        load();
      } else {
        setMessage({ text: data.detail || data.error || "Couldn't add user.", tone: "warn" });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setSaving(false);
    }
  }

  async function patchUser(id: string, patch: Record<string, unknown>, okText: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok) { setMessage({ text: okText, tone: "ok" }); load(); }
      else setMessage({ text: data.detail || data.error || "Update failed.", tone: "warn" });
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    }
  }

  async function deleteUser(u: AppUser) {
    if (!confirm(`Remove ${u.displayName || u.login}? They will no longer be able to sign in.`)) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) { setMessage({ text: `Removed ${u.displayName || u.login}.`, tone: "ok" }); load(); }
      else setMessage({ text: data.detail || data.error || "Delete failed.", tone: "warn" });
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> Users &amp; Logins
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Everyone who can sign in. You can add people, change their role, and set a new password.
          For security, existing passwords can&apos;t be shown — only reset.
        </p>

        {message && (
          <div className={`text-sm rounded-md px-3 py-2 ${message.tone === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {u.displayName || u.login}
                      {u.isSelf && <span className="text-xs text-muted-foreground font-normal"> (you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.isUsername ? "Username" : "Email"}: {u.login}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={u.role} onValueChange={(v) => patchUser(u.id, { role: v }, "Role updated.")}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="designer">Designer</SelectItem>
                        <SelectItem value="installer">Installer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => { setResetId(resetId === u.id ? null : u.id); setResetPassword(""); }}>
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    {!u.isSelf && (
                      <Button size="sm" variant="outline" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => deleteUser(u)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {resetId === u.id && (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="text"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="New password (min 6 chars)"
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={resetPassword.length < 6}
                      onClick={() => { patchUser(u.id, { password: resetPassword }, `Password updated for ${u.displayName || u.login}.`); setResetId(null); setResetPassword(""); }}
                    >
                      Set
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => { setResetId(null); setResetPassword(""); }}>Cancel</Button>
                  </div>
                )}
                {u.role === "installer" && (
                  <p className="text-[11px] text-muted-foreground">Sees only the calendar and tasks.</p>
                )}
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="rounded-lg border p-3 bg-slate-50 space-y-2">
            <p className="text-sm font-medium">Add a person</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Karol" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Username</Label>
                <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. karol" autoCapitalize="none" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Password</Label>
                <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="min 6 characters" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as typeof newRole)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="installer">Installer</SelectItem>
                    <SelectItem value="designer">Designer</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addUser} disabled={saving || newUsername.trim().length < 3 || newPassword.length < 6}>
                {saving ? "Adding…" : "Add user"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); setMessage(null); }}>
            <UserPlus className="h-4 w-4" /> Add a person
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
