## INVENTORY Tory v1.1.0

## Offline-First, Multi-Store Inventory Management System Software Requirements Specification

Baseline Version: 1.1.0 (extends 1.0.0)

Prepared: 29 August 2026

Core principle: stores remain operational without internet; every stock movement is persisted locally and

synchronized safely to the central online service when connectivity returns.


## Document Control

| Field | Value |
| --- | --- |
| Product | INVENTORY Tory |
| Version | 1.1.0 |
| Document | Software Requirements Specification |
| Deployment | Cross-platform desktop + central API/database + remote web dashboard + |
|   | read-only mobile view |
| Initial deployment | Four physical stores; electronics inventory |
| Offline operation | Mandatory |
| Local database | SQLite |
| Central database | PostgreSQL |
| API | FastAPI |
| Desktop | Tauri |
| UI | React + TypeScript |
| ORM | SQLAlchemy |

## Change Log — v1.0.0 v1.1.0

Version 1.1.0 adds ten new feature areas requested after the v1.0.0 baseline review. All additions build on the existing event-ledger and offline-sync architecture; none of them change the golden rule in Appendix B (never synchronize by overwriting quantities). New requirement IDs use the prefixes listed below. Items previously listed under Future Enhancements (barcode scanning, mobile companion app) are promoted into scope for v1.1.0.

| # | Feature | New ID prefix | Priority range |
| --- | --- | --- | --- |
| 1 | Low-stock & sync-health alerts | FR-ALERT | Must / Should |
| 2 | Barcode / camera scanning | FR-SCAN | Must / Should |
| 3 | Purchase orders | FR-PO | Must / Should |
| 4 | Automated reorder suggestions | FR-REORDER | Should / Could |
| 5 | Batch / lot and expiry tracking | FR-BATCH | Should / Could |
| 6 | Product images | FR-PROD-IMG | Should / Could |
| 7 | CSV / Excel import and export | FR-IE | Must / Should |
| 8 | Warranty & serial detail tracking | FR-WARR | Should |
| 9 | Mobile companion app (read-only) | FR-MOBILE | Should / Could |


| # | Feature | New ID prefix | Priority range |
| --- | --- | --- | --- |
| 10 Notification center (remote dashboard) |   | FR-NOTIF | Must |


## 1. Introduction

INVENTORY Tory v1.1.0 is a lightweight inventory management platform for businesses operating multiple physical stores. It is designed for electronics inventory where identical products can exist in several stores at different quantities and where stock is continuously received, issued/sold, returned, transferred, damaged, counted and adjusted.

The product replaces paper ledgers and fragile spreadsheets with a transaction-driven inventory engine. Every material movement is a durable business event. The current balance is a projection of those events, while the complete history remains available for audit and investigation.

The defining requirement remains offline-first operation. A store computer may operate without internet for several days. Normal inventory work must continue locally, and reconnection must automatically synchronize pending events without duplication, loss or silent quantity overwrites. Version 1.1.0 extends the feature set for procurement, alerting, scanning and reporting without weakening this guarantee.

## 1.1 Purpose

This SRS is the baseline contract for requirements, design, implementation, testing, deployment and acceptance.

## 1.2 Requirement priority

Must = mandatory. Should = strongly recommended. Could = optional.

## 2. Vision and Objectives

Vision: provide a fast, reliable and auditable inventory system in which every store can operate independently while management has a synchronized global view whenever connectivity is available.

- Replace paper ledgers and spreadsheet balancing.

- Show current stock by store and global total.

- Track every stock movement permanently.

- Support four stores initially without hard-coding four.

- Operate offline for days without losing transactions.

- Automatically synchronize after reconnection.

- Prevent duplicate synchronization and double-counting.

- Provide remote global search.

- Show last successful update and data freshness.

- Run acceptably on older computers.

- Support controlled corrections rather than silent edits.

- Proactively alert staff before stock runs out, not only report that it has.

- Formalize supplier receiving through purchase orders.

- Let staff scan rather than type during high-volume operations.

## 3. Scope


## 3.1 In scope

- Store/location management.

- Product catalogue, SKU, model, brand, category and barcode.

- Quantity inventory and optional serial-number tracking.

- Opening balances and receipts.

- Sales/issues/stock-out.

- Customer and supplier returns.

- Inter-store transfers.

- Damaged and quarantine stock.

- Physical counts and reconciliation.

- Adjustments and reversals.

- Immutable ledger and audit trail.

- Offline operation and automatic synchronization.

- Global search, dashboards and reports.

- Users, roles, devices and permissions.

- Central backup and recovery.

- Low-stock and sync-health alerting.

- Barcode and camera-based scanning during transactions.

- Purchase orders and reorder suggestions.

- Batch/lot and expiry tracking (opt-in per product).

- Product images.

- CSV/Excel import and export for products, opening balances and reports.

- Warranty and serial-level lookup.

