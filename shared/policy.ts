import type { Category, MissionTemplate, PolicyPack, Route } from './domain'

// Approved policy packs. Gemini may select and reword missions from these packs; it can never add one.

const reporterSafety = ['Do not taste, touch, move or preserve the food', 'Do not confront or accuse staff']
const publicAreaOnly = ['Enter the kitchen or storage areas', 'Handle the food', 'Question or accuse staff', 'Search private records', 'Perform hygiene or scientific inspection']

const foodMissions: MissionTemplate[] = [
  {
    id: 'food.reporter_capture', title: 'Capture the serving as it is',
    instructions: ['Photograph the entire plate from a safe distance', 'Photograph the object without touching or moving it', 'Show the table or serving area', 'Include the capture challenge code on paper or screen in one photo', 'Keep the receipt or order reference if you have one'],
    allowedRoles: ['student'], area: 'public', forbiddenActions: reporterSafety, isDisconfirmation: false,
    evidenceKinds: ['photo', 'receipt'], targets: ['food.object_visible', 'food.serving_visible', 'food.counter_identified'],
  },
  {
    id: 'food.volunteer_public_view', title: 'Confirm the counter from the public area',
    instructions: ['Confirm the canteen and counter named in the report', 'Capture a safe wide view of the serving area', 'Record whether service is continuing', 'Check whether another public report names the same counter'],
    allowedRoles: ['volunteer'], requiredQualification: 'verified_volunteer', area: 'public', forbiddenActions: publicAreaOnly, isDisconfirmation: false,
    evidenceKinds: ['observation', 'photo'], targets: ['food.counter_identified'],
  },
  {
    id: 'food.alternative_explanation', title: 'Test the alternative explanations',
    instructions: ['Is the object on the plate, the packaging or the table?', 'Was the food moved after serving?', 'Does the evidence show the correct counter?', 'Does the receipt match the claimed time and item?', 'Does another fresh view show the same object and serving?'],
    allowedRoles: ['volunteer'], requiredQualification: 'verified_volunteer', area: 'public', forbiddenActions: publicAreaOnly, isDisconfirmation: true,
    evidenceKinds: ['observation', 'independent_confirmation'], targets: ['food.object_visible', 'food.counter_identified'],
  },
  {
    id: 'food.supervisor_isolate', title: 'Isolate the serving and record the batch',
    instructions: ['Isolate the reported serving', 'Record the food batch or preparation window', 'Check whether similar complaints were received', 'Document the immediate corrective action'],
    allowedRoles: ['canteen_supervisor'], requiredQualification: 'food_safety', area: 'restricted', forbiddenActions: ['Identify or contact the reporter directly'], isDisconfirmation: false,
    evidenceKinds: ['supervisor_record', 'isolation_record'], targets: ['food.origin_at_serving'],
  },
  {
    id: 'food.kitchen_inspection', title: 'Authorised kitchen inspection',
    instructions: ['Inspect the counter, kitchen and storage using existing food-safety procedures', 'Record the inspection result and any corrective action'],
    allowedRoles: ['canteen_supervisor'], requiredQualification: 'food_safety', area: 'restricted', forbiddenActions: ['Identify or contact the reporter directly'], isDisconfirmation: false,
    evidenceKinds: ['authorized_inspection', 'corrective_action'], targets: ['food.origin_at_serving', 'food.responsibility'], phase: 'action',
  },
]

const foodSafety: PolicyPack = {
  id: 'food-safety', name: 'Food safety', categories: ['Food & canteen'], freshnessHours: 6,
  predicates: [
    { id: 'food.object_visible', text: 'An insect-like object is visible in the reported serving.', tier: 'observable', appliesTo: 'both', acceptedKinds: ['photo', 'observation', 'independent_confirmation'], minIndependent: 1, requiresFresh: true, publicSupported: 'A foreign object was confirmed in one reported serving.' },
    { id: 'food.serving_visible', text: 'The submitted food serving is visible.', tier: 'observable', appliesTo: 'both', acceptedKinds: ['photo', 'independent_confirmation'], minIndependent: 1, requiresFresh: true },
    { id: 'food.counter_identified', text: 'The evidence shows the named canteen or counter.', tier: 'observable', appliesTo: 'both', acceptedKinds: ['photo', 'observation', 'receipt', 'independent_confirmation'], minIndependent: 1 },
    { id: 'food.origin_at_serving', text: 'The object was present when the food was served.', tier: 'origin', appliesTo: 'both', acceptedKinds: ['receipt', 'supervisor_record', 'authorized_inspection'], minIndependent: 2, requiresProfessional: true },
    { id: 'food.responsibility', text: 'The canteen caused or knowingly served contaminated food.', tier: 'responsibility', appliesTo: 'both', acceptedKinds: ['authorized_inspection'], minIndependent: 1, requiresProfessional: true },
  ],
  missions: foodMissions,
  closure: [
    { kind: 'supervisor_record', label: 'Supervisor action record' },
    { kind: 'isolation_record', label: 'Serving or batch isolated' },
    { kind: 'authorized_inspection', label: 'Authorised inspection result' },
    { kind: 'corrective_action', label: 'Corrective action described' },
    { kind: 'reporter_notification', label: 'Reporter notified' },
  ],
  autoSafetyWorkOrder: false,
  workOrderActions: ['Notify the canteen supervisor', 'Isolate the serving', 'Pause the relevant food batch', 'Record the preparation window', 'Inspect the counter or kitchen through authorised staff', 'Record corrective action'],
  publicCorrectiveSummary: 'The serving and related preparation batch were isolated, and the canteen completed an internal food-safety inspection.',
}

