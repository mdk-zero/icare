import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Card, EmptyState, PrimaryButton, SkeletonBlock } from '@/components/ui';
import { FileFrame } from '@/components/library/Players';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import {
  fetchCase,
  fetchCaseFile,
  uploadCaseFile,
  type CaseDetail,
  type CaseLevel,
  type CaseStatus,
  type CaseUpload,
} from '@/lib/api';
import { scoreDescriptor } from '@/lib/task-ratings';

/**
 * A group's case presentation. The leader uploads the group's slides
 * (PowerPoint or PDF) and can replace them until the group is graded; every
 * member can open them to review. The instructor grades the group as a whole,
 * so every member sees the same grade.
 */

const MAX_BYTES = 50 * 1024 * 1024;
const PDF = 'application/pdf';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const STATUS_BADGE: Record<CaseStatus, { label: string; variant: 'default' | 'warning' | 'info' | 'success' }> = {
  not_started: { label: 'Not handed in', variant: 'default' },
  draft: { label: 'Not handed in', variant: 'default' },
  submitted: { label: 'Awaiting grading', variant: 'info' },
  graded: { label: 'Graded', variant: 'success' },
};

const LEVEL_LABEL: Record<CaseLevel, string> = { 4: 'Excellent', 3: 'Proficient', 2: 'Developing', 1: 'Beginning' };
const LEVEL_BADGE: Record<CaseLevel, 'success' | 'info' | 'warning' | 'danger'> = { 4: 'success', 3: 'info', 2: 'warning', 1: 'danger' };

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** What a picked file is, by MIME type or extension; null when it isn't PDF or PPTX. */
function fileType(name: string, mime: string | undefined): 'pdf' | 'pptx' | null {
  if (mime === PDF) return 'pdf';
  if (mime === PPTX) return 'pptx';
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext === 'pdf' || ext === 'pptx' ? ext : null;
}

