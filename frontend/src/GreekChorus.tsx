import React, { useEffect, useState } from 'react';

interface Epithet {
  greek: string;
  meaning: string;
}

const EPITHETS: Epithet[] = [
  { greek: 'ΕΡΜΗΣ ΑΡΓΕΙΦΟΝΤΗΣ', meaning: 'hermes the slayer of argos' },
  { greek: 'ΨΥΧΟΠΟΜΠΟΣ', meaning: 'guide of souls' },
  { greek: 'ΛΟΓΙΟΣ', meaning: 'keeper of the word' },
  { greek: 'ΔΟΛΙΟΣ', meaning: 'of craft and cunning' },
  { greek: 'ΧΘΟΝΙΟΣ', meaning: 'of the living earth' },
  { greek: 'ΔΙΑΚΤΟΡΟΣ', meaning: 'the messenger running between worlds' },
  { greek: 'ΕΝΑΓΩΝΙΟΣ', meaning: 'patron of every contest' },
  { greek: 'ΕΡΙΟΥΝΙΟΣ', meaning: 'the luckbringer' },
];

const ROTATE_MS = 7200;
const FADE_MS = 280;

const GreekChorus: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');

  useEffect(() => {
    const rotate = setInterval(() => {
      setPhase('out');
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % EPITHETS.length);
        setPhase('in');
      }, FADE_MS);
    }, ROTATE_MS);
    return () => clearInterval(rotate);
  }, []);

  const current = EPITHETS[index];

  return (
    <p className={`greek-chorus greek-chorus--${phase}`} aria-live="polite">
      <span className="greek-chorus__glyphs">{current.greek}</span>
      <span className="greek-chorus__sep" aria-hidden="true">·</span>
      <span className="greek-chorus__meaning">{current.meaning}</span>
    </p>
  );
};

export default GreekChorus;
