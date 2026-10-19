import { redirect } from "next/navigation";

import { SUBJECTS_PATH } from "@/lib/auth";

/** The slot search now lives in each subject's view; old links land on the catalog. */
export default function SlotSearchPage() {
  redirect(SUBJECTS_PATH);
}
