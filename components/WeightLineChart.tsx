// components/WeightLineChartSvg.tsx
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { G, Path, Circle, Line, Text as SvgText, Rect, Defs, LinearGradient, Stop } from "react-native-svg";

type Pt = { x: Date; y: number };

function parseDateSafe(input?: string | number | null): Date | null {
    if (!input) return null;
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
        const s = String(input);
        let ms = Number(s);
        if (s.length >= 16) ms = ms / 1_000_000; // ns -> ms
        else if (s.length >= 13) ms = ms;        // ms
        else if (s.length >= 10) ms = ms * 1000; // s -> ms
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(String(input));
    return isNaN(d.getTime()) ? null : d;
}

export default function WeightLineChartSvg({
                                               progress,
                                               height = 240,
                                               width = 360,
                                               padding = 36,
                                               gridLines = 4,
                                           }: {
    progress: { dateISO: string | number; weightKg?: number | null }[];
    height?: number;
    width?: number;
    padding?: number;
    gridLines?: number;
}) {
    const [sel, setSel] = useState<number | null>(null);

    const { points, xMin, xMax, yMin, yMax } = useMemo(() => {
        const pts: Pt[] = (progress ?? [])
            .map((p) => {
                const d = parseDateSafe(p.dateISO);
                const y = typeof p.weightKg === "number" ? p.weightKg : undefined;
                return d && y != null ? { x: d, y } : null;
            })
            .filter(Boolean)
            .sort((a: any, b: any) => a.x.getTime() - b.x.getTime()) as Pt[];

        const ys = pts.map((p) => p.y);
        const minY = ys.length ? Math.min(...ys) : 0;
        const maxY = ys.length ? Math.max(...ys) : 0;
        const padY = Math.max(0.5, (maxY - minY) * 0.1); // add some air

        const xs = pts.map((p) => p.x.getTime());
        const minX = xs.length ? Math.min(...xs) : Date.now();
        const maxX = xs.length ? Math.max(...xs) : Date.now();

        return {
            points: pts,
            xMin: minX,
            xMax: maxX,
            yMin: minY - padY,
            yMax: maxY + padY,
        };
    }, [progress]);

    // Not enough data
    if (points.length < 2) {
    return (
        <View
            style={{
                height,
                borderRadius: 16,
                backgroundColor: "#1B1C2C",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <SvgText fill="#A5B4FC">Log a couple of weights to see your trend.</SvgText>
        </View>
    );
    }

    // Scales
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    const sx = (t: number) => {
        if (xMax === xMin) return padding + innerW / 2;
        return padding + ((t - xMin) / (xMax - xMin)) * innerW;
    };
    const sy = (y: number) => {
        if (yMax === yMin) return padding + innerH / 2;
        // SVG y grows downward, so invert
        return padding + innerH - ((y - yMin) / (yMax - yMin)) * innerH;
    };

    // Path (polyline – simple & crisp)
    const d = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x.getTime())} ${sy(p.y)}`)
        .join(" ");

    // X ticks (4)
    const xTicks = 4;
    const xTickVals = new Array(xTicks + 1).fill(0).map((_, i) => xMin + ((xMax - xMin) * i) / xTicks);

    // Y ticks (gridLines)
    const yTickVals = new Array(gridLines + 1)
        .fill(0)
        .map((_, i) => yMin + ((yMax - yMin) * i) / gridLines);

    const selPt = sel != null ? points[sel] : null;
    const tooltipX = selPt ? sx(selPt.x.getTime()) : 0;
    const tooltipY = selPt ? sy(selPt.y) : 0;

    // Simple tooltip text
    const tipDate = selPt?.x.toLocaleDateString();
    const tipVal = selPt ? `${selPt.y.toFixed(1)} kg` : "";

    // Keep tooltip within bounds
    const tipW = 110;
    const tipH = 40;
    let tipRectX = Math.min(Math.max(tooltipX - tipW / 2, padding), padding + innerW - tipW);
    const tipRectY = Math.max(tooltipY - tipH - 10, padding);

    return (
        <View style={{ height, borderRadius: 16, overflow: "hidden", backgroundColor: "#0D0F1C" }}>
            <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
                <Defs>
                    <LinearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0%" stopColor="#C084FC" />
                        <Stop offset="100%" stopColor="#7C3AED" />
                    </LinearGradient>
                    <LinearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor="rgba(124,58,237,0.35)" />
                        <Stop offset="100%" stopColor="rgba(15,17,26,0)" />
                    </LinearGradient>
                </Defs>

                {/* Grid */}
                <G>
                    {yTickVals.map((yv, i) => (
                        <Line
                            key={`gy-${i}`}
                            x1={padding}
                            x2={padding + innerW}
                            y1={sy(yv)}
                            y2={sy(yv)}
                            stroke="rgba(148,163,184,0.2)"
                            strokeWidth={1}
                        />
                    ))}
                </G>

                {/* Axes */}
                <Line x1={padding} x2={padding + innerW} y1={padding + innerH} y2={padding + innerH} stroke="rgba(148,163,184,0.3)" />
                <Line x1={padding} x2={padding} y1={padding} y2={padding + innerH} stroke="rgba(148,163,184,0.3)" />

                {/* X tick labels */}
                <G>
                    {xTickVals.map((t, i) => (
                        <SvgText
                            key={`xt-${i}`}
                            x={sx(t)}
                            y={padding + innerH + 18}
                            fontSize="10"
                            fill="#94A3B8"
                            textAnchor="middle"
                        >
                            {new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </SvgText>
                    ))}
                </G>

                {/* Y tick labels */}
                <G>
                    {yTickVals.map((yv, i) => (
                        <SvgText key={`yt-${i}`} x={padding - 8} y={sy(yv) + 3} fontSize="10" fill="#94A3B8" textAnchor="end">
                            {`${Math.round(yv)} kg`}
                        </SvgText>
                    ))}
                </G>

                {/* Area fill */}
                <Path
                    d={`${d} L ${padding + innerW} ${padding + innerH} L ${padding} ${padding + innerH} Z`}
                    fill="url(#fillGradient)"
                    opacity={0.3}
                />

                {/* Line */}
                <Path d={d} fill="none" stroke="url(#lineGradient)" strokeWidth={3} strokeLinecap="round" />

                {/* Points (tap to show tooltip) */}
                <G>
                    {points.map((p, i) => {
                        const cx = sx(p.x.getTime());
                        const cy = sy(p.y);
                        return (
                            <G key={`pt-${i}`}>
                                <Circle
                                    cx={cx}
                                    cy={cy}
                                    r={3.5}
                                    fill="#C084FC"
                                    onPressIn={() => setSel(i)}
                                    onPressOut={() => setSel(i)}
                                />
                                {/* Larger invisible tap target */}
                                <Circle cx={cx} cy={cy} r={12} fill="transparent" onPressIn={() => setSel(i)} />
                            </G>
                        );
                    })}
                </G>

                {/* Tooltip */}
                {selPt ? (
                    <G>
                        {/* pointer */}
                        <Line x1={tooltipX} x2={tooltipX} y1={tooltipY} y2={tipRectY + tipH} stroke="#7C3AED" strokeDasharray="3,3" />
                        {/* box */}
                        <Rect x={tipRectX} y={tipRectY} width={tipW} height={tipH} rx={8} ry={8} fill="#0F111C" opacity={0.95} />
                        <SvgText
                            x={tipRectX + 8}
                            y={tipRectY + 16}
                            fontSize="11"
                            fill="#FFFFFF"
                            fontWeight="bold"
                        >
                            {tipVal}
                        </SvgText>
                        <SvgText
                            x={tipRectX + 8}
                            y={tipRectY + 30}
                            fontSize="10"
                            fill="#94A3B8"
                        >
                            {tipDate}
                        </SvgText>
                    </G>
                ) : null}
            </Svg>
        </View>
    );
}
