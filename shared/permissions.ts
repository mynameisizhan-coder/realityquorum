import type { Case, Mission, Role, User } from './domain'

export type Action =
  | 'case.create' | 'case.viewAll' | 'case.viewDepartment' | 'evidence.official'
  | 'workorder.approve' | 'workorder.update' | 'closure.record' | 'case.close'
  | 'update.draft' | 'update.publish' | 'identity.reveal' | 'abuse.flag' | 'abuse.view' | 'audit.view'

const MATRIX: Record<Action, Role[]> = {
  'case.create': ['student', 'volunteer'],
  'case.viewAll': ['operator', 'trust_officer'],
  'case.viewDepartment': ['canteen_supervisor', 'facilities'],
  'evidence.official': ['operator', 'trust_officer'],
  'workorder.approve': ['operator'],
  'workorder.update': ['canteen_supervisor', 'facilities', 'operator'],
  'closure.record': ['canteen_supervisor', 'facilities', 'operator', 'volunteer'],
  'case.close': ['operator'],
  'update.draft': ['operator'],
  'update.publish': ['operator'],
  'identity.reveal': ['trust_officer'],
  'abuse.flag': ['operator', 'trust_officer'],
  'abuse.view': ['operator', 'trust_officer'],
  'audit.view': ['trust_officer'],
}

export function can(user: Pick<User, 'role'>, action: Action): boolean {
  return MATRIX[action].includes(user.role)
}

export interface Eligibility { ok: boolean; reason: string }

const ROLE_LABEL: Record<Role, string> = {
  student: 'students', volunteer: 'verified volunteers', canteen_supervisor: 'canteen supervisors',
  facilities: 'campus facilities', operator: 'operators', trust_officer: 'trust officers',
}

export function missionEligibility(user: User, mission: Mission, caseRecord: Pick<Case, 'reporterId'>): Eligibility {
  const isReporter = user.id === caseRecord.reporterId
  if (!mission.allowedRoles.includes(user.role)) {
    const who = mission.allowedRoles.map(r => ROLE_LABEL[r]).join(' or ')
    const where = mission.area === 'restricted' ? ' It involves a restricted area.' : ''
    return { ok: false, reason: `This mission is limited to ${who}.${where}` }
  }
  // Student missions belong to the person who reported; anyone else confirming must be independent of them.
  if (user.role === 'student' && !mission.requiredQualification && !isReporter) return { ok: false, reason: 'Only the reporter can complete this mission.' }
  if (user.role !== 'student' && isReporter) return { ok: false, reason: 'You reported this case, so your evidence would not be independent.' }
  if (mission.requiredQualification && !user.qualifications.includes(mission.requiredQualification))
    return { ok: false, reason: `This mission requires the ${mission.requiredQualification.replace('_', ' ')} qualification.` }
  if (mission.status !== 'Open') return { ok: false, reason: `This mission is ${mission.status.toLowerCase()}.` }
  return { ok: true, reason: 'You can accept this mission.' }
}

export function canViewCase(user: User, caseRecord: Pick<Case, 'reporterId' | 'department'>): boolean {
  if (user.id === caseRecord.reporterId) return true
  if (can(user, 'case.viewAll')) return true
  return can(user, 'case.viewDepartment') && user.department === caseRecord.department
}
