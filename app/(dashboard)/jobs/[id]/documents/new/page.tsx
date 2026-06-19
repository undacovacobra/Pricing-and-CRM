import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DocumentCreateForm } from "@/components/documents/DocumentCreateForm";
import { googleConfigured } from "@/lib/google/drive";
import { getGoogleConnectionStatus } from "@/lib/google/connection";

export default async function NewDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("*, customer:customers(*)")
    .eq("id", id)
    .single();

  if (!job) notFound();

  const { data: templates } = await supabase.from("document_templates").select("*").order("name");

  const configured = googleConfigured();
  const googleReady = configured && (await getGoogleConnectionStatus()).connected;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/jobs/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {job.title}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">New Document</h1>
      </div>
      <DocumentCreateForm
        job={job as Parameters<typeof DocumentCreateForm>[0]["job"]}
        templates={templates ?? []}
        googleReady={googleReady}
      />
    </div>
  );
}
