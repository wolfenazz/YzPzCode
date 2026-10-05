// Adapted from React Bits DecryptedText-TS-TW, retrieved through its registry.
// https://reactbits.dev/text-animations/decrypted-text (MIT + Commons Clause; see LICENSE.md)
// Changes: reveals sequentially from the left whenever `text` changes (instead of
// on hover/view), drops the framer-motion wrapper, and renders plain text when
// `disabled`. Screen readers always get the final text.
import { useEffect, useRef, useState } from 'react';

interface DecryptedTextProps {
  text: string;
  className?: string;
  /** Milliseconds between scramble frames. */
  speed?: number;
  characters?: string;
  disabled?: boolean;
}

const DEFAULT_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789-_/';

export default function DecryptedText({
  text,
  className,
  speed = 28,
  characters = DEFAULT_CHARACTERS,
  disabled = false,
}: DecryptedTextProps): React.JSX.Element {
  const [display, setDisplay] = useState(text);
  const previous = useRef(text);

  useEffect(() => {
    // The first render shows the text as-is; only later changes scramble in.
    if (disabled || previous.current === text) {
      previous.current = text;
      setDisplay(text);
      return;
    }
    previous.current = text;
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += Math.max(1, Math.ceil(text.length / 18));
      if (revealed >= text.length) {
        window.clearInterval(timer);
        setDisplay(text);
        return;
      }
      setDisplay(text.split('').map((char, index) => (
        index < revealed || char === ' ' ? char : characters[Math.floor(Math.random() * characters.length)]
      )).join(''));
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, disabled, speed, characters]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
