# Smart Bin Dashboard — Frontend

React + Vite single-page app. Two pages, talks exclusively to the local backend.

---

## Folder Structure

Place this as a sibling of `local_backend/`:

```
project/
├── local_backend/        ← Flask + ML models (already running on :5050)
└── frontend/             ← THIS folder
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── public/
    │   └── favicon.svg
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── styles.css
        ├── lib/
        │   └── api.js
        ├── pages/
        │   ├── Operations.jsx
        │   └── Analytics.jsx
        └── components/
            ├── CampusMap.jsx
            ├── BinList.jsx
            ├── DetailPanel.jsx
            ├── DispatchModal.jsx
            ├── DispatchLog.jsx
            ├── Toast.jsx
            ├── FillTrendChart.jsx
            ├── HourlyHeatmap.jsx
            ├── StateDonut.jsx
            └── AnomalyLog.jsx
```

---

## Setup (One-Time)

```bash
cd ~/Desktop/project/frontend
npm install
```

Takes ~1–2 minutes. Installs React, React Router, and Vite.

---

## Run the Dashboard

In **one terminal** make sure the backend is running:

```bash
cd ~/Desktop/project/local_backend
python3 app.py
```

You should see: `🚀 Smart Bin Backend running on http://localhost:5050`

In **another terminal**, run the frontend:

```bash
cd ~/Desktop/project/frontend
npm run dev
```

Open the URL it prints (usually http://localhost:3000).

---

## Two Pages

### `/` — Operations Console
The supervisor view. Live monitoring of the entire fleet.

- Hero stat strip — how many bins need action right now
- SLIIT campus map with 8 bin pins, color-coded by ML-classified state
- Real bin (Faculty of Computing) pulses with a live indicator
- Right side: bin list (sorted by priority) + selected bin detail panel
- "Dispatch SMS" button enabled only when ML state requires action
- Recent dispatch log

### `/bin/:binId` — Analytics
Per-bin deep dive. Click any bin → "View Analytics" to reach this.

- Header: bin identity, location, collector zone
- Current state strip (5 metrics, including ML-derived fields)
- 24h fill trend chart
- Hourly usage heatmap (peak hour highlighted)
- State distribution donut (% time in each ML state)

---

## Where ML Predictions Appear

Every ML output is tagged with a small badge so the source is unambiguous:

| Element | ML Model | Endpoint |
|---|---|---|
| State pill ("loosely_filled", "full_normal_weight", etc.) | K-Means + Random Forest | `/api/bin/<id>/current` |
| Time-to-Full countdown | Gradient Boosting Regressor | `/api/bin/<id>/current` |
| State distribution donut | K-Means classification | `/api/bin/<id>/analytics` |
| SMS dispatch trigger | ML state drives the action | `/api/dispatch-sms` |

---

## What is NOT Hardcoded

Every single number on every screen comes from the backend. There is no JS-side fake data anywhere.

- Real bin (smartbin_01): fetches live from Railway → MongoDB → enriched by backend
- Simulated bins (02-08): backend reads CSV files generated in Step 1
- ML predictions: computed fresh each request by `enrich_reading()`

If the backend is down, the dashboard shows a clear error banner — it does not fall back to fake data.

---

## Troubleshooting

**Blank page or "fetch failed"**
→ Backend isn't running. Start it: `cd ../local_backend && python3 app.py`

**"Backend Offline" red banner**
→ Same as above. Check the backend terminal.

**Real bin shows "live_unavailable_fallback"**
→ Railway API can't be reached. The backend automatically uses last CSV row instead. The bin still works, just not live.

**Port 3000 already used**
→ Vite will offer port 3001 automatically. Use whatever URL it prints.

**npm install fails**
→ Check Node.js version: `node -v` should be 18 or newer. If older, install Node 18+ from nodejs.org.
