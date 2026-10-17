'use client';

import { RequireRole } from '@/components/guards';
import { RecipeEditorScreen } from '@/components/recipes/recipe-editor-screen';

/** Ruta `/recetas/nueva` (pantalla 7): solo admin crea recetas. */
export default function NuevaRecetaPage() {
  return (
    <RequireRole roles={['admin']}>
      <RecipeEditorScreen canWrite />
    </RequireRole>
  );
}
