import type { Provider } from "../models";
import type { GenProvider } from "./types";
import { kieProvider } from "./kie";

export type { GenProvider, GenInput } from "./types";

const REGISTRY: Record<Provider, GenProvider> = {
  kie: kieProvider,
};

export function getProvider(provider: Provider): GenProvider {
  const p = REGISTRY[provider];
  if (!p) throw new Error(`未知 provider：${provider}`);
  return p;
}