- Read-only mobile companion view.

- Central notification/alert feed on the remote dashboard.

## 3.2 Out of scope for v1.1.0

- Full accounting/general ledger.

- Payroll and HR.

- Advanced manufacturing/MRP.

- Payment processing.

- Marketplace/e-commerce integration.

- AI demand forecasting beyond simple trailing-average reorder suggestions.

- Complex supplier invoicing (POs remain lightweight, quantity-and-date only).

- Transaction entry from the mobile app (mobile stays read-only in v1.1.0 to preserve desktop-only offline-write integrity).


## 4. Stakeholders and User Classes

| Role | Responsibilities | Access |
| --- | --- | --- |
| System Administrator | Users, stores, devices, configuration, security, backups | Global |
| Inventory Manager | Global stock, movements, reconciliation, reports, | Global inventory |
|   | purchase orders, alerts |   |
| Store Manager | Store operations and supervision, local alerts, local POs | Assigned store |
| Store Clerk | Receipts, issues, returns, transfers, counts, scanning | Assigned store |
| Auditor/Viewer | Read-only history and reports | Authorized scope |
| Sync Service | Machine-to-machine synchronization | API only |

## 5. Assumptions, Constraints and Dependencies

- Internet may be unavailable or unreliable.

- Each store may have one or more desktop devices.

- SQLite provides durable local persistence.

- Cloud service is reachable over HTTPS when internet exists.

- Server time is authoritative for global acceptance timestamps.

- Committed local data survives normal restart and supported power-loss recovery.

- The data model supports additional stores beyond the initial four.

- Barcode scanners are standard USB/HID keyboard-emulation devices; no proprietary SDK is required for v1.1.0.

- The mobile companion view depends on connectivity; it does not claim offline capability.


## 6. System Overview

## 6.1 Deployment architecture

## 6.2 Operating modes

| Mode | Behavior |
| --- | --- |
| Offline | Local operations work; events commit to SQLite and enter a durable outbox. |
| Online | Local work continues while background sync runs. |
| Reconnecting | Pending events are pushed and relevant server changes pulled. |
| Sync failure | Events remain safe locally and retry; status is visible. |
| Integrity failure | Unsafe destructive actions stop and recovery guidance appears. |


## 7. Architecture and Technology Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Desktop shell | Tauri | Lightweight cross-platform desktop runtime. |
| UI | React + TypeScript | Typed reusable interface. |
| Local DB | SQLite | Embedded transactional offline persistence. |
| Desktop services | Rust/Tauri | Native database, filesystem, secure storage, |
|   |   | connectivity, HID scanner input. |
| Cloud API | FastAPI | Central API and business validation. |
| ORM | SQLAlchemy | Relational access and migrations. |
| Cloud DB | PostgreSQL | Central durable ledger and reporting. |
| Remote UI | React + TypeScript | Management/search dashboard, notification |
|   |   | center. |
| Mobile UI | React (responsive web) | Read-only companion view. |
| Transport | HTTPS/JSON REST | Simple secure network protocol. |
| Auth | Secure sessions/tokens + | Human and machine authorization. |
|   | device identity |   |

## 7.1 Architectural principles

- Local-first: normal store work never requires internet.

- Event-first: synchronize transactions, not raw quantities.

- Durable outbox: pending events survive outages.

- Idempotent server: retries cannot double-count.

- Immutable ledger: corrections create compensating events.

- Projection: current balance is derived/materialized from accepted events.

- Least privilege.

- Observable synchronization.

- Alerts and notifications are derived/materialized views, never a source of truth — deleting/muting a notification never changes stock.

- A purchase order is a plan; only a RECEIPT transaction against it changes stock, preserving the single ledger-is-truth rule.


## 8. Functional Requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-STORE-001 Must |   | Create, edit, activate/deactivate and view stores. |
| FR-STORE-002 Must |   | Give each store a unique immutable identifier. |
| FR-STORE-003 Must |   | Register and assign devices to stores. |
| FR-STORE-004 Must |   | Restrict store users to authorized store operations. |
| FR-PROD-001 Must |   | Create products with unique SKU/product ID. |
| FR-PROD-002 Must |   | Store name, brand, model, category, unit and active state. |
| FR-PROD-003 Must |   | Search by name, SKU, model, barcode and alternate name. |
| FR-MOV-001 | Must | Record receipts/additions. |
| FR-MOV-002 | Must | Record sales/issues/removals. |
| FR-MOV-003 | Must | Record customer and supplier returns. |
| FR-MOV-004 | Must | Record inter-store transfers. |
| FR-MOV-005 | Must | Record damage/quarantine movements. |
| FR-MOV-006 | Must | Record controlled adjustments and physical counts. |
| FR-MOV-007 | Must | Record user, store, product, quantity, time and reference/reason. |
| FR-MOV-008 | Must | Prevent negative stock in strict mode. |
| FR-MOV-009 | Must | Correct errors through reversal/compensation, not deletion. |
| FR-SRCH-001 Must |   | Provide global product search. |
| FR-SRCH-002 Must |   | Show quantity by store. |
| FR-SRCH-003 Must |   | Show total global quantity. |
| FR-SRCH-004 Must |   | Show movement history. |
| FR-SRCH-005 Must |   | Show last synchronized timestamp per store. |
| FR-RPT-001 | Must | Provide stock, movement, transfer, return, damage and adjustment |
|   |   | reports. |