const exitAccess: PolicyPack = {
  id: 'exit-access', name: 'Emergency exits and access', categories: ['Safety & access'], freshnessHours: 12,
  predicates: [
    { id: 'exit.notice_official', text: 'The college issued the closure notice.', tier: 'attribution', appliesTo: 'message', acceptedKinds: ['official_source'], decisiveKinds: ['official_source'], minIndependent: 1, publicSupported: 'The college confirmed it issued the notice.', publicContradicted: 'The circulating message claiming the college officially closed this exit was not issued by the college.' },
    { id: 'exit.obstructed', text: 'The exit passage is physically obstructed.', tier: 'observable', appliesTo: 'both', acceptedKinds: ['photo', 'observation', 'independent_confirmation'], minIndependent: 2, requiresFresh: true, publicSupported: 'The exit passage was found to be physically obstructed.' },
    { id: 'exit.cleared', text: 'The obstruction has been cleared.', tier: 'observable', appliesTo: 'both', acceptedKinds: ['closure_photo', 'independent_confirmation'], minIndependent: 2, requiresFresh: true, publicSupported: 'Facilities cleared the obstruction, and the exit was independently confirmed clear.' },
  ],
  missions: [
    { id: 'exit.official_source_check', title: 'Check the notice with its claimed issuer', instructions: ['Contact the office named as issuer', 'Record whether the notice was issued, denied or unknown', 'Absence from a registry is not a denial; record it as unknown'], allowedRoles: ['operator', 'trust_officer'], area: 'public', forbiddenActions: ['Publish anything before review'], isDisconfirmation: false, evidenceKinds: ['official_source'], targets: ['exit.notice_official'] },
    { id: 'exit.volunteer_check', title: 'Photograph the exit from the corridor', instructions: ['Go to the named exit using public corridors', 'Photograph the passage with the capture challenge code', 'Note whether the obstruction is still present'], allowedRoles: ['volunteer', 'student'], requiredQualification: 'verified_volunteer', area: 'public', forbiddenActions: ['Move or remove the obstruction yourself', 'Enter locked or restricted areas'], isDisconfirmation: false, evidenceKinds: ['photo', 'observation'], targets: ['exit.obstructed'] },
    { id: 'exit.alternative_explanation', title: 'Is this an approved temporary closure?', instructions: ['Check for official signage or barriers', 'Confirm this is the exit named in the message', 'Look for an alternative marked route'], allowedRoles: ['volunteer'], requiredQualification: 'verified_volunteer', area: 'public', forbiddenActions: ['Move or remove the obstruction yourself'], isDisconfirmation: true, evidenceKinds: ['observation'], targets: ['exit.obstructed', 'exit.notice_official'] },
    { id: 'exit.facilities_clear', title: 'Clear the obstruction', instructions: ['Clear the passage', 'Photograph the cleared exit with the capture challenge code', 'Describe the corrective action'], allowedRoles: ['facilities'], requiredQualification: 'facilities', area: 'restricted', forbiddenActions: [], isDisconfirmation: false, evidenceKinds: ['closure_photo', 'corrective_action'], targets: ['exit.cleared'], phase: 'action' },
    { id: 'exit.independent_confirmation', title: 'Confirm the exit is clear', instructions: ['Visit the exit after facilities report completion', 'Photograph the passage with the capture challenge code'], allowedRoles: ['volunteer'], requiredQualification: 'verified_volunteer', area: 'public', forbiddenActions: ['Move anything yourself'], isDisconfirmation: false, evidenceKinds: ['independent_confirmation'], targets: ['exit.cleared'], phase: 'action' },
  ],
  closure: [
    { kind: 'closure_photo', label: 'Cleared exit photographed by facilities' },
    { kind: 'independent_confirmation', label: 'Independent confirmation the exit is clear' },
    { kind: 'corrective_action', label: 'Corrective action described' },
    { kind: 'reporter_notification', label: 'Reporter notified' },
  ],
  autoSafetyWorkOrder: false,
  closurePredicate: 'exit.cleared',
  workOrderActions: ['Clear the obstruction from the exit passage', 'Photograph the cleared exit with the capture challenge code', 'Record corrective action'],
  publicCorrectiveSummary: 'The case was closed after the closure evidence was verified.',
}

