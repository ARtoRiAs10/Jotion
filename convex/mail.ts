import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { sendMail } from "../lib/mailer";

/**
 * Sends an e-mail. This is an *internal* action: it is only triggered by the
 * backend (through `ctx.scheduler.runAfter`) and can never be called from the
 * client.
 *
 * When `RESEND_API_KEY` is not configured the mail is written to the
 * deployment log instead, so the feature never breaks a development
 * environment.
 */
export const send = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    html: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    return await sendMail({
      to: args.to,
      subject: args.subject,
      body: args.body,
      html: args.html,
    });
  },
});
