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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { adminApi, getErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Key, Copy, Check, Search } from "lucide-react";

export function GenerateApiKeyDialog() {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [name, setName] = useState("");
    const [businessName, setBusinessName] = useState("");
    const [trafficEstimate, setTrafficEstimate] = useState("");
    const [requestLimit, setRequestLimit] = useState("");
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (open && users.length === 0) {
            fetchUsers();
        }
    }, [open]);

    const fetchUsers = async () => {
        try {
            const response = await adminApi.getUsers(1, 100);
            setUsers(response.data.users);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to fetch users",
                variant: "destructive",
            });
        }
    };

    const handleGenerate = async () => {
        if (!selectedUserId) {
            toast({
                title: "Error",
                description: "Please select a user",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const response = await adminApi.createApiKeyForUser(selectedUserId, {
                name,
                businessName,
                trafficEstimate,
                requestLimit,
            });
            setGeneratedKey(response.data.key);
            toast({
                title: "Success",
                description: "API Key generated successfully",
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

    const copyToClipboard = () => {
        if (generatedKey) {
            navigator.clipboard.writeText(generatedKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const resetForm = () => {
        setSelectedUserId("");
        setName("");
        setBusinessName("");
        setTrafficEstimate("");
        setRequestLimit("");
        setGeneratedKey(null);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => {
            if (!v) resetForm();
            setOpen(v);
        }}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Key className="h-4 w-4" />
                    Generate API Key
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Generate API Key</DialogTitle>
                    <DialogDescription>
                        Create a new API key for a regular user. Enter details about their business and expected usage.
                    </DialogDescription>
                </DialogHeader>

                {!generatedKey ? (
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="user">User</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a user" />
                                </SelectTrigger>
                                <SelectContent>
                                    {users.map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="name">Key Name (Purpose)</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. My Business API"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="business">Business Name</Label>
                            <Input
                                id="business"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="e.g. Acme Corp"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="traffic">Expected Traffic</Label>
                                <Input
                                    id="traffic"
                                    value={trafficEstimate}
                                    onChange={(e) => setTrafficEstimate(e.target.value)}
                                    placeholder="e.g. 10k req/mo"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="limit">Request Limit</Label>
                                <Input
                                    id="limit"
                                    value={requestLimit}
                                    onChange={(e) => setRequestLimit(e.target.value)}
                                    placeholder="e.g. 100/min"
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-4 py-4">
                        <div className="rounded-md bg-amber-50 p-4 dark:bg-amber-900/20">
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                <strong>Important:</strong> Copy this key now. For security reasons, it will not be shown again.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                readOnly
                                value={generatedKey}
                                className="font-mono text-xs"
                            />
                            <Button size="icon" variant="outline" onClick={copyToClipboard}>
                                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {!generatedKey ? (
                        <Button onClick={handleGenerate} disabled={isLoading || !selectedUserId}>
                            {isLoading ? "Generating..." : "Generate Key"}
                        </Button>
                    ) : (
                        <Button onClick={resetForm}>Done</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
