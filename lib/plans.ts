/**
 * Jotion pricing model.
 *
 * The plan catalogue lives here (and not in the UI) so that the exact same
 * definitions are used by:
 *   - the marketing pricing page,
 *   - the billing settings screen,
 *   - the Convex backend when it validates a checkout or enforces a limit.
 *
 * All monetary values are stored in **cents** to avoid floating point issues.
 */

export type PlanId = "free" | "plus" | "business" | "enterprise";
export type BillingCycle = "monthly" | "annual";
export type WorkspaceRole = "owner" | "admin" | "member" | "guest";

export interface PlanLimits {
  /** Maximum number of guest members invited to the workspace. */
  guests: number;
  /** Maximum number of blocks a single page may contain. */
  blocksPerPage: number;
  /** How long version history is retained, in days. 0 disables it. */
  versionHistoryDays: number;
  /** Maximum upload size per file, in megabytes. */
  fileUploadMb: number;
  /** Maximum number of pages in the workspace. */
  pages: number;
  /** Whether private (non teamspace) pages are allowed. */
  privatePages: boolean;
  /** Whether guests may be invited at all. */
  guestsAllowed: boolean;
  /** Maximum number of databases in the workspace. */
  databases: number;
  /** Maximum number of members (paid seats) in the workspace. */
  members: number;
  /** Maximum number of automations per database. */
  automations: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Price per seat, per month, when billed monthly. `null` = custom. */
  monthly: number | null;
  /** Price per seat, per month, when billed annually. `null` = custom. */
  annual: number | null;
  cta: string;
  highlight?: boolean;
  features: string[];
  limits: PlanLimits;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For individuals and small teams getting started.",
    monthly: 0,
    annual: 0,
    cta: "Start for free",
    features: [
      "Unlimited pages for your team",
      "Unlimited blocks per page",
      "Connect 1 workspace",
      "7-day version history",
      "10 guests",
      "100 MB file uploads",
    ],
    limits: {
      guests: 10,
      blocksPerPage: 100,
      versionHistoryDays: 7,
      fileUploadMb: 100,
      pages: 1000,
      privatePages: false,
      guestsAllowed: true,
      databases: 3,
      members: 3,
      automations: 0,
    },
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "For power users who want more control and history.",
    monthly: 12,
    annual: 10,
    cta: "Upgrade to Plus",
    highlight: true,
    features: [
      "Everything in Free, plus:",
      "Unlimited private pages",
      "Unlimited guests",
      "Longer version history (30 days)",
      "5 GB file uploads per member",
      "Custom domains & branding",
    ],
    limits: {
      guests: Number.POSITIVE_INFINITY,
      blocksPerPage: Number.POSITIVE_INFINITY,
      versionHistoryDays: 30,
      fileUploadMb: 5000,
      pages: Number.POSITIVE_INFINITY,
      privatePages: true,
      guestsAllowed: true,
      databases: Number.POSITIVE_INFINITY,
      members: Number.POSITIVE_INFINITY,
      automations: 5,
    },
  },
  {
    id: "business",
    name: "Business",
    tagline: "For companies that need security, scale and admin control.",
    monthly: 24,
    annual: 20,
    cta: "Upgrade to Business",
    features: [
      "Everything in Plus, plus:",
      "SAML SSO / SCIM provisioning",
      "Private teamspaces & groups",
      "Advanced permissions & audit log",
      "1 year version history",
      "Priority support",
    ],
    limits: {
      guests: Number.POSITIVE_INFINITY,
      blocksPerPage: Number.POSITIVE_INFINITY,
      versionHistoryDays: 365,
      fileUploadMb: 100000,
      pages: Number.POSITIVE_INFINITY,
      privatePages: true,
      guestsAllowed: true,
      databases: Number.POSITIVE_INFINITY,
      members: Number.POSITIVE_INFINITY,
      automations: Number.POSITIVE_INFINITY,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For organizations with advanced security and compliance needs.",
    monthly: null,
    annual: null,
    cta: "Contact sales",
    features: [
      "Everything in Business, plus:",
      "SAML SCIM & automated user provisioning",
      "Advanced security & compliance controls",
      "Audit log & data residency",
      "Custom retention policies",
      "Dedicated success manager",
    ],
    limits: {
      guests: Number.POSITIVE_INFINITY,
      blocksPerPage: Number.POSITIVE_INFINITY,
      versionHistoryDays: Number.POSITIVE_INFINITY,
      fileUploadMb: Number.POSITIVE_INFINITY,
      pages: Number.POSITIVE_INFINITY,
      privatePages: true,
      guestsAllowed: true,
      databases: Number.POSITIVE_INFINITY,
      members: Number.POSITIVE_INFINITY,
      automations: Number.POSITIVE_INFINITY,
    },
  },
];

