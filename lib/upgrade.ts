/**
 * Small event bus used to ask the user to upgrade when they hit a limit of
 * the current plan. Any component can call `requestUpgrade()` and the
 * `<UpgradeModal />` (mounted once in the app shell) takes care of the UI.
 */

export type UpgradeFeature =
  | "guests"
  | "pages"
  | "blocks"
  | "uploads"
  | "history"
  | "members"
  | "databases"
  | "general";

export const UPGRADE_EVENT = "jotion:upgrade";

export const requestUpgrade = (
  reason?: string,
  feature: UpgradeFeature = "general",
) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UPGRADE_EVENT, { detail: { reason, feature } }),
  );
};

/**
 * Server side errors are plain English strings ("Your Free plan allows up
 * to 10 blocks per page…"). When we see one of them we open the upgrade
 * modal instead of only showing a toast.
 */
export const looksLikePlanLimit = (message?: string | null) => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("plan allows") ||
    lower.includes("plan supports") ||
    lower.includes("upgrade to") ||
    lower.includes("upgrade for")
  );
};
