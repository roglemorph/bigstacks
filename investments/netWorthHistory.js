/** Daily tail + bucket archive for net-worth chart series (preserves All time view). */

export const NET_WORTH_DAILY_TAIL_MAX = 10000;
export const NET_WORTH_MP_DAILY_TAIL_MAX = 1500;
export const NET_WORTH_BUCKET_STEP = 10;
export const NET_WORTH_BUCKET_MAX = 500;

export function initialNetWorthHistoryFields(startNetWorth, startStack) {
  return {
    netWorthHistory: [Math.round(startNetWorth)],
    netWorthStackHistory: [startStack],
    netWorthDailyStartDay: 1,
    netWorthHistoryBuckets: [],
    netWorthStackBuckets: [],
  };
}

/** MP server / player state — scalar net-worth only (no stack snapshots). */
export function initialNetWorthHistoryScalarFields(startNetWorth) {
  return {
    netWorthHistory: [Math.round(startNetWorth)],
    netWorthDailyStartDay: 1,
    netWorthHistoryBuckets: [],
  };
}

function trimBuckets(buckets, max = NET_WORTH_BUCKET_MAX) {
  const arr = buckets || [];
  return arr.length > max ? arr.slice(-max) : arr;
}

function normalizeNetWorthFields(state) {
  return {
    netWorthHistory: state.netWorthHistory || [],
    netWorthStackHistory: state.netWorthStackHistory || [],
    netWorthDailyStartDay: state.netWorthDailyStartDay ?? 1,
    netWorthHistoryBuckets: state.netWorthHistoryBuckets || [],
    netWorthStackBuckets: state.netWorthStackBuckets || [],
  };
}

export function appendNetWorthHistoryDay(state, scalar, stackSnapshot) {
  const trackStack = stackSnapshot != null;
  const tailMax = trackStack ? NET_WORTH_DAILY_TAIL_MAX : NET_WORTH_MP_DAILY_TAIL_MAX;
  let {
    netWorthHistory,
    netWorthStackHistory,
    netWorthDailyStartDay,
    netWorthHistoryBuckets,
    netWorthStackBuckets,
  } = normalizeNetWorthFields(state);

  netWorthHistory = [...netWorthHistory, Math.round(scalar)];
  if (trackStack) {
    netWorthStackHistory = [...netWorthStackHistory, stackSnapshot];
  }

  while (netWorthHistory.length > tailMax) {
    const dropDay = netWorthDailyStartDay;
    if (dropDay % NET_WORTH_BUCKET_STEP === 0) {
      netWorthHistoryBuckets = trimBuckets([
        ...netWorthHistoryBuckets,
        { endDay: dropDay, value: netWorthHistory[0] },
      ]);
      if (trackStack) {
        netWorthStackBuckets = trimBuckets([
          ...netWorthStackBuckets,
          { endDay: dropDay, snapshot: netWorthStackHistory[0] },
        ]);
      }
    }
    netWorthHistory = netWorthHistory.slice(1);
    if (trackStack) {
      netWorthStackHistory = netWorthStackHistory.slice(1);
    }
    netWorthDailyStartDay += 1;
  }

  const next = {
    ...state,
    netWorthHistory,
    netWorthDailyStartDay,
    netWorthHistoryBuckets,
  };
  if (trackStack) {
    next.netWorthStackHistory = netWorthStackHistory;
    next.netWorthStackBuckets = netWorthStackBuckets;
  }
  return next;
}

export function netWorthHistoryView(source) {
  if (!source || Array.isArray(source)) {
    const daily = Array.isArray(source) ? source : [];
    return {
      dailyStartDay: 1,
      daily,
      buckets: [],
      stackBuckets: [],
      stackDaily: [],
    };
  }
  const fields = normalizeNetWorthFields(source);
  return {
    dailyStartDay: fields.netWorthDailyStartDay,
    daily: fields.netWorthHistory,
    buckets: fields.netWorthHistoryBuckets,
    stackDaily: fields.netWorthStackHistory,
    stackBuckets: fields.netWorthStackBuckets,
  };
}

