'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

type ApiRow = {
  base_month_day: string;
  current_month_total_amount_released: string;
  record_month_total_amount_released: string;
  last_year_current_month_total_amount_released: string;
};

type ChartRow = {
  x: number;
  current: number | null;
  lastYear: number;
  record: number;
};

function parseDay(v: unknown): number {
  if (typeof v === 'number') return Math.floor(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (!s || s === 'nan' || s === 'null' || s === 'undefined') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function cumulative(daily: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const v of daily) {
    acc += v;
    out.push(acc);
  }
  return out;
}

function cumAtProgress(cum: number[], L: number, p: number): number {
  if (L <= 0) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return cum[L - 1] ?? 0;

  const dayFloat = p * L;
  const loDay = Math.floor(dayFloat);
  const hiDay = Math.min(loDay + 1, L);
  const loIndex = Math.max(loDay - 1, -1);
  const hiIndex = hiDay - 1;
  const loValue = loIndex >= 0 ? (cum[loIndex] ?? 0) : 0;
  const hiValue = cum[hiIndex] ?? loValue;
  const loPos = loDay;
  const hiPos = hiDay;

  if (hiPos === loPos) return hiValue;

  const t = (dayFloat - loPos) / (hiPos - loPos);
  return loValue + (hiValue - loValue) * t;
}

type TransformMeta = {
  currentMonthLen: number;
  recordMonthLen: number;
  todayDay: number;
  currentProgressX: number;
};

function transformApiToNormalizedChart(rows: ApiRow[]): { data: ChartRow[]; meta: TransformMeta } {
  const empty = {
    data: [{ x: 0, current: 0, lastYear: 0, record: 0 }],
    meta: { currentMonthLen: 31, recordMonthLen: 31, todayDay: 0, currentProgressX: 0 },
  };
  if (!rows?.length) return empty;

  const sorted = [...rows].sort((a, b) => parseDay(a.base_month_day) - parseDay(b.base_month_day));

  const byDay = new Map<number, ApiRow>();
  for (const r of sorted) {
    const day = parseDay(r.base_month_day);
    if (day >= 1 && day <= 31) byDay.set(day, r);
  }

  let todayDay = 0;
  for (const r of sorted) {
    const d = parseDay(r.base_month_day);
    if (d <= 0) continue;
    const raw = (r.current_month_total_amount_released ?? '').toString().trim().toLowerCase();
    if (raw !== 'nan') todayDay = Math.max(todayDay, d);
  }
  if (todayDay === 0) {
    todayDay = Math.max(...sorted.map((r) => parseDay(r.base_month_day)).filter((d) => d > 0), 0);
  }

  const inferLen = (keys: (keyof ApiRow)[]): number => {
    let L = 0;
    for (const r of sorted) {
      const d = parseDay(r.base_month_day);
      if (d <= 0) continue;
      for (const k of keys) {
        const raw = (r[k] ?? '').toString().trim().toLowerCase();
        if (raw && raw !== 'nan') {
          L = Math.max(L, d);
          break;
        }
      }
    }
    if (L === 0) {
      L = Math.max(...sorted.map((r) => parseDay(r.base_month_day)).filter((d) => d > 0), 31);
    }
    return Math.min(Math.max(L, 28), 31);
  };

  const currentMonthLen = inferLen(['current_month_total_amount_released', 'last_year_current_month_total_amount_released']);
  const recordMonthLen = inferLen(['record_month_total_amount_released']);

  todayDay = Math.min(todayDay, currentMonthLen);

  const buildDaily = (key: keyof ApiRow, L: number): number[] => {
    const arr: number[] = [];
    for (let d = 1; d <= L; d++) {
      const r = byDay.get(d);
      const raw = r ? (r[key] ?? '0') : '0';
      arr.push(toNumber(raw));
    }
    return arr;
  };

  const currentCum = cumulative(buildDaily('current_month_total_amount_released', currentMonthLen));
  const lastYearCum = cumulative(buildDaily('last_year_current_month_total_amount_released', currentMonthLen));
  const recordCum = cumulative(buildDaily('record_month_total_amount_released', recordMonthLen));
  const currentProgress = currentMonthLen > 0 ? todayDay / currentMonthLen : 0;
  const currentProgressX = Math.round(currentProgress * 100);
  const data: ChartRow[] = [];
  for (let x = 0; x <= 100; x++) {
    const p = x / 100;

    const currentVal = cumAtProgress(currentCum, currentMonthLen, p);
    const lastYearVal = cumAtProgress(lastYearCum, currentMonthLen, p);
    const recordVal = cumAtProgress(recordCum, recordMonthLen, p);

    data.push({
      x,
      current: x > currentProgressX ? null : currentVal,
      lastYear: lastYearVal,
      record: recordVal,
    });
  }

  return {
    data,
    meta: { currentMonthLen, recordMonthLen, todayDay, currentProgressX },
  };
}

function SplitFlapValue({ value, delay = 0 }: { value: string; delay?: number }) {
  const chars = useMemo(() => value.split(''), [value]);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setLocked(false);

    const CHAR_STAGGER_MS = 80;
    const FLIP_MS = 1000;
    const total = delay + (chars.length - 1) * CHAR_STAGGER_MS + FLIP_MS;

    const t = window.setTimeout(() => setLocked(true), total);
    return () => window.clearTimeout(t);
  }, [delay, chars.length]);

  return (
    <div className="flex overflow-hidden flip-perspective">
      {chars.map((char, i) => {
        const d = delay + i * 80;
        return (
          <div key={i} className="overflow-hidden">
            <div
              className={`${locked ? '' : 'roll-down-3d'} interblack`}
              style={locked ? undefined : { animationDelay: `${d}ms` }}
            >
              {char}
            </div>
          </div>
        );
      })}
    </div>
  );
}


