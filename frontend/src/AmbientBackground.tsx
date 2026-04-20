import React, { useMemo } from 'react';

const GLYPHS = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ01';

interface Drop {
  id: number;
  char: string;
  left: number;
  startDelay: number;
  duration: number;
  opacity: number;
  fontSize: number;
}

function seededRandom(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t * 9301 + 49297) % 233280;
    return t / 233280;
  };
}

function buildDrops(count: number, seed: number): Drop[] {
  const random = seededRandom(seed);
  const drops: Drop[] = [];
  for (let index = 0; index < count; index += 1) {
    drops.push({
      id: index,
      char: GLYPHS[Math.floor(random() * GLYPHS.length)],
      left: random() * 100,
      startDelay: random() * 18,
      duration: 16 + random() * 18,
      opacity: 0.04 + random() * 0.08,
      fontSize: 12 + Math.floor(random() * 10),
    });
  }
  return drops;
}

const AmbientBackground: React.FC = () => {
  const drops = useMemo(() => buildDrops(36, 7777), []);

  return (
    <div className="ambient-bg" aria-hidden="true">
      {drops.map((drop) => (
        <span
          key={drop.id}
          className="ambient-bg__drop"
          style={{
            left: `${drop.left}%`,
            animationDelay: `-${drop.startDelay}s`,
            animationDuration: `${drop.duration}s`,
            opacity: drop.opacity,
            fontSize: `${drop.fontSize}px`,
          }}
        >
          {drop.char}
        </span>
      ))}
    </div>
  );
};

export default AmbientBackground;
