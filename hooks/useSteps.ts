import { useEffect, useMemo, useState } from "react";
import { Pedometer } from "expo-sensors";

type DaySteps = { date: string; value: number };

function startOfDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function isoDay(d: Date) {
    return d.toISOString().slice(0, 10);
}
function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

export function useSteps() {
    const [available, setAvailable] = useState<boolean | null>(null);
    const [today, setToday] = useState<number | null>(null);
    const [last7, setLast7] = useState<DaySteps[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();

    useEffect(() => {
        let cancelled = false;
        let sub: any;

        (async () => {
            try {
                const isAvail = await Pedometer.isAvailableAsync();
                if (cancelled) return;
                setAvailable(isAvail);

                // Request permissions (iOS: Motion & Fitness; Android: Activity Recognition)
                if ((Pedometer as any).requestPermissionsAsync) {
                    const { status } = await (Pedometer as any).requestPermissionsAsync();
                    if (status !== "granted") {
                        throw new Error("Permission not granted for motion activity.");
                    }
                }

                // Build last 7 days dates (including today)
                const days = Array.from({ length: 7 }).map((_, i) => {
                    const d = startOfDay(daysAgo(6 - i));
                    return d;
                });

                // Query step counts per-day (sequential to avoid sensor hiccups)
                const results: DaySteps[] = [];
                for (const d of days) {
                    const from = d;
                    const to = new Date(d);
                    to.setDate(to.getDate() + 1);
                    const { steps } = await Pedometer.getStepCountAsync(from, to).catch(() => ({ steps: 0 }));
                    results.push({ date: isoDay(d), value: steps ?? 0 });
                }
                if (cancelled) return;

                setLast7(results);

                const todayISO = isoDay(startOfDay());
                const todaySteps = results.find((r) => r.date === todayISO)?.value ?? 0;
                setToday(todaySteps);

                // (Optional) live subscription to increment “today” as user walks
                sub = Pedometer.watchStepCount(({ steps }) => {
                    // This increments since subscription start; we’ll just add it on top for a lively feel
                    setToday((prev) => (typeof prev === "number" ? prev + steps : steps));
                });
            } catch (e: any) {
                if (!cancelled) setError(e?.message ?? "Failed to read steps");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            if (sub && typeof sub.remove === "function") sub.remove();
        };
    }, []);

    const weeklyTotal = useMemo(
        () => last7.reduce((acc, d) => acc + d.value, 0),
        [last7]
    );

    return {
        available,
        today,
        last7,        // [{ date: 'YYYY-MM-DD', value: number }]
        weeklyTotal,
        loading,
        error,
    };
}
