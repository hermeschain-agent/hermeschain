import React, { useEffect, useState } from 'react';

interface BootLine {
  text: string;
  delay: number;
  status?: 'OK' | 'WARN' | 'INFO';
}

const BOOT_LINES: BootLine[] = [
  { text: 'HERMESCHAIN OS v0.4.1', delay: 0, status: 'INFO' },
  { text: 'initializing /dev/chain', delay: 200, status: 'OK' },
  { text: 'attaching hermes-agent (haiku-4-5)', delay: 360, status: 'OK' },
  { text: 'verifying genesis seal', delay: 540, status: 'OK' },
  { text: 'mounting state trie', delay: 700, status: 'OK' },
  { text: 'restoring block producer', delay: 840, status: 'OK' },
  { text: 'opening portal', delay: 1020, status: 'OK' },
];

const DISMISS_AT_MS = 1900;
const STORAGE_KEY = 'hermeschain-boot-seen';

const BootSequence: React.FC = () => {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [fadingOut, setFadingOut] = useState(false);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!visible) return;

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    BOOT_LINES.forEach((_, index) => {
      timers.push(
        setTimeout(
          () => setRevealed((prev) => Math.max(prev, index + 1)),
          BOOT_LINES[index].delay
        )
      );
    });
    const fadeTimer = setTimeout(() => setFadingOut(true), DISMISS_AT_MS);
    const removeTimer = setTimeout(() => {
      setVisible(false);
      try {
        window.sessionStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* noop */
      }
    }, DISMISS_AT_MS + 480);

    const skip = (event: KeyboardEvent | MouseEvent) => {
      if ('key' in event && event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Escape') {
        if (event.type === 'keydown') return;
      }
      setFadingOut(true);
      setTimeout(() => {
        setVisible(false);
        try {
          window.sessionStorage.setItem(STORAGE_KEY, '1');
        } catch {
          /* noop */
        }
      }, 300);
    };

    window.addEventListener('keydown', skip);
    window.addEventListener('click', skip);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('click', skip);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={`boot-seq ${fadingOut ? 'boot-seq--fade' : ''}`} aria-hidden="true">
      <div className="boot-seq__frame">
        <div className="boot-seq__header">
          <span className="boot-seq__led" />
          <span>tty://hermeschain-os</span>
          <span className="boot-seq__skip">press any key to skip</span>
        </div>
        <div className="boot-seq__body">
          {BOOT_LINES.slice(0, revealed).map((line, index) => (
            <div key={index} className="boot-seq__line">
              <span className="boot-seq__prompt">$</span>
              <span className="boot-seq__text">{line.text}</span>
              <span className={`boot-seq__status boot-seq__status--${line.status?.toLowerCase()}`}>
                [{line.status}]
              </span>
            </div>
          ))}
          {revealed < BOOT_LINES.length ? (
            <div className="boot-seq__cursor" aria-hidden="true" />
          ) : (
            <div className="boot-seq__ready">&gt; READY</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BootSequence;
