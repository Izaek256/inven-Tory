import React, { useState, useCallback, useRef } from 'react';
import { Trash2, Check, AlertCircle, Plus, Upload, FileSpreadsheet } from 'lucide-react';
import { createProduct, createProductsBatch } from '../services/tauriProductService';
import type { BatchProductResult } from '../services/tauriProductService';
import { triggerSync } from '../services/tauriSyncService';
import { CreateProductInput } from '../types/product';
import { LinearGridEntry, GridFieldDef, DataTable } from '@invenTory/ui';
import type { ColumnDef } from '@invenTory/ui';
import { Button } from '@invenTory/ui';

// ── Import types (duplicated here to avoid a circular dependency with types/product.ts) ──
type ImportRow = Record<string, string>;

interface SessionRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  barcode?: string;
  timestamp: string;
}

// ── CSV parser (RFC 4180 compliant, handles quoted fields) ──────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field.trim());
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        current.push(field.trim());
        if (current.some((f) => f !== '')) rows.push(current);
        current = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  current.push(field.trim());
  if (current.some((f) => f !== '')) rows.push(current);
  return rows;
}

// ── Expected import columns ─────────────────────────────────────────────────
const COLUMN_HEADERS: {
  key: string;
  label: string;
  required: boolean;
  example: string;
  note: string;
}[] = [
  {
    key: 'name',
    label: 'Product Name',
    required: true,
    example: 'Apple iPhone 15 Pro 256GB',
    note: 'Display name of the product',
  },
  {
    key: 'model',
    label: 'Model / SKU',
    required: true,
    example: 'IPHONE-15-PRO-256',
    note: 'Model number; uppercased and used as the SKU',
  },
  {
    key: 'brand',
    label: 'Brand',
    required: false,
    example: 'Apple',
    note: 'Optional — brand or manufacturer',
  },
  {
    key: 'barcode',
    label: 'Barcode',
    required: false,
    example: '0123456789012',
    note: 'EAN / UPC / internal barcode',
  },
  {
    key: 'alternate_names',
    label: 'Alternate Names',
    required: false,
    example: 'iPhone 15, iPhone15Pro',
    note: 'Comma-separated aliases',
  },
  {
    key: 'category',
    label: 'Category',
    required: false,
    example: 'Electronics',
    note: 'Defaults to "General" if blank',
  },
  {
    key: 'unit',
    label: 'Unit',
    required: false,
    example: 'pcs',
    note: 'Defaults to "pcs" if blank',
  },
];

// ── Header aliases accepted for each import field ───────────────────────────
// Row keys are already lowercased + trimmed at parse time (CSV + XLSX), so
// these aliases cover every header variant the validation step accepts
// ('Product Name', 'Model / SKU', …) as well as the template table labels.
const IMPORT_FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'product name', 'product_name', 'productname'],
  model: ['model', 'sku', 'model / sku', 'model/sku'],
  brand: ['brand'],
  barcode: ['barcode'],
  alternate_names: ['alternate_names', 'alternatenames', 'alternate names'],
  category: ['category'],
  unit: ['unit'],
};

/** Return the first non-empty cell value for any of the given header aliases. */
function pickRowValue(row: ImportRow, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

// ── Process a batch of parsed rows via the Rust command ─────────────────────
async function importBatch(
  batch: ImportRow[],
  _rowIndexOffset: number,
): Promise<BatchProductResult[]> {
  const inputs = batch.map((row) => {
    const model = pickRowValue(row, IMPORT_FIELD_ALIASES.model);
    const name = pickRowValue(row, IMPORT_FIELD_ALIASES.name);
    const brand = pickRowValue(row, IMPORT_FIELD_ALIASES.brand) || undefined;
    const barcode = pickRowValue(row, IMPORT_FIELD_ALIASES.barcode) || undefined;
    const alternateNames = pickRowValue(row, IMPORT_FIELD_ALIASES.alternate_names) || undefined;
    const category = pickRowValue(row, IMPORT_FIELD_ALIASES.category) || 'General';
    const unit = pickRowValue(row, IMPORT_FIELD_ALIASES.unit) || 'pcs';
    const sku = model.toUpperCase() || undefined;
    return {
      sku: sku ?? '',
      name,
      brand,
      model: model || undefined,
      category,
      unit,
      barcode,
      alternate_names: alternateNames,
    };
  });
  return createProductsBatch(inputs);
}

// ── Yield helper so the UI thread stays responsive during long imports ──────
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// ── FileReader helpers (work in jsdom + Tauri webview) ─────────────────────
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result ?? ''));
    reader.onerror = (): void => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(reader.result as ArrayBuffer);
    reader.onerror = (): void => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