## 8.1 Adjustment and count controls

- Require a reason for controlled adjustments.

- Require elevated permission for material adjustments.

- Support physical count sessions.

- Calculate variance between system and physical quantity.


## 8.2 NEW — Alerts and sync-health (FR-ALERT)

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-ALERT-001 Must |   | Support a configurable low-stock threshold per product, per store or |
|   |   | globally. |
| FR-ALERT-002 Must |   | Raise a dashboard notification when a product/store balance falls at or |
|   |   | below its threshold. |
| FR-ALERT-003 Must |   | Raise a notification when a store/device crosses into STALE or VERY |
|   |   | STALE freshness. |
| FR-ALERT-004 Should |   | Send an optional email notification to the relevant Inventory Manager or |
|   |   | Store Manager. |
| FR-ALERT-005 Must |   | Notifications are a derived view; resolving or muting one never alters stock |
|   |   | or ledger data. |

## 8.3 NEW — Barcode and camera scanning (FR-SCAN)

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-SCAN-001 Must |   | Accept USB/HID barcode-scanner input as keystrokes into the product |
|   |   | search field during sale, receipt, transfer and count workflows. |
| FR-SCAN-002 Should |   | Support webcam-based barcode scanning where a camera is available. |
| FR-SCAN-003 Must |   | On an unmatched barcode, prompt the user to create a new product or link |
|   |   | the barcode to an existing one; never silently discard the scan. |
| FR-SCAN-004 Must |   | Scanning works fully offline, consistent with the offline-first principle. |


## 8.4 NEW — Purchase orders and reordering (FR-PO, FR-REORDER)

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-PO-001 | Must | Create a purchase order with supplier, destination store, expected |
|   |   | items/quantities and expected date. |
| FR-PO-002 | Must | Receiving against an open PO pre-fills a RECEIPT transaction and |
|   |   | updates fulfilled vs. outstanding quantity on the PO. |
| FR-PO-003 | Should | Support partial receipt across multiple deliveries against one PO. |
| FR-PO-004 | Must | A PO alone never changes stock; only a linked RECEIPT transaction does. |
| FR-PO-005 | Should | PO status lifecycle: DRAFT, SENT, PARTIALLY_RECEIVED, RECEIVED, |
|   |   | CANCELLED. |
| FR-REORDER- | Should | Suggest a reorder quantity per product/store based on trailing sales |
| 001 |   | average and current stock. |
| FR-REORDER- | Could | Create a draft PO directly from reorder suggestions with one action. |
| 002 |   |   |

## 8.5 NEW — Import, export and reporting extensions (FR-IE)

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-IE-001 | Must | Export any standard report to CSV and XLSX. |
| FR-IE-002 | Should | Bulk import/update products via CSV with row-level validation and an error |
|   |   | report; no silent partial success. |
| FR-IE-003 | Could | Bulk import of opening balances for new-store onboarding. |

## 8.6 NEW — Batch/lot, expiry, images and warranty (FR-BATCH, FR-PROD-IMG, FR-WARR)

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-BATCH-001 Should |   | Enable batch/lot tracking per product on an opt-in basis, alongside existing |
|   |   | serial tracking. |
| FR-BATCH-002 Should |   | Record a batch/lot number and optional expiry date at RECEIPT time when |
|   |   | enabled. |
| FR-BATCH-003 Could |   | Provide an expiry-approaching report for batch-tracked products. |
| FR-PROD-IMG- | Should | Attach one or more images per product; images are cached locally for |
| 001 |   | offline display. |
| FR-PROD-IMG- | Could | Support bulk image import matched by SKU. |
| 002 |   |   |


| ID | Priority | Requirement |
| --- | --- | --- |
| FR-WARR-001 Should |   | Support an optional warranty duration per product; auto-calculate expiry |
|   |   | per serialized unit from its sale date. |
| FR-WARR-002 Should |   | Look up a unit's sale date, originating store and warranty status by serial |
|   |   | number. |

