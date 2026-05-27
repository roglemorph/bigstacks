/** Daily tail + bucket archive for net-worth chart series (preserves All time view). */

export const NET_WORTH_DAILY_TAIL_MAX = 10000;
export const NET_WORTH_BUCKET_STEP = 10;

export function initialNetWorthHistoryFields(startNetWorth, startStack) {
  return {
    netWorthHistory: [Math.round(startNetWorth)],
    netWorthStackHistory: [startStack],
    netWorthDailyStartDay: 1,
    netWorthHistoryBuckets: [],
    netWorthStackBuckets: [],
  };
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
  let {
    netWorthHistory,
    netWorthStackHistory,
    netWorthDailyStartDay,
    netWorthHistoryBuckets,
    netWorthStackBuckets,
  } = normalizeNetWorthFields(state);

  netWorthHistory = [...netWorthHistory, Math.round(scalar)];
  netWorthStackHistory = [...netWorthStackHistory, stackSnapshot];

  while (netWorthHistory.length > NET_WORTH_DAILY_TAIL_MAX) {
    const dropDay = netWorthDailyStartDay;
    if (dropDay % NET_WORTH_BUCKET_STEP === 0) {
      netWorthHistoryBuckets = [
        ...netWorthHistoryBuckets,
        { endDay: dropDay, value: netWorthHistory[0] },
      ];
      netWorthStackBuckets = [
        ...netWorthStackBuckets,
        { endDay: dropDay, snapshot: netWorthStackHistory[0] },
      ];
    }
    netWorthHistory = netWorthHistory.slice(1);
    netWorthStackHistory = netWorthStackHistory.slice(1);
    netWorthDailyStartDay += 1;
  }

  return {
    ...state,
    netWorthHistory,
    netWorthStackHistory,
    netWorthDailyStartDay,
    netWorthHistoryBuckets,
    netWorthStackBuckets,
  };
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
