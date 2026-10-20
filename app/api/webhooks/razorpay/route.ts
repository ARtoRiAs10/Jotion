import { NextResponse } from "next/server";
import { verifyRazorpayWebhook } from "@/lib/razorpay";

export const runtime = "nodejs";

/**
 * The Razorpay webhook.
 *
 * Razorpay calls this URL when a payment was captured. The signature is
 * verified with the webhook secret, so the request can be trusted.
 *
 * Configure it in the Razorpay dashboard:
 *   POST https://<your-domain>/api/webhooks/razorpay
 *   Event: payment.captured
 */
export const POST = async (request: Request) => {
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const valid = await verifyRazorpayWebhook({ body, signature });
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    event?: string;
    payload?: {
      payment?: {
        id?: string;
        order_id?: string;
        amount?: number;
        notes?: Record<string, string>;
      };
    };
  };

  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payment = payload.payload?.payment;

  if (payload.event === "payment.captured" && payment?.notes?.invoiceId) {
    // The payment is confirmed by Razorpay itself. The subscription is
    // activated by the `razorpay:verifyPayment` mutation that the browser
    // calls with the signature — this hook only makes sure that the payment
    // really happened.
    console.info(
      `[razorpay] payment ${payment.id} captured for invoice ${payment.notes.invoiceId}`,
    );
  }

  return NextResponse.json({ ok: true });
};
