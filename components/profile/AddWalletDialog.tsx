"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateWallet } from "@/lib/hooks/use-saved-wallets";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface AddWalletDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddWalletDialog({ open, onOpenChange }: AddWalletDialogProps) {
    const { toast } = useToast();
    const createWallet = useCreateWallet();

    const [walletAddress, setWalletAddress] = useState("");
    const [network, setNetwork] = useState("ethereum");
    const [name, setName] = useState("");

    const handleAdd = async () => {
        if (!walletAddress) {
            toast({
                title: "Missing wallet address",
                description: "Please enter a wallet address",
                variant: "destructive",
            });
            return;
        }

        // Basic validation for Ethereum-like addresses
        if (!walletAddress.startsWith("0x") || walletAddress.length !== 42) {
            toast({
                title: "Invalid wallet address",
                description: "Please enter a valid wallet address (0x...)",
                variant: "destructive",
            });
            return;
        }

        createWallet.mutate(
            {
                walletAddress,
                network,
                name: name || undefined,
            },
            {
                onSuccess: () => {
                    toast({
                        title: "Success",
                        description: "Wallet added successfully!",
                        variant: "success",
                    });
                    handleClose();
                },
                onError: (error) => {
                    toast({
                        title: "Error",
                        description: getErrorMessage(error),
                        variant: "destructive",
                    });
                },
            }
        );
    };

    const handleClose = () => {
        setWalletAddress("");
        setNetwork("ethereum");
        setName("");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800">
                <DialogHeader>
                    <DialogTitle className="text-white">Add Wallet</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Add a wallet address to your saved wallets for quick access.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="walletAddress" className="text-zinc-200">
                            Wallet Address
                        </Label>
                        <Input
                            id="walletAddress"
                            placeholder="0x..."
                            value={walletAddress}
                            onChange={(e) => setWalletAddress(e.target.value.trim())}
                            className="bg-zinc-800 border-zinc-700 text-white font-mono"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="network" className="text-zinc-200">
                            Network
                        </Label>
                        <select
                            id="network"
                            value={network}
                            onChange={(e) => setNetwork(e.target.value)}
                            className="w-full h-10 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none"
                        >
                            <option value="ethereum">Ethereum</option>
                            <option value="polygon">Polygon</option>
                            <option value="base">Base</option>
                            <option value="arbitrum">Arbitrum</option>
                            <option value="optimism">Optimism</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-zinc-200">
                            Name (Optional)
                        </Label>
                        <Input
                            id="name"
                            placeholder="My Main Wallet"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-white"
                        />
                        <p className="text-xs text-zinc-400">
                            Give this wallet a friendly name for easy identification
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        className="text-zinc-400 hover:text-white"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleAdd}
                        disabled={createWallet.isPending}
                        className="bg-primary hover:bg-primary/90"
                    >
                        {createWallet.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Add Wallet
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