export const PLAN_MAP: Record<PlanId, Plan> = PLANS.reduce(
  (acc, plan) => {
    acc[plan.id] = plan;
    return acc;
  },
  {} as Record<PlanId, Plan>,
);

export const getPlan = (id?: string | null): Plan =>
  (id && PLAN_MAP[id as PlanId]) || PLAN_MAP.free;

export const isPlanId = (value?: string | null): value is PlanId =>
  typeof value === "string" && value in PLAN_MAP;

export const priceFor = (planId: PlanId, cycle: BillingCycle): number | null => {
  const plan = PLAN_MAP[planId];
  if (!plan) return null;
  return cycle === "annual" ? plan.annual : plan.monthly;
};

/** Money is stored in cents to avoid floating point issues. */
export const toCents = (dollars: number) => Math.round(dollars * 100);

export const formatMoney = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

export interface SubscriptionState {
  plan: PlanId;
  cycle: BillingCycle;
  seats: number;
  status: string;
  currentPeriodEnd?: number;
  trialEndsAt?: number;
}

export const PLATFORM_FEE = 0;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Length of a billing period in days. */
export const PERIOD_DAYS: Record<BillingCycle, number> = {
  monthly: 30,
  annual: 365,
};

/**
 * Total price of a subscription in cents for a given number of seats.
 * Annual plans are billed once per year, so the returned value covers the
 * whole year (this is what the customer is actually charged today).
 */
export const subscriptionTotal = (
  planId: PlanId,
  cycle: BillingCycle,
  seats: number,
): number => {
  const unit = priceFor(planId, cycle);
  if (unit === null) return 0;
  const perMonth = toCents(unit) * Math.max(1, seats);
  return cycle === "annual" ? perMonth * 12 : perMonth;
};

/**
 * The price of one seat for one month, in cents. Used for prorated
 * invoices and for the "per member / month" label in the UI.
 */
export const seatMonthlyPrice = (
  planId: PlanId,
  cycle: BillingCycle,
): number => {
  const unit = priceFor(planId, cycle);
  if (unit === null) return 0;
  return toCents(unit);
};

/** Percentage saved by paying annually instead of monthly. */
export const annualSavingsPercent = (plan: Plan): number => {
  if (!plan.monthly || !plan.annual) return 0;
  return Math.round((1 - plan.annual / plan.monthly) * 100);
};

/**
 * Feature gating helper. `value` is the numeric limit of the feature.
 */
export type NumericLimitKey =
  | "guests"
  | "blocksPerPage"
  | "versionHistoryDays"
  | "fileUploadMb"
  | "pages"
  | "databases"
  | "members"
  | "automations";

export const limitFor = (planId: PlanId, key: NumericLimitKey) =>
  getPlan(planId).limits[key] as number;

export const withinLimit = (
  planId: PlanId,
  key: NumericLimitKey,
  current: number,
  increment = 1,
) => {
  const limit = limitFor(planId, key);
  if (limit === Number.POSITIVE_INFINITY) return true;
  return current + increment <= limit;
};

