// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ENTIDADES_META, metaEntidad } from '@/lib/entidades-meta';
import { AccionEntidad, AccionesEntidad } from './accion-entidad';
import { BotonHerramienta, SeparadorHerramienta } from './barra-herramientas';
import { ToggleModoEntidad } from './toggle-modo-entidad';
import { IndicadorGuardado } from './indicador-guardado';
import { AvisoSoloLectura } from './aviso-solo-lectura';
import { RutaEntidad } from './ruta-entidad';
import { CabeceraEntidad, TituloEditableEntidad } from './cabecera-entidad';
import { PanelEntidad } from './panel-entidad';
import { EstadoEntidad, EsqueletoEntidad } from './estado-entidad';
import { EntidadPagina } from './entidad-pagina';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('entidades-meta', () => {
  it('define metadatos para los 8 tipos del frontend', () => {
    const tipos = [
      'workspace',
      'folder',
      'list',
      'tarea',
      'document',
      'mindmap',
      'todo',
      'formulario',
    ] as const;

    tipos.forEach((tipo) => {
      const meta = metaEntidad(tipo);
      expect(meta.etiqueta).toBeTruthy();
      expect(meta.etiquetaCrear).toBeTruthy();
      expect(meta.placeholder).toBeTruthy();
      expect(meta.color).toBeTruthy();
      expect(meta.icono).toBeTruthy();
    });
    expect(Object.keys(ENTIDADES_META)).toHaveLength(8);
  });
});

