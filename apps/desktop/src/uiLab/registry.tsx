/**
 * UI Lab registry — DEVELOPMENT ONLY (loaded exclusively from UiLab.tsx,
 * which itself is only mounted when `import.meta.env.DEV` is true).
 *
 * Every entry renders the application's REAL components with isolated mock
 * props/handlers — no production data, no database, no server. Screen and
 * dialog previews are wrapped in LabShell, which mirrors App.tsx's DOM
 * composition (Sidebar + Header + app-content + it-view-enter) so each
 * component appears in its true on-screen placement. Startup scenario
 * entries are also what the lab overrides the app boot with when
 * "Use as startup scenario" is active.
 *
 * UiLabCoverage.test.ts fails if a view/component file exists without a
 * LAB_ENTRIES entry that lists it in `sources` — new components must be
 * registered here.
 */

import React, { Suspense, lazy, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PDFViewer } from '@react-pdf/renderer';
import { Store as StoreIcon } from 'lucide-react';
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
import { ProductPicker } from '../components/ProductPicker';
import { CategoryDonutChart } from '../components/CategoryDonutChart';
import { StockTrendChart } from '../components/StockTrendChart';
import { StockStatusStackedBarChart } from '../components/StockStatusStackedBarChart';
import { BalanceSheetPdf } from '../components/BalanceSheetPdf';
import {
  Button,
  Badge,
  Card,
  TextInput,
  NumericInput,
  Select,
  Spinner,
  EmptyState,
  Skeleton,
  SkeletonTable,
  DataTable,
  type ColumnDef,
  StepIndicator,
  Tooltip,
  Modal,
  ThemeToggle,
  LiveSearchPanel,
  LinearEntryForm,
  LinearGridEntry,
  SplashScreen,
  useToast,
  type FieldDef,
  type GridFieldDef,
  type SearchResultItem,
} from '@invenTory/ui';
import type { AuthSession } from '../types/auth';
import type {
  CategoryDistributionPoint,
  StockStatusCategoryRow,
  StockTrendPoint,
} from '../types/dashboard';
import type { BalanceSheetRow } from '../utils/balanceSheetUtils';
import { type NavView } from '../config/navigation';
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

// Design-system kit / chart / document fixtures --------------------------------

const KIT_TABLE_ROWS = [
  { id: 'r1', product: 'Sony 55 Inch TV', qty: 10 },
  { id: 'r2', product: 'Apple iPhone 15 Pro 256GB', qty: 0 },
  { id: 'r3', product: 'Sony WH-1000XM5 Headphones', qty: 24 },
];

const KIT_TABLE_COLUMNS: ColumnDef<(typeof KIT_TABLE_ROWS)[number]>[] = [
  { key: 'product', header: 'Product' },
  { key: 'qty', header: 'Qty', numeric: true, sortable: true },
];

const KIT_TREND: StockTrendPoint[] = [
  { date: '2026-10-09', total_stock_units: 1180 },
  { date: '2026-10-10', total_stock_units: 1245 },
  { date: '2026-10-11', total_stock_units: 1218 },
  { date: '2026-10-12', total_stock_units: 1310 },
  { date: '2026-10-13', total_stock_units: 1284 },
  { date: '2026-10-14', total_stock_units: 1352 },
];

const KIT_CATEGORIES: CategoryDistributionPoint[] = [
  { category: 'Electronics', count: 42, percentage: 34 },
  { category: 'Appliances', count: 31, percentage: 25 },
  { category: 'Smartphones', count: 26, percentage: 21 },
  { category: 'Audio', count: 15, percentage: 12 },
  { category: 'Accessories', count: 10, percentage: 8 },
];

const KIT_STATUS: StockStatusCategoryRow[] = [
  { category: 'Electronics', in_stock: 30, low_stock: 8, out_of_stock: 4, total: 42 },
  { category: 'Appliances', in_stock: 24, low_stock: 5, out_of_stock: 2, total: 31 },
  { category: 'Smartphones', in_stock: 14, low_stock: 6, out_of_stock: 6, total: 26 },
  { category: 'Audio', in_stock: 12, low_stock: 2, out_of_stock: 1, total: 15 },
];

