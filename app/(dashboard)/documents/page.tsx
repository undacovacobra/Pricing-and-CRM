import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentTemplatesSection } from "@/components/documents/DocumentTemplatesSection";
import { FolderOpen } from "lucide-react";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("document_templates")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Store your blank contract, invoice, and change order templates with your logo here.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {["contract", "invoice", "change_order", "other"].map((type) => {
          const count = templates?.filter((t) => t.template_type === type).length ?? 0;
          const labels: Record<string, string> = {
            contract: "Contracts",
            invoice: "Invoices",
            change_order: "Change Orders",
            other: "Other",
          };
          return (
            <Card key={type}>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <FolderOpen className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{labels[type]}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload Template</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentTemplatesSection templates={templates ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
