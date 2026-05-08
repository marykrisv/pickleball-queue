import React from 'react';
import { useStore, loadArchivedSessions, saveArchivedSessions, SESSIONS_KEY } from '../state.jsx';
import { formatDuration, todayISO } from '../util.js';

// Apply wins locally to state before archiving (no autoFill — session is ending).
function computeStateWithWins(state, selectedWinners) {
  let players = structuredClone(state.players);
  let history = structuredClone(state.history);

  for (const [courtIdxStr, team] of Object.entries(selectedWinners)) {
    const court = state.courts[parseInt(courtIdxStr)];
    if (!court?.teamA) continue;

    const winners = team === 'A' ? court.teamA : court.teamB;
    const losers  = team === 'A' ? court.teamB : court.teamA;
    const nameOf  = (id) => players.find((p) => p.id === id)?.name || '?';

    players = players.map((p) => {
      if (winners.includes(p.id)) {
        const cw = (p.consecutiveWins || 0) + 1;
        return { ...p, wins: p.wins + 1, gamesPlayed: p.gamesPlayed + 1, consecutiveWins: cw, bestStreak: Math.max(p.bestStreak || 0, cw) };
      }
      if (losers.includes(p.id)) {
        return { ...p, losses: p.losses + 1, gamesPlayed: p.gamesPlayed + 1, consecutiveWins: 0 };
      }
      return p;
    });

    const endTime = Date.now();
    history = [
      {
        court: court.id,
        winners: winners.map(nameOf),
        losers: losers.map(nameOf),
        source: court.source,
        time: new Date(endTime),
        durationMs: court.startTime ? endTime - court.startTime : null,
      },
      ...history,
    ];
  }

  return { players, history };
}

export default function SessionCard({ onOpenPast }) {
  const { state, dispatch } = useStore();
  const [archivedCount, setArchivedCount] = React.useState(() => loadArchivedSessions().length);
  const [confirming, setConfirming] = React.useState(null); // null | 'new' | 'end'
  const [selectedWinners, setSelectedWinners] = React.useState({}); // {courtIdx: 'A' | 'B'}

  React.useEffect(() => {
    const onStorage = (e) => {
      if (e.key === SESSIONS_KEY || e.key === null) {
        setArchivedCount(loadArchivedSessions().length);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const playedCount = state.players.filter((p) => p.gamesPlayed > 0).length;
  const totalMs = state.history.reduce((s, h) => s + (h.durationMs || 0), 0);

  const activeCourts = state.courts
    .map((c, idx) => ({ ...c, idx }))
    .filter((c) => c.teamA);

  const nameOf = (id) => state.players.find((p) => p.id === id)?.name || '?';

  const onNew = () => {
    if (state.players.length === 0 && state.history.length === 0) {
      dispatch({ type: 'NEW_SESSION' });
      return;
    }
    setConfirming('new');
  };

  const doNew = () => {
    setConfirming(null);
    dispatch({ type: 'NEW_SESSION' });
    dispatch({ type: 'TOAST', msg: 'New session started' });
  };

  const onEnd = () => {
    if (state.players.length === 0 && state.history.length === 0) {
      dispatch({ type: 'TOAST', msg: 'Nothing to save — session is empty' });
      return;
    }
    setSelectedWinners({});
    setConfirming('end');
  };

  const doEnd = () => {
    setConfirming(null);
    const { players, history } = computeStateWithWins(state, selectedWinners);
    const archived = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: state.sessionName || 'Untitled Session',
      date: state.sessionDate,
      endedAt: new Date().toISOString(),
      players,
      history: history.map((h) => ({
        ...h,
        time: (h.time instanceof Date ? h.time : new Date(h.time)).toISOString(),
      })),
    };
    const sessions = loadArchivedSessions();
    sessions.unshift(archived);
    if (!saveArchivedSessions(sessions)) {
      dispatch({ type: 'TOAST', msg: 'Could not save (storage unavailable)' });
      return;
    }
    setArchivedCount(sessions.length);
    dispatch({ type: 'END_SESSION_LOCAL', msg: `"${archived.name}" saved` });
  };

  return (
    <div className="card session-card">
      <div className="session-header">
        <input
          type="text"
          placeholder="Session name"
          maxLength={80}
          value={state.sessionName || ''}
          onChange={(e) => dispatch({ type: 'SET_SESSION_NAME', value: e.target.value })}
        />
        <input
          type="date"
          value={state.sessionDate || todayISO()}
          onChange={(e) => dispatch({ type: 'SET_SESSION_DATE', value: e.target.value })}
        />
        <button className="btn-ghost" onClick={onNew}>New</button>
        <button
          className="btn-success"
          onClick={onEnd}
          disabled={state.players.length === 0 && state.history.length === 0}
        >
          End Session
        </button>
        <button className="btn-ghost" onClick={onOpenPast}>
          Past Sessions{' '}
          {archivedCount > 0 && <span className="pill">{archivedCount}</span>}
        </button>
      </div>

      {confirming === 'new' && (
        <div className="confirm-bar">
          <span className="confirm-msg">Start a new session? Current players and games will be cleared.</span>
          <div className="confirm-actions">
            <button className="btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
            <button className="btn-primary" onClick={doNew}>Yes, start new</button>
          </div>
        </div>
      )}

      {confirming === 'end' && (
        <div className="confirm-bar confirm-bar-end">
          <div className="confirm-end-top">
            <span className="confirm-msg">
              {activeCourts.length > 0
                ? 'Record the last game result before saving:'
                : `Save "${state.sessionName}" to Past Sessions?`}
            </span>
            <div className="confirm-actions">
              <button className="btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
              <button className="btn-success" onClick={doEnd}>
                {activeCourts.length > 0 && Object.keys(selectedWinners).length < activeCourts.length
                  ? 'Skip & Save'
                  : 'Save Session'}
              </button>
            </div>
          </div>
          {activeCourts.map((court) => {
            const teamANames = court.teamA.map(nameOf).join(' & ');
            const teamBNames = court.teamB.map(nameOf).join(' & ');
            const winner = selectedWinners[court.idx];
            return (
              <div key={court.id} className="court-result-row">
                <span className="court-result-label">Court {court.id}</span>
                <button
                  className={winner === 'A' ? 'btn-success' : 'btn-ghost'}
                  onClick={() => setSelectedWinners((w) => ({ ...w, [court.idx]: 'A' }))}
                >
                  {teamANames} won
                </button>
                <span className="court-result-vs">vs</span>
                <button
                  className={winner === 'B' ? 'btn-success' : 'btn-ghost'}
                  onClick={() => setSelectedWinners((w) => ({ ...w, [court.idx]: 'B' }))}
                >
                  {teamBNames} won
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="session-stats">
        <div className="stat-tile stat-players">
          <div className="stat-label">Players</div>
          <div className="stat-value">{state.players.length}</div>
        </div>
        <div className="stat-tile stat-played">
          <div className="stat-label">Played</div>
          <div className="stat-value">{playedCount}</div>
        </div>
        <div className="stat-tile stat-games">
          <div className="stat-label">Games</div>
          <div className="stat-value">{state.history.length}</div>
        </div>
        <div className="stat-tile stat-time">
          <div className="stat-label">Total Play Time</div>
          <div className="stat-value">{formatDuration(totalMs)}</div>
        </div>
      </div>
    </div>
  );
}
