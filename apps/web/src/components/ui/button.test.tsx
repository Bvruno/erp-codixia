// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renderiza el contenido', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('aplica variantes de clase', () => {
    const { container } = render(<Button variant="destructive">X</Button>);
    expect(container.firstChild).toHaveClass('bg-destructive');
  });

  it('dispara onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('soporta asChild con Slot', () => {
    render(
      <Button asChild>
        <a href="/calendario">Ir</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Ir' });
    expect(link).toHaveAttribute('href', '/calendario');
    expect(link).toHaveAttribute('data-slot', 'button');
  });
});
