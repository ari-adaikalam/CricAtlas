# Performance report

Measured on 2026-11-06 against the live site, https://cricatlas.ariadaikalam.com. Every number below is from one run of the script named beside it. The scripts are in `web/scripts/perf/`, and [design_decisions.md](design_decisions.md) explains how the app is built to stay inside the budget.

## Budget

- First look under 500 ms on a warm cache and under 1 s on a cold visit.
- A filter change updates the first screen in under 300 ms.

## How it was measured

- **Machine:** an Apple M4 Max Mac on its own network connection.
- **Browsers:** headless Chromium and WebKit from Playwright 1.62.1. WebKit here is the Playwright build of the engine. The Safari app was not used.
- **Cold visit:** a fresh browser context with an empty cache. The time runs from the start of the navigation until the page heading is on screen and no loader is showing.
- **Warm visit:** the page is opened once, left for 2.5 s, then reloaded in the same context.
- **Throttled run:** 60 ms latency and 20 Mbit down and up, set through the browser's network emulation. The unthrottled run is the Mac's own connection.
- **Window:** 1352 by 700 for the page loads, 1440 by 900 for filter changes and scrolling.

## Page loads (`host-budget.cjs`)

Times are in milliseconds. The request and size columns are for the cold unthrottled visit.

| Page | Cold, throttled | Cold | Warm | Requests | Transferred | Data host share |
|---|---|---|---|---|---|---|
| Home | 710 | 272 | 198 | 91 | 1.3 MB | 575 KB in 17 requests |
| Players list | 802 | 166 | 39 | 124 | 4.2 MB | 855 KB in 5 requests |
| Player (Kohli) | 673 | 253 | 142 | 109 | 3.8 MB | 3.1 MB in 20 requests |
| Player (Bumrah) | 401 | 414 | 127 | 132 | 2.8 MB | 1.9 MB in 22 requests |
| Team (India) | 710 | 334 | 132 | 105 | 1.5 MB | 739 KB in 11 requests |
| Tournament (IPL) | 792 | 338 | 137 | 90 | 1.4 MB | 747 KB in 6 requests |
| Match (T20) | 771 | 255 | 123 | 107 | 1.4 MB | 476 KB in 5 requests |
| Match (Test) | 418 | 257 | 128 | 110 | 1.4 MB | 479 KB in 5 requests |
| Compare players | 954 | 224 | 41 | 112 | 1.3 MB | 581 KB in 14 requests |
| API page | 636 | 133 | 39 | 70 | 1.0 MB | 474 KB in 4 requests |

- Every cold visit finished under 1 s, including the throttled ones. The slowest was Compare players at 954 ms throttled, which is close to the limit.
- Every warm visit finished under 200 ms.
- Every request to the data host was answered from the Cloudflare cache (a hit), in both runs.
- Each figure is one run. Bumrah's throttled time (401) is lower than its unthrottled time (414), a sign of run to run noise.

## Filter changes (`filter-change.cjs`)

Time from choosing a filter value until the totals beside the filters have changed and no tile on screen is loading. Three changes each, with the page open for 8 s first.

| Player and view | Changes, in ms |
|---|---|
| Kohli, ODI batting | 31, 58, 28 |
| Bumrah, Tests bowling | 32, 44, 30 |
| Bumrah, ODI bowling | 27, 47, 23 |

All nine were under 60 ms, against a budget of 300 ms.

## Scrolling (`scroll-frames.cjs`)

Kohli's ODI batting view, scrolling the tile row across six tiles with smooth scrolling.

| Engine | Frames | Average frame | Slowest frame | Over 24 ms | Over 50 ms |
|---|---|---|---|---|---|
| Chromium | 644 | 8.4 ms | 31 ms | 1 | 0 |
| WebKit | 321 | 16.8 ms | 45 ms | 4 | 0 |

The two averages match a 120 Hz and a 60 Hz frame rate, so the engines are compared by their slowest frames.
