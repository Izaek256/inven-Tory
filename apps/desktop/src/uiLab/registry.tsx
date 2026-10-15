/**
 * UI Lab registry — DEVELOPMENT ONLY (loaded exclusively from UiLab.tsx,
 * which itself is only mounted when `import.meta.env.DEV` is true).
 *
 * Every entry renders the application's REAL components with isolated mock
 * props/handlers — no production data, no database, no server. Startup
 * scenario entries are also what the lab overrides the app boot with when
 * "Use as startup scenario" is active.
 */

import React, { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from '../context/StoreContext';
import { LoginView } from '../views/LoginView';
import { GenesisWizard, type GenesisWizardProps } from '../views/GenesisWizard';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { GlobalSearchModal } from '../components/GlobalSearchModal';
import { ProductModal } from '../components/ProductModal';
import { StoreModal } from '../components/StoreModal';
import { DeviceRegistrationModal } from '../components/DeviceRegistrationModal';
import { OfflineAuthBanner } from '../components/OfflineAuthBanner';
import {
  Button,
  Badge,
  Card,
  TextInput,
  Select,
  Spinner,
  EmptyState,
  Skeleton,
} from '@invenTory/ui';
import type { AuthSession } from '../types/auth';
import type { LabProfile } from './state';
import { MOCK_PRODUCTS, MOCK_RESTORE_PREVIEW, MOCK_RESTORE_PROGRESS, MOCK_STORES } from './labMock';

// Lazy views — same code-splitting pattern as App.tsx.
const DashboardView = lazy(() =>
  import('../views/DashboardView').then((m) => ({ default: m.DashboardView })),
);
const ProductsView = lazy(() =>
  import('../views/ProductsView').then((m) => ({ default: m.ProductsView })),
);
const CreateProductView = lazy(() =>
  import('../views/CreateProductView').then((m) => ({ default: m.CreateProductView })),
);
const ReceiveStockView = lazy(() =>
  import('../views/ReceiveStockView').then((m) => ({ default: m.ReceiveStockView })),
);
const SaleStockView = lazy(() =>
  import('../views/SaleStockView').then((m) => ({ default: m.SaleStockView })),
);
const ReturnStockView = lazy(() =>
  import('../views/ReturnStockView').then((m) => ({ default: m.ReturnStockView })),
);
const TransferStockView = lazy(() =>
  import('../views/TransferStockView').then((m) => ({ default: m.TransferStockView })),
);
const DamageQuarantineView = lazy(() =>
  import('../views/DamageQuarantineView').then((m) => ({ default: m.DamageQuarantineView })),
);
const PhysicalCountAdjustmentView = lazy(() =>
  import('../views/PhysicalCountAdjustmentView').then((m) => ({
    default: m.PhysicalCountAdjustmentView,
  })),
);
const DayBooksView = lazy(() =>
  import('../views/DayBooksView').then((m) => ({ default: m.DayBooksView })),
);
const TransactionsView = lazy(() =>
  import('../views/TransactionsView').then((m) => ({ default: m.TransactionsView })),
);
const SettingsView = lazy(() =>
  import('../views/SettingsView').then((m) => ({ default: m.SettingsView })),
);

// ---------------------------------------------------------------------------
// Mock fixtures / handlers
// ---------------------------------------------------------------------------

const LAB_QUERY_CLIENT = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export const MOCK_SESSION: AuthSession = {
  access_token: 'ui-lab-token',
  refresh_token: '',
  user_id: 'LAB-USER',
  username: 'admin',
  full_name: 'UI Lab Admin',
  role: 'GLOBAL_ADMIN',
  assigned_store_id: 'STORE-ALPHA',
  expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
  token_expired_offline: false,
};

const NOT_READY_GENESIS_STATE = {
  ready: false,
  has_user_with_pin: false,
  has_any_store: false,
  has_tables: true,
};

const mockGenesisProps = (overrides: Partial<GenesisWizardProps> = {}): GenesisWizardProps => ({
  state: NOT_READY_GENESIS_STATE,
  onComplete: () => {},
  onCancel: () => {},
  running: false,
  error: null,
  onRun: async (params) => ({
    success: true,
    result: {
      success: true,
      message: 'UI Lab mock: setup complete (no data written).',
      username: params.username,
      store_code: params.storeCode,
    },
    newState: { ready: true, has_user_with_pin: true, has_any_store: true, has_tables: true },
  }),
  onValidateRestore: async () => ({ success: true, preview: MOCK_RESTORE_PREVIEW, error: null }),
  onStartRestore: async () => ({ success: true, error: null }),
  onGetRestoreProgress: async () => ({
    success: true,
    progress: MOCK_RESTORE_PROGRESS,
    error: null,
  }),
  onRestoreStarted: () => {},
  onCancelRestore: () => {},
  ...overrides,
});

const noSetActiveStore = (): void => {};

/** Providers every preview needs (react-query + store context), mirroring App.tsx. */
function LabFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <QueryClientProvider client={LAB_QUERY_CLIENT}>
      <StoreProvider activeStoreId="STORE-ALPHA" setActiveStoreId={noSetActiveStore}>
        <Suspense
          fallback={
            <div style={{ padding: 24 }}>
              <Skeleton width="60%" height={24} />
              <div style={{ marginTop: 16 }}>
                <Skeleton width="100%" height={120} />
              </div>
            </div>
          }
        >
          {children}
        </Suspense>
      </StoreProvider>
    </QueryClientProvider>
  );
}

