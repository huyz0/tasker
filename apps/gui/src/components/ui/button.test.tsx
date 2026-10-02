import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeDefined();
  });

  it('forwards className prop', () => {
    render(<Button className="my-class">OK</Button>);
    const btn = screen.getByRole('button', { name: 'OK' });
    expect(btn.className).toContain('my-class');
  });

  it('forwards additional HTML button props', () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole('button', { name: 'Disabled' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onClick handler when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Press' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders with type attribute', () => {
    render(<Button type="submit">Submit</Button>);
    const btn = screen.getByRole('button', { name: 'Submit' });
    expect((btn as HTMLButtonElement).type).toBe('submit');
  });

  // A disabled primary must still read as *the* primary action (the review:
  // an empty Sign in form showed a grey button and no visible way forward).
  it('keeps primary identity while disabled: a primary tint, not the generic muted grey', () => {
    render(<Button disabled>Sign in</Button>);
    const btn = screen.getByRole('button', { name: 'Sign in' });
    expect(btn.className).toContain('disabled:bg-primary-subtle');
    expect(btn.className).toContain('disabled:text-primary-subtle-foreground');
    expect(btn.className).not.toContain('disabled:bg-muted');
  });

  it('keeps destructive identity while disabled', () => {
    render(<Button variant="destructive" disabled>Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('disabled:bg-destructive-subtle');
  });
});
