"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * Filters kept in the URL, so a filtered view survives a reload and can be shared.
 * `initial` is read once; afterwards the screen owns its filters and writes them back
 * with `replace`, which does not add history entries or scroll.
 */
export function useUrlQuery(): {
  initial: URLSearchParams;
  replace: (params: URLSearchParams) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [initial] = useState(() => new URLSearchParams(searchParams.toString()));

  const replace = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  return { initial, replace };
}
