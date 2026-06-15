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
    const [userId, setUserId] = useState("");
    const [name, setName] = useState("");
    const [natureOfBusiness, setNatureOfBusiness] = useState("");
    const [description, setDescription] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [success, setSuccess] = useState(false);
    const { toast } = useToast();

    const handleApprove = async () => {
        if (!userId || !name || !natureOfBusiness || !websiteUrl) {
            toast({
                title: "Error",
                description: "User ID, Name, Nature of Business, and Website are required.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            await adminApi.approveMerchantAccess({
                userId,
                name,
                natureOfBusiness,
                description,
                websiteUrl,
            });
            setSuccess(true);
            toast({
                title: "Success",
                description: "Merchant API access approved.",
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
        setUserId("");
        setName("");
        setNatureOfBusiness("");
        setDescription("");
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
                            <Label htmlFor="userId">User ID</Label>
                            <Input
                                id="userId"
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                placeholder="550e8400-e29b-41d4-a716-446655440000"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="name">Business Name (Unique)</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="John Doe Enterprise"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="natureOfBusiness">Nature of Business</Label>
                            <Input
                                id="natureOfBusiness"
                                value={natureOfBusiness}
                                onChange={(e) => setNatureOfBusiness(e.target.value)}
                                placeholder="Retail / Tech"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">Business Description</Label>
                            <Input
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Optional description"
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
                                Merchant access has been granted for user {userId}.
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
