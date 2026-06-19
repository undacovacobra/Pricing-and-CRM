"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronRight, Phone, Mail, Search } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";
import type { Customer } from "@/lib/types/database";

interface CustomerWithJobs extends Customer {
  jobs: { id: string; stage: string }[] | null;
}

export function CustomerList({ customers }: { customers: CustomerWithJobs[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    const terms = q.split(/\s+/);
    return customers.filter((c) => {
      const haystack = [
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.address_line1,
        c.address_line2,
        c.city,
        c.state,
        c.zip,
        c.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [customers, query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, phone, address, notes..."
          className="pl-9"
        />
      </div>

      {customers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No customers yet.</p>
            <Button asChild size="sm">
              <Link href="/customers/new">Add your first customer</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {customers.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No customers match &ldquo;{query}&rdquo;.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {filtered.map((customer) => {
          const jobs = customer.jobs;
          const activeJobs = jobs?.filter((j) => !["finished", "cancelled"].includes(j.stage)) ?? [];
          return (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      {customer.first_name} {customer.last_name}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {formatPhoneNumber(customer.phone)}
                        </span>
                      )}
                      {customer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </span>
                      )}
                    </div>
                    {customer.city && (
                      <p className="text-xs text-muted-foreground">
                        {customer.city}{customer.state ? `, ${customer.state}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {activeJobs.length > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {activeJobs.length} active {activeJobs.length === 1 ? "job" : "jobs"}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
