"use client";

import {
  Edit2,
  Save,
  X,
  Loader2,
  Plus,
  Trash2,
  KeyRound,
  Copy,
  Check,
  Globe,
  AlertTriangle,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import {
  useMerchantStatus,
  useMerchantWebhooks,
  useMerchantProfile,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useRotateWebhookSecret,
} from "@/lib/hooks";
import { useAuthStore } from "@/lib/store";
import { Webhook } from "@/lib/merchant";

export default function WebhookSettingsView() {
  const { user } = useAuthStore();
  const { data: status, isLoading: isStatusLoading } = useMerchantStatus();
  const { data: profile, isLoading: isProfileLoading } = useMerchantProfile(
    status?.merchantId || undefined
  );

  const rawProfile = Array.isArray(profile) ? profile[0] : profile;
  const merchantId =
    (rawProfile?.id || status?.merchantId || user?.id) ?? undefined;

  const {
    data: webhooks = [],
    isLoading: isWebhooksLoading,
  } = useMerchantWebhooks(merchantId);

  const createMutation = useCreateWebhook(merchantId!);
  const updateMutation = useUpdateWebhook(merchantId!);
  const deleteMutation = useDeleteWebhook(merchantId!);
  const rotateMutation = useRotateWebhookSecret(merchantId!);

  const { toast } = useToast();

  // --- Local UI state ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editLabel, setEditLabel] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);

  const [secretModal, setSecretModal] = useState<{
    secret: string;
    label: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const isLoading = isStatusLoading || isProfileLoading || isWebhooksLoading;

  // --- Helpers ---
  const resetAddForm = () => {
    setNewUrl("");
    setNewLabel("");
    setShowAddForm(false);
  };

  const resetEditForm = () => {
    setEditingId(null);
    setEditUrl("");
    setEditLabel("");
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return url.startsWith("https://");
    } catch {
      return false;
    }
  };

  const handleCopySecret = useCallback(() => {
    if (!secretModal) return;
    navigator.clipboard.writeText(secretModal.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [secretModal]);

  // --- Handlers ---
  const handleAdd = async () => {
    if (!merchantId) return;
    if (!newUrl.trim()) {
      toast({ title: "Error", description: "Webhook URL is required.", variant: "destructive" });
      return;
    }
    if (!validateUrl(newUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid HTTPS URL.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await createMutation.mutateAsync({
        url: newUrl,
        label: newLabel || undefined,
      });
      resetAddForm();
      setSecretModal({ secret: res.data.secret, label: res.data.label || "Webhook" });
      toast({ title: "Success", description: "Webhook created successfully.", variant: "success" });
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create webhook.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleEdit = async (webhookId: string) => {
    if (!merchantId) return;
    if (!editUrl.trim()) {
      toast({ title: "Error", description: "Webhook URL cannot be empty.", variant: "destructive" });
      return;
    }
    if (!validateUrl(editUrl)) {
      toast({ title: "Invalid URL", description: "Please enter a valid HTTPS URL.", variant: "destructive" });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        webhookId,
        data: { url: editUrl, label: editLabel || undefined },
      });
      resetEditForm();
      toast({ title: "Success", description: "Webhook updated.", variant: "success" });
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update webhook.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleToggle = async (webhook: Webhook) => {
    if (!merchantId) return;
    try {
      await updateMutation.mutateAsync({
        webhookId: webhook.id,
        data: { active: !webhook.active },
      });
    } catch {
      toast({ title: "Error", description: "Failed to toggle webhook.", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!merchantId || !deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast({ title: "Success", description: "Webhook deleted.", variant: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to delete webhook.", variant: "destructive" });
    }
  };

  const handleRotate = async (webhook: Webhook) => {
    if (!merchantId) return;
    try {
      const res = await rotateMutation.mutateAsync(webhook.id);
      setSecretModal({
        secret: res.data.secret,
        label: webhook.label || "Webhook",
      });
      toast({ title: "Success", description: "Secret rotated. Old secret is now invalid.", variant: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to rotate secret.", variant: "destructive" });
    }
  };

  if (isLoading && webhooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Loading webhook settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Webhook Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Manage webhook endpoints to receive real-time transaction notifications.
          </p>
        </div>
        {!showAddForm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="hover:bg-primary/10 text-primary"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Webhook
          </Button>
        )}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="border border-white/10 rounded-lg p-4 space-y-3 bg-white/5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">New Webhook</Label>
            <Button variant="ghost" size="sm" onClick={resetAddForm} disabled={createMutation.isPending}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              URL <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="https://your-app.com/webhooks/autoramp"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="bg-black/40 border-white/10 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Label</Label>
            <Input
              placeholder="e.g. Production, Staging"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="bg-black/40 border-white/10"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={resetAddForm} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Webhook List */}
      {webhooks.length === 0 && !showAddForm ? (
        <div className="text-center py-12 text-muted-foreground space-y-2">
          <Globe className="w-10 h-10 mx-auto opacity-40" />
          <p className="text-sm">No webhooks configured yet.</p>
          <p className="text-xs">Click &quot;Add Webhook&quot; to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="border border-white/10 rounded-lg p-4 bg-white/5 space-y-3"
            >
              {editingId === wh.id ? (
                /* Edit Mode */
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL</Label>
                    <Input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="bg-black/40 border-white/10 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Label</Label>
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="bg-black/40 border-white/10"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={resetEditForm} disabled={updateMutation.isPending}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => handleEdit(wh.id)} disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                /* Display Mode */
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => handleToggle(wh)}
                        disabled={updateMutation.isPending}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          wh.active ? "bg-primary" : "bg-white/20"
                        }`}
                        title={wh.active ? "Disable" : "Enable"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                            wh.active ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono truncate max-w-[300px]">
                            {wh.url}
                          </span>
                          {wh.label && (
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              {wh.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Created {new Date(wh.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(wh.id);
                          setEditUrl(wh.url);
                          setEditLabel(wh.label || "");
                        }}
                        className="h-8 w-8 p-0"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRotate(wh)}
                        disabled={rotateMutation.isPending}
                        className="h-8 w-8 p-0"
                        title="Rotate Secret"
                      >
                        {rotateMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(wh)}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-black/90 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Delete Webhook
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this webhook? Events will no longer be sent to this URL.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono text-xs break-all">
              {deleteTarget.url}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Display Dialog */}
      <Dialog open={!!secretModal} onOpenChange={(open) => !open && setSecretModal(null)}>
        <DialogContent className="bg-black/90 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Webhook Secret — {secretModal?.label}
            </DialogTitle>
            <DialogDescription>
              Copy this secret now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2">
              <code className="flex-1 text-xs font-mono break-all text-primary">
                {secretModal?.secret}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopySecret}
                className="shrink-0 h-8 w-8 p-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-yellow-500/80 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Save this secret now. It won&apos;t be shown again.
            </p>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setSecretModal(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
