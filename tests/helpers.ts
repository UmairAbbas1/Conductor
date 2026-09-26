import { Decision } from "../lib/types.ts";

/** Throws if a value is not a valid Decision. */
export function DecisionSchemaCheck(value: unknown) {
  Decision.parse(value);
}
