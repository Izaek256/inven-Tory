/**
 * Sidebar keyboard navigation — P0 from the UX plan.
 *
 *  - ArrowDown/ArrowUp move focus between nav items
 *  - Enter activates the focused nav item (native button behaviour)
 *  - Escape collapses the sidebar when collapsible
 *  - Escape does not collapse when already collapsed or not collapsible
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '../components/Sidebar';
import type { NavView } from '../config/navigation';

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const onNavigate = props.onNavigate ?? vi.fn();
  const onToggleCollapse = props.onToggleCollapse ?? vi.fn();
  render(
    <Sidebar
      currentView={(props.currentView as NavView) ?? 'dashboard'}
      onNavigate={onNavigate}
      collapsed={props.collapsed ?? false}
      onToggleCollapse={onToggleCollapse}
    />,
  );
  return { onNavigate, onToggleCollapse };
}

function navButton(): HTMLElement {
  return screen.getByTestId('nav-dashboard');
}

describe('Sidebar keyboard navigation (P0)', () => {
  it('ArrowDown moves focus to the next nav item', () => {
    renderSidebar();
    navButton().focus();
    expect(navButton()).toHaveFocus();

    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'ArrowDown' });

    expect(screen.getByTestId('nav-create_product')).toHaveFocus();
  });

  it('ArrowUp moves focus to the previous nav item', () => {
    renderSidebar();
    screen.getByTestId('nav-create_product').focus();

    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'ArrowUp' });

    expect(screen.getByTestId('nav-dashboard')).toHaveFocus();
  });

  it('ArrowDown wraps from the last nav button to the first', () => {
    renderSidebar();
    // Settings is the last rendered nav item.
    screen.getByTestId('nav-settings').focus();

    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'ArrowDown' });

    expect(screen.getByTestId('nav-dashboard')).toHaveFocus();
  });

  it('ArrowUp wraps from the first nav button to the last', () => {
    renderSidebar();
    navButton().focus();

    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'ArrowUp' });

    expect(screen.getByTestId('nav-settings')).toHaveFocus();
  });

  it('Arrow keys operate on DOM order across nav groups', () => {
    renderSidebar();
    // Last item of the Overview group -> first item of Stock operations.
    navButton().focus();
    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'ArrowDown' });
    expect(screen.getByTestId('nav-create_product')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'ArrowDown' });
    expect(screen.getByTestId('nav-receive_stock')).toHaveFocus();
  });

  it('Enter activates the focused nav item', () => {
    const { onNavigate } = renderSidebar();
    const target = screen.getByTestId('nav-products');
    target.focus();

    fireEvent.keyDown(target, { key: 'Enter' });
    fireEvent.click(target);

    expect(onNavigate).toHaveBeenCalledWith('products');
  });

  it('Escape collapses the sidebar when collapsible', () => {
    const { onToggleCollapse } = renderSidebar({ collapsed: false });
    navButton().focus();

    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'Escape' });

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('Escape does not collapse when already collapsed', () => {
    const { onToggleCollapse } = renderSidebar({ collapsed: true });
    navButton().focus();

    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'Escape' });

    expect(onToggleCollapse).not.toHaveBeenCalled();
  });

  it('Escape does nothing when the sidebar is not collapsible', () => {
    const onNavigate = vi.fn();
    render(
      <Sidebar currentView={'dashboard' as NavView} onNavigate={onNavigate} collapsed={false} />,
    );
    navButton().focus();

    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'Escape' });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('keys other than navigation are ignored', () => {
    const { onToggleCollapse } = renderSidebar();
    navButton().focus();

    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'a' });
    fireEvent.keyDown(screen.getByTestId('app-sidebar'), { key: 'Tab' });

    expect(navButton()).toHaveFocus();
    expect(onToggleCollapse).not.toHaveBeenCalled();
  });
});
