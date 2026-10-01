# RealityQuorum Final Dual Intake Plan

## Product definition

RealityQuorum will support two equally important entry points:

1. **Verify a message**
   - Used for suspicious WhatsApp messages, screenshots, campus notices and links.
2. **Report an issue**
   - Used when a student personally observes a campus problem.

Both routes use the same underlying system:

```text
Submission
-> Private case
-> Verification route
-> Evidence missions
-> Evidence ledger
-> Campus action
-> Closure verification
-> Optional redacted public update
```

## Primary hackathon demonstration

The primary live presentation remains one hybrid case:

> A WhatsApp message falsely claims that the college officially closed an emergency exit. The official attribution is contradicted, but fresh evidence confirms that the exit is genuinely blocked. Campus management clears the obstruction, and RealityQuorum verifies the resolution.

This demonstrates:

- WhatsApp-content verification.
- Gemini claim extraction.
- Official-source checking.
- 3D campus location.
- Physical evidence missions.
- Predicate-level decisions.
- Campus work orders.
- Closure verification.
- Public correction.

## Functional secondary direct-report flow

Students can also select **Report an issue** without submitting an existing message.

This will be a real working flow, not only a dashboard mock-up.

The student can:

1. Enter a short description.
2. Add a photograph.
3. Select the location through the 3D campus.
4. Review Gemini’s category and urgency suggestions.
5. Submit a private case.
6. Track the responsible department, target response time and timeline.
7. Add evidence later.
8. Review the resolution.
9. Request reopening.

The canteen contamination example will be the prepared secondary case.

## Example direct case

A student finds what appears to be a cockroach in a plate of food.

The student reports:

> “There is a cockroach in the food served to me at the Main Canteen.”

### Initial intake

The student provides:

- Canteen or food-counter location.
- Approximate serving time.
- Food item.
- Fresh photograph.
- Optional receipt or order reference.
- Whether the food has been moved or disturbed.

The report remains private.

The application must not publicly display:

> “Main Canteen serves contaminated food.”

That conclusion is much broader than the available evidence.

## Food contamination policy pack

### Observable predicates

The policy pack evaluates:

- Is an insect-like object visible?
- Is the submitted food serving visible?
- Does the evidence show the named canteen or counter?
- Is the photograph fresh enough for the case?
- Is there evidence connecting the object to the originally served food?
- Are there related reports involving the same time, item or batch?
- Has the food already been replaced, moved or discarded?
- Has the canteen isolated the relevant serving or batch?

### Claims kept separate

The application must separate:

1. **Observable presence**
   - “An insect-like object is visible in this plate.”

2. **Possible origin**
   - “The object may have been present when the food was served.”

3. **Responsibility**
   - “The canteen caused or knowingly served contaminated food.”

Fresh photographs may support the first claim.

Additional context may partially support the second.

The system must not confirm the third without reliable evidence.

## Evidence missions

Gemini may select and adapt missions only from an approved food-safety policy pack.

### Reporter mission

The reporting student may be asked to:

- Capture the entire plate.
- Capture the object without touching or moving it.
- Show the table or serving area.
- Include the temporary capture challenge.
- Preserve the receipt or order reference if available.

The student must not be asked to taste, handle or preserve potentially unsafe food.

### Student volunteer mission

A verified student volunteer may:

- Confirm the correct public canteen or counter.
- Capture a safe wide view of the serving area.
- Record whether service is continuing.
- Check whether another public report refers to the same counter.

The volunteer may not:

- Enter the kitchen.
- Inspect storage areas.
- Handle the food.
- Question or accuse staff.
- Search private records.
- Perform hygiene or scientific inspection.

### Canteen supervisor mission

An authorized canteen supervisor may:

- Isolate the serving.
- Record the relevant food batch or preparation window.
- Check whether similar complaints were received.
- Document the immediate corrective action.
- Inspect restricted areas using existing food-safety procedures.

### Disconfirmation mission

The policy pack must include a task that tests an alternative explanation:

- Is the object on the plate, packaging or table?
- Was the food moved after serving?
- Does the evidence show the correct counter?
- Does the receipt correspond to the claimed time and item?
- Does another fresh view show the same object and serving?

The purpose is not to discredit the student. It prevents the system from presenting a broader conclusion than the evidence supports.

