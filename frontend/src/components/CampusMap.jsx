/**
 * Campus map — schematic SVG of SLIIT Malabe campus.
 * Pins are positioned at approximate building locations.
 * Pin color reflects operational priority from /api/fleet/summary.
 */

const PIN_POSITIONS = {
  // Coordinates in 0–100 range; matched to schematic buildings
  smartbin_01: { x: 52, y: 56, label: 'FOC Main' },              // Faculty of Computing
  smartbin_02: { x: 38, y: 38, label: 'NB Canteen' },            // New Building
  smartbin_03: { x: 70, y: 36, label: "Bird's Nest" },           // Bird's Nest
  smartbin_04: { x: 42, y: 70, label: 'Basement Cafe' },         // Basement
  smartbin_05: { x: 78, y: 60, label: 'BS Canteen' },            // Business School
  smartbin_06: { x: 78, y: 78, label: 'WA Canteen' },            // William Angliss
  smartbin_07: { x: 22, y: 80, label: 'Main Entrance' },         // Main entrance
  smartbin_08: { x: 22, y: 22, label: 'P&S Office' }             // P&S Office
}

const STATUS_COLOR = {
  Full: 'var(--state-full)',
  'Almost Full': 'var(--state-almost)',
  'Light Waste': 'var(--state-light)',
  Normal: 'var(--state-normal)',
  Empty: 'var(--state-empty)',
  Anomaly: 'var(--state-anomaly)'
}

const LABEL_OFFSET = {
  smartbin_05: { top: '-150%', transform: 'translateX(-50%)' },
  smartbin_06: { top: '-150%', transform: 'translateX(-50%)' },
  smartbin_07: { top: '-150%', transform: 'translateX(-50%)' }
}

export default function CampusMap({ bins, selectedId, onSelect }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      minHeight: 300,
      maxHeight: 390,
      background: '#FAF7F0',
      border: '1px solid var(--border)',
      borderRadius: 14,
      boxShadow: '0 10px 24px rgba(30, 58, 95, 0.08)',
      overflow: 'hidden'
    }}>
      {/* Schematic SVG of the campus */}
      <svg viewBox="0 0 100 75" preserveAspectRatio="none"
           style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <pattern id="campusGrid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#EFEBE2" strokeWidth="0.15" />
          </pattern>
        </defs>
        <rect width="100" height="75" fill="url(#campusGrid)" />

        {/* Greenery */}
        <rect x="48" y="42" width="8" height="6" fill="#E8E0CC" stroke="#D7CFB8" strokeWidth="0.2" rx="0.5" />
        <text x="52" y="46" fontSize="1.1" fontFamily="Geist Mono" fill="#A8A29E"
              textAnchor="middle" letterSpacing="0.08">QUAD</text>

        {/* Buildings — light blocks */}
        {/* FOC */}
        <rect x="46" y="51" width="14" height="11" fill="#FFFFFF" stroke="#D7CFB8" strokeWidth="0.3" />

        {/* NB */}
        <rect x="32" y="32" width="14" height="11" fill="#FFFFFF" stroke="#D7CFB8" strokeWidth="0.3" />

        {/* Bird's Nest */}
        <rect x="64" y="30" width="13" height="10" fill="#FFFFFF" stroke="#D7CFB8" strokeWidth="0.3" />

        {/* Basement / D Block */}
        <rect x="36" y="65" width="13" height="9" fill="#FFFFFF" stroke="#D7CFB8" strokeWidth="0.3" />

        {/* BS */}
        <rect x="72" y="55" width="13" height="11" fill="#FFFFFF" stroke="#D7CFB8" strokeWidth="0.3" />

        {/* WA */}
        <rect x="72" y="73" width="13" height="9" fill="#FFFFFF" stroke="#D7CFB8" strokeWidth="0.3" />

        {/* Entrance */}
        <rect x="14" y="74" width="16" height="8" fill="#FFFFFF" stroke="#D7CFB8" strokeWidth="0.3" />

        {/* P&S */}
        <rect x="16" y="17" width="14" height="10" fill="#FFFFFF" stroke="#D7CFB8" strokeWidth="0.3" />

        {/* Connecting paths */}
        <path d="M 22 30 L 22 70" stroke="#D7CFB8" strokeWidth="0.3" strokeDasharray="0.4 0.4" />
        <path d="M 30 50 L 70 50" stroke="#D7CFB8" strokeWidth="0.3" strokeDasharray="0.4 0.4" />
        <path d="M 50 25 L 50 70" stroke="#D7CFB8" strokeWidth="0.3" strokeDasharray="0.4 0.4" />
        <path d="M 70 35 L 70 78" stroke="#D7CFB8" strokeWidth="0.3" strokeDasharray="0.4 0.4" />

        <text x="2" y="3.5" fontSize="1.5" fontFamily="Geist Mono" letterSpacing="0.15"
              fill="#94908A">SLIIT MALABE — SCHEMATIC</text>
        <text x="98" y="73" fontSize="1.5" fontFamily="Geist Mono" letterSpacing="0.15"
              fill="#94908A" textAnchor="end">N ↑</text>
      </svg>

      {/* Bin pins on top */}
      {bins.map(bin => {
        const pos = PIN_POSITIONS[bin.sensor_id]
        if (!pos) return null
        const isSelected = bin.sensor_id === selectedId
        const color = STATUS_COLOR[bin.status] || '#94908A'
        const labelOffset = LABEL_OFFSET[bin.sensor_id] || { top: '120%', transform: 'translateX(-50%)' }

        return (
          <button
            key={bin.sensor_id}
            onClick={() => onSelect(bin.sensor_id)}
            style={{
              position: 'absolute',
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
              padding: 0,
              background: 'transparent',
              border: 0
            }}
            title={`${pos.label} — ${bin.action || bin.status}`}
          >
            <span style={{
              display: 'block',
              width: isSelected ? 16 : 12,
              height: isSelected ? 16 : 12,
              background: color,
              border: `2px solid ${isSelected ? 'var(--ink)' : 'white'}`,
              borderRadius: '50%',
              boxShadow: isSelected ? '0 0 0 3px var(--accent-2-soft)' : 'none',
              transition: 'all 200ms'
            }} />
            <span style={{
              position: 'absolute',
              top: labelOffset.top,
              left: '50%',
              transform: labelOffset.transform,
              fontFamily: 'var(--font-mono)',
              fontSize: 7.5,
              fontWeight: isSelected ? 600 : 500,
              letterSpacing: '0.05em',
              color: isSelected ? 'var(--ink)' : 'var(--ink-mute)',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
              padding: '1px 4px',
              borderRadius: 3,
              background: 'rgba(255,255,255,0.84)',
              boxShadow: isSelected ? '0 2px 8px rgba(30, 58, 95, 0.12)' : 'none'
            }}>
              {pos.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
