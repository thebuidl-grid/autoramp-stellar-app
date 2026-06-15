"use client";

import { Edit2, Save, X, Loader2, Link } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { merchantApi } from "@/lib/merchant";
import { useToast } from "@/components/ui/toast";
import { useMerchantStatus, useMerchantWebhook, useMerchantProfile } from "@/lib/hooks";
import { useAuthStore } from "@/lib/store";

export default function WebhookSettingsView() {
    const { user } = useAuthStore();
    const { data: status, isLoading: isStatusLoading } = useMerchantStatus();
    const { data: profile, isLoading: isProfileLoading } = useMerchantProfile(status?.merchantId || undefined);

    // Get the merchant ID exactly how BusinessDetailsView does it, with a final fallback
    const rawProfile = Array.isArray(profile) ? profile[0] : profile;
    const merchantId = (rawProfile?.id || status?.merchantId || user?.id) ?? undefined;

    const { data: webhookData, isLoading: isWebhookLoading, refetch } = useMerchantWebhook(merchantId);

    const initialWebhookUrl = webhookData?.webhookUrl || "";

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState("");
    const { toast } = useToast();

    useEffect(() => {
        if (initialWebhookUrl) {
            setWebhookUrl(initialWebhookUrl);
        }
    }, [initialWebhookUrl]);

    const handleSave = async () => {
        if (!merchantId) {
            toast({
                title: "Error",
                description: "Merchant ID not found. Please refresh the page.",
                variant: "destructive",
            });
            return;
        }

        if (!webhookUrl.trim()) {
            toast({
                title: "Error",
                description: "Webhook URL cannot be empty.",
                variant: "destructive",
            });
            return;
        }

        // Basic URL validation
        try {
            new URL(webhookUrl);
        } catch (e) {
            toast({
                title: "Invalid URL",
                description: "Please enter a valid URL (including https://).",
                variant: "destructive",
            });
            return;
        }

        setIsSaving(true);
        try {
            await merchantApi.updateWebhookUrl(merchantId, webhookUrl);
            toast({
                title: "Success",
                description: "Webhook URL updated successfully.",
                variant: "success",
            });
            setIsEditing(false);
            refetch();
        } catch (error) {
            console.error("Failed to update webhook URL:", error);
            toast({
                title: "Error",
                description: "Failed to update webhook URL. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const isLoading = isStatusLoading || isProfileLoading || isWebhookLoading;

    if (isLoading && !webhookData) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse">Loading webhook settings...</p>
            </div>
        );
    }

    const hasWebhook = !!initialWebhookUrl;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-4">
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Webhook Configuration</h3>
                    <p className="text-sm text-muted-foreground">
                        Receive real-time notifications for your transactions.
                    </p>
                </div>
                {!isEditing ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        className="hover:bg-primary/10 text-primary"
                    >
                        {hasWebhook ? (
                            <>
                                <Edit2 className="w-4 h-4 mr-2" /> Edit URL
                            </>
                        ) : (
                            <>
                                <Link className="w-4 h-4 mr-2" /> Add Webhook URL
                            </>
                        )}
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4 mr-2" />
                            )}
                            {hasWebhook ? "Save Changes" : "Add Webhook"}
                        </Button>
                    </div>
                )}
            </div>

            <div className="space-y-4 max-w-2xl">
                {!isEditing ? (
                    <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">Current Webhook URL</Label>
                        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-mono break-all group flex justify-between items-center">
                            <span className={initialWebhookUrl ? "text-primary" : "text-muted-foreground italic"}>
                                {initialWebhookUrl || "No webhook URL configured"}
                            </span>
                        </div>
                        {!initialWebhookUrl && (
                            <p className="text-xs text-yellow-500/80 mt-2">
                                * You must add a webhook URL to receive automated transaction updates.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider">
                            Webhook URL <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            placeholder="https://your-api.com/webhooks/autoramp"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            className="bg-black/40 border-white/10 font-mono"
                        />
                        <p className="text-xs text-muted-foreground italic">
                            Enter the endpoint where you want to receive POST requests for transaction updates.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
