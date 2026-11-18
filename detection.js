'use strict';

(function exposeDetection() {
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  const timelineLimit = 24;

  function parseEvent(line) {
    const entry = JSON.parse(line);
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

      let event;
      try {
        event = parseEvent(line);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      if (event) events.push(event);
      else skipped += 1;
    }

    return { events, skipped };
  }

  function analyze(events, { threshold, intervalMinutes }) {
    const interval = intervalMinutes * 60_000;
    const windowStart = (time) => Math.floor(time / interval) * interval;
    const sources = new Set();
    const failuresByWindow = new Map();
    let failureCount = 0;
    let newestStart = -Infinity;
    let oldestStart = Infinity;

    for (const event of events) {
      const start = windowStart(event.time);
      newestStart = Math.max(newestStart, start);
      oldestStart = Math.min(oldestStart, start);
      sources.add(event.source);
      if (event.outcome !== 'failure') continue;

      failureCount += 1;
      if (!failuresByWindow.has(start)) {
        failuresByWindow.set(start, { total: 0, bySource: new Map(), flagged: false });
      }
      const window = failuresByWindow.get(start);
      window.total += 1;
      window.bySource.set(event.source, (window.bySource.get(event.source) || 0) + 1);
    }

    const alerts = [];
    for (const [start, window] of failuresByWindow) {
      for (const [source, failures] of window.bySource) {
        if (failures < threshold) continue;
        alerts.push({ start, source, failures });
        window.flagged = true;
      }
    }
    alerts.sort((first, second) =>
      second.start - first.start || second.failures - first.failures || first.source.localeCompare(second.source)
    );

    const buckets = [];
    const firstStart = Math.max(oldestStart, newestStart - (timelineLimit - 1) * interval);
    for (let start = firstStart; start <= newestStart; start += interval) {
      const window = failuresByWindow.get(start);
      buckets.push({ start, failures: window?.total || 0, flagged: window?.flagged || false });
    }

    const annotatedEvents = events.map((event) => {
      const failures = failuresByWindow.get(windowStart(event.time))?.bySource.get(event.source) || 0;
      return { ...event, flagged: event.outcome === 'failure' && failures >= threshold };
    });
    annotatedEvents.sort((first, second) => second.time - first.time);
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
