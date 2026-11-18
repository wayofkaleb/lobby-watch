'use strict';

const { parseLog, analyze } = window.LobbyWatch;
const byId = (id) => document.getElementById(id);
const formatCount = new Intl.NumberFormat('en-US');
const pageSize = 10;
const maximumFileSize = 2 * 1024 * 1024;
const maximumShownAlerts = 8;
const thresholdInput = byId('start-threshold');
const intervalInput = byId('interval-minutes');
const filterInput = byId('event-filter');
const fileInput = byId('file-input');

let currentEvents = [];
let result;
let page = 0;
let loadRequest = 0;

function buildDemo() {
  const origin = Date.UTC(2026, 9, 24, 21, 0);
  const failures = [0, 2, 1, 3, 12, 2, 5, 1, 0, 8, 3, 2, 11, 4, 1];
  const accounts = ['bytefox', 'packetcat', 'glitchmoth', 'pixelwisp', 'nullplayer'];
  // These address ranges are reserved for documentation.
  const routineSources = ['192.0.2.23', '192.0.2.66', '198.51.100.15', '203.0.113.40'];
  const burstSources = new Map([[4, '198.51.100.77'], [9, '203.0.113.88'], [12, '198.51.100.77']]);
  const lines = [];

  for (const [bucket, count] of failures.entries()) {
    const successes = 3 + (bucket % 3);
    for (let index = 0; index < successes + count; index += 1) {
      const failed = index >= successes;
      const routineSource = routineSources[(bucket + index) % routineSources.length];
      lines.push(JSON.stringify({
        timestamp: new Date(origin + bucket * 300_000 + (12 + index * 13) * 1000).toISOString(),
        account: accounts[(bucket + index) % accounts.length],
        source: (failed && burstSources.get(bucket)) || routineSource,
        outcome: failed ? 'failure' : 'success'
      }));
    }
  }
  return lines.join('\n') + '\n';
}

const demoText = buildDemo();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clockTime(time) {
  return new Date(time).toISOString().split('T')[1].slice(0, 5);
}

function dateTime(time) {
  return new Date(time).toISOString().split('.')[0].replace('T', ' ');
}

function windowLabel(start, intervalMinutes) {
  const end = start + intervalMinutes * 60_000;
  const startDate = dateTime(start).slice(0, -3);
  const endDate = dateTime(end).slice(0, -3);
  const endLabel = startDate.split(' ')[0] === endDate.split(' ')[0] ? clockTime(end) : endDate;
  return `${startDate} to ${endLabel} UTC`;
}

function setStatus(message, isError = false) {
  const status = byId('analysis-status');
  status.textContent = message;
  status.classList.toggle('status-error', isError);
  status.dataset.state = isError ? 'error' : 'ready';
}

function renderTimeline(buckets, intervalMinutes) {
  const chart = byId('timeline-chart');
  const caption = byId('timeline-caption');
  if (!buckets.length) {
    const empty = element('div', 'empty-state', 'No time windows to chart.');
    empty.setAttribute('role', 'listitem');
    chart.replaceChildren(empty);
    caption.textContent = 'Load a log with valid sign-in events.';
    return;
  }

  const peak = Math.max(...buckets.map((bucket) => bucket.failures));
  const chartScale = Math.max(peak, 1);
  const markerSpacing = Math.max(1, Math.ceil(buckets.length / 5));
  const columns = buckets.map((bucket, index) => {
    const column = element('div', bucket.flagged ? 'chart-column chart-bar--alert' : 'chart-column');
    const track = element('div', 'chart-bar-track');
    const bar = element('div', 'chart-bar-fill');
    const tick = element('span', 'chart-tick', index % markerSpacing === 0 ? clockTime(bucket.start) : '');
    const summary = `${windowLabel(bucket.start, intervalMinutes)}, ${bucket.failures} failed sign-ins${bucket.flagged ? ', alert' : ''}`;
    column.title = summary;
    column.setAttribute('role', 'listitem');
    column.setAttribute('aria-label', summary);
    bar.style.height = `${(bucket.failures / chartScale) * 100}%`;
    track.append(bar);
    column.append(track, tick);
    return column;
  });
  chart.replaceChildren(...columns);
  const windowCount = buckets.length === 1 ? '1 window' : `${buckets.length} windows`;
  caption.textContent = `${windowCount} of ${intervalMinutes} min (UTC) · Peak ${peak} ${peak === 1 ? 'failure' : 'failures'}`;
}

function renderAlerts(alerts, intervalMinutes) {
  const list = byId('alert-list');
  if (!alerts.length) {
    list.replaceChildren(element('li', 'empty-state', 'No source reached the threshold.'));
    return;
  }

  const items = alerts.slice(0, maximumShownAlerts).map((alert) => {
    const item = element('li', 'alert-item');
    const details = element('div', 'alert-copy');
    details.append(
      element('p', 'alert-title', alert.source),
      element('p', 'alert-detail', windowLabel(alert.start, intervalMinutes))
    );
    item.append(details, element('span', 'alert-count', `${formatCount.format(alert.failures)} failed`));
    return item;
  });
  if (alerts.length > maximumShownAlerts) {
    items.push(element('li', 'empty-state', `Showing the latest ${maximumShownAlerts} of ${formatCount.format(alerts.length)} alerts.`));
  }
  list.replaceChildren(...items);
}

