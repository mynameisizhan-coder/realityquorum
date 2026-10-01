import { lazy, Suspense, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Film,
  Info,
  List,
  MapPin,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Tag,
} from 'lucide-react'
import { getLocation, locations } from '../data/campus'
import type { Intake, LocationKind } from '../types'

const CampusScene = lazy(() => import('./CampusScene'))
type View = '3d' | 'aerial' | 'list'
const essentialLabels = new Set([
  'admin',
  'ramanujan',
  'smv',
  'cv-raman',
  'aic',
  'bus-stop',
  'canteen',
  'amphitheatre',
  'indoor-stadium',
  'new-ground',
  'garden',
])

export default function CampusExplorer({
  selected,
  onSelect,
  onIntake,
  expanded,
  onExpand,
}: {
  selected: string | null
  onSelect: (id: string | null) => void
  onIntake: (route: Intake) => void
  expanded: boolean
  onExpand: () => void
}) {
  const [view, setView] = useState<View>('3d')
  const [labels, setLabels] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LocationKind | 'All'>('All')
  const [playing, setPlaying] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [info, setInfo] = useState(false)
  const [command, setCommand] = useState<{ action: 'reset' | 'in' | 'out'; tick: number }>({
    action: 'reset',
    tick: 0,
  })
  const video = useRef<HTMLVideoElement>(null)
  const markers = useRef(new Map<string, HTMLDivElement>())
  const location = selected ? getLocation(selected) : null
  const matching = locations.filter(
    (l) =>
      (filter === 'All' || l.kind === filter) && l.name.toLowerCase().includes(query.toLowerCase()),
  )
  const commandScene = (action: 'reset' | 'in' | 'out') =>
    setCommand((c) => ({ action, tick: c.tick + 1 }))
  async function toggleVideo() {
    if (!video.current) return
    if (playing) video.current.pause()
    else {
      try {
        await video.current.play()
      } catch {
        setVideoError(true)
      }
    }
  }
  return (
    <section
      className={`campus-panel ${expanded ? 'campus-expanded' : ''}`}
      aria-label="Interactive campus explorer"
    >
      <div className="panel-heading">
        <div className="panel-title">
          <Box size={18} />
          <h2>Campus explorer</h2>
          <span className="small-tag">NMAMIT</span>
        </div>
        <div className="segmented" aria-label="Campus view">
          {(
            [
              { id: '3d', title: '3D campus', icon: Box },
              { id: 'aerial', title: 'Aerial view', icon: Film },
              { id: 'list', title: 'Location list', icon: List },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              aria-pressed={view === v.id}
              onClick={() => {
                setView(v.id)
                setPlaying(false)
              }}
              className={view === v.id ? 'active' : ''}
            >
              <v.icon size={14} />
              <span>{v.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={`campus-viewport view-${view}`}>
        {view === '3d' && (
          <>
            <Suspense
              fallback={
                <div className="scene-loading">
                  <Box size={30} />
                  <span>Bringing your campus into view…</span>
                </div>
              }
            >
              <CampusScene
                selected={selected}
                onSelect={onSelect}
                markers={markers}
                command={command}
              />
            </Suspense>
            <div className="marker-layer">
              {locations
                .filter((l) => labels || essentialLabels.has(l.id) || l.id === selected)
                .map((l) => (
                  <div
                    className="projected-marker"
                    key={l.id}
                    ref={(element) => {
                      if (element) markers.current.set(l.id, element)
                      else markers.current.delete(l.id)
                    }}
                  >
                    <button
                      className={`map-label ${selected === l.id ? 'selected' : ''}`}
                      aria-label={`Select ${l.name}`}
                      aria-pressed={selected === l.id}
                      onClick={() => onSelect(l.id)}
                    >
                      <span
                        className={`map-label-dot ${l.kind === 'Outdoors' ? 'outdoors' : ''}`}
                      />
                      {l.shortName}
                      {selected === l.id && <span className="map-label-check">✓</span>}
                    </button>
                  </div>
                ))}
            </div>
            <div className="map-topline">
              <span className="map-kicker">
                <i /> EXPLORE YOUR CAMPUS
              </span>
              <button
                className="map-info-button"
                onClick={() => setInfo(!info)}
                aria-expanded={info}
              >
                <Info size={13} /> Model notes
              </button>
            </div>
            {info && (
              <div className="model-note">
                <strong>Satellite-aligned campus model</strong>
                <p>
                  Major landmarks are labelled by default so the overview stays clear. Use the tag
                  button to reveal more places, or open Location list to search all 13 locations.
                  Relative positions follow the supplied satellite references; footprints remain
                  schematic.
                </p>
                <button className="text-button" onClick={() => setInfo(false)}>
                  Got it <Check size={14} />
                </button>
              </div>
            )}
            <div
              className="map-compass"
              aria-label="Model orientation indicator; not geographic north"
            >
              <span>↑</span>
              <small>ORBIT</small>
            </div>
            <div className="map-tools">
              <button aria-label="Zoom in" onClick={() => commandScene('in')}>
                <Plus size={18} />
              </button>
              <button aria-label="Zoom out" onClick={() => commandScene('out')}>
                <Minus size={18} />
              </button>
              <span />
              <button aria-label="Reset campus view" onClick={() => commandScene('reset')}>
                <RotateCcw size={16} />
              </button>
              <button
                aria-label={labels ? 'Show only major landmarks' : 'Show more building labels'}
                aria-pressed={labels}
                onClick={() => setLabels(!labels)}
              >
                <Tag size={16} />
              </button>
              <button
                aria-label={expanded ? 'Return to overview' : 'Expand campus explorer'}
                onClick={onExpand}
              >
                <Maximize2 size={16} />
              </button>
            </div>
            <div className="map-legend">
              <span>
                <i className="legend-building" />
                Main blocks
              </span>
              <span>
                <i className="legend-outdoors" />
                Main grounds
              </span>
              <span>
                <i className="legend-selected" />
                Selected
              </span>
            </div>
            <span className="map-hint">
              Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Click to select
            </span>
          </>
        )}
        {view === 'aerial' && (
          <div className="aerial-view">
            <video
              ref={video}
              src="/media/campus-flyover.mp4"
              poster="/media/campus-aerial.jpg"
              loop
              muted
              playsInline
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => setVideoError(true)}
            />
            <div className="aerial-gradient" />
            <span className="aerial-badge">
              <Film size={14} /> YOUR CAMPUS, FROM ABOVE
            </span>
            <div className="aerial-caption">
              <div>
                <span className="eyebrow">NMAM Institute of Technology</span>
                <h3>
                  A familiar place.
                  <br />A new perspective.
                </h3>
                <p>From your original campus footage.</p>
              </div>
              <button
                className="video-button"
                aria-label={playing ? 'Pause aerial video' : 'Play aerial video'}
                onClick={toggleVideo}
              >
                {playing ? <Pause size={23} /> : <Play size={23} />}
              </button>
            </div>
            {videoError && (
              <p className="video-error" role="status">
                The video could not play. The aerial photograph remains available.
              </p>
            )}
          </div>
        )}
        {view === 'list' && (
          <div className="location-list-view">
            <div className="location-search">
              <Search size={17} />
              <input
                aria-label="Search campus locations"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a building, garden or campus space…"
              />
            </div>
            <div className="filter-pills">
              {(['All', 'Academic', 'Campus life', 'Outdoors'] as const).map((kind) => (
                <button
                  key={kind}
                  className={filter === kind ? 'selected' : ''}
                  aria-pressed={filter === kind}
                  onClick={() => setFilter(kind)}
                >
                  {kind}
                </button>
              ))}
            </div>
            <div className="location-options">
              {matching.map((l) => (
                <button
                  key={l.id}
                  className={`location-option ${selected === l.id ? 'selected' : ''}`}
                  onClick={() => onSelect(l.id)}
                  aria-pressed={selected === l.id}
                >
                  <span className="location-icon">
                    <MapPin size={18} />
                  </span>
                  <span>
                    <strong>{l.name}</strong>
                    <small>
                      {l.kind}
                      {l.provisional ? ' · Provisional location' : ''}
                    </small>
                  </span>
                  {selected === l.id ? <Check size={18} /> : <ChevronRight size={17} />}
                </button>
              ))}
              {matching.length === 0 && (
                <p className="empty-small">No locations found. Try a shorter building name.</p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className={`location-selection ${location ? 'has-selection' : ''}`}>
        <span className="selection-pin">
          <MapPin size={19} />
        </span>
        <div>
          <strong>{location ? location.name : 'Every report starts somewhere.'}</strong>
          <span>
            {location
              ? `${location.kind}${location.provisional ? ' · Provisional position' : ' · Approximate position'}`
              : view === 'aerial'
                ? 'Switch to 3D or the location list to choose a place.'
                : 'Select a building to connect your report to a place.'}
          </span>
        </div>
        {location ? (
          <>
            <button className="text-button clear-selection" onClick={() => onSelect(null)}>
              Clear
            </button>
            <button className="button primary compact" onClick={() => onIntake('issue')}>
              Report here <ArrowUpRight size={16} />
            </button>
          </>
        ) : (
          <button className="text-button" onClick={() => setView('list')}>
            Browse locations <ArrowUpRight size={15} />
          </button>
        )}
      </div>
    </section>
  )
}
