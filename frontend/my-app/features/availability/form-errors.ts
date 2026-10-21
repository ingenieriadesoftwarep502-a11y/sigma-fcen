import { ApiError, formErrors, requestErrorMessage } from "@/lib/api-client";

type FormFailure<F extends string> = {
  byField: Partial<Record<F, string[]>>;
  message: string | null;
};

/**
 * What a slot or template form shows for a failed request. On top of `formErrors`, a 403
 * (the monitor is not assigned to the subject in the term, RN-003.5) belongs to the subject
 * field, and the `conflicts` list of a template is dropped: its dates already appear in the
 * `start_time` message.
 */
export function availabilityFormErrors<F extends string>(
  error: unknown,
  fields: readonly F[],
): FormFailure<F> {
  if (error instanceof ApiError && error.status === 403 && fields.includes("subject" as F)) {
    const byField: Partial<Record<F, string[]>> = {};
    byField["subject" as F] = [requestErrorMessage(error)];
    return { byField, message: null };
  }
  const { byField, message } = formErrors<F | "conflicts">(error, [...fields, "conflicts"]);
  delete byField.conflicts;
  return { byField: byField as Partial<Record<F, string[]>>, message };
}
