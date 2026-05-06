import React, { useEffect, useState } from 'react';
import { useStore } from '../state.jsx';
import { formatDuration, isSingleLineMode } from '../util.js';

const SOURCE_LABELS = {
  initial: 'Initial Round',
  winners: 'Winners Bracket',
  losers: 'Losers Bracket',
  waiting: 'Waiting Line',
  continued: 'King of the Court',
};

function PlayerOnCourt({ id }) {
  const { state } = useStore();
  const p = state.players.find((pl) => pl.id === id);
  if (!p) return <>?</>;
  const single = isSingleLineMode(state.players, state.numCourts);
  if (single && p.consecutiveWins >= 1) {
    const flames = p.consecutiveWins >= 2 ? '🔥🔥' : '🔥';
    const tip = p.consecutiveWins >= 2 ? 'On a 2-game streak — out next' : 'Won last game';
    return (
      <>
        {p.name}
        <span className="streak" title={tip}>{flames}</span>
      </>
    );
  }
  return <>{p.name}</>;
}

function CourtCard({ idx }) {
  const { state, dispatch } = useStore();
  const court = state.courts[idx];
  // tick state forces re-render every second so the timer updates
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!court) return null;

  if (!court.teamA) {
    const w = state.winnersQueue.length;
    const l = state.losersQueue.length;
    const wait = state.waiting.length;
    const single = isSingleLineMode(state.players, state.numCourts);
    let msg;
    if (single) {
      if (wait === 0) msg = 'All players are on courts';
      else if (wait < 4) msg = `Waiting for ${4 - wait} more — currently ${wait} in line`;
      else msg = 'Loading next game...';
    } else if (wait > 0 && wait < 4) {
      msg = `Waiting for ${4 - wait} more in initial round`;
    } else if (w >= 4 || l >= 4 || wait >= 4) {
      msg = 'Loading next game...';
    } else if (w === 0 && l === 0 && wait === 0) {
      msg = 'All players are on courts';
    } else {
      msg = `Waiting for next bracket — W:${w}, L:${l}`;
    }
    return (
      <div className="court empty">
        <div className="court-header">
          <div className="court-name">Court {court.id}</div>
          <span className="court-source-tag">Available</span>
        </div>
        <div className="court-empty-msg">{msg}</div>
      </div>
    );
  }

  const elapsed = court.startTime ? Date.now() - court.startTime : 0;

  return (
    <div className="court">
      <div className="court-header">
        <div className="court-name">Court {court.id}</div>
        {court.source && (
          <span className={`court-source-tag ${court.source}`}>
            {SOURCE_LABELS[court.source] || court.source}
          </span>
        )}
      </div>
      <div className="court-meta-row">
        <span className="court-timer">⏱ {formatDuration(elapsed)}</span>
      </div>
      <div className="teams">
        <div className="team">
          <div className="team-label">Team A</div>
          <div className="team-players">
            {court.teamA.map((pid, i) => (
              <React.Fragment key={pid}>
                {i > 0 && <br />}
                <PlayerOnCourt id={pid} />
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="team-divider">VS</div>
        <div className="team">
          <div className="team-label">Team B</div>
          <div className="team-players">
            {court.teamB.map((pid, i) => (
              <React.Fragment key={pid}>
                {i > 0 && <br />}
                <PlayerOnCourt id={pid} />
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <div className="court-actions">
        <button className="btn-success" onClick={() => dispatch({ type: 'RECORD_WIN', courtIdx: idx, team: 'A' })}>
          Team A Wins
        </button>
        <button className="btn-success" onClick={() => dispatch({ type: 'RECORD_WIN', courtIdx: idx, team: 'B' })}>
          Team B Wins
        </button>
      </div>
    </div>
  );
}

export default function CourtsGrid() {
  const { state } = useStore();
  if (!state.started) {
    return <div className="empty-state">Add players and click "Start Games" to begin</div>;
  }
  return (
    <div className="courts-grid">
      {state.courts.map((_, i) => <CourtCard key={i} idx={i} />)}
    </div>
  );
}
