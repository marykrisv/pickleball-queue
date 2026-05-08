import React, { useEffect, useState } from 'react';
import { useStore, loadArchivedSessions, saveArchivedSessions } from '../state.jsx';
import { computeLeaderboard, exportCsv, exportMarkdown, exportJson, exportPdf, archivedAsSession } from '../exports.js';
import { formatDuration } from '../util.js';

export default function PastSessionsModal({ onClose }) {
  const { dispatch } = useStore();
  const [sessions, setSessions] = useState(() => loadArchivedSessions());
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onDelete = (id) => setConfirmDeleteId(id);

  const doDelete = (id) => {
    const next = sessions.filter((s) => s.id !== id);
    saveArchivedSessions(next);
    setSessions(next);
    if (expandedId === id) setExpandedId(null);
    setConfirmDeleteId(null);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <h2>Past Sessions</h2>
          <button className="btn-ghost modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {sessions.length === 0 ? (
            <div className="past-sessions-empty">
              No archived sessions yet. Click "End Session" to save your current one.
            </div>
          ) : (
            sessions.map((s) => {
              const playedCount = s.players.filter((p) => p.gamesPlayed > 0).length;
              const totalMs = s.history.reduce((sum, h) => sum + (h.durationMs || 0), 0);
              const ended = s.endedAt ? new Date(s.endedAt).toLocaleString() : '';
              const sessionObj = archivedAsSession(s);
              const isOpen = expandedId === s.id;
              const isConfirmingDelete = confirmDeleteId === s.id;
              return (
                <div key={s.id} className="archived-session">
                  <div className="archived-session-header">
                    <div>
                      <strong>{s.name}</strong>
                      <div className="meta">
                        {s.date} • {s.players.length} players ({playedCount} played) • {s.history.length} games • {formatDuration(totalMs)} play time
                        {ended ? ` • ended ${ended}` : ''}
                      </div>
                    </div>
                    <div className="archived-session-actions">
                      <button
                        className="btn-primary"
                        onClick={() => setExpandedId(isOpen ? null : s.id)}
                      >
                        {isOpen ? 'Hide' : 'View'}
                      </button>
                      <button className="btn-ghost" onClick={() => exportCsv(sessionObj)}>CSV</button>
                      <button
                        className="btn-ghost"
                        onClick={() => exportMarkdown(sessionObj, (msg) => dispatch({ type: 'TOAST', msg }))}
                      >
                        Markdown
                      </button>
                      <button className="btn-ghost" onClick={() => exportJson(sessionObj)}>JSON</button>
                      <button className="btn-ghost" onClick={() => exportPdf(sessionObj, (msg) => dispatch({ type: 'TOAST', msg }))}>PDF</button>
                      {isConfirmingDelete ? (
                        <>
                          <button className="btn-danger" onClick={() => doDelete(s.id)}>Confirm Delete</button>
                          <button className="btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn-danger" onClick={() => onDelete(s.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                  {isOpen && <ArchivedDetails session={s} />}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ArchivedDetails({ session }) {
  const board = computeLeaderboard(session.players);
  return (
    <div className="archived-session-details">
      <h4>Leaderboard</h4>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>#</th><th>Name</th>
            <th className="num">W</th><th className="num">L</th>
            <th className="num">GP</th><th className="num">Win%</th>
            <th className="num">Streak</th>
          </tr>
        </thead>
        <tbody>
          {board.map((p, i) => {
            const cls = i < 3 ? `top-${i + 1}` : '';
            const rate = p.games > 0 ? (p.winRate * 100).toFixed(0) + '%' : '—';
            return (
              <tr key={p.id} className={cls}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td className="num">{p.wins}</td>
                <td className="num">{p.losses}</td>
                <td className="num">{p.games}</td>
                <td className="num">{rate}</td>
                <td className="num">{p.bestStreak}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h4>Game Log</h4>
      <div className="archived-game-log">
        {session.history.length === 0 ? (
          <div className="empty-state" style={{ padding: 8 }}>No games recorded</div>
        ) : (
          [...session.history].reverse().map((h, i) => {
            const t = new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={i} className="history-entry">
                <div className="meta">
                  #{i + 1} • Court {h.court} • {h.source || 'mixed'} • {t}
                  {h.durationMs != null && (
                    <span className="duration">⏱ {formatDuration(h.durationMs)}</span>
                  )}
                </div>
                <div><span className="winner">✓ {h.winners.join(' & ')}</span></div>
                <div><span className="loser">✗ {h.losers.join(' & ')}</span></div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
