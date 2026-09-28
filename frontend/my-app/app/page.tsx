import { redirect } from "next/navigation";

import { HOME_PATH } from "@/lib/auth";

/** The root has no content of its own; the (app) layout sends guests on to login. */
export default function Root() {
  redirect(HOME_PATH);
}
