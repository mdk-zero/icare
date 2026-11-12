import React, { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, PrimaryButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { fetchReturnDemoForms, saveReturnDemoForm, type FilledForm } from '@/lib/api';
import {
  answeredCount,
  formatFieldValue,
  formFields,
  isAsked,
  missingInRows,
  sanitizeRows,
  type FormField,
  type FormRow,
  type ReturnDemoForm,
} from '@/lib/return-demo-forms';

/** The printed pages, by the image name in the form's definition. */
const PAGE_IMAGES: Record<string, ImageSourcePropType> = {
  'philpen-form.png': require('@/assets/forms/philpen-form.png'),
};

/**
 * The forms on a Return Demonstration (094), such as the DOH PhilPEN form,
 * which the student fills in before demonstrating the skills. Each can be
 * looked over first, then filled in on the app, saved as a draft and
 * submitted; the instructor sees the answers written on the printed form.
 * Editable until the grade is final. Renders nothing when there are no forms.
 */
export function ReturnDemoForms({ assignmentId }: { assignmentId: string }) {
  const { Palette, Type } = useTheme();
  const { data } = useApiData(() => fetchReturnDemoForms(assignmentId));
  if (!data || data.forms.length === 0) return null;
  return (
    <View style={{ marginBottom: Spacing.lg }}>
      <Text style={[Type.sectionTitle, { marginBottom: 4 }]}>
        {data.forms.length === 1 ? 'Form to fill in first' : 'Forms to fill in first'}
      </Text>
      <Text style={{ fontSize: 13, color: Palette.textSecondary, marginBottom: Spacing.md, lineHeight: 18 }}>
        {data.locked
          ? 'Your instructor has graded this, so the forms are closed.'
          : 'Start here: fill this in on the app and submit it, then demonstrate the skills below. Your instructor sees your answers on the form.'}
      </Text>
      {data.forms.map((form) => (
        <FormCard key={form.key} assignmentId={assignmentId} form={form} locked={data.locked} />
      ))}
    </View>
  );
}

type Draft = Record<string, string>;

const toDraft = (rows: readonly FormRow[]): Draft =>
  Object.fromEntries(Object.entries(rows[0] ?? {}).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function FormCard({ assignmentId, form: initial, locked }: { assignmentId: string; form: FilledForm; locked: boolean }) {
  const { Palette, Accent } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);
  const [form, setForm] = useState(initial);
  const [open, setOpen] = useState<'preview' | 'fill' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A fresh copy from the server replaces it, unless a window is open on it.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    if (!open) setForm(initial);
  }

  const answers = form.rows[0] ?? {};
  const { answered, asked } = answeredCount(form, answers);
  const started = form.rows.length > 0;
  const status = form.submitted_at
    ? { label: 'Submitted', variant: 'success' as const }
    : started
      ? { label: 'Draft', variant: 'warning' as const }
      : { label: 'Not started', variant: 'default' as const };

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Pressable
          onPress={() => setOpen('preview')}
          accessibilityRole="button"
          accessibilityLabel={`Look over the ${form.title}`}
          style={styles.thumb}
        >
          <Image source={PAGE_IMAGES[form.page.image]} style={styles.thumbImage} resizeMode="cover" />
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{form.title}</Text>
            <Badge label={status.label} variant={status.variant} size="sm" />
          </View>
          <Text style={styles.caption}>{form.description}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${asked ? (answered / asked) * 100 : 0}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {answered} of {asked} answered
          </Text>
        </View>
      </View>

      {notice ? <Text style={styles.ok}>{notice}</Text> : null}

      <View style={styles.actions}>
        <PrimaryButton
          title={locked || form.submitted_at ? 'View on the form' : 'Look over'}
          onPress={() => setOpen('preview')}
          variant="outline"
          size="sm"
          style={{ flex: 1 }}
        />
        {!locked ? (
          <PrimaryButton
            title={form.submitted_at ? 'Edit answers' : started ? 'Continue' : 'Start'}
            onPress={() => {
              setNotice(null);
              setOpen('fill');
            }}
            size="sm"
            style={{ flex: 1 }}
          />
        ) : null}
      </View>

      <PreviewWindow
        visible={open === 'preview'}
        form={form}
        answers={started ? answers : undefined}
        onClose={() => setOpen(null)}
        onStart={locked ? undefined : () => setOpen('fill')}
        startLabel={form.submitted_at ? 'Edit answers' : started ? 'Continue' : 'Start filling in'}
      />
      {open === 'fill' ? (
        <FillWindow
          assignmentId={assignmentId}
          form={form}
          onSaved={setForm}
          onClose={(message) => {
            setOpen(null);
            if (message) setNotice(message);
          }}
        />
      ) : null}
    </Card>
  );
}

