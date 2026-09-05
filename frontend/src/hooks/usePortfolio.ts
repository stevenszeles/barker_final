import { useQuery } from "@tanstack/react-query";
import { getJSON } from "../services/api";
import type { Account, NavPoint, Position, RiskProfile, Snapshot, Trade } from "../types";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => getJSON<{ accounts: Account[] }>("/portfolio/accounts"),
    staleTime: 60_000,
  });
}

export function useSnapshot(account = "ALL") {
  return useQuery({
    queryKey: ["snapshot", account],
    queryFn: () => getJSON<Snapshot>("/portfolio/snapshot", { account }),
    staleTime: 30_000,
  });
}

export function useNav(account = "ALL", limit = 1200) {
  return useQuery({
    queryKey: ["nav", account, limit],
    queryFn: () => getJSON<NavPoint[]>("/portfolio/nav", { account, limit }),
    staleTime: 60_000,
  });
}

export function usePositions(account = "ALL") {
  return useQuery({
    queryKey: ["positions", account],
    queryFn: () => getJSON<Position[]>("/positions", { account }),
    staleTime: 30_000,
  });
}

export function useTrades(account = "ALL", limit = 1000) {
  return useQuery({
    queryKey: ["trades", account, limit],
    queryFn: () => getJSON<{ stamp: Snapshot["stamp"]; trades: Trade[] }>("/trade/blotter", { account, limit }),
    staleTime: 30_000,
  });
}

export function useRisk() {
  return useQuery({
    queryKey: ["risk-profile"],
    queryFn: () => getJSON<RiskProfile>("/risk/profile"),
    staleTime: 60_000,
  });
}
