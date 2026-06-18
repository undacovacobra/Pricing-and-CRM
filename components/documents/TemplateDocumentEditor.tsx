"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import type { DocumentTemplate } from "@/lib/types/database";

interface Props {
  jobId:       string;
  title:       string;
  template:    DocumentTemplate;
  googleReady: boolean;
}

function isWordDoc(fileName: string) {
  return /\.docx$/i.test(fileName);
}

export function TemplateDocumentEditor({ jobId, title, template, googleReady }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const editorRef = useRef<HTMLDivElement>(null);

  const templateUrl = `${SUPABASE_URL}/storage/v1/object/public/templates/${template.storage_path}`;
  const editable = isWordDoc(template.file_name);

  const [loading, setLoading] = useState(editable && !googleReady);
  const [html, setHtml] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Google Docs flow
  const [showInline, setShowInline] = useState(false);
  const [openingDoc, setOpeningDoc] = useState(false);
  const [docUrl, setDocUrl] = useState<string | null>(null);

  const inlineActive = !googleReady || showInline;

  async function handleOpenInGoogleDocs() {
    setError(null);
    setOpeningDoc(true);
    try {
      const res = await fetch("/api/google/create-doc", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          templateStoragePath: template.storage_path,
          templateFileName:    template.file_name,
          templateName:        template.name,
          title,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error === "not_connected"
          ? "Google Drive isn't connected. Connect it in Settings first."
          : `Could not open in Google Docs: ${data.error ?? "unknown error"}`);
        setOpeningDoc(false);
        return;
      }
      setDocUrl(data.url);
      setOpeningDoc(false);
      // Open the editable Google Doc.
      window.open(data.url, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (e) {
      setError(`Could not open in Google Docs: ${String(e)}`);
      setOpeningDoc(false);
    }
  }

  // Load + convert the Word document to editable HTML.
  useEffect(() => {
    let cancelled = false;
    if (!editable || !inlineActive) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(templateUrl);
        const arrayBuffer = await res.arrayBuffer();
        // @ts-expect-error - mammoth's browser build ships no type declarations
        const mammoth = await import("mammoth/mammoth.browser");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) {
          setHtml(result.value || "<p></p>");
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(`Could not load the Word document: ${String(e)}`);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [templateUrl, editable, inlineActive]);

  // Populate the contentEditable once the HTML is ready.
  useEffect(() => {
    if (editorRef.current && html && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = html;
    }
  }, [html]);

  function safeName(ext: string) {
    const base = (title || template.name || "document").replace(/[^a-z0-9-_ ]/gi, "").trim() || "document";
    return `${base}.${ext}`;
  }

  async function recordToJob(storagePath: string, fileName: string) {
    // Save into the job's attachments
    await supabase.from("job_attachments").insert({
      job_id:       jobId,
      storage_path: storagePath,
      file_name:    fileName,
    });
    // And log a note so we can track when it was created
    await supabase.from("job_notes").insert({
      job_id:                  jobId,
      author:                  "owner",
      content:                 `Document "${title || template.name}" created from template "${template.name}".`,
      attachment_storage_path: storagePath,
      attachment_file_name:    fileName,
    });
  }

  async function handleSaveWord() {
    if (!editorRef.current) return;
    setError(null);
    setSaving(true);
    try {
      const currentHtml = editorRef.current.innerHTML;
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${currentHtml}</body></html>`;
      const { asBlob } = await import("html-docx-js-typescript");
      const converted = await asBlob(fullHtml);
      const blob = converted instanceof Blob ? converted : new Blob([converted as BlobPart]);
      const fileName = safeName("docx");
      const path = `${jobId}/documents/${Date.now()}-${fileName}`;

      const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, blob, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      if (uploadErr) { setError(uploadErr.message); setSaving(false); return; }

      await recordToJob(path, fileName);
      setDone(true);
      setSaving(false);
      router.refresh();
    } catch (e) {
      setError(`Save failed: ${String(e)}`);
      setSaving(false);
    }
  }

  // For non-Word templates: save a copy of the original to the job (no inline edit).
  async function handleSaveCopy() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(templateUrl);
      const blob = await res.blob();
      const fileName = template.file_name;
      const path = `${jobId}/documents/${Date.now()}-${fileName}`;
      const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, blob);
      if (uploadErr) { setError(uploadErr.message); setSaving(false); return; }
      await recordToJob(path, fileName);
      setDone(true);
      setSaving(false);
      router.refresh();
    } catch (e) {
      setError(`Save failed: ${String(e)}`);
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="border rounded-lg p-4 bg-green-50 border-green-200 space-y-3">
        <p className="text-sm text-green-800">
          Saved to this job&apos;s attachments and logged in notes.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => router.push(`/jobs/${jobId}`)}>Back to Job</Button>
          <Button size="sm" variant="outline" onClick={() => setDone(false)}>Keep Editing</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Primary: real Google Docs editing */}
      {googleReady && (
        <div className="border rounded-lg p-4 bg-blue-50 border-blue-200 space-y-3">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">Edit in Google Docs (full design flexibility)</p>
              <p className="text-xs text-blue-800">
                Opens an editable copy of <span className="font-medium">{template.file_name}</span> as a Google Doc
                in this job&apos;s Drive folder, with all of Google Docs&apos; design tools. A note is logged for tracking.
              </p>
            </div>
          </div>
          {docUrl ? (
            <div className="flex gap-2">
              <a href={docUrl} target="_blank" rel="noopener noreferrer"><Button size="sm">Reopen Google Doc</Button></a>
              <Button size="sm" variant="outline" onClick={() => router.push(`/jobs/${jobId}`)}>Back to Job</Button>
            </div>
          ) : (
            <Button size="sm" onClick={handleOpenInGoogleDocs} disabled={openingDoc}>
              {openingDoc ? "Opening…" : "Open in Google Docs"}
            </Button>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {!showInline && (
            <button type="button" onClick={() => setShowInline(true)} className="text-xs text-blue-700 underline">
              or edit a quick simplified copy here instead
            </button>
          )}
        </div>
      )}

      {!googleReady && (
        <div className="text-xs text-muted-foreground bg-slate-50 border rounded-md px-3 py-2">
          Tip: <Link href="/settings" className="text-blue-600 underline">connect Google Drive in Settings</Link> to
          edit templates with full Google Docs design flexibility. For now you can edit a simplified copy below.
        </div>
      )}

      {inlineActive && (
      <div className="space-y-3">
      {editable ? (
        <>
          <p className="text-xs text-muted-foreground">
            Editing a simplified copy of <span className="font-medium">{template.file_name}</span>. Make your
            changes below, then save — it will be stored in this job&apos;s attachments and logged in notes.
          </p>
          {loading ? (
            <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">Loading document…</div>
          ) : (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="border rounded-lg p-6 min-h-[400px] bg-white text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-300 prose prose-sm max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1"
            />
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveWord} disabled={saving || loading}>
              {saving ? "Saving…" : "Save Document"}
            </Button>
            <a href={templateUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" type="button">Open Original</Button>
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            This template (<span className="font-medium">{template.file_name}</span>) isn&apos;t a Word
            (.docx) file, so it can&apos;t be edited inline. You can preview it and save a copy to this job.
          </p>
          <div className="border rounded-lg overflow-hidden bg-slate-50">
            {/\.(png|jpe?g|gif|webp)$/i.test(template.file_name) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={templateUrl} alt={template.file_name} className="w-full" />
            ) : (
              <iframe src={templateUrl} className="w-full h-[500px]" title={template.file_name} />
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" onClick={handleSaveCopy} disabled={saving}>
            {saving ? "Saving…" : "Save Copy to Job"}
          </Button>
        </>
      )}
      </div>
      )}
    </div>
  );
}