const campusNotice: PolicyPack = {
  id: 'campus-notice', name: 'Campus notices', categories: ['Campus notice'], freshnessHours: 48,
  predicates: [
    { id: 'notice.official', text: 'The named office issued this notice.', tier: 'attribution', appliesTo: 'message', acceptedKinds: ['official_source'], decisiveKinds: ['official_source'], minIndependent: 1, publicSupported: 'The named office confirmed it issued this notice.', publicContradicted: 'The named office did not issue this notice.' },
    { id: 'notice.content_accurate', text: 'What the notice describes is happening on campus.', tier: 'observable', appliesTo: 'message', acceptedKinds: ['official_source', 'observation', 'photo'], minIndependent: 1, publicSupported: 'What the notice describes was confirmed.', publicContradicted: 'What the notice describes was not found on campus.' },
  ],
  missions: [
    { id: 'notice.official_source_check', title: 'Check the notice with its claimed issuer', instructions: ['Contact the office named as issuer', 'Record issued, denied or unknown'], allowedRoles: ['operator', 'trust_officer'], area: 'public', forbiddenActions: ['Publish anything before review'], isDisconfirmation: false, evidenceKinds: ['official_source'], targets: ['notice.official'] },
    { id: 'notice.alternative_explanation', title: 'Look for an earlier or edited version', instructions: ['Search official channels for a similar notice', 'Note differences in dates, names or wording'], allowedRoles: ['volunteer', 'operator'], area: 'public', forbiddenActions: ['Contact the person who forwarded the message'], isDisconfirmation: true, evidenceKinds: ['observation'], targets: ['notice.official', 'notice.content_accurate'] },
  ],
  closure: [{ kind: 'reporter_notification', label: 'Reporter notified' }],
  autoSafetyWorkOrder: false,
  workOrderActions: ['Publish a correction through official channels'],
  publicCorrectiveSummary: 'The notice was checked with the office named as its issuer.',
}

const general: PolicyPack = {
  id: 'general-facilities', name: 'General facilities', categories: ['Facilities', 'Other'], freshnessHours: 24,
  predicates: [
    { id: 'general.condition_present', text: 'The reported condition is present at the named location.', tier: 'observable', appliesTo: 'both', acceptedKinds: ['photo', 'observation', 'independent_confirmation'], minIndependent: 1, requiresFresh: true, publicSupported: 'The reported condition was confirmed at the location.' },
    { id: 'general.resolved', text: 'The condition has been resolved.', tier: 'observable', appliesTo: 'both', acceptedKinds: ['closure_photo', 'independent_confirmation'], minIndependent: 1, requiresFresh: true, publicSupported: 'The condition was resolved and confirmed.' },
  ],
  missions: [
    { id: 'general.reporter_capture', title: 'Add a fresh photograph', instructions: ['Photograph the condition with the capture challenge code', 'Include a nearby landmark'], allowedRoles: ['student'], area: 'public', forbiddenActions: ['Put yourself at risk'], isDisconfirmation: false, evidenceKinds: ['photo'], targets: ['general.condition_present'] },
    { id: 'general.volunteer_check', title: 'Confirm from the public area', instructions: ['Visit the location using public routes', 'Record whether the condition is present'], allowedRoles: ['volunteer'], requiredQualification: 'verified_volunteer', area: 'public', forbiddenActions: ['Enter restricted areas'], isDisconfirmation: true, evidenceKinds: ['observation', 'photo'], targets: ['general.condition_present'] },
    { id: 'general.facilities_fix', title: 'Fix and photograph', instructions: ['Resolve the condition', 'Photograph the result with the capture challenge code'], allowedRoles: ['facilities'], requiredQualification: 'facilities', area: 'restricted', forbiddenActions: [], isDisconfirmation: false, evidenceKinds: ['closure_photo', 'corrective_action'], targets: ['general.resolved'], phase: 'action' },
  ],
  closure: [
    { kind: 'closure_photo', label: 'Resolution photographed' },
    { kind: 'corrective_action', label: 'Corrective action described' },
    { kind: 'reporter_notification', label: 'Reporter notified' },
  ],
  autoSafetyWorkOrder: false,
  closurePredicate: 'general.resolved',
  workOrderActions: ['Resolve the condition', 'Photograph the result with the capture challenge code', 'Record corrective action'],
  publicCorrectiveSummary: 'The case was closed after the closure evidence was verified.',
}

export const POLICY_PACKS: PolicyPack[] = [foodSafety, exitAccess, campusNotice, general]

export function getPack(id: string): PolicyPack {
  const pack = POLICY_PACKS.find(p => p.id === id)
  if (!pack) throw new Error(`Unknown policy pack: ${id}`)
  return pack
}

/** Packs are chosen by category; the route only decides which predicates apply (see predicatesFor). */
export function selectPack(category: Category, _route: Route): PolicyPack {
  return POLICY_PACKS.find(p => p.categories.includes(category)) ?? general
}
