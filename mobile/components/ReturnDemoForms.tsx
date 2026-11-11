import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, PrimaryButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { fetchReturnDemoForms, saveReturnDemoForm, type FilledForm } from '@/lib/api';
import { formatFieldValue, missingInRows, sanitizeRows, type FormField, type FormRow } from '@/lib/return-demo-forms';

/**
 * The forms on a Return Demonstration (094): sheets such as an IV fluid or
 * TPR sheet that the student fills in, a row per reading, and hands in for
 * their instructor to read while grading. Editable until the grade is final.
 * Renders nothing when the Return Demonstration has no forms.
 */
export function ReturnDemoForms({ assignmentId }: { assignmentId: string }) {
  const { Palette, Type } = useTheme();
  const { data } = useApiData(() => fetchReturnDemoForms(assignmentId));
  if (!data || data.forms.length === 0) return null;
  return (
    <View style={{ marginBottom: Spacing.lg }}>
      <Text style={[Type.sectionTitle, { marginBottom: 4 }]}>Forms</Text>
      <Text style={{ fontSize: 13, color: Palette.textSecondary, marginBottom: Spacing.md }}>
        {data.locked
          ? 'Your instructor has graded this, so the forms are closed.'
          : 'Fill these in and submit them. Your instructor reads them while grading.'}
      </Text>
      {data.forms.map((form) => (
        <FormCard key={form.key} assignmentId={assignmentId} form={form} locked={data.locked} />
      ))}
    </View>
  );
}

type Draft = Record<string, string>[];