export default function Page() {
  const [data, setData] = useState<ChartRow[]>([]);
  const [meta, setMeta] = useState<TransformMeta>({
    currentMonthLen: 31,
    recordMonthLen: 31,
    todayDay: 0,
    currentProgressX: 0,
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)'); // Tailwind md breakpoint
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [cardsReady, setCardsReady] = useState(false);
  const didStartCards = useRef(false);
  const [showChart, setShowChart] = useState(false);
  const [chartVisible, setChartVisible] = useState(false);
  const [dotsVisible, setDotsVisible] = useState(false);
  const [cycle, setCycle] = useState(0);
  const retryCountRef = useRef(0);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const [overlayMounted, setOverlayMounted] = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const OVERLAY_FADE_MS = 650;
  const LINE_ANIM_MS = 3500;
  const LINE_ANIM_DELAY_MS = 500;
  const DOT_GROW_MS = 950;
  const ERROR_RETRY_MS = 2000;
  const MAX_RETRIES = 3;
  const REPLAY_PRELOADER_MS = 1500;
  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });
  const PIXEL_SHIFT_MAX = 4;
  const PIXEL_SHIFT_INTERVAL_MS = 30_000;

  const loadData = async () => {
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      setDataReady(false);

      const res = await fetch('/api/dashboard/monthly-performance', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('Monthly performance fetch failed:', res.status, text);
        setError(`API error: ${res.status}`);
        setData([{ x: 0, current: 0, lastYear: 0, record: 0 }]);

        retryCountRef.current += 1;
        if (retryCountRef.current <= MAX_RETRIES) {
          setTimeout(() => window.location.reload(), ERROR_RETRY_MS);
        }
        return;
      }

      const json = (await res.json()) as ApiRow[];
      const { data: chartData, meta: chartMeta } = transformApiToNormalizedChart(json);

      setData(chartData);
      setMeta(chartMeta);
      setDataReady(true);
      setCycle((c) => c + 1);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('Monthly performance fetch crashed:', e);
      setError(e?.message ?? 'Unknown fetch error');
      setData([{ x: 0, current: 0, lastYear: 0, record: 0 }]);

      retryCountRef.current += 1;
      if (retryCountRef.current <= MAX_RETRIES) {
        setTimeout(() => window.location.reload(), ERROR_RETRY_MS);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return () => refreshControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!dataReady) return;

    const HOURLY_MS = 60 * 60 * 1000;
    const id = window.setInterval(() => {
      loadData();
    }, HOURLY_MS);

    return () => window.clearInterval(id);
  }, [dataReady]);

  useEffect(() => {
    if (!dataReady) return;

    const rand = () => Math.floor(Math.random() * (PIXEL_SHIFT_MAX * 2 + 1)) - PIXEL_SHIFT_MAX;

    const id = window.setInterval(() => {
      setPixelShift({ x: rand(), y: rand() });
    }, PIXEL_SHIFT_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [dataReady]);

  useEffect(() => {
    if (!dataReady) return;

    const CYCLE_MS = 300_000;

    const id = window.setInterval(() => {
      setOverlayMounted(true);
      requestAnimationFrame(() => setOverlayVisible(true));

      window.setTimeout(() => {
        setCycle((c) => c + 1);

        requestAnimationFrame(() => setOverlayVisible(false));
        window.setTimeout(() => setOverlayMounted(false), OVERLAY_FADE_MS);
      }, REPLAY_PRELOADER_MS);
    }, CYCLE_MS);

    return () => window.clearInterval(id);
  }, [dataReady, OVERLAY_FADE_MS, REPLAY_PRELOADER_MS]);

  useEffect(() => {
    if (!dataReady) return;

    didStartCards.current = false;
    setCardsReady(false);

    setShowChart(false);
    setChartVisible(false);
    setDotsVisible(false);
  }, [cycle, dataReady]);

  useEffect(() => {
    const overlayShouldShow = !dataReady;

    if (overlayShouldShow) {
      setOverlayMounted(true);
      requestAnimationFrame(() => setOverlayVisible(true));
      return;
    }

    setOverlayVisible(false);
    const t = setTimeout(() => setOverlayMounted(false), OVERLAY_FADE_MS);
    return () => clearTimeout(t);
  }, [dataReady, OVERLAY_FADE_MS]);

  useEffect(() => {
    if (didStartCards.current) return;
    if (!dataReady) return;
    if (loading) return;
    if (overlayMounted) return;
    if (!data.length) return;

    didStartCards.current = true;
    const t = setTimeout(() => setCardsReady(true), 100);
    return () => clearTimeout(t);
  }, [cycle, dataReady, loading, overlayMounted, data.length]);

  useEffect(() => {
    if (!dataReady) return;
    if (overlayMounted) return;

    let raf1 = 0;
    let raf2 = 0;
    let raf3 = 0;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setShowChart(true);
        raf3 = requestAnimationFrame(() => setChartVisible(true));
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      cancelAnimationFrame(raf3);
    };
  }, [cycle, dataReady, overlayMounted]);

  useEffect(() => {
    if (!dataReady) return;
    if (overlayMounted) return;

    setDotsVisible(false);
    const t = setTimeout(() => setDotsVisible(true), LINE_ANIM_DELAY_MS + LINE_ANIM_MS);
    return () => clearTimeout(t);
  }, [cycle, dataReady, overlayMounted]);

  const lineConfig = useMemo(() => {
    if (isMobile) {
      return {
        current: { color: '#ffd200', strokeWidth: 6, circleRadius: 34, fontSize: 16 },
        lastYear: { color: '#ff4a00', strokeWidth: 3, circleRadius: 22, fontSize: 12 },
        record: { color: '#9ccfc9', strokeWidth: 2, circleRadius: 22, fontSize: 12 },
      };
    }

    return {
      current: { color: '#ffd200', strokeWidth: 15, circleRadius: 65, fontSize: 32 },
      lastYear: { color: '#ff4a00', strokeWidth: 10, circleRadius: 40, fontSize: 20 },
      record: { color: '#9ccfc9', strokeWidth: 7.5, circleRadius: 40, fontSize: 20 },
    };
  }, [isMobile]);


  const formatBubble = (value: number) => {
    const millions = value / 1_000_000;
    if (millions < 10) {
      const rounded = Math.ceil(millions * 10) / 10;
      const text = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
      return `${text}M`;
    }
    return `${Math.ceil(millions)}M`;
  };

  const { yAxisMax, todayLabel, lastYearLabel, recordLabel, recordDiffLabel } = useMemo(() => {
    if (!data.length) {
      return { yAxisMax: 0, todayLabel: '0M', lastYearLabel: '0M', recordLabel: '0M', recordDiffLabel: '0M' };
    }

    const maxValue = Math.max(...data.flatMap((d) => [d.current ?? 0, d.lastYear ?? 0, d.record ?? 0]));
    const yAxisMax = maxValue * 1.1;
    const todayPoint = data.find((d) => d.x === meta.currentProgressX) ?? data[0];
    const todayValue = todayPoint?.current ?? 0;
    const lastYearSameProgress = todayPoint?.lastYear ?? 0;
    const recordSameProgress = todayPoint?.record ?? 0;
    const finalRecord = data.find((d) => d.x === 100)?.record ?? 0;
    const recordDifference = Math.max(finalRecord - recordSameProgress, 0);

    return {
      yAxisMax,
      todayLabel: todayValue ? formatBubble(todayValue) : '0M',
      lastYearLabel: lastYearSameProgress ? formatBubble(lastYearSameProgress) : '0M',
      recordLabel: recordSameProgress ? formatBubble(recordSameProgress) : '0M',
      recordDiffLabel: recordDifference ? formatBubble(recordDifference) : '0M',
    };
  }, [data, meta.currentProgressX]);

  const createCustomDot = (dataKey: 'current' | 'lastYear' | 'record') => {
    const CustomDot = (props: any) => {
      const { cx, cy, payload } = props;
      const config = lineConfig[dataKey];

      const isLastCurrent = dataKey === 'current' && payload.x === meta.currentProgressX;
      const isLastOther = (dataKey === 'lastYear' || dataKey === 'record') && payload.x === 100;

      if (!isLastCurrent && !isLastOther) return null;

      const value = payload[dataKey];
      if (value === null || value === 0) return null;
      if (!dotsVisible) return null;

      const displayValue = formatBubble(value);

      return (
        <g
          className="dot-pop"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animationDuration: `${DOT_GROW_MS}ms`,
          }}
        >
          <circle cx={cx} cy={cy} r={config.circleRadius} fill={config.color} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="black"
            fontSize={config.fontSize}
            className="interblack"
          >
            {displayValue}
          </text>
        </g>
      );
    };

    CustomDot.displayName = `CustomDot(${dataKey})`;
    return CustomDot;
  };


  const ChartLegend = () => (
    <div className="absolute left-[2vw] md:left-[2vh] top-[3vw] md:top-[3vh] z-10 flex flex-col md:gap-[1.2vh] text-white">
      <div className="flex items-center gap-[2vw] md:gap-[1.2vh]">
        <span className="h-[1.2vw] md:h-[0.9vh] w-[5vw] md:w-[3.2vh] rounded-full" style={{ backgroundColor: lineConfig.current.color }} />
        <span className="text-[3vw] md:text-[2vh] interbold leading-none">current month</span>
      </div>

      <div className="flex items-center gap-[2vw] md:gap-[1.2vh]">
        <span className="h-[1.2vw] md:h-[0.9vh] w-[5vw] md:w-[3.2vh] rounded-full" style={{ backgroundColor: lineConfig.record.color }} />
        <span className="text-[3vw] md:text-[2vh] interbold leading-none">record month</span>
      </div>

      <div className="flex items-center gap-[2vw] md:gap-[1.2vh]">
        <span className="h-[1.2vw] md:h-[0.9vh] w-[5vw] md:w-[3.2vh] rounded-full" style={{ backgroundColor: lineConfig.lastYear.color }} />
        <span className="text-[3vw] md:text-[2vh] interbold leading-none">last year</span>
      </div>
    </div>
  );

  const chartMargin = useMemo(
    () => (isMobile ? { top: 50, right: 45, left: 5, bottom: 12 } : { top: 80, right: 80, left: 20, bottom: 20 }),
    [isMobile]
  );

  return (
    <main className="relative w-full">
      <div
        style={{
          transform: `translate(${pixelShift.x}px, ${pixelShift.y}px)`,
          transition: 'transform 1200ms ease-in-out',
          willChange: 'transform',
        }}
      >
        <div className="relative bg-black h-[50vh] md:h-[64vh] rounded-[2vw] md:rounded-[1.5vh] text-white pt-[2vh] md:pt-[2vh] overflow-hidden">
          <ChartLegend />

          {(loading || error) && (
            <div className="absolute right-[3vh] md:right-[3vh] top-[3vh md:top-[3vh] z-20 text-[1.6vh] md:text-[1.6vh] interbold text-white/70">
              {loading ? 'Loading…' : `Error: ${error}`}
            </div>
          )}

          <div style={{ opacity: chartVisible ? 1 : 0, width: '100%', height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              {showChart && (
                <LineChart key={`chart-${cycle}`} data={data} margin={chartMargin}>
                  <XAxis dataKey="x" hide={true} />
                  <YAxis hide={true} domain={[0, yAxisMax]} />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    labelFormatter={(label) => `Month Progress: ${label}%`}
                    formatter={(value: any, name: any) => {
                      const labelMap: Record<string, string> = {
                        current: 'Current Month',
                        lastYear: 'Same Month Last Year',
                        record: 'Record Month',
                      };

                      if (value === null) return ['N/A', labelMap[name] ?? name];

                      return [`R${(Number(value) / 1_000_000).toFixed(2)}M`, labelMap[name] ?? name];
                    }}
                  />

                  <Line
                    type="basis"
                    dataKey="lastYear"
                    stroke={lineConfig.lastYear.color}
                    strokeWidth={lineConfig.lastYear.strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={createCustomDot('lastYear')}
                    activeDot={{ r: isMobile ? 3 : 6 }}
                    isAnimationActive={true}
                    animationDuration={LINE_ANIM_MS}
                    animationBegin={LINE_ANIM_DELAY_MS}
                    animationEasing="ease-out"
                  />

                  <Line
                    type="basis"
                    dataKey="record"
                    stroke={lineConfig.record.color}
                    strokeWidth={lineConfig.record.strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={createCustomDot('record')}
                    activeDot={{ r: isMobile ? 3 : 6 }}
                    isAnimationActive={true}
                    animationDuration={LINE_ANIM_MS}
                    animationBegin={LINE_ANIM_DELAY_MS}
                    animationEasing="ease-out"
                  />

                  <Line
                    type="basis"
                    dataKey="current"
                    stroke={lineConfig.current.color}
                    strokeWidth={lineConfig.current.strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={createCustomDot('current')}
                    activeDot={{ r: isMobile ? 3 : 6 }}
                    connectNulls={false}
                    isAnimationActive={true}
                    animationDuration={LINE_ANIM_MS}
                    animationBegin={LINE_ANIM_DELAY_MS}
                    animationEasing="ease-out"
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 w-full md:space-x-[2vh] pt-[2vh] md:pt-[2vh]">
          <div className="relative col-span-2 md:col-span-1 flex h-[18.5vh] md:h-[30vh] flex-col overflow-hidden rounded-[2vw] md:rounded-[1.5vh] px-[2vw] md:px-[2vh] py-[3vw] md:py-[3vh] bg-[#ffd200]">
            <div className="flex items-start justify-between">
              <div className="md:max-w-[65%] whitespace-pre-line text-[3vw] md:text-[2vh] interbold leading-[3vw] md:leading-[2vh] text-black/90">today</div>
            </div>
            <div className="mt-auto text-[12vw] md:text-[17vh] leading-[12vw] md:leading-[14vh] text-[#1a1a1a]">
              {cardsReady && <SplitFlapValue key={`today-${cycle}`} value={todayLabel} delay={4000} />}
            </div>
          </div>

          <div className="relative mr-[1vh] md:mr-[0vh] mt-[2vh] md:mt-[0vh] flex h-[23.5vh] md:h-[30vh] flex-col overflow-hidden rounded-[2vw] md:rounded-[1.5vh] px-[2vw] md:px-[2vh] py-[3vw] md:py-[3vh] bg-[#ff4a00]">
            <div className="flex items-start justify-between">
              <div className="md:max-w-[65%] whitespace-pre-line text-[3vw] md:text-[2vh] interbold leading-[3vw] md:leading-[2vh] text-black/90">
                today, but
                <br />
                last year
              </div>
            </div>
            <div className="mt-auto text-[12vw] md:text-[17vh] leading-[12vw] md:leading-[14vh] text-[#1a1a1a]">
              {cardsReady && <SplitFlapValue key={`lastYear-${cycle}`} value={lastYearLabel} delay={4000} />}
            </div>
          </div>

          <div className="relative ml-[1vh] md:ml-[0vh] mt-[2vh] md:mt-[0vh] flex h-[23.5vh] md:h-[30vh] flex-col overflow-hidden rounded-[2vw] md:rounded-[1.5vh] px-[2vw] md:px-[2vh] py-[3vw] md:py-[3vh] bg-[#9ccfc9]">

            <div className="flex items-start justify-between">
              <div className="md:max-w-[65%] whitespace-pre-line text-[3vw] md:text-[2vh] interbold leading-[3vw] md:leading-[2vh] text-black/90">
                today, but
                <br />
                our record month
              </div>
              <div className="hidden md:block text-right flex flex-col justify-end">
                <div className="md:text-[4vh] leading-none md:min-h-[4vh] flex justify-end">
                  {cardsReady ? <SplitFlapValue key={`recordDiff-${cycle}`} value={recordDiffLabel} delay={4000} /> : <span className="opacity-0">0.0M</span>}
                </div>

                <div className="flex items-center justify-end md:gap-[0.5vh] md:text-[2vh] interbold md:mt-[0.3vh]">
                  <span>⟶</span>
                  <span>to goal</span>
                </div>
              </div>
            </div>

            <div className="mt-auto text-[12vw] md:text-[17vh] leading-[12vw] md:leading-[14vh] text-[#1a1a1a]">
              {cardsReady && <SplitFlapValue key={`record-${cycle}`} value={recordLabel} delay={4000} />}
            </div>
          </div>
        </div>
      </div>

      {overlayMounted && (
        <div
          className="fixed inset-0 z-[9999] transition-opacity ease-out bg-black"
          style={{ opacity: overlayVisible ? 1 : 0, transitionDuration: `${OVERLAY_FADE_MS}ms` }}
          aria-hidden={!overlayVisible}
        >
          <video className="h-full w-full object-contain p-[20%]" autoPlay loop muted playsInline preload="auto" src="/loading-overlay.mp4" />
        </div>
      )}
    </main>
  );
}
