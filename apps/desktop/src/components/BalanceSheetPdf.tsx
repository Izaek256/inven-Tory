import React from 'react';
import { Document, Font, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { BalanceSheetRow } from '../utils/balanceSheetUtils';

// Register a custom local font family to ensure font metrics are properly resolved.
// In @react-pdf/renderer v4, standard PDF font names ('Courier', 'Helvetica', 'Times-Roman')
// trigger a null return from FontStore, causing a "Cannot read properties of undefined (reading 'unitsPerEm')"
// crash. Registering a non-standard family with bundled local TTF fonts guarantees fontkit
// initializes the metrics cleanly offline and in Tauri webview.
const getFontUrl = (path: string): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
};

Font.register({
  family: 'BalanceSheetFont',
  fonts: [
    { src: getFontUrl('/fonts/arial.ttf'), fontWeight: 400 },
    { src: getFontUrl('/fonts/arialbd.ttf'), fontWeight: 700 },
  ],
});

// Fallback: if network is unavailable, suppress font load errors gracefully
Font.registerHyphenationCallback((word) => [word]);

// ── Column widths ─────────────────────────────────────────────────────────────
// Single source of truth: both the header <Text> and every data <Text> in the
// same column apply the *exact* same flex value so they can never drift apart,
// regardless of font-size/weight differences (e.g. Closing is bold/larger but
// still has flex:2, same as Opening/In/Out).
const COL = {
  product: 4, // widened after SKU removal
  numeric: 2, // Opening, In, Out, Closing all share this
} as const;

// Shared padding applied identically to every header cell and data cell.
const CELL_PAD = '6px 8px';

interface BalanceSheetPdfProps {
  rows: BalanceSheetRow[];
  generatedAt: string;
  storeName: string;
  bookDate: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: 'BalanceSheetFont',
  },
  header: {
    marginBottom: 16,
    borderBottom: '1pt solid #d1d5db',
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#6b728b',
  },
  table: {
    marginTop: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e7eb',
    backgroundColor: '#ffffff',
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e7eb',
    backgroundColor: '#fafafa',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottom: '1pt solid #d1d5db',
  },

  // ── Header cells ────────────────────────────────────────────────────────────
  // flex is NOT set here — it is merged in JSX from COL.* so every column
  // header shares the exact same flex as its data cells.
  headerCellBase: {
    padding: CELL_PAD,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.5pt',
    color: '#6b728b',
  },
  headerNumeric: {
    textAlign: 'right',
  },

  // ── Data cells ──────────────────────────────────────────────────────────────
  // Same rule: flex comes from COL.*, so width is always identical to header.
  dataCellBase: {
    padding: CELL_PAD,
    fontSize: 9,
  },
  dataNumeric: {
    textAlign: 'right',
    color: '#111827',
  },
  nameText: {
    fontWeight: 'bold',
  },

  // Color overrides applied on top of dataCellBase + dataNumeric
  qtyPositive: {
    color: '#15803d',
  },
  qtyNegative: {
    color: '#b91c1c',
  },

  // Closing balance — visual anchor of the row.
  // padding intentionally matches CELL_PAD; only fontSize/fontWeight/color differ.
  closingData: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  },

  footer: {
    marginTop: 20,
    borderTop: '0.5pt solid #e5e7eb',
    paddingTop: 8,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

// ── Composed cell style helpers ───────────────────────────────────────────────
// Keeping composition explicit here rather than in StyleSheet so that COL.*
// constants can be referenced at render time.

const hProduct = { ...styles.headerCellBase, flex: COL.product } as const;
const hNumeric = { ...styles.headerCellBase, ...styles.headerNumeric, flex: COL.numeric } as const;

const dProduct = { ...styles.dataCellBase, ...styles.nameText, flex: COL.product } as const;
const dNumeric = { ...styles.dataCellBase, ...styles.dataNumeric, flex: COL.numeric } as const;
const dPositive = { ...dNumeric, ...styles.qtyPositive } as const;
const dNegative = { ...dNumeric, ...styles.qtyNegative } as const;
const dClosing = { ...dNumeric, ...styles.closingData } as const;

export const BalanceSheetPdf: React.FC<BalanceSheetPdfProps> = ({
  rows,
  generatedAt,
  storeName,
  bookDate,
}: BalanceSheetPdfProps) => {
  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const formatTime = (iso: string): string =>
    new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Document>
      <Page style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>POINT-IN-TIME BALANCE SHEET</Text>
          <Text style={styles.subtitle}>
            Store: {storeName} | Date: {formatDate(bookDate)} | Generated: {formatDate(generatedAt)}{' '}
            {formatTime(generatedAt)}
          </Text>
        </View>

        <View style={styles.table}>
          {/* ── Header row ── */}
          <View style={styles.tableHeaderRow}>
            <Text style={hProduct}>Product</Text>
            <Text style={hNumeric}>Opening / Current</Text>
            <Text style={hNumeric}>In / New Stock</Text>
            <Text style={hNumeric}>Out / Sold</Text>
            <Text style={hNumeric}>Closing / Balance</Text>
          </View>

          {/* ── Data rows — alternating backgrounds ── */}
          {rows.map((row, rowIndex) => (
            <View
              key={row.productId}
              style={rowIndex % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            >
              <Text style={dProduct}>{row.productName}</Text>
              <Text style={dNumeric}>{row.openingBalance}</Text>
              <Text style={dPositive}>+{row.cumulativeIn}</Text>
              <Text style={dNegative}>-{row.cumulativeOut}</Text>
              <Text style={dClosing}>{row.closingBalance}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>
            Generated from Day Book data — {rows.length} product{rows.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </Page>
    </Document>
  );
};