function labRender(node: React.ReactNode): React.ReactElement {
  return <LabFrame>{node}</LabFrame>;
}

// ---------------------------------------------------------------------------
// Startup scenario renderers
// ---------------------------------------------------------------------------

/**
 * Splash/boot preview. invenTory has NO native splash window (tauri.conf.json
 * defines a single window), so this is a clearly-labelled visual preview of a
 * boot splash — it is not, and cannot be, a real cold-start test.
 */
export function SplashPreview(): React.ReactElement {
  return (
    <div
      data-testid="lab-splash-preview"
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: 'var(--it-bg)',
        padding: 32,
      }}
    >
      <div
        style={{
          width: 360,
          background: 'var(--it-card)',
          border: '1px solid var(--it-border)',
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <img src="/favicon.svg" alt="" aria-hidden="true" width={48} height={48} />
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--it-text-primary)' }}>
          inven-Tory
        </div>
        <div
          style={{
            fontSize: 11,
            fontFamily: 'var(--it-font-mono)',
            color: 'var(--it-text-disabled)',
          }}
        >
          Desktop client
        </div>
        <Spinner size="md" />
        <div style={{ fontSize: 13, color: 'var(--it-text-secondary)' }}>Starting…</div>
      </div>
      <div
        style={{
          maxWidth: 420,
          padding: '12px 16px',
          background: 'var(--amber-tint)',
          border: '1px solid var(--amber)',
          fontSize: 12,
          color: 'var(--amber-ink)',
          textAlign: 'center',
        }}
        data-testid="lab-splash-notice"
      >
        Visual preview only — invenTory has no native splash window. This does not run a real cold
        start.
      </div>
    </div>
  );
}

/** Mirrors the auth-loading branch in App.tsx renderView(). */
const AuthLoadingPreview = (): React.ReactElement => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--it-bg)',
      color: 'var(--it-text-secondary)',
      fontSize: '14px',
    }}
    data-testid="auth-loading"
  >
    Loading…
  </div>
);

/** Mirrors the app shell (Sidebar + Header + Dashboard) from App.tsx. */
const AppShellPreview = (): React.ReactElement =>
  labRender(
    <div className="app-container">
      <Sidebar currentView="dashboard" onNavigate={() => {}} />
      <div className="app-body">
        <Header
          stores={MOCK_STORES}
          activeStoreId="STORE-ALPHA"
          onSelectStore={() => {}}
          currentUser={MOCK_SESSION}
          onLogout={() => {}}
        />
        <main className="app-content">
          <DashboardView
            stores={MOCK_STORES}
            loading={false}
            error={null}
            onRetry={() => {}}
            userRole="GLOBAL_ADMIN"
          />
        </main>
      </div>
    </div>,
  );

const StartupDashboardError = (): React.ReactElement =>
  labRender(
    <DashboardView
      stores={[]}
      loading={false}
      error="Failed to load stores from database: connection refused"
      onRetry={() => {}}
      userRole="GLOBAL_ADMIN"
    />,
  );

// ---------------------------------------------------------------------------
// Design-system kit preview
// ---------------------------------------------------------------------------

function DesignSystemKit(): React.ReactElement {
  return (
    <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 720 }}>
      <Card>
        <h3 style={{ marginTop: 0 }}>Buttons</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" loading>
            Loading
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Form controls</h3>
        <TextInput label="Text input" placeholder="Type here" data-testid="kit-text-input" />
        <Select
          label="Select"
          options={[
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
          ]}
        />
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Badges &amp; status</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge status="ACTIVE" />
          <Badge status="PENDING" />
          <Badge status="SYNCED" />
          <Badge status="OFFLINE" />
        </div>
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Feedback</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <Skeleton width="100%" height={16} />
          <Skeleton width="70%" height={16} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner size="md" />
            <span style={{ fontSize: 13, color: 'var(--it-text-secondary)' }}>Spinner</span>
          </div>
          <EmptyState heading="Nothing here yet" body="EmptyState component used across views." />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type LabCategory =
  'Startup scenarios' | 'Screens' | 'Dialogs & overlays' | 'UI states' | 'Components';