export default function CasePresentationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const caseId = id as string;
  const { height } = useWindowDimensions();
  const { Palette, Accent, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Type), [Palette, Accent, Type]);

  const { data, loading, error, fromCache, reload } = useApiData(() => fetchCase(caseId));
  const [file, setFile] = useState<{ url: string; embed: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [picked, setPicked] = useState<CaseUpload | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const group = data?.group ?? null;
  const fileKey = group?.file ? `${group.file.name}:${group.submitted_at}` : null;

  // A fresh short-lived link whenever the group's file changes.
  const loadFile = useCallback(async () => {
    try {
      const signed = await fetchCaseFile(caseId);
      setFile(signed);
      setFileError(null);
    } catch (err) {
      setFile(null);
      setFileError(err instanceof Error ? err.message : 'The slides could not be opened.');
    }
  }, [caseId]);
  useEffect(() => {
    // Sets state only once the request answers; fetching on a change is the point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fileKey && !fromCache) void loadFile();
  }, [fileKey, fromCache, loadFile]);

  // The leader picks a file first; nothing is sent until they press Submit.
  const choose = async () => {
    setNotice(null);
    const result = await DocumentPicker.getDocumentAsync({ type: [PDF, PPTX], copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const type = fileType(asset.name, asset.mimeType);
    if (!type) return setNotice({ error: true, text: 'Pick a PowerPoint (.pptx) or PDF file.' });
    if (asset.size && asset.size > MAX_BYTES) return setNotice({ error: true, text: 'Files can be at most 50 MB.' });
    setPicked({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? (type === 'pdf' ? PDF : PPTX),
      size: asset.size ?? 0,
    });
  };

  const submit = async () => {
    if (!picked) return;
    const replacing = !!group?.file;
    setUploading(true);
    setNotice(null);
    try {
      await uploadCaseFile(caseId, picked);
      setPicked(null);
      setNotice({
        error: false,
        text: `${replacing ? 'File replaced' : 'Submitted'}. Your group and your instructor can open it now.`,
      });
      reload();
    } catch (err) {
      setNotice({ error: true, text: err instanceof Error ? err.message : 'The upload failed. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={[styles.container, styles.content]} accessibilityLabel="Loading your case presentation">
        <View style={styles.header}>
          <SkeletonBlock width="75%" height={22} />
          <View style={styles.headerRow}>
            <SkeletonBlock width={90} height={20} radius={999} />
            <SkeletonBlock width={110} height={12} />
          </View>
          <SkeletonBlock width="90%" height={13} />
        </View>
        <Card style={styles.card}>
          <SkeletonBlock width="40%" height={16} />
          <SkeletonBlock width="100%" height={180} radius={12} />
        </Card>
        <Card style={styles.card}>
          <SkeletonBlock width="30%" height={16} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.memberRow}>
              <SkeletonBlock width={32} height={32} radius={16} />
              <SkeletonBlock width="50%" height={14} />
            </View>
          ))}
        </Card>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Case presentation not found'} />
      </View>
    );
  }

  const badge = STATUS_BADGE[data.status];
  const graded = data.status === 'graded';
  const canUpload = data.is_leader && !graded && !fromCache;
  const deadline = data.presentation.deadline
    ? new Date(data.presentation.deadline).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  // Android's WebView can't show a PDF itself, so it goes through Google's viewer.
  const frameUri = file && group?.file
    ? group.file.type === 'pdf' && Platform.OS === 'android'
      ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(file.url)}`
      : file.embed
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{data.presentation.title}</Text>
        <View style={styles.headerRow}>
          <Badge label={badge.label} variant={badge.variant} size="sm" />
          {group?.late ? <Badge label="Late" variant="danger" size="sm" /> : null}
          {deadline ? <Text style={styles.caption}>Due {deadline}</Text> : null}
        </View>
        {group ? (
          <Text style={styles.caption}>
            {group.name}
            {group.section_name ? ` · ${group.section_name}` : ''}
            {data.is_leader ? ' · You are the group leader' : ''}
          </Text>
        ) : null}
        {fromCache ? <Text style={styles.caption}>Offline — showing your last synced copy.</Text> : null}
        {data.presentation.instructions ? <Text style={styles.instructions}>{data.presentation.instructions}</Text> : null}
      </View>

      {!group ? (
        <EmptyState icon="people-outline" message="You are not in a group for this case presentation." />
      ) : (
        <>
          {graded ? <GradeCard detail={data} styles={styles} /> : null}

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Group slides</Text>
            {group.file ? (
              <>
                <View style={styles.fileRow}>
                  <View
                    style={[
                      styles.fileIcon,
                      { backgroundColor: group.file.type === 'pptx' ? Accent.amber.bg : Accent.red.bg },
                    ]}
                  >
                    <Ionicons
                      name="document-outline"
                      size={18}
                      color={group.file.type === 'pptx' ? Accent.amber.fg : Accent.red.fg}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.fileName} numberOfLines={2}>
                      {group.file.name}
                    </Text>
                    <Text style={styles.caption}>
                      {group.file.type === 'pptx' ? 'PowerPoint' : 'PDF'}
                      {group.file.size ? ` · ${formatSize(group.file.size)}` : ''}
                      {group.file.uploaded_by_name ? ` · by ${group.file.uploaded_by_name}` : ''}
                    </Text>
                  </View>
                </View>
                {frameUri ? (
                  <>
                    <FileFrame
                      uri={frameUri}
                      height={Math.max(360, Math.round(height * 0.55))}
                      loadingLabel="Loading the slides…"
                      color={Palette.primary}
                      background={Palette.surface}
                      textStyle={styles.caption}
                    />
                    <Pressable hitSlop={8} onPress={() => void WebBrowser.openBrowserAsync(file!.url)}>
                      <Text style={styles.link}>Open full screen</Text>
                    </Pressable>
                  </>
                ) : fileError ? (
                  <View style={styles.center}>
                    <Text style={styles.caption}>{fileError}</Text>
                    <Pressable onPress={() => void loadFile()} hitSlop={8}>
                      <Text style={styles.link}>Try again</Text>
                    </Pressable>
                  </View>
                ) : fromCache ? (
                  <Text style={styles.caption}>Connect to the internet to open the slides.</Text>
                ) : null}
              </>
            ) : (
              <View style={styles.emptyFile}>
                <Ionicons name="cloud-upload-outline" size={26} color={Palette.textMuted} />
                <Text style={styles.emptyText}>
                  {data.is_leader
                    ? 'Choose your group’s slides, then press Submit. PowerPoint (.pptx) or PDF, up to 50 MB.'
                    : `${group.leader_name ?? 'Your group leader'} uploads the slides. You can open them here once they are in.`}
                </Text>
              </View>
            )}

            {canUpload && picked ? (
              <View style={styles.picked}>
                <Text style={styles.label}>{group.file ? 'New file, not submitted yet' : 'Ready to submit'}</Text>
                <View style={styles.fileRow}>
                  <Ionicons name="document-attach-outline" size={20} color={Palette.primary} />
                  <View style={styles.flex}>
                    <Text style={styles.fileName} numberOfLines={2}>
                      {picked.name}
                    </Text>
                    {picked.size ? <Text style={styles.caption}>{formatSize(picked.size)}</Text> : null}
                  </View>
                </View>
                {group.file ? (
                  <Text style={styles.caption}>Submitting replaces “{group.file.name}” for your whole group.</Text>
                ) : null}
              </View>
            ) : null}

            {notice ? <Text style={notice.error ? styles.errorText : styles.okText}>{notice.text}</Text> : null}

            {canUpload ? (
              <View style={styles.actions}>
                <PrimaryButton
                  title={picked || group.file ? 'Replace file' : 'Choose file'}
                  variant={picked ? 'outline' : 'primary'}
                  onPress={() => void choose()}
                  disabled={uploading}
                  style={styles.flex}
                />
                {picked ? (
                  <PrimaryButton
                    title="Submit"
                    onPress={() => void submit()}
                    loading={uploading}
                    disabled={uploading}
                    style={styles.flex}
                  />
                ) : null}
              </View>
            ) : !data.is_leader && !graded ? (
              <Text style={styles.caption}>Only the group leader can upload or replace the slides.</Text>
            ) : null}
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Members · {group.members.length}</Text>
            {group.members.map((m) => (
              <View key={m.student_id} style={styles.memberRow}>
                <Avatar name={m.name} imageUrl={m.picture_url ?? undefined} size="sm" />
                <Text style={[styles.flex, styles.memberName]} numberOfLines={1}>
                  {m.name}
                </Text>
                {m.is_leader ? <Badge label="Leader" variant="warning" size="sm" /> : null}
              </View>
            ))}
            <Text style={styles.caption}>Graded as a group: every member gets the group’s score.</Text>
          </Card>

          {data.status === 'submitted' ? (
            <View style={styles.center}>
              <Ionicons name="hourglass-outline" size={20} color={Palette.textMuted} />
              <Text style={styles.caption}>Handed in — waiting for your instructor to grade it.</Text>
              <Pressable onPress={reload} hitSlop={8}>
                <Text style={styles.link}>Check again</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function GradeCard({ detail, styles }: { detail: CaseDetail; styles: ReturnType<typeof createStyles> }) {
  const byKey = new Map(detail.ratings.map((r) => [r.criterion, r]));
  const score = detail.group?.score ?? 0;
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>Your group’s grade</Text>
      <Text style={styles.score}>
        {score}% · {scoreDescriptor(score)}
      </Text>
      {detail.criteria.map((c) => {
        const r = byKey.get(c.key);
        return (
          <View key={c.key} style={styles.gradeRow}>
            <View style={styles.flex}>
              <Text style={styles.gradeLabel}>{c.label}</Text>
              <Text style={styles.caption}>
                {r ? `${Math.round(((c.weight * r.level) / 4) * 100) / 100} of ${c.weight} points` : `${c.weight}%`}
              </Text>
              {r?.remarks ? <Text style={styles.caption}>{r.remarks}</Text> : null}
            </View>
            {r ? <Badge label={LEVEL_LABEL[r.level]} variant={LEVEL_BADGE[r.level]} size="sm" /> : null}
          </View>
        );
      })}
      {detail.group?.remarks ? <Text style={styles.instructions}>“{detail.group.remarks}”</Text> : null}
    </Card>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 64, gap: Spacing.lg },
    center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
    header: { gap: Spacing.sm },
    headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
    title: Type.title,
    caption: Type.caption,
    instructions: { ...Type.body, fontStyle: 'italic' },
    card: { gap: Spacing.md },
    sectionTitle: Type.sectionTitle,
    flex: { flex: 1 },
    link: { ...Type.caption, color: Palette.primary, fontWeight: '600' },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    fileIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    fileName: Type.itemTitle,
    emptyFile: {
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.lg,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: Palette.border,
      backgroundColor: Palette.surfaceMuted,
    },
    emptyText: { ...Type.caption, textAlign: 'center' },
    label: { fontSize: 13, fontWeight: '600', color: Palette.textSecondary },
    picked: {
      gap: Spacing.sm,
      padding: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.primary,
      backgroundColor: Palette.surfaceMuted,
    },
    actions: { flexDirection: 'row', gap: Spacing.sm },
    errorText: { fontSize: 13, color: Accent.red.fg },
    okText: { fontSize: 13, color: Accent.green.fg },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    memberName: { fontSize: 15, color: Palette.ink },
    score: { fontSize: 22, fontWeight: '800', color: Palette.ink },
    gradeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6 },
    gradeLabel: Type.itemTitle,
  });
}