## 8.7 NEW — Mobile companion and notification center (FR-MOBILE, FR-NOTIF)

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-MOBILE-00 | Should | Provide a responsive, read-only mobile view of global stock, search and |
| 1 |   | freshness. |
| FR-MOBILE-00 | Could | Push alert notifications (see FR-ALERT) to the mobile view. |
| 2 |   |   |
| FR-MOBILE-00 | Must | The mobile view never accepts transaction entry in v1.1.0, preserving |
| 3 |   | desktop-only offline-write integrity. |
| FR-NOTIF-001 Must |   | Provide a central feed of unresolved alerts (low stock, stale store, integrity |
|   |   | incident, overdue PO) on the remote dashboard. |
| FR-NOTIF-002 Must |   | Acknowledging or resolving a notification is an audited action. |


## 9. Inventory Ledger and Business Rules

The system must not maintain manually editable quantity columns. Each product/store balance is a projection of validated movements. The ledger is the permanent history; the balance is the current projection. This rule is unchanged in v1.1.0 — purchase orders, alerts and notifications are all built on top of the ledger, never as replacements for it.

## 9.1 Transaction structure (unchanged)

transaction_id

store_id

product_id

movement_type

ADJUSTMENT | DAMAGE | COUNT | OTHER

quantity_delta

occurred_at

recorded_at

user_id

device_id

reference_number

reason_code

transfer_id

purchase_order_id NEW: linked PO when receipt fulfills a PO

batch_id

client_sequence

sync_status

server_accepted_at central acceptance timestamp

9.2 Immutability, balance invariant and stock buckets are unchanged from v1.0.0 (see Appendix B).

globally unique UUID/ULID

affected store

affected product

RECEIPT | SALE | RETURN | TRANSFER |

signed quantity

business event time

device record time

responsible user

originating device

receipt/document/reference

controlled movement reason

linked transfer group

NEW: linked batch/lot when batch tracking enabled

local ordering number

PENDING | SENT | ACCEPTED | REJECTED


## 10. Offline-First Synchronization

The golden rule is unchanged: synchronization must never replace a cloud quantity with a local quantity. The unit of synchronization is the durable transaction/event. Purchase-order and alert data sync using the same push/pull and idempotency mechanics as inventory transactions, so a retried PO update or a re-sent alert can never produce duplicate effects.

| ID | Priority | Requirement |
| --- | --- | --- |
| SYNC-001 | Must | Every transaction receives a globally unique ID before upload. |
| SYNC-002 | Must | Outbox survives restart, crash and normal power loss. |
| SYNC-003 | Must | Server uses transaction ID/idempotency key to prevent duplicate effects. |
| SYNC-004 | Must | Retrying an event never creates a second stock movement. |
| SYNC-005 | Must | Accepted events remain queryable. |
| SYNC-006 | Must | Pending and failed events are visible to authorized users. |
| SYNC-007 | Must | Background sync never blocks normal local entry. |
| SYNC-008 | Must | UI shows online/offline state and pending count. |
| SYNC-009 | Must | Last successful sync timestamp is stored. |
| SYNC-010 | Should | Use batched upload/download. |
| SYNC-011 | Should | Use exponential backoff. |
| SYNC-012 | Must | Partial batch failures acknowledge accepted events individually. |
| SYNC-013 | Must | NEW: PO status changes and notification state sync using the same |
|   |   | idempotent, event-based mechanism. |

## 11. Multi-Store Transfers

Unchanged from v1.0.0. A transfer is one business operation containing linked source and destination effects.

| State | Meaning |
| --- | --- |
| DRAFT | Prepared but not committed. |
| DISPATCHED | Source committed; goods may be in transit. |
| RECEIVED | Destination confirms receipt. |
| EXCEPTION | Quantity/condition discrepancy requires review. |
| CANCELLED | Cancelled under authorized rules. |


## 12. Product and Master Data

| Field | Required | Description |
| --- | --- | --- |
| Product ID/SKU | Yes | Unique immutable identifier. |
| Name | Yes | Human-readable name. |
| Brand | Recommended Electronics brand. |   |
| Model | Recommended Model number. |   |
| Category | Yes | Configurable category. |
| Unit | Yes | pcs, ctn, set, etc. |
| Barcode | Optional | EAN/UPC/internal barcode. |
| Alternate names | Optional | Search aliases. |
| Serial tracking | Optional | Enabled per product. |
| Active | Yes | Inactive products remain historical. |
| Batch/lot tracking (NEW) | Optional | Enabled per product; independent of serial tracking. |
| Warranty duration (NEW) | Optional | Used to auto-calculate per-unit warranty expiry. |
| Images (NEW) | Optional | One or more images, cached locally for offline |
|   |   | display. |
| Low-stock threshold (NEW) | Optional | Per-product/per-store or global reorder trigger. |

## Packaging and unit conversions

Conversions such as 1 carton = 12 pieces must be explicitly configured. The system must never infer conversions from free text. This is unchanged.


## 13. Operational Workflows

## 13.1 Receive stock (updated to include scanning and PO linkage)

```
Select store -> scan or search product -> quantity -> receipt/reference
-> optional supplier -> optional: link to open purchase order
-> validate -> local commit
-> increase available stock -> update PO fulfilled quantity (if linked)
-> create outbox event
```