const toDraft = (rows: FormRow[]): Draft =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])));

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function FormCard({ assignmentId, form: initial, locked }: { assignmentId: string; form: FilledForm; locked: boolean }) {
  const { Palette, Accent } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);
  const [form, setForm] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial.rows));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  // A fresh copy from the server replaces the sheet, unless there are edits not saved.
  useEffect(() => {
    if (dirty) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(initial);
    setDraft(toDraft(initial.rows));
  }, [initial, dirty]);

  const status = form.submitted_at
    ? { label: 'Submitted', variant: 'success' as const }
    : form.rows.length
      ? { label: 'Draft', variant: 'warning' as const }
      : { label: 'Not started', variant: 'default' as const };

  const change = (i: number, key: string, value: string) => {
    setDraft((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
    setDirty(true);
    setNotice(null);
  };
  const addRow = () => {
    setDraft((rows) => [...rows, Object.fromEntries(form.fields.map((f) => [f.key, f.type === 'time' ? nowHHMM() : '']))]);
    setDirty(true);
    setNotice(null);
  };
  const removeRow = (i: number) => {
    setDraft((rows) => rows.filter((_, j) => j !== i));
    setDirty(true);
  };

  const save = async (submit: boolean) => {
    // Checked here first so the message is instant; the server checks again.
    const rows = sanitizeRows(form, draft);
    if (submit) {
      const missing = missingInRows(form, rows);
      if (missing) return setNotice({ error: true, text: missing });
    }
    setBusy(submit ? 'submit' : 'save');
    setNotice(null);
    try {
      const saved = await saveReturnDemoForm(assignmentId, form.key, rows, submit);
      setForm(saved);
      setDraft(toDraft(saved.rows));
      setDirty(false);
      setNotice({ error: false, text: submit ? 'Submitted. Your instructor can see it now.' : 'Draft saved.' });
    } catch (err) {
      setNotice({ error: true, text: err instanceof Error ? err.message : 'Could not save. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{form.title}</Text>
          <Text style={styles.caption}>{form.description}</Text>
        </View>
        <Badge label={status.label} variant={status.variant} size="sm" />
      </View>

      {draft.length === 0 ? (
        <Text style={styles.empty}>
          {locked ? 'Nothing was entered.' : `No ${form.rowLabel.toLowerCase()}s yet. Add one to start.`}
        </Text>
      ) : (
        draft.map((row, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>
                {form.rowLabel} {i + 1}
              </Text>
              {!locked ? (
                <Pressable
                  onPress={() => removeRow(i)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${form.rowLabel} ${i + 1}`}
                >
                  <Ionicons name="trash-outline" size={16} color={Accent.red.fg} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.fields}>
              {form.fields.map((field) =>
                locked ? (
                  <ReadField key={field.key} field={field} value={row[field.key]} styles={styles} />
                ) : (
                  <EditField
                    key={field.key}
                    field={field}
                    value={row[field.key] ?? ''}
                    onChange={(v) => change(i, field.key, v)}
                    styles={styles}
                  />
                ),
              )}
            </View>
          </View>
        ))
      )}

      {notice ? <Text style={notice.error ? styles.error : styles.ok}>{notice.text}</Text> : null}

      {!locked ? (
        <>
          <PrimaryButton title={`Add ${form.rowLabel.toLowerCase()}`} onPress={addRow} variant="outline" size="sm" />
          <View style={styles.actions}>
            <PrimaryButton
              title="Save draft"
              onPress={() => void save(false)}
              variant="outline"
              disabled={!dirty || busy !== null}
              loading={busy === 'save'}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              title={form.submitted_at && !dirty ? 'Submitted' : 'Submit'}
              onPress={() => void save(true)}
              disabled={busy !== null || (!!form.submitted_at && !dirty)}
              loading={busy === 'submit'}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}

function EditField({
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
  const wide = field.type === 'text' || field.type === 'longtext';
  return (
    <View style={[styles.field, wide ? styles.fieldWide : null]}>
      <Text style={styles.label}>
        {field.label}
        {field.unit ? ` (${field.unit})` : ''}
        {field.required ? ' *' : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder ?? (field.type === 'time' ? 'HH:MM' : '')}
        placeholderTextColor={Palette.textMuted}
        keyboardType={field.type === 'number' ? 'decimal-pad' : field.type === 'time' ? 'numbers-and-punctuation' : 'default'}
        multiline={field.type === 'longtext'}
        maxLength={field.type === 'time' ? 5 : field.type === 'longtext' ? 2000 : 500}
        style={[styles.input, field.type === 'longtext' ? styles.multiline : null]}
        accessibilityLabel={field.label}
      />
    </View>
  );
}

function ReadField({ field, value, styles }: { field: FormField; value: string | undefined; styles: ReturnType<typeof createStyles> }) {
  const shown = value === undefined || value === '' ? null : field.type === 'number' ? Number(value) : value;
  return (
    <View style={[styles.field, field.type === 'longtext' || field.type === 'text' ? styles.fieldWide : null]}>
      <Text style={styles.label}>{field.label}</Text>
      <Text style={styles.value}>{formatFieldValue(field, shown)}</Text>
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Accent: ReturnType<typeof useTheme>['Accent']) {
  return StyleSheet.create({
    card: { gap: Spacing.md, marginBottom: Spacing.md },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    title: { fontSize: 15, fontWeight: '700', color: Palette.ink },
    caption: { fontSize: 12, color: Palette.textSecondary, lineHeight: 17, marginTop: 2 },
    empty: { fontSize: 13, color: Palette.textMuted },
    row: { borderTopWidth: 1, borderTopColor: Palette.borderLight, paddingTop: Spacing.sm, gap: Spacing.sm },
    rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowTitle: { fontSize: 13, fontWeight: '700', color: Palette.textSecondary },
    fields: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    field: { width: '48%', gap: 4 },
    fieldWide: { width: '100%' },
    label: { fontSize: 12, fontWeight: '600', color: Palette.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.md,
      backgroundColor: Palette.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: Palette.ink,
    },
    multiline: { minHeight: 64, textAlignVertical: 'top' },
    value: { fontSize: 14, color: Palette.ink },
    actions: { flexDirection: 'row', gap: Spacing.sm },
    error: { fontSize: 13, color: Accent.red.fg },
    ok: { fontSize: 13, color: Accent.green.fg },
  });
}
