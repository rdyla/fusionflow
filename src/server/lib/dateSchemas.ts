/**
 * Zod date validators — the authoritative guard against implausible dates.
 *
 * Route schemas used to type dates as a bare `z.string()` (or at best a
 * `^\d{4}-\d{2}-\d{2}$` shape check), which accepted half-typed years like
 * "0026-09-02" from `<input type="date">`. See src/shared/planDates.ts for the
 * full mechanism. Validating here means no UI path — current, future, or
 * scripted — can put a nonsense date in D1.
 *
 * Pick the right one:
 *   zPlanDate       — a required-format date. Rejects "" (matches the old regex
 *                     fields, which didn't accept empty either).
 *   zPlanDateOrBlank— date or "". For fields that were a bare `z.string()`,
 *                     where the client clears by sending an empty string.
 *   zPlanTimestamp  — date, optionally with a time component. For columns that
 *                     also hold SQLite CURRENT_TIMESTAMP values (completed_at).
 */
import { z } from "zod";
import { PLAN_DATE_ERROR, isPlanDate, isPlanTimestamp } from "../../shared/planDates";

export const zPlanDate = z.string().refine(isPlanDate, { message: PLAN_DATE_ERROR });

export const zPlanDateOrBlank = z
  .string()
  .refine((d) => d === "" || isPlanDate(d), { message: PLAN_DATE_ERROR });

export const zPlanTimestamp = z
  .string()
  .refine((d) => d === "" || isPlanTimestamp(d), { message: PLAN_DATE_ERROR });
