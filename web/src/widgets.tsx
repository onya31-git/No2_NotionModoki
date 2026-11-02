import { useEffect, useState, type ReactNode } from "react";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { createReactBlockSpec, type DefaultReactSuggestionItem } from "@blocknote/react";
import { ClockIcon, DateTypeIcon, HourglassIcon, QuoteIcon, SettingsIcon, WeatherIcon } from "./icons";
import { Switch } from "./SettingsDialog";

// 本文に置けるウィジェット（時計・カレンダー・天気予報・生涯時計・今日の言葉）。
// 1 つの "widget" ブロックで、kind が種類、config が設定（JSON 文字列）。設定はページの本文と一緒に保存される

type WidgetKind = "clock" | "calendar" | "weather" | "lifeClock" | "quote";

interface WidgetDef<C> {
  label: string;
  icon: () => ReactNode;
  subtext: string;
  aliases: string[];
  defaults: C;
  View: (p: { config: C; setup: () => void; readOnly: boolean }) => ReactNode;
  Settings: (p: { draft: C; set: (patch: Partial<C>) => void }) => ReactNode;
}

const defineWidget = <C,>(def: WidgetDef<C>) => def as unknown as WidgetDef<any>;

// ---------- 共通 ----------

const WEEKDAYS = "日月火水木金土";
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const jpDate = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;

/** 現在時刻。ms ごと（その区切りぴったり）に更新する */
function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, ms - (Date.now() % ms) + 5);
    };
    setNow(new Date());
    schedule();
    return () => window.clearTimeout(timer);
  }, [ms]);
  return now;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="widget-field">
      <span className="widget-field-label">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="widget-segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SetupPrompt({ text, setup, readOnly }: { text: string; setup: () => void; readOnly: boolean }) {
  return (
    <div className="widget-setup">
      <span>{text}</span>
      {!readOnly && (
        <button className="btn-secondary small" onClick={setup}>
          設定する
        </button>
      )}
    </div>
  );
}

// ---------- 時計 ----------

type ClockConfig = { style: "analog" | "digital"; seconds: boolean };

function AnalogFace({ now, seconds, size = 112 }: { now: Date; seconds: boolean; size?: number }) {
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();
  return (
    <svg className="clock-face" viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <circle className="clock-rim" cx="50" cy="50" r="47" />
      {Array.from({ length: 60 }, (_, i) => (
        <line
          key={i}
          className={i % 5 ? "clock-tick" : "clock-tick major"}
          x1="50"
          y1="6"
          x2="50"
          y2={i % 5 ? 8.5 : 12}
          transform={`rotate(${i * 6} 50 50)`}
        />
      ))}
      <line className="clock-hand hour" x1="50" y1="53" x2="50" y2="28" transform={`rotate(${(h + m / 60) * 30} 50 50)`} />
      <line className="clock-hand minute" x1="50" y1="54" x2="50" y2="15" transform={`rotate(${(m + s / 60) * 6} 50 50)`} />
      {seconds && <line className="clock-hand second" x1="50" y1="60" x2="50" y2="11" transform={`rotate(${s * 6} 50 50)`} />}
      <circle className="clock-pin" cx="50" cy="50" r="2.6" />
    </svg>
  );
}

const clockWidget = defineWidget<ClockConfig>({
  label: "時計",
  icon: ClockIcon,
  subtext: "現在の時刻と日付",
  aliases: ["clock", "time", "とけい", "時刻", "jikoku"],
  defaults: { style: "analog", seconds: false },
  View: ({ config }) => {
    const now = useNow(config.seconds ? 1000 : 60_000);
    const time = `${now.getHours()}:${pad(now.getMinutes())}`;
    return (
      <div className={`clock clock-${config.style}`}>
        {config.style === "analog" && <AnalogFace now={now} seconds={config.seconds} />}
        <div className="clock-text">
          <div className="clock-time">
            {time}
            {config.seconds && <span className="clock-sec">:{pad(now.getSeconds())}</span>}
          </div>
          <div className="clock-date">{jpDate(now)}</div>
        </div>
      </div>
    );
  },
  Settings: ({ draft, set }) => (
    <>
      <Field label="表示">
        <Segmented
          value={draft.style}
          options={[
            { value: "analog", label: "アナログ" },
            { value: "digital", label: "デジタル" },
          ]}
          onChange={(style) => set({ style })}
        />
      </Field>
      <Field label="秒を表示">
        <Switch label="秒を表示" on={draft.seconds} onChange={(seconds) => set({ seconds })} />
      </Field>
    </>
  ),
});

