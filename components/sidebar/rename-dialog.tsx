"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

export const RenameDialog = ({
  open,
  title,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => void | Promise<void>;
}) => {
  const [value, setValue] = useState(title);

  useEffect(() => {
    if (open) setValue(title);
  }, [open, title]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Rename</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) onSubmit(value.trim());
          }}
        />
        <DialogFooter>
          <Button
            size="sm"
            disabled={!value.trim()}
            onClick={() => onSubmit(value.trim())}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