## 13.2 Issue / sale (updated to include scanning)

```
Select store -> scan or search product -> quantity
-> validate available quantity -> receipt/reference
-> commit -> decrease available stock -> queue sync
```

## 13.3 Returns (unchanged)

Customer returns increase AVAILABLE or enter DAMAGED/QUARANTINE according to condition. Supplier returns decrease the appropriate stock bucket. Both preserve original references when known.

## 13.4 Physical count (unchanged)

```
System quantity: 18
Physical count: 17
Variance: -1
Approved reconciliation creates ADJUSTMENT -1
with reason, responsible user and audit trail.
```

## 13.5 NEW — Purchase order lifecycle

```
Create PO (supplier, store, items, expected date) -> DRAFT
-> send to supplier -> SENT
-> goods arrive -> receive against PO (13.1) -> PARTIALLY_RECEIVED or RECEIVED
-> outstanding items remain visible until RECEIVED or CANCELLED
```

## 13.6 NEW — Alert lifecycle

```
Balance/freshness crosses threshold -> notification created (PENDING)
-> visible in dashboard notification center
-> Manager acknowledges / resolves -> resolved_at set (audited)
-> notification never edits stock, balance, or ledger data
```


## 14. Search, Dashboard and Reporting

## 14.1 Global dashboard mockup (updated with notification badge)

```
+----------------------------------------------------------------+
| INVENTORY Tory Store: ALL SYNC: ONLINE [!] 5 ALERTS |
+----------------------------------------------------------------+
| Search / Scan products... |
+----------------------------------------------------------------+
| PRODUCTS TOTAL STOCK PENDING SYNC LOW STOCK OPEN POs |
| 1,284 8,921 12 37 6 |
+----------------------------------------------------------------+
| Store A 2,100 pcs Updated 2 min ago [VIEW] |
| Store B 2,800 pcs Updated 5 min ago [VIEW] |
| Store C 1,921 pcs Updated 1 hour ago [VIEW] |
| Store D 2,100 pcs Updated 4 days ago [STALE] |
+----------------------------------------------------------------+
| NOTIFICATIONS |
| - Store D stale (4 days) [ACKNOWLEDGE] |
| - Hisense 120L below threshold at Store A [VIEW] [PO] |
| - PO #PO-0042 overdue (expected 3 days ago) [VIEW] |
+----------------------------------------------------------------+
```

## 14.3 Required reports (extended)

- Current stock by store.

- Global stock by product.

- Receipts by date/store/product.

- Sales/issues by date/store/product.

- Customer and supplier returns.

- Inter-store transfers.

- Damaged/quarantine stock.

- Physical counts and adjustments.

- Low-stock products.

- Unsynchronized and stale stores/devices.

- User activity and audit report.

- Purchase orders — open, overdue and fulfilled.

- Reorder suggestions.

- Expiring/expired batches (where batch tracking is enabled).

- Warranty status by serial number.

14.4 Freshness thresholds are unchanged (FRESH, RECENT, STALE, VERY STALE) — see v1.0.0 Section 14.4.


## 15. Security and Permissions

Authentication and authorization rules are unchanged from v1.0.0: hashed passwords, TLS transport, expiring sessions/tokens, unique device identity, revocable devices, and mandatory server-side authorization. New permissions are added for the v1.1.0 feature set.

| Permission | Examples |
| --- | --- |
| Inventory read | Balances and history. |
| Inventory write | Receive, issue, return, transfer. |
| Adjustment | Create/approve adjustments. |
| Store administration | Manage stores/devices. |
| Product administration | Manage products. |
| User administration | Manage users/roles. |
| Global reporting | Cross-store reports. |
| Audit | Security and audit events. |
| Purchase order management | Create, send, receive against and cancel POs. |
| (NEW) |   |
| Alert administration (NEW) | Configure thresholds; acknowledge/resolve notifications. |


## 16. Data Model

| Entity | Purpose |
| --- | --- |
| Store | Physical stock location. |
| Device | Desktop installation assigned to a store. |
| User | Human account. |
| Role/Permission | Authorization. |
| Product | Master item. |
| StockBalance | Materialized quantity projection per product/store/bucket. |
| InventoryTransaction | Immutable movement event. |
| Transfer | Linked inter-store movement group. |
| StockCount | Physical count session. |
| OutboxEvent | Local pending synchronization item. |
| SyncReceipt | Server acceptance metadata. |
| AuditEvent | Security/administrative audit record. |
| Supplier | Supplier master data. |
| Customer | Optional customer data. |
| PurchaseOrder (NEW) | Planned supplier receipt; does not itself change stock. |
| PurchaseOrderItem (NEW) | Ordered vs. received quantity per product on a PO. |
| Notification (NEW) | Derived alert record (low stock, stale, integrity, overdue PO). |
| ProductBatch (NEW) | Batch/lot number and optional expiry, linked to receipts when |
|   | enabled. |
| ProductImage (NEW) | Image reference per product, cached locally for offline display. |

