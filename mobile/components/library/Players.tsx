import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import YoutubePlayer from 'react-native-youtube-iframe';

/**
 * A YouTube video played in the app, never handing off to the YouTube app.
 * Platform-split: Players.web.tsx uses a plain iframe, because the player's
 * web build needs a package this app doesn't ship.
 */
export function VideoPlayer({ videoId, width }: { videoId: string; width: number }) {
  return (
    <YoutubePlayer
      height={(width * 9) / 16}
      width={width}
      videoId={videoId}
      initialPlayerParams={{ rel: false, modestbranding: true }}
      webViewProps={{ allowsInlineMediaPlayback: true, allowsFullscreenVideo: true }}
    />
  );
}

/** A PDF or slide viewer page in a WebView, with a loading cover until it has drawn. */
export function FileFrame({
  uri,
  height,
  loadingLabel,
  color,
  background,
  textStyle,
}: {
  uri: string;
  height: number;
  loadingLabel: string;
  color: string;
  background: string;
  textStyle: object;
}) {
  const [loading, setLoading] = React.useState(true);
  return (
    <View style={{ height }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: '#fff' }}
        onLoadEnd={() => setLoading(false)}
        nestedScrollEnabled
        originWhitelist={['https://*']}
      />
      {loading ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: background,
          }}
        >
          <ActivityIndicator color={color} />
          <Text style={textStyle}>{loadingLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}