const KIT_BALANCE_ROWS: BalanceSheetRow[] = [
  {
    productId: 'PROD-001',
    productName: 'Hisense 120L Refrigerator',
    sku: 'ELEC-001',
    openingBalance: 10,
    cumulativeIn: 6,
    cumulativeOut: 4,
    closingBalance: 12,
  },
  {
    productId: 'PROD-TV-55',
    productName: 'Sony 55 Inch TV',
    sku: 'TV-55-SONY',
    openingBalance: 8,
    cumulativeIn: 4,
    cumulativeOut: 5,
    closingBalance: 7,
  },
  {
    productId: 'PROD-IPHONE',
    productName: 'Apple iPhone 15 Pro 256GB',
    sku: 'ELEC-IPHONE15PRO',
    openingBalance: 5,
    cumulativeIn: 2,
    cumulativeOut: 5,
    closingBalance: 2,
  },
];

// ---------------------------------------------------------------------------
// Frames — mirror App.tsx's exact DOM composition
// ---------------------------------------------------------------------------

/** Overrides .app-container's 100vh/100vw so the shell fits the preview pane. */
const SHELL_STYLE: React.CSSProperties = { height: '100%', width: '100%' };

function LabSkeleton(): React.ReactElement {
  return (
    <div style={{ padding: 24 }}>
      <Skeleton width="60%" height={24} />
      <div style={{ marginTop: 16 }}>
        <Skeleton width="100%" height={120} />
      </div>
    </div>
  );
}

/** Base providers every preview needs (react-query + store context), mirroring App.tsx. */
function LabFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <QueryClientProvider client={LAB_QUERY_CLIENT}>
      <StoreProvider activeStoreId="STORE-ALPHA" setActiveStoreId={noSetActiveStore}>
        <Suspense fallback={<LabSkeleton />}>{children}</Suspense>
      </StoreProvider>
    </QueryClientProvider>
  );
}

function labRender(node: React.ReactNode): React.ReactElement {
  return <LabFrame>{node}</LabFrame>;
}

