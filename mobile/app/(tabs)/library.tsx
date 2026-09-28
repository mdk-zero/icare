import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, SkeletonScreen, EmptyState } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchLibrary, type LibraryItem, type LibraryKind } from '@/lib/api';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { kindStyle } from '@/lib/library-kinds';

type Accent = ReturnType<typeof useTheme>['Accent'];

type Filter = 'all' | 'video' | 'read' | 'file' | 'link';

const FILTERS: { id: Filter; label: string; kinds: LibraryKind[] }[] = [
  { id: 'all', label: 'All', kinds: ['video', 'note', 'pdf', 'slides', 'link'] },
  { id: 'video', label: 'Videos', kinds: ['video'] },
  { id: 'read', label: 'Notes', kinds: ['note'] },
  { id: 'file', label: 'Handouts', kinds: ['pdf', 'slides'] },
  { id: 'link', label: 'Links', kinds: ['link'] },
];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow, Type), [Palette, Shadow, Type]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchLibrary);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set());

  // "New" dots clear after a material is opened.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  if (loading && !data) {
    return <SkeletonScreen topOffset={insets.top + 88} />;
  }

  const kinds = FILTERS.find((f) => f.id === filter)!.kinds;
  const chapters = (data?.chapters ?? [])
    .map((c) => ({
      ...c,
      skills: c.skills
        .map((s) => ({ ...s, materials: s.materials.filter((m) => kinds.includes(m.kind)) }))
        .filter((s) => s.materials.length > 0),
    }))
    .filter((c) => c.skills.length > 0);

  const open = (m: LibraryItem) => router.push(`/library/${m.id}`);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <ScreenHeader
        eyebrow="Study Materials"
        title="Library"
        subtitle={
          data?.total
            ? `${data.total} material${data.total === 1 ? '' : 's'}${data.unseen ? ` · ${data.unseen} new` : ''}`
            : 'From your instructors'
        }
        icon="library-outline"
        accent="teal"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => {
          const on = f.id === filter;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.chip, on && { backgroundColor: Palette.primary, borderColor: Palette.primary }]}
            >
              <Text style={[styles.chipText, on && { color: '#fff' }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error && !data ? <EmptyState icon="cloud-offline-outline" message={error} /> : null}
      {data && chapters.length === 0 ? (
        <EmptyState
          icon="library-outline"
          message={
            data.total === 0
              ? 'Nothing here yet. Videos, notes and handouts your instructors publish for each skill will appear here.'
              : 'No materials of this type yet.'
          }
        />
      ) : null}

      {chapters.map((c) => {
        const isCollapsed = collapsed.has(c.chapter);
        return (
          <View key={c.chapter} style={styles.chapter}>
            <Pressable
              style={styles.chapterHeader}
              onPress={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(c.chapter)) next.delete(c.chapter);
                  else next.add(c.chapter);
                  return next;
                })
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>Chapter {c.chapter}</Text>
                <Text style={styles.chapterTitle}>{c.area}</Text>
              </View>
              <Ionicons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Palette.textMuted} />
            </Pressable>

            {!isCollapsed &&
              c.skills.map((s) => (
                <View key={s.id} style={styles.skill}>
                  <Text style={styles.skillTitle}>
                    <Text style={styles.skillId}>Skill {s.id} · </Text>
                    {s.title}
                  </Text>
                  {s.materials.map((m) => (
                    <MaterialRow key={m.id} item={m} onPress={() => open(m)} styles={styles} Accent={Accent} Palette={Palette} />
                  ))}
                </View>
              ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function MaterialRow({
  item,
  onPress,
  styles,
  Accent,
  Palette,
}: {
  item: LibraryItem;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  Accent: Accent;
  Palette: ReturnType<typeof useTheme>['Palette'];
}) {
  const k = kindStyle(item.kind, Accent);
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}>
      {item.kind === 'video' && item.youtube_id ? (
        <View style={styles.thumbWrap}>
          <Image source={{ uri: `https://i.ytimg.com/vi/${item.youtube_id}/mqdefault.jpg` }} style={styles.thumb} contentFit="cover" />
          <View style={styles.playBadge}>
            <Ionicons name="play" size={12} color="#fff" />
          </View>
        </View>
      ) : (
        <View style={[styles.kindIcon, { backgroundColor: k.bg }]}>
          <Ionicons name={k.icon} size={20} color={k.fg} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.kindLabel, { color: k.fg }]}>{k.label}</Text>
          {item.author_name ? <Text style={styles.rowAuthor} numberOfLines={1}>· {item.author_name}</Text> : null}
        </View>
      </View>
      {!item.seen ? <View style={[styles.newDot, { backgroundColor: Accent.red.fg }]} /> : null}
      <Ionicons name="chevron-forward" size={16} color={Palette.textFaint} />
    </Pressable>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 128 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    filters: { gap: 8, paddingVertical: Spacing.md },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: Palette.border,
      backgroundColor: Palette.surface,
    },
    chipText: { fontSize: 13, fontWeight: '600', color: Palette.text },
    chapter: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      marginBottom: Spacing.md,
      overflow: 'hidden',
      ...Shadow.card,
    },
    chapterHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
    eyebrow: Type.eyebrow,
    chapterTitle: { ...Type.sectionTitle, marginTop: 2 },
    skill: { borderTopWidth: 1, borderTopColor: Palette.borderLight, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    skillTitle: { ...Type.caption, fontWeight: '600', color: Palette.text, marginBottom: 6 },
    skillId: { color: Palette.primary, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    thumbWrap: { width: 88, height: 50, borderRadius: 8, overflow: 'hidden', backgroundColor: Palette.surfaceMuted },
    thumb: { width: '100%', height: '100%' },
    playBadge: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    kindIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowTitle: Type.itemTitle,
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    kindLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    rowAuthor: { ...Type.micro, flexShrink: 1 },
    newDot: { width: 8, height: 8, borderRadius: 4 },
  });
}