export interface LabEntry {
  id: string;
  title: string;
  category: LabCategory;
  description: string;
  /** Extra search terms. */
  keywords?: string;
  /** Usable as a persisted startup scenario override. */
  startup?: boolean;
  /** Automatically switches the mock profile when this entry is previewed. */
  profile?: LabProfile;
  render: () => React.ReactElement;
}

export const LAB_CATEGORIES: LabCategory[] = [
  'Startup scenarios',
  'Screens',
  'Dialogs & overlays',
  'UI states',
  'Components',
];

export const LAB_ENTRIES: LabEntry[] = [
  // ── Startup scenarios ─────────────────────────────────────────────────────
  {
    id: 'splash',
    title: 'Splash / boot screen',
    category: 'Startup scenarios',
    description:
      'Boot splash visual. Preview only — the app has no native splash window, so this is not a cold-start test.',
    keywords: 'splash boot startup loading brand cold start',
    startup: true,
    render: () => <SplashPreview />,
  },
  {
    id: 'loading',
    title: 'Startup loading (auth check)',
    category: 'Startup scenarios',
    description: 'The auth-loading state App.tsx shows while genesis/auth bootstrap runs.',
    keywords: 'loading bootstrap auth startup spinner',
    startup: true,
    render: () => <AuthLoadingPreview />,
  },
  {
    id: 'login',
    title: 'Login',
    category: 'Startup scenarios',
    description:
      'Real LoginView. Submits against lab mocks: empty fields show validation, credentials succeed, error profile fails.',
    keywords: 'login sign in authentication auth credentials',
    startup: true,
    render: () => labRender(<LoginView deviceId="UI-LAB-DEVICE" onLoginSuccess={() => {}} />),
  },
  {
    id: 'first-run',
    title: 'First-run setup (path selection)',
    category: 'Startup scenarios',
    description: 'GenesisWizard path selection shown on a fresh install (no user/store yet).',
    keywords: 'first run genesis wizard onboarding selection setup',
    startup: true,
    render: () => labRender(<GenesisWizard {...mockGenesisProps()} />),
  },
  {
    id: 'register',
    title: 'Registration (account step)',
    category: 'Startup scenarios',
    description:
      'First-run account registration — the GenesisWizard fresh-setup account step (invenTory has no separate register screen).',
    keywords: 'register registration account create user password genesis',
    startup: true,
    render: () => labRender(<GenesisWizard {...mockGenesisProps({ initialMode: 'fresh' })} />),
  },
  {
    id: 'store-setup',
    title: 'Fresh-store setup (store step)',
    category: 'Startup scenarios',
    description: 'GenesisWizard fresh-setup store step — code, name and address.',
    keywords: 'store setup fresh create store genesis step',
    startup: true,
    render: () =>
      labRender(<GenesisWizard {...mockGenesisProps({ initialMode: 'fresh', initialStep: 1 })} />),
  },
  {
    id: 'restore',
    title: 'Server restore (connect step)',
    category: 'Startup scenarios',
    description:
      'GenesisWizard restore connect step. "Connect & Preview" runs against the mocked validate_restore_credentials.',
    keywords: 'restore server reconnect migrate preview credentials',
    startup: true,
    render: () => labRender(<GenesisWizard {...mockGenesisProps({ initialMode: 'restore' })} />),
  },
  {
    id: 'restore-progress',
    title: 'Server restore (in progress)',
    category: 'Startup scenarios',
    description: 'Restore progress step with mocked progress at 62%, including cancel affordance.',
    keywords: 'restore progress syncing migration loading 62',
    startup: true,
    render: () =>
      labRender(
        <GenesisWizard
          {...mockGenesisProps({
            initialMode: 'restore',
            initialStep: 2,
            restoreProgress: {
              phase: 'restoring',
              currentStep: 'Restoring products…',
              progressPercent: 62,
              criticalComplete: false,
              canUseApp: false,
              totalComplete: false,
            },
          })}
        />,
      ),
  },
  {
    id: 'startup-error',
    title: 'Startup failure (stores failed to load)',
    category: 'Startup scenarios',
    description: 'Authenticated boot that fails loading local stores — dashboard error state.',
    keywords: 'error failure startup crashed database load fail',
    startup: true,
    render: () => StartupDashboardError(),
  },
  {
    id: 'startup-success',
    title: 'Startup success (full app shell)',
    category: 'Startup scenarios',
    description:
      'The authenticated shell exactly as App.tsx composes it: Sidebar + Header + Dashboard.',
    keywords: 'success shell sidebar header dashboard authenticated home',
    startup: true,
    render: () => AppShellPreview(),
  },

  // ── Screens ───────────────────────────────────────────────────────────────
  {
    id: 'screen-dashboard',
    title: 'Dashboard',
    category: 'Screens',
    description: 'KPI dashboard with mocked analytics.',
    keywords: 'dashboard kpi analytics home',
    render: () =>
      labRender(
        <DashboardView
          stores={MOCK_STORES}
          loading={false}
          error={null}
          onRetry={() => {}}
          userRole="GLOBAL_ADMIN"
        />,
      ),
  },
  {
    id: 'screen-products',
    title: 'Products',
    category: 'Screens',
    description: 'Product catalogue. Use the empty/error/slow profiles for other states.',
    keywords: 'products catalogue inventory list',
    render: () => labRender(<ProductsView userRole="GLOBAL_ADMIN" />),
  },
  {
    id: 'screen-create-product',
    title: 'Create product',
    category: 'Screens',
    description: 'Product creation + CSV import entry screen.',
    keywords: 'create product import csv new',
    render: () => labRender(<CreateProductView />),
  },
  {
    id: 'screen-receive-stock',
    title: 'Receive stock',
    category: 'Screens',
    description: 'Goods-receipt entry workflow.',
    keywords: 'receive stock entry receipt purchase',
    render: () => labRender(<ReceiveStockView />),
  },
  {
    id: 'screen-sale-stock',
    title: 'Sale stock',
    category: 'Screens',
    description: 'Sales entry workflow.',
    keywords: 'sale stock sell pos checkout',
    render: () => labRender(<SaleStockView />),
  },
  {
    id: 'screen-return-stock',
    title: 'Return stock',
    category: 'Screens',
    description: 'Customer/ supplier return workflow.',
    keywords: 'return stock refund rma',
    render: () => labRender(<ReturnStockView />),
  },
  {
    id: 'screen-transfer-stock',
    title: 'Transfer stock',
    category: 'Screens',
    description: 'Inter-store transfer workflow.',
    keywords: 'transfer stock move store',
    render: () => labRender(<TransferStockView />),
  },
  {
    id: 'screen-damage-quarantine',
    title: 'Damage / quarantine',
    category: 'Screens',
    description: 'Damage and quarantine bucket moves.',
    keywords: 'damage quarantine broken writeoff',
    render: () => labRender(<DamageQuarantineView />),
  },
  {
    id: 'screen-physical-count',
    title: 'Physical count',
    category: 'Screens',
    description: 'Stock count and adjustment workflow.',
    keywords: 'physical count adjustment audit inventory count',
    render: () => labRender(<PhysicalCountAdjustmentView userRole="GLOBAL_ADMIN" />),
  },
  {
    id: 'screen-day-books',
    title: 'Day books',
    category: 'Screens',
    description: 'Daily ledger books across stores.',
    keywords: 'day books ledger history journal',
    render: () => labRender(<DayBooksView stores={MOCK_STORES} />),
  },
  {
    id: 'screen-transactions',
    title: 'Transactions',
    category: 'Screens',
    description: 'Transaction history list.',
    keywords: 'transactions history list movements',
    render: () => labRender(<TransactionsView />),
  },
  {
    id: 'screen-settings',
    title: 'Settings',
    category: 'Screens',
    description: 'Settings screen with mocked session user.',
    keywords: 'settings profile backups update theme account',
    render: () => labRender(<SettingsView currentUser={MOCK_SESSION} onLogout={() => {}} />),
  },

  // ── Dialogs & overlays ────────────────────────────────────────────────────
  {
    id: 'dialog-global-search',
    title: 'Global search modal',
    category: 'Dialogs & overlays',
    description: 'Cross-store product search dialog with mocked results.',
    keywords: 'search modal dialog global find',
    render: () => labRender(<GlobalSearchModal isOpen onClose={() => {}} stores={MOCK_STORES} />),
  },
  {
    id: 'dialog-product-create',
    title: 'Product modal — create',
    category: 'Dialogs & overlays',
    description: 'Create-product dialog (empty form, real validation).',
    keywords: 'product modal create dialog new',
    render: () =>
      labRender(
        <ProductModal
          isOpen
          product={null}
          onClose={() => {}}
          onSubmitCreate={async () => {}}
          onSubmitUpdate={async () => {}}
        />,
      ),
  },
  {
    id: 'dialog-product-edit',
    title: 'Product modal — edit',
    category: 'Dialogs & overlays',
    description: 'Edit-product dialog prefilled with a mock product.',
    keywords: 'product modal edit dialog update',
    render: () =>
      labRender(
        <ProductModal
          isOpen
          product={MOCK_PRODUCTS[1]}
          onClose={() => {}}
          onSubmitCreate={async () => {}}
          onSubmitUpdate={async () => {}}
        />,
      ),
  },
  {
    id: 'dialog-store-create',
    title: 'Store modal — create',
    category: 'Dialogs & overlays',
    description: 'Create-store dialog (empty form, real validation).',
    keywords: 'store modal create dialog new',
    render: () =>
      labRender(
        <StoreModal
          isOpen
          store={null}
          onClose={() => {}}
          onSubmitCreate={async () => {}}
          onSubmitUpdate={async () => {}}
        />,
      ),
  },
  {
    id: 'dialog-device-registration',
    title: 'Device registration modal',
    category: 'Dialogs & overlays',
    description: 'Legacy device registration dialog (not used by the current flow).',
    keywords: 'device register modal legacy',
    render: () =>
      labRender(
        <DeviceRegistrationModal
          isOpen
          store={MOCK_STORES[0]}
          onClose={() => {}}
          onRegisterDevice={async () => {}}
        />,
      ),
  },
  {
    id: 'banner-offline-auth',
    title: 'Offline auth banner',
    category: 'Dialogs & overlays',
    description: 'Expired-token-while-offline re-auth banner shown above the app content.',
    keywords: 'offline auth banner expired token reauth',
    render: () =>
      labRender(
        <div style={{ padding: 24 }}>
          <OfflineAuthBanner username="admin" deviceId="UI-LAB-DEVICE" onReauthSuccess={() => {}} />
        </div>,
      ),
  },

  // ── UI states ─────────────────────────────────────────────────────────────
  {
    id: 'state-loading',
    title: 'Loading state (dashboard)',
    category: 'UI states',
    description: 'Dashboard while store data is still loading.',
    keywords: 'loading skeleton busy pending',
    render: () =>
      labRender(
        <DashboardView
          stores={[]}
          loading
          error={null}
          onRetry={() => {}}
          userRole="GLOBAL_ADMIN"
        />,
      ),
  },
  {
    id: 'state-error',
    title: 'Error state (dashboard)',
    category: 'UI states',
    description: 'Dashboard data load failure with retry.',
    keywords: 'error failure retry failed',
    render: () =>
      labRender(
        <DashboardView
          stores={MOCK_STORES}
          loading={false}
          error="Failed to load dashboard analytics: disk I/O error"
          onRetry={() => {}}
          userRole="GLOBAL_ADMIN"
        />,
      ),
  },
  {
    id: 'state-empty',
    title: 'Empty state (products, empty profile)',
    category: 'UI states',
    description: 'Products screen against empty mock responses — switches profile to "empty".',
    keywords: 'empty zero no data blank',
    profile: 'empty',
    render: () => labRender(<ProductsView userRole="GLOBAL_ADMIN" />),
  },
  {
    id: 'state-failure',
    title: 'Failure state (products, error profile)',
    category: 'UI states',
    description: 'Products screen when every command fails — switches profile to "error".',
    keywords: 'error failure crash reject',
    profile: 'error',
    render: () => labRender(<ProductsView userRole="GLOBAL_ADMIN" />),
  },
  {
    id: 'state-slow',
    title: 'Slow loading (products, slow profile)',
    category: 'UI states',
    description: 'Products screen with 1.2s delayed responses — switches profile to "slow".',
    keywords: 'slow loading latency delay pending',
    profile: 'slow',
    render: () => labRender(<ProductsView userRole="GLOBAL_ADMIN" />),
  },

  // ── Components ────────────────────────────────────────────────────────────
  {
    id: 'kit-design-system',
    title: 'Design system kit (@invenTory/ui)',
    category: 'Components',
    description: 'Shared primitives: buttons, inputs, badges, skeleton, spinner, empty state.',
    keywords: 'kit design system primitives ui components badge button input',
    render: () => <DesignSystemKit />,
  },
];

export function findLabEntry(entryId: string | null): LabEntry | null {
  if (!entryId) return null;
  return LAB_ENTRIES.find((e) => e.id === entryId) ?? null;
}
