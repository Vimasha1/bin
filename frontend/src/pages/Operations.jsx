import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, composeSms } from '../lib/api.js'
import { useChatContext } from '../lib/ChatContext.jsx'
import CampusMap from '../components/CampusMap.jsx'
import BinList from '../components/BinList.jsx'
import DetailPanel from '../components/DetailPanel.jsx'
import DispatchModal from '../components/DispatchModal.jsx'
import DispatchLog from '../components/DispatchLog.jsx'
import Toast from '../components/Toast.jsx'

export default function Operations() {
  const [fleet, setFleet] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [smsTarget, setSmsTarget] = useState(null)   // bin object when modal open
  const [toast, setToast] = useState(null)
  const [dispatchLog, setDispatchLog] = useState([])
  const [liveStatus, setLiveStatus] = useState(null)
  const lastLiveTimestampRef = useRef(null)
  const navigate = useNavigate()
  const { updateChatContext } = useChatContext()

  // Polling: live bin and deterministic simulation snapshot every 30 seconds.
  useEffect(() => {
    let alive = true
    const fetchAll = async () => {
      try {
        if (lastLiveTimestampRef.current) {
          setLiveStatus('Reading latest sensor data...')
        }
        const [fleetData, logData] = await Promise.all([
          api.fleetSummary(),
          api.dispatchLog()
        ])
        if (!alive) return
        const liveBin = fleetData.bins?.find(bin => !bin.is_simulated)
        if (liveBin?.last_updated) {
          if (lastLiveTimestampRef.current && liveBin.last_updated === lastLiveTimestampRef.current) {
            setLiveStatus('Waiting for new sensor reading...')
          } else {
            setLiveStatus(null)
          }
          lastLiveTimestampRef.current = liveBin.last_updated
        }
        setFleet(fleetData)
        setDispatchLog(logData.entries || [])
        setError(null)
        setSelectedId(prev => prev || fleetData.bins?.[0]?.sensor_id || null)
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    fetchAll()
    const id = setInterval(fetchAll, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // Push fleet data to chat context whenever it updates
  useEffect(() => {
    if (!fleet) return
    updateChatContext({
      page: 'operations',
      fleet_summary: {
        total_bins: fleet.total_bins,
        summary: fleet.summary,
        requires_action: fleet.requires_action,
        bins: fleet.bins,
      },
    })
  }, [fleet, updateChatContext])

  const selected = useMemo(() => {
    if (!fleet?.bins || !selectedId) return null
    return fleet.bins.find(b => b.sensor_id === selectedId) || fleet.bins[0]
  }, [fleet, selectedId])

  // Push selected bin's live reading to chat context
  useEffect(() => {
    if (!selected) return
    updateChatContext({
      page: 'operations',
      selected_bin: selected.sensor_id,
      selected_bin_name: selected.location,
      current_selected_bin: selected,
      analytics_summary: null,
    })
  }, [selected, updateChatContext])

  const handleSendSms = async (bin, customMessage) => {
    try {
      await api.dispatchSms(bin.sensor_id, customMessage)
      setSmsTarget(null)
      setToast({
        kind: 'sent',
        title: 'SMS dispatched',
        body: `Dispatch message queued for ${bin.location}`
      })
      const log = await api.dispatchLog()
      setDispatchLog(log.entries || [])
      setTimeout(() => setToast(null), 3500)
    } catch (e) {
      setToast({ kind: 'error', title: 'Dispatch failed', body: e.message })
      setTimeout(() => setToast(null), 4000)
    }
  }

  if (error && !fleet) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center' }}>
        <div className="kicker" style={{ marginBottom: 12 }}>Connection error</div>
        <h2 className="font-serif" style={{ fontSize: 28, fontWeight: 400 }}>
          Cannot reach the analytics backend
        </h2>
        <p style={{ marginTop: 12, color: 'var(--ink-mute)' }}>
          {error}
        </p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* HERO STRIP */}
      <section style={{
        padding: '22px 32px',
        borderTop: '1px solid rgba(20, 184, 166, 0.18)',
        borderBottom: '1px solid rgba(20, 184, 166, 0.24)',
        background: 'linear-gradient(180deg, rgba(204, 251, 241, 0.42), var(--bg) 72%)'
      }}>
        <div className="kicker">Operations Overview · {fleet?.total_bins ?? '—'} Bins Monitored</div>
        {fleet && (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 12 }}>
            <FleetStat label="Total bins" caption="Across campus" value={fleet.total_bins || 0} tone="navy" />
            <FleetStat label="Collect now" caption="Full or urgent" value={countCollectNow(fleet.bins)} tone="red" />
            <FleetStat label="Compress / Delay" caption="Light waste" value={countLightWaste(fleet.bins)} tone="teal" />
            <FleetStat label="Normal / No action" caption="Monitor or empty" value={countNormalOrEmpty(fleet.bins)} tone="green" />
          </div>
        )}
      </section>

      {/* MAIN GRID */}
      <section style={{
        height: 'clamp(560px, calc(100vh - 190px), 680px)',
        display: 'flex',
        alignItems: 'stretch',
        gap: 16,
        padding: 16,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)'
      }}>
        {/* Left: Campus Map */}
        <div style={{
          flex: '1 1 45%',
          minWidth: 300,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 12,
          overflow: 'visible',
          boxShadow: '0 10px 24px rgba(30, 58, 95, 0.07)'
        }}>
          <div className="kicker" style={{ marginBottom: 10 }}>
            SLIIT Malabe Campus · Operations Map
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 300, maxHeight: 390 }}>
            <CampusMap
              bins={fleet?.bins || []}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <p style={{ marginTop: 10, fontSize: 10.5, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
            Pin colour reflects operational state. LIVE DEVICE uses the backend reading; SIM bins replay loaded dataset rows.
          </p>
        </div>

        {/* Right: Bin list + Detail panel stacked */}
        <div style={{
          flex: '1.15 1 55%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 10px 24px rgba(30, 58, 95, 0.07)'
        }}>
          <BinList
            bins={fleet?.bins || []}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <DetailPanel
            bin={selected}
            liveStatus={selected && !selected.is_simulated ? liveStatus : null}
            onDispatch={() => setSmsTarget(selected)}
            onAnalytics={() => selected && navigate(`/bin/${selected.sensor_id}`)}
          />
        </div>
      </section>

      {/* Dispatch log */}
      <section style={{ padding: '24px 32px' }}>
        <DispatchLog entries={dispatchLog} />
      </section>

      {smsTarget && (
        <DispatchModal
          bin={smsTarget}
          initialMessage={composeSms(smsTarget)}
          onCancel={() => setSmsTarget(null)}
          onSend={(msg) => handleSendSms(smsTarget, msg)}
        />
      )}

      {toast && <Toast {...toast} />}
    </div>
  )
}

