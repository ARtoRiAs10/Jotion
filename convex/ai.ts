import { v } from "convex/values";
import { action } from "./_generated/server";
import { runAiTask } from "../lib/ai";

/**
 * The AI assistant.
 *
 * The action is public (the browser has to be able to call it) but it
 * requires a signed-in user and the API key never leaves the backend.
 */
export const assist = action({
  args: {
    task: v.string(),
    text: v.string(),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You have to be signed in to use the assistant");
    }

    // A little guard against abuse: the prompt has to be reasonable.
    if (args.text.length > 20000) {
      throw new Error("The text is too long");
    }

    return await runAiTask({
      task: args.task as never,
      text: args.text,
      language: args.language,
    });
  },
});
