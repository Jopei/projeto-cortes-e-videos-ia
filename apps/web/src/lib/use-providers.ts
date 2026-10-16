"use client";

import { getProviders, type ProvidersResponse } from "@/lib/series";
import { useResource } from "@/lib/use-resource";

export function useProviders() {
  return useResource<ProvidersResponse>((signal) => getProviders(signal), "providers", {
    errorFallback: "Não foi possível carregar os provedores.",
  });
}