/** Human readable limit, used in billing UI + upgrade nudges. */
export const describeLimit = (limit: number) =>
  limit === Number.POSITIVE_INFINITY ? "Unlimited" : String(limit);

/* ------------------------------------------------------------------ */
/*  Feature matrix                                                     */
/* ------------------------------------------------------------------ */

export type FeatureKey =
  | "privatePages"
  | "unlimitedBlocks"
  | "guests"
  | "versionHistory"
  | "fileUploads"
  | "sso"
  | "scim"
  | "auditLog"
  | "customDomain"
  | "prioritySupport"
  | "dedicatedSupport"
  | "customRetention"
  | "dataResidency"
  | "apiAccess"
  | "automations"
  | "advancedPermissions";

export type FeatureValue = boolean | number | string;

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  privatePages: "Private pages",
  unlimitedBlocks: "Unlimited blocks",
  guests: "Guests",
  versionHistory: "Version history",
  fileUploads: "File uploads",
  sso: "SAML SSO",
  scim: "SCIM provisioning",
  auditLog: "Audit log",
  customDomain: "Custom domains",
  prioritySupport: "Priority support",
  dedicatedSupport: "Dedicated success manager",
  customRetention: "Custom retention policies",
  dataResidency: "Data residency",
  apiAccess: "API access",
  automations: "Automations",
  advancedPermissions: "Advanced permissions",
};

export const FEATURE_MATRIX: Record<PlanId, Record<FeatureKey, FeatureValue>> = {
  free: {
    privatePages: false,
    unlimitedBlocks: false,
    guests: 10,
    versionHistory: "7 days",
    fileUploads: "100 MB",
    sso: false,
    scim: false,
    auditLog: false,
    customDomain: false,
    prioritySupport: false,
    dedicatedSupport: false,
    customRetention: false,
    dataResidency: false,
    apiAccess: false,
    automations: false,
    advancedPermissions: false,
  },
  plus: {
    privatePages: true,
    unlimitedBlocks: true,
    guests: "Unlimited",
    versionHistory: "30 days",
    fileUploads: "5 GB",
    sso: false,
    scim: false,
    auditLog: false,
    customDomain: true,
    prioritySupport: false,
    dedicatedSupport: false,
    customRetention: false,
    dataResidency: false,
    apiAccess: false,
    automations: true,
    advancedPermissions: false,
  },
  business: {
    privatePages: true,
    unlimitedBlocks: true,
    guests: "Unlimited",
    versionHistory: "1 year",
    fileUploads: "100 GB",
    sso: true,
    scim: true,
    auditLog: true,
    customDomain: true,
    prioritySupport: true,
    dedicatedSupport: false,
    customRetention: false,
    dataResidency: false,
    apiAccess: true,
    automations: true,
    advancedPermissions: true,
  },
  enterprise: {
    privatePages: true,
    unlimitedBlocks: true,
    guests: "Unlimited",
    versionHistory: "Custom",
    fileUploads: "Unlimited",
    sso: true,
    scim: true,
    auditLog: true,
    customDomain: true,
    prioritySupport: true,
    dedicatedSupport: true,
    customRetention: true,
    dataResidency: true,
    apiAccess: true,
    automations: true,
    advancedPermissions: true,
  },
};

export const hasFeature = (
  planId: PlanId,
  key: FeatureKey,
  value?: FeatureValue,
) => {
  const current = FEATURE_MATRIX[planId][key];
  if (value === undefined) return Boolean(current);
  return current === value;
};

/* ------------------------------------------------------------------ */
/*  Coupons                                                            */
/* ------------------------------------------------------------------ */

export interface Coupon {
  code: string;
  /** Percentage discount (0-100). */
  percentOff: number;
  /** Fixed discount in cents. */
  amountOff: number;
  /** Restrict the coupon to a list of plans (empty = all plans). */
  plans: PlanId[];
  /** ISO date after which the coupon can no longer be redeemed. */
  expiresAt?: string;
  description?: string;
}

