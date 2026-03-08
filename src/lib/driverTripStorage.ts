/**
 * Persists the driver's selected tripId in localStorage
 * so all driver screens stay synchronized across page navigations.
 */

function storageKey(userId: string, companyId: string): string {
  return `driverActiveTrip_${userId}_${companyId}`;
}

export function getPersistedTripId(userId: string, companyId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId, companyId));
  } catch {
    return null;
  }
}

export function setPersistedTripId(userId: string, companyId: string, tripId: string): void {
  try {
    localStorage.setItem(storageKey(userId, companyId), tripId);
  } catch {
    // localStorage unavailable
  }
}
