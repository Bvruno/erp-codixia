// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RenderizadorFormulario } from './renderizador-formulario';
import { EditorFormulario } from './editor-formulario';
import type { FormularioPublico, FormularioEsquema } from '@/types';

const esquema: FormularioEsquema = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'Datos generales',
      preguntas: [
        { id: 'q1', tipo: 'texto_corto', titulo: 'Nombre', requerida: true },
        {
          id: 'q2',
          tipo: 'opcion_multiple',
          titulo: 'Plan',
          requerida: false,
          opciones: [
            { id: 'a', etiqueta: 'Básico' },
            { id: 'b', etiqueta: 'Pro' },
          ],
        },
      ],
    },
  ],
};

const formulario: FormularioPublico = {
  id: 'f1',
  nombre: 'Encuesta',
  descripcion: 'Cuéntanos',
  esquema,
  modo_acceso: 'publico',
  identificadores: ['email'],
  requiere_consentimiento: false,
  texto_privacidad: '',
  mensaje_confirmacion: 'Gracias',
};

describe('RenderizadorFormulario', () => {
  it('renderiza secciones, preguntas y opciones', () => {
    render(<RenderizadorFormulario modo="preview" formulario={formulario} />);
    expect(screen.getByText('Encuesta')).toBeInTheDocument();
    expect(screen.getByText('Datos generales')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre/)).toBeInTheDocument();
    expect(screen.getByText('Básico')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('en modo preview no muestra el botón de enviar', () => {
    render(<RenderizadorFormulario modo="preview" formulario={formulario} />);
    expect(screen.queryByRole('button', { name: /enviar respuesta/i })).not.toBeInTheDocument();
  });

  it('valida requeridas antes de enviar', () => {
    const onEnviar = vi.fn();
    render(
      <RenderizadorFormulario modo="real" formulario={formulario} onEnviar={onEnviar} />
    );
    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(onEnviar).not.toHaveBeenCalled();
    expect(screen.getByText('Esta pregunta es obligatoria')).toBeInTheDocument();
  });

  it('envía respuestas y honeypot al completar', () => {
    const onEnviar = vi.fn();
    render(
      <RenderizadorFormulario modo="real" formulario={formulario} onEnviar={onEnviar} />
    );
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByText('Pro').closest('label')!.querySelector('input')!);
    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(onEnviar).toHaveBeenCalledWith(
      { q1: 'Ana', q2: 'b' },
      false,
      ''
    );
  });

  it('exige consentimiento cuando está configurado', () => {
    const onEnviar = vi.fn();
    render(
      <RenderizadorFormulario
        modo="real"
        formulario={{ ...formulario, requiere_consentimiento: true, texto_privacidad: 'Aviso legal' }}
        onEnviar={onEnviar}
      />
    );
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(onEnviar).not.toHaveBeenCalled();
    expect(screen.getByText(/acepto el aviso/i)).toBeInTheDocument();
  });
});

const esquemaIF: FormularioEsquema = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'Inicio',
      preguntas: [
        {
          id: 'plan',
          tipo: 'opcion_multiple',
          titulo: 'Plan',
          requerida: true,
          opciones: [
            { id: 'a', etiqueta: 'A' },
            { id: 'b', etiqueta: 'B' },
          ],
        },
        {
          id: 'detalle',
          tipo: 'texto_corto',
          titulo: 'Detalle',
          requerida: true,
          logica: {
            mostrar_si: {
              id: 'r1',
              condiciones: [{ pregunta_id: 'plan', operador: 'igual', valor: 'a' }],
              modo: 'todas',
            },
          },
        },
      ],
      ramas: [
        {
          id: 'ra',
          regla: { id: 'r2', condiciones: [{ pregunta_id: 'plan', operador: 'igual', valor: 'a' }], modo: 'todas' },
          destino: 'enviar',
        },
      ],
    },
    {
      id: 's2',
      titulo: 'Solo B',
      preguntas: [{ id: 'empresa', tipo: 'texto_corto', titulo: 'Empresa', requerida: true }],
    },
  ],
};

const formularioIF: FormularioPublico = {
  ...formulario,
  esquema: esquemaIF,
};

