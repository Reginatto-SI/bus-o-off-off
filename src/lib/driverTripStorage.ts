/**
 * Persists the driver's selected tripId and operational phase in localStorage
 * so all driver screens stay synchronized across page navigations.
 */

export type OperationalPhase = 'ida' | 'desembarque' | 'reembarque';

function tripKey(userId: string, companyId: string): string {
  return `driverActiveTrip_${userId}_${companyId}`;
}

function phaseKey(userId: string, companyId: string): string {
  return `driverPhase_${userId}_${companyId}`;
}

export function getPersistedTripId(userId: string, companyId: string): string | null {
  try {
    return localStorage.getItem(tripKey(userId, companyId));
  } catch {
    return null;
  }
}

export function setPersistedTripId(userId: string, companyId: string, tripId: string): void {
  try {
    localStorage.setItem(tripKey(userId, companyId), tripId);
  } catch {
    // localStorage unavailable
  }
}

export function getPersistedPhase(userId: string, companyId: string): OperationalPhase {
  try {
    const val = localStorage.getItem(phaseKey(userId, companyId));
    if (val === 'ida' || val === 'desembarque' || val === 'reembarque') return val;
  } catch {
    // ignore
  }
  return 'ida';
}

export function setPersistedPhase(userId: string, companyId: string, phase: OperationalPhase): void {
  try {
    localStorage.setItem(phaseKey(userId, companyId), phase);
  } catch {
    // localStorage unavailable
  }
}
