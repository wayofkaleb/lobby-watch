# Lobby Watch

Lobby Watch is my practice project for reading game-server sign-in logs. It runs in your browser with fictional data and flags bursts of failed sign-ins from the same source. That gives you somewhere to start looking.

## Run the demo

Open `index.html` in your browser. The demo logs load on their own, and the dashboard works offline.

1. Find a spike on the failure timeline.
2. Check the alert for the source and its failure count.
3. Pick **Flagged failures** in the event filter and page through the matching rows. Change the threshold or the window length and see what gets flagged.

By default, a source gets flagged when it hits **at least five failures** in one fixed five-minute UTC window. Each source gets its own count. Successful sign-ins still show up in the event table and add zero to the failure count. A failed sign-in gets flagged if it's from the same source and falls inside the alert's window. The timeline counts failures from every source and shows the latest 24 window slots, or fewer if the log covers less time.

## Try your own data

Use **Open JSONL** to load a JSON Lines file up to 2 MiB. Put one JSON object on each line. You can also grab the bundled logs with **Download sample**. Use fictional events in any file you share publicly.

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

Your browser reads and analyzes the file locally. It ignores blank lines and tells you how many malformed rows it skipped.

## Field notes

Start with the defaults. The demo has 115 sign-ins, 55 failures, and three rule matches. Look at 21:30 UTC. There are five failures spread across several sources, so nothing gets flagged. At 21:20 UTC, one source racks up 12 failures and trips the rule. Switch to **Flagged failures** to see which accounts were involved. If one of those accounts has a successful sign-in later, that's worth a closer look.

Fixed windows are easy to check, but a burst can spill into the next one. Say the same source fails three times at 20:04 UTC and three more times at 20:05 UTC. That's six failures within two minutes, split across two windows with three in each. Both stay below the threshold. I'd try a rolling window next and compare it on the same fictional logs.

## Run the checks

If you have Node.js installed, run this from the repository root.

```sh
node --test tests/detection.test.cjs
```
