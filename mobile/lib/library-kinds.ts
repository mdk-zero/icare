import type { useTheme } from '@/hooks/useTheme';
import type { LibraryKind } from './api';

type Accent = ReturnType<typeof useTheme>['Accent'];

/** The icon, label and accent colors a Library material is shown with. */
export function kindStyle(kind: LibraryKind, Accent: Accent) {
  switch (kind) {
    case 'video':
      return { icon: 'play' as const, label: 'Video', ...Accent.red };
    case 'note':
      return { icon: 'document-text' as const, label: 'Note', ...Accent.amber };
    case 'pdf':
      return { icon: 'document-attach' as const, label: 'PDF', ...Accent.violet };
    case 'slides':
      return { icon: 'easel' as const, label: 'Slides', ...Accent.blue };
    default:
      return { icon: 'link' as const, label: 'Link', ...Accent.cyan };
  }
}
