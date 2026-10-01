import { CheckCircle2, CircleHelp, Globe2, RotateCcw, ShieldAlert } from 'lucide-react'
import type { OfficialCheckResult } from '../../shared/domain'
import './staff.css'

// What the automated check of NMAMIT's official website found for a circulating message.

const LOOK: Record<
  OfficialCheckResult['status'],
  { title: string; tone: string; icon: typeof Globe2 }
> = {
  confirmed: {
    title: 'The official website confirms this notice',
    tone: 'good',
    icon: CheckCircle2,
  },
  contradicted: {
    title: 'The official website contradicts this message',
    tone: 'bad',
    icon: RotateCcw,
  },
  not_found: {
    title: 'No matching notice on the official website',
    tone: 'neutral',
    icon: CircleHelp,
  },
  unverified: {
    title: 'The website check could not be verified',
    tone: 'neutral',
    icon: ShieldAlert,
  },
  unavailable: {
    title: 'The official website could not be checked',
    tone: 'neutral',
    icon: ShieldAlert,
  },
}

const host = (url: string) => {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`
  } catch {
    return url
  }
}

export default function OfficialCheckCard({ check }: { check: OfficialCheckResult }) {
  const look = LOOK[check.status]
  return (
    <section className={`official-check ${look.tone}`} aria-label="Official website check">
      <div className="official-check-head">
        <look.icon size={18} />
        <div>
          <strong>{look.title}</strong>
          <small>
            Automated check of NMAMIT’s announcements and news pages ·{' '}
            {new Date(check.checkedAt).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </small>
        </div>
      </div>
      <p>{check.summary}</p>
      {check.quotes.map((q) => (
        <blockquote key={q.url + q.text}>
          “{q.text}”
          <a href={q.url} target="_blank" rel="noopener noreferrer">
            {host(q.url)}
          </a>
        </blockquote>
      ))}
      {check.status === 'not_found' && (
        <p className="input-note">
          A missing notice does not prove the message is false. The office named in the message
          should confirm it.
        </p>
      )}
      <p className="official-check-sources">
        Pages checked:{' '}
        {check.sources.map((s, i) => (
          <span key={s}>
            {i > 0 && ' · '}
            <a href={s} target="_blank" rel="noopener noreferrer">
              {host(s)}
            </a>
          </span>
        ))}
      </p>
    </section>
  )
}
