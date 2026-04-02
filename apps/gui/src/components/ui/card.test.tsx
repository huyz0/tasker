import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card, CardHeader, CardTitle, CardContent } from './card';

describe('Card', () => {
  it('renders children inside a div', () => {
    render(<Card data-testid="card">card body</Card>);
    expect(screen.getByTestId('card').textContent).toBe('card body');
  });

  it('forwards className prop', () => {
    render(<Card className="custom-card" data-testid="card" />);
    expect(screen.getByTestId('card').className).toContain('custom-card');
  });
});

describe('CardHeader', () => {
  it('renders children', () => {
    render(<CardHeader data-testid="ch">header</CardHeader>);
    expect(screen.getByTestId('ch').textContent).toBe('header');
  });

  it('forwards className', () => {
    render(<CardHeader className="hdr" data-testid="ch" />);
    expect(screen.getByTestId('ch').className).toContain('hdr');
  });
});

describe('CardTitle', () => {
  it('renders as h3 with children', () => {
    render(<CardTitle data-testid="ct">My Title</CardTitle>);
    const el = screen.getByTestId('ct');
    expect(el.tagName).toBe('H3');
    expect(el.textContent).toBe('My Title');
  });
});

describe('CardContent', () => {
  it('renders children', () => {
    render(<CardContent data-testid="cc">content</CardContent>);
    expect(screen.getByTestId('cc').textContent).toBe('content');
  });

  it('forwards className', () => {
    render(<CardContent className="content-class" data-testid="cc" />);
    expect(screen.getByTestId('cc').className).toContain('content-class');
  });
});
