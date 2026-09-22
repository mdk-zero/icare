import React from 'react';
import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { resolveAvatarUrl, uploadAvatar, type User } from '@/lib/api';
import { isNetworkError } from '@/lib/client';
import { defaultAvatarSource } from '@/lib/default-avatar';
import { useAuth } from './useAuth';

/**
 * What to draw for a user's avatar. `photoUrl` is their own picture, if any —
 * the Account screen words its "Add photo"/"Change photo" off that alone.
 * `source` is what to render: the photo, else the stand-in illustration for
 * their sex, else null for initials.
 *
 * Uploaded avatars are stored as a private bucket path and need signing before
 * they can be displayed; a Google picture URL resolves to itself. Until that
 * settles `source` stays null, so a stranger's illustration never flashes up
 * ahead of the person's own photo.
 */
export function useAvatarImage(
  user: Pick<User, 'id' | 'sex' | 'picture_url'> | null | undefined,
): { photoUrl: string | null; source: { uri: string } | number | null } {
  const pictureUrl = user?.picture_url;
  const [resolved, setResolved] = React.useState<{ from: string; url: string | null } | null>(
    null,
  );

  React.useEffect(() => {
    if (!pictureUrl) return;
    let cancelled = false;
    void (async () => {
      const url = await resolveAvatarUrl(pictureUrl);
      if (!cancelled) setResolved({ from: pictureUrl, url });
    })();
    return () => {
      cancelled = true;
    };
  }, [pictureUrl]);

  const settled = !pictureUrl || resolved?.from === pictureUrl;
  const photoUrl = pictureUrl && settled ? (resolved?.url ?? null) : null;
  const source = photoUrl
    ? { uri: photoUrl }
    : settled
      ? defaultAvatarSource(user?.id, user?.sex)
      : null;
  return { photoUrl, source };
}

/** The avatar is never shown above 96pt; 512px covers every screen density. */
const MAX_AVATAR_PX = 512;
const JPEG_QUALITY = 0.8;

/**
 * Re-encodes a picked photo into something the server will accept.
 *
 * Always re-encodes, never passes the original through: iOS hands back HEIC,
 * which /api/users/avatar rejects outright, and a phone camera file runs
 * several times over its 2 MB cap. Downscaling here turns both into a
 * non-event instead of an error after the student has already chosen a photo.
 */
async function toUploadableJpeg(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_AVATAR_PX || asset.height > MAX_AVATAR_PX) {
    // Constrain the longer edge; the other is derived to keep the ratio.
    context.resize(
      asset.width >= asset.height ? { width: MAX_AVATAR_PX } : { height: MAX_AVATAR_PX },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  return saved.uri;
}

function denied(what: 'camera' | 'photos', canAskAgain: boolean) {
  const subject = what === 'camera' ? 'the camera' : 'your photos';
  if (canAskAgain) {
    Alert.alert('Permission needed', `iCARE++ needs access to ${subject} to set a profile picture.`);
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

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  // A profile picture is rendered in a circle, so crop to a square up front
  // rather than letting the frame decide which part of the photo survives.
  aspect: [1, 1],
  // Full quality out of the picker; toUploadableJpeg does the one compression
  // pass, which beats compressing an already-compressed image twice.
  quality: 1,
};

/**
 * Pick-compress-upload for the signed-in user's profile picture.
 *
 * Shared rather than inlined because both the Account screen and the Profile
 * tab offer it, and the permission, re-encode and error paths are the bulk of
 * the work.
 */
export function useAvatarPicker() {
  const { refreshUser } = useAuth();
  const [uploading, setUploading] = React.useState(false);

  const upload = React.useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      setUploading(true);
      try {
        await uploadAvatar(await toUploadableJpeg(asset));
        // The session carries picture_url, so re-reading it is what makes the
        // new photo appear everywhere at once.
        await refreshUser();
      } catch (err) {
        Alert.alert(
          'Upload failed',
          isNetworkError(err)
            ? 'You appear to be offline. Your photo was not uploaded — try again once you reconnect.'
            : err instanceof Error
              ? err.message
              : 'Could not upload your photo. Please try again.',
        );
      } finally {
        setUploading(false);
      }
    },
    [refreshUser],
  );

  const pickFromLibrary = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return denied('photos', permission.canAskAgain);
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (result.canceled || !result.assets[0]) return;
    await upload(result.assets[0]);
  }, [upload]);

  const takePhoto = React.useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return denied('camera', permission.canAskAgain);
    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    if (result.canceled || !result.assets[0]) return;
    await upload(result.assets[0]);
  }, [upload]);

  /** Opens the source chooser. Android caps Alert at three buttons — this is three. */
  const changeAvatar = React.useCallback(() => {
    if (uploading) return;
    Alert.alert('Profile photo', 'Choose where to get your new photo from.', [
      { text: 'Take photo', onPress: () => void takePhoto() },
      { text: 'Choose from library', onPress: () => void pickFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [uploading, takePhoto, pickFromLibrary]);

  return { uploading, changeAvatar };
}
