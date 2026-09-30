"use client";

import { InitiateOtcForm } from "@/components/otc/initiate-otc-form";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { AlertCircle, History, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function OtcTradePage() {
    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <PlusSquare className="w-6 h-6 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">OTC Trading</h1>
                    </div>
                    <p className="text-muted-foreground">
                        Initiate large volume trades with competitive rates and personalized support.
                    </p>
                </div>
                <Button asChild variant="outline" className="gap-2">
                    <Link href="/otc/history">
                        <History className="w-4 h-4" />
                        View History
                    </Link>
                </Button>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle className="text-xl font-bold">New Trade Request</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <InitiateOtcForm />
                </CardContent>
            </Card>

            <div className="max-w-2xl mx-auto p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-4">
                <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-primary">Need larger limits?</p>
                    <p className="text-xs text-muted-foreground">
                        Our OTC desk can handle transactions above current limits. Contact us at <Link href="mailto:dev@thebuidlgrid.org" className="text-primary hover:underline">dev@thebuidlgrid.org</Link> for exclusive rates.
                    </p>
                </div>
            </div>
        </div>
    );
}