describe('AccionEntidad', () => {
  it('dispara onClick y respeta disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <AccionEntidad onClick={onClick} title="Compartir">
        Compartir
      </AccionEntidad>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <AccionEntidad onClick={onClick} title="Compartir" disabled>
        Compartir
      </AccionEntidad>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('AccionesEntidad agrupa acciones', () => {
    render(
      <AccionesEntidad>
        <AccionEntidad title="A">A</AccionEntidad>
        <AccionEntidad title="B">B</AccionEntidad>
      </AccionesEntidad>
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

describe('BotonHerramienta', () => {
  it('marca activo y avisa click', () => {
    const onClick = vi.fn();
    render(
      <BotonHerramienta onClick={onClick} title="Negrita" active>
        B
      </BotonHerramienta>
    );
    const boton = screen.getByRole('button', { name: 'Negrita' });
    expect(boton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalled();
    render(<SeparadorHerramienta />);
  });
});

describe('ToggleModoEntidad', () => {
  it('alterna entre editar y ver', () => {
    const onCambio = vi.fn();
    const { rerender } = render(<ToggleModoEntidad modo="ver" onCambio={onCambio} />);
    expect(screen.getByRole('button', { name: /Visualizando/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Visualizando/ }));
    expect(onCambio).toHaveBeenCalledWith('editar');

    rerender(<ToggleModoEntidad modo="editar" onCambio={onCambio} />);
    expect(screen.getByRole('button', { name: /Editando/ })).toBeInTheDocument();
  });

  it('deshabilitado muestra el motivo', () => {
    render(
      <ToggleModoEntidad
        modo="ver"
        onCambio={vi.fn()}
        disabled
        motivo="Sin permisos de edición"
      />
    );
    expect(screen.getByRole('button', { name: /Visualizando/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Visualizando/ })).toHaveAttribute(
      'title',
      'Sin permisos de edición'
    );
  });
});

describe('IndicadorGuardado', () => {
  it('normaliza los estados legacy y canónicos', () => {
    const { rerender } = render(<IndicadorGuardado estado="saving" />);
    expect(screen.getByText('Guardando…')).toBeInTheDocument();

    rerender(<IndicadorGuardado estado="guardado" />);
    expect(screen.getByText('Guardado')).toBeInTheDocument();

    rerender(<IndicadorGuardado estado="unsaved" />);
    expect(screen.getByText('Sin guardar…')).toBeInTheDocument();

    rerender(<IndicadorGuardado estado="error" />);
    expect(screen.getByText('Error al guardar')).toBeInTheDocument();
  });

  it('en formato icono oculta el texto', () => {
    render(<IndicadorGuardado estado="guardado" formato="icono" />);
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });
});

describe('AvisoSoloLectura', () => {
  it('renderiza badge y banner', () => {
    const { rerender } = render(<AvisoSoloLectura variante="badge" />);
    expect(screen.getByText('Solo lectura')).toBeInTheDocument();

    rerender(<AvisoSoloLectura mensaje="No puedes editar" />);
    expect(screen.getByRole('status')).toHaveTextContent('No puedes editar');
  });
});

describe('RutaEntidad', () => {
  it('renderiza la cadena con enlaces', () => {
    render(
      <RutaEntidad
        items={[
          { etiqueta: 'Comercial', href: '/proyectos/comercial' },
          { etiqueta: 'Ventas', href: '/proyectos/comercial/ventas' },
          { etiqueta: 'Cierre' },
        ]}
      />
    );
    expect(screen.getByRole('link', { name: /Comercial/ })).toHaveAttribute(
      'href',
      '/proyectos/comercial'
    );
    expect(screen.getByText('Cierre')).toBeInTheDocument();
  });

  it('sin items no renderiza nada', () => {
    const { container } = render(<RutaEntidad items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CabeceraEntidad', () => {
  it('muestra icono, título, subtítulo, badges y acciones', () => {
    render(
      <CabeceraEntidad
        tipo="document"
        titulo="Manual"
        subtitulo="3 páginas"
        badges={<span>Publicado</span>}
        ruta={[{ etiqueta: 'Comercial', href: '/proyectos/comercial' }]}
        estado={<IndicadorGuardado estado="saved" />}
        acciones={<AccionEntidad title="Compartir">Compartir</AccionEntidad>}
      />
    );

    expect(screen.getByRole('heading', { name: 'Manual' })).toBeInTheDocument();
    expect(screen.getByText('3 páginas')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Comercial/ })).toBeInTheDocument();
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeInTheDocument();
  });

  it('sin tipo también renderiza (páginas de sección)', () => {
    render(<CabeceraEntidad titulo="Configuración" />);
    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
  });

  it('el título usa el tamaño máximo cuando no hay medición', () => {
    render(<CabeceraEntidad tipo="mindmap" titulo="Mapa" />);
    expect(screen.getByRole('heading', { name: 'Mapa' })).toHaveStyle({ fontSize: '24px' });
  });

  it('no renderiza icono junto al título', () => {
    const { container } = render(<CabeceraEntidad tipo="document" titulo="Manual" />);
    expect(container.querySelector('header svg')).toBeNull();
  });
});

describe('TituloEditableEntidad', () => {
  it('confirma el valor en blur y revierte con Escape', () => {
    const onCommit = vi.fn();
    render(
      <TituloEditableEntidad valor="Viejo" onCommit={onCommit} placeholder="Título" />
    );
    const input = screen.getByRole('textbox', { name: 'Título' });

    fireEvent.change(input, { target: { value: 'Nuevo' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Nuevo');

    fireEvent.change(input, { target: { value: 'Otro' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('Viejo');
  });

  it('en modo controlado emite cada cambio', () => {
    const onCambio = vi.fn();
    render(
      <TituloEditableEntidad valor="A" onCambio={onCambio} placeholder="Nombre" />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'AB' },
    });
    expect(onCambio).toHaveBeenCalledWith('AB');
  });
});

describe('PanelEntidad', () => {
  it('renderiza título, acciones y contenido', () => {
    render(
      <PanelEntidad
        titulo="Sub-tareas"
        acciones={<button type="button">Nueva</button>}
      >
        contenido
      </PanelEntidad>
    );
    expect(screen.getByText('Sub-tareas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva' })).toBeInTheDocument();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
});

describe('EstadoEntidad y esqueletos', () => {
  it('muestra vacío con acción', () => {
    const onClick = vi.fn();
    render(
      <EstadoEntidad
        titulo="Sin listas"
        descripcion="Crea una lista"
        accion={{ label: 'Crear', onClick }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('renderiza las variantes de esqueleto', () => {
    const { rerender } = render(<EsqueletoEntidad variante="tabla" filas={2} columnas={3} />);
    expect(document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length).toBeGreaterThan(0);
    rerender(<EsqueletoEntidad variante="editor" />);
    rerender(<EsqueletoEntidad variante="detalle" />);
    rerender(<EsqueletoEntidad variante="tablero" />);
  });
});

describe('EntidadPagina', () => {
  it('aplica modo completa y auto', () => {
    const { container, rerender } = render(<EntidadPagina>contenido</EntidadPagina>);
    expect(container.firstChild).toHaveTextContent('contenido');
    rerender(<EntidadPagina alto="completa">editor</EntidadPagina>);
    expect(container.firstChild).toHaveTextContent('editor');
  });
});
