import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { EmptyState, SkeletonBlock } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { useTheme } from '@/hooks/useTheme';
import { fetchLibraryMaterial, type LibraryMaterialDetail } from '@/lib/api';
import { kindStyle } from '@/lib/library-kinds';
import { FileFrame, VideoPlayer } from '@/components/library/Players';
import { Radius, Spacing } from '@/constants/theme';

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function LibraryMaterialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow, Type), [Palette, Shadow, Type]);
  const loader = React.useCallback(
    async () => ({ data: await fetchLibraryMaterial(String(id)), fromCache: false, cachedAt: null }),
    [id],
  );
  const { data, loading, error, reload } = useApiData<LibraryMaterialDetail>(loader);
  const [showSteps, setShowSteps] = React.useState(false);

  if (loading && !data) {
    return (
      <View style={styles.container} accessibilityLabel="Loading the material">
        <SkeletonBlock width="100%" height={Math.round(Math.min(width, 900) * 9 / 16)} radius={0} />
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <SkeletonBlock width={64} height={20} radius={999} />
            <SkeletonBlock width={110} height={11} />
          </View>
          <SkeletonBlock width="85%" height={22} style={{ marginTop: 4 }} />
          <SkeletonBlock width="55%" height={13} />
          <SkeletonBlock width="40%" height={12} />
          <SkeletonBlock width="100%" height={13} style={{ marginTop: 8 }} />
          <SkeletonBlock width="90%" height={13} />
          <SkeletonBlock width="70%" height={13} />
        </View>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.container}>
        <EmptyState icon="cloud-offline-outline" message={error ?? 'This material is no longer available.'} />
      </View>
    );
  }

  const { material: m, skill, file } = data;
  const k = kindStyle(m.kind, Accent);
  const videoWidth = Math.min(width, 900);
  // PDFs render natively in iOS's WebView and in browsers; Android needs a viewer page.
  const fileUri = file
    ? m.kind === 'pdf' && (Platform.OS === 'ios' || Platform.OS === 'web')
      ? file.direct
      : file.embed
    : null;
  const frameHeight = Math.max(420, height - 260);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: k.label }} />

      {m.kind === 'video' && m.youtube_id ? (
        <View style={styles.videoWrap}>
          <VideoPlayer videoId={m.youtube_id} width={videoWidth} />
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={[styles.kindPill, { backgroundColor: k.bg }]}>
            <Ionicons name={k.icon} size={12} color={k.fg} />
            <Text style={[styles.kindText, { color: k.fg }]}>{k.label}</Text>
          </View>
          {skill ? <Text style={styles.area} numberOfLines={1}>{skill.area}</Text> : null}
        </View>
        <Text style={styles.title}>{m.title}</Text>
        {skill ? <Text style={styles.skill}>{skill.label}</Text> : null}
        {m.author_name ? <Text style={styles.author}>Shared by {m.author_name}</Text> : null}
        {m.description ? <Text style={styles.description}>{m.description}</Text> : null}

        {m.kind === 'note' && m.body_md ? (
          <View style={styles.noteCard}>
            <Markdown
              style={{
                body: { color: Palette.text, fontSize: 15, lineHeight: 22 },
                heading1: { color: Palette.ink, fontSize: 20, fontWeight: '700', marginTop: 8, marginBottom: 4 },
                heading2: { color: Palette.ink, fontSize: 17, fontWeight: '700', marginTop: 8, marginBottom: 4 },
                heading3: { color: Palette.ink, fontSize: 15, fontWeight: '700', marginTop: 6 },
                strong: { fontWeight: '700', color: Palette.ink },
                link: { color: Palette.primary, textDecorationLine: 'underline' },
                blockquote: { backgroundColor: Palette.surfaceMuted, borderLeftColor: Palette.primary, borderLeftWidth: 3, paddingHorizontal: 10 },
                code_inline: { backgroundColor: Palette.surfaceMuted, color: Palette.ink },
                bullet_list: { marginVertical: 4 },
                ordered_list: { marginVertical: 4 },
              }}
              onLinkPress={(url) => {
                void WebBrowser.openBrowserAsync(url);
                return false;
              }}
            >
              {m.body_md}
            </Markdown>
          </View>
        ) : null}

        {m.kind === 'link' && m.url ? (
          <Pressable
            style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.85 }]}
            onPress={() => void WebBrowser.openBrowserAsync(m.url!)}
          >
            <Ionicons name="globe-outline" size={22} color={Palette.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>Open page</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>{m.url}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={Palette.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {(m.kind === 'pdf' || m.kind === 'slides') && (
        <View style={styles.fileSection}>
          <View style={styles.fileBar}>
            <Text style={styles.fileName} numberOfLines={1}>
              {m.file_name ?? 'File'} {formatSize(m.file_size) ? `· ${formatSize(m.file_size)}` : ''}
            </Text>
            {file ? (
              <Pressable hitSlop={8} onPress={() => void WebBrowser.openBrowserAsync(file.direct)}>
                <Text style={styles.fileAction}>Open full screen</Text>
              </Pressable>
            ) : null}
          </View>
          {fileUri ? (
            <FileFrame
              uri={fileUri}
              height={frameHeight}
              loadingLabel={`Loading ${m.kind === 'pdf' ? 'the PDF' : 'the slides'}…`}
              color={Palette.primary}
              background={Palette.surface}
              textStyle={styles.author}
            />
          ) : (
            <Pressable style={styles.retry} onPress={() => void reload()}>
              <Text style={styles.fileAction}>The file could not be opened. Tap to try again.</Text>
            </Pressable>
          )}
        </View>
      )}

      {skill && skill.steps.length > 0 ? (
        <View style={styles.steps}>
          <Pressable style={styles.stepsHeader} onPress={() => setShowSteps((v) => !v)}>
            <Ionicons name="list-outline" size={18} color={Palette.primary} />
            <Text style={styles.stepsTitle}>Skill checklist ({skill.steps.length} steps)</Text>
            <Ionicons name={showSteps ? 'chevron-up' : 'chevron-down'} size={16} color={Palette.textMuted} />
          </Pressable>
          {showSteps ? (
            <View>
              {skill.goal ? <Text style={styles.goal}>Goal: {skill.goal}</Text> : null}
              {skill.steps.map((st, i) => {
                const heading = st.section && st.section !== skill.steps[i - 1]?.section ? st.section : null;
                return (
                  <View key={i}>
                    {heading ? <Text style={styles.stepSection}>{heading}</Text> : null}
                    <View style={styles.step}>
                      <Text style={styles.stepNo}>{st.stepNo}.</Text>
                      <Text style={styles.stepText}>{st.text}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { paddingBottom: 48 },
    videoWrap: { backgroundColor: '#000', alignItems: 'center' },
    body: { padding: Spacing.lg, gap: 6 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    kindPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    kindText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    area: { ...Type.micro, flex: 1 },
    title: { ...Type.title, marginTop: 4 },
    skill: { ...Type.caption, color: Palette.primary, fontWeight: '600' },
    author: Type.micro,
    description: { ...Type.body, marginTop: 6 },
    noteCard: {
      marginTop: Spacing.md,
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.md,
      ...Shadow.card,
    },
    linkCard: {
      marginTop: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.md,
      ...Shadow.card,
    },
    linkTitle: Type.itemTitle,
    linkUrl: Type.micro,
    fileSection: { marginHorizontal: Spacing.lg, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Palette.border },
    fileBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      backgroundColor: Palette.surface,
    },
    fileName: { ...Type.caption, flex: 1 },
    fileAction: { fontSize: 13, fontWeight: '600', color: Palette.primary },
    retry: { padding: Spacing.lg, alignItems: 'center', backgroundColor: Palette.surface },
    steps: {
      margin: Spacing.lg,
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.md,
      ...Shadow.card,
    },
    stepsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepsTitle: { ...Type.itemTitle, flex: 1 },
    goal: { ...Type.caption, fontStyle: 'italic', marginTop: 10 },
    stepSection: { ...Type.eyebrow, marginTop: 12 },
    step: { flexDirection: 'row', gap: 8, marginTop: 8 },
    stepNo: { ...Type.caption, fontWeight: '700', color: Palette.primary, minWidth: 22 },
    stepText: { ...Type.body, flex: 1, fontSize: 13, lineHeight: 19 },
  });
}