## 16.1 Suggested schema additions

```
purchase_orders(id, supplier_id, store_id, status, expected_at,
created_by, created_at)
purchase_order_items(po_id, product_id, quantity_ordered,
quantity_received)
notifications(id, type, severity, target_store_id, target_product_id,
target_po_id, message, created_at, resolved_at, resolved_by)
product_batches(id, product_id, batch_number, expiry_date,
received_transaction_id)
product_images(id, product_id, url, sort_order)
-- existing tables gain:
products(..., low_stock_threshold, warranty_days,
batch_tracking_enabled)
inventory_transactions(..., purchase_order_id, batch_id)
```


## 16.2 Additional indexes

- Purchase order status/expected-date index.

- Notification status/severity index.

- Batch expiry-date index (for expiring-batch report).

- Product low-stock-threshold index.


## 17. API Requirements

17.1 API conventions are unchanged: versioned path, HTTPS in production, JSON, stable IDs, explicit error codes, server-side validation, idempotent transaction ingestion.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | /api/v1/auth/login | Authenticate. |
| POST | /api/v1/devices/register | Register/authorize device. |
| POST | /api/v1/sync/push | Upload pending transactions. |
| GET | /api/v1/sync/pull?cursor=... | Download newer changes. |
| GET | /api/v1/sync/status | Sync status. |
| GET | /api/v1/products/search?q=... | Global search. |
| GET | /api/v1/products/{id}/inventory | Stock by store. |
| GET | /api/v1/products/{id}/history | Movement history. |
| GET | /api/v1/stores/{id}/inventory | Store inventory. |
| GET | /api/v1/reports/movements | Movement report. |
| POST | /api/v1/purchase-orders (NEW) | Create a purchase order. |
| POST | /api/v1/purchase-orders/{id}/receive (NEW) | Receive against a PO (idempotent). |
| GET | /api/v1/purchase-orders?status=... (NEW) | List/filter purchase orders. |
| GET | /api/v1/reorder-suggestions (NEW) | Suggested reorder quantities. |
| GET | /api/v1/notifications?status=... (NEW) | List active/resolved notifications. |
| POST | /api/v1/notifications/{id}/resolve (NEW) | Acknowledge/resolve a notification |
|   |   | (audited). |
| GET | /api/v1/products/export (NEW) | Export product catalogue as CSV/XLSX. |
| POST | /api/v1/products/import (NEW) | Bulk import/update products with |
|   |   | validation report. |
| GET | /api/v1/serials/{serial}/warranty (NEW) | Warranty status lookup by serial number. |

## 17.2 Sample PO receive payload (NEW)

```
{
"device_id": "DEVICE-0001",
"purchase_order_id": "PO-0042",
"transaction_id": "01K...",
"store_id": "STORE-A",
"items": [
{"product_id": "HISENSE-120", "quantity_received": 10,
"batch_number": null}
]
}
```


## 18. Desktop UI/UX Requirements

- Fast startup and low memory footprint.

- Keyboard-first entry for clerical work.

- Search-first product selection.

- Minimal clicks for frequent operations.

- Large, unambiguous quantity display.

- Clear confirmation before destructive operations.

- Offline/online state always visible.

- Pending sync count always visible.

- No normal inventory action blocked merely because internet is unavailable.

- Scanner input focuses directly into the active product field with no extra click.

- Low-stock and PO-linked receipts are visually flagged during entry.

## 18.1 Transaction screen mockup (updated)

```
+----------------------------------------------------------------+
| INVENTORY Tory | STORE A OFFLINE [●] |
+----------------------------------------------------------------+
| Operation: [ SALE v ] |
| Product: [ Scan or search ______________________________ ] |
| Hisense 120L Available locally: 6 |
| (below threshold: reorder suggested) |
| Quantity: [ 2 ] |
| Receipt: [ R-1002 ] |
| Reason: [ Customer Sale v ] |
| |
| [ CANCEL ] [ SAVE TRANSACTION ]|
+----------------------------------------------------------------+
| Pending sync: 7 Last sync: 4 days ago |
+----------------------------------------------------------------+
```

## 19. Remote Web Dashboard

- Global product search.

- Stock by store and total.

- Movement history.

- Last sync and freshness.

- Store/device synchronization status.

- Reports and exception review.

- Notification center (alerts, overdue POs, integrity incidents).

- Purchase order management and reorder suggestions.


