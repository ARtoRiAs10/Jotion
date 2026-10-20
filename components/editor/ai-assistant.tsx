"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { BlockNoteEditor } from "@blocknote/core";
import { Languages, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AI_TASK_LABELS, AiTask } from "@/lib/ai";

const LANGUAGES = [
  "English",
  "German",
  "French",
  "Spanish",
  "Portuguese",
  "Dutch",
  "Polish",
  "Japanese",
];

/**
 * The AI writing assistant: improve, shorten, summarize, continue or
 * translate the selected text (or the whole page when nothing is selected).
 */
export const AiAssistant = ({
  editor,
  onChange,
}: {
  editor: BlockNoteEditor;
  onChange: (content: string) => void;
}) => {
  const assist = useAction(api.ai.assist);
  const [busy, setBusy] = useState<AiTask | null>(null);
  const [language, setLanguage] = useState("English");

  const run = async (task: AiTask) => {
    setBusy(task);
    try {
      // The text of a block — the content is a list of styled text parts.
      const textOf = (block: { content?: unknown }) =>
        ((block.content ?? []) as { text?: string }[])
          .map((part) => part.text ?? "")
          .join("");

      const selection = editor.getSelection();
      const selectedText = selection
        ? selection.blocks.map((block) => textOf(block)).join("\n")
        : "";
      const text = selectedText.trim()
        ? selectedText
        : editor.document.map((block) => textOf(block)).join("\n").trim();

      if (!text) {
        toast.error("There is nothing to work with");
        return;
      }

      const result = await assist({
        task,
        text,
        language: task === "translate" ? language : undefined,
      });

      if (!result?.text) {
        toast.error("The assistant did not return anything");
        return;
      }

      if (selectedText?.trim() && selection) {
        // Replace the selected text with the answer.
        editor.replaceBlocks(selection.blocks, [
          {
            type: "paragraph",
            content: result.text,
          },
        ]);
      } else {
        // Append the answer as a new block.
        editor.insertBlocks(
          [{ type: "paragraph", content: result.text }],
          editor.document[editor.document.length - 1]?.id,
          "after",
        );
      }

      onChange(JSON.stringify(editor.document, null, 2));
      toast.success("The assistant is done");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The assistant failed",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
          )}
          AI
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Writing assistant
        </DropdownMenuLabel>
        {(Object.keys(AI_TASK_LABELS) as AiTask[]).map((task) => (
          <DropdownMenuItem
            key={task}
            disabled={Boolean(busy)}
            onClick={() => run(task)}
          >
            {task === "translate" ? (
              <Languages className="mr-2 h-4 w-4" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {AI_TASK_LABELS[task]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onClick={(event) => {
            event.preventDefault();
          }}
          disabled
          className="justify-between text-xs text-muted-foreground"
        >
          Translate into
          <span className="ml-2">{language}</span>
        </DropdownMenuItem>
        {LANGUAGES.map((option) => (
          <DropdownMenuItem
            key={option}
            className="pl-8 text-xs"
            onClick={() => setLanguage(option)}
          >
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
