/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as customMovies from "../customMovies.js";
import type * as roomMembers from "../roomMembers.js";
import type * as rooms from "../rooms.js";
import type * as simple from "../simple.js";
import type * as subtitles from "../subtitles.js";
import type * as sync from "../sync.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";
import type * as watchLogs from "../watchLogs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  customMovies: typeof customMovies;
  roomMembers: typeof roomMembers;
  rooms: typeof rooms;
  simple: typeof simple;
  subtitles: typeof subtitles;
  sync: typeof sync;
  users: typeof users;
  utils: typeof utils;
  watchLogs: typeof watchLogs;
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
