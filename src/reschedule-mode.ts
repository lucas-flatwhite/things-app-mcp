export type RescheduleAction = "preview" | "apply" | "refused";

/**
 * Preview unless the caller both turns dryRun off and sets confirm.
 * A missing dryRun is a preview, so an omitted argument cannot move to-dos.
 */
export function resolveRescheduleAction(input: {
  dryRun?: boolean;
  confirm?: boolean;
}): RescheduleAction {
  if (input.dryRun !== false) {
    return "preview";
  }
  if (input.confirm === true) {
    return "apply";
  }
  return "refused";
}