// ---------- カレンダー ----------

type CalendarConfig = { weekStart: 0 | 1; holidays: boolean };

let holidayRequest: Promise<Record<string, string>> | undefined;
/** 日本の祝日（holidays-jp）。取れなければ祝日なしで表示する */
function useHolidays(enabled: boolean) {
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    holidayRequest ??= fetch("https://holidays-jp.github.io/api/v1/date.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => {
        holidayRequest = undefined; // 次に開いたときに取り直す
        return {};
      });
    let alive = true;
    holidayRequest.then((h) => alive && setHolidays(h));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? holidays : {};
}

const calendarWidget = defineWidget<CalendarConfig>({
  label: "カレンダー",
  icon: DateTypeIcon,
  subtext: "月のカレンダー（祝日つき）",
  aliases: ["calendar", "month", "かれんだー", "カレンダー", "暦", "karenda"],
  defaults: { weekStart: 0, holidays: true },
  View: ({ config }) => {
    const now = useNow(60_000);
    const holidays = useHolidays(config.holidays);
    const [offset, setOffset] = useState(0);
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const lead = (first.getDay() - config.weekStart + 7) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => new Date(year, month, 1 - lead + i));
    const today = ymd(now);
    const monthHolidays = Object.entries(holidays)
      .filter(([d]) => d.startsWith(`${year}-${pad(month + 1)}-`))
      .sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className="cal">
        <div className="cal-head">
          <span className="cal-title">
            {year}年<strong>{month + 1}月</strong>
          </span>
          {offset !== 0 && (
            <button className="cal-nav cal-today" onClick={() => setOffset(0)}>
              今日
            </button>
          )}
          <button className="cal-nav" aria-label="前の月" onClick={() => setOffset(offset - 1)}>
            ‹
          </button>
          <button className="cal-nav" aria-label="次の月" onClick={() => setOffset(offset + 1)}>
            ›
          </button>
        </div>
        <div className="cal-grid">
          {Array.from({ length: 7 }, (_, i) => {
            const w = (i + config.weekStart) % 7;
            return (
              <div key={`w${i}`} className={`cal-weekday${w === 0 ? " sun" : w === 6 ? " sat" : ""}`}>
                {WEEKDAYS[w]}
              </div>
            );
          })}
          {cells.map((d) => {
            const key = ymd(d);
            const holiday = holidays[key];
            const cls = [
              "cal-day",
              d.getMonth() !== month && "other",
              key === today && "today",
              (d.getDay() === 0 || holiday) && "sun",
              d.getDay() === 6 && !holiday && "sat",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={key} className={cls} title={holiday}>
                <span>{d.getDate()}</span>
              </div>
            );
          })}
        </div>
        {monthHolidays.length > 0 && (
          <ul className="cal-holidays">
            {monthHolidays.map(([d, name]) => (
              <li key={d}>
                <span className="cal-holiday-date">{Number(d.slice(8))}日</span>
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
  Settings: ({ draft, set }) => (
    <>
      <Field label="週の始まり">
        <Segmented
          value={draft.weekStart}
          options={[
            { value: 0, label: "日曜日" },
            { value: 1, label: "月曜日" },
          ]}
          onChange={(weekStart) => set({ weekStart })}
        />
      </Field>
      <Field label="祝日を表示">
        <Switch label="祝日を表示" on={draft.holidays} onChange={(holidays) => set({ holidays })} />
      </Field>
    </>
  ),
});

// ---------- 天気予報（Open-Meteo: 登録・API キー不要） ----------

type Place = { name: string; lat: number; lon: number };
type WeatherConfig = { place: Place | null };

interface Forecast {
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number; is_day: number };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
  fetchedAt: number;
}

/** WMO の天気コード → 表示 */
function weatherInfo(code: number, day = true): { label: string; emoji: string; sky: string } {
  if (code === 0) return { label: "快晴", emoji: day ? "☀️" : "🌙", sky: day ? "clear" : "night" };
  if (code === 1) return { label: "晴れ", emoji: day ? "🌤️" : "🌙", sky: day ? "clear" : "night" };
  if (code === 2) return { label: "晴れ時々曇り", emoji: "⛅", sky: day ? "partly" : "night" };
  if (code === 3) return { label: "曇り", emoji: "☁️", sky: "cloud" };
  if (code === 45 || code === 48) return { label: "霧", emoji: "🌫️", sky: "cloud" };
  if (code >= 51 && code <= 57) return { label: "霧雨", emoji: "🌦️", sky: "rain" };
  if (code === 61) return { label: "小雨", emoji: "🌦️", sky: "rain" };
  if (code === 63) return { label: "雨", emoji: "🌧️", sky: "rain" };
  if (code === 65) return { label: "大雨", emoji: "🌧️", sky: "rain" };
  if (code === 66 || code === 67) return { label: "みぞれ", emoji: "🌨️", sky: "snow" };
  if (code >= 71 && code <= 77) return { label: code === 75 ? "大雪" : "雪", emoji: "❄️", sky: "snow" };
  if (code >= 80 && code <= 82) return { label: "にわか雨", emoji: "🌦️", sky: "rain" };
  if (code === 85 || code === 86) return { label: "にわか雪", emoji: "🌨️", sky: "snow" };
  if (code >= 95) return { label: "雷雨", emoji: "⛈️", sky: "storm" };
  return { label: "—", emoji: "🌡️", sky: "cloud" };
}

const FORECAST_TTL_MS = 15 * 60_000;
const forecastCache = new Map<string, Promise<Forecast>>();

function fetchForecast(place: Place, force = false): Promise<Forecast> {
  const key = `${place.lat},${place.lon}`;
  const cached = forecastCache.get(key);
  if (cached && !force) return cached;
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "7",
    wind_speed_unit: "ms",
  });
  const request = fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => ({ ...data, fetchedAt: Date.now() }) as Forecast);
  forecastCache.set(key, request);
  // 失敗したものは残さない。成功したものも一定時間で取り直す
  request.then(
    () => window.setTimeout(() => forecastCache.get(key) === request && forecastCache.delete(key), FORECAST_TTL_MS),
    () => forecastCache.get(key) === request && forecastCache.delete(key),
  );
  return request;
}

function useForecast(place: Place | null) {
  const [state, setState] = useState<{ data?: Forecast; error?: boolean }>({});
  const [reload, setReload] = useState(0);
  const key = place ? `${place.lat},${place.lon}` : "";
  useEffect(() => {
    if (!place) return;
    let alive = true;
    const load = (force: boolean) =>
      fetchForecast(place, force).then(
        (data) => alive && setState({ data }),
        () => alive && setState((s) => ({ ...s, error: true })),
      );
    load(reload > 0);
    const timer = window.setInterval(() => load(false), FORECAST_TTL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);
  return { ...state, refresh: () => setReload((n) => n + 1) };
}

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

/** 地名から候補を探す。Open-Meteo は日本語名の完全一致に近い検索なので「市」「都」などを補った名前でも引く */
async function searchPlaces(q: string): Promise<GeoResult[]> {
  const names = /[市区町村都道府県]$/.test(q) ? [q] : [q, `${q}市`, `${q}町`, `${q}村`, `${q}都`, `${q}府`, `${q}県`];
  const lists = await Promise.all(
    names.map((name) =>
      fetch(
        `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: "5", language: "ja" })}`,
      )
        .then((r) => (r.ok ? r.json() : {}))
        .then((d: { results?: GeoResult[] }) => d.results ?? [])
        .catch(() => [] as GeoResult[]),
    ),
  );
  const seen = new Set<number>();
  return lists.flat().filter((r) => !seen.has(r.id) && !!seen.add(r.id));
}

const placeName = (r: GeoResult) => r.name.trim();
const placeDetail = (r: GeoResult) => [r.admin1, r.country !== "日本" ? r.country : ""].filter(Boolean).join("・");

function PlaceSearch({ value, onChange }: { value: Place | null; onChange: (p: Place) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [geoError, setGeoError] = useState("");

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setResults(await searchPlaces(q));
    setBusy(false);
  };

  const useCurrentLocation = () => {
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        onChange({
          name: "現在地",
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lon: Math.round(pos.coords.longitude * 100) / 100,
        }),
      () => setGeoError("現在地を取得できませんでした"),
    );
  };

  return (
    <div className="place-search">
      <div className="widget-field-label">地域{value && <span className="place-current">：{value.name}</span>}</div>
      <form
        className="place-search-row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          className="menu-input"
          value={query}
          placeholder="市区町村名で検索（例: 札幌、横浜市）"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn-secondary small" type="submit" disabled={busy}>
          {busy ? "検索中…" : "検索"}
        </button>
      </form>
      {/* 位置情報は https または localhost でしか使えない */}
      {window.isSecureContext && "geolocation" in navigator && (
        <button className="widget-link" onClick={useCurrentLocation}>
          現在地を使う
        </button>
      )}
      {geoError && <div className="widget-note">{geoError}</div>}
      {results &&
        (results.length ? (
          <ul className="place-results">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  className={value?.lat === r.latitude && value?.lon === r.longitude ? "on" : ""}
                  onClick={() => onChange({ name: placeName(r), lat: r.latitude, lon: r.longitude })}
                >
                  <span>{placeName(r)}</span>
                  <span className="place-detail">{placeDetail(r)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="widget-note">見つかりませんでした。「市」「町」まで含めた名前や、ローマ字でも試してください。</div>
        ))}
    </div>
  );
}

const weatherWidget = defineWidget<WeatherConfig>({
  label: "天気予報",
  icon: WeatherIcon,
  subtext: "現在の天気と 1 週間の予報",
  aliases: ["weather", "forecast", "tenki", "てんき", "天気", "予報"],
  defaults: { place: null },
  View: ({ config, setup, readOnly }) => {
    const { data, error, refresh } = useForecast(config.place);
    if (!config.place) return <SetupPrompt text="天気を表示する地域を設定してください" setup={setup} readOnly={readOnly} />;
    if (!data) {
      return (
        <div className="weather-status">
          {error ? (
            <>
              天気を取得できませんでした
              <button className="btn-secondary small" onClick={refresh}>
                再試行
              </button>
            </>
          ) : (
            "読み込み中…"
          )}
        </div>
      );
    }
    const cur = data.current;
    const now = weatherInfo(cur.weather_code, cur.is_day === 1);
    const updated = new Date(data.fetchedAt);
    return (
      <div className={`weather sky-${now.sky}`}>
        <div className="weather-now">
          <span className="weather-emoji">{now.emoji}</span>
          <div>
            <div className="weather-place">{config.place.name}</div>
            <div className="weather-temp">
              {Math.round(cur.temperature_2m)}
              <span className="weather-unit">°C</span>
            </div>
            <div className="weather-label">{now.label}</div>
          </div>
          <dl className="weather-meta">
            <dt>体感</dt>
            <dd>{Math.round(cur.apparent_temperature)}°</dd>
            <dt>湿度</dt>
            <dd>{cur.relative_humidity_2m}%</dd>
            <dt>風速</dt>
            <dd>{cur.wind_speed_10m.toFixed(1)}m/s</dd>
          </dl>
        </div>
        <div className="weather-days">
          {data.daily.time.map((t, i) => {
            const [y, m, d] = t.split("-").map(Number);
            const w = new Date(y, m - 1, d).getDay();
            const info = weatherInfo(data.daily.weather_code[i]);
            const rain = data.daily.precipitation_probability_max[i];
            return (
              <div key={t} className="weather-day" title={info.label}>
                <span className={`weather-dow${w === 0 ? " sun" : w === 6 ? " sat" : ""}`}>
                  {i === 0 ? "今日" : WEEKDAYS[w]}
                </span>
                <span className="weather-day-emoji">{info.emoji}</span>
                <span className="weather-hi">{Math.round(data.daily.temperature_2m_max[i])}°</span>
                <span className="weather-lo">{Math.round(data.daily.temperature_2m_min[i])}°</span>
                <span className="weather-rain">{rain == null ? "" : `${rain}%`}</span>
              </div>
            );
          })}
        </div>
        <div className="weather-foot">
          <span>
            {updated.getHours()}:{pad(updated.getMinutes())} 更新
          </span>
          <button className="widget-link" onClick={refresh}>
            更新
          </button>
          <a className="widget-link" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
        </div>
      </div>
    );
  },
  Settings: ({ draft, set }) => <PlaceSearch value={draft.place} onChange={(place) => set({ place })} />,
});

// ---------- 生涯時計（人生を 1 日 24 時間にたとえる） ----------

type LifeClockConfig = { birth: string; lifespan: number; periods: boolean };

const DAY_MS = 86_400_000;

function parseDate(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 満年齢と、直近の誕生日からの日数 */
function age(birth: Date, now: Date) {
  let years = now.getFullYear() - birth.getFullYear();
  let last = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (last > now) {
    years -= 1;
    last = new Date(now.getFullYear() - 1, birth.getMonth(), birth.getDate());
  }
  return { years, days: Math.floor((now.getTime() - last.getTime()) / DAY_MS) };
}

function Progress({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="life-period">
      <span className="life-period-label">{label}</span>
      <span className="life-bar">
        <span style={{ width: `${Math.min(100, value * 100)}%` }} />
      </span>
      <span className="life-period-value" title={detail}>
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  );
}

const lifeClockWidget = defineWidget<LifeClockConfig>({
  label: "生涯時計",
  icon: HourglassIcon,
  subtext: "人生を 1 日にたとえると今は何時か",
  aliases: ["life", "lifeclock", "しょうがいどけい", "じんせい", "人生時計", "生涯", "寿命"],
  defaults: { birth: "", lifespan: 80, periods: true },
  View: ({ config, setup, readOnly }) => {
    const now = useNow(60_000);
    const birth = parseDate(config.birth);
    if (!birth || birth > now) return <SetupPrompt text="生年月日を設定してください" setup={setup} readOnly={readOnly} />;

    const lifespan = Math.max(1, config.lifespan || 80);
    const end = new Date(birth.getFullYear() + lifespan, birth.getMonth(), birth.getDate());
    const total = end.getTime() - birth.getTime();
    const fraction = (now.getTime() - birth.getTime()) / total;
    const minutes = Math.floor(Math.min(fraction, 1) * 24 * 60);
    const clock = `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
    const a = age(birth, now);
    const remainingDays = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
    const lived = Math.floor((now.getTime() - birth.getTime()) / DAY_MS);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const share = (from: Date, to: Date) => (now.getTime() - from.getTime()) / (to.getTime() - from.getTime());

    return (
      <div className="life">
        <div className="life-main">
          <svg className="life-dial" viewBox="0 0 100 100" width="120" height="120" aria-hidden>
            <circle className="life-track" cx="50" cy="50" r="42" />
            <circle
              className="life-arc"
              cx="50"
              cy="50"
              r="42"
              pathLength="100"
              strokeDasharray={`${Math.min(fraction, 1) * 100} 100`}
              transform="rotate(-90 50 50)"
            />
            {[0, 6, 12, 18].map((h) => {
              const rad = ((h / 24) * 360 - 90) * (Math.PI / 180);
              return (
                <text key={h} className="life-hour" x={50 + Math.cos(rad) * 30} y={50 + Math.sin(rad) * 30}>
                  {h}
                </text>
              );
            })}
            <line
              className="life-hand"
              x1="50"
              y1="50"
              x2="50"
              y2="14"
              transform={`rotate(${Math.min(fraction, 1) * 360} 50 50)`}
            />
            <circle className="clock-pin" cx="50" cy="50" r="2.6" />
          </svg>
          <div className="life-text">
            <div className="life-caption">人生を 1 日にたとえると</div>
            <div className="life-time">{fraction >= 1 ? "24:00" : clock}</div>
            <div className="life-sub">
              {a.years}歳 {a.days}日 ・ {lived.toLocaleString()} 日目
            </div>
            <div className="life-sub">
              {fraction >= 1
                ? `${lifespan} 歳を超えました。ここからはボーナスタイム`
                : `${lifespan} 歳まで あと ${remainingDays.toLocaleString()} 日（${(fraction * 100).toFixed(1)}% 経過）`}
            </div>
          </div>
        </div>
        {config.periods && (
          <div className="life-periods">
            <Progress label="今日" value={share(dayStart, new Date(dayStart.getTime() + DAY_MS))} detail={jpDate(now)} />
            <Progress label="今月" value={share(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1))} detail={`${now.getMonth() + 1}月`} />
            <Progress label="今年" value={share(yearStart, new Date(now.getFullYear() + 1, 0, 1))} detail={`${now.getFullYear()}年`} />
          </div>
        )}
      </div>
    );
  },
  Settings: ({ draft, set }) => (
    <>
      <Field label="生年月日">
        <input
          className="menu-input"
          type="date"
          value={draft.birth}
          max={ymd(new Date())}
          onChange={(e) => set({ birth: e.target.value })}
        />
      </Field>
      <Field label="想定する寿命（歳）">
        <input
          className="menu-input widget-number"
          type="number"
          min={1}
          max={150}
          value={draft.lifespan}
          onChange={(e) => set({ lifespan: Number(e.target.value) })}
        />
      </Field>
      <Field label="今日・今月・今年の経過も表示">
        <Switch label="今日・今月・今年の経過も表示" on={draft.periods} onChange={(periods) => set({ periods })} />
      </Field>
    </>
  ),
});

// ---------- 今日の言葉（日付ごとに変わる格言） ----------

type QuoteConfig = { custom: string; onlyCustom: boolean };
type Quote = { text: string; source?: string };

const QUOTES: Quote[] = [
  { text: "千里の行も足下に始まる", source: "老子" },
  { text: "継続は力なり" },
  { text: "急がば回れ" },
  { text: "石の上にも三年" },
  { text: "七転び八起き" },
  { text: "塵も積もれば山となる" },
  { text: "失敗は成功のもと" },
  { text: "雨降って地固まる" },
  { text: "思い立ったが吉日" },
  { text: "好きこそ物の上手なれ" },
  { text: "笑う門には福来たる" },
  { text: "百聞は一見に如かず" },
  { text: "案ずるより産むが易し" },
  { text: "雨垂れ石を穿つ" },
  { text: "早起きは三文の徳" },
  { text: "一期一会" },
  { text: "初心忘るべからず", source: "世阿弥" },
  { text: "為せば成る 為さねば成らぬ何事も 成らぬは人の為さぬなりけり", source: "上杉鷹山" },
  { text: "故きを温ねて新しきを知る", source: "論語" },
  { text: "過ちて改めざる、是を過ちと謂う", source: "論語" },
  { text: "学びて思わざれば則ち罔し、思いて学ばざれば則ち殆し", source: "論語" },
  { text: "己の欲せざる所は人に施すこと勿れ", source: "論語" },
  { text: "彼を知り己を知れば百戦殆うからず", source: "孫子" },
  { text: "人間万事塞翁が馬", source: "淮南子" },
  { text: "日々是好日", source: "雲門文偃" },
  { text: "我思う、ゆえに我あり", source: "デカルト" },
  { text: "人間は考える葦である", source: "パスカル" },
  { text: "知は力なり", source: "フランシス・ベーコン" },
  { text: "時は金なり", source: "ベンジャミン・フランクリン" },
  { text: "明日死ぬかのように生きよ。永遠に生きるかのように学べ。", source: "マハトマ・ガンディー" },
];

/** 1 行に 1 つ。「言葉 / 出典」または「言葉 — 出典」で出典を書ける */
function parseCustom(text: string): Quote[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(.*?)\s+(?:\/|—|―|－)\s+(.+)$/.exec(line);
      return m ? { text: m[1], source: m[2] } : { text: line };
    });
}

const quoteWidget = defineWidget<QuoteConfig>({
  label: "今日の言葉",
  icon: QuoteIcon,
  subtext: "毎日変わる格言・ことわざ",
  aliases: ["quote", "proverb", "kakugen", "かくげん", "格言", "名言", "ことわざ"],
  defaults: { custom: "", onlyCustom: false },
  View: ({ config }) => {
    const now = useNow(60_000);
    const [shift, setShift] = useState(0);
    const custom = parseCustom(config.custom);
    const pool = config.onlyCustom && custom.length ? custom : [...QUOTES, ...custom];
    // 日付から決まる番号（同じ日なら何度開いても同じ言葉）
    const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
    const quote = pool[(((day * 2654435761) >>> 0) + shift) % pool.length];
    return (
      <figure className="quote-widget">
        <div className="quote-label">今日の言葉 ・ {now.getMonth() + 1}月{now.getDate()}日</div>
        <blockquote>{quote.text}</blockquote>
        <figcaption>
          {quote.source && <span>— {quote.source}</span>}
          {pool.length > 1 && (
            <button className="widget-link" onClick={() => setShift(shift + 1)}>
              別の言葉
            </button>
          )}
        </figcaption>
      </figure>
    );
  },
  Settings: ({ draft, set }) => (
    <>
      <Field label="自分の言葉を追加（1 行に 1 つ。「言葉 / 出典」で出典も書けます）">
        <textarea
          className="menu-input widget-textarea"
          rows={5}
          value={draft.custom}
          placeholder={"人生は近くで見ると悲劇だが、遠くから見れば喜劇だ / チャップリン"}
          onChange={(e) => set({ custom: e.target.value })}
        />
      </Field>
      <Field label="自分の言葉だけを表示">
        <Switch label="自分の言葉だけを表示" on={draft.onlyCustom} onChange={(onlyCustom) => set({ onlyCustom })} />
      </Field>
    </>
  ),
});

// ---------- ブロック ----------

const WIDGETS: Record<WidgetKind, WidgetDef<any>> = {
  clock: clockWidget,
  calendar: calendarWidget,
  weather: weatherWidget,
  lifeClock: lifeClockWidget,
  quote: quoteWidget,
};

function parseConfig(raw: string) {
  try {
    return raw ? (JSON.parse(raw) as object) : {};
  } catch {
    return {};
  }
}

function Widget({
  kind,
  rawConfig,
  readOnly,
  onSave,
}: {
  kind: string;
  rawConfig: string;
  readOnly: boolean;
  onSave: (config: object) => void;
}) {
  const def = WIDGETS[kind as WidgetKind] ?? clockWidget;
  const config = { ...def.defaults, ...parseConfig(rawConfig) };
  const [draft, setDraft] = useState<object | null>(null);
  const { View, Settings } = def;

  return (
    <div className={`widget widget-${kind}${draft ? " editing" : ""}`}>
      {draft ? (
        <div className="widget-settings">
          <div className="widget-settings-title">
            <def.icon />
            {def.label}の設定
          </div>
          <Settings draft={draft} set={(patch: object) => setDraft({ ...draft, ...patch })} />
          <div className="widget-settings-actions">
            <button className="btn-secondary small" onClick={() => setDraft(null)}>
              キャンセル
            </button>
            <button
              className="btn-primary small"
              onClick={() => {
                setDraft(null);
                onSave(draft);
              }}
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <>
          <View config={config} setup={() => setDraft(config)} readOnly={readOnly} />
          {!readOnly && (
            <button className="widget-gear" aria-label={`${def.label}の設定`} title="設定" onClick={() => setDraft(config)}>
              <SettingsIcon />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** データベースと同じく selectable: false にして、ウィジェット内のボタンや入力欄をそのまま使えるようにする */
export const WidgetBlock = createReactBlockSpec(
  { type: "widget", propSchema: { kind: { default: "clock" }, config: { default: "" } }, content: "none" },
  {
    meta: { selectable: false },
    render: ({ block, editor }) => (
      <div className="widget-frame" contentEditable={false}>
        <Widget
          kind={block.props.kind}
          rawConfig={block.props.config}
          readOnly={!editor.isEditable}
          onSave={(config) => editor.updateBlock(block.id, { props: { config: JSON.stringify(config) } })}
        />
      </div>
    ),
  },
);

/** スラッシュメニューの「ウィジェット」グループ */
export function widgetSlashItems(editor: any): DefaultReactSuggestionItem[] {
  return (Object.entries(WIDGETS) as [WidgetKind, WidgetDef<any>][]).map(([kind, def]) => ({
    title: def.label,
    subtext: def.subtext,
    aliases: ["widget", "うぃじぇっと", ...def.aliases],
    group: "ウィジェット",
    icon: <def.icon />,
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "widget", props: { kind } } as any),
  }));
}
