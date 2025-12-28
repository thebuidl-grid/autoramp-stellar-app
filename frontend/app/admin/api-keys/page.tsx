"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAllApiKeys, useAllUsers, useCreateApiKeyForUser, useRevokeApiKey } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { Key, Plus, Trash2, Copy, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage, CreateApiKeyResponse } from "@/lib/api";
import { AxiosResponse } from "axios";

export default function AdminApiKeysPage() {
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [apiKeyName, setApiKeyName] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: apiKeysData, isLoading: loadingKeys } = useAllApiKeys(page, 10);
  const { data: usersData, isLoading: loadingUsers } = useAllUsers(1, 100);
  const createApiKey = useCreateApiKeyForUser();
  const revokeApiKey = useRevokeApiKey();

  const apiKeys = apiKeysData?.apiKeys || [];
  const users = usersData?.users || [];
  const totalPages = apiKeysData?.pagination?.totalPages || 1;

  const handleCreateApiKey = async () => {
    if (!selectedUserId) {
      toast({
        title: "Error",
        description: "Please select a user",
        variant: "destructive",
      });
      return;
    }

    createApiKey.mutate(
      { userId: selectedUserId, data: { name: apiKeyName || undefined } },
      {
        onSuccess: (response: any) => {
          // React Query with Axios returns the full AxiosResponse
          const data = response?.data || response;
          setNewKey(data.key);
          setShowNewKey(true);
          setSelectedUserId("");
          setApiKeyName("");
          toast({
            title: "API Key Created",
            description: "Make sure to copy the key now. It won't be shown again!",
            variant: "success",
          });
        },
        onError: (error) => {
          toast({
            title: "Failed to create API key",
            description: getErrorMessage(error),
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast({
        title: "Copied!",
        description: "API key copied to clipboard",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleRevoke = (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }

    revokeApiKey.mutate(id, {
      onSuccess: () => {
        toast({
          title: "API Key Revoked",
          description: "The API key has been revoked successfully",
          variant: "success",
        });
      },
    });
  };

  return (
    <div className="animate-fade-in">
      <Header
        title="API Key Management"
        description="Create and manage API keys for users"
      />

      {/* Create New API Key */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus size={20} />
            Create New API Key
          </CardTitle>
          <CardDescription>
            Generate a new API key for a user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select User</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user" />
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
            <div>
              <label className="text-sm font-medium mb-2 block">Key Name (Optional)</label>
              <Input
                placeholder="e.g., Production Key"
                value={apiKeyName}
                onChange={(e) => setApiKeyName(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleCreateApiKey}
            isLoading={createApiKey.isPending}
            disabled={!selectedUserId}
          >
            <Plus size={18} className="mr-2" />
            Create API Key
          </Button>
        </CardContent>
      </Card>

      {/* New Key Display */}
      {showNewKey && newKey && (
        <Card className="mb-8 border-success/50 bg-success/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <CheckCircle size={20} />
              API Key Created Successfully
            </CardTitle>
            <CardDescription>
              Copy this key now. You won't be able to see it again!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 p-4 rounded-lg bg-background border border-border">
              <code className="font-mono text-sm flex-1 break-all">{newKey}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyKey(newKey)}
              >
                <Copy size={16} className="mr-2" />
                Copy
              </Button>
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setShowNewKey(false);
                setNewKey(null);
              }}
            >
              Close
            </Button>
          </CardContent>
        </Card>
      )}

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key size={20} />
            All API Keys
          </CardTitle>
          <CardDescription>
            {apiKeysData?.pagination?.total || 0} total API keys
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingKeys ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Key className="mx-auto mb-4" size={48} />
              <p>No API keys found</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {apiKeys.map((apiKey) => (
                  <div
                    key={apiKey.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <code className="font-mono text-sm font-semibold">
                          {apiKey.keyPrefix}...
                        </code>
                        {apiKey.name && (
                          <Badge variant="outline">{apiKey.name}</Badge>
                        )}
                        <Badge
                          variant={apiKey.isActive ? "default" : "destructive"}
                        >
                          {apiKey.isActive ? "Active" : "Revoked"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {apiKey.user && (
                          <p>User: {apiKey.user.email}</p>
                        )}
                        <p>Created: {formatDate(apiKey.createdAt)}</p>
                        {apiKey.lastUsedAt && (
                          <p>Last used: {formatDate(apiKey.lastUsedAt)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {apiKey.isActive && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevoke(apiKey.id)}
                          isLoading={revokeApiKey.isPending}
                        >
                          <Trash2 size={16} className="mr-2" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-4 mt-8">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-muted-foreground flex items-center">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

