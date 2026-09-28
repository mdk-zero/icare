import React from 'react';

function Frame({ uri, height }: { uri: string; height: number }) {
  return React.createElement('iframe', {
    src: uri,
    style: { width: '100%', height, border: 0, backgroundColor: '#fff' },
    allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
    allowFullScreen: true,
  });
}

/** Web: the privacy-enhanced YouTube embed in an iframe. */
export function VideoPlayer({ videoId, width }: { videoId: string; width: number }) {
  return <Frame uri={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`} height={(width * 9) / 16} />;
}

/** Web: the file (or its viewer page) in an iframe. */
export function FileFrame({ uri, height }: { uri: string; height: number; loadingLabel: string; color: string; background: string; textStyle: object }) {
  return <Frame uri={uri} height={height} />;
}
