import { useState } from 'react';
import NoPhotoPlaceholder from './NoPhotoPlaceholder.jsx';
import { cardSrcSet } from '../../lib/imgSrcSet.js';

export default function PropertyImage({ src, srcSet = cardSrcSet(src), sizes = '240px', alt = '', className = '', style, ...rest }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src) {
    return <NoPhotoPlaceholder className={`${className} img-empty`.trim()} style={style} />;
  }
  const candidates = failedSrc === src ? undefined : srcSet;
  return (
    <img
      src={src}
      srcSet={candidates}
      sizes={candidates ? sizes : undefined}
      alt={alt}
      className={className}
      style={style}
      onError={candidates ? () => setFailedSrc(src) : undefined}
      {...rest}
    />
  );
}
