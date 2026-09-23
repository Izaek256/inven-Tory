import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardIcon, MovementsIcon, ProductsIcon, StoresIcon } from '../components/NavIcons';

describe('NavIcons', () => {
  it('renders DashboardIcon with default size and custom size', () => {
    const { container: def } = render(<DashboardIcon />);
    const svgDef = def.querySelector('svg');
    expect(svgDef).toBeInTheDocument();
    expect(svgDef).toHaveAttribute('width', '16');
    expect(svgDef).toHaveAttribute('height', '16');

    const { container: custom } = render(<DashboardIcon size={24} />);
    const svgCustom = custom.querySelector('svg');
    expect(svgCustom).toHaveAttribute('width', '24');
    expect(svgCustom).toHaveAttribute('height', '24');
  });

  it('renders MovementsIcon', () => {
    const { container } = render(<MovementsIcon size={20} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '20');
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
  });

  it('renders ProductsIcon', () => {
    const { container } = render(<ProductsIcon size={18} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(container.querySelectorAll('rect').length).toBe(2);
  });

  it('renders StoresIcon', () => {
    const { container } = render(<StoresIcon size={20} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(container.querySelectorAll('path').length).toBe(2);
  });
});
