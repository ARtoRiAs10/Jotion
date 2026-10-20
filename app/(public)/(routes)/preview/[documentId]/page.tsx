"use client";

import { Cover } from "@/components/cover";
import { PageTitle } from "@/components/page/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { toast } from "sonner";

interface DocumentIdPageProps {
  params: {
    documentId: Id<"documents">;
  };
}

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    [],
  );

  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const document = useQuery(api.documents.getById, {
    documentId: params.documentId,
  });
  const verify = useMutation(api.documents.verifyPublicPassword);

  if (document === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (document === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium">This page is not available</p>
        <p className="text-sm text-muted-foreground">
          The page may have been unpublished or the link is invalid.
        </p>
      </div>
    );
  }

  if (!document.isPublished) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium">This page is private</p>
        <p className="text-sm text-muted-foreground">
          Ask the owner to publish it to share it with you.
        </p>
      </div>
    );
  }

  const onUnlock = async () => {
    try {
      await verify({
        documentId: params.documentId,
        password,
      });
      setUnlocked(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Incorrect password",
      );
    }
  };

  if (document.hasPassword && !unlocked) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border p-6 text-center">
          <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
          <h1 className="mt-3 text-base font-semibold">This page is protected</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter the password you received to open{" "}
            {document.title || "this page"}.
          </p>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onUnlock()}
            placeholder="Password"
            className="mt-4"
          />
          <Button className="mt-3 w-full" onClick={onUnlock}>
            Open page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-40">
      <Cover preview url={document.coverImage} />
      <div className="mx-auto md:max-w-3xl lg:max-w-4xl">
        <div className="mt-10 px-4">
          <PageTitle preview initialData={document} />
        </div>
        <div className="px-4 pt-6">
          <Editor editable={false} onChange={() => undefined} initialContent={document.content} />
        </div>
      </div>
      <div className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>Published with</span>
        <span className="font-semibold text-foreground">Jotion</span>
      </div>
    </div>
  );
};

export default DocumentIdPage;
