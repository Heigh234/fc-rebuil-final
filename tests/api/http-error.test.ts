import { describe, it, expect } from 'vitest';
import { ZodError, z } from 'zod';
import {
  AppHttpError,
  jsonSuccess,
  jsonCreated,
  jsonError,
  badRequest,
  notFound,
  conflict,
  unprocessable,
  serverError,
  handleApiError,
} from '@/lib/api/http-error';
import { MESSAGES } from '@/lib/i18n/messages';

describe('HTTP error & response helpers (CONT-02)', () => {
  it('jsonSuccess generates 200 with { data }', async () => {
    const res = jsonSuccess({ message: 'ok' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { message: 'ok' } });
  });

  it('jsonCreated generates 201 with { data }', async () => {
    const res = jsonCreated({ id: '123' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ data: { id: '123' } });
  });

  it('jsonError generates proper error payload', async () => {
    const res = jsonError(400, 'INVALID_DATA', 'Error de prueba', {
      name: ['Campo requerido'],
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: 'INVALID_DATA',
        message: 'Error de prueba',
        fieldErrors: {
          name: ['Campo requerido'],
        },
      },
    });
  });

  it('badRequest shortcut sets status 400 and code INVALID_DATA', async () => {
    const res = badRequest(MESSAGES.ERROR_NO_FILE);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_DATA');
    expect(body.error.message).toBe('No se envió ningún archivo.');
  });

  it('notFound shortcut sets status 404 and code NOT_FOUND', async () => {
    const res = notFound(MESSAGES.LIST_NOT_FOUND);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Esta lista ya no existe.');
  });

  it('conflict shortcut sets status 409 and code CONFLICT', async () => {
    const res = conflict(MESSAGES.PRODUCT_ALREADY_IN_STORE);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Este producto ya está en tu tienda.');
  });

  it('unprocessable shortcut sets status 422 and code UNPROCESSABLE', async () => {
    const res = unprocessable(MESSAGES.ERROR_NO_PRODUCTS);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('UNPROCESSABLE');
    expect(body.error.message).toBe('No se pudieron extraer productos del PDF.');
  });

  it('serverError shortcut sets status 500 and code SERVER_ERROR', async () => {
    const res = serverError();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('SERVER_ERROR');
    expect(body.error.message).toBe('Ocurrió un error');
  });

  it('handleApiError processes AppHttpError correctly', async () => {
    const appErr = new AppHttpError(404, 'NOT_FOUND', 'Recurso ausente');
    const res = handleApiError(appErr);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Recurso ausente');
  });

  it('handleApiError processes ZodError into 400 with fieldErrors', async () => {
    const schema = z.object({
      age: z.number().min(18, 'Debe ser mayor de 18'),
    });

    try {
      schema.parse({ age: 10 });
    } catch (err) {
      const res = handleApiError(err);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_DATA');
      expect(body.error.message).toBe('Debe ser mayor de 18');
      expect(body.error.fieldErrors).toBeDefined();
      expect(body.error.fieldErrors?.age).toContain('Debe ser mayor de 18');
    }
  });

  it('handleApiError processes unknown error into 500 SERVER_ERROR', async () => {
    const res = handleApiError(new Error('Fallo de red inesperado'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('SERVER_ERROR');
    expect(body.error.message).toBe('Ocurrió un error');
  });
});
