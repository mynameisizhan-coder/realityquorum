import type { CaseRecord } from '../types'

export const exampleCases: CaseRecord[] = [
  {
    id: 'DEMO-0142',
    route: 'message',
    title: 'An exit notice. Two different questions.',
    description:
      'Prepared scenario: a circulating message says the college officially closed an emergency exit. An example official-source check contradicts that attribution, while separate physical evidence supports a blocked passage.',
    locationId: 'ramanujan',
    specificLocation: 'Illustrative ground-floor exit',
    category: 'Safety & access',
    urgency: 'Urgent',
    status: 'Action in progress',
    createdAt: '2026-10-01T03:30:00.000Z',
    attachments: [],
    demo: true,
    predicates: [
      {
        text: 'The college issued the closure notice.',
        state: 'Contradicted',
        explanation:
          'In this prepared scenario, an authorized issuer explicitly denies the notice. Absence from a registry alone would not establish this.',
      },
      {
        text: 'The exit passage is physically obstructed.',
        state: 'Supported',
        explanation:
          'Two prepared, independent observations of the same exit show an obstruction. These are demonstration records, not actual campus findings.',
      },
      {
        text: 'The obstruction has been cleared.',
        state: 'Unresolved',
        explanation:
          'A work order is open. A completion claim alone does not establish that the exit is clear.',
      },
    ],
    timeline: [
      {
        title: 'Message submitted privately',
        detail: 'A student asks whether the circulating notice is reliable.',
        at: '2026-10-01T03:30:00.000Z',
      },
      {
        title: 'Claims separated',
        detail: 'Official attribution and the physical condition are checked independently.',
        at: '2026-10-01T03:35:00.000Z',
      },
      {
        title: 'Evidence reviewed',
        detail: 'Prepared records contradict the attribution and support the obstruction.',
        at: '2026-10-01T04:00:00.000Z',
      },
      {
        title: 'Example work order approved',
        detail: 'Facilities is assigned to clear the passage. Closure evidence is still required.',
        at: '2026-10-01T04:15:00.000Z',
      },
    ],
  },
  {
    id: 'DEMO-0143',
    route: 'issue',
    title: 'A concern with one food serving.',
    description:
      'Prepared scenario: a student reports an insect-like object in one plate. The task is to establish what is visible and arrange an authorized inspection without assuming when the object entered the food or who is responsible.',
    locationId: 'canteen',
    specificLocation: 'Example counter A',
    category: 'Food & canteen',
    urgency: 'Needs attention',
    status: 'Evidence review',
    createdAt: '2026-10-01T04:00:00.000Z',
    attachments: [],
    demo: true,
    food: {
      item: 'Example lunch serving',
      servedAt: '2026-10-01T12:30',
      receipt: '',
      disturbed: 'Not moved',
    },
    predicates: [
      {
        text: 'An insect-like object is visible in one serving.',
        state: 'Supported',
        explanation:
          'This is a prepared observation for the demonstration. No actual food photograph or allegation is being published.',
      },
      {
        text: 'The object was present when the food was served.',
        state: 'Unresolved',
        explanation: 'An image alone cannot establish when the object entered the serving.',
      },
      {
        text: 'Responsibility has been established.',
        state: 'Unresolved',
        explanation: 'No conclusion about intention, negligence, or responsibility is supported.',
      },
    ],
    timeline: [
      {
        title: 'Issue reported privately',
        detail: 'The reporter records the food item, counter and serving time.',
        at: '2026-10-01T04:00:00.000Z',
      },
      {
        title: 'Safe evidence requests prepared',
        detail:
          'Reporter: entire plate and context. Volunteer: public area only. Supervisor: authorized inspection.',
        at: '2026-10-01T04:10:00.000Z',
      },
      {
        title: 'Origin remains unresolved',
        detail: 'The visible condition and its possible origin are treated as separate questions.',
        at: '2026-10-01T04:30:00.000Z',
      },
    ],
  },
]