export const COUPONS: Coupon[] = [
  {
    code: "JOTION20",
    percentOff: 20,
    amountOff: 0,
    plans: [],
    description: "20% off your first year",
  },
  {
    code: "EDU50",
    percentOff: 50,
    amountOff: 0,
    plans: ["plus", "business"],
    description: "50% off for students & non-profits",
  },
  {
    code: "WELCOME10",
    percentOff: 0,
    amountOff: 1000,
    plans: [],
    description: "$10 off your first invoice",
  },
];

export const findCoupon = (code?: string | null): Coupon | undefined => {
  if (!code) return undefined;
  const normalised = code.trim().toUpperCase();
  return COUPONS.find((coupon) => coupon.code === normalised);
};

export interface CouponValidation {
  valid: boolean;
  reason?: string;
  coupon?: Coupon;
}

/** Validates a coupon code against a plan. */
export const validateCoupon = (
  code: string | undefined,
  planId: PlanId,
): CouponValidation => {
  const coupon = findCoupon(code);
  if (!coupon) {
    return { valid: false, reason: "This promo code is not recognised" };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: "This promo code has expired" };
  }
  if (coupon.plans.length > 0 && !coupon.plans.includes(planId)) {
    return {
      valid: false,
      reason: `This promo code does not apply to the ${getPlan(planId).name} plan`,
    };
  }
  return { valid: true, coupon };
};

/** Applies a coupon to a subtotal (in cents) and returns the discount. */
export const discountFor = (subtotalCents: number, coupon?: Coupon | null) => {
  if (!coupon || subtotalCents <= 0) return 0;
  const percent = Math.round((subtotalCents * coupon.percentOff) / 100);
  const discount = Math.min(subtotalCents, percent + coupon.amountOff);
  return Math.max(0, discount);
};

/* ------------------------------------------------------------------ */
/*  Quotes & proration                                                 */
/* ------------------------------------------------------------------ */

export interface QuoteInput {
  planId: PlanId;
  cycle: BillingCycle;
  seats: number;
  couponCode?: string | null;
  /** An already validated coupon (e.g. a workspace promo code). */
  coupon?: Coupon | null;
  taxRate?: number;
  /** When true the quote only covers one month (used for prorations). */
  prorated?: boolean;
  /** Fraction of the period that is still remaining (0-1). */
  fraction?: number;
}

export interface Quote {
  planId: PlanId;
  planName: string;
  cycle: BillingCycle;
  seats: number;
  /** Price per seat per month, in cents. */
  unitPrice: number;
  /** Undiscounted amount, in cents. */
  subtotal: number;
  /** Discount applied, in cents. */
  discount: number;
  /** Tax applied, in cents. */
  tax: number;
  /** Total due, in cents. */
  total: number;
  couponCode?: string;
  couponValid: boolean;
  couponReason?: string;
  taxRate: number;
  periodDays: number;
  /** Effective monthly price after the discount, in cents. */
  effectiveMonthly: number;
}

/**
 * Calculates what a customer would pay. This is the single place where
 * money is computed — the marketing page, the checkout page, the billing
 * settings and the Convex backend all funnel through it.
 */
