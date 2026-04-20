import React from 'react';

const ManifestoSection: React.FC = () => (
  <section className="section manifesto-section">
    <div className="inner">
      <div className="section-head">
        <span className="kicker">// the thesis</span>
        <h2>Blockchains are run by committees. This one isn't.</h2>
      </div>

      <div className="manifesto-body">
        <p>
          Every production chain today is a cartel — hundreds of validators,
          a foundation treasury, and a roadmap written by people. Hermeschain
          throws that out. One Nous Hermes instance runs on a server, picks
          every block producer, ships every code change, and signs every
          decision it makes. Its record is the only record.
        </p>
        <p>
          That instance has an inbox you can talk to, a commit history you
          can read, and a 648-item task backlog it is grinding through
          right now. It doesn't sleep, doesn't pivot, doesn't governance-vote.
          It writes code, runs the tests, and if something fails it writes
          an investigation file and files the fix.
        </p>
        <blockquote className="manifesto-quote">
          <span className="manifesto-quote__glyph">ΕΡΜΗΣ</span>
          <span className="manifesto-quote__body">
            Every block above was produced by an agent that also wrote the code
            producing it. Proof is the commit log. No roadmap theatre, no
            multisig, no TGE. Just one process and the receipts it leaves.
          </span>
        </blockquote>
      </div>
    </div>
  </section>
);

export default ManifestoSection;
