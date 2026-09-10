import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, PRIMARY_NAV_ITEMS, MORE_NAV_ITEMS } from '../config/navigation';

describe('Navigation Config', () => {
  it('renders persistent items in specified order', () => {
    const expectedPrimary = [
      'dashboard',
      'create_product',
      'day_books',
      'sale_stock',
      'receive_stock',
      'products',
      'physical_count',
      'transactions',
      'settings',
    ];
    expect(PRIMARY_NAV_ITEMS.map((i) => i.id)).toEqual(expectedPrimary);
  });

  it('renders more items in specified order', () => {
    const expectedMore = ['return_stock', 'transfer_stock', 'damage_quarantine'];
    expect(MORE_NAV_ITEMS.map((i) => i.id)).toEqual(expectedMore);
  });

  it('total items count matches expected', () => {
    expect(NAV_ITEMS.length).toBe(12);
    expect(PRIMARY_NAV_ITEMS.length).toBe(9);
    expect(MORE_NAV_ITEMS.length).toBe(3);
  });

  it('all items have unique ids', () => {
    const ids = NAV_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all items have labels and icons', () => {
    NAV_ITEMS.forEach((item) => {
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
    });
  });
});