interface LabShellProps {
  currentView: NavView;
  /** Rendered inside main.app-content, above the view (OfflineAuthBanner). */
  banner?: React.ReactNode;
  /** Rendered inside app-container before the Sidebar (store-switch overlay). */
  overlay?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The authenticated app shell exactly as App.tsx composes it:
 * app-container > Sidebar > app-body > Header > app-content > StoreProvider >
 * it-view-enter > view. Dialogs/overlays placed via `overlay`/`banner` sit
 * where the real app puts them.
 */
function LabShell({ currentView, banner, overlay, children }: LabShellProps): React.ReactElement {
  return (
    <QueryClientProvider client={LAB_QUERY_CLIENT}>
      <div className="app-container" data-testid="lab-shell" style={SHELL_STYLE}>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {overlay}
        <Sidebar currentView={currentView} onNavigate={() => {}} />
        <div className="app-body">
          <Header
            stores={MOCK_STORES}
            activeStoreId="STORE-ALPHA"
            onSelectStore={() => {}}
            currentUser={MOCK_SESSION}
            onLogout={() => {}}
          />
          <main className="app-content" id="main-content" tabIndex={-1}>
            {banner}
            <StoreProvider activeStoreId="STORE-ALPHA" setActiveStoreId={noSetActiveStore}>
              <div className="it-view-enter">
                <Suspense fallback={<LabSkeleton />}>{children}</Suspense>
              </div>
            </StoreProvider>
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}

/** The unauthenticated placement: app-container > app-body > app-content (no Sidebar/Header). */
function labUnauthFrame(children: React.ReactNode): React.ReactElement {
  return labRender(
    <div className="app-container" style={SHELL_STYLE}>
      <div className="app-body">
        <main className="app-content" id="main-content" tabIndex={-1}>
          <div className="it-view-enter">{children}</div>
        </main>
      </div>
    </div>,
  );
}

/** GenesisWizard placement: direct child of app-container (App.tsx showGenesis branch). */
function labGenesisFrame(children: React.ReactNode): React.ReactElement {
  return labRender(
    <div className="app-container" style={SHELL_STYLE}>
      {children}
    </div>,
  );
}

// ---------------------------------------------------------------------------
// Startup scenario renderers
// ---------------------------------------------------------------------------

/**
 * Splash/boot preview — renders the REAL SplashScreen component that
 * App.tsx and the web app show during startup. Shown here as a preview
 * only: it does not exercise a real cold start of the packaged app.
 */
export function SplashPreview(): React.ReactElement {
  return (
    <div data-testid="lab-splash-preview" style={{ height: '100%' }}>
      <SplashScreen />
      <div
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 56,
          transform: 'translateX(-50%)',
          zIndex: 101,
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
        Preview of the app's real startup splash — not a cold-start test of the packaged app.
      </div>
    </div>
  );
}

/** Mirrors the auth-loading branch in App.tsx renderView(). */
const AuthLoadingPreview = (): React.ReactElement => (
  <div data-testid="auth-loading">
    <SplashScreen />
  </div>
);

/** Static mirror of App.tsx's store-switch overlay (switchingStore.active). */
const StoreSwitchOverlayPreview = (): React.ReactElement => (
  <div className="store-switch-overlay" data-testid="store-switch-overlay">
    <div className="store-switch-modal">
      <div className="store-switch-spinner-container">
        <div className="store-switch-spinner-ring" />
        <div className="store-switch-spinner-core">
          <StoreIcon size={22} />
        </div>
      </div>
      <h3 className="store-switch-title">Switching Store</h3>
      <p className="store-switch-target">
        {MOCK_STORES[0].name} <span className="store-switch-badge">{MOCK_STORES[0].code}</span>
      </p>
      <p className="store-switch-subtitle">Refreshing inventory ledger and localized data...</p>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Component previews
// ---------------------------------------------------------------------------

const ChartsPreview = (): React.ReactElement => (
  <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 960 }}>
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Stock trend</h3>
      <StockTrendChart data={KIT_TREND} height={240} testId="kit-stock-trend" />
    </div>
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Stock status by category</h3>
      <StockStatusStackedBarChart data={KIT_STATUS} height={240} testId="kit-stock-status" />
    </div>
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Category distribution</h3>
      <CategoryDonutChart
        data={KIT_CATEGORIES}
        totalProducts={KIT_CATEGORIES.reduce((sum, c) => sum + c.count, 0)}
        height={260}
        testId="kit-category-donut"
      />
    </div>
  </div>
);

const BalanceSheetPreview = (): React.ReactElement => (
  <div style={{ height: '100%', minHeight: 480 }}>
    <PDFViewer style={{ width: '100%', height: '100%' }}>
      <BalanceSheetPdf
        rows={KIT_BALANCE_ROWS}
        generatedAt={new Date().toISOString()}
        storeName="Alpha Store"
        bookDate="2026-10-15"
      />
    </PDFViewer>
  </div>
);

function DesignSystemKit(): React.ReactElement {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [kitQty, setKitQty] = useState(3);

  const kitResults: SearchResultItem[] = MOCK_PRODUCTS.slice(0, 4).map((p) => ({
    id: p.id,
    label: p.name,
    subtitle: p.sku,
  }));

  const kitFields: FieldDef[] = [
    { id: 'product', type: 'text', label: 'Product', placeholder: 'Scan or type…' },
    { id: 'qty', type: 'number', label: 'Quantity', defaultValue: 1 },
  ];

  const kitGridFields: GridFieldDef[] = [
    { id: 'product', type: 'text', label: 'Product', placeholder: 'Scan or type…' },
    { id: 'qty', type: 'number', label: 'Qty', defaultValue: 1 },
  ];

  return (
    <div
      data-testid="kit-design-system"
      style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 760 }}
    >
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
        <div style={{ display: 'grid', gap: 12 }}>
          <TextInput label="Text input" placeholder="Type here" data-testid="kit-text-input" />
          <NumericInput
            label="Numeric input"
            value={kitQty}
            onChange={setKitQty}
            data-testid="kit-numeric-input"
          />
          <Select
            label="Select"
            options={[
              { value: 'a', label: 'Option A' },
              { value: 'b', label: 'Option B' },
            ]}
          />
        </div>
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
        <h3 style={{ marginTop: 0 }}>Feedback &amp; loading</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <Skeleton width="100%" height={16} />
          <Skeleton width="70%" height={16} />
          <SkeletonTable />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner size="md" />
            <span style={{ fontSize: 13, color: 'var(--it-text-secondary)' }}>Spinner</span>
          </div>
          <EmptyState heading="Nothing here yet" body="EmptyState component used across views." />
        </div>
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Table (DataTable)</h3>
        <DataTable
          columns={KIT_TABLE_COLUMNS}
          rows={KIT_TABLE_ROWS}
          rowKey={(row) => row.id}
          data-testid="kit-table"
        />
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Step indicator</h3>
        <StepIndicator
          steps={[
            { id: 's1', label: 'Products' },
            { id: 's2', label: 'Details' },
            { id: 's3', label: 'Review' },
          ]}
          currentStepIndex={1}
        />
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Theme toggle</h3>
        <ThemeToggle />
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Toast</h3>
        <Button variant="secondary" onClick={() => toast('success', 'Kit toast demo')}>
          Fire toast
        </Button>
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Tooltip &amp; modal</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tooltip content="Tooltip content">
            <Button variant="ghost">Hover me</Button>
          </Tooltip>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
        </div>
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Kit modal" size="sm">
          <p style={{ margin: 0, fontSize: 13, color: 'var(--it-text-secondary)' }}>
            Shared Modal component — real focus trap and Escape handling.
          </p>
        </Modal>
      </Card>
      <Card>
        <h3 style={{ marginTop: 0 }}>Live search panel</h3>
        <TextInput
          label="Search products"
          placeholder="Type to search"
          data-testid="kit-live-search-input"
        />
        <LiveSearchPanel
          query="s"
          results={kitResults}
          onSelect={() => {}}
          highlightedIndex={highlighted}
          onHighlightedIndexChange={setHighlighted}
          dataTestid="kit-live-search"
        />
      </Card>
      <Card noPad>
        <div style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Linear entry form</h3>
        </div>
        <LinearEntryForm
          fields={kitFields}
          onCommit={() => {}}
          title="Entry form"
          subtitle="Keyboard-first single-row entry"
          dataTestid="kit-linear-form"
        />
      </Card>
      <Card noPad>
        <div style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Linear grid entry</h3>
        </div>
        <LinearGridEntry
          fields={kitGridFields}
          onCommitRow={() => {}}
          onSearch={() => {}}
          onBarcodeScan={() => {}}
          searchResults={[]}
          initialRowCount={2}
          dataTestid="kit-grid-entry"
        />
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
  /**
   * Source files (basenames) this entry previews. UiLabCoverage.test.ts fails
   * when a view/component file isn't listed in any entry — required for new
   * components.
   */
  sources?: string[];
  render: () => React.ReactElement;
}

