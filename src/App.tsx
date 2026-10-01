import { useEffect, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FolderOpen,
  Globe2,
  Hexagon,
  Home,
  Leaf,
  LockKeyhole,
  MapPin,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import CampusExplorer from './components/CampusExplorer'
import IntakeDialog from './components/IntakeDialog'
import CaseDialog from './components/CaseDialog'
import MissionsBoard from './components/MissionsBoard'
import PublicUpdatesFeed from './components/PublicUpdatesFeed'
import { Dialog } from './components/Dialog'
import { locations, getLocation } from './data/campus'
import { exampleCases as preparedExamples } from './data/examples'
import { loadCase, loadCases, loadDemoCases, saveCase } from './api/caseStore'
import { useMissions, useSession } from './api/hooks'
import { ApiRequestError } from './api/client'
import type { CaseRecord, Intake, Page } from './types'

const navigation = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'campus', label: 'Campus explorer', icon: Box },
  { id: 'cases', label: 'My cases', icon: FolderOpen },
  { id: 'missions', label: 'Evidence missions', icon: ClipboardCheck },
  { id: 'updates', label: 'Public updates', icon: Globe2 },
] as const

export default function App() {
  const [page, setPage] = useState<Page>('overview')
  const [selected, setSelected] = useState<string | null>(null)
  const [intake, setIntake] = useState<Intake | null>(null)
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [exampleCases, setExampleCases] = useState(preparedExamples)
  const { user, users, switchTo } = useSession()
  const [openedId, setOpenedId] = useState<string | null>(null)
  const [utility, setUtility] = useState<'search' | 'help' | 'settings' | 'notifications' | null>(
    null,
  )
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [storageError, setStorageError] = useState('')
  const [menu, setMenu] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [showExamples, setShowExamples] = useState(false)
  const [caseQuery, setCaseQuery] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  // Tasks the signed-in account can accept or still has to finish, shown as a count in the navigation.
  const { data: missionList } = useMissions(user?.id, `${dataVersion}-${page}`)
  const actionableMissions = missionList.filter(
    (m) => (m.status === 'Open' && m.eligibility.ok) || (m.assignedToMe && m.status === 'Accepted'),
  ).length
  useEffect(() => {
    let active = true
    Promise.all([loadCases(), loadDemoCases()])
      .then(([records, examples]) => {
        if (active) {
          setCases(records)
          setExampleCases(
            [...(examples.length ? examples : preparedExamples)].sort((a, b) =>
              a.route === b.route ? 0 : a.route === 'message' ? -1 : 1,
            ),
          )
          setStorageError('')
        }
      })
      .catch((e) => {
        if (active) setStorageError(e.message)
      })
    return () => {
      active = false
    }
  }, [user?.id])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 6000)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setUtility('search')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const currentCase = [...cases, ...exampleCases].find((record) => record.id === openedId)
  // Always show the server's current version of an opened case. The demo server can restart and
  // clear its data, so a case still listed here may no longer exist.
  const openedOnServer = !!currentCase?.view
  useEffect(() => {
    if (!openedId || !openedOnServer) return
    let active = true
    loadCase(openedId)
      .then((fresh) => {
        if (!active) return
        const replace = (list: CaseRecord[]) =>
          list.map((value) => (value.id === fresh.id ? fresh : value))
        setCases(replace)
        setExampleCases(replace)
      })
      .catch((e) => {
        if (!active || !(e instanceof ApiRequestError) || e.status !== 404) return
        setCases((list) => list.filter((value) => value.id !== openedId))
        setOpenedId(null)
        setToast(
          'This case is no longer on the server. The demo server clears its data when it restarts.',
        )
      })
    return () => {
      active = false
    }
  }, [openedId, openedOnServer])
  const location = selected ? getLocation(selected) : null
  const go = (next: Page) => {
    setPage(next)
    setMenu(false)
  }
  function startIntake(route: Intake) {
    if (user && user.role !== 'student') {
      setUtility('settings')
      setToast('Choose a student demo account to submit a new report.')
      return
    }
    setIntake(route)
  }
  async function createCase(record: CaseRecord) {
    const saved = await saveCase(record)
    setCases((current) => [saved, ...current])
    setIntake(null)
    setOpenedId(saved.id)
    setToast(
      `Demo case ${saved.id} saved for ${saved.view?.department ?? 'review'}. No real campus notification was sent.`,
    )
  }
  async function updateCase(record: CaseRecord) {
    const saved = await saveCase(record)
    setCases((current) => current.map((value) => (value.id === saved.id ? saved : value)))
    setExampleCases((current) => current.map((value) => (value.id === saved.id ? saved : value)))
    setToast('Your case has been updated.')
  }
  async function refreshCase(id: string, notice: string) {
    const fresh = await loadCase(id)
    const replace = (list: CaseRecord[]) => list.map((value) => (value.id === id ? fresh : value))
    setCases(replace)
    setExampleCases(replace)
    setDataVersion((v) => v + 1)
    setToast(notice)
  }
  async function changeAccount(id: string) {
    setSwitching(true)
    setAccountError('')
    setCases([])
    setOpenedId(null)
    setIntake(null)
    try {
      await switchTo(id)
      setToast('Demo account switched. Case access is checked by the local server.')
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : 'Could not switch demo accounts.')
    } finally {
      setSwitching(false)
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menu && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'is-open' : ''}`} inert={mobile && !menu}>
        <button className="brand" onClick={() => go('overview')} aria-label="RealityQuorum home">
          <span className="brand-symbol">
            <Hexagon size={30} strokeWidth={1.7} />
            <Check size={15} />
          </span>
          <span>
            Reality<span className="brand-second">Quorum</span>
            <small>CLARITY. TOGETHER.</small>
          </span>
        </button>
        <div className="workspace-switch">
          <span className="campus-monogram">N</span>
          <div>
            <strong>NMAMIT Campus</strong>
            <span>Student workspace</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-caption">YOUR WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-link ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => go(item.id)}
              key={item.id}
            >
              <item.icon size={18} strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.id === 'cases' && cases.length > 0 && <b>{cases.length}</b>}
              {item.id === 'missions' && actionableMissions > 0 && (
                <b aria-label={`${actionableMissions} tasks for you`}>{actionableMissions}</b>
              )}
              {page === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-orbit">
            <ShieldCheck size={22} />
          </span>
          <h3>
            Trust starts
            <br />
            with a question.
          </h3>
          <p>
            A message to check.
            <br />
            Something to make better.
            <br />
            You can start here.
          </p>
          <button onClick={() => setUtility('help')}>
            How it works <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-campus" onClick={() => go('campus')}>
            <img
              src="/media/campus-aerial.jpg"
              alt="NMAMIT courtyard from the supplied aerial video"
            />
            <span>
              <strong>Rooted in our campus.</strong>
              <small>
                Nitte, Karnataka <ArrowUpRight size={12} />
              </small>
            </span>
          </button>
          <button
            className="profile"
            onClick={() => {
              setUtility('settings')
            }}
          >
            <span className="avatar">{user?.name.charAt(0) || 'S'}</span>
            <span>
              <strong>{user ? user.role.replaceAll('_', ' ') : 'Student preview'}</strong>
              <small>Demo account · switch role</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="topbar-campus">
              <MapPin size={15} /> NMAM Institute of Technology
            </span>
            <span className="topbar-divider" />
            <span className="topbar-section">{navigation.find((n) => n.id === page)?.label}</span>
          </div>
          <div className="topbar-right">
            <button
              className="search-trigger"
              onClick={() => setUtility('search')}
              aria-label="Search campus"
            >
              <Search size={17} />
              <span>Find a place</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="preview-tag">
              <i />
              UI preview
            </span>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setUtility('notifications')}
            >
              <Bell size={18} />
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {storageError && (
            <div className="error-banner" role="alert">
              {storageError}
              <button aria-label="Dismiss storage message" onClick={() => setStorageError('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {(page === 'overview' || page === 'campus') && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow-line" /> YOUR CAMPUS. OUR SHARED RESPONSIBILITY.
                  </span>
                  <h1>
                    {page === 'campus' ? (
                      'A place for every perspective.'
                    ) : (
                      <>
                        A clearer picture.<span className="heading-light"> A better campus.</span>
                      </>
                    )}
                  </h1>
                  <p>
                    {page === 'campus'
                      ? 'Explore familiar places, choose a location, and start with what you know.'
                      : 'Check what’s circulating. Share what you notice. Follow what changes.'}
                  </p>
                </div>
                <span className="privacy-label">
                  <LockKeyhole size={15} />
                  Private by default<small>Designed around your privacy</small>
                </span>
              </div>
              {page === 'overview' && (
                <div className="intake-cards">
                  <button
                    className="intake-card verify-card"
                    onClick={() => startIntake('message')}
                  >
                    <span className="intake-icon">
                      <MessageSquare size={23} strokeWidth={1.5} />
                      <span className="tiny-check">
                        <Check size={8} />
                      </span>
                    </span>
                    <div>
                      <span className="intake-eyebrow">SAW SOMETHING CIRCULATING?</span>
                      <h2>Verify a message</h2>
                      <p>Get clarity on a message, screenshot or campus notice.</p>
                    </div>
                    <span className="card-arrow">
                      <ArrowUpRight size={21} />
                    </span>
                    <span className="card-decoration" />
                  </button>
                  <button className="intake-card report-card" onClick={() => startIntake('issue')}>
                    <span className="intake-icon">
                      <MapPin size={23} strokeWidth={1.5} />
                    </span>
                    <div>
                      <span className="intake-eyebrow">NOTICED SOMETHING ON CAMPUS?</span>
                      <h2>Report an issue</h2>
                      <p>Share an observation. Help the right people take action.</p>
                    </div>
                    <span className="card-arrow">
                      <ArrowUpRight size={21} />
                    </span>
                  </button>
                </div>
              )}
              <div className={`explore-layout ${page === 'campus' ? 'is-expanded' : ''}`}>
                <CampusExplorer
                  selected={selected}
                  onSelect={setSelected}
                  onIntake={startIntake}
                  expanded={page === 'campus'}
                  onExpand={() => go(page === 'campus' ? 'overview' : 'campus')}
                />
                <aside className="context-column">
                  {location ? (
                    <section className="selected-location-card">
                      <div className="location-photo">
                        <img src={location.photo} alt={`Campus reference for ${location.name}`} />
                        <span>
                          {location.photoLabel ??
                            (location.provisional
                              ? 'GENERAL CAMPUS REFERENCE'
                              : 'SELECTED LOCATION')}
                        </span>
                      </div>
                      <div className="location-detail">
                        <span className="eyebrow">{location.kind}</span>
                        <h2>{location.name}</h2>
                        <p>{location.description}</p>
                        <div className="location-model-note">
                          <InfoDot />
                          {location.provisional
                            ? 'Provisional name or placement'
                            : 'Approximate model placement'}
                        </div>
                        <button className="button primary" onClick={() => startIntake('issue')}>
                          Report an issue here <ArrowUpRight size={16} />
                        </button>
                        <button className="text-button" onClick={() => startIntake('message')}>
                          Verify a message about this place <ArrowRight size={14} />
                        </button>
                      </div>
                    </section>
                  ) : (
                    <section className="activity-panel">
                      <div className="activity-heading">
                        <h2>From question to clarity</h2>
                        <span className="demo-pill">Demo</span>
                      </div>
                      <p className="activity-intro">Two ways a campus story can begin.</p>
                      {exampleCases.map((record) => (
                        <button
                          key={record.id}
                          className="activity-card"
                          onClick={() => setOpenedId(record.id)}
                        >
                          <div className="activity-type">
                            <span
                              className={`activity-icon ${record.route === 'issue' ? 'amber' : ''}`}
                            >
                              {record.route === 'issue' ? (
                                <Camera size={17} />
                              ) : (
                                <MessageSquare size={17} />
                              )}
                            </span>
                            <span>
                              {record.route === 'issue' ? 'DIRECT REPORT' : 'MESSAGE VERIFICATION'}
                            </span>
                            <ArrowUpRight size={15} />
                          </div>
                          <h3>
                            {record.route === 'issue'
                              ? 'A concern with one food serving.'
                              : 'An exit notice. Two different questions.'}
                          </h3>
                          <p>
                            {record.route === 'issue'
                              ? 'What is visible in a serving, and what still needs an inspection?'
                              : 'Is the notice official? Is the exit actually blocked?'}
                          </p>
                          <div className="activity-footer">
                            <span
                              className={`status-badge status-${record.status.toLowerCase().replaceAll(' ', '-')}`}
                            >
                              <i />
                              {record.status}
                            </span>
                            <ChevronRight size={16} />
                          </div>
                        </button>
                      ))}
                      <span className="example-disclaimer">
                        Prepared examples, not live campus incidents.
                      </span>
                    </section>
                  )}
                  <div className="principle-card">
                    <span className="principle-art">
                      <Leaf size={24} strokeWidth={1.4} />
                      <span>+</span>
                    </span>
                    <p>
                      One observation.
                      <br />
                      <strong>A better place for all of us.</strong>
                    </p>
                    <span>Evidence first. People always.</span>
                  </div>
                </aside>
              </div>
              <div className="journey-strip">
                <div>
                  <span className="journey-lead">
                    <ShieldCheck size={19} />
                  </span>
                  <strong>A clear path forward</strong>
                </div>
                <span>Share privately</span>
                <ArrowRight size={13} />
                <span>Gather evidence</span>
                <ArrowRight size={13} />
                <span>Route to the right team</span>
                <ArrowRight size={13} />
                <span>Verify the resolution</span>
                <button
                  className="icon-button"
                  aria-label="Learn how RealityQuorum works"
                  onClick={() => setUtility('help')}
                >
                  <CircleHelp size={17} />
                </button>
              </div>
            </>
          )}
          {page === 'cases' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR REPORTS, WITH CONTEXT</span>
                  <h1>Follow the story.</h1>
                  <p>Keep track of the evidence, the response and what still needs to happen.</p>
                </div>
                <button className="button primary" onClick={() => startIntake('issue')}>
                  <Plus size={17} /> New report
                </button>
              </div>
              <div className="cases-toolbar">
                <div className="segmented">
                  <button
                    className={!showExamples ? 'active' : ''}
                    onClick={() => setShowExamples(false)}
                  >
                    {user && user.role !== 'student' ? 'Cases for your role' : 'My reports'}{' '}
                    <span>{cases.length}</span>
                  </button>
                  <button
                    className={showExamples ? 'active' : ''}
                    onClick={() => setShowExamples(true)}
                  >
                    Demo scenarios <span>{exampleCases.length}</span>
                  </button>
                </div>
                <div className="location-search">
                  <Search size={16} />
                  <input
                    value={caseQuery}
                    onChange={(e) => setCaseQuery(e.target.value)}
                    aria-label="Search cases"
                    placeholder="Search your cases…"
                  />
                </div>
              </div>
              <div className="cases-list">
                {(showExamples ? exampleCases : cases)
                  .filter((c) =>
                    `${c.title} ${c.id}`.toLowerCase().includes(caseQuery.toLowerCase()),
                  )
                  .map((record) => (
                    <button
                      className="case-list-row"
                      key={record.id}
                      onClick={() => setOpenedId(record.id)}
                    >
                      <span className="case-row-icon">
                        {record.route === 'message' ? (
                          <MessageSquare size={21} />
                        ) : (
                          <MapPin size={21} />
                        )}
                      </span>
                      <div>
                        <small>
                          {record.id} ·{' '}
                          {record.demo ? 'Prepared example' : 'Private development case'}
                        </small>
                        <h3>{record.title}</h3>
                        <span>
                          {getLocation(record.locationId)?.name || 'Campus-wide / unknown'}
                        </span>
                      </div>
                      <span
                        className={`status-badge status-${record.status.toLowerCase().replaceAll(' ', '-')}`}
                      >
                        <i />
                        {record.status}
                      </span>
                      <ArrowUpRight size={19} />
                    </button>
                  ))}
              </div>
              {!(showExamples ? exampleCases : cases).filter((c) =>
                `${c.title} ${c.id}`.toLowerCase().includes(caseQuery.toLowerCase()),
              ).length && (
                <div className="empty-state">
                  <span>
                    <FolderOpen size={36} strokeWidth={1.4} />
                  </span>
                  <h2>
                    {caseQuery ? 'No matching cases.' : 'Your first observation starts here.'}
                  </h2>
                  <p>
                    {caseQuery
                      ? 'Try another search term.'
                      : 'Check a circulating message or report something you noticed. You can return here to follow the case.'}
                  </p>
                  {!caseQuery && (
                    <div>
                      <button className="button primary" onClick={() => startIntake('issue')}>
                        Report an issue <ArrowUpRight size={16} />
                      </button>
                      <button className="button secondary" onClick={() => startIntake('message')}>
                        Verify a message
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="local-data-note">
                <LockKeyhole size={17} />
                Reports are saved on the local development server with account-based access. This
                demonstration does not send notifications to actual campus staff.
              </div>
            </>
          )}
          {page === 'missions' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SMALL TASKS. BETTER EVIDENCE.</span>
                  <h1>Help bring the picture into focus.</h1>
                  <p>Safe, specific requests that help establish what happened.</p>
                </div>
                <span className="demo-pill">
                  {user ? `Signed in as ${user.alias}` : 'Live missions'}
                </span>
              </div>
              <div className="mission-intro">
                <span>
                  <Users size={28} />
                </span>
                <div>
                  <h2>The right task, for the right person.</h2>
                  <p>
                    Students observe public areas. Authorized staff inspect restricted spaces. Each
                    mission has a clear boundary.
                  </p>
                </div>
                <LockKeyhole size={22} />
              </div>
              <MissionsBoard
                key={user?.id}
                userId={user?.id}
                onNotice={(notice) => {
                  setToast(notice)
                  setDataVersion((v) => v + 1)
                }}
              />
            </>
          )}
          {page === 'updates' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SHARE THE OUTCOME. PROTECT THE PEOPLE.</span>
                  <h1>Clarity for the whole campus.</h1>
                  <p>Only moderated, redacted outcomes belong here.</p>
                </div>
                <span className="privacy-label">
                  <ShieldCheck size={18} />
                  Reviewed before publishing
                </span>
              </div>
              <PublicUpdatesFeed
                refreshKey={String(dataVersion)}
                fallback={
                  <div className="public-empty">
                    <span className="public-symbol">
                      <Globe2 size={42} strokeWidth={1} />
                    </span>
                    <h2>No live public updates yet.</h2>
                    <p>
                      New reports begin privately. A public update requires supported findings,
                      privacy review and operator approval.
                    </p>
                    <div className="public-example">
                      <span className="demo-pill">Example wording after verified closure</span>
                      <h3>A reported exit obstruction has been cleared.</h3>
                      <p>
                        “The reported passage was checked after the obstruction was removed. The
                        circulating claim of an official closure was contradicted by the authorized
                        issuer.”
                      </p>
                      <span>
                        <CheckCircle2 size={15} /> Condition checked <span>·</span> No identities
                        published
                      </span>
                    </div>
                    <button className="text-button" onClick={() => setOpenedId(exampleCases[0].id)}>
                      Explore the example case <ArrowUpRight size={15} />
                    </button>
                  </div>
                }
              />
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <span className="footer-mark">rq.</span>Made for the places we share.
            </span>
            <span>
              NMAMIT <span>·</span> Campus model v0.1 <span>·</span>
              <button onClick={() => setUtility('help')}>
                About this preview <ArrowUpRight size={12} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      {intake && (
        <IntakeDialog
          route={intake}
          initialLocation={selected}
          onClose={() => setIntake(null)}
          onSave={createCase}
        />
      )}
      {currentCase && (
        <CaseDialog
          record={currentCase}
          onClose={() => setOpenedId(null)}
          onUpdate={updateCase}
          onRefresh={refreshCase}
        />
      )}
      {utility === 'search' && (
        <Dialog title="Find your place." subtitle="Campus search" onClose={() => setUtility(null)}>
          <div className="dialog-content">
            <div className="location-search large">
              <Search size={19} />
              <input
                autoFocus
                aria-label="Search all campus locations"
                placeholder="Building, garden or campus space…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="search-results">
              {locations
                .filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
                .map((l) => (
                  <button
                    className="location-option"
                    key={l.id}
                    onClick={() => {
                      setSelected(l.id)
                      go('campus')
                      setUtility(null)
                      setSearch('')
                    }}
                  >
                    <MapPin size={18} />
                    <span>
                      <strong>{l.name}</strong>
                      <small>
                        {l.kind}
                        {l.provisional ? ' · provisional' : ''}
                      </small>
                    </span>
                    <ArrowDownLeft size={16} />
                  </button>
                ))}
              {!locations.some((l) => l.name.toLowerCase().includes(search.toLowerCase())) && (
                <p>No matching location. Try a shorter name.</p>
              )}
            </div>
          </div>
        </Dialog>
      )}
      {utility === 'help' && (
        <Dialog
          title="From a question to a better campus."
          subtitle="How RealityQuorum works"
          onClose={() => setUtility(null)}
        >
          <div className="dialog-content help-content">
            <p>
              Check something circulating, or report something you observed. Both start a private
              case and follow the same evidence-led process.
            </p>
            {[
              [
                '01',
                'Share privately',
                'Choose the place, explain the situation and attach any context you have. A photograph is optional for direct reports.',
              ],
              [
                '02',
                'Separate the questions',
                'A message can have a false attribution and describe a real problem. Each claim needs its own evidence.',
              ],
              [
                '03',
                'Gather evidence safely',
                'Approved tasks go to eligible people. Students remain in public areas; authorized staff handle inspections.',
              ],
              [
                '04',
                'Act, then verify the resolution',
                'An operator approves the response. A case closes only after the required closure evidence is reviewed.',
              ],
            ].map(([n, title, text]) => (
              <div className="help-step" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
            <div className="soft-note">
              <BookOpen size={20} />
              <span>
                <strong>About this build</strong>
                <br />A UI connected to a local development server with demo accounts, private case
                storage and prepared examples. Gemini is currently a mock adapter, not a live AI
                service. Institutional sign-in, external verification and real campus delivery are
                not connected. The interpretive map is not intended for navigation.
              </span>
            </div>
            <p className="source-note">
              Campus images are frames from your supplied videos. No third-party photographs have
              been copied. The{' '}
              <a href="https://nitte.edu.in/nmamit/index.php" target="_blank" rel="noreferrer">
                institution website <ArrowUpRight size={12} />
              </a>{' '}
              was consulted for campus context. This is an independent project preview.
            </p>
          </div>
        </Dialog>
      )}
      {utility === 'notifications' && (
        <Dialog title="Your updates." subtitle="Notifications" onClose={() => setUtility(null)}>
          <div className="dialog-content">
            <div className="notification-empty">
              <Bell size={30} />
              <h3>No live notifications yet.</h3>
              <p>
                Once campus services are connected, this is where evidence requests, response
                updates and closure notices will appear.
              </p>
            </div>
            {cases.length > 0 && (
              <button
                className="location-option"
                onClick={() => {
                  go('cases')
                  setUtility(null)
                }}
              >
                <FolderOpen size={18} />
                <span>
                  <strong>
                    {cases.length} development {cases.length === 1 ? 'case' : 'cases'}
                  </strong>
                  <small>Open your case timeline for saved activity</small>
                </span>
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </Dialog>
      )}
      {utility === 'settings' && (
        <Dialog
          title="Your preview workspace."
          subtitle="Demonstration accounts"
          onClose={() => {
            if (!switching) setUtility(null)
          }}
        >
          <div className="dialog-content settings-content">
            <span className="settings-avatar">{user?.name.charAt(0) || 'S'}</span>
            <h3>{user?.name || 'Connecting to the demo server…'}</h3>
            <p>
              Choose a demonstration account to inspect the campus workflow. Reports and attachments
              are saved on the local development server; this is not institutional sign-in.
            </p>
            <div className="settings-storage">
              <FolderOpen size={22} />
              <span>
                <strong>
                  {cases.length} saved {cases.length === 1 ? 'case' : 'cases'}
                </strong>
                <small>
                  {cases.reduce((count, record) => count + record.attachments.length, 0)} private
                  attachments
                </small>
              </span>
            </div>
            <div className="soft-note">
              <LockKeyhole size={18} />
              <span>
                All accounts here are for development. Anyone using the demo can switch roles, so
                use sample data only. Production authentication is still required.
              </span>
            </div>
            <div className="account-selector form-grid">
              <label>
                Demo account
                <select
                  aria-label="Demo account"
                  value={user?.id || ''}
                  disabled={switching || !users.length}
                  onChange={(e) => void changeAccount(e.target.value)}
                >
                  <option value="" disabled>
                    Choose an account
                  </option>
                  {users.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.role.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <p className="input-note">
                {switching
                  ? 'Switching account…'
                  : 'The server controls which cases and actions each account can access.'}
              </p>
            </div>
            {accountError && (
              <p className="form-error" role="alert">
                {accountError}
              </p>
            )}
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
function InfoDot() {
  return <span className="tiny-info">i</span>
}
