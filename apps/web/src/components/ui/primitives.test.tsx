// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CardSkeleton, KanbanSkeleton, Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';

describe('Card', () => {
  it('renderiza todos los subcomponentes', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Título</CardTitle>
          <CardDescription>Desc</CardDescription>
          <CardAction>A</CardAction>
        </CardHeader>
        <CardContent>Contenido</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Título')).toHaveAttribute('data-slot', 'card-title');
    expect(screen.getByText('Desc')).toHaveAttribute('data-slot', 'card-description');
    expect(screen.getByText('A')).toHaveAttribute('data-slot', 'card-action');
    expect(screen.getByText('Contenido')).toHaveAttribute('data-slot', 'card-content');
    expect(screen.getByText('Footer')).toHaveAttribute('data-slot', 'card-footer');
  });
});

describe('Badge', () => {
  it('aplica variantes', () => {
    const { container } = render(<Badge variant="destructive">X</Badge>);
    expect(container.querySelector('[data-slot="badge"]')).toHaveClass('bg-destructive');
  });

  it('soporta asChild', () => {
    render(<Badge asChild>B</Badge>);
    expect(screen.getByText('B')).toHaveAttribute('data-slot', 'badge');
  });
});

describe('Avatar', () => {
  it('renderiza root y fallback', () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://x/a.png" alt="a" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(container.querySelector('[data-slot="avatar-fallback"]')).toBeInTheDocument();
  });
});

describe('Input/Label/Textarea', () => {
  it('input con type y className', () => {
    const { container } = render(<Input type="email" placeholder="Email" />);
    expect(screen.getByPlaceholderText('Email')).toHaveAttribute('type', 'email');
    expect(container.firstChild).toHaveAttribute('data-slot', 'input');
  });

  it('label se liga al input', () => {
    render(
      <>
        <Label htmlFor="x">Nombre</Label>
        <Input id="x" />
      </>,
    );
    expect(screen.getByText('Nombre')).toHaveAttribute('for', 'x');
  });

  it('textarea renderiza', () => {
    render(<Textarea placeholder="Comentario" />);
    expect(screen.getByPlaceholderText('Comentario')).toHaveAttribute('data-slot', 'textarea');
  });
});

describe('Separator', () => {
  it('horizontal por defecto y vertical con prop', () => {
    const { container, rerender } = render(<Separator />);
    expect(
      container.querySelector('[data-slot="separator-root"]')?.getAttribute('data-orientation'),
    ).toBe('horizontal');
    rerender(<Separator orientation="vertical" />);
    expect(
      container.querySelector('[data-slot="separator-root"]')?.getAttribute('data-orientation'),
    ).toBe('vertical');
  });
});

describe('Table', () => {
  it('renderiza el conjunto completo', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Celda</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
        <TableCaption>Leyenda</TableCaption>
      </Table>,
    );
    expect(screen.getByText('Celda')).toHaveAttribute('data-slot', 'table-cell');
    expect(screen.getByText('Leyenda')).toHaveAttribute('data-slot', 'table-caption');
  });
});

describe('Skeleton', () => {
  it('renderiza variantes', () => {
    render(<Skeleton className="h-4" />);
    render(<TableSkeleton />);
    render(<CardSkeleton />);
    render(<KanbanSkeleton />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10);
  });
});

describe('EmptyState', () => {
  it('con descripción y acción', () => {
    const onClick = vi.fn();
    render(<EmptyState title="Vacío" description="Sin datos" action={{ label: 'Crear', onClick }} />);
    expect(screen.getByText('Vacío')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('sin descripción ni acción', () => {
    render(<EmptyState title="Solo título" />);
    expect(screen.getByText('Solo título')).toBeInTheDocument();
  });
});

describe('ScrollArea', () => {
  it('renderiza con contenido', () => {
    render(<ScrollArea>Contenido scroll</ScrollArea>);
    expect(screen.getByText('Contenido scroll')).toBeInTheDocument();
  });
});
