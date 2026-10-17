import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { SectionHeader } from '@/components/ui';
import {
  sendSupportRequest,
  SUPPORT_MAX_IMAGES,
  uploadSupportImage,
  type SupportAttachment,
  type SupportTopic,
} from '@/lib/api';
import { isNetworkError } from '@/lib/client';

/** Mirrors web/app/lib/support.ts. */
const TOPICS: { value: SupportTopic; label: string }[] = [
  { value: 'problem', label: "Something isn't working" },
  { value: 'question', label: 'How do I…?' },
  { value: 'account', label: 'Account or sign-in' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Something else' },
];

const MAX_SUBJECT = 150;
const MAX_MESSAGE = 4000;
const CONTACT_EMAIL = 'contact@i-care.dev';

/** Plenty for a screenshot to stay readable, and far under the 4 MB cap. */
const MAX_IMAGE_PX = 1600;
const JPEG_QUALITY = 0.8;

type PickedImage = {
  key: string;
  uri: string;
  status: 'uploading' | 'ready' | 'failed';
  attachment?: SupportAttachment;
};

let nextImageKey = 0;

/**
 * Re-encodes a picked image as a JPEG the server accepts: iOS hands back
 * HEIC, and a camera photo runs several times over the upload cap.
 */
async function toUploadableJpeg(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_IMAGE_PX || asset.height > MAX_IMAGE_PX) {
    context.resize(asset.width >= asset.height ? { width: MAX_IMAGE_PX } : { height: MAX_IMAGE_PX });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  return saved.uri;
}

function jpegName(asset: ImagePicker.ImagePickerAsset, index: number): string {
  const base = asset.fileName?.replace(/\.[^.]+$/, '') || `image-${index + 1}`;
  return `${base}.jpg`;
}

function permissionDenied(what: 'camera' | 'photos', canAskAgain: boolean) {
  const subject = what === 'camera' ? 'the camera' : 'your photos';
  if (canAskAgain) {
    Alert.alert('Permission needed', `iCARE++ needs access to ${subject} to attach an image.`);
    return;
  }
  Alert.alert(
    'Permission needed',
    `Access to ${subject} is turned off for iCARE++. You can enable it in Settings.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ],
  );
}

/**
 * Help & Support for students and instructors: writes to the iCARE++ team,
 * with screenshots or photos as proof, and they reply by email. Clinical
 * help from an instructor is Request Assistance.
 */
export default function HelpScreen() {
  const { user } = useAuth();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  const [topic, setTopic] = React.useState<SupportTopic | null>(null);
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [images, setImages] = React.useState<PickedImage[]>([]);
  // Uploads finish one after another, after renders; they patch the latest list.
  const imagesRef = React.useRef<PickedImage[]>([]);

  const commitImages = (next: PickedImage[]) => {
    imagesRef.current = next;
    setImages(next);
  };
  const patchImage = (key: string, patch: Partial<PickedImage>) =>
    commitImages(imagesRef.current.map((img) => (img.key === key ? { ...img, ...patch } : img)));

  const uploading = images.some((img) => img.status === 'uploading');
  const failed = images.some((img) => img.status === 'failed');
  const canSend =
    !!topic &&
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    !sending &&
    !uploading &&
    !failed;

  const addAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const room = SUPPORT_MAX_IMAGES - imagesRef.current.length;
    if (assets.length > room) {
      Alert.alert('Image limit', `You can attach up to ${SUPPORT_MAX_IMAGES} images.`);
    }
    const picked = assets.slice(0, Math.max(0, room)).map((asset) => ({
      asset,
      item: { key: `img-${++nextImageKey}`, uri: asset.uri, status: 'uploading' as const },
    }));
    if (picked.length === 0) return;
    commitImages([...imagesRef.current, ...picked.map((p) => p.item)]);
    // One at a time: a campus connection copes better than with four at once.
    for (const [i, { asset, item }] of picked.entries()) {
      try {
        const uri = await toUploadableJpeg(asset);
        const attachment = await uploadSupportImage(uri, jpegName(asset, i));
        patchImage(item.key, { status: 'ready', attachment });
      } catch (err) {
        patchImage(item.key, { status: 'failed' });
        if (isNetworkError(err)) {
          Alert.alert('Upload failed', 'You appear to be offline. Remove the image and add it again once you reconnect.');
        }
      }
    }
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return permissionDenied('photos', permission.canAskAgain);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: SUPPORT_MAX_IMAGES - imagesRef.current.length,
      // Full quality out of the picker; toUploadableJpeg does the one compression pass.
      quality: 1,
    });
    if (result.canceled) return;
    await addAssets(result.assets);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return permissionDenied('camera', permission.canAskAgain);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    await addAssets([result.assets[0]]);
  };

  /** Android caps Alert at three buttons, which this is. */
  const addImage = () => {
    if (sending) return;
    Alert.alert('Attach an image', 'A screenshot or photo that shows the problem.', [
      { text: 'Take photo', onPress: () => void takePhoto() },
      { text: 'Choose from library', onPress: () => void pickFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeImage = (key: string) => commitImages(imagesRef.current.filter((img) => img.key !== key));

  const handleSend = async () => {
    if (!topic) {
      Alert.alert('Pick a topic', 'Choose what your message is about.');
      return;
    }
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Add the details', 'Write a subject and a message.');
      return;
    }
    setSending(true);
    try {
      await sendSupportRequest({
        topic,
        subject: subject.trim(),
        message: message.trim(),
        attachments: imagesRef.current.flatMap((img) => (img.attachment ? [img.attachment] : [])),
      });
      setTopic(null);
      setSubject('');
      setMessage('');
      commitImages([]);
      setSent(true);
    } catch (err) {
      Alert.alert('Could not send', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="help-buoy" size={24} color="#fff" />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Help & Support</Text>
          <Text style={styles.headerDesc}>
            Report a problem with the app or ask the iCARE++ team a question.
          </Text>
        </View>
      </View>

      {sent ? (
        <View style={styles.card}>
          <View style={[styles.sentIcon, { backgroundColor: Accent.green.bg }]}>
            <Ionicons name="checkmark-circle" size={22} color={Accent.green.fg} />
          </View>
          <Text style={styles.sentTitle}>Message sent</Text>
          <Text style={styles.sentBody}>
            The team will reply to {user?.email ?? 'your account email'}. A copy of your message is
            on its way there too.
          </Text>
          <Pressable
            onPress={() => setSent(false)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Write another message</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <SectionHeader title="What is this about?" />
          <View style={styles.chips}>
            {TOPICS.map((t) => {
              const active = topic === t.value;
              return (
                <Pressable
                  key={t.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTopic(t.value)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.card, styles.form]}>
            <Text style={styles.fieldLabel}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              maxLength={MAX_SUBJECT}
              placeholder="A few words that sum it up"
              placeholderTextColor={Palette.textMuted}
              editable={!sending}
              style={styles.input}
            />

            <Text style={[styles.fieldLabel, styles.fieldGap]}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              maxLength={MAX_MESSAGE}
              placeholder="What were you trying to do, and what happened instead?"
              placeholderTextColor={Palette.textMuted}
              multiline
              editable={!sending}
              style={[styles.input, styles.messageInput]}
            />

            <Text style={[styles.fieldLabel, styles.fieldGap]}>Images (optional)</Text>
            <View style={styles.thumbs}>
              {images.map((img) => (
                <View key={img.key} style={styles.thumb}>
                  <Image source={{ uri: img.uri }} style={styles.thumbImage} contentFit="cover" />
                  {img.status === 'uploading' && (
                    <View style={styles.thumbOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                  {img.status === 'failed' && (
                    <View style={[styles.thumbOverlay, styles.thumbFailed]}>
                      <Ionicons name="alert-circle" size={16} color="#fff" />
                      <Text style={styles.thumbFailedText}>Failed</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => removeImage(img.key)}
                    disabled={sending}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove image"
                    style={styles.thumbRemove}
                  >
                    <Ionicons name="close" size={13} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {images.length < SUPPORT_MAX_IMAGES && (
                <Pressable
                  onPress={addImage}
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel="Attach an image"
                  style={({ pressed }) => [styles.addThumb, pressed && styles.pressed]}
                >
                  <Ionicons name="image-outline" size={20} color={Palette.textSecondary} />
                  <Text style={styles.addThumbText}>Add</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.imageHint}>
              {failed
                ? "Remove the images that didn't upload, then add them again."
                : `Screenshots or photos of the problem, up to ${SUPPORT_MAX_IMAGES}.`}
            </Text>

            <View style={styles.footer}>
              <Text style={styles.counter}>
                {message.length}/{MAX_MESSAGE}
              </Text>
              <Pressable
                onPress={handleSend}
                disabled={!canSend}
                style={({ pressed }) => [
                  styles.sendButton,
                  !canSend && styles.sendDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={15} color="#fff" />
                    <Text style={styles.sendText}>Send</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          <Text style={styles.hint}>
            Your name, role, and email are attached for you. Never send a password.
          </Text>
        </>
      )}

      <Pressable
        onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
        style={({ pressed }) => [styles.emailRow, pressed && styles.pressed]}
      >
        <Ionicons name="mail-outline" size={16} color={Palette.textSecondary} />
        <Text style={styles.emailText}>
          Prefer email? Write to <Text style={styles.emailLink}>{CONTACT_EMAIL}</Text>
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
    pressed: { opacity: 0.7 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Palette.primary,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    headerIcon: {
      width: 46,
      height: 46,
      borderRadius: Radius.md,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    headerDesc: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2, lineHeight: 17 },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.lg,
      ...Shadow.card,
    },
    form: { marginTop: Spacing.md },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: Palette.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    chipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: Palette.textSecondary },
    chipTextActive: { color: '#fff' },
    fieldLabel: { ...Type.caption, fontWeight: '600', marginBottom: Spacing.xs },
    fieldGap: { marginTop: Spacing.md },
    input: {
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm + 2,
      fontSize: 14,
      color: Palette.text,
      backgroundColor: Palette.background,
    },
    messageInput: { minHeight: 140, textAlignVertical: 'top', lineHeight: 20 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.md,
    },
    counter: { ...Type.micro },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Palette.primary,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm + 2,
      borderRadius: Radius.pill,
      minWidth: 92,
      justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.5 },
    thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    thumb: {
      width: 68,
      height: 68,
      borderRadius: Radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: Palette.border,
      backgroundColor: Palette.background,
    },
    thumbImage: { width: '100%', height: '100%' },
    thumbOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    thumbFailed: { backgroundColor: 'rgba(190,18,60,0.75)', gap: 2 },
    thumbFailedText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    thumbRemove: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    addThumb: {
      width: 68,
      height: 68,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: Palette.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    addThumbText: { fontSize: 11, fontWeight: '600', color: Palette.textSecondary },
    imageHint: { ...Type.micro, marginTop: Spacing.xs, lineHeight: 16 },
    sendText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    hint: { ...Type.micro, marginTop: Spacing.sm, lineHeight: 16 },
    sentIcon: {
      width: 42,
      height: 42,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    sentTitle: { ...Type.sectionTitle },
    sentBody: { ...Type.body, color: Palette.textSecondary, marginTop: Spacing.xs, lineHeight: 20 },
    secondaryButton: {
      alignSelf: 'flex-start',
      marginTop: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.pill,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },
    secondaryText: { fontSize: 13, fontWeight: '700', color: Palette.primary },
    emailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.xl,
      paddingVertical: Spacing.sm,
    },
    emailText: { ...Type.caption, flex: 1 },
    emailLink: { color: Palette.primary, fontWeight: '600' },
  });
}
