"use client";

import { IconPicker } from "@/components/icon-picker";
import { useCoverImage } from "@/hooks/use-cover-image";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { ImageIcon, Smile, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import TextAreaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";

interface PageTitleProps {
  initialData: Doc<"documents">;
  preview?: boolean;
}

export const PageTitle = ({ initialData, preview }: PageTitleProps) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialData.title || "Untitled");

  const update = useMutation(api.documents.update);
  const removeIcon = useMutation(api.documents.removeIcon);
  const coverImage = useCoverImage();

  useEffect(() => {
    setValue(initialData.title || "Untitled");
  }, [initialData.title]);

  const enableInput = () => {
    if (preview) return;
    setIsEditing(true);
    setTimeout(() => {
      setValue(initialData.title || "Untitled");
      inputRef.current?.focus();
    }, 0);
  };

  const disableInput = () => setIsEditing(false);

  const onInput = (next: string) => {
    setValue(next);
    update({ id: initialData._id, title: next || "Untitled" });
  };

  return (
    <div className="group relative">
      <div className="flex items-center gap-x-2">
        {!!initialData.icon && !preview && (
          <div className="group/icon flex items-center gap-x-2">
            <IconPicker onChange={(icon) => update({ id: initialData._id, icon })}>
              <p className="cursor-pointer text-6xl leading-none transition hover:opacity-75">
                {initialData.icon}
              </p>
            </IconPicker>
            <Button
              onClick={() => removeIcon({ id: initialData._id })}
              className="h-6 w-6 rounded-full text-muted-foreground opacity-0 transition group-hover/icon:opacity-100"
              variant="outline"
              size="icon"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {!!initialData.icon && preview && (
          <p className="text-6xl leading-none">{initialData.icon}</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-center gap-x-1 opacity-0 transition group-hover:opacity-100">
        {!initialData.icon && !preview && (
          <IconPicker
            asChild
            onChange={(icon) => update({ id: initialData._id, icon })}
          >
            <Button className="text-xs text-muted-foreground" variant="outline" size="sm">
              <Smile className="mr-2 h-4 w-4" />
              Add icon
            </Button>
          </IconPicker>
        )}
        {!initialData.coverImage && !preview && (
          <Button
            onClick={coverImage.onOpen}
            className="text-xs text-muted-foreground"
            variant="outline"
            size="sm"
          >
            <ImageIcon className="mr-2 h-4 w-4" />
            Add cover
          </Button>
        )}
      </div>

      {isEditing && !preview ? (
        <TextAreaAutosize
          ref={inputRef}
          onBlur={disableInput}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              disableInput();
            }
          }}
          value={value}
          onChange={(event) => onInput(event.target.value)}
          className="mt-2 w-full resize-none break-words bg-transparent text-4xl font-bold text-foreground outline-none"
          minRows={1}
        />
      ) : (
        <div
          onClick={enableInput}
          className="mt-2 cursor-text break-words text-4xl font-bold text-foreground"
        >
          {initialData.title || "Untitled"}
        </div>
      )}
    </div>
  );
};
