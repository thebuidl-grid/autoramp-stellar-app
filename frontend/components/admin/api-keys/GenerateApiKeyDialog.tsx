"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi, getErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Check, UserCheck } from "lucide-react";

export function ApproveAccessDialog() {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Merchant fields
    const [email, setEmail] = useState("");
    const [merchantName, setMerchantName] = useState("");
    const [businessName, setBusinessName] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [success, setSuccess] = useState(false);
    const { toast } = useToast();

    const handleApprove = async () => {
        if (!email || !merchantName || !businessName || !websiteUrl) {
            toast({
                title: "Error",
                description: "All fields are required",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            await adminApi.approveMerchantAccess({
                email,
                name: merchantName,
                businessName,
                websiteUrl,
            });
            setSuccess(true);
            toast({
                title: "Success",
                description: "API access approved. Email sent to merchant.",
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: getErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setEmail("");
        setMerchantName("");
        setBusinessName("");
        setWebsiteUrl("");
        setSuccess(false);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => {
            if (!v) resetForm();
            setOpen(v);
        }}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <UserCheck className="h-4 w-4" />
                    Approve API Access
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Approve API Access</DialogTitle>
                    <DialogDescription>
                        Grant API access to a merchant. They will receive an email to create their own API keys.
                    </DialogDescription>
                </DialogHeader>

                {!success ? (
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Merchant Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="merchant@company.com"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="merchantName">Contact Name</Label>
                            <Input
                                id="merchantName"
                                value={merchantName}
                                onChange={(e) => setMerchantName(e.target.value)}
                                placeholder="John Doe"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="businessName">Business Name</Label>
                            <Input
                                id="businessName"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="Acme Corp"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="websiteUrl">Website URL</Label>
                            <Input
                                id="websiteUrl"
                                value={websiteUrl}
                                onChange={(e) => setWebsiteUrl(e.target.value)}
                                placeholder="https://company.com"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="py-8 text-center space-y-4">
                        <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="font-medium">Access Approved!</p>
                            <p className="text-sm text-muted-foreground">
                                An email has been sent to {email} with instructions to create their API keys.
                            </p>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {!success ? (
                        <Button onClick={handleApprove} disabled={isLoading}>
                            {isLoading ? "Approving..." : "Approve Access"}
                        </Button>
                    ) : (
                        <Button onClick={resetForm}>Done</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
