"use client";

import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentViewer } from "./DocumentViewer";

interface DocumentPreviewDialogProps {
    url: string | null | undefined;
    label: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileType?: 'pdf' | 'image' | 'auto';
}

export function DocumentPreviewDialog({
    url,
    label,
    open,
    onOpenChange,
    fileType = 'auto'
}: DocumentPreviewDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[90vh] bg-zinc-900 border-white/10 text-white p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-white/10">
                    <DialogTitle className="text-white text-xl">{label}</DialogTitle>
                </DialogHeader>
                <div className="p-6 overflow-auto h-full">
                    <DocumentViewer
                        url={url}
                        label={label}
                        fileType={fileType}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
