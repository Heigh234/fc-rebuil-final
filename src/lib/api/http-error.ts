import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type {
  ApiErrorCode,
  ApiResponseError,
  ApiResponseSuccess,
} from '@/types/contracts';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Excepción personalizada para errores HTTP de la aplicación.
 */
export class AppHttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'AppHttpError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Crea una respuesta JSON exitosa tipada ({ data: T }).
 */
export function jsonSuccess<T>(data: T, status = 200): NextResponse<ApiResponseSuccess<T>> {
  return NextResponse.json({ data }, { status });
}

/**
 * Crea una respuesta JSON para creación exitosa (201 Created).
 */
export function jsonCreated<T>(data: T): NextResponse<ApiResponseSuccess<T>> {
  return NextResponse.json({ data }, { status: 201 });
}

/**
 * Crea una respuesta JSON de error estandarizada ({ error: { code, message, fieldErrors? } }).
 */
export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>
): NextResponse<ApiResponseError> {
  const payload: ApiResponseError = {
    error: {
      code,
      message,
      ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
    },
  };

  return NextResponse.json(payload, { status });
}

/**
 * Atajo para 400 Bad Request ('INVALID_DATA').
 */
export function badRequest(
  message: string,
  fieldErrors?: Record<string, string[]>
): NextResponse<ApiResponseError> {
  return jsonError(400, 'INVALID_DATA', message, fieldErrors);
}

/**
 * Atajo para 404 Not Found ('NOT_FOUND').
 */
export function notFound(message: string): NextResponse<ApiResponseError> {
  return jsonError(404, 'NOT_FOUND', message);
}

/**
 * Atajo para 409 Conflict ('CONFLICT').
 */
export function conflict(message: string): NextResponse<ApiResponseError> {
  return jsonError(409, 'CONFLICT', message);
}

/**
 * Atajo para 422 Unprocessable Entity ('UNPROCESSABLE').
 */
export function unprocessable(message: string): NextResponse<ApiResponseError> {
  return jsonError(422, 'UNPROCESSABLE', message);
}

/**
 * Atajo para 500 Internal Server Error ('SERVER_ERROR').
 */
export function serverError(message: string = MESSAGES.GENERIC_ERROR): NextResponse<ApiResponseError> {
  return jsonError(500, 'SERVER_ERROR', message);
}

/**
 * Manejador centralizado de errores para Route Handlers.
 * Captura AppHttpError, ZodError y errores inesperados, retornando la respuesta JSON apropiada.
 */
export function handleApiError(error: unknown): NextResponse<ApiResponseError> {
  if (error instanceof AppHttpError) {
    return jsonError(error.status, error.code, error.message, error.fieldErrors);
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.') || 'general';
      if (!fieldErrors[path]) {
        fieldErrors[path] = [];
      }
      fieldErrors[path].push(issue.message);
    }

    const firstMessage = error.issues[0]?.message || 'Datos inválidos.';
    return badRequest(firstMessage, fieldErrors);
  }

  console.error('[API Error]', error);
  return serverError();
}
