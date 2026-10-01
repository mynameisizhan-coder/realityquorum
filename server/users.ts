import type { User } from '../shared/domain'

// Demonstration accounts for the role switcher. Names are fictional.
export const DEMO_USERS: User[] = [
  { id: 'u-student', name: 'Asha (demo student)', role: 'student', alias: 'Reporter-7Q', qualifications: [] },
  { id: 'u-student2', name: 'Rahul (demo student)', role: 'student', alias: 'Reporter-K4', qualifications: [] },
  { id: 'u-volunteer', name: 'Meera (verified volunteer)', role: 'volunteer', alias: 'Volunteer-V2', qualifications: ['verified_volunteer'] },
  { id: 'u-volunteer2', name: 'Kiran (verified volunteer)', role: 'volunteer', alias: 'Volunteer-V5', qualifications: ['verified_volunteer'] },
  { id: 'u-volunteer-untrained', name: 'Dev (unverified volunteer)', role: 'volunteer', alias: 'Volunteer-V9', qualifications: [] },
  { id: 'u-canteen', name: 'Canteen supervisor (food-safety trained)', role: 'canteen_supervisor', alias: 'Canteen-S1', qualifications: ['food_safety'], department: 'Canteen supervisor' },
  { id: 'u-canteen-trainee', name: 'Canteen trainee (not yet trained)', role: 'canteen_supervisor', alias: 'Canteen-T1', qualifications: [], department: 'Canteen supervisor' },
  { id: 'u-facilities', name: 'Campus facilities lead', role: 'facilities', alias: 'Facilities-F1', qualifications: ['facilities'], department: 'Campus facilities' },
  { id: 'u-operator', name: 'Operations desk', role: 'operator', alias: 'Operator-O1', qualifications: [], department: 'Campus trust desk' },
  { id: 'u-trust', name: 'Trust officer', role: 'trust_officer', alias: 'Trust-T1', qualifications: [], department: 'Campus trust desk' },
]
