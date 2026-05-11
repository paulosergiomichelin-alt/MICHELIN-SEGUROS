# SECURITY SPECIFICATION - FIRESTORE

## 1. Data Invariants
- A `lead` must have a valid `id` and `status`.
- A `message` must belong to a `leadId` and have a valid `sender`.
- `users` can only read/write their own profile unless they are admins.
- Base64 data is PROHIBITED in Firestore (enforced by DataService and Rules size limits).

## 2. The "Dirty Dozen" Payloads (Denial Tests)
1. **Identity Spoofing**: Attempt to create a lead with a different user's ID as owner (if owner field existed).
2. **State Shortcutting**: Attempt to update lead status from 'Novo Lead' directly to 'Fechado' without intermediate steps (if strictly enforced).
3. **Resource Poisoning**: Document with 1MB string in `id`.
4. **Privilege Escalation**: User attempting to update their own `role` to 'ADMIN'.
5. **Orphaned Write**: Creating a message for a lead that doesn't exist.
6. **Shadow Update**: Updating a lead with an extra field `isVerified: true` not in schema.
7. **Cross-Tenant Access**: User A reading Lead B's messages (if tenancy was implemented).
8. **Unauthenticated Write**: Writing to `leads` without a token.
9. **Email Spoofing**: Signed in with unverified email attempting admin actions.
10. **Immutable Field Tampering**: Changing `createdAt` on an existing lead.
11. **Negative Increment**: Attempting to decrement a counter below zero (if applicable).
12. **Bulk Scrape**: Attempting a `list` query without a filter on an owner field.

## 3. Analysis Table

| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning |
|------------|-------------------|--------------------|---------------------|
| leads      | Blocked (Auth)    | Partial (hasOnly)  | Blocked (isValidId) |
| messages   | Blocked (Auth)    | N/A                | Blocked (isValidId) |
| users      | Blocked (Owner)   | N/A                | Blocked (isValidId) |
| config     | Blocked (Admin)   | N/A                | Blocked (isValidId) |

## 4. Verification Plan
- All "Dirty Dozen" payloads must return `PERMISSION_DENIED`.
- `isValidLead` and `isValidMessage` ensure data integrity.
- `affectedKeys().hasOnly()` prevents "Shadow Updates".
