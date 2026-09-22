import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/cliente', () => ({
  api: { post: vi.fn(async () => ({ ok: true })) },
}));

import { api } from '@/lib/api/cliente';
import { SolicitarPage } from './solicitar';

const mockedPost = vi.mocked(api.post);

beforeEach(() => {
  vi.clearAllMocks();
});

function llenarFormulario() {
  fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Correo de trabajo'), {
    target: { value: 'ana@empresa.com' },
  });
  fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'Empresa SA' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('funnel público de solicitud', () => {
  it('muestra error si el nombre solo tiene espacios', async () => {
    render(<SolicitarPage />);
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Correo de trabajo'), {
      target: { value: 'ana@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'Empresa SA' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los campos');
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('envía la solicitud válida y confirma', async () => {
    render(<SolicitarPage />);
    llenarFormulario();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    expect(mockedPost).toHaveBeenCalledWith(
      '/plataforma/solicitudes',
      expect.objectContaining({ email: 'ana@empresa.com', consentimiento: true })
    );
    expect(await screen.findByText(/Recibimos tu solicitud/)).toBeInTheDocument();
  });

  it('muestra el error de la API', async () => {
    mockedPost.mockRejectedValueOnce(new Error('Demasiadas solicitudes'));
    render(<SolicitarPage />);
    llenarFormulario();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiadas solicitudes');
  });
});
