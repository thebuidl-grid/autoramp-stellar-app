"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function MerchantSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your merchant account settings.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Merchant Profile</CardTitle>
                    <CardDescription>
                        Contact support to update your business details.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            For security reasons, business information cannot be changed directly from the dashboard.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
