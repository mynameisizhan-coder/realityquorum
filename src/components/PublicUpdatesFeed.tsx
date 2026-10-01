import type { ReactNode } from 'react'
import { CheckCircle2, Globe2, MapPin } from 'lucide-react'
import { usePublicUpdates } from '../api/hooks'
import { getLocation } from '../data/campus'
import './staff.css'

// Published, operator-moderated outcomes. These are the only case details anyone can see without an account.

export default function PublicUpdatesFeed({
  refreshKey,
  fallback,
}: {
  refreshKey?: string
  fallback: ReactNode
}) {
  const { data: updates, loading, error } = usePublicUpdates(refreshKey)
  if (loading && !updates.length) return <p className="input-note">Loading public updates…</p>
  if (error)
    return (
      <p role="alert" className="form-error">
        {error}
      </p>
    )
  if (!updates.length) return <>{fallback}</>
  return (
    <div className="public-feed">
      {updates.map((u) => (
        <article className="public-update" key={u.id}>
          <div>
            <span className="eyebrow">{u.category}</span>
            <time>
              {new Date(u.publishedAt).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </time>
          </div>
          <p>{u.text}</p>
          <span>
            <MapPin size={13} /> {getLocation(u.locationId)?.shortName ?? 'Campus-wide'}{' '}
            <span>·</span> <CheckCircle2 size={13} /> Reviewed by an operator <span>·</span>{' '}
            <Globe2 size={13} /> No identities published
          </span>
        </article>
      ))}
    </div>
  )
}
