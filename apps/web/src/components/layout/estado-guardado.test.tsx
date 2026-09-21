// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BarraEstadoGuardado } from './estado-guardado';

describe('BarraEstadoGuardado', () => {
  it('muestra el estado pendiente', () => {
    render(<BarraEstadoGuardado estado="pendiente" onReintentar={vi.fn()} />);
    expect(screen.getByText('Sin guardar…')).toBeInTheDocument();
  });

  it('muestra el estado guardando', () => {
    render(<BarraEstadoGuardado estado="guardando" onReintentar={vi.fn()} />);
    expect(screen.getByText('Guardando…')).toBeInTheDocument();
  });

  it('muestra el estado guardado', () => {
    render(<BarraEstadoGuardado estado="guardado" onReintentar={vi.fn()} />);
    expect(screen.getByText('Guardado')).toBeInTheDocument();
  });

  it('en error muestra mensaje y reintenta', () => {
    const onReintentar = vi.fn();
    render(
      <BarraEstadoGuardado
        estado="error"
        onReintentar={onReintentar}
        mensajeError="No se pudo guardar el perfil"
      />,
    );

    expect(
      screen.getByText('No se pudo guardar el perfil'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });
});