function FleetStat({ label, caption, value, tone }) {
  const color = {
    navy: 'var(--navy)',
    red: 'var(--state-full)',
    amber: 'var(--state-almost)',
    teal: 'var(--accent-2)',
    green: 'var(--state-normal)',
    blue: 'var(--state-normal)',
    gray: 'var(--state-empty)'
  }[tone] || 'var(--ink)'

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderTop: `4px solid ${color}`,
      background: 'var(--bg-panel)',
      borderRadius: 14,
      padding: 14,
      boxShadow: '0 12px 30px rgba(30, 58, 95, 0.10)'
    }}>
      <div className="kicker">{label}</div>
      <div className="font-serif"
           style={{ fontSize: 31, fontWeight: 800, marginTop: 6, fontFeatureSettings: '"tnum"', lineHeight: 1, color }}>
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-soft)', fontWeight: 500 }}>{caption}</div>
    </div>
  )
}

function countCollectNow(bins = []) {
  return bins.filter(bin => bin.status === 'Full' || bin.status === 'Anomaly' || bin.action === 'Collect immediately').length
}

function countLightWaste(bins = []) {
  return bins.filter(bin => bin.status === 'Light Waste').length
}

function countNormalOrEmpty(bins = []) {
  return bins.filter(bin => ['Normal', 'Empty'].includes(bin.status)).length
}
