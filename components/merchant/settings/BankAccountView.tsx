"use client";

import { Building2, CreditCard, Edit2, Save, X, Loader2, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { merchantApi } from "@/lib/merchant";
import { stablestackApi, Bank } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { useMerchantStatus, useMerchantBankAccounts } from "@/lib/hooks";

interface BankAccountViewProps {
    banks: Bank[];
}

const DisplayField = ({ label, value }: { label: string, value?: string }) => (
    <div className="space-y-1">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-medium text-white flex items-center gap-3">
            {label === "Bank Name" && <Building2 className="w-4 h-4 text-primary" />}
            {label === "Account Number" && <CreditCard className="w-4 h-4 text-secondary" />}
            {value || "N/A"}
        </div>
    </div>
);

export default function BankAccountView({ banks }: BankAccountViewProps) {
    const { data: status } = useMerchantStatus();
    const merchantId = status?.merchantId;

    // Granular fetch for bank accounts
    const { data: bankAccounts, isLoading, refetch } = useMerchantBankAccounts(merchantId || undefined);

    // Support multiple backend key variants for safety, but primarily rely on hook data
    const info = (Array.isArray(bankAccounts) && bankAccounts.length > 0) ? bankAccounts[0] : null;

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [formData, setFormData] = useState({
        bankCode: "",
        accountNumber: "",
        accountName: "",
        bankName: "",
    });
    const { toast } = useToast();

    // Sync state when info changes from the hook
    useEffect(() => {
        if (info) {
            setFormData({
                bankCode: info?.bankCode || "",
                accountNumber: info?.accountNumber || "",
                accountName: info?.accountName || "",
                bankName: info?.bankName || "",
            });
        }
    }, [info]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleBankChange = (value: string) => {
        const selectedBank = banks.find(b => b.institutionCode === value);
        setFormData(prev => ({
            ...prev,
            bankCode: value,
            bankName: selectedBank ? selectedBank.institutionName : prev.bankName
        }));
    };

    const resolveAccount = async () => {
        if (formData.accountNumber.length !== 10 || !formData.bankCode) return;

        setIsResolving(true);
        try {
            const response = await stablestackApi.resolveAccount(formData.bankCode, formData.accountNumber);
            if (response.data.data?.accountName) {
                setFormData(prev => ({ ...prev, accountName: response.data.data!.accountName! }));
                toast({
                    title: "Account Resolved",
                    description: `Account name: ${response.data.data.accountName}`,
                    variant: "success",
                });
            }
        } catch (error) {
            console.error("Failed to resolve account:", error);
            toast({
                title: "Resolution Failed",
                description: "Could not verify bank account. Please check the details.",
                variant: "destructive",
            });
        } finally {
            setIsResolving(false);
        }
    };

    const handleSave = async () => {
        if (!formData.accountName) {
            toast({
                title: "Error",
                description: "Please verify the account details before saving.",
                variant: "destructive",
            });
            return;
        }

        if (!merchantId) {
            toast({
                title: "Error",
                description: "Merchant ID not found. Please refresh the page.",
                variant: "destructive",
            });
            return;
        }

        setIsSaving(true);
        try {
            const existingAccountId = info?.id;

            if (existingAccountId) {
                await merchantApi.updateBankAccount(existingAccountId, {
                    ...formData,
                    merchantId: merchantId
                });
            } else {
                await merchantApi.submitBankAccount({
                    ...formData,
                    merchantId: merchantId
                });
            }

            toast({
                title: "Success",
                description: existingAccountId
                    ? "Settlement bank account updated successfully."
                    : "Settlement bank account created successfully.",
                variant: "success",
            });

            setIsEditing(false);
            refetch(); // Refresh specific resource
        } catch (error) {
            console.error("Failed to save bank account:", error);
            toast({
                title: "Error",
                description: "Failed to save settlement details. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading && !info) {
        return (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse text-sm">Fetching bank details...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Settlement Bank Account</h3>
                {!isEditing ? (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="hover:bg-primary/10 text-primary">
                        <Edit2 className="w-4 h-4 mr-2" /> Edit Account
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isSaving || isResolving}>
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4 mr-2" />
                            )}
                            Save Changes
                        </Button>
                    </div>
                )}
            </div>

            <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-white/10 rounded-2xl p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {!isEditing ? (
                        <>
                            <div className="md:col-span-2">
                                <DisplayField label="Account Name" value={formData.accountName} />
                            </div>
                            <DisplayField label="Bank Name" value={formData.bankName} />
                            <DisplayField label="Bank Code" value={formData.bankCode} />
                            <DisplayField label="Account Number" value={formData.accountNumber} />
                        </>
                    ) : (
                        <>
                            <div className="md:col-span-2 space-y-2">
                                <Label className="text-xs uppercase tracking-wider">Bank Name <span className="text-red-500">*</span></Label>
                                <SearchableBankSelect
                                    banks={banks}
                                    value={formData.bankCode}
                                    onValueChange={handleBankChange}
                                    placeholder="Search and select a bank"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider">Account Number <span className="text-red-500">*</span></Label>
                                <div className="flex gap-2">
                                    <Input
                                        name="accountNumber"
                                        value={formData.accountNumber}
                                        onChange={handleInputChange}
                                        maxLength={10}
                                        placeholder="0123456789"
                                        className="bg-black/40 border-white/10 h-14"
                                    />
                                    <Button
                                        variant="secondary"
                                        onClick={resolveAccount}
                                        disabled={isResolving || formData.accountNumber.length !== 10 || !formData.bankCode}
                                        className="h-14 px-6"
                                    >
                                        {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider">Account Name <span className="text-red-500">*</span></Label>
                                <div className={cn(
                                    "bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-medium h-14 flex items-center justify-between",
                                    !formData.accountName && "text-muted-foreground italic"
                                )}>
                                    {formData.accountName || "Verify account to see name"}
                                    {formData.accountName && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-400">
                <p>This is your primary settlement account. All crypto-to-fiat transactions will be credited here.</p>
            </div>
        </div>
    );
}
