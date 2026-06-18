import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DocumentCreateForm } from "@/components/documents/DocumentCreateForm";

export default async function NewDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("*, customer:customers(*)")
    .eq("id", id)
    .single();

  if (!job) notFound();

  const [{ data: pricingItems }, { data: cabinetLines }, { data: settings }, { data: templates }] = await Promise.all([
    supabase.from("pricing_items").select("*").eq("is_active", true).order("category").order("name"),
    supabase.from("cabinet_lines").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("app_settings").select("*").single(),
    supabase.from("document_templates").select("*").order("name"),
  ]);

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
        pricingItems={pricingItems ?? []}
        cabinetLines={cabinetLines ?? []}
        settings={settings}
        templates={templates ?? []}
      />
    </div>
  );
}