function bucketValue(buckets, day) {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (buckets[i].endDay === day) return buckets[i].value;
  }
  return null;
}

function bucketStackSnapshot(buckets, day) {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (buckets[i].endDay === day) return buckets[i].snapshot;
  }
  return null;
}

export function netWorthScalarAtDay(source, day) {
  const d = Math.floor(day);
  if (d < 1) return null;
  const view = netWorthHistoryView(source);
  const idx = d - view.dailyStartDay;
  if (idx >= 0 && idx < view.daily.length) return view.daily[idx];
  return bucketValue(view.buckets, d);
}

export function netWorthStackAtDay(source, day) {
  const d = Math.floor(day);
  if (d < 1) return null;
  const view = netWorthHistoryView(source);
  const idx = d - view.dailyStartDay;
  if (idx >= 0 && idx < view.stackDaily.length) return view.stackDaily[idx];
  return bucketStackSnapshot(view.stackBuckets, d);
}

export function netWorthHistoryPeak(source, currentNw) {
  let peak = Number.isFinite(currentNw) ? currentNw : 0;
  const view = netWorthHistoryView(source);
  for (const v of view.daily) {
    if (Number.isFinite(v)) peak = Math.max(peak, v);
  }
  for (const b of view.buckets) {
    if (Number.isFinite(b.value)) peak = Math.max(peak, b.value);
  }
  return peak;
}

export function bucketScalarsAtFixedDays(source, bucketEndDays) {
  if (!bucketEndDays?.length) return [];
  return bucketEndDays.map(day => netWorthScalarAtDay(source, day));
}

export function bucketStackSnapshotsAtFixedDays(source, bucketEndDays) {
  if (!bucketEndDays?.length) return [];
  return bucketEndDays.map(day => netWorthStackAtDay(source, day));
}

export function expandNetWorthHistoryToDaySpan(source, chartDaySpan) {
  if (!chartDaySpan) return [];
  const { oldestDay, newestDay } = chartDaySpan;
  const slotCount = Math.max(0, newestDay - oldestDay + 1);
  const out = Array(slotCount).fill(null);
  for (let day = oldestDay; day <= newestDay; day++) {
    out[day - oldestDay] = netWorthScalarAtDay(source, day);
  }
  return out;
}

export function expandStackHistoryToDaySpan(source, chartDaySpan) {
  if (!chartDaySpan) return [];
  const { oldestDay, newestDay } = chartDaySpan;
  const slotCount = Math.max(0, newestDay - oldestDay + 1);
  const out = Array(slotCount).fill(null);
  for (let day = oldestDay; day <= newestDay; day++) {
    out[day - oldestDay] = netWorthStackAtDay(source, day);
  }
  return out;
}

export function netWorthHistoryForLeaderboard(player) {
  const view = netWorthHistoryView(player);
  return {
    netWorthHistory: [...view.daily],
    netWorthDailyStartDay: view.dailyStartDay,
    netWorthHistoryBuckets: view.buckets.map(b => ({ ...b })),
  };
}

/** Trimmed overlay series for WebSocket leaderboard payloads. */
export function netWorthHistoryForLeaderboardWire(player, {
  dailyTail = 500,
  bucketTail = 200,
} = {}) {
  const view = netWorthHistoryView(player);
  const daily = view.daily.length > dailyTail ? view.daily.slice(-dailyTail) : [...view.daily];
  const dailyStartDay = view.daily.length > dailyTail
    ? view.dailyStartDay + (view.daily.length - dailyTail)
    : view.dailyStartDay;
  const buckets = view.buckets.length > bucketTail
    ? view.buckets.slice(-bucketTail).map(b => ({ ...b }))
    : view.buckets.map(b => ({ ...b }));
  return {
    netWorthHistory: daily,
    netWorthDailyStartDay: dailyStartDay,
    netWorthHistoryBuckets: buckets,
  };
}
