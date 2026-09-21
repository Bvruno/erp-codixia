// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';

describe('Dialog', () => {
  it('renderiza el conjunto completo', () => {
    render(
      <Dialog open>
        <DialogTrigger>
          <Button>abrir</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Título</DialogTitle>
            <DialogDescription>Desc</DialogDescription>
          </DialogHeader>
          <DialogFooter>Pie</DialogFooter>
        </DialogContent>
        <DialogClose asChild>
          <Button>Cerrar</Button>
        </DialogClose>
      </Dialog>,
    );
    expect(screen.getByText('Título')).toBeInTheDocument();
    expect(screen.getByText('Pie')).toBeInTheDocument();
  });
});

describe('DropdownMenu', () => {
  it('renderiza el conjunto completo abierto', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>menú</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuItem>Item</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" inset>
              Borrar
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuLabel inset>Etiqueta</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>Chequeable</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup>
            <DropdownMenuRadioItem value="r">Radio</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger inset>Sub</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>Sub contenido</DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Chequeable')).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });
});

describe('Popover', () => {
  it('renderiza el conjunto', () => {
    render(
      <Popover open>
        <PopoverTrigger>abrir</PopoverTrigger>
        <PopoverContent>Contenido popover</PopoverContent>
        <PopoverAnchor />
      </Popover>,
    );
    expect(screen.getByText('Contenido popover')).toBeInTheDocument();
  });
});

describe('Select', () => {
  it('abre y lista opciones', async () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Elije" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Grupo</SelectLabel>
            <SelectItem value="a">Opción A</SelectItem>
            <SelectItem value="b">Opción B</SelectItem>
          </SelectGroup>
          <SelectSeparator />
        </SelectContent>
      </Select>,
    );
    fireEvent.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByText('Opción A')).toBeInTheDocument());
  });
});

describe('Tabs', () => {
  it('renderiza lista y triggers', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">General</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Contenido</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('General')).toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('renderiza trigger y contenido', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>
            <button>buf</button>
          </TooltipTrigger>
          <TooltipContent>Ayuda</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText('Ayuda')).toBeInTheDocument();
  });
});

describe('Collapsible', () => {
  it('renderiza trigger y contenido', () => {
    render(
      <Collapsible open>
        <CollapsibleTrigger>desplegar</CollapsibleTrigger>
        <CollapsibleContent>Contenido colapsa</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByText('Contenido colapsa')).toBeInTheDocument();
  });
});

describe('Checkbox', () => {
  it('renderiza y tooglea con onCheckedChange', () => {
    const onChange = vi.fn();
    const { container } = render(<Checkbox onCheckedChange={onChange} />);
    const el = container.querySelector('[data-slot="checkbox"]')!;
    fireEvent.click(el);
    expect(onChange).toHaveBeenCalled();
  });
});

describe('Calendar', () => {
  it('renderiza un mes', () => {
    render(<Calendar />);
    expect(screen.getByRole('grid') || screen.getByText(/2025|2026/)).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  it('destructive con loading', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Eliminar"
        description="¿Seguro?"
        onConfirm={onConfirm}
        loading
      />,
    );
    expect(screen.getByText('Eliminar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Procesando...' })).toBeDisabled();
  });

  it('default con confirmLabel personalizado', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Guardar"
        description="¿Continuar?"
        variant="default"
        confirmLabel="Sí"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sí' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
