import { useState } from 'react';
import { COMPANY_NAME, LOGO_PATH } from '../../config/branding';

/// The app has never shipped an actual logo image file at LOGO_PATH — every
/// plain `<img src={LOGO_PATH}>` in the codebase silently renders a broken
/// image icon. This renders the real logo when one exists (drop a file at
/// `frontend/public/forays-group-logo.png` and it's picked up automatically,
/// no code change needed) and otherwise falls back to a crisp monogram
/// badge in the app's brand gradient — never a broken-image glyph.
export function BrandMark({ size = 36, rounded = 'rounded-xl' }: { size?: number; rounded?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = COMPANY_NAME.split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (imgFailed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center ${rounded} bg-gradient-to-br from-brand-600 via-brand-500 to-accent-400 font-bold text-white shadow-glow`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-label={COMPANY_NAME}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={LOGO_PATH}
      alt={COMPANY_NAME}
      className={`shrink-0 object-contain ${rounded}`}
      style={{ width: size, height: size }}
      onError={() => setImgFailed(true)}
    />
  );
}