/** The printed page, with the answers written on it when there are any. */
function PageView({ form, answers }: { form: ReturnDemoForm; answers?: FormRow }) {
  const [width, setWidth] = useState(0);
  const { width: W, height: H } = form.page;
  const k = width / W;
  const ink = '#1d3fbf';
  const marks: React.ReactNode[] = [];

  if (answers && width > 0) {
    for (const field of formFields(form)) {
      const value = answers[field.key];
      if (value === null || value === undefined || value === '' || !isAsked(field, answers)) continue;
      if (field.at) {
        const text = field.type === 'number' || field.type === 'bp' ? String(value) : formatFieldValue(field, value);
        marks.push(
          <Text
            key={field.key}
            numberOfLines={1}
            style={{
              position: 'absolute',
              left: field.at.x * k,
              top: field.at.y * k,
              width: (field.at.w ?? 60) * k,
              fontSize: 7.4 * k,
              lineHeight: 9 * k,
              fontWeight: '700',
              color: ink,
            }}
          >
            {text}
          </Text>,
        );
        continue;
      }
      const picked = field.type === 'multi' ? String(value).split(',') : [String(value)];
      for (const option of field.options ?? []) {
        if (!option.at || !picked.includes(option.value)) continue;
        const key = `${field.key}:${option.value}`;
        marks.push(
          option.at.w && option.at.h ? (
            <View
              key={key}
              style={{
                position: 'absolute',
                left: (option.at.x - 2) * k,
                top: (option.at.y - 1.5) * k,
                width: (option.at.w + 4) * k,
                height: (option.at.h + 3) * k,
                borderRadius: 999,
                borderWidth: Math.max(1.5, 1.3 * k),
                borderColor: ink,
              }}
            />
          ) : (
            <Text
              key={key}
              style={{
                position: 'absolute',
                left: option.at.x * k,
                top: option.at.y * k,
                width: 6.8 * k,
                height: 10.6 * k,
                fontSize: 10.5 * k,
                lineHeight: 10.6 * k,
                textAlign: 'center',
                fontWeight: '800',
                color: ink,
              }}
            >
              ✓
            </Text>
          ),
        );
      }
    }
  }

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', aspectRatio: W / H, backgroundColor: '#fff', borderRadius: Radius.md, overflow: 'hidden' }}
      accessibilityRole="image"
      accessibilityLabel={answers ? `${form.title} with your answers` : `${form.title}, blank`}
    >
      <Image
        source={PAGE_IMAGES[form.page.image]}
        style={{ position: 'absolute', top: 0, left: 0, width: width || '100%', height: width ? width * (H / W) : '100%' }}
        resizeMode="contain"
      />
      {marks}
    </View>
  );
}

