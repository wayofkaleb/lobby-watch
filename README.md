# Lobby Watch

Lobby Watch is a browser-based dashboard for investigating simulated game-server sign-in logs. It highlights time windows with repeated failures from the same source so you can find the events worth reading.

## Run the demo

Open `index.html` in a browser. The bundled fictional logs load automatically and the dashboard works offline.

1. Look for a spike in the failed sign-ins timeline.
2. Check the flagged windows to see which source triggered the rule and how many failures it recorded.
3. Set the event filter to flagged events and page through the matching rows. Change the failure threshold or the window length to see how the results shift.

The default rule flags a source when **at least five failures** land in one fixed five-minute UTC window. Each source is counted independently. Successful sign-ins stay in the event table and add zero to the failure count. A failure row is flagged when its source and timestamp match an alert. The timeline adds up failures across all sources and shows the latest 24 window slots, or fewer when the dataset spans a shorter period.

## Try your own data

Choose a JSON Lines file of up to 2 MiB with **Open JSONL**. Put one JSON object on each line, or start with **Download sample** to get the bundled demo as a file. Use fictional events when sharing a file publicly.

```jsonl
{"timestamp":"2026-11-18T20:00:42Z","account":"pixel-mage","source":"192.0.2.17","outcome":"failure"}
{"timestamp":"2026-11-18T20:01:19.215Z","account":"pixel-mage","source":"192.0.2.17","outcome":"success"}
```

| Field | Format |
| --- | --- |
| `timestamp` | UTC timestamp ending in `Z`, with up to three optional fractional-second digits. |
| `account` | Nonempty string, up to 64 characters. |
| `source` | Nonempty string, up to 64 characters. |
| `outcome` | `success` or `failure`. |

The dashboard skips malformed rows and reports how many it skipped. Blank lines are ignored. The browser reads and analyzes the file locally.

## Field notes

The demo has 115 sign-ins, 55 failures, and three rule matches at the default settings. At 21:30 UTC, five failures spread across several sources and generate zero alerts. At 21:20 UTC, 12 failures from a single source trigger one alert. Use **Flagged failures** to find the accounts involved. A later success on the same account is another event to investigate.

Fixed windows are easy to inspect. They can split a burst across a boundary, though. Three failures at 20:04 UTC and three more at 20:05 UTC land in different five-minute buckets. Each bucket stays below the default threshold even though all six failures occurred within two minutes. A follow-up experiment would compare this rule with a rolling window on the same fictional logs.

## Run the checks

If Node.js is installed, run this from the repository root.

```sh
node --test tests/detection.test.cjs
```