describe('RenderizadorFormulario con lógica IF', () => {
  it('muestra solo la primera sección (wizard)', () => {
    render(<RenderizadorFormulario modo="real" formulario={formularioIF} />);
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.queryByText('Solo B')).not.toBeInTheDocument();
  });

  it('oculta la pregunta cuya condición no se cumple', () => {
    render(<RenderizadorFormulario modo="real" formulario={formularioIF} />);
    expect(screen.queryByLabelText(/Detalle/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('A').closest('label')!.querySelector('input')!);
    expect(screen.getByLabelText(/Detalle/)).toBeInTheDocument();
  });

  it('valida la requerida visible antes de enviar', () => {
    const onEnviar = vi.fn();
    render(<RenderizadorFormulario modo="real" formulario={formularioIF} onEnviar={onEnviar} />);
    fireEvent.click(screen.getByText('A').closest('label')!.querySelector('input')!);
    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(screen.getByText('Esta pregunta es obligatoria')).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it("rama 'enviar' termina y envía solo respuestas visibles", () => {
    const onEnviar = vi.fn();
    render(<RenderizadorFormulario modo="real" formulario={formularioIF} onEnviar={onEnviar} />);
    fireEvent.click(screen.getByText('A').closest('label')!.querySelector('input')!);
    fireEvent.change(screen.getByLabelText(/Detalle/), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(onEnviar).toHaveBeenCalledWith({ plan: 'a', detalle: 'ok' }, false, '');
  });

  it('sin rama avanza a la sección siguiente y permite volver', () => {
    render(<RenderizadorFormulario modo="real" formulario={formularioIF} />);
    fireEvent.click(screen.getByText('B').closest('label')!.querySelector('input')!);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByText('Solo B')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }));
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('la preview permite navegar con Continuar', () => {
    render(<RenderizadorFormulario modo="preview" formulario={formularioIF} />);
    fireEvent.click(screen.getByText('B').closest('label')!.querySelector('input')!);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByText('Solo B')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar respuesta/i })).not.toBeInTheDocument();
  });

  it('una respuesta fantasma no mantiene visibles a sus dependientes', () => {
    const onEnviar = vi.fn();
    const enCadena: FormularioPublico = {
      ...formulario,
      esquema: {
        version: 1,
        secciones: [
          {
            id: 's1',
            titulo: 'Datos',
            preguntas: [
              {
                id: 'q1',
                tipo: 'opcion_multiple',
                titulo: 'Plan',
                requerida: true,
                opciones: [
                  { id: 'a', etiqueta: 'A' },
                  { id: 'b', etiqueta: 'B' },
                ],
              },
              {
                id: 'q2',
                tipo: 'texto_corto',
                titulo: 'Detalle',
                requerida: true,
                logica: {
                  mostrar_si: {
                    id: 'r1',
                    condiciones: [{ pregunta_id: 'q1', operador: 'igual', valor: 'a' }],
                    modo: 'todas',
                  },
                },
              },
              {
                id: 'q3',
                tipo: 'texto_corto',
                titulo: 'Comentario',
                requerida: true,
                logica: {
                  mostrar_si: {
                    id: 'r2',
                    condiciones: [{ pregunta_id: 'q2', operador: 'respondida' }],
                    modo: 'todas',
                  },
                },
              },
            ],
          },
        ],
      },
    };
    render(<RenderizadorFormulario modo="real" formulario={enCadena} onEnviar={onEnviar} />);

    fireEvent.click(screen.getByText('A').closest('label')!.querySelector('input')!);
    fireEvent.change(screen.getByLabelText(/Detalle/), { target: { value: 'x' } });
    expect(screen.getByLabelText(/Comentario/)).toBeInTheDocument();

    // Cambiar a B oculta Detalle y, en cadena, Comentario deja de existir.
    fireEvent.click(screen.getByText('B').closest('label')!.querySelector('input')!);
    expect(screen.queryByLabelText(/Detalle/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Comentario/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(onEnviar).toHaveBeenCalledWith({ q1: 'b' }, false, '');
  });
});

describe('EditorFormulario', () => {
  it('agrega una sección nueva', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={esquema} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole('button', { name: /agregar sección/i }));
    expect(onCambio).toHaveBeenCalledTimes(1);
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    expect(siguiente.secciones).toHaveLength(2);
    expect(siguiente.secciones[1].titulo).toBe('Sección 2');
  });

  it('edita el título de la sección', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={esquema} onCambio={onCambio} />);
    fireEvent.change(screen.getByDisplayValue('Datos generales'), {
      target: { value: 'Encabezado' },
    });
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    expect(siguiente.secciones[0].titulo).toBe('Encabezado');
  });

  it('duplica una pregunta con id nuevo', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={esquema} onCambio={onCambio} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicar pregunta' })[0]);
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    expect(siguiente.secciones[0].preguntas).toHaveLength(3);
    expect(siguiente.secciones[0].preguntas[1].id).not.toBe('q1');
  });

  it('activa la condición de visibilidad de una pregunta con previas', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={esquema} onCambio={onCambio} />);
    // Solo la segunda pregunta tiene preguntas anteriores.
    fireEvent.click(screen.getAllByText('Mostrar solo si se cumple una condición')[0]);
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    const logica = siguiente.secciones[0].preguntas[1].logica;
    expect(logica?.mostrar_si.condiciones[0].pregunta_id).toBe('q1');
  });

  it('agrega una rama de sección', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={esquema} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rama' }));
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    expect(siguiente.secciones[0].ramas).toHaveLength(1);
    expect(siguiente.secciones[0].ramas?.[0].destino).toBe('enviar');
  });
});