/** Looking the form over: the printed page, before filling it in or with the answers on it. */
function PreviewWindow({
  visible,
  form,
  answers,
  onClose,
  onStart,
  startLabel,
}: {
  visible: boolean;
  form: ReturnDemoForm;
  answers?: FormRow;
  onClose: () => void;
  onStart?: () => void;
  startLabel: string;
}) {
  const { Palette, Accent } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.window, { paddingTop: insets.top }]}>
        <WindowHeader title={form.title} subtitle={form.source} onClose={onClose} styles={styles} />
        <ScrollView contentContainerStyle={styles.previewBody}>
          <View style={styles.previewNote}>
            <Ionicons name={answers ? 'checkmark-done-outline' : 'eye-outline'} size={16} color={Palette.primary} />
            <Text style={styles.previewNoteText}>
              {answers
                ? 'Your answers, written on the form as your instructor sees them.'
                : "This is the form you'll fill in. You answer on the app, and your answers are written on this page for your instructor."}
            </Text>
          </View>
          <PageView form={form} answers={answers} />
        </ScrollView>
        {onStart ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
            <PrimaryButton title={startLabel} onPress={onStart} style={{ flex: 1 }} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function WindowHeader({
  title,
  subtitle,
  onClose,
  styles,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
  children?: React.ReactNode;
}) {
  const { Palette } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
          <Ionicons name="close" size={22} color={Palette.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/**
 * Filling the form in, section by section. Closing keeps what was typed as a
 * draft; Submit checks the required answers first.
 */
function FillWindow({
  assignmentId,
  form,
  onSaved,
  onClose,
}: {
  assignmentId: string;
  form: FilledForm;
  onSaved: (form: FilledForm) => void;
  onClose: (message?: string) => void;
}) {
  const { Palette, Accent } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Draft>(() => toDraft(form.rows));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'submit' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { answered, asked } = answeredCount(form, draft);
  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setError(null);
  };

  const save = async (mode: 'save' | 'submit' | 'close') => {
    const rows = sanitizeRows(form, draft);
    if (mode === 'submit') {
      const missing = missingInRows(form, rows);
      if (missing) return setError(missing);
    }
    if (mode === 'close' && !dirty) return onClose();
    setBusy(mode);
    setError(null);
    try {
      const saved = await saveReturnDemoForm(assignmentId, form.key, rows, mode === 'submit');
      onSaved(saved);
      setDirty(false);
      if (mode === 'submit') onClose('Submitted. Your instructor can see your answers on the form now.');
      else if (mode === 'close') onClose('Draft saved. Continue any time before your instructor grades it.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={() => void save('close')} presentationStyle="fullScreen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.window, { paddingTop: insets.top }]}
      >
        <WindowHeader title={form.title} subtitle={`${answered} of ${asked} answered`} onClose={() => void save('close')} styles={styles}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${asked ? (answered / asked) * 100 : 0}%` }]} />
          </View>
        </WindowHeader>

        <ScrollView contentContainerStyle={styles.fillBody} keyboardShouldPersistTaps="handled">
          {form.sections.map((section, n) => {
            const fields = section.fields.filter((f) => isAsked(f, draft));
            return (
              <View key={section.title} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionNo}>{n + 1}</Text>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
                <View style={styles.sectionCard}>
                  {fields.map((field, i) => (
                    <View key={field.key} style={[styles.field, i > 0 && styles.fieldDivider, field.showIf && styles.followUp]}>
                      <Text style={styles.label}>
                        {field.label}
                        {field.required ? <Text style={{ color: Accent.red.fg }}> *</Text> : null}
                      </Text>
                      {field.hint ? <Text style={styles.hint}>{field.hint}</Text> : null}
                      <FieldInput field={field} value={draft[field.key] ?? ''} onChange={(v) => set(field.key, v)} styles={styles} />
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <PrimaryButton
              title="Save draft"
              onPress={() => void save('save')}
              variant="outline"
              disabled={!dirty || busy !== null}
              loading={busy === 'save'}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              title="Submit"
              onPress={() => void save('submit')}
              disabled={busy !== null}
              loading={busy === 'submit'}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** "2026111" → "2026-11-1": dashes put in as the date is typed. */
function typedDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-');
}

function FieldInput({
  field,
  value,
  onChange,
  styles,
}: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const { Palette } = useTheme();

  if (field.type === 'choice') {
    return (
      <View style={styles.options}>
        {(field.options ?? []).map((o) => {
          const on = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(on ? '' : o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}
              style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && !on && styles.pillPressed]}
            >
              {o.color ? <View style={[styles.swatch, { backgroundColor: o.color }]} /> : null}
              {on && !o.color ? <Ionicons name="checkmark" size={15} color={Palette.white} /> : null}
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.label}</Text>
              {o.detail ? <Text style={[styles.pillDetail, on && styles.pillTextOn]}>{o.detail}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (field.type === 'multi') {
    const picked = new Set(value ? value.split(',') : []);
    return (
      <View style={{ gap: 6 }}>
        {(field.options ?? []).map((o) => {
          const on = picked.has(o.value);
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                const next = new Set(picked);
                if (on) next.delete(o.value);
                else next.add(o.value);
                onChange((field.options ?? []).filter((x) => next.has(x.value)).map((x) => x.value).join(','));
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.check, on && styles.checkOn, pressed && styles.pillPressed]}
            >
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? Palette.primary : Palette.textMuted} />
              <Text style={styles.checkText}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (field.type === 'bp') {
    const [sys = '', dia = ''] = value.split('/');
    const join = (s: string, d: string) => onChange(s || d ? `${s}/${d}` : '');
    return (
      <View style={styles.bpRow}>
        <TextInput
          value={sys}
          onChangeText={(t) => join(t.replace(/\D/g, '').slice(0, 3), dia)}
          keyboardType="number-pad"
          placeholder="120"
          placeholderTextColor={Palette.textMuted}
          style={[styles.input, styles.bpInput]}
          accessibilityLabel={`${field.label}, systolic`}
        />
        <Text style={styles.bpSlash}>/</Text>
        <TextInput
          value={dia}
          onChangeText={(t) => join(sys, t.replace(/\D/g, '').slice(0, 3))}
          keyboardType="number-pad"
          placeholder="80"
          placeholderTextColor={Palette.textMuted}
          style={[styles.input, styles.bpInput]}
          accessibilityLabel={`${field.label}, diastolic`}
        />
        <Text style={styles.unit}>{field.unit}</Text>
      </View>
    );
  }

  if (field.type === 'date') {
    return (
      <View style={styles.dateRow}>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(typedDate(t))}
          keyboardType="number-pad"
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Palette.textMuted}
          maxLength={10}
          style={[styles.input, { flex: 1 }]}
          accessibilityLabel={field.label}
        />
        <Pressable onPress={() => onChange(todayIso())} accessibilityRole="button" style={styles.today}>
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.inputWrap}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={Palette.textMuted}
        keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'}
        multiline={field.type === 'longtext'}
        maxLength={field.type === 'longtext' ? 2000 : 500}
        style={[styles.input, { flex: 1 }, field.type === 'longtext' ? styles.multiline : null]}
        accessibilityLabel={field.label}
      />
      {field.unit ? <Text style={styles.unit}>{field.unit}</Text> : null}
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Accent: ReturnType<typeof useTheme>['Accent']) {
  return StyleSheet.create({
    card: { gap: Spacing.md, marginBottom: Spacing.md },
    cardTop: { flexDirection: 'row', gap: Spacing.md },
    thumb: {
      width: 72,
      height: 102,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: Palette.border,
      overflow: 'hidden',
      backgroundColor: '#fff',
    },
    thumbImage: { width: '100%', height: '100%' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
    title: { fontSize: 16, fontWeight: '700', color: Palette.ink },
    caption: { fontSize: 12, color: Palette.textSecondary, lineHeight: 17 },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: Palette.surfaceMuted, overflow: 'hidden', marginTop: 4 },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: Palette.primary },
    progressText: { fontSize: 12, color: Palette.textSecondary, fontVariant: ['tabular-nums'] },
    actions: { flexDirection: 'row', gap: Spacing.sm },
    ok: { fontSize: 13, color: Accent.green.fg },
    error: { fontSize: 13, color: Accent.red.fg, marginBottom: Spacing.sm },

    window: { flex: 1, backgroundColor: Palette.background },
    header: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      gap: Spacing.sm,
      backgroundColor: Palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: Palette.border,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.surfaceMuted },
    headerTitle: { fontSize: 17, fontWeight: '700', color: Palette.ink },
    headerSubtitle: { fontSize: 12, color: Palette.textSecondary, marginTop: 1, fontVariant: ['tabular-nums'] },
    footer: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      backgroundColor: Palette.surface,
      borderTopWidth: 1,
      borderTopColor: Palette.border,
      flexDirection: 'column',
    },

    previewBody: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xl },
    previewNote: {
      flexDirection: 'row',
      gap: Spacing.sm,
      alignItems: 'flex-start',
      padding: Spacing.md,
      borderRadius: Radius.md,
      backgroundColor: Accent.teal.bg,
    },
    previewNoteText: { flex: 1, fontSize: 13, lineHeight: 18, color: Palette.text },

    fillBody: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xl },
    section: { gap: Spacing.sm },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    sectionNo: {
      width: 24,
      height: 24,
      borderRadius: 12,
      overflow: 'hidden',
      textAlign: 'center',
      lineHeight: 24,
      fontSize: 12,
      fontWeight: '800',
      color: Palette.white,
      backgroundColor: Palette.primary,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink },
    sectionCard: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      paddingHorizontal: Spacing.md,
    },
    field: { paddingVertical: Spacing.md, gap: 6 },
    fieldDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.border },
    followUp: { marginLeft: Spacing.sm, paddingLeft: Spacing.md, borderLeftWidth: 2, borderLeftColor: Palette.primary },
    label: { fontSize: 14, fontWeight: '600', color: Palette.ink, lineHeight: 19 },
    hint: { fontSize: 12, color: Palette.textSecondary, lineHeight: 17 },

    inputWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    input: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.md,
      backgroundColor: Palette.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: Palette.ink,
    },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    unit: { fontSize: 13, fontWeight: '600', color: Palette.textSecondary },
    bpRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    bpInput: { width: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
    bpSlash: { fontSize: 20, color: Palette.textMuted },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    today: {
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayText: { fontSize: 14, fontWeight: '600', color: Palette.primary },

    options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: Palette.border,
      backgroundColor: Palette.surface,
    },
    pillOn: { backgroundColor: Palette.primary, borderColor: Palette.primary },
    pillPressed: { backgroundColor: Palette.surfaceMuted },
    pillText: { fontSize: 14, fontWeight: '600', color: Palette.text },
    pillTextOn: { color: Palette.white },
    pillDetail: { fontSize: 12, color: Palette.textSecondary },
    swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
    check: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.border,
    },
    checkOn: { borderColor: Palette.primary, backgroundColor: Accent.teal.bg },
    checkText: { fontSize: 14, color: Palette.ink, flex: 1 },
  });
}
