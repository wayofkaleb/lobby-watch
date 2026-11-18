'use strict';

(function exposeDetection() {
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  const timelineLimit = 24;

  function parseEvent(line) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (error) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

    const { timestamp, account, source, outcome } = entry;
    if (typeof timestamp !== 'string' || !timestampPattern.test(timestamp)) return null;
    if (typeof account !== 'string' || typeof source !== 'string') return null;
    if (outcome !== 'success' && outcome !== 'failure') return null;

    const cleanAccount = account.trim();
    const cleanSource = source.trim();
    if (!cleanAccount || !cleanSource || cleanAccount.length > 64 || cleanSource.length > 64) {
      return null;
    }

    const time = Date.parse(timestamp);
    // Check for calendar dates that Date.parse silently rolls into the next month.
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== timestamp.slice(0, 19)) {
      return null;
    }
    return { timestamp, time, account: cleanAccount, source: cleanSource, outcome };
  }

  function parseLog(text) {
    const events = [];
    let skipped = 0;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const event = parseEvent(line);
      if (event === null) {
        skipped += 1;
        continue;
      }
      events.push(event);
    }

    return { events, skipped };
  }

  function analyze(events, { threshold, intervalMinutes }) {
    const windowMs = intervalMinutes * 60_000;
    const windowStart = (time) => Math.floor(time / windowMs) * windowMs;
    const newestFirst = [...events].sort((a, b) => b.time - a.time);
    const sources = new Set();
    const failuresByWindow = new Map();
    let failureCount = 0;

    for (const { time, source, outcome } of events) {
      sources.add(source);
      if (outcome !== 'failure') continue;

      failureCount += 1;
      const start = windowStart(time);
      let bucket = failuresByWindow.get(start);
      if (!bucket) {
        bucket = { total: 0, bySource: new Map(), flagged: false };
        failuresByWindow.set(start, bucket);
      }
      bucket.total += 1;
      bucket.bySource.set(source, (bucket.bySource.get(source) ?? 0) + 1);
    }

    const alerts = [];
    for (const [start, bucket] of failuresByWindow) {
      for (const [source, failures] of bucket.bySource) {
        if (failures < threshold) continue;
        alerts.push({ start, source, failures });
        bucket.flagged = true;
      }
    }
    alerts.sort((first, second) =>
      second.start - first.start || second.failures - first.failures || first.source.localeCompare(second.source)
    );

    const buckets = [];
    if (newestFirst.length) {
      const newest = windowStart(newestFirst[0].time);
      const oldest = windowStart(newestFirst[newestFirst.length - 1].time);
      const firstShown = Math.max(oldest, newest - (timelineLimit - 1) * windowMs);
      for (let start = firstShown; start <= newest; start += windowMs) {
        const bucket = failuresByWindow.get(start);
        buckets.push({ start, failures: bucket?.total ?? 0, flagged: bucket?.flagged ?? false });
      }
    }

    const annotatedEvents = newestFirst.map((event) => {
      const bucket = failuresByWindow.get(windowStart(event.time));
      const failures = bucket?.bySource.get(event.source) ?? 0;
      return { ...event, flagged: event.outcome === 'failure' && failures >= threshold };
    });
    return {
      events: annotatedEvents,
      alerts,
      buckets,
      failureCount,
      sourceCount: sources.size
    };
  }

  const detection = { parseLog, analyze };
  if (typeof module === 'object' && module.exports) module.exports = detection;
  else globalThis.LobbyWatch = detection;
})();