## Gemini’s role

Gemini may report:

- An insect-like object is visible.
- The object appears within the plate boundary.
- The canteen sign or counter identifier is visible.
- The receipt time is consistent with the report.
- Different sources appear to show the same serving.
- The available images do not establish when the object entered the food.
- Evidence sources conflict or remain unclear.

Gemini may not:

- Diagnose contamination.
- Identify a species with unsupported certainty.
- accuse the student or canteen staff.
- determine intention or negligence.
- certify the entire kitchen as unsafe.
- calculate the final decision.
- invent unrestricted evidence missions.

## Possible decision

A valid result could be:

> **Confirmed observable condition:** An insect-like object is visible in the reported food serving. The evidence supports isolating the serving and inspecting the relevant preparation batch. The available evidence does not establish when the object entered the food or who is responsible.

Possible states:

- Confirmed observable condition.
- Disputed evidence.
- Insufficient evidence.
- Professional inspection required.

## Campus-management response

After verification or precautionary triage, the operator may:

- Notify the canteen supervisor.
- Isolate the serving.
- Pause the relevant food batch.
- Record the preparation window.
- Inspect the counter or kitchen through authorized staff.
- Record corrective action.
- Escalate to the appropriate food-safety authority if required.

The system creates a work order only after operator approval or an explicitly approved safety policy.

## Closure verification

The case cannot close merely because the canteen selects “Resolved.”

Closure evidence may require:

- Supervisor action record.
- Confirmation that the affected serving or batch was isolated.
- Authorized inspection result.
- Corrective-action description.
- Reporter notification.
- Independent confirmation where appropriate.

The public outcome might say:

> “A foreign object was confirmed in one reported serving. The serving and related preparation batch were isolated, and the canteen completed an internal food-safety inspection.”

It must not publish student identity, staff accusations or unsupported claims about the entire canteen.

## Privacy and misuse controls

- Reports remain private initially.
- The department sees a reporter alias.
- Only an audited trust officer may reveal reporter identity.
- Raw food photographs remain private.
- Faces and personal identifiers are redacted.
- Related reports are suggested, not automatically merged.
- Repeated malicious submissions go to abuse review.
- A student may appeal rejection or request reopening.
- Public comments and voting are not implemented.
- Public updates require operator moderation.

## Shared implementation

The direct-report flow reuses:

- Authentication.
- Confidential reporter identities.
- 3D location selection.
- Case management.
- Policy-pack selection.
- Mission generation.
- Responder authorization.
- Evidence storage.
- Gemini observations.
- Deterministic decisions.
- Work orders.
- Tracking timeline.
- Closure verification.
- Public redaction.

No separate application or backend is created for direct complaints.

## Hackathon scope

### Required live functionality

- Both home-page entry buttons work.
- Suspicious-message submission works.
- Direct issue submission works.
- 3D building selection works.
- Accessible location-list fallback works.
- Private case creation works.
- Gemini claim extraction works.
- Physical missions work.
- Evidence ledger works.
- One work order works.
- Closure evidence works.

### Primary live demonstration

Use the hybrid WhatsApp and blocked-exit case.

### Secondary proof

Show that the canteen case can be submitted through the actual direct-report interface and reaches the operator dashboard.

The canteen case may use prepared evidence to avoid handling real food or making a real allegation during judging.

Clearly label prepared evidence as demonstration data.

## Required tests

- Student submits a canteen report without a photograph.
- Student submits with a photograph and receipt.
- Gemini suggests the wrong category and the student corrects it.
- Volunteer cannot access a kitchen-inspection mission.
- Untrained responder cannot accept a food-safety mission.
- Two reports from the same counter are suggested as related.
- Related reports are not automatically merged.
- Presence is confirmed while origin remains unresolved.
- Canteen operator cannot publish the student’s identity.
- Case cannot close without required closure evidence.
- Reporter can request reopening.
- Public outcome contains no unsupported accusation.
- The direct-report flow works independently of WhatsApp verification.

## Final product explanation

RealityQuorum supports both ways a campus problem begins:

- A suspicious message is circulating and someone wants to know what parts are reliable.
- A student personally observes a problem and directly creates a case.

The application verifies only the facts supported by evidence, routes the case to the responsible campus unit, tracks the response and verifies the resolution.
