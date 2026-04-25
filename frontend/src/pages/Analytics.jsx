import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, fmt } from '../lib/api.js'
import { useChatContext } from '../lib/ChatContext.jsx'
import FillTrendChart from '../components/FillTrendChart.jsx'
import HourlyHeatmap from '../components/HourlyHeatmap.jsx'
import StateDonut from '../components/StateDonut.jsx'

const CACHE_MS = 60000

export default function Analytics() {
  const { binId } = useParams()
  const navigate = useNavigate()
  const { updateChatContext } = useChatContext()
  const cache = useRef({ summary: {}, timeseries: {} })
  const [bins, setBins] = useState([])
  const [selectedId, setSelectedId] = useState(binId)
  const [summary, setSummary] = useState(null)
  const [timeseries, setTimeseries] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [timeseriesLoading, setTimeseriesLoading] = useState(true)
  const [summaryError, setSummaryError] = useState(null)
  const [timeseriesError, setTimeseriesError] = useState(null)

  useEffect(() => {
    let alive = true
    api.analyticsBins()
      .then(data => {
        if (!alive) return
        const nextBins = data.bins || []
        setBins(nextBins)
        if (!selectedId && nextBins.length) setSelectedId(nextBins[0].sensor_id)
      })
      .catch(error => {
        console.error('Analytics bin selector failed', error)
        if (alive) setBins([])
      })
    return () => { alive = false }
  }, [])

  // Sync page + selected bin to chat context immediately when selection changes
  useEffect(() => {
    if (!selectedId) return
    const name = bins.find(b => b.sensor_id === selectedId)?.location || selectedId
    updateChatContext({
      page: 'analytics',
      selected_bin: selectedId,
      selected_bin_name: name,
      current_selected_bin: null,
      analytics_summary: null,
    })
  }, [selectedId, bins, updateChatContext])

  useEffect(() => {
    if (!selectedId) return
    const token = { cancelled: false }

    loadSummary(selectedId, token)
    loadTimeseries(selectedId, token)

    const id = setInterval(() => {
      loadSummary(selectedId, token)
      loadTimeseries(selectedId, token)
    }, 60000)
    return () => { token.cancelled = true; clearInterval(id) }
  }, [selectedId])

  async function loadSummary(id, options = {}) {
    const cached = cache.current.summary[id]
    if (!options.force && cached && Date.now() - cached.loadedAt < CACHE_MS) {
      setSummary(cached.data)
      setSummaryLoading(false)
      setSummaryError(null)
      return
    }

    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const data = await api.analyticsSummary(id)
      if (options.cancelled) return
      cache.current.summary[id] = { data, loadedAt: Date.now() }
      setSummary(data)
      updateChatContext({
        analytics_summary: data,
        selected_bin_name: data.location || id,
      })
    } catch (error) {
      console.error('Analytics summary failed', error)
      if (cached) {
        setSummary(cached.data)
        setSummaryError('Showing cached analytics summary. Refresh to try again.')
      } else {
        setSummary(null)
        setSummaryError(error.message || 'No analytics data available for this bin yet')
      }
    } finally {
      setSummaryLoading(false)
    }
  }

  async function loadTimeseries(id, options = {}) {
    const cached = cache.current.timeseries[id]
    if (!options.force && cached && Date.now() - cached.loadedAt < CACHE_MS) {
      setTimeseries(cached.data)
      setTimeseriesLoading(false)
      setTimeseriesError(null)
      return
    }

    setTimeseriesLoading(true)
    setTimeseriesError(null)
    try {
      const data = await api.analyticsTimeseries(id, 24)
      if (options.cancelled) return
      cache.current.timeseries[id] = { data, loadedAt: Date.now() }
      setTimeseries(data)
    } catch (error) {
      console.error('Analytics timeseries failed', error)
      if (cached) {
        setTimeseries(cached.data)
        setTimeseriesError('Showing cached 24-hour chart. Refresh to try again.')
      } else {
        setTimeseries(null)
        setTimeseriesError(error.message || 'No analytics data available for this bin yet')
      }
    } finally {
      setTimeseriesLoading(false)
    }
  }

  function retry() {
    if (!selectedId) return
    loadSummary(selectedId, { force: true })
    loadTimeseries(selectedId, { force: true })
  }

  function handleSelect(nextId) {
    setSelectedId(nextId)
    setSummary(null)
    setTimeseries(null)
    updateChatContext({ analytics_summary: null })
    navigate(`/bin/${nextId}`, { replace: true })
  }

  const selectedBin = bins.find(bin => bin.sensor_id === selectedId)
  const readings = timeseries?.readings || []
  const hasSummary = summary && summary.total_readings !== 0

  return (
    <div>
      <section style={{
        padding: '36px 32px 26px',
        borderBottom: '1px solid rgba(20, 184, 166, 0.24)',
        background: 'linear-gradient(180deg, rgba(204, 251, 241, 0.34), var(--bg) 76%)'
      }}>
        <Link to="/" style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--ink-mute)'
        }}>
          ← Operations
        </Link>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <div className="kicker">Usage Analytics</div>
            <h1 className="font-serif" style={{
              fontSize: 'clamp(38px, 5vw, 58px)',
              fontWeight: 800,
              letterSpacing: '-0.035em',
              marginTop: 8,
              lineHeight: 1.02,
              color: 'var(--navy)'
            }}>
              {selectedBin?.location || summary?.location || 'Select a bin'}
            </h1>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-soft)' }}>
              {selectedBin?.is_simulated ? 'Simulated 7-day record' : 'Live bin history'} · selected bin only
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedId || ''}
              onChange={(e) => handleSelect(e.target.value)}
              style={{
                height: 42,
                minWidth: 240,
                padding: '0 12px',
                border: '1px solid var(--border)',
                background: 'var(--bg-panel)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                borderRadius: 10
              }}
            >
              {bins.length === 0 && <option value={selectedId || ''}>Current bin</option>}
              {bins.map(bin => (
                <option key={bin.sensor_id} value={bin.sensor_id}>
                  {bin.location}{bin.is_simulated ? ' (simulated)' : ''}
                </option>
              ))}
            </select>
            <button className="btn-ghost btn" onClick={retry}>
              Retry
            </button>
          </div>
        </div>
      </section>

      <section style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
        {summaryLoading ? (
          <MetricSkeleton />
        ) : hasSummary ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
            <Stat label="Average fill" value={fmt.fill(summary.avg_fill)} />
            <Stat label="Average weight" value={fmt.weight(summary.avg_weight)} />
            <Stat label="Peak hour" value={summary.peak_usage_hour == null ? '—' : `${summary.peak_usage_hour}:00`} />
            <Stat label="Readings used" value={summary.total_readings} />
          </div>
        ) : (
          <EmptyState message="No analytics data available for this bin yet" onRetry={retry} />
        )}
        {summaryError && <InlineError message={summaryError} onRetry={retry} />}
      </section>

      <section style={{ padding: '36px 32px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '36px 32px'
        }}>
          <div style={{ gridColumn: 'span 2' }}>
            <ChartHeader
              title="What happened in the last 24 hours?"
              kicker="Recent readings"
              note="Drops usually indicate collection or compression."
            />
            {timeseriesLoading ? (
              <ChartSkeleton height={280} />
            ) : readings.length ? (
              <FillTrendChart readings={readings} />
            ) : (
              <EmptyState message="No analytics data available for this bin yet" onRetry={retry} />
            )}
            {timeseriesError && <InlineError message={timeseriesError} onRetry={retry} />}
          </div>

          <div>
            <ChartHeader
              title="When is this bin most used?"
              kicker="Usage pattern"
              note={summary?.peak_usage_hour == null ? 'Waiting for enough readings.' : `Most active around ${summary.peak_usage_hour}:00.`}
            />
            {summaryLoading ? (
              <ChartSkeleton height={245} />
            ) : hasSummary ? (
              <HourlyHeatmap hourlyAvgFill={summary.hourly_avg_fill || {}} peakHour={summary.peak_usage_hour} />
            ) : (
              <EmptyState message="No analytics data available for this bin yet" onRetry={retry} />
            )}
          </div>

          <div>
            <ChartHeader
              title="Status distribution"
              kicker="Status mix"
              note="Light Waste means high fill but low weight; Full or Almost Full drives collection planning."
            />
            {summaryLoading ? (
              <ChartSkeleton height={245} />
            ) : hasSummary ? (
              <StateDonut distribution={summary.state_distribution || {}} />
            ) : (
              <EmptyState message="No analytics data available for this bin yet" onRetry={retry} />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function ChartHeader({ title, kicker, note }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="kicker">{kicker}</div>
      <h3 className="font-serif" style={{
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        marginTop: 6,
        lineHeight: 1.2,
        color: 'var(--navy)'
      }}>
        {title}
      </h3>
      {note && (
        <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
          {note}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 20,
      boxShadow: '0 10px 24px rgba(30, 58, 95, 0.08)'
    }}>
      <div className="kicker">{label}</div>
      <div className="font-serif" style={{
        fontSize: 34,
        fontWeight: 800,
        fontFeatureSettings: '"tnum"',
        lineHeight: 1,
        marginTop: 8,
        color: 'var(--navy)'
      }}>
        {value}
      </div>
    </div>
  )
}

function MetricSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i}>
          <span className="skeleton" style={{ width: 96, height: 12 }} />
          <div style={{ marginTop: 8 }}>
            <span className="skeleton" style={{ width: 72, height: 30 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton({ height }) {
  return (
    <div style={{
      height,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      padding: 18
    }}>
      <span className="skeleton" style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

function EmptyState({ message, onRetry }) {
  return (
    <div style={{
      minHeight: 180,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      color: 'var(--ink-mute)',
      fontSize: 13
    }}>
      {message}
      <button className="btn-ghost btn" onClick={onRetry}>Retry</button>
    </div>
  )
}

function InlineError({ message, onRetry }) {
  return (
    <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', color: 'var(--red)', fontSize: 12 }}>
      <span>{message}</span>
      <button className="btn-ghost btn" onClick={onRetry} style={{ padding: '7px 10px' }}>Retry</button>
    </div>
  )
}
