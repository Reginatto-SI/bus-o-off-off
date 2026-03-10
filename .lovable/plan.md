

# Plan: Fix Developer User Blank Screen / Infinite Loading

## Root Cause

Two bugs in `AuthContext.tsx` create a race condition that leaves the developer user stuck on a loading spinner:

### Bug 1 — `loading` set to `false` before data is ready
Line 222: `setLoading(false)` fires inside `onAuthStateChange` **immediately**, but `fetchUserData` is deferred with `setTimeout(..., 0)`. This means `loading=false` while `userRole` is still `null`. AdminLayout sees `!userRole` → shows spinner forever (lines 89-94).

### Bug 2 — Developer role never set when no matching company role entry
Line 165: `rolesData.find(r => r.company_id === validCompanyId)` — the developer fetches ALL active companies (cross-company), but may not have a `user_roles` row for the company saved in localStorage. When `roleForCompany` is undefined, `setUserRole` is never called → `userRole` stays `null` permanently.

This is why clearing browser storage "fixes" it temporarily — it removes the stale localStorage entry, forcing a different company selection path.

## Fix (single file: `src/contexts/AuthContext.tsx`)

1. **Move `setLoading(false)` inside `fetchUserData`** — loading only clears after all data (profile, role, company) is fully resolved.

2. **Developer fallback for role**: After resolving `validCompanyId`, if no `roleForCompany` is found but user is a developer, always set `userRole = 'developer'`. This covers the case where developer has no `user_roles` entry for a particular company.

3. **Stale localStorage cleanup**: If the saved company from localStorage is not found in the fetched active companies list, remove the stale entry immediately to prevent repeat failures.

4. **Ensure `setLoading(false)` is called in ALL code paths** within `fetchUserData` (success, error, empty roles) so the user is never stuck.

## Files Changed
- `src/contexts/AuthContext.tsx` — single file fix