export const LAB_CATEGORIES: LabCategory[] = [
  'Startup scenarios',
  'Screens',
  'Dialogs & overlays',
  'UI states',
  'Components',
];

const DASHBOARD_PROPS = {
  stores: MOCK_STORES,
  loading: false,
  error: null,
  onRetry: () => {},
  userRole: 'GLOBAL_ADMIN',
} as const;

const DASHBOARD_CHILD = (
  <DashboardView
    stores={DASHBOARD_PROPS.stores}
    loading={DASHBOARD_PROPS.loading}
    error={DASHBOARD_PROPS.error}
    onRetry={DASHBOARD_PROPS.onRetry}
    userRole={DASHBOARD_PROPS.userRole}
  />
);

export const LAB_ENTRIES: LabEntry[] = [
  // ── Startup scenarios ─────────────────────────────────────────────────────
  {
    id: 'splash',
    title: 'Splash / boot screen',
    category: 'Startup scenarios',
    description:
      'The real SplashScreen component App.tsx and the web app render during startup. Preview only — not a cold-start test.',
    keywords: 'splash boot startup loading brand cold start',
    startup: true,
    sources: ['SplashScreen.tsx'],
    render: () => <SplashPreview />,
  },
  {
    id: 'loading',
    title: 'Startup loading (auth check)',
    category: 'Startup scenarios',
    description: 'The auth-loading branch App.tsx shows while genesis/auth bootstrap runs.',
    keywords: 'loading bootstrap auth startup spinner',
    startup: true,
    sources: ['SplashScreen.tsx'],
    render: () => <AuthLoadingPreview />,
  },
  {
    id: 'login',
    title: 'Login',
    category: 'Startup scenarios',
    description:
      'Real LoginView in its true unauthenticated placement (app-content, no Sidebar/Header). Submits against lab mocks: empty fields show validation, credentials succeed, error profile fails.',
    keywords: 'login sign in authentication auth credentials',
    startup: true,
    sources: ['LoginView.tsx'],
    render: () => labUnauthFrame(<LoginView deviceId="UI-LAB-DEVICE" onLoginSuccess={() => {}} />),
  },
  {
    id: 'first-run',
    title: 'First-run setup (path selection)',
    category: 'Startup scenarios',
    description: 'GenesisWizard path selection shown on a fresh install (no user/store yet).',
    keywords: 'first run genesis wizard onboarding selection setup',
    startup: true,
    sources: ['GenesisWizard.tsx'],
    render: () => labGenesisFrame(<GenesisWizard {...mockGenesisProps()} />),
  },
  {
    id: 'register',
    title: 'Registration (account step)',
    category: 'Startup scenarios',
    description:
      'First-run account registration — the GenesisWizard fresh-setup account step (invenTory has no separate register screen).',
    keywords: 'register registration account create user password genesis',
    startup: true,
    sources: ['GenesisWizard.tsx'],
    render: () =>
      labGenesisFrame(<GenesisWizard {...mockGenesisProps({ initialMode: 'fresh' })} />),
  },
  {
    id: 'store-setup',
    title: 'Fresh-store setup (store step)',
    category: 'Startup scenarios',
    description: 'GenesisWizard fresh-setup store step — code, name and address.',
    keywords: 'store setup fresh create store genesis step',
    startup: true,
    sources: ['GenesisWizard.tsx'],
    render: () =>
      labGenesisFrame(
        <GenesisWizard {...mockGenesisProps({ initialMode: 'fresh', initialStep: 1 })} />,
      ),
  },
  {
    id: 'restore',
    title: 'Server restore (connect step)',
    category: 'Startup scenarios',
    description:
      'GenesisWizard restore connect step. "Connect & Preview" runs against the mocked validate_restore_credentials.',
    keywords: 'restore server reconnect migrate preview credentials',
    startup: true,
    sources: ['GenesisWizard.tsx'],
    render: () =>
      labGenesisFrame(<GenesisWizard {...mockGenesisProps({ initialMode: 'restore' })} />),
  },
  {
    id: 'restore-progress',
    title: 'Server restore (in progress)',
    category: 'Startup scenarios',
    description: 'Restore progress step with mocked progress at 62%, including cancel affordance.',
    keywords: 'restore progress syncing migration loading 62',
    startup: true,
    sources: ['GenesisWizard.tsx'],
    render: () =>
      labGenesisFrame(
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
    sources: ['DashboardView.tsx'],
    render: () => (
      <LabShell currentView="dashboard">
        <DashboardView
          stores={[]}
          loading={false}
          error="Failed to load stores from database: connection refused"
          onRetry={() => {}}
          userRole="GLOBAL_ADMIN"
        />
      </LabShell>
    ),
  },
  {
    id: 'startup-success',
    title: 'Startup success (full app shell)',
    category: 'Startup scenarios',
    description:
      'The authenticated shell exactly as App.tsx composes it: Sidebar + Header + Dashboard.',
    keywords: 'success shell sidebar header dashboard authenticated home',
    startup: true,
    sources: ['Sidebar.tsx', 'Header.tsx', 'DashboardView.tsx'],
    render: () => <LabShell currentView="dashboard">{DASHBOARD_CHILD}</LabShell>,
  },

  // ── Screens ───────────────────────────────────────────────────────────────
  {
    id: 'screen-dashboard',
    title: 'Dashboard',
    category: 'Screens',
    description: 'KPI dashboard in the app shell with mocked analytics.',
    keywords: 'dashboard kpi analytics home',
    sources: ['DashboardView.tsx'],
    render: () => <LabShell currentView="dashboard">{DASHBOARD_CHILD}</LabShell>,
  },
  {
    id: 'screen-products',
    title: 'Products',
    category: 'Screens',
    description:
      'Product catalogue in the app shell. Use the empty/error/slow profiles for states.',
    keywords: 'products catalogue inventory list',
    sources: ['ProductsView.tsx'],
    render: () => (
      <LabShell currentView="products">
        <ProductsView userRole="GLOBAL_ADMIN" />
      </LabShell>
    ),
  },
  {
    id: 'screen-create-product',
    title: 'Create product',
    category: 'Screens',
    description: 'Product creation + CSV import entry screen.',
    keywords: 'create product import csv new',
    sources: ['CreateProductView.tsx'],
    render: () => (
      <LabShell currentView="create_product">
        <CreateProductView />
      </LabShell>
    ),
  },
  {
    id: 'screen-receive-stock',
    title: 'Receive stock',
    category: 'Screens',
    description: 'Goods-receipt entry workflow.',
    keywords: 'receive stock entry receipt purchase',
    sources: ['ReceiveStockView.tsx'],
    render: () => (
      <LabShell currentView="receive_stock">
        <ReceiveStockView />
      </LabShell>
    ),
  },
  {
    id: 'screen-sale-stock',
    title: 'Sale stock',
    category: 'Screens',
    description: 'Sales entry workflow.',
    keywords: 'sale stock sell pos checkout',
    sources: ['SaleStockView.tsx'],
    render: () => (
      <LabShell currentView="sale_stock">
        <SaleStockView />
      </LabShell>
    ),
  },
  {
    id: 'screen-return-stock',
    title: 'Return stock',
    category: 'Screens',
    description: 'Customer/ supplier return workflow.',
    keywords: 'return stock refund rma',
    sources: ['ReturnStockView.tsx'],
    render: () => (
      <LabShell currentView="return_stock">
        <ReturnStockView />
      </LabShell>
    ),
  },
  {
    id: 'screen-transfer-stock',
    title: 'Transfer stock',
    category: 'Screens',
    description: 'Inter-store transfer workflow.',
    keywords: 'transfer stock move store',
    sources: ['TransferStockView.tsx'],
    render: () => (
      <LabShell currentView="transfer_stock">
        <TransferStockView />
      </LabShell>
    ),
  },
  {
    id: 'screen-damage-quarantine',
    title: 'Damage / quarantine',
    category: 'Screens',
    description: 'Damage and quarantine bucket moves.',
    keywords: 'damage quarantine broken writeoff',
    sources: ['DamageQuarantineView.tsx'],
    render: () => (
      <LabShell currentView="damage_quarantine">
        <DamageQuarantineView />
      </LabShell>
    ),
  },
  {
    id: 'screen-physical-count',
    title: 'Physical count',
    category: 'Screens',
    description: 'Stock count and adjustment workflow.',
    keywords: 'physical count adjustment audit inventory count',
    sources: ['PhysicalCountAdjustmentView.tsx'],
    render: () => (
      <LabShell currentView="physical_count">
        <PhysicalCountAdjustmentView userRole="GLOBAL_ADMIN" />
      </LabShell>
    ),
  },
  {
    id: 'screen-day-books',
    title: 'Day books',
    category: 'Screens',
    description: 'Daily ledger books across stores.',
    keywords: 'day books ledger history journal',
    sources: ['DayBooksView.tsx'],
    render: () => (
      <LabShell currentView="day_books">
        <DayBooksView stores={MOCK_STORES} />
      </LabShell>
    ),
  },
  {
    id: 'screen-transactions',
    title: 'Transactions',
    category: 'Screens',
    description: 'Transaction history list.',
    keywords: 'transactions history list movements',
    sources: ['TransactionsView.tsx'],
    render: () => (
      <LabShell currentView="transactions">
        <TransactionsView />
      </LabShell>
    ),
  },
  {
    id: 'screen-settings',
    title: 'Settings',
    category: 'Screens',
    description: 'Settings screen with mocked session user.',
    keywords: 'settings profile backups update theme account',
    sources: ['SettingsView.tsx'],
    render: () => (
      <LabShell currentView="settings">
        <SettingsView currentUser={MOCK_SESSION} onLogout={() => {}} />
      </LabShell>
    ),
  },

  // ── Dialogs & overlays ────────────────────────────────────────────────────
  {
    id: 'dialog-global-search',
    title: 'Global search modal',
    category: 'Dialogs & overlays',
    description:
      'Cross-store product search dialog with mocked results — over the shell, where Header opens it.',
    keywords: 'search modal dialog global find',
    sources: ['GlobalSearchModal.tsx'],
    render: () => (
      <LabShell
        currentView="dashboard"
        overlay={<GlobalSearchModal isOpen onClose={() => {}} stores={MOCK_STORES} />}
      >
        {DASHBOARD_CHILD}
      </LabShell>
    ),
  },
  {
    id: 'dialog-product-create',
    title: 'Product modal — create',
    category: 'Dialogs & overlays',
    description:
      'Create-product dialog over ProductsView (its real host) — empty form, real validation.',
    keywords: 'product modal create dialog new',
    sources: ['ProductModal.tsx'],
    render: () => (
      <LabShell
        currentView="products"
        overlay={
          <ProductModal
            isOpen
            product={null}
            onClose={() => {}}
            onSubmitCreate={async () => {}}
            onSubmitUpdate={async () => {}}
          />
        }
      >
        <ProductsView userRole="GLOBAL_ADMIN" />
      </LabShell>
    ),
  },
  {
    id: 'dialog-product-edit',
    title: 'Product modal — edit',
    category: 'Dialogs & overlays',
    description: 'Edit-product dialog prefilled with a mock product, over ProductsView.',
    keywords: 'product modal edit dialog update',
    sources: ['ProductModal.tsx'],
    render: () => (
      <LabShell
        currentView="products"
        overlay={
          <ProductModal
            isOpen
            product={MOCK_PRODUCTS[1]}
            onClose={() => {}}
            onSubmitCreate={async () => {}}
            onSubmitUpdate={async () => {}}
          />
        }
      >
        <ProductsView userRole="GLOBAL_ADMIN" />
      </LabShell>
    ),
  },
  {
    id: 'dialog-store-create',
    title: 'Store modal — create',
    category: 'Dialogs & overlays',
    description:
      'Create-store dialog over Settings (where store management lives) — real validation.',
    keywords: 'store modal create dialog new',
    sources: ['StoreModal.tsx'],
    render: () => (
      <LabShell
        currentView="settings"
        overlay={
          <StoreModal
            isOpen
            store={null}
            onClose={() => {}}
            onSubmitCreate={async () => {}}
            onSubmitUpdate={async () => {}}
          />
        }
      >
        <SettingsView currentUser={MOCK_SESSION} onLogout={() => {}} />
      </LabShell>
    ),
  },
  {
    id: 'dialog-device-registration',
    title: 'Device registration modal',
    category: 'Dialogs & overlays',
    description: 'Legacy device registration dialog (not used by the current flow).',
    keywords: 'device register modal legacy',
    sources: ['DeviceRegistrationModal.tsx'],
    render: () => (
      <LabShell
        currentView="dashboard"
        overlay={
          <DeviceRegistrationModal
            isOpen
            store={MOCK_STORES[0]}
            onClose={() => {}}
            onRegisterDevice={async () => {}}
          />
        }
      >
        {DASHBOARD_CHILD}
      </LabShell>
    ),
  },
  {
    id: 'banner-offline-auth',
    title: 'Offline auth banner',
    category: 'Dialogs & overlays',
    description:
      'Expired-token-while-offline re-auth banner — top of app-content, exactly where App.tsx renders it.',
    keywords: 'offline auth banner expired token reauth',
    sources: ['OfflineAuthBanner.tsx'],
    render: () => (
      <LabShell
        currentView="dashboard"
        banner={
          <OfflineAuthBanner username="admin" deviceId="UI-LAB-DEVICE" onReauthSuccess={() => {}} />
        }
      >
        {DASHBOARD_CHILD}
      </LabShell>
    ),
  },
  {
    id: 'overlay-store-switch',
    title: 'Store switching overlay',
    category: 'Dialogs & overlays',
    description: 'The full-screen "Switching Store" overlay App.tsx shows while swapping stores.',
    keywords: 'store switch overlay changing refresh loading',
    render: () => (
      <LabShell currentView="dashboard" overlay={<StoreSwitchOverlayPreview />}>
        {DASHBOARD_CHILD}
      </LabShell>
    ),
  },

  // ── UI states ─────────────────────────────────────────────────────────────
  {
    id: 'state-loading',
    title: 'Loading state (dashboard)',
    category: 'UI states',
    description: 'Dashboard in the shell while store data is still loading.',
    keywords: 'loading skeleton busy pending',
    sources: ['DashboardView.tsx'],
    render: () => (
      <LabShell currentView="dashboard">
        <DashboardView
          stores={[]}
          loading
          error={null}
          onRetry={() => {}}
          userRole="GLOBAL_ADMIN"
        />
      </LabShell>
    ),
  },
  {
    id: 'state-error',
    title: 'Error state (dashboard)',
    category: 'UI states',
    description: 'Dashboard data load failure with retry, in the shell.',
    keywords: 'error failure retry failed',
    sources: ['DashboardView.tsx'],
    render: () => (
      <LabShell currentView="dashboard">
        <DashboardView
          stores={MOCK_STORES}
          loading={false}
          error="Failed to load dashboard analytics: disk I/O error"
          onRetry={() => {}}
          userRole="GLOBAL_ADMIN"
        />
      </LabShell>
    ),
  },
  {
    id: 'state-empty',
    title: 'Empty state (products, empty profile)',
    category: 'UI states',
    description: 'Products screen against empty mock responses — switches profile to "empty".',
    keywords: 'empty zero no data blank',
    profile: 'empty',
    sources: ['ProductsView.tsx'],
    render: () => (
      <LabShell currentView="products">
        <ProductsView userRole="GLOBAL_ADMIN" />
      </LabShell>
    ),
  },
  {
    id: 'state-failure',
    title: 'Failure state (products, error profile)',
    category: 'UI states',
    description: 'Products screen when every command fails — switches profile to "error".',
    keywords: 'error failure crash reject',
    profile: 'error',
    sources: ['ProductsView.tsx'],
    render: () => (
      <LabShell currentView="products">
        <ProductsView userRole="GLOBAL_ADMIN" />
      </LabShell>
    ),
  },
  {
    id: 'state-slow',
    title: 'Slow loading (products, slow profile)',
    category: 'UI states',
    description: 'Products screen with 1.2s delayed responses — switches profile to "slow".',
    keywords: 'slow loading latency delay pending',
    profile: 'slow',
    sources: ['ProductsView.tsx'],
    render: () => (
      <LabShell currentView="products">
        <ProductsView userRole="GLOBAL_ADMIN" />
      </LabShell>
    ),
  },

  // ── Components ────────────────────────────────────────────────────────────
  {
    id: 'kit-design-system',
    title: 'Design system kit (@invenTory/ui)',
    category: 'Components',
    description:
      'Every shared primitive: buttons, inputs, table, steps, toast, tooltip, modal, theme toggle, search panel, entry forms.',
    keywords:
      'kit design system primitives ui components badge button input table toast tooltip modal',
    sources: [
      'Button.tsx',
      'TextInput.tsx',
      'Select.tsx',
      'Modal.tsx',
      'Badge.tsx',
      'Card.tsx',
      'Table.tsx',
      'Toast.tsx',
      'ThemeToggle.tsx',
      'EmptyState.tsx',
      'Spinner.tsx',
      'StepIndicator.tsx',
      'LiveSearchPanel.tsx',
      'LinearEntryForm.tsx',
      'LinearGridEntry.tsx',
      'Tooltip.tsx',
      'Skeleton.tsx',
    ],
    render: () => <DesignSystemKit />,
  },
  {
    id: 'component-charts',
    title: 'Inventory charts',
    category: 'Components',
    description:
      'Dashboard charts with mock data: stock trend, status by category, donut distribution.',
    keywords: 'charts graphs recharts trend donut bar stock analytics',
    sources: ['CategoryDonutChart.tsx', 'StockTrendChart.tsx', 'StockStatusStackedBarChart.tsx'],
    render: () => <ChartsPreview />,
  },
  {
    id: 'component-product-picker',
    title: 'ProductPicker',
    category: 'Components',
    description:
      'Barcode/SKU live product picker — searches against lab mock fixtures as you type.',
    keywords: 'product picker search barcode sku autocomplete lookup',
    sources: ['ProductPicker.tsx'],
    render: () =>
      labRender(
        <div style={{ padding: 24, position: 'relative', maxWidth: 640 }}>
          <ProductPicker onSelectProduct={() => {}} />
        </div>,
      ),
  },
  {
    id: 'component-balance-sheet-pdf',
    title: 'Balance sheet PDF',
    category: 'Components',
    description: 'Printable point-in-time balance sheet document (@react-pdf/renderer).',
    keywords: 'pdf balance sheet print document day books export',
    sources: ['BalanceSheetPdf.tsx'],
    render: () => <BalanceSheetPreview />,
  },
];

export function findLabEntry(entryId: string | null): LabEntry | null {
  if (!entryId) return null;
  return LAB_ENTRIES.find((e) => e.id === entryId) ?? null;
}
