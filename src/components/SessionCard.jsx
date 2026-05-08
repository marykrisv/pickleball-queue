import React from 'react';
import { useStore, loadArchivedSessions, saveArchivedSessions, SESSIONS_KEY } from '../state.jsx';
import { formatDuration, todayISO } from '../util.js';

export default function SessionCard({ onOpenPast }) {
  const { state, dispatch } = useStore();
  const [archivedCount, setArchivedCount] = React.useState(() => loadArchivedSessions().length);
  const [confirming, setConfirming] = React.useState(null); // null | 'new' | 'end'

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
    setConfirming('end');
  };

  const doEnd = () => {
    setConfirming(null);
    const archived = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: state.sessionName || 'Untitled Session',
      date: state.sessionDate,
      endedAt: new Date().toISOString(),
      players: structuredClone(state.players),
      history: structuredClone(state.history).map((h) => ({
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

  const activeGame = state.courts.some((c) => c.teamA);

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
        <div className="confirm-bar">
          <span className="confirm-msg">
            {activeGame
              ? `End "${state.sessionName}"? The current game in progress won't be recorded.`
              : `Save "${state.sessionName}" to Past Sessions?`}
          </span>
          <div className="confirm-actions">
            <button className="btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
            <button className="btn-success" onClick={doEnd}>Yes, end session</button>
          </div>
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