function renderEvents() {
  const filter = filterInput.value;
  const matching = result.events.filter((event) =>
    filter === 'all' || (filter === 'flagged' ? event.flagged : event.outcome === filter)
  );
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
  page = Math.min(Math.max(0, page), totalPages - 1);
  const first = page * pageSize;
  const visibleEvents = matching.slice(first, first + pageSize);
  const rowList = byId('event-rows');
  const rows = visibleEvents.map((event) => {
    const row = element('tr');
    const outcome = element('td');
    const time = element('time', '', dateTime(event.time));
    time.dateTime = event.timestamp;
    const timeCell = element('td');
    timeCell.append(time);
    outcome.append(element(
      'span',
      `event-outcome event-outcome--${event.outcome}`,
      event.outcome === 'failure' ? 'Failed' : 'Success'
    ));
    row.append(
      timeCell,
      element('td', '', event.account),
      element('td', '', event.source),
      outcome,
      element('td', event.flagged ? 'event-context--flagged' : '', event.flagged ? 'Alert window' : '—')
    );
    return row;
  });
  if (!rows.length) {
    const row = element('tr');
    const empty = element('td', 'empty-state', 'No events match this view.');
    empty.colSpan = 5;
    row.append(empty);
    rows.push(row);
  }
  rowList.replaceChildren(...rows);
  byId('event-count').textContent = matching.length
    ? `${formatCount.format(first + 1)} to ${formatCount.format(first + visibleEvents.length)} of ${formatCount.format(matching.length)} events`
    : '0 events';
  byId('table-prev').disabled = page === 0;
  byId('table-next').disabled = page + 1 === totalPages;
  byId('page-label').textContent = `${page + 1} / ${totalPages}`;
}

function render() {
  const threshold = thresholdInput.valueAsNumber;
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 1000) {
    thresholdInput.setAttribute('aria-invalid', 'true');
    setStatus('Enter a whole-number threshold from 1 to 1,000 to update the rule.', true);
    return false;
  }
  thresholdInput.removeAttribute('aria-invalid');
  const intervalMinutes = Number(intervalInput.value);
  result = analyze(currentEvents, { threshold, intervalMinutes });
  byId('metric-events').textContent = formatCount.format(result.events.length);
  byId('metric-failures').textContent = formatCount.format(result.failureCount);
  byId('metric-sources').textContent = formatCount.format(result.sourceCount);
  byId('metric-alerts').textContent = formatCount.format(result.alerts.length);
  renderTimeline(result.buckets, intervalMinutes);
  renderAlerts(result.alerts, intervalMinutes);
  renderEvents();
  return true;
}

let datasetStatus = '';

function loadDataset(text, name, fictional) {
  const { events, skipped } = parseLog(text);
  currentEvents = events;
  page = 0;
  filterInput.value = 'all';
  byId('dataset-name').textContent = name;
  byId('demo-label').textContent = fictional ? 'Fictional data' : 'Local file';
  const validMessage = `${formatCount.format(events.length)} valid ${events.length === 1 ? 'event' : 'events'}`;
  const skippedMessage = skipped
    ? `, ${formatCount.format(skipped)} invalid ${skipped === 1 ? 'row' : 'rows'} skipped`
    : '';
  datasetStatus = `${validMessage}${skippedMessage}.`;
  // A newly loaded file always gets a valid rule, so its label and metrics match.
  if (!thresholdInput.validity.valid) thresholdInput.value = thresholdInput.defaultValue;
  if (render()) setStatus(datasetStatus);
}

function loadDemo() {
  loadRequest += 1;
  loadDataset(demoText, 'arcade-demo.jsonl', true);
}

byId('load-demo').addEventListener('click', loadDemo);
byId('download-demo').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([demoText], { type: 'application/x-ndjson' }));
  const link = element('a');
  link.href = url;
  link.download = 'arcade-demo.jsonl';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

fileInput.addEventListener('change', async () => {
  const [file] = fileInput.files;
  fileInput.value = '';
  if (!file) return;
  const request = ++loadRequest;
  if (file.size > maximumFileSize) {
    setStatus('That file exceeds 2 MiB. Choose a smaller JSONL file.', true);
    return;
  }
  try {
    const text = await file.text();
    if (request === loadRequest) loadDataset(text, file.name, false);
  } catch {
    if (request === loadRequest) setStatus('The file could not be read. Choose it again to retry.', true);
  }
});

function refreshRule() {
  page = 0;
  if (render()) setStatus(datasetStatus);
}

thresholdInput.addEventListener('input', refreshRule);
intervalInput.addEventListener('change', refreshRule);
filterInput.addEventListener('change', () => {
  page = 0;
  renderEvents();
});
byId('table-prev').addEventListener('click', () => {
  page -= 1;
  renderEvents();
});
byId('table-next').addEventListener('click', () => {
  page += 1;
  renderEvents();
});

loadDemo();