describe('validación de texto corto', () => {
  it('el editor activa modo número con dígitos por defecto', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={esquema} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole('button', { name: 'Solo número' }));
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    expect(siguiente.secciones[0].preguntas[0].validacion_texto).toEqual({
      modo: 'numero',
      digitos_min: 1,
      digitos_max: undefined,
    });
  });

  it('el editor puede quitar la validación', () => {
    const conValidacion: FormularioEsquema = structuredClone(esquema);
    conValidacion.secciones[0].preguntas[0].validacion_texto = { modo: 'texto' };
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={conValidacion} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sin validación' }));
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    expect(siguiente.secciones[0].preguntas[0].validacion_texto).toBeNull();
  });

  it('muestra los campos de dígitos solo en modo número', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={esquema} onCambio={onCambio} />);
    expect(screen.queryByPlaceholderText('Dígitos mínimos')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Solo número' }));
    render(<EditorFormulario esquema={onCambio.mock.calls[0][0] as FormularioEsquema} onCambio={onCambio} />);
    expect(screen.getAllByPlaceholderText('Dígitos mínimos').length).toBeGreaterThan(0);
  });

  it('el renderizador valida el modo número', () => {
    const onEnviar = vi.fn();
    const conNumero: FormularioPublico = {
      ...formulario,
      esquema: {
        version: 1,
        secciones: [
          {
            id: 's1',
            titulo: 'Datos',
            preguntas: [
              {
                id: 'q1',
                tipo: 'texto_corto',
                titulo: 'Documento',
                requerida: true,
                validacion_texto: { modo: 'numero', digitos_min: 4, digitos_max: 6 },
              },
            ],
          },
        ],
      },
    };
    render(<RenderizadorFormulario modo="real" formulario={conNumero} onEnviar={onEnviar} />);
    const input = screen.getByLabelText(/Documento/);

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(screen.getByText('Solo se permiten números')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(screen.getByText('Mínimo 4 dígitos')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar respuesta/i }));
    expect(onEnviar).toHaveBeenCalledWith({ q1: '1234' }, false, '');
  });
});

describe('limpieza de referencias al eliminar', () => {
  const conRefs: FormularioEsquema = {
    version: 1,
    secciones: [
      {
        id: 's1',
        titulo: 'S1',
        preguntas: [{ id: 'q1', tipo: 'texto_corto', titulo: 'Q1', requerida: false }],
        ramas: [
          {
            id: 'r',
            regla: { id: 'rr', condiciones: [{ pregunta_id: 'q1', operador: 'respondida' }], modo: 'todas' },
            destino: 'enviar',
          },
        ],
      },
      {
        id: 's2',
        titulo: 'S2',
        preguntas: [
          {
            id: 'q2',
            tipo: 'texto_corto',
            titulo: 'Q2',
            requerida: false,
            logica: {
              mostrar_si: {
                id: 'r2',
                condiciones: [{ pregunta_id: 'q1', operador: 'respondida' }],
                modo: 'todas',
              },
            },
          },
        ],
      },
    ],
  };

  it('eliminar una pregunta quita las condiciones y ramas que la usan', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={conRefs} onCambio={onCambio} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar pregunta' })[0]);
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    expect(siguiente.secciones[0].preguntas).toHaveLength(0);
    expect(siguiente.secciones[0].ramas).toEqual([]);
    expect(siguiente.secciones[1].preguntas[0].logica).toBeNull();
  });

  it('eliminar una sección limpia las referencias desde otras secciones', () => {
    const onCambio = vi.fn();
    render(<EditorFormulario esquema={conRefs} onCambio={onCambio} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar sección' })[0]);
    const siguiente = onCambio.mock.calls[0][0] as FormularioEsquema;
    expect(siguiente.secciones).toHaveLength(1);
    expect(siguiente.secciones[0].preguntas[0].logica).toBeNull();
  });
});