## 20. Non-Functional Requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-PERF-001 | Startup | Target interactive startup within 3 seconds on baseline |
|   |   | hardware. |
| NFR-PERF-002 | Local commit | Target normal transaction commit/UI update under 250 ms. |
| NFR-PERF-003 | Search | Target local search under 250 ms for normal catalogues. |
| NFR-PERF-004 | Sync | Background sync must not block foreground work. |
| NFR-REL-001 | Durability | Committed local transactions survive restart and normal |
|   |   | power-loss recovery. |
| NFR-REL-002 | Idempotency | Retrying an event produces one logical effect. |
| NFR-SEC-001 | Transport | Cloud traffic uses TLS. |
| NFR-SEC-002 | Authorization | Privileged API actions are server-authorized. |
| NFR-PORT-001 Portability |   | Windows first; architecture remains portable to Linux/macOS. |
| NFR-MAINT-001 Maintainability |   | Separate UI, domain, persistence and sync layers. |
| NFR-SCALE-001 Scale |   | Support more than four stores. |
| NFR-OBS-001 | Observability | Log sync failures and critical application events. |
| NFR-PERF-005 | NEW: Scan latency Target scan-to-field-population under 150 ms. |   |
| NFR-REL-003 | NEW: Alert | A notification is raised within one sync cycle of the triggering |
|   | accuracy | condition; no missed threshold crossings. |
| NFR-SEC-003 | NEW: Mobile | Mobile companion sessions use the same token expiry and |
|   | access | revocation policy as desktop. |


## 21. Error Handling and Recovery

| Failure | Required behavior |
| --- | --- |
| Internet unavailable | Continue locally; queue transactions. |
| API unavailable | Continue locally; retry later. |
| Authentication expired | Re-authenticate without deleting queued transactions. |
| Duplicate upload | Return idempotent acknowledgement; no second stock effect. |
| Insufficient stock | Reject under strict mode and show available quantity. |
| Partial sync failure | Keep unresolved transactions; mark accepted ones synced. |
| Database locked | Retry briefly; show recovery message if persistent. |
| Database corruption | Stop unsafe writes and guide recovery. |
| Power loss | Committed SQLite transaction remains; incomplete transaction rolls |
|   | back. |
| Sync conflict | Do not overwrite; create exception for review. |
| NEW: PO over-receipt | Receiving more than the outstanding PO quantity is flagged for |
|   | confirmation, not silently accepted. |
| NEW: Import validation failure | Reject the invalid rows with a row-level error report; valid rows may |
|   | still commit, never partially-silent. |

## 22. Audit and Data Integrity

Unchanged from v1.0.0: every movement identifies who, what, where, when, quantity and reference/reason; synchronization outcomes are traceable; administrative changes are audited; corrections reference the original event; historical product/store identity is retained. Notification acknowledgement/resolution and PO status changes are now included in the audit trail on the same basis as other administrative actions.

## 23. Backup and Disaster Recovery

Unchanged from v1.0.0. Local and central backup requirements, RPO/RTO targets and monitoring scope now additionally cover purchase order and notification tables, which are backed up with the same PostgreSQL backup cycle as the rest of the central database.


## 24. Testing and Acceptance

## 24.2 Critical acceptance scenarios (v1.0.0 scenarios AT-001 to AT-012 remain in force; new scenarios below cover v1.1.0 additions)

| ID | Scenario | Acceptance |
| --- | --- | --- |
| AT-013 Low-stock alert |   | Balance crosses configured threshold; a notification appears on the |
|   |   | dashboard within one sync cycle. |
| AT-014 Stale-store alert |   | A store passes 24 hours without sync; a VERY STALE notification |
|   |   | appears. |
| AT-015 PO receive |   | Receiving against an open PO increases stock and updates the |
|   |   | PO's fulfilled quantity; the PO alone never changes stock before |
|   |   | receipt. |
| AT-016 PO over-receipt |   | Receiving more than outstanding on a PO is flagged for |
|   |   | confirmation, not silently accepted. |
| AT-017 Scan entry |   | A barcode scan populates the product field and completes a sale |
|   |   | without keyboard typing. |
| AT-018 Unmatched scan |   | Scanning an unknown barcode prompts create/link, never a silent |
|   |   | no-op. |
| AT-019 CSV export |   | A report exports to CSV/XLSX with data matching the on-screen |
|   |   | report. |
| AT-020 CSV import validation |   | An import file with invalid rows produces a row-level error report; |
|   |   | valid rows commit correctly. |
| AT-021 Notification resolve |   | Resolving a notification is audited and never alters stock or ledger |
|   |   | data. |
| AT-022 Mobile read-only |   | The mobile companion view can search and display stock but has |
|   |   | no transaction-entry controls. |

## 24.3 Definition of Done (extended)

- All Must requirements implemented.

- Critical acceptance scenarios pass, including AT-013 to AT-022.

- No duplicate effects during retries.

- Offline operation works without network.

- Migrations tested.

- Backup/restore verified.

- Permissions verified.

- Target hardware performance acceptable.

- Purchase orders never change stock except through a linked, idempotent receipt transaction.

