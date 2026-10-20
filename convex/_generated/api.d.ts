/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as ai from "../ai.js";
import type * as billing from "../billing.js";
import type * as collaboration from "../collaboration.js";
import type * as comments from "../comments.js";
import type * as databases from "../databases.js";
import type * as demo from "../demo.js";
import type * as devAuth from "../devAuth.js";
import type * as devAuthInternal from "../devAuthInternal.js";
import type * as documents from "../documents.js";
import type * as helpers from "../helpers.js";
import type * as mail from "../mail.js";
import type * as razorpay from "../razorpay.js";
import type * as templates from "../templates.js";
import type * as users from "../users.js";
import type * as versions from "../versions.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  ai: typeof ai;
  billing: typeof billing;
  collaboration: typeof collaboration;
  comments: typeof comments;
  databases: typeof databases;
  demo: typeof demo;
  devAuth: typeof devAuth;
  devAuthInternal: typeof devAuthInternal;
  documents: typeof documents;
  helpers: typeof helpers;
  mail: typeof mail;
  razorpay: typeof razorpay;
  templates: typeof templates;
  users: typeof users;
  versions: typeof versions;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
