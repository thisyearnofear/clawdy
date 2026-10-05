/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as forge from "../forge.js";
import type * as http from "../http.js";
import type * as ladder from "../ladder.js";
import type * as ladderRun from "../ladderRun.js";
import type * as league from "../league.js";
import type * as leagueRun from "../leagueRun.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_payload from "../lib/payload.js";
import type * as lineage from "../lineage.js";
import type * as matches from "../matches.js";
import type * as sync from "../sync.js";
import type * as trainingJobs from "../trainingJobs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  crons: typeof crons;
  forge: typeof forge;
  http: typeof http;
  ladder: typeof ladder;
  ladderRun: typeof ladderRun;
  league: typeof league;
  leagueRun: typeof leagueRun;
  "lib/identity": typeof lib_identity;
  "lib/payload": typeof lib_payload;
  lineage: typeof lineage;
  matches: typeof matches;
  sync: typeof sync;
  trainingJobs: typeof trainingJobs;
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
