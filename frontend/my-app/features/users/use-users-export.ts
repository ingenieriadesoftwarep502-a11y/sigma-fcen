"use client";

import { useState } from "react";

import { requestErrorMessage } from "@/lib/api-client";
import { saveFile } from "@/lib/download";
import { exportUsers, type UserFilters } from "@/lib/users";

/** Downloads the users matching some filters as an .xlsx file, with busy and error state. */
export function useUsersExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(filters: UserFilters) {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await exportUsers(filters);
      saveFile(blob, filename);
    } catch (failure) {
      setError(requestErrorMessage(failure));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, error, download };
}
