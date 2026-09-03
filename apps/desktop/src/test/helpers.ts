/**
 * Test helpers for Vitest tests.
 * These delegate to the production auth service so the in-memory session is
 * shared between app code and tests.
 */

import type { AuthSession } from '../types/auth';
import {
  _getMemSession as getServiceMemSession,
  _setMemSession as setServiceMemSession,
} from '../services/tauriAuthService';

// @visibleForTesting
export function _setMemSession(session: AuthSession | null): void {
  setServiceMemSession(session);
}

// @visibleForTesting
export function _getMemSession(): AuthSession | null {
  return getServiceMemSession();
}
