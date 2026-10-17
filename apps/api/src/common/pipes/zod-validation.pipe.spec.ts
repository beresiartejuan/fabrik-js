import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe.js';

const metadata = {} as ArgumentMetadata;

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    quantity: z.number().positive(),
  });
  const pipe = new ZodValidationPipe(schema);

  it('devuelve el valor parseado (y descarta claves desconocidas)', () => {
    const result = pipe.transform({ name: 'Harina', quantity: 2, extra: 'ignored' }, metadata);
    expect(result).toEqual({ name: 'Harina', quantity: 2 });
  });

  it('lanza 400 con la forma de error estable y los issues', () => {
    let caught: BadRequestException | undefined;
    try {
      pipe.transform({ name: '', quantity: -1 }, metadata);
    } catch (error) {
      caught = error as BadRequestException;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    const body = caught?.getResponse() as {
      statusCode: number;
      error: string;
      issues: Array<{ path: string; code: string; message: string }>;
    };
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('ValidationError');
    expect(body.issues.map((issue) => issue.path).sort()).toEqual(['name', 'quantity']);
  });
});