interface CreateProductViewProps {
  importProgress?: {
    running: boolean;
    done: number;
    total: number;
    errors: number;
  } | null;
  setImportProgress?: React.Dispatch<
    React.SetStateAction<{
      running: boolean;
      done: number;
      total: number;
      errors: number;
    } | null>
  >;
}

export const CreateProductView: React.FC<CreateProductViewProps> = ({
  importProgress,
  setImportProgress,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionRows, setSessionRows] = useState<SessionRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Import state ──────────────────────────────────────────────────────────
  // Use global import progress if provided, otherwise fall back to local state
  const [localImportRunning, setLocalImportRunning] = useState(false);
  const [localImportProgress, setLocalImportProgress] = useState<{
    done: number;
    total: number;
    errors: number;
  } | null>(null);

  const isUsingGlobal = importProgress !== undefined && setImportProgress !== undefined;
  const currentImportRunning = isUsingGlobal ? importProgress?.running : localImportRunning;
  const currentImportProgress = isUsingGlobal ? importProgress : localImportProgress;
  const currentSetImportProgress = isUsingGlobal ? setImportProgress : setLocalImportProgress;
  const currentSetImportRunning = useCallback(
    (val: boolean) => {
      if (importProgress !== undefined && setImportProgress !== undefined) {
        setImportProgress?.((prev) => (prev ? { ...prev, running: val } : null));
      } else {
        setLocalImportRunning(val);
      }
    },
    [importProgress, setImportProgress, setLocalImportRunning],
  );

  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [skippedRowDetails, setSkippedRowDetails] = useState<
    { rowNumber: number; reason: string }[]
  >([]);

  // ── Manual grid row commit ────────────────────────────────────────────────
  const handleCommit = useCallback(
    async (row: { id: string; values: Record<string, string | number> }, _rowIndex: number) => {
      setError(null);
      setSuccess(false);

      const finalName = String(row.values.name ?? '').trim();
      const finalModel = String(row.values.model ?? '').trim();
      const finalSku = (finalModel || String(row.values.sku ?? '').trim()).toUpperCase();

      if (!finalName) {
        setError('Product name is required.');
        return;
      }
      if (!finalSku) {
        setError('Model number is required (it becomes the SKU).');
        return;
      }

      try {
        const input: CreateProductInput = {
          sku: finalSku,
          name: finalName,
          brand: String(row.values.brand ?? '').trim() || undefined,
          model: finalModel || undefined,
          category: DEFAULT_CATEGORY,
          unit: DEFAULT_UNIT,
          barcode: String(row.values.barcode ?? '').trim() || undefined,
          alternate_names: String(row.values.alternate_names ?? '').trim() || undefined,
          serial_tracking_enabled: false,
          is_active: true,
        };

        const product = await createProduct(input);

        setSessionRows((prev) => [
          ...prev,
          {
            id: product.id,
            sku: product.sku,
            name: product.name,
            category: product.category,
            unit: product.unit,
            barcode: product.barcode || undefined,
            timestamp: new Date().toLocaleString(),
          },
        ]);

        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  const removeSessionRow = useCallback((rowId: string, _rowIndex: number) => {
    setSessionRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const DEFAULT_CATEGORY = 'General';
  const DEFAULT_UNIT = 'pcs';

  // ── File import handler ───────────────────────────────────────────────────
  const handleFileImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      setSuccess(false);
      setImportResult(null);
      setImportError(null);
      setSkippedRowDetails([]);

      try {
        let allRows: ImportRow[] = [];
        const ext = file.name.toLowerCase().split('.').pop();

        if (ext === 'csv') {
          const text = await readFileAsText(file);
          const raw = parseCsv(text);
          if (raw.length < 2) {
            setImportError('CSV file is empty or has no data rows (only a header row).');
            return;
          }
          const headers = raw[0].map((h) => h.trim().toLowerCase());
          for (let i = 1; i < raw.length; i++) {
            const row: ImportRow = {};
            headers.forEach((h, idx) => {
              row[h] = raw[i]?.[idx] ?? '';
            });
            allRows.push(row);
          }
        } else if (ext === 'xlsx') {
          const XLSX = await import('xlsx');
          const arrayBuffer = await readFileAsArrayBuffer(file);
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
            setImportError('XLSX file has no sheets.');
            return;
          }
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true });
          allRows = jsonData.map((obj) => {
            const row: ImportRow = {};
            Object.keys(obj).forEach((k) => {
              row[k.trim().toLowerCase()] = String(obj[k] ?? '').trim();
            });
            return row;
          });
        } else {
          setImportError('Unsupported file type. Please upload a .csv or .xlsx file.');
          return;
        }

        if (allRows.length === 0) {
          setImportError('File contains no data rows.');
          return;
        }

        // Validate headers: must contain at least 'name' or 'product name'
        const firstRowKeys = Object.keys(allRows[0]).map((k) => k.toLowerCase());
        const hasName = firstRowKeys.some(
          (k) =>
            k === 'name' || k === 'product name' || k === 'product_name' || k === 'productname',
        );
        const hasModel = firstRowKeys.some(
          (k) => k === 'model' || k === 'sku' || k === 'model / sku' || k === 'model/sku',
        );
        if (!hasName && !hasModel) {
          setImportError(
            'File headers do not include "name" or "model". Expected columns: ' +
              COLUMN_HEADERS.map((c) => c.label).join(', '),
          );
          return;
        }

        currentSetImportRunning(true);
        currentSetImportProgress({ running: true, done: 0, total: allRows.length, errors: 0 });
        const BATCH_SIZE = 50;
        let totalDone = 0;
        let totalErrors = 0;
        const createdRows: SessionRow[] = [];

        const skippedRows: { rowNumber: number; reason: string }[] = [];

        for (let start = 0; start < allRows.length; start += BATCH_SIZE) {
          const batch = allRows.slice(start, start + BATCH_SIZE);
          const results = await importBatch(batch, start);
          for (const r of results) {
            totalDone++;
            const sourceRow = batch[r.row_index] ?? {};
            if (r.success) {
              createdRows.push({
                id: r.product_id!,
                sku: r.sku!,
                name: pickRowValue(sourceRow, IMPORT_FIELD_ALIASES.name),
                category:
                  pickRowValue(sourceRow, IMPORT_FIELD_ALIASES.category) || DEFAULT_CATEGORY,
                unit: pickRowValue(sourceRow, IMPORT_FIELD_ALIASES.unit) || DEFAULT_UNIT,
                barcode: pickRowValue(sourceRow, IMPORT_FIELD_ALIASES.barcode) || undefined,
                timestamp: new Date().toLocaleString(),
              });
            } else {
              totalErrors++;
              // File row number is 1-based and accounts for the header row.
              skippedRows.push({
                rowNumber: start + r.row_index + 2,
                reason: r.error ?? 'Unknown error',
              });
            }
          }
          currentSetImportProgress({
            running: true,
            done: totalDone,
            total: allRows.length,
            errors: totalErrors,
          });
          await yieldToMain();
        }

        if (createdRows.length > 0) {
          setSessionRows((prev) => [...prev, ...createdRows]);

          // Push the newly imported products to the server immediately.  The
          // forced sync also uploads the full local catalogue, so products
          // imported before they were queued in the outbox are repaired too.
          const envBaseUrl =
            typeof import.meta !== 'undefined'
              ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
              : undefined;
          const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
          void triggerSync({ apiBaseUrl, force: true }).catch(() => undefined);
        }

        const msg =
          totalErrors > 0
            ? `Import finished: ${createdRows.length} created, ${totalErrors} rows skipped (duplicates or errors).`
            : `Import finished: ${createdRows.length} products created successfully.`;
        setImportResult(msg);
        setSkippedRowDetails(skippedRows);
        setSuccess(createdRows.length > 0 && totalErrors === 0);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err));
      } finally {
        currentSetImportRunning(false);
        (
          currentSetImportProgress as React.Dispatch<
            React.SetStateAction<{
              running: boolean;
              done: number;
              total: number;
              errors: number;
            } | null>
          >
        )((prev: { running: boolean; done: number; total: number; errors: number } | null) =>
          prev ? { ...prev, running: false } : null,
        );
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [currentSetImportProgress, currentSetImportRunning],
  );

  // ── Grid columns ──────────────────────────────────────────────────────────
  const fields: GridFieldDef[] = [
    {
      id: 'name',
      type: 'text',
      label: 'Product Name',
      required: true,
      placeholder: 'e.g. Apple iPhone 15 Pro 256GB',
    },
    {
      id: 'brand',
      type: 'text',
      label: 'Brand',
      required: false,
      placeholder: 'e.g. Apple, Samsung',
    },
    {
      id: 'model',
      type: 'text',
      label: 'Model / SKU',
      required: true,
      placeholder: 'Model number — becomes the SKU',
    },
    {
      id: 'barcode',
      type: 'text',
      label: 'Barcode',
      required: false,
      placeholder: 'EAN / UPC / Internal',
    },
    {
      id: 'alternate_names',
      type: 'text',
      label: 'Alternate Names',
      required: false,
      placeholder: 'Comma-separated aliases',
    },
  ];

  const columns: ColumnDef<SessionRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      render: (row) => (
        <span
          style={{
            fontWeight: 600,
            fontFamily: 'var(--it-font-mono)',
            color: 'var(--it-green-text)',
          }}
        >
          {row.sku}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Product Name',
      render: (row) => <div style={{ fontWeight: 500 }}>{row.name}</div>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span style={{ color: 'var(--it-text-secondary)' }}>{row.category}</span>,
    },
    {
      key: 'unit',
      header: 'Unit',
      render: (row) => <span style={{ color: 'var(--it-text-secondary)' }}>{row.unit}</span>,
    },
    {
      key: 'barcode',
      header: 'Barcode',
      render: (row) => row.barcode || '—',
    },
    {
      key: 'timestamp',
      header: 'Created At',
      render: (row) => (
        <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>{row.timestamp}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      numeric: true,
      render: (row) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            title="Remove entry"
            onClick={() => removeSessionRow(row.id, 0)}
            data-testid={`void-product-${row.id}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div
      data-testid="create-product-view"
      style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}
    >
      <div style={{ flex: '1 1 60%', minWidth: '320px' }}>
        <div className="view-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Plus size={24} color="var(--it-green)" />
            <div>
              <h2 className="view-title">Create Product</h2>
              <p className="view-subtitle">Rapid product entry — model number becomes the SKU</p>
            </div>
          </div>
        </div>

        {/* ── Bulk Import Section ─────────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '20px',
            marginBottom: '20px',
          }}
          data-testid="bulk-import-section"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <FileSpreadsheet size={20} color="var(--it-green)" />
            <h3
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--it-text-primary)',
                margin: 0,
              }}
            >
              Import Products
            </h3>
          </div>

          {/* Import Progress Bar - shown below header during import */}
          {currentImportRunning && currentImportProgress && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--it-surface)',
                border: '1px solid var(--it-border)',
              }}
              data-testid="import-progress-below-header"
            >
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--it-text-secondary)',
                  marginBottom: '8px',
                }}
              >
                {currentImportProgress.total > 0
                  ? `Importing products: ${currentImportProgress.done}/${currentImportProgress.total} (${currentImportProgress.errors} errors)`
                  : 'Reading import file…'}
              </div>
              <div
                style={{
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--it-border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width:
                      currentImportProgress.total > 0
                        ? `${Math.min(100, (currentImportProgress.done / currentImportProgress.total) * 100)}%`
                        : '100%',
                    backgroundColor: 'var(--it-green)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--it-text-secondary)',
                  marginTop: '4px',
                }}
              >
                {currentImportProgress.total > 0 ? (
                  <>
                    {currentImportProgress.done}/{currentImportProgress.total}
                    {currentImportProgress.errors > 0 &&
                      ` (${currentImportProgress.errors} errors)`}
                  </>
                ) : (
                  'Reading file…'
                )}
              </div>
            </div>
          )}
          <p
            style={{
              fontSize: '13px',
              color: 'var(--it-text-secondary)',
              marginBottom: '14px',
              lineHeight: 1.5,
            }}
          >
            Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file with one product per row.
            The first row must be the column header row. Required fields are marked in{' '}
            <span style={{ color: 'var(--it-green)', fontWeight: 600 }}>green</span>. Columns not
            listed below will be ignored.
          </p>

          {/* Template definition table */}
          <div
            style={{
              borderRadius: '8px',
              border: '1px solid var(--it-border)',
              overflow: 'hidden',
              marginBottom: '16px',
            }}
          >
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}
              data-testid="import-template-table"
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--it-surface)',
                    borderBottom: '1px solid var(--it-border)',
                  }}
                >
                  <th
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--it-text-primary)',
                    }}
                  >
                    Column Header
                  </th>
                  <th
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--it-text-primary)',
                    }}
                  >
                    Required?
                  </th>
                  <th
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--it-text-primary)',
                    }}
                  >
                    Example
                  </th>
                  <th
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--it-text-primary)',
                    }}
                  >
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {COLUMN_HEADERS.map((col) => (
                  <tr key={col.key} style={{ borderBottom: '1px solid var(--it-border)' }}>
                    <td
                      style={{
                        padding: '6px 12px',
                        fontFamily: 'var(--it-font-mono)',
                        fontWeight: 500,
                        color: 'var(--it-text-primary)',
                      }}
                    >
                      {col.label}
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      {col.required ? (
                        <span style={{ color: 'var(--it-green)', fontWeight: 600 }}>Yes</span>
                      ) : (
                        <span style={{ color: 'var(--it-text-secondary)' }}>No</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '6px 12px',
                        color: 'var(--it-text-secondary)',
                        fontFamily: 'var(--it-font-mono)',
                      }}
                    >
                      {col.example}
                    </td>
                    <td style={{ padding: '6px 12px', color: 'var(--it-text-secondary)' }}>
                      {col.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* File input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label
              htmlFor="product-import-input"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--it-border)',
                backgroundColor: 'var(--it-surface)',
                color: 'var(--it-text-primary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: currentImportRunning ? 'not-allowed' : 'pointer',
                opacity: currentImportRunning ? 0.5 : 1,
                transition: 'background-color 0.15s',
              }}
              data-testid="import-file-label"
            >
              <Upload size={16} />
              {currentImportRunning ? 'Importing…' : 'Choose file (.csv / .xlsx)'}
              <input
                ref={fileInputRef}
                id="product-import-input"
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileImport}
                disabled={currentImportRunning}
                style={{ display: 'none' }}
                data-testid="import-file-input"
              />
            </label>
          </div>

          {importResult && (
            <div
              className="it-toast it-toast--success"
              style={{ marginTop: '12px' }}
              data-testid="import-result"
            >
              <Check size={16} aria-hidden="true" />
              <span>{importResult}</span>
            </div>
          )}
          {skippedRowDetails.length > 0 && (
            <div
              style={{
                marginTop: '12px',
                border: '1px solid var(--it-border)',
                borderRadius: '8px',
                overflow: 'hidden',
                fontSize: '12px',
              }}
              data-testid="import-skipped-details"
            >
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--it-surface)',
                  borderBottom: '1px solid var(--it-border)',
                  fontWeight: 600,
                  color: 'var(--it-text-primary)',
                }}
              >
                Skipped rows — reason per row
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {skippedRowDetails.slice(0, 20).map((s) => (
                    <tr key={s.rowNumber} style={{ borderBottom: '1px solid var(--it-border)' }}>
                      <td
                        style={{
                          padding: '6px 12px',
                          fontFamily: 'var(--it-font-mono)',
                          whiteSpace: 'nowrap',
                          color: 'var(--it-text-secondary)',
                        }}
                      >
                        Row {s.rowNumber}
                      </td>
                      <td style={{ padding: '6px 12px', color: 'var(--it-text-primary)' }}>
                        {s.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {skippedRowDetails.length > 20 && (
                <div style={{ padding: '6px 12px', color: 'var(--it-text-secondary)' }}>
                  …and {skippedRowDetails.length - 20} more skipped rows.
                </div>
              )}
            </div>
          )}
          {importError && (
            <div
              className="it-toast it-toast--error"
              style={{ marginTop: '12px' }}
              data-testid="import-error"
            >
              <AlertCircle size={16} aria-hidden="true" />
              <span>{importError}</span>
            </div>
          )}
        </div>
        {/* ── End Bulk Import Section ─────────────────────────────────────── */}

        {success && (
          <div
            className="it-toast it-toast--success"
            data-testid="create-product-success"
            style={{ marginBottom: '16px' }}
          >
            <Check size={16} aria-hidden="true" />
            <span>Product created successfully.</span>
          </div>
        )}

        {error && (
          <div
            className="it-toast it-toast--error"
            data-testid="create-product-error"
            style={{ marginBottom: '16px' }}
          >
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <LinearGridEntry
          dataTestid="create-product-grid"
          fields={fields}
          onCommitRow={handleCommit}
          onSearch={() => {}}
          onBarcodeScan={() => {}}
          searchResults={[]}
          allItems={[]}
          initialRowCount={5}
          fieldTestIds={{
            name: 'field-name',
            brand: 'field-brand',
            model: 'field-model',
            barcode: 'field-barcode',
            alternate_names: 'field-alternate_names',
          }}
          onVoidRow={removeSessionRow}
        />

        <h3
          style={{
            marginTop: '24px',
            marginBottom: '12px',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--it-text-primary)',
          }}
        >
          Recently Created
        </h3>

        <DataTable<SessionRow>
          columns={columns}
          rows={sessionRows}
          rowKey={(row) => row.id}
          emptySlot={
            <div
              style={{
                color: 'var(--it-text-secondary)',
                fontSize: '13px',
                textAlign: 'center',
                padding: '40px 0',
              }}
            >
              No products created yet
            </div>
          }
          data-testid="recently-created-table"
        />
      </div>
    </div>
  );
};
