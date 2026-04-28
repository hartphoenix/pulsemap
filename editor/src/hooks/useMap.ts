import { useState, useEffect } from "react";
import { Value } from "@sinclair/typebox/value";
import { PulseMapSchema } from "pulsemap/schema";
import type { PulseMap } from "pulsemap/schema";

const BASE_URL =
  "https://raw.githubusercontent.com/hartphoenix/pulsemap/main/maps";

export function useMap(mapId: string | null) {
  const [map, setMap] = useState<PulseMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapId) {
      setMap(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchMap() {
      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
        };
        const token = localStorage.getItem("pulsemap-gh-token");
        if (token) {
          headers.Authorization = `token ${token}`;
        }

        const response = await fetch(`${BASE_URL}/${mapId}.json`, { headers });
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? `Map not found: ${mapId}`
              : `Fetch failed: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();
        if (cancelled) return;

        if (!Value.Check(PulseMapSchema, data)) {
          const errors = [...Value.Errors(PulseMapSchema, data)];
          const detail = errors
            .slice(0, 3)
            .map((e) => `${e.path}: ${e.message}`)
            .join("; ");
          throw new Error(`Invalid map schema: ${detail}`);
        }

        setMap(data as PulseMap);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setMap(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMap();
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  return { map, loading, error };
}