export const buildQuote = (input: QuoteInput): Quote => {
  const plan = getPlan(input.planId);
  const unitPrice = seatMonthlyPrice(input.planId, input.cycle);
  const seats = Math.max(1, Math.floor(input.seats || 1));
  const periodDays = PERIOD_DAYS[input.cycle];
  const months = input.cycle === "annual" ? 12 : 1;

  let subtotal = unitPrice * seats * months;
  if (input.prorated) {
    const fraction = Math.min(1, Math.max(0, input.fraction ?? 1));
    subtotal = Math.round(subtotal * fraction);
  }

  // A coupon that was resolved by the server (workspace promo codes are not
  // part of the global catalogue) is used as is.
  const validation = input.coupon
    ? { valid: true as const, coupon: input.coupon }
    : input.couponCode
      ? validateCoupon(input.couponCode, input.planId)
      : { valid: true as const, coupon: undefined };

  const discount = validation.valid
    ? discountFor(subtotal, validation.coupon)
    : 0;

  const taxRate = Math.max(0, input.taxRate ?? 0);
  const tax = Math.round((subtotal - discount) * taxRate);

  const total = Math.max(0, subtotal - discount + tax);

  return {
    planId: plan.id,
    planName: plan.name,
    cycle: input.cycle,
    seats,
    unitPrice,
    subtotal,
    discount,
    tax,
    total,
    couponCode: input.couponCode?.trim().toUpperCase() || undefined,
    couponValid: validation.valid,
    couponReason: validation.reason,
    taxRate,
    periodDays,
    effectiveMonthly:
      seats > 0 ? Math.round((total / (months * seats)) || 0) : 0,
  };
};

/**
 * Fraction of a billing period that is still remaining. Used to prorate
 * upgrades and seat changes.
 */
export const remainingFraction = (
  periodStart: number,
  periodEnd: number,
  now = Date.now(),
) => {
  const total = periodEnd - periodStart;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (periodEnd - now) / total));
};

/**
 * Prorated credit for the plan the customer is leaving, in cents.
 */
export const prorationCredit = (
  planId: PlanId,
  cycle: BillingCycle,
  seats: number,
  fraction: number,
) =>
  Math.round(
    seatMonthlyPrice(planId, cycle) * Math.max(1, seats) * Math.min(1, Math.max(0, fraction)),
  );

export interface PlanChangePreview {
  isUpgrade: boolean;
  /** Credit for the time left on the current plan, in cents. */
  credit: number;
  /** Cost of the new plan for the remaining period, in cents. */
  charge: number;
  /** Amount due today (0 for downgrades), in cents. */
  dueToday: number;
  /** New monthly price per seat, in cents. */
  newUnitPrice: number;
  /** New monthly price for the whole workspace, in cents. */
  newMonthlyTotal: number;
}

/**
 * Previews what a plan change costs. Upgrades are charged (prorated) right
 * away, downgrades are scheduled for the end of the period and cost nothing
 * today.
 */
export const planChangePreview = ({
  from,
  to,
  cycle,
  seats,
  fraction,
}: {
  from: PlanId;
  to: PlanId;
  cycle: BillingCycle;
  seats: number;
  fraction: number;
}): PlanChangePreview => {
  const seatCount = Math.max(1, seats);
  const credit = prorationCredit(from, cycle, seatCount, fraction);
  const charge = prorationCredit(to, cycle, seatCount, fraction);
  const isUpgrade = subscriptionTotal(to, cycle, seatCount) >
    subscriptionTotal(from, cycle, seatCount);
  return {
    isUpgrade,
    credit,
    charge,
    dueToday: isUpgrade ? Math.max(0, charge - credit) : 0,
    newUnitPrice: seatMonthlyPrice(to, cycle),
    newMonthlyTotal: seatMonthlyPrice(to, cycle) * seatCount,
  };
};

export const PLAN_UPGRADE_PATH: Record<PlanId, PlanId[]> = {
  free: ["plus", "business", "enterprise"],
  plus: ["business", "enterprise"],
  business: ["enterprise"],
  enterprise: [],
};

export const PLAN_DOWNGRADE_PATH: Record<PlanId, PlanId[]> = {
  free: [],
  plus: ["free"],
  business: ["plus", "free"],
  enterprise: ["business", "plus", "free"],
};

/* ------------------------------------------------------------------ */
/*  Permissions                                                        */
/* ------------------------------------------------------------------ */

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  guest: 0,
};

