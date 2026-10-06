# Closer safety review

The safety release is promoted to production. Google Play submission requirements
remain a separate checklist; this runbook does not claim store approval.

## Review locations

Sign in to https://closer.hozaiphaa.workers.dev with an authorised admin account,
accept the terms, and open Admin dashboard → Safety reports. The hosted queue
contains production reports only. Experiments and local simulation queues stay
isolated and are never copied into production.

## User behaviour

Terms version 2026-10-04 is recorded before signup or guest entry. Existing account
users explicitly accept the terms before connecting or linking. The server also
rejects answers without acceptance. Account acceptance is stored in the production
database; guest acceptance uses a hashed guest identifier in the safety object.

Safety & support is in the dashboard menu and card screen. Reports include a
reason, optional details, participant metadata, and an optional explicitly
selected *currently revealed partner answer*. Other answers are never queried
by the report queue. A stale partner or card selection is rejected. A successful
report returns a reference ID. Report requests are limited to five per identity
per hour. Repeating the same request ID returns the existing reference.

Blocking accounts unlinks both users, closes the room connection, and prevents
relinking in either direction. Blocks remain until an associated account is
deleted. Guest blocking closes the current room and prevents the same saved
guest identities from sharing rooms for one year. Guest identities cannot
provide account-level enforcement when storage is cleared or devices change.

## Admin process

1. Review open reports regularly. Open reports appear first, with child safety
   reports prioritised. Use Previous and Next to browse the queue in pages of 50.
2. Read only submitted report material. Do not access underlying answer history
   to investigate. Do not request passwords or distribute report excerpts.
3. Record a review note and choose Resolve, Dismiss, Close guest room, Restrict
   reported account, or Restore reported account. Restricting an account stops
   partner interactions and unlinks it; login and self-deletion remain available.
   Restoration does not automatically reconnect partners or remove user blocks.
4. For an immediate threat, prioritise human review and appropriate emergency
   escalation. For suspected child exploitation, do not copy or redistribute the
   material. Follow applicable preservation/reporting obligations and contact
   the appropriate authority. An actual operational owner and lawful escalation
   process must be confirmed before production release.
5. Support and appeals go to hozaiphaa@gmail.com. Record the outcome in the queue.
   Resolving/dismissing a report records a decision; it does not by itself remove
   content. Use a room closure/account restriction when action is needed. Existing
   couple data deletion is available for an approved removal decision.

Safety reports and decisions expire one year after submission, including after
account deletion for abuse review. Guest blocks and consent expire after one
year. Account consent and blocks cascade when an associated account is deleted.
These exceptions are disclosed in the privacy policy.

## Release and operations

Account deletion queues affected room IDs atomically with database erasure. A
private maintenance Durable Object schedules retries before deletion and clears
room working copies and presence records before acknowledging jobs. The API and
deletion screens explicitly indicate pending cleanup after temporary outages.
Deleting an account erases both partners' saved answers and favorites in all
affected pair records. Ordinary room closure retains its discovery record while
data remains stored.

Review historical orphaned data from older deletion flows separately. The new
flow cannot infer every former account ID after its profile, discovery record
and all database references have already been erased; no historical bulk cleanup
was performed as part of this promotion.

Apply the three safety migrations before deploying the matching Worker and web
assets, then publish production and Expo Go updates. The guarded persistence RPC
can flush operations already accepted into the server outbox without falsely
recording terms acceptance; consent is checked before new submissions are accepted.

Confirm a human moderation owner, a monitored appeal mailbox, and appropriate
safety escalation procedures. Review card content, target audience, Data Safety
declarations, reviewer access, and the signed Android release bundle before Play
Store submission. New development continues in experiments until approved.
