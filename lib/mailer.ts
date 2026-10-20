/**
 * A tiny, provider agnostic mailer.
 *
 * When `RESEND_API_KEY` is configured the mail is sent through Resend,
 * otherwise it is written to the server log. That keeps the product fully
 * functional in development while making the production integration a single
 * environment variable away.
 */

export interface MailMessage {
  to: string;
  subject: string;
  body: string;
  /** Optional HTML version of the body. */
  html?: string;
  from?: string;
}

const DEFAULT_FROM = "Jotion <hello@jotion.app>";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const toHtml = (subject: string, body: string) => `
<div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">${escapeHtml(subject)}</h1>
  <div style="font-size: 15px; line-height: 1.6; color: #333;">
    ${escapeHtml(body).replace(/\n/g, "<br />")}
  </div>
  <p style="margin-top: 32px; font-size: 12px; color: #888;">
    Sent with Jotion — the connected workspace where better, faster work happens.
  </p>
</div>`;

/**
 * Sends an e-mail. Returns the provider response, or `null` when no provider
 * is configured (the message is logged instead).
 */
export const sendMail = async (message: MailMessage) => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.info(
      `[mail] (no RESEND_API_KEY configured — logging instead)\n  to: ${message.to}\n  subject: ${message.subject}\n  body: ${message.body}`,
    );
    return { delivered: false, provider: "log" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: message.from ?? DEFAULT_FROM,
      to: message.to,
      subject: message.subject,
      text: message.body,
      html: message.html ?? toHtml(message.subject, message.body),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not send the e-mail: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as { id?: string };
  return { delivered: true, provider: "resend" as const, id: payload.id };
};

/** The e-mail templates used by Jotion. */
export const templates = {
  mention: (actor: string, documentTitle: string, body: string) => ({
    subject: `${actor} mentioned you in “${documentTitle}”`,
    body: `${actor} mentioned you in “${documentTitle}”:\n\n${body}`,
  }),
  invitation: (workspace: string, role: string) => ({
    subject: `You have been invited to ${workspace}`,
    body: `You have been invited to join the workspace “${workspace}” as ${role}. Sign in to accept the invitation.`,
  }),
  invoice: (invoiceNumber: string, amount: string) => ({
    subject: `Your Jotion invoice ${invoiceNumber}`,
    body: `A new invoice of ${amount} has been issued for your workspace.\n\nInvoice number: ${invoiceNumber}`,
  }),
  planChanged: (plan: string) => ({
    subject: `Your Jotion plan is now ${plan}`,
    body: `Your workspace has been moved to the ${plan} plan.`,
  }),
};
