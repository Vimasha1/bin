"""
SLIIT Smart Bin — Local Analytics Backend
==========================================
Serves clean operational bin decisions to the React dashboard.

Architecture:
  Real bin (smartbin_01) → Railway API (live) → this backend
  Simulated bins (02-08) → CSV files (historical) → this backend
                                                           ↓
                                            ML models run internally
                                                           ↓
                                             Decision layer for dashboard

Run:
  cd local_backend
  pip install -r requirements.txt
  python3 app.py

Then dashboard hits the configured backend URL.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import pandas as pd
import joblib
import os
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path

load_dotenv()

# ════════════════════════════════════════════════════════════
# CONFIGURATION
# ════════════════════════════════════════════════════════════
BASE_DIR    = Path(__file__).parent
MODELS_DIR  = BASE_DIR / 'models'
DATASETS_DIR = BASE_DIR / 'datasets'

RAILWAY_API = os.environ.get('LIVE_READINGS_API_URL', 'https://web-production-742c8.up.railway.app').rstrip('/')

# ════════════════════════════════════════════════════════════
# BIN METADATA — static info for each bin
# ════════════════════════════════════════════════════════════
BIN_METADATA = {
    'smartbin_01': {
        'name':           'Faculty of Computing',
        'location':       'FOC Main Entrance',
        'capacity_l':     25,
        'collector_zone': 'central',
        'collector_name': 'Saman P.',
        'collector_phone': '+94 77 ••• 4421',
        'is_real':        True,
        'csv_file':       'smartbin_01_faculty_of_computing.csv'
    },
    'smartbin_02': {
        'name':           'NB Canteen',
        'location':       'New Building Ground Floor',
        'capacity_l':     25,
        'collector_zone': 'north',
        'collector_name': 'Nimal R.',
        'collector_phone': '+94 77 ••• 7833',
        'is_real':        False,
        'csv_file':       'smartbin_02_nb_canteen.csv'
    },
    'smartbin_03': {
        'name':           "Bird's Nest",
        'location':       'Bird\'s Nest Canteen',
        'capacity_l':     22,
        'collector_zone': 'north',
        'collector_name': 'Nimal R.',
        'collector_phone': '+94 77 ••• 7833',
        'is_real':        False,
        'csv_file':       'smartbin_03_birds_nest.csv'
    },
    'smartbin_04': {
        'name':           'Basement Cafe',
        'location':       'Basement Floor',
        'capacity_l':     18,
        'collector_zone': 'south',
        'collector_name': 'Kasun F.',
        'collector_phone': '+94 77 ••• 2204',
        'is_real':        False,
        'csv_file':       'smartbin_04_basement_cafe.csv'
    },
    'smartbin_05': {
        'name':           'BS Canteen',
        'location':       'Business School',
        'capacity_l':     30,
        'collector_zone': 'central',
        'collector_name': 'Saman P.',
        'collector_phone': '+94 77 ••• 4421',
        'is_real':        False,
        'csv_file':       'smartbin_05_bs_canteen.csv'
    },
    'smartbin_06': {
        'name':           'WA Canteen',
        'location':       'William Angliss',
        'capacity_l':     30,
        'collector_zone': 'central',
        'collector_name': 'Saman P.',
        'collector_phone': '+94 77 ••• 4421',
        'is_real':        False,
        'csv_file':       'smartbin_06_wa_canteen.csv'
    },
    'smartbin_07': {
        'name':           'Main Entrance',
        'location':       'Campus Main Gate',
        'capacity_l':     28,
        'collector_zone': 'central',
        'collector_name': 'Saman P.',
        'collector_phone': '+94 77 ••• 4421',
        'is_real':        False,
        'csv_file':       'smartbin_07_main_entrance.csv'
    },
    'smartbin_08': {
        'name':           'P&S Office',
        'location':       'Procurement & Stores',
        'capacity_l':     15,
        'collector_zone': 'south',
        'collector_name': 'Kasun F.',
        'collector_phone': '+94 77 ••• 2204',
        'is_real':        False,
        'csv_file':       'smartbin_08_pands_office.csv'
    }
}

# ════════════════════════════════════════════════════════════
# LOAD ML MODELS
# ════════════════════════════════════════════════════════════
print("Loading ML models...")
state_classifier = None
time_to_full_regressor = None
MODEL_LOAD_ERROR = None
try:
    state_classifier = joblib.load(MODELS_DIR / 'bin_state_classifier.pkl')
    time_to_full_regressor = joblib.load(MODELS_DIR / 'time_to_full_regressor.pkl')
    print("✅ Bin state classifier + time-to-full regressor loaded")
except Exception as e:
    MODEL_LOAD_ERROR = str(e)
    print(f"❌ Model loading failed: {MODEL_LOAD_ERROR}")

FEATURE_COLUMNS = ['fillLevel', 'weight', 'densityIndex', 'hour', 'day_of_week']
BIN_STATES = ['empty', 'half_filled', 'normal', 'loosely_filled', 'densely_filled', 'anomaly']
ANALYTICS_CACHE = {}
ANALYTICS_CACHE_SECONDS = 60
MAX_TIMESERIES_POINTS = 300

# ════════════════════════════════════════════════════════════
# CSV CACHE — load all sim bin datasets into memory
# ════════════════════════════════════════════════════════════
print("Loading datasets...")
DATASETS = {}
for bin_id, meta in BIN_METADATA.items():
    csv_path = DATASETS_DIR / meta['csv_file']
    if csv_path.exists():
        df = pd.read_csv(csv_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, format='mixed')
        DATASETS[bin_id] = df
        print(f"   {bin_id}: {len(df)} records")

if not DATASETS:
    for consolidated_name in (
        'smartbin_ml_full_results.csv',
        'all_bins_with_states.csv',
        'smartbin_dashboard_predictions.csv'
    ):
        csv_path = DATASETS_DIR / consolidated_name
        if not csv_path.exists():
            continue
        df = pd.read_csv(csv_path)
        if 'sensor_id' not in df.columns:
            continue
        df['timestamp'] = pd.to_datetime(df.get('timestamp'), utc=True, format='mixed')
        for bin_id, group in df.groupby('sensor_id'):
            if bin_id in BIN_METADATA:
                DATASETS[bin_id] = group.sort_values('timestamp').reset_index(drop=True)
                print(f"   {bin_id}: {len(group)} records from {consolidated_name}")
        if DATASETS:
            break

# ════════════════════════════════════════════════════════════
# ML INFERENCE FUNCTIONS
# ════════════════════════════════════════════════════════════
def to_float(value, default=0.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_timestamp(value):
    if isinstance(value, str):
        return pd.to_datetime(value, utc=True)
    if isinstance(value, pd.Timestamp):
        return value.tz_convert('UTC') if value.tzinfo else value.tz_localize('UTC')
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def prepare_model_features(reading):
    fill = to_float(reading.get('fillLevel'))
    weight = to_float(reading.get('weight'))
    density = weight / fill if fill > 0 else 0.0
    ts_dt = parse_timestamp(reading.get('timestamp') or reading.get('last_updated'))

    features = pd.DataFrame([{
        'fillLevel': fill,
        'weight': weight,
        'densityIndex': density,
        'hour': int(ts_dt.hour),
        'day_of_week': int(ts_dt.weekday())
    }], columns=FEATURE_COLUMNS)

    return features, fill, weight, density, ts_dt


def clean_time_to_full(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
        value = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(value):
        return None
    if value <= 0:
        return None
    return round(value, 1)


def generate_decision(fillLevel, weight, bin_state, time_to_full):
    """Convert internal model outputs into supervisor-facing decisions."""
    cleaned_time = clean_time_to_full(time_to_full)

    if fillLevel <= 10:
        return {
            'status': 'Empty',
            'action': 'No action needed',
            'priority': 0,
            'time_to_full': None
        }

    if bin_state == 'anomaly':
        return {
            'status': 'Anomaly',
            'action': 'Inspect bin / sensor',
            'priority': 5,
            'time_to_full': None
        }

    if bin_state == 'densely_filled':
        return {
            'status': 'Full',
            'action': 'Collect immediately',
            'priority': 4,
            'time_to_full': cleaned_time
        }

    if cleaned_time is not None and cleaned_time <= 60:
        return {
            'status': 'Almost Full',
            'action': 'Collect within 1 hour',
            'priority': 3,
            'time_to_full': cleaned_time
        }

    if bin_state == 'loosely_filled':
        return {
            'status': 'Light Waste',
            'action': 'Delay collection / compress waste',
            'priority': 1,
            'time_to_full': cleaned_time
        }

    return {
        'status': 'Normal',
        'action': 'Monitor',
        'priority': 2,
        'time_to_full': cleaned_time
    }


def enrich_reading(reading, bin_id, include_internal=False):
    """Run saved ML models internally, then return a clean operational decision."""
    features, fill, weight, density, ts_dt = prepare_model_features(reading)
    hour = int(ts_dt.hour)
    dow = int(ts_dt.weekday())

    prediction_error = reading.get('prediction_error')
    predicted_bin_state = reading.get('predicted_bin_state')
    predicted_time_to_full = reading.get('predicted_time_to_full_minutes')

    if predicted_time_to_full is not None:
        predicted_time_to_full = max(0.0, to_float(predicted_time_to_full))

    # Prefer predictions already stored by the ingestion backend; otherwise run local inference.
    if not predicted_bin_state or predicted_time_to_full is None:
        if not state_classifier or not time_to_full_regressor:
            prediction_error = MODEL_LOAD_ERROR or 'ML models are not loaded'
            predicted_bin_state = predicted_bin_state or 'unknown'
            predicted_time_to_full = predicted_time_to_full if predicted_time_to_full is not None else 0.0
        else:
            try:
                predicted_bin_state = str(state_classifier.predict(features)[0])
                predicted_time_to_full = float(time_to_full_regressor.predict(features)[0])
                predicted_time_to_full = max(0.0, predicted_time_to_full)
            except Exception as exc:
                prediction_error = str(exc)
                predicted_bin_state = predicted_bin_state or 'unknown'
                predicted_time_to_full = predicted_time_to_full if predicted_time_to_full is not None else 0.0

    public_fill = int(fill)
    decision = generate_decision(
        public_fill,
        weight,
        predicted_bin_state,
        predicted_time_to_full
    )

    meta = BIN_METADATA.get(bin_id, {})

    enriched = {
        'sensor_id':     bin_id,
        'location':      meta.get('name') or meta.get('location') or bin_id,
        'fillLevel':     public_fill,
        'weight':        round(weight, 2),
        'status':        decision['status'],
        'action':        decision['action'],
        'priority':      decision['priority'],
        'time_to_full':  decision['time_to_full'],
        'last_updated':  ts_dt.isoformat() if hasattr(ts_dt, 'isoformat') else str(ts_dt),
        'data_source':   reading.get('data_source'),
        'is_simulated':  not meta.get('is_real', False)
    }

    if prediction_error:
        enriched['prediction_error'] = prediction_error
    if include_internal:
        enriched.update({
            'distance': round(float(reading.get('distance', 0)), 2),
            'densityIndex': round(density, 4),
            'hour': int(hour),
            'day_of_week': int(dow),
            'predicted_bin_state': predicted_bin_state,
            'predicted_time_to_full_minutes': clean_time_to_full(predicted_time_to_full)
        })
    return enriched


def get_current_reading(bin_id):
    if bin_id not in BIN_METADATA:
        return None, ({'error': 'Unknown bin'}, 404)

    meta = BIN_METADATA[bin_id]
    if meta['is_real']:
        try:
            r = requests.get(f"{RAILWAY_API}/api/readings/latest", timeout=10)
            raw = r.json()
            raw['data_source'] = 'live'
            return enrich_reading(raw, bin_id), None
        except Exception as e:
            df = DATASETS.get(bin_id)
            if df is not None and len(df) > 0:
                raw = df.iloc[-1].to_dict()
                raw['data_source'] = 'live_unavailable_fallback'
                return enrich_reading(raw, bin_id), None
            return None, ({
                'error': 'Live API unreachable',
                'detail': str(e),
                'data_source': 'unavailable'
            }, 503)

    df = DATASETS.get(bin_id)
    if df is None or len(df) == 0:
        return None, ({'error': 'No dataset'}, 404)

    now_idx = int((datetime.now().timestamp() / 60) % len(df))
    raw = df.iloc[now_idx].to_dict()
    raw['data_source'] = 'historical_simulated'
    return enrich_reading(raw, bin_id), None


def status_bucket_counts(bins):
    return {
        'urgent': sum(1 for b in bins if b.get('action') in ('Collect immediately', 'Inspect bin / sensor')),
        'soon': sum(1 for b in bins if b.get('action') == 'Collect within 1 hour'),
        'normal': sum(1 for b in bins if b.get('status') in ('Normal', 'Light Waste')),
        'no_action': sum(1 for b in bins if b.get('action') == 'No action needed')
    }


def decision_from_dataset_row(row):
    state = row.get('bin_state') or row.get('predicted_bin_state') or 'normal'
    time_to_full = row.get('time_to_full_minutes')
    if time_to_full is None:
        time_to_full = row.get('predicted_time_to_full_minutes')
    return generate_decision(
        int(to_float(row.get('fillLevel'))),
        to_float(row.get('weight')),
        str(state),
        time_to_full
    )


def downsample_records(records, max_points=MAX_TIMESERIES_POINTS):
    if len(records) <= max_points:
        return records
    step = max(1, len(records) // max_points)
    sampled = records[::step]
    return sampled[-max_points:]


def dataframe_for_bin(bin_id):
    df = DATASETS.get(bin_id)
    if df is None or len(df) == 0:
        return None
    return df.sort_values('timestamp').reset_index(drop=True)

# ════════════════════════════════════════════════════════════
# FLASK APP
# ════════════════════════════════════════════════════════════
app = Flask(__name__)

def cors_origins():
    configured = [
        origin.strip()
        for origin in os.environ.get('CORS_ORIGIN', '').split(',')
        if origin.strip()
    ]
    return configured + [
        'http://localhost:5173',
        'http://127.0.0.1:5173'
    ]

CORS(app, resources={r"/api/*": {"origins": cors_origins()}, r"/": {"origins": cors_origins()}})

# ─── ROOT ─────────────────────────────────────────────────
@app.route('/')
def root():
    return jsonify({
        'service': 'SLIIT Smart Bin Analytics Backend',
        'status':  'running',
        'bins':    list(BIN_METADATA.keys()),
        'models':  ['RandomForestClassifier', 'RandomForestRegressor'],
        'models_loaded': bool(state_classifier and time_to_full_regressor),
        'model_error': MODEL_LOAD_ERROR,
        'states':  BIN_STATES,
        'endpoints': [
            'GET  /api/fleet/summary',
            'GET  /api/bin/<id>/current',
            'GET  /api/bin/<id>/history?hours=24',
            'GET  /api/bin/<id>/analytics',
            'GET  /api/analytics/summary',
            'GET  /api/analytics/summary?sensor_id=<id>',
            'GET  /api/analytics/timeseries?sensor_id=<id>&hours=24',
            'GET  /api/analytics/bin/<id>',
            'POST /api/predict',
            'POST /api/dispatch-sms',
            'GET  /api/dispatch-log',
            'POST /api/chat'
        ]
    })

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})

# ─── PREDICT (single reading) ────────────────────────────
@app.route('/api/predict', methods=['POST'])
def predict():
    """Take a sensor reading, run internal ML, return a clean decision."""
    data = request.get_json()
    bin_id = data.get('sensor_id', 'smartbin_01')
    enriched = enrich_reading(data, bin_id)
    return jsonify(enriched)

# ─── BIN CURRENT STATE ───────────────────────────────────
@app.route('/api/bin/<bin_id>/current')
def bin_current(bin_id):
    """Latest reading for a bin.
    Real bin: live from Railway. Sim bins: latest CSV row."""
    if bin_id not in BIN_METADATA:
        return jsonify({'error': 'Unknown bin'}), 404

    enriched, error = get_current_reading(bin_id)
    if error:
        body, status = error
        return jsonify(body), status
    return jsonify(enriched)

# ─── BIN HISTORY ─────────────────────────────────────────
@app.route('/api/bin/<bin_id>/history')
def bin_history(bin_id):
    """Time series for a bin."""
    if bin_id not in BIN_METADATA:
        return jsonify({'error': 'Unknown bin'}), 404

    hours = int(request.args.get('hours', 24))
    meta = BIN_METADATA[bin_id]

    if meta['is_real']:
        # Real bin: pull from Railway, then enrich
        try:
            r = requests.get(f"{RAILWAY_API}/api/readings/history", timeout=10)
            raw_list = r.json()
            # Last N hours
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            filtered = []
            for raw in raw_list:
                try:
                    ts = pd.to_datetime(raw.get('timestamp'), utc=True)
                    if ts >= cutoff:
                        filtered.append(raw)
                except:
                    continue
            enriched_list = [enrich_reading(r, bin_id) for r in filtered]
            return jsonify({
                'bin_id':      bin_id,
                'data_source': 'live',
                'hours':       hours,
                'count':       len(enriched_list),
                'readings':    enriched_list
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 503
    else:
        # Sim bin: filter CSV by hours window
        df = DATASETS.get(bin_id)
        if df is None:
            return jsonify({'error': 'No data'}), 404

        # Take the most recent `hours` worth from the CSV
        df_sorted = df.sort_values('timestamp')
        df_sorted = df_sorted.tail(hours * 6)  # 6 readings/hour at 10-min interval

        enriched_list = [enrich_reading(row.to_dict(), bin_id) for _, row in df_sorted.iterrows()]
        return jsonify({
            'bin_id':      bin_id,
            'data_source': 'historical_simulated',
            'hours':       hours,
            'count':       len(enriched_list),
            'readings':    enriched_list
        })

# ─── BIN ANALYTICS (pre-computed insights) ───────────────
def build_bin_analytics(bin_id):
    if bin_id not in BIN_METADATA:
        return None, ({'error': 'Unknown bin'}, 404)

    cache_key = f"bin:{bin_id}"
    cached = ANALYTICS_CACHE.get(cache_key)
    now = datetime.now(timezone.utc)
    if cached and (now - cached['created_at']).total_seconds() < ANALYTICS_CACHE_SECONDS:
        return cached['payload'], None

    meta = BIN_METADATA[bin_id]
    df = DATASETS.get(bin_id)
    if df is None or len(df) == 0:
        return None, ({'error': 'No data'}, 404)

    df_copy = df.copy()
    df_copy = df_copy.sort_values('timestamp')
    enriched_rows = [enrich_reading(row.to_dict(), bin_id) for _, row in df_copy.iterrows()]
    df_copy['status'] = [row['status'] for row in enriched_rows]
    df_copy['priority'] = [row['priority'] for row in enriched_rows]

    state_dist = df_copy['status'].value_counts().to_dict()

    if 'hour' not in df_copy.columns:
        df_copy['hour'] = pd.to_datetime(df_copy['timestamp'], utc=True).dt.hour
    if 'day_of_week' not in df_copy.columns:
        df_copy['day_of_week'] = pd.to_datetime(df_copy['timestamp'], utc=True).dt.weekday

    hourly_avg = df_copy.groupby('hour')['fillLevel'].mean().round(1).to_dict()
    daily_avg = df_copy.groupby('day_of_week')['fillLevel'].mean().round(1).to_dict()
    peak_hour = int(df_copy.groupby('hour')['fillLevel'].mean().idxmax())

    latest_24h = enriched_rows[-144:]
    payload = {
        'sensor_id':          bin_id,
        'location':           meta['name'],
        'data_source':        'live' if meta['is_real'] else 'historical_simulated',
        'is_simulated':       not meta['is_real'],
        'total_readings':     len(df),
        'state_distribution': state_dist,
        'hourly_avg_fill':    hourly_avg,
        'daily_avg_fill':     daily_avg,
        'peak_usage_hour':    peak_hour,
        'avg_fill':           round(float(df_copy['fillLevel'].mean()), 1),
        'avg_weight':         round(float(df_copy['weight'].mean()), 1),
        'max_weight':         round(float(df_copy['weight'].max()), 1),
        'latest_24h_readings': latest_24h,
        'cache_seconds':      ANALYTICS_CACHE_SECONDS,
        'generated_at':       now.isoformat()
    }
    ANALYTICS_CACHE[cache_key] = {'created_at': now, 'payload': payload}
    return payload, None


@app.route('/api/bin/<bin_id>/analytics')
def bin_analytics(bin_id):
    """Backward-compatible alias for lightweight selected-bin analytics."""
    payload, error = build_bin_analytics(bin_id)
    if error:
        body, status = error
        return jsonify(body), status
    return jsonify(payload)


@app.route('/api/analytics/summary')
def analytics_summary():
    """Small payload for the analytics page; selected-bin stats only when requested."""
    sensor_id = request.args.get('sensor_id')
    if sensor_id:
        payload, error = build_analytics_summary(sensor_id)
        if error:
            body, status = error
            return jsonify(body), status
        return jsonify(payload)

    return jsonify({
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'cache_seconds': ANALYTICS_CACHE_SECONDS,
        'bins': [
            {
                'sensor_id': bin_id,
                'location': meta['name'],
                'is_simulated': not meta['is_real']
            }
            for bin_id, meta in BIN_METADATA.items()
        ]
    })


def build_analytics_summary(bin_id):
    if bin_id not in BIN_METADATA:
        return None, ({'error': 'Unknown bin'}, 404)

    cache_key = f"summary:{bin_id}"
    now = datetime.now(timezone.utc)
    cached = ANALYTICS_CACHE.get(cache_key)
    if cached and (now - cached['created_at']).total_seconds() < ANALYTICS_CACHE_SECONDS:
        return cached['payload'], None

    meta = BIN_METADATA[bin_id]
    df = dataframe_for_bin(bin_id)
    if df is None:
        return None, ({'error': 'No analytics data available for this bin yet'}, 404)

    df_copy = df.copy()
    if 'hour' not in df_copy.columns:
        df_copy['hour'] = pd.to_datetime(df_copy['timestamp'], utc=True).dt.hour

    decisions = [decision_from_dataset_row(row.to_dict()) for _, row in df_copy.iterrows()]
    statuses = [d['status'] for d in decisions]
    state_dist = pd.Series(statuses).value_counts().to_dict()
    hourly_avg = df_copy.groupby('hour')['fillLevel'].mean().round(1).to_dict()
    peak_hour = int(df_copy.groupby('hour')['fillLevel'].mean().idxmax())

    payload = {
        'sensor_id': bin_id,
        'location': meta['name'],
        'data_source': 'live' if meta['is_real'] else 'historical_simulated',
        'is_simulated': not meta['is_real'],
        'total_readings': int(len(df_copy)),
        'state_distribution': state_dist,
        'hourly_avg_fill': hourly_avg,
        'peak_usage_hour': peak_hour,
        'avg_fill': round(float(df_copy['fillLevel'].mean()), 1),
        'avg_weight': round(float(df_copy['weight'].mean()), 1),
        'cache_seconds': ANALYTICS_CACHE_SECONDS,
        'generated_at': now.isoformat()
    }
    ANALYTICS_CACHE[cache_key] = {'created_at': now, 'payload': payload}
    return payload, None


@app.route('/api/analytics/timeseries')
def analytics_timeseries():
    bin_id = request.args.get('sensor_id', 'smartbin_01')
    hours = int(request.args.get('hours', 24))
    payload, error = build_analytics_timeseries(bin_id, hours)
    if error:
        body, status = error
        return jsonify(body), status
    return jsonify(payload)


def build_analytics_timeseries(bin_id, hours=24):
    if bin_id not in BIN_METADATA:
        return None, ({'error': 'Unknown bin'}, 404)

    hours = max(1, min(int(hours), 24 * 7))
    cache_key = f"timeseries:{bin_id}:{hours}"
    now = datetime.now(timezone.utc)
    cached = ANALYTICS_CACHE.get(cache_key)
    if cached and (now - cached['created_at']).total_seconds() < ANALYTICS_CACHE_SECONDS:
        return cached['payload'], None

    meta = BIN_METADATA[bin_id]
    records = []

    if meta['is_real']:
        try:
            r = requests.get(f"{RAILWAY_API}/api/readings/history", timeout=4)
            raw_list = r.json()
            cutoff = now - timedelta(hours=hours)
            for raw in raw_list:
                ts = pd.to_datetime(raw.get('timestamp') or raw.get('last_updated'), utc=True, errors='coerce')
                if pd.isna(ts) or ts.to_pydatetime() < cutoff:
                    continue
                records.append(enrich_reading(raw, bin_id))
        except Exception:
            records = []

    if not records:
        df = dataframe_for_bin(bin_id)
        if df is None:
            return None, ({'error': 'No analytics data available for this bin yet'}, 404)
        points = min(len(df), max(1, hours * 6))
        for _, row in df.tail(points).iterrows():
            row_dict = row.to_dict()
            decision = decision_from_dataset_row(row_dict)
            ts = parse_timestamp(row_dict.get('timestamp'))
            records.append({
                'sensor_id': bin_id,
                'location': meta['name'],
                'fillLevel': int(to_float(row_dict.get('fillLevel'))),
                'weight': round(to_float(row_dict.get('weight')), 2),
                'status': decision['status'],
                'action': decision['action'],
                'priority': decision['priority'],
                'time_to_full': decision['time_to_full'],
                'last_updated': ts.isoformat(),
                'is_simulated': not meta['is_real']
            })

    records = sorted(records, key=lambda r: r.get('last_updated') or '')
    records = downsample_records(records)
    payload = {
        'sensor_id': bin_id,
        'hours': hours,
        'count': len(records),
        'max_points': MAX_TIMESERIES_POINTS,
        'readings': records,
        'cache_seconds': ANALYTICS_CACHE_SECONDS,
        'generated_at': now.isoformat()
    }
    ANALYTICS_CACHE[cache_key] = {'created_at': now, 'payload': payload}
    return payload, None


@app.route('/api/analytics/bin/<bin_id>')
def analytics_bin(bin_id):
    payload, error = build_bin_analytics(bin_id)
    if error:
        body, status = error
        return jsonify(body), status
    return jsonify(payload)

# ─── FLEET SUMMARY ──────────────────────────────────────
@app.route('/api/fleet/summary')
def fleet_summary():
    """All bins at a glance — for operations console."""
    summary = []

    for bin_id, meta in BIN_METADATA.items():
        # Get current reading
        if meta['is_real']:
            try:
                r = requests.get(f"{RAILWAY_API}/api/readings/latest", timeout=5)
                raw = r.json()
                raw['data_source'] = 'live'
                enriched = enrich_reading(raw, bin_id)
            except:
                # Fallback to last CSV row
                df = DATASETS.get(bin_id)
                if df is not None and len(df) > 0:
                    raw = df.iloc[-1].to_dict()
                    raw['data_source'] = 'live_unavailable_fallback'
                    enriched = enrich_reading(raw, bin_id)
                else:
                    continue
        else:
            df = DATASETS.get(bin_id)
            if df is None or len(df) == 0:
                continue
            now_idx = int((datetime.now().timestamp() / 60) % len(df))
            row = df.iloc[now_idx].to_dict()
            row['data_source'] = 'historical_simulated'
            enriched = enrich_reading(row, bin_id)

        summary.append(enriched)

    counts = status_bucket_counts(summary)

    return jsonify({
        'timestamp':         datetime.now(timezone.utc).isoformat(),
        'total_bins':        len(summary),
        'bins':              sorted(summary, key=lambda b: (-b.get('priority', 0), b.get('location') or '')),
        'summary':           counts,
        'requires_action':   counts['urgent'] + counts['soon']
    })

# ─── SMS DISPATCH (simulated) ───────────────────────────
DISPATCH_LOG = []

@app.route('/api/dispatch-sms', methods=['POST'])
def dispatch_sms():
    """Simulate sending an SMS to a collector. Returns success + logs it."""
    data = request.get_json()
    bin_id = data.get('bin_id')
    message = data.get('message', '')

    if bin_id not in BIN_METADATA:
        return jsonify({'error': 'Unknown bin'}), 404

    meta = BIN_METADATA[bin_id]
    log_entry = {
        'timestamp':         datetime.now(timezone.utc).isoformat(),
        'bin_id':            bin_id,
        'bin_name':          meta['name'],
        'collector_name':    meta['collector_name'],
        'collector_phone':   meta['collector_phone'],
        'collector_zone':    meta['collector_zone'],
        'message':           message,
        'status':            'sent',
        'simulated':         True
    }
    DISPATCH_LOG.append(log_entry)

    return jsonify({
        'success':       True,
        'log_entry':     log_entry,
        'log_position':  len(DISPATCH_LOG)
    })

@app.route('/api/dispatch-log')
def dispatch_log():
    """Return all dispatched SMS messages."""
    return jsonify({
        'count':   len(DISPATCH_LOG),
        'entries': list(reversed(DISPATCH_LOG))[:50]   # last 50, newest first
    })

# ════════════════════════════════════════════════════════════
# CHATBOT  —  page-aware, single-source-of-truth design
# ════════════════════════════════════════════════════════════
CHAT_SYSTEM_PROMPT = (
    "You are a Smart Waste Collection Assistant for a garbage collection supervisor. "
    "Answer using only the provided smart bin dashboard data. "
    "Focus on operational decisions: collect, delay, monitor, or inspect. "
    "Keep answers short, clear, and non-technical. "
    "If relevant, mention the bin location, status, fill level, and recommendation. "
    "If the question is outside the smart bin data or dashboard, say: "
    "I can answer questions about the smart bin data and dashboard only."
)

# ─── Dataset analytics helpers (historical counts / trends) ──

def get_state_distribution(sensor_id):
    """Full-history status distribution for one bin, cached."""
    cache_key = f"chatdist:{sensor_id}"
    now = datetime.now(timezone.utc)
    cached = ANALYTICS_CACHE.get(cache_key)
    if cached and (now - cached['created_at']).total_seconds() < ANALYTICS_CACHE_SECONDS:
        return cached['payload']

    df = DATASETS.get(sensor_id)
    if df is None or len(df) == 0:
        return {}

    statuses = [decision_from_dataset_row(row.to_dict())['status'] for _, row in df.iterrows()]
    dist = pd.Series(statuses).value_counts().to_dict()
    ANALYTICS_CACHE[cache_key] = {'created_at': now, 'payload': dist}
    return dist


def count_state(sensor_id, state):
    """Count how many dataset records map to the given decision status."""
    dist = get_state_distribution(sensor_id)
    for k, v in dist.items():
        if k.lower() == state.lower():
            return int(v)
    return 0


def get_last_24h_summary(sensor_id):
    """Key stats for the most recent ~24 hours of dataset records."""
    df = DATASETS.get(sensor_id)
    if df is None or len(df) == 0:
        return None

    recent = df.sort_values('timestamp').tail(144)  # 6 readings/hr × 24 hr
    decisions = [decision_from_dataset_row(row.to_dict()) for _, row in recent.iterrows()]
    statuses = [d['status'] for d in decisions]
    status_dist = pd.Series(statuses).value_counts().to_dict()

    return {
        'records':            len(recent),
        'avg_fill':           round(float(recent['fillLevel'].mean()), 1),
        'max_fill':           int(recent['fillLevel'].max()),
        'avg_weight':         round(float(recent['weight'].mean()), 1),
        'status_distribution': status_dist,
        'most_common_status': max(status_dist, key=status_dist.get) if status_dist else 'Normal',
    }


def get_peak_hour(sensor_id):
    """Hour-of-day with the highest average fill level for this bin."""
    df = DATASETS.get(sensor_id)
    if df is None or len(df) == 0:
        return None

    df_copy = df.copy()
    if 'hour' not in df_copy.columns:
        df_copy['hour'] = pd.to_datetime(df_copy['timestamp'], utc=True).dt.hour

    hourly = df_copy.groupby('hour')['fillLevel'].mean()
    peak   = int(hourly.idxmax())
    return {'hour': peak, 'avg_fill': round(float(hourly[peak]), 1), 'label': f"{peak:02d}:00"}


def get_selected_bin_analytics(sensor_id):
    """Combines dataset stats for the selected bin into one dict."""
    if not sensor_id or sensor_id not in BIN_METADATA:
        return None
    df    = DATASETS.get(sensor_id)
    total = len(df) if df is not None else 0
    return {
        'sensor_id':          sensor_id,
        'location':           BIN_METADATA[sensor_id]['name'],
        'total_records':      total,
        'state_distribution': get_state_distribution(sensor_id) if total else {},
        'last_24h':           get_last_24h_summary(sensor_id),
        'peak_hour':          get_peak_hour(sensor_id),
    }

# ─── Context builder ──────────────────────────────────────

def build_chat_context(current_bin, fleet_bins, analytics_summary_payload, selected_bin_analytics):
    """
    Build LLM context string.  Priority:
      current_bin              → exact live dashboard reading (primary for current-state Q)
      fleet_bins               → all bins live readings (fleet Q)
      analytics_summary_payload → matches Analytics page charts (chart/avg Q)
      selected_bin_analytics   → full-dataset counts (history/count Q)
    """
    lines = []

    if current_bin:
        lines += [
            "=== CURRENTLY VIEWED BIN — LIVE DASHBOARD READING ===",
            f"Location: {current_bin.get('location', '?')} ({current_bin.get('sensor_id', '?')})",
            f"Status: {current_bin.get('status', '?')} | "
            f"Fill: {current_bin.get('fillLevel', '?')}% | "
            f"Weight: {current_bin.get('weight', '?')}g",
            f"Action: {current_bin.get('action', '?')} | "
            f"Priority: {current_bin.get('priority', '?')}",
        ]
        if current_bin.get('time_to_full'):
            lines.append(f"Time to full: {current_bin['time_to_full']} min")
        if current_bin.get('last_updated'):
            lines.append(f"Last updated: {current_bin['last_updated']}")
        lines.append("Use these values for ALL questions about this bin's current status/fill/weight/action.")

    if fleet_bins:
        urgent = [b for b in fleet_bins if b.get('priority', 0) >= 4]
        soon   = [b for b in fleet_bins if b.get('priority', 0) == 3]
        lines += [
            "\n=== ALL BINS — CURRENT FLEET STATUS ===",
            f"Total: {len(fleet_bins)} | Urgent: {len(urgent)} | Collect soon: {len(soon)}",
        ]
        for b in sorted(fleet_bins, key=lambda x: -x.get('priority', 0)):
            ttf     = b.get('time_to_full')
            ttf_str = f", ttf={ttf}min" if ttf else ""
            lines.append(
                f"- {b.get('location','?')} ({b.get('sensor_id','?')}): "
                f"{b.get('status','?')}, fill={b.get('fillLevel','?')}%"
                f", action={b.get('action','?')}{ttf_str}"
            )

    if analytics_summary_payload and (
        analytics_summary_payload.get('total_readings') or analytics_summary_payload.get('reading_count')
    ):
        sa    = analytics_summary_payload
        total = sa.get('total_readings') or sa.get('reading_count')
        lines += [
            "\n=== ANALYTICS SUMMARY — EXACT VALUES SHOWN ON ANALYTICS PAGE CHARTS ===",
            f"Bin: {sa.get('location', sa.get('sensor_id', '?'))}",
            f"Average fill: {_analytics_value(sa, 'avg_fill', 'average_fill')}%",
            f"Average weight: {_analytics_value(sa, 'avg_weight', 'average_weight')}g",
            f"Peak usage hour: {_format_hour(_analytics_value(sa, 'peak_usage_hour', 'peak_hour'))}",
            f"Total readings: {total}",
        ]
        if sa.get('latest_24h_trend'):
            lines.append(f"Last 24h trend: {sa['latest_24h_trend']}")
        if sa.get('drop_count') is not None:
            lines.append(f"Collection/compression drops detected: {sa['drop_count']}")
        dist = sa.get('state_distribution', {})
        if dist:
            lines.append("Status distribution (all readings):")
            for status, count in sorted(dist.items(), key=lambda x: -x[1]):
                pct = round(count / total * 100, 1)
                lines.append(f"  {status}: {count} ({pct}%)")
    elif selected_bin_analytics and selected_bin_analytics.get('total_records', 0) > 0:
        sa    = selected_bin_analytics
        total = sa['total_records']
        lines += [
            "\n=== HISTORICAL DATASET STATISTICS ===",
            f"Bin: {sa.get('location', '?')} | Total records: {total}",
        ]
        dist = sa.get('state_distribution', {})
        if dist:
            lines.append("Status distribution:")
            for status, count in sorted(dist.items(), key=lambda x: -x[1]):
                pct = round(count / total * 100, 1)
                lines.append(f"  {status}: {count} ({pct}%)")
        last24 = sa.get('last_24h')
        if last24:
            lines.append(
                f"Last 24h: avg fill={last24['avg_fill']}%, max={last24['max_fill']}%, "
                f"most common={last24['most_common_status']}"
            )
        peak = sa.get('peak_hour')
        if peak:
            lines.append(f"Peak fill hour: {peak['label']} (avg {peak['avg_fill']}%)")

    return "\n".join(lines) if lines else "No data available."

# ─── Intent helpers ───────────────────────────────────────

# Ordered longest-first so "almost full" matches before "full"
_STATUS_ALIASES = [
    ('light waste',  'Light Waste'),
    ('light_waste',  'Light Waste'),
    ('almost full',  'Almost Full'),
    ('almost_full',  'Almost Full'),
    ('anomaly',      'Anomaly'),
    ('normal',       'Normal'),
    ('empty',        'Empty'),
    ('full',         'Full'),
]

def _detect_status(msg):
    m = msg.lower()
    for phrase, canonical in _STATUS_ALIASES:
        if phrase in m:
            return canonical
    return None

def _detect_bin_mention(msg):
    m = msg.lower()
    for bid, meta in BIN_METADATA.items():
        aliases = {bid.lower(), meta['name'].lower(), meta.get('location', '').lower()}
        aliases.update(part.lower() for part in meta['name'].replace('&', 'and').split() if len(part) > 2)
        if any(alias and alias in m for alias in aliases):
            return bid
    return None

def _is_current_status_question(msg):
    m = msg.lower()
    return any(kw in m for kw in [
        'current status', 'current fill', 'current weight', 'current action',
        'what is the status', 'what is the fill', 'how full', 'right now',
        'at the moment', 'currently', 'what is it doing', 'what is happening',
    ])

def _is_count_question(msg):
    m = msg.lower()
    return any(kw in m for kw in [
        'how many', 'how often', 'count', 'times', 'frequently',
        'frequency', 'percentage', 'percent', 'how much of the time',
    ])

def _is_analytics_question(msg):
    m = msg.lower()
    return any(kw in m for kw in [
        'average', 'avg', 'peak hour', 'trend', 'chart', 'graph',
        'pattern', 'usage pattern', 'hourly', 'distribution',
    ])

def is_trend_question(message):
    m = (message or '').lower()
    return any(kw in m for kw in [
        'trend', 'graph', 'chart', 'line', 'last 24', 'what happened',
        'pattern', 'increase', 'decrease', 'drop',
    ])

def _is_fleet_question(msg):
    m = msg.lower()
    return any(kw in m for kw in [
        'all bins', 'fleet', 'every bin', 'overall', 'campus', 'across bins',
        'which bins', 'bins need', 'need action',
    ])

def _analytics_value(payload, *keys):
    for key in keys:
        value = payload.get(key)
        if value is not None:
            return value
    return None

def _calculate_drop_events_from_timeseries(points):
    if not points:
        return []
    ordered = sorted(points, key=lambda point: point.get('timestamp') or point.get('last_updated') or '')
    drops = []
    for previous, current in zip(ordered, ordered[1:]):
        previous_fill = to_float(previous.get('fillLevel'))
        current_fill = to_float(current.get('fillLevel'))
        if previous_fill - current_fill >= 30:
            drops.append({
                'timestamp': current.get('timestamp') or current.get('last_updated'),
                'from': previous_fill,
                'to': current_fill,
            })
    return drops

def _format_hour(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return f"{int(value):02d}:00"
    except (TypeError, ValueError):
        return str(value)

def _format_drop_time(timestamp):
    if not timestamp:
        return None
    try:
        dt = parse_timestamp(timestamp)
        return dt.strftime('%H:%M')
    except Exception:
        return str(timestamp)

def trend_response_from_analytics(analytics_payload, selected_bin_name=None, selected_bin_id=None):
    if not analytics_payload:
        return ("I need the selected bin's analytics chart data to explain that trend. "
                "Open a bin Analytics page and ask again.")

    loc = (selected_bin_name or analytics_payload.get('location') or
           analytics_payload.get('selected_bin_name') or selected_bin_id or 'the selected bin')
    avg_fill = _analytics_value(analytics_payload, 'average_fill', 'avg_fill')
    avg_weight = _analytics_value(analytics_payload, 'average_weight', 'avg_weight')
    peak_hour = _format_hour(_analytics_value(analytics_payload, 'peak_hour', 'peak_usage_hour'))
    reading_count = _analytics_value(analytics_payload, 'reading_count', 'total_readings', 'count') or 0
    trend = analytics_payload.get('latest_24h_trend')
    max_fill = analytics_payload.get('max_fill')
    min_fill = analytics_payload.get('min_fill')

    points = analytics_payload.get('time_series') or analytics_payload.get('readings') or []
    drops = _calculate_drop_events_from_timeseries(points)
    drop_count = analytics_payload.get('drop_count')
    if drop_count is None:
        drop_count = len(drops)
    drop_time = _format_drop_time(drops[-1]['timestamp']) if drops else None

    if not trend:
        if drop_count:
            trend = 'the fill level increased, then dropped sharply'
        elif max_fill is not None and min_fill is not None and max_fill - min_fill >= 10:
            trend = f'the fill level varied between {min_fill}% and {max_fill}%'
        else:
            trend = 'the fill level stayed mostly stable'

    drop_sentence = ''
    if drop_count:
        when = f" around {drop_time}" if drop_time else ''
        drop_sentence = f" It dropped sharply{when}, which usually indicates collection or compression."

    peak_sentence = f" Peak usage is around {peak_hour}." if peak_hour else ''
    avg_parts = []
    if avg_fill is not None:
        avg_parts.append(f"average fill is {avg_fill}%")
    if avg_weight is not None:
        avg_parts.append(f"average weight is {avg_weight}g")
    avg_sentence = f" The {', and '.join(avg_parts)}" if avg_parts else ""
    if avg_sentence:
        avg_sentence += f" across {reading_count} readings."
    elif reading_count:
        avg_sentence = f" The chart uses {reading_count} readings."

    return (f"The selected bin is **{loc}**. In the last 24 hours, {trend}."
            f"{drop_sentence}{peak_sentence}{avg_sentence}")

# ─── Rule-based responses ─────────────────────────────────

def rule_based_response(message, current_bin, fleet_bins, analytics_summary_payload,
                        selected_bin_id, selected_bin_analytics):
    msg = message.lower()

    urgent    = [b for b in fleet_bins if b.get('priority', 0) >= 4]
    soon      = [b for b in fleet_bins if b.get('priority', 0) == 3]
    anomalies = [b for b in fleet_bins if b.get('status') == 'Anomaly']

    # ── Out-of-scope ───────────────────────────────────────
    if any(kw in msg for kw in ['weather', 'traffic', 'salary', 'news', 'sports', 'politics']):
        return "I can answer questions about the smart bin data and dashboard only."

    # ── Current status / fill / weight / action ────────────
    # These MUST come from current_bin (exact dashboard reading)
    current_kw = ['current status', 'current fill', 'current weight', 'current action',
                  'what is the status', 'what is the fill', 'how full is', 'what is the current',
                  'status now', 'fill level', 'fill now']
    if any(kw in msg for kw in current_kw) or (
        _is_current_status_question(msg) and current_bin
    ):
        if current_bin:
            loc  = current_bin.get('location', '?')
            ttf  = current_bin.get('time_to_full')
            ttf_str = f" Time to full: {ttf} min." if ttf else ""
            src = "Based on the current dashboard reading"
            return (f"{src}, **{loc}** is **{current_bin['status']}** — "
                    f"fill **{current_bin['fillLevel']}%**, weight {current_bin['weight']}g. "
                    f"Action: {current_bin['action']}.{ttf_str}")

    # ── Count / frequency → full dataset ──────────────────
    if _is_count_question(msg):
        target_id  = selected_bin_id
        target_loc = current_bin.get('location') if current_bin else None
        sa = selected_bin_analytics

        # Check if analytics_summary has the distribution (use it — matches charts)
        if analytics_summary_payload and analytics_summary_payload.get('state_distribution'):
            dist  = analytics_summary_payload['state_distribution']
            total = analytics_summary_payload.get('total_readings') or analytics_summary_payload.get('reading_count') or sum(dist.values())
            loc   = analytics_summary_payload.get('location', target_loc or '?')
            asked = _detect_status(msg)
            if asked:
                count = dist.get(asked, 0)
                pct   = round(count / total * 100, 1) if total else 0
                return (f"Based on historical analytics, **{loc}** was marked "
                        f"**{asked}** **{count} times** out of {total} readings ({pct}%).")
            # General breakdown
            lines = [f"Based on historical analytics, **{loc}** — "
                     f"status breakdown across {total} readings:"]
            for status, count in sorted(dist.items(), key=lambda x: -x[1]):
                pct = round(count / total * 100, 1)
                lines.append(f"• {status}: {count} times ({pct}%)")
            return "\n".join(lines)

        # Fall back to dataset
        if not target_id and current_bin:
            target_id = current_bin.get('sensor_id')
        if not sa and target_id and target_id in BIN_METADATA:
            sa = get_selected_bin_analytics(target_id)
        if not target_loc and sa:
            target_loc = sa.get('location')

        if sa and sa.get('total_records', 0) > 0:
            dist  = sa.get('state_distribution', {})
            total = sa['total_records']
            asked = _detect_status(msg)
            if asked:
                count = dist.get(asked, 0)
                pct   = round(count / total * 100, 1) if total else 0
                return (f"In the historical dataset, **{target_loc or sa['location']}** was marked "
                        f"**{asked}** **{count} times** out of {total} records ({pct}%).")
            lines = [f"In the historical dataset, **{target_loc or sa['location']}** — "
                     f"status breakdown across {total} records:"]
            for status, count in sorted(dist.items(), key=lambda x: -x[1]):
                pct = round(count / total * 100, 1)
                lines.append(f"• {status}: {count} times ({pct}%)")
            return "\n".join(lines)

        return ("No historical data available for counting. "
                "Navigate to a bin's Analytics page and ask again.")

    # ── Analytics questions (avg, peak, chart) ─────────────
    if _is_analytics_question(msg):
        sa = analytics_summary_payload or (
            selected_bin_analytics if selected_bin_analytics and selected_bin_analytics.get('total_records') else None
        )
        if sa:
            loc = sa.get('location', current_bin.get('location') if current_bin else '?')
            if 'average' in msg or 'avg' in msg:
                avg_fill   = _analytics_value(sa, 'avg_fill', 'average_fill') or '?'
                avg_weight = _analytics_value(sa, 'avg_weight', 'average_weight') or '?'
                total      = sa.get('total_readings') or sa.get('reading_count') or sa.get('total_records') or '?'
                return (f"Based on historical analytics for **{loc}**: "
                        f"average fill **{avg_fill}%**, average weight **{avg_weight}g** "
                        f"(across {total} readings).")
            if 'peak' in msg:
                peak_value = sa.get('peak_usage_hour') or sa.get('peak_hour')
                peak_hour = (peak_value or {}).get('hour') if isinstance(peak_value, dict) else peak_value
                if peak_hour is not None:
                    return (f"Based on historical analytics, **{loc}** peaks at **{_format_hour(peak_hour)}**.")
        # Fallback for 'peak' without analytics
        bins_ttf = [b for b in fleet_bins if b.get('time_to_full') and b['time_to_full'] > 0]
        if bins_ttf and 'peak' in msg:
            fastest = min(bins_ttf, key=lambda b: b['time_to_full'])
            return (f"**{fastest['location']}** is currently filling fastest — "
                    f"{fastest['time_to_full']} min until full.")

    # ── Last 24h / recent ─────────────────────────────────
    if any(kw in msg for kw in ['24h', '24 hour', '24-hour', 'recent', 'today',
                                 'lately', 'last day', 'last 24']):
        # Analytics page: use analytics_summary state_distribution + avg
        if analytics_summary_payload and (
            analytics_summary_payload.get('total_readings') or analytics_summary_payload.get('reading_count')
        ):
            sa   = analytics_summary_payload
            loc  = sa.get('location', '?')
            dist = sa.get('state_distribution', {})
            total = sa.get('total_readings') or sa.get('reading_count') or 0
            most_common = max(dist, key=dist.get) if dist else 'Normal'
            return (f"Based on the selected bin's historical analytics for **{loc}**: "
                    f"average fill **{_analytics_value(sa, 'avg_fill', 'average_fill')}%**, "
                    f"most common status **{most_common}** "
                    f"(across {total} readings).")
        # Operations or fallback: use dataset 24h summary
        bid = selected_bin_id or (current_bin.get('sensor_id') if current_bin else None)
        if bid:
            h24 = get_last_24h_summary(bid)
            loc = (current_bin or {}).get('location') or BIN_METADATA.get(bid, {}).get('name', bid)
            if h24:
                return (f"Based on historical analytics for **{loc}** in the last 24 h: "
                        f"avg fill **{h24['avg_fill']}%**, peak {h24['max_fill']}%, "
                        f"most common status **{h24['most_common_status']}**.")

    # ── Which bin to collect first ─────────────────────────
    if any(kw in msg for kw in ['first', 'highest priority', 'collect first', 'most urgent']):
        if urgent:
            top = urgent[0]
            return (f"Based on the current fleet status, **{top['location']}** should be "
                    f"collected first — status **{top['status']}**, {top['fillLevel']}% fill. "
                    f"Action: {top['action']}.")
        if soon:
            top    = soon[0]
            ttf    = top.get('time_to_full')
            ts_str = f" Expected full in {ttf} min." if ttf else ""
            return (f"**{top['location']}** needs collection soon — "
                    f"{top['status']} at {top['fillLevel']}% fill.{ts_str}")
        return "Based on the current fleet status, all bins are within normal range."

    # ── Which bins need action ─────────────────────────────
    if 'bins need' in msg or 'need action' in msg or 'action now' in msg or 'which bins' in msg:
        if not urgent and not soon:
            return "Based on the current fleet status, no bins need urgent action right now."
        parts = []
        if urgent:
            parts.append("Urgent — " + ", ".join(b['location'] for b in urgent))
        if soon:
            parts.append("Collect soon — " + ", ".join(b['location'] for b in soon))
        return "Based on the current fleet status:\n" + "\n".join(f"• {p}" for p in parts)

    # ── Anomalies ──────────────────────────────────────────
    if 'anomal' in msg:
        if not anomalies:
            return "No anomalies detected. All bin readings appear normal."
        names = ", ".join(b['location'] for b in anomalies)
        verb  = "is" if len(anomalies) == 1 else "are"
        return f"{names} {verb} flagged as anomaly. Please inspect or check the sensor."

    # ── Collection team next steps ─────────────────────────
    if ('what should' in msg and 'team' in msg) or 'do next' in msg or 'collection team' in msg:
        if not urgent and not soon:
            return "No urgent actions. The collection team can continue the normal monitoring route."
        steps = []
        if urgent:
            steps.append("Collect immediately: " + ", ".join(b['location'] for b in urgent))
        if soon:
            steps.append("Collect within 1 hour: " + ", ".join(b['location'] for b in soon))
        return "Collection team next steps:\n" + "\n".join(f"• {s}" for s in steps)

    # ── Which location fills fastest ───────────────────────
    if ('fill' in msg or 'full' in msg) and ('fast' in msg or 'quick' in msg or 'fastest' in msg):
        bins_ttf = [b for b in fleet_bins if b.get('time_to_full') and b['time_to_full'] > 0]
        if bins_ttf:
            fastest = min(bins_ttf, key=lambda b: b['time_to_full'])
            return (f"Based on current fleet status, **{fastest['location']}** is filling fastest — "
                    f"{fastest['time_to_full']} min until full ({fastest['fillLevel']}% filled).")
        top = max(fleet_bins, key=lambda b: b.get('fillLevel', 0)) if fleet_bins else None
        if top:
            return f"**{top['location']}** has the highest fill at {top['fillLevel']}%."

    # ── Light Waste ────────────────────────────────────────
    if 'light waste' in msg or ('light' in msg and 'waste' in msg):
        # Prefer current_bin if it is Light Waste
        target = current_bin if current_bin and current_bin.get('status') == 'Light Waste' else None
        if not target:
            target = next((b for b in fleet_bins if b.get('status') == 'Light Waste'), None)
        if target:
            hist_note = ""
            bid   = target.get('sensor_id')
            sa    = analytics_summary_payload or selected_bin_analytics
            if sa:
                dist  = sa.get('state_distribution', {})
                total = sa.get('total_readings') or sa.get('total_records', 0)
                lw    = dist.get('Light Waste', 0)
                if total > 0:
                    pct = round(lw / total * 100, 1)
                    hist_note = f" Historically, it was Light Waste {lw} times ({pct}%)."
            src = "Based on the current dashboard reading" if current_bin and current_bin.get('sensor_id') == target.get('sensor_id') else "Based on current fleet status"
            return (f"{src}, **{target['location']}** is Light Waste — "
                    f"fill {target['fillLevel']}% but weight only {target['weight']}g. "
                    f"Waste is loosely packed. Collection can be delayed; compress waste first."
                    f"{hist_note}")
        return ("Light Waste: high fill level but low weight — waste is loosely packed. "
                "Collection can be delayed and waste compressed.")

    # ── Time to full ───────────────────────────────────────
    if 'time to full' in msg or ('time' in msg and 'full' in msg):
        if current_bin and current_bin.get('time_to_full'):
            return (f"Based on the current dashboard reading, **{current_bin['location']}** "
                    f"is expected to be full in **{current_bin['time_to_full']} minutes**.")
        return ("Time to full is the predicted minutes until the bin reaches capacity. "
                "Bins under 60 minutes are flagged for priority collection.")

    # ── Status definitions ─────────────────────────────────
    if 'what' in msg or 'explain' in msg or 'mean' in msg:
        asked = _detect_status(msg)
        defs  = {
            'Anomaly':     "Sensor readings are unusual — fill/weight don't match normal patterns. Inspect the bin.",
            'Full':        "Bin is densely packed and at capacity. Collect immediately.",
            'Almost Full': "Bin will reach capacity within 1 hour. Schedule collection soon.",
            'Light Waste': "High fill but low weight — waste is loosely packed. Delay collection and compress.",
            'Normal':      "Filling at a typical rate. No immediate action needed.",
            'Empty':       "Fill below 10%. No action needed.",
        }
        if asked and asked in defs:
            return defs[asked]

    # ── Named bin lookup (any bin mentioned by name) ───────
    for bid, meta in BIN_METADATA.items():
        if meta['name'].lower() in msg or bid in msg:
            # Use fleet_bins (from frontend payload → exact dashboard values)
            b = next((x for x in fleet_bins if x.get('sensor_id') == bid), None)
            if b:
                ttf     = b.get('time_to_full')
                ttf_str = f" Expected full in {ttf} min." if ttf else ""
                src = "Based on the current dashboard reading" if b.get('sensor_id') == (current_bin or {}).get('sensor_id') else "Based on current fleet status"
                return (f"{src}, **{b['location']}**: {b['status']}, "
                        f"fill {b['fillLevel']}%, weight {b['weight']}g. "
                        f"Action: {b['action']}.{ttf_str}")

    # ── Clarify instead of guessing the wrong data source ──
    return ("Do you want the selected bin's current status, its analytics trend, "
            "or the whole fleet summary?")


@app.route('/api/chat', methods=['POST'])
def chat():
    """Page-aware chatbot. Uses frontend-provided live data as ground truth."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    user_message          = (data.get('message') or '').strip()
    page                  = data.get('page', 'operations')
    selected_bin_id       = data.get('selected_bin')
    selected_bin_name     = data.get('selected_bin_name')
    current_bin_payload   = data.get('current_selected_bin')   # exact live reading from dashboard
    fleet_payload         = data.get('fleet_summary')
    analytics_payload     = data.get('analytics_summary')

    if not user_message:
        return jsonify({'error': 'Message is required'}), 400

    mentioned_bin_id = _detect_bin_mention(user_message)
    if mentioned_bin_id:
        selected_bin_id = mentioned_bin_id

    # ── Fleet bins ──────────────────────────────────────────
    # Prefer frontend data (matches dashboard exactly), fallback to backend query
    if fleet_payload and fleet_payload.get('bins'):
        fleet_bins   = fleet_payload['bins']
        fleet_source = 'frontend_payload'
    else:
        fleet_bins = []
        for bid in BIN_METADATA:
            reading, _ = get_current_reading(bid)
            if reading:
                fleet_bins.append(reading)
        fleet_source = 'backend_query'

    # ── Current bin ─────────────────────────────────────────
    # Frontend payload is ground truth — eliminates time-drift with simulated bins
    if current_bin_payload and current_bin_payload.get('sensor_id') and current_bin_payload.get('sensor_id') == selected_bin_id:
        current_bin    = current_bin_payload
        current_source = 'frontend_payload'
    elif selected_bin_id:
        current_bin = next(
            (b for b in fleet_bins if b.get('sensor_id') == selected_bin_id), None
        )
        if not current_bin:
            reading, _ = get_current_reading(selected_bin_id)
            current_bin = reading
        current_source = 'backend_query'
    else:
        current_bin    = None
        current_source = 'none'

    # ── Dataset analytics (historical counts) ──────────────
    bid_for_hist = selected_bin_id or (current_bin.get('sensor_id') if current_bin else None)
    selected_bin_analytics = None
    if bid_for_hist and bid_for_hist in BIN_METADATA:
        selected_bin_analytics = get_selected_bin_analytics(bid_for_hist)

    source_used = 'not_selected'

    print(f"[chat] page={page} | bin={selected_bin_id} | "
          f"fleet_source={fleet_source} | current_source={current_source} | "
          f"has_analytics_payload={bool(analytics_payload)}", flush=True)

    if _is_current_status_question(user_message) and current_bin:
        source_used = 'current_selected_bin'
        answer = rule_based_response(
            user_message, current_bin, fleet_bins,
            analytics_payload, selected_bin_id, selected_bin_analytics
        )
        print(f"[chat] source_used={source_used}", flush=True)
        return jsonify({'response': answer, 'source': 'rule_based', 'source_used': source_used})

    if page == 'analytics' and is_trend_question(user_message):
        source_used = 'analytics_summary_trend'
        answer = trend_response_from_analytics(
            analytics_payload, selected_bin_name=selected_bin_name, selected_bin_id=selected_bin_id
        )
        print(f"[chat] source_used={source_used}", flush=True)
        return jsonify({'response': answer, 'source': 'rule_based', 'source_used': source_used})

    if _is_fleet_question(user_message):
        source_used = 'fleet_summary'
        answer = rule_based_response(
            user_message, current_bin, fleet_bins,
            analytics_payload, selected_bin_id, selected_bin_analytics
        )
        print(f"[chat] source_used={source_used}", flush=True)
        return jsonify({'response': answer, 'source': 'rule_based', 'source_used': source_used})

    context = build_chat_context(
        current_bin, fleet_bins, analytics_payload, selected_bin_analytics
    )

    openai_key = os.environ.get('OPENAI_API_KEY')
    if openai_key:
        try:
            completion = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {openai_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': os.environ.get('OPENAI_CHAT_MODEL', 'gpt-4o-mini'),
                    'messages': [
                        {'role': 'system', 'content': CHAT_SYSTEM_PROMPT},
                        {'role': 'user', 'content': f"Context:\n{context}\n\nQuestion: {user_message}"}
                    ],
                    'max_tokens': 300,
                    'temperature': 0.2
                },
                timeout=15
            )
            completion.raise_for_status()
            answer = completion.json()['choices'][0]['message']['content'].strip()
            source_used = 'openai_context'
            print(f"[chat] source_used={source_used}", flush=True)
            return jsonify({'response': answer, 'source': 'openai', 'source_used': source_used})
        except Exception as exc:
            print(f"[chat] OpenAI error, falling back to rule-based: {exc}")

    answer = rule_based_response(
        user_message, current_bin, fleet_bins,
        analytics_payload, selected_bin_id, selected_bin_analytics
    )
    source_used = 'rule_based'
    print(f"[chat] source_used={source_used}", flush=True)
    return jsonify({'response': answer, 'source': 'rule_based', 'source_used': source_used})

# ════════════════════════════════════════════════════════════
# RUN
# ════════════════════════════════════════════════════════════
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    print("\n" + "=" * 60)
    print(f"🚀 Smart Bin Backend running on 0.0.0.0:{port}")
    print("=" * 60)
    print("Endpoints:")
    print("  GET  /                         — service info")
    print("  GET  /api/fleet/summary        — all bins overview")
    print("  GET  /api/bin/<id>/current     — latest operational decision")
    print("  GET  /api/bin/<id>/history     — decision time series")
    print("  GET  /api/bin/<id>/analytics   — selected-bin insights")
    print("  GET  /api/analytics/summary    — analytics bin selector")
    print("  GET  /api/analytics/summary?sensor_id=<id> — lightweight summary")
    print("  GET  /api/analytics/timeseries?sensor_id=<id>&hours=24 — bounded chart data")
    print("  GET  /api/analytics/bin/<id>   — cached selected-bin analytics")
    print("  POST /api/predict              — score a custom reading")
    print("  POST /api/dispatch-sms         — simulated SMS")
    print("  GET  /api/dispatch-log         — SMS history")
    print("  POST /api/chat                 — Smart Bin Assistant")
    print("=" * 60 + "\n")
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_ENV') == 'development')
