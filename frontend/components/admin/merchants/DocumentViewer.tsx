"use client";

import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Download, Maximize2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";

/**
 * Loads a KYC document through the authenticated proxy and exposes it as a blob URL. <img> and
 * <iframe> cannot send an Authorization header, so the document is fetched with the admin token
 * and displayed from memory (the proxy no longer serves documents to anonymous requests).
 */
export function useAuthedDocument(url: string | null | undefined) {
    const [state, setState] = useState<{ forUrl: string | null; blobUrl: string | null; failed: boolean }>({
        forUrl: null,
        blobUrl: null,
        failed: false,
    });

    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        let objectUrl: string | null = null;
        const token = useAuthStore.getState().token;

        fetch(`/api/docs/proxy?url=${encodeURIComponent(url)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: "no-store",
        })
            .then((r) => {
                if (!r.ok) throw new Error(String(r.status));
                return r.blob();
            })
            .then((blob) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setState({ forUrl: url, blobUrl: objectUrl, failed: false });
            })
            .catch(() => {
                if (!cancelled) setState({ forUrl: url, blobUrl: null, failed: true });
            });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);

    const current = state.forUrl === url;
    return {
        blobUrl: current ? state.blobUrl : null,
        failed: current && state.failed,
        loading: !!url && !current,
    };
}

interface DocumentViewerProps {
    url: string | null | undefined;
    label: string;
    fileType?: 'pdf' | 'image' | 'auto';
    onFullScreen?: () => void;
}

export function DocumentViewer({ url, label, fileType = 'auto', onFullScreen }: DocumentViewerProps) {
    const doc = useAuthedDocument(url);
    const [renderError, setRenderError] = useState(false);
    const loadError = doc.failed || renderError;
    const isLoading = doc.loading;

    if (!url) {
        return (
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-800 rounded-md">
                        <FileText className="h-4 w-4 text-zinc-600" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-zinc-200">{label}</p>
                        <p className="text-[10px] text-zinc-600">Not uploaded</p>
                    </div>
                </div>
                <span className="text-xs text-zinc-600 italic">Not Available</span>
            </div>
        );
    }

    // Auto-detect file type from URL
    const detectedType = fileType === 'auto'
        ? (url.toLowerCase().split('?')[0].endsWith('.pdf') ? 'pdf' : 'image')
        : fileType;

    const isPdf = detectedType === 'pdf';

    // Blob URL of the document, fetched through the authenticated proxy
    const proxyUrl = doc.blobUrl ?? "";

    const handleDownload = () => {
        window.open(url, '_blank');
    };

    return (
        <div className="space-y-3">
            {/* Document Header/Tile */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-white/10 hover:border-primary/30 transition-all group">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className={cn(
                        "p-2 rounded-md transition-colors",
                        isPdf ? "bg-red-500/10 group-hover:bg-red-500/20" : "bg-blue-500/10 group-hover:bg-blue-500/20"
                    )}>
                        {isPdf ? (
                            <FileText className="h-4 w-4 text-red-400" />
                        ) : (
                            <ImageIcon className="h-4 w-4 text-blue-400" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{label}</p>
                        <p className="text-[10px] text-zinc-500">
                            {isPdf ? 'PDF' : 'IMAGE'} • Secured Access
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {onFullScreen && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onFullScreen}
                            className="h-8 text-zinc-400 hover:text-white hover:bg-white/10 px-2"
                        >
                            <Maximize2 className="h-4 w-4 mr-1" />
                            <span className="text-xs">View</span>
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDownload}
                        className="h-8 text-zinc-400 hover:text-white hover:bg-white/10 px-2"
                    >
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Document Preview Area (Only if no full screen handler provided or for specific inline use) */}
            {!onFullScreen && (
                <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black/40 min-h-[400px]">
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        </div>
                    )}

                    {loadError ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
                            <AlertCircle className="h-10 w-10 text-zinc-600" />
                            <div className="space-y-1">
                                <p className="text-sm text-zinc-400 font-medium">Failed to load preview</p>
                                <p className="text-xs text-zinc-600">You may need to sign in again as an admin, or the document is too large to preview.</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleDownload} className="mt-2 border-white/10">
                                Open in New Tab
                            </Button>
                        </div>
                    ) : !proxyUrl ? null : (
                        isPdf ? (
                            <iframe
                                src={`${proxyUrl}#toolbar=0`}
                                className="w-full h-[500px] border-none"
                                title={label}
                                onError={() => setRenderError(true)}
                            />
                        ) : (
                            <div className="flex items-center justify-center p-4">
                                <img
                                    src={proxyUrl}
                                    alt={label}
                                    className="max-w-full h-auto max-h-[600px] object-contain"
                                    onError={() => setRenderError(true)}
                                />
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