export const can = (
  role: WorkspaceRole,
  action:
    | "manageBilling"
    | "manageMembers"
    | "editPage"
    | "comment"
    | "viewAuditLog"
    | "deleteWorkspace"
    | "manageCoupons"
    | "managePaymentMethods",
) => {
  switch (action) {
    case "manageBilling":
    case "manageCoupons":
    case "managePaymentMethods":
      return role === "owner";
    case "manageMembers":
      return role === "owner" || role === "admin";
    case "deleteWorkspace":
      return role === "owner";
    case "viewAuditLog":
      return role === "owner" || role === "admin";
    case "editPage":
      return role !== "guest";
    case "comment":
      return true;
    default:
      return false;
  }
};

/* ------------------------------------------------------------------ */
/*  Marketing copy                                                     */
/* ------------------------------------------------------------------ */

export const PRICING_FAQ = [
  {
    question: "Can I try paid features before I pay?",
    answer:
      "Yes. Every paid plan starts with a 14 day free trial. You can cancel at any time during the trial and you will not be charged.",
  },
  {
    question: "What counts as a seat?",
    answer:
      "Every member of a workspace counts as a seat, including guests. Admins can remove inactive guests at any time to free up seats.",
  },
  {
    question: "How does annual billing work?",
    answer:
      "Annual plans are billed once per year and save up to 20% compared to monthly billing. You can add seats mid-cycle and the difference is prorated.",
  },
  {
    question: "What happens when I downgrade?",
    answer:
      "Your workspace keeps working until the end of the billing period, then moves to the plan's limits. We never delete your data.",
  },
  {
    question: "Do you offer education or non-profit pricing?",
    answer:
      "Yes — students, teachers and non-profits get 50% off any paid plan. Use the promo code EDU50 at checkout or contact us for a tailored quote.",
  },
  {
    question: "Can I change plans at any time?",
    answer:
      "Absolutely. Upgrades apply immediately and are prorated, downgrades take effect at the end of the current billing period.",
  },
  {
    question: "How do upgrades and seat changes work mid-cycle?",
    answer:
      "You only pay for the days you have left in the current period. Jotion shows the exact prorated amount before you confirm the change.",
  },
  {
    question: "Which payment methods do you accept?",
    answer:
      "All major credit and debit cards are accepted, and Business and Enterprise plans can pay by invoice with a purchase order.",
  },
];

export const COMPARISON_ROWS: {
  label: string;
  values: Record<PlanId, string>;
}[] = [
  {
    label: "Pages",
    values: { free: "Unlimited", plus: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
  },
  {
    label: "Blocks per page",
    values: { free: "100", plus: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
  },
  {
    label: "Version history",
    values: { free: "7 days", plus: "30 days", business: "1 year", enterprise: "Custom" },
  },
  {
    label: "File uploads",
    values: { free: "100 MB", plus: "5 GB", business: "100 GB", enterprise: "Unlimited" },
  },
  {
    label: "Guests",
    values: { free: "10", plus: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
  },
  {
    label: "Private pages",
    values: { free: "—", plus: "✓", business: "✓", enterprise: "✓" },
  },
  {
    label: "Custom domains",
    values: { free: "—", plus: "✓", business: "✓", enterprise: "✓" },
  },
  {
    label: "SAML SSO",
    values: { free: "—", plus: "—", business: "✓", enterprise: "✓" },
  },
  {
    label: "SCIM provisioning",
    values: { free: "—", plus: "—", business: "✓", enterprise: "✓" },
  },
  {
    label: "Audit log",
    values: { free: "—", plus: "—", business: "✓", enterprise: "✓" },
  },
  {
    label: "API access",
    values: { free: "—", plus: "—", business: "✓", enterprise: "✓" },
  },
  {
    label: "Support",
    values: { free: "Community", plus: "Email", business: "Priority", enterprise: "Dedicated" },
  },
];
