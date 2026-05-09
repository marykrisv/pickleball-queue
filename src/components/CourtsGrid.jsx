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
  const [, tick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTeamA, setEditTeamA] = useState([]);
  const [editTeamB, setEditTeamB] = useState([]);

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

  // Players currently on ALL courts (to exclude from available options)
  const playersOnCourts = new Set(
    state.courts.flatMap((c) => (c.teamA ? [...c.teamA, ...c.teamB] : []))
  );

  // Available players: not on any court, or in queues/waiting
  const availablePlayers = state.players.filter((p) => !playersOnCourts.has(p.id));

  function startEditing() {
    setEditTeamA([...court.teamA]);
    setEditTeamB([...court.teamB]);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  function saveEditing() {
    if (editTeamA.length === 2 && editTeamB.length === 2) {
      dispatch({ type: 'EDIT_COURT_PLAYERS', courtIdx: idx, teamA: editTeamA, teamB: editTeamB });
    }
    setEditing(false);
  }

  function getSlotOptions(currentId, slotTeam, slotIdx) {
    // All 4 current edit slots
    const allEditIds = [...editTeamA, ...editTeamB];
    // Options: current player for this slot + available players not used in other slots
    return state.players.filter((p) => {
      if (p.id === currentId) return true; // always include current
      if (allEditIds.includes(p.id)) return false; // already used in another slot
      // Include if not on any other court (excluding this court's players)
      const onOtherCourt = state.courts.some((c, i) => {
        if (i === idx) return false;
        return c.teamA && (c.teamA.includes(p.id) || c.teamB.includes(p.id));
      });
      return !onOtherCourt;
    });
  }

  function updateSlot(team, slotIdx, newId) {
    if (team === 'A') {
      const updated = [...editTeamA];
      updated[slotIdx] = newId;
      setEditTeamA(updated);
    } else {
      const updated = [...editTeamB];
      updated[slotIdx] = newId;
      setEditTeamB(updated);
    }
  }

  if (editing) {
    return (
      <div className="court court-editing">
        <div className="court-header">
          <div className="court-name">Court {court.id} — Edit Players</div>
          {court.source && (
            <span className={`court-source-tag ${court.source}`}>
              {SOURCE_LABELS[court.source] || court.source}
            </span>
          )}
        </div>
        <div className="court-edit-teams">
          <div className="court-edit-team">
            <div className="team-label">Team A</div>
            {editTeamA.map((pid, i) => (
              <select
                key={i}
                className="court-edit-select"
                value={pid}
                onChange={(e) => updateSlot('A', i, e.target.value)}
              >
                {getSlotOptions(pid, editTeamA, i).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ))}
          </div>
          <div className="court-edit-vs">VS</div>
          <div className="court-edit-team">
            <div className="team-label">Team B</div>
            {editTeamB.map((pid, i) => (
              <select
                key={i}
                className="court-edit-select"
                value={pid}
                onChange={(e) => updateSlot('B', i, e.target.value)}
              >
                {getSlotOptions(pid, editTeamB, i).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ))}
          </div>
        </div>
        <div className="court-edit-actions">
          <button className="btn btn-ghost" onClick={cancelEditing}>Cancel</button>
          <button className="btn btn-primary" onClick={saveEditing}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="court">
      <div className="court-header">
        <div className="court-name">Court {court.id}</div>
        {court.source && (
          <span className={`court-source-tag ${court.source}`}>
            {SOURCE_LABELS[court.source] || court.source}
          </span>
        )}
        <button className="btn btn-ghost court-edit-btn" onClick={startEditing} title="Edit players">
          Edit
        </button>
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
