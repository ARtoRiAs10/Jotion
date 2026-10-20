/**
 * A minimal Razorpay client.
 *
 * Razorpay is used instead of Stripe because the workspace is operated from
 * India — the checkout, the signature verification and the webhooks all
 * follow the Razorpay documentation.
 *
 * Without credentials the app falls back to the demo checkout, so nothing
 * breaks in development.
 */

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
}

export interface RazorpayPayment {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

const apiBase = "https://api.razorpay.com/v1";

export const isRazorpayConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/**
 * Creates an order. The amount is in **paise** (1 rupee = 100 paise).
 */
export const createRazorpayOrder = async (input: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder | null> => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;

  const response = await fetch(`${apiBase}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
    },
    body: JSON.stringify({
      amount: input.amountInPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
      payment_capture: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Razorpay could not create the order: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as RazorpayOrder;
};

/**
 * Verifies the signature of a payment — the same HMAC-SHA256 calculation
 * that Razorpay uses on its side.
 */
export const verifyRazorpaySignature = async (input: {
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;

  const payload = `${input.orderId}|${input.paymentId}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  const expected = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return expected === input.signature;
};

/**
 * Verifies the signature of a webhook.
 */
export const verifyRazorpayWebhook = async (input: {
  body: string;
  signature: string;
}) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input.body),
  );

  const expected = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return expected === input.signature;
};

/** Converts rupees to paise. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);

/** Converts paise to rupees. */
export const fromPaise = (paise: number) => paise / 100;

/**
 * The Razorpay checkout options for the browser widget.
 */
export const razorpayOptions = (input: {
  keyId: string;
  orderId: string;
  amountInPaise: number;
  name: string;
  description: string;
  email?: string;
  prefillName?: string;
  handler: (payment: RazorpayPayment) => void;
}) => ({
  key: input.keyId,
  order_id: input.orderId,
  amount: input.amountInPaise,
  currency: "INR",
  name: input.name,
  description: input.description,
  email: input.email,
  prefill: { name: input.prefillName },
  notes: { source: "jotion" },
  theme: { color: "#111111" },
  handler: input.handler,
  modal: {
    ondismiss: () => undefined,
  },
});