- Notifications are fully derived and never bypass the ledger.


## 25. Deployment and Operations

Deployment topology, configuration keys and update policy are unchanged from v1.0.0. Application updates must preserve SQLite data, transaction history, pending outbox records, purchase orders and notification state. Versioned migrations remain mandatory.

```
inventory/
apps/
desktop/ # Tauri + React + TypeScript
web/ # remote dashboard (+ notification center)
mobile/ # NEW: read-only companion web app
services/
api/ # FastAPI (+ purchase-orders, notifications, import/export)
packages/
domain/
shared-types/
infra/
docker/
migrations/
tests/
docs/
```


## 26. Future Enhancements

Barcode scanning and the mobile companion app are promoted into v1.1.0 scope (see Sections 8.3 and 8.7) and removed from this list. Remaining future items:

- Full serial/IMEI and warranty tracking beyond the v1.1.0 lookup (e.g. manufacturer claim workflows).

- Transaction entry from the mobile app.

- Supplier/customer portals.

- Advanced Excel/PDF export beyond FR-IE.

- LAN relay synchronization.

- Accounting integration.

- Demand forecasting and analytics beyond simple trailing-average reorder suggestions.

- Cloud multi-tenant support.

- Fine-grained shelf/bin locations.

- Full supplier invoicing (beyond lightweight POs).


## 27. Traceability Matrix

| Business need | Requirements | Acceptance |
| --- | --- | --- |
| Replace paper | FR-MOV, ledger, audit | Core transaction tests |
| Four stores | Store/multi-store model | Cross-store tests |
| Offline operation | SYNC requirements | Offline/reconnect tests |
| Correct sync | Outbox/idempotency | Retry/duplicate tests |
| Know stock by store | Search/dashboard | Remote search tests |
| Know history | Immutable ledger/audit | History/reversal tests |
| Old computers | Tauri/SQLite/performance | Hardware benchmark |
| Remote visibility | Dashboard/freshness | Remote query tests |
| Avoid stockouts (NEW) | FR-ALERT, FR-REORDER | AT-013, AT-014 |
| Faster clerical entry (NEW) | FR-SCAN | AT-017, AT-018 |
| Formal receiving (NEW) | FR-PO | AT-015, AT-016 |
| Bulk data handling (NEW) | FR-IE | AT-019, AT-020 |
| Central alert visibility (NEW) | FR-NOTIF | AT-021 |
| Manager mobility (NEW) | FR-MOBILE | AT-022 |


## 28. Glossary and Build Plan

| Term | Definition |
| --- | --- |
| Inventory transaction | Immutable event that changes or records stock. |
| Ledger | Chronological set of inventory transactions. |
| Projection | Current balance derived/materialized from accepted events. |
| Outbox | Durable local queue of unsynchronized events. |
| Idempotency | Retrying the same request does not create another logical effect. |
| Sync cursor | Marker indicating how far a client has consumed server changes. |
| Stale | Data older than the configured freshness threshold. |
| Transfer | Linked source/destination stock movement. |
| Adjustment | Authorized stock correction represented by an event. |
| Quarantine | Stock separated from available/saleable inventory. |
| Purchase order (NEW) | A plan for an expected supplier receipt; does not itself move stock. |
| Notification (NEW) | A derived alert record; never a source of truth for stock. |
| Batch/lot (NEW) | An optional grouping of received stock sharing a lot number and/or |
|   | expiry date. |

## Appendix A — Recommended Build Order (updated)

- Repository, CI and coding standards.

- Domain entities and inventory ledger rules.

- SQLite schema and migrations.

- Tauri shell + React/TypeScript UI.

- Local product/store management.

- Receive, issue, return, transfer, damage and count workflows.

- Durable outbox and synchronization state machine.

- FastAPI authentication and device registration.

- PostgreSQL central ledger and idempotent ingestion.

- Push/pull synchronization.

- Remote global search/dashboard.

- Audit, reports and exports.

- Backup, monitoring and deployment.

- Full offline/reconnect/retry testing.

- 15. Barcode/camera scanning integration.

- 16. Purchase orders and reorder suggestions.


- 17. Low-stock and sync-health alerting, notification center.

- 18. Batch/expiry, product images, warranty lookup.

- 19. CSV/XLSX import/export.

- 20. Read-only mobile companion view.

## Appendix B — Non-negotiable design rule (unchanged)

Never synchronize by overwriting quantities. Synchronize durable inventory events, process each event exactly once at the business level, retain the audit trail, and derive current balance from accepted movements. Purchase orders, alerts, notifications and every other v1.1.0 addition are built on top of this rule, not around it.

## Appendix C — Product identity (unchanged)

Official product name: INVENTORY Tory v1.1.0. INVENTORY is the system name; Tory is the product identifier; v1.1.0 is the current release version, extending baseline v1.0.0.
