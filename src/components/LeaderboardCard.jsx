import React, { useState } from 'react';
import { useStore } from '../state.jsx';
import { computeLeaderboard, exportCsv, exportMarkdown, exportJson, exportPdf, liveStateAsSession } from '../exports.js';

export default function LeaderboardCard() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const board = computeLeaderboard(state.players);

  const session = liveStateAsSession(state);
  const onCsv = () => exportCsv(session);
  const onMd = () => exportMarkdown(session, (msg) => dispatch({ type: 'TOAST', msg }));
  const onJson = () => exportJson(session);
  const onPdf = () => exportPdf(session, (msg) => dispatch({ type: 'TOAST', msg }));

  return (
    <div className={`leaderboard-card ${open ? 'open' : ''}`}>
      <button
        className="leaderboard-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="label">
          Leaderboard <span className="pill">{board.length}</span>
        </span>
        <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="leaderboard-content">
          {board.length === 0 ? (
            <div className="leaderboard-empty">Add players to see the leaderboard</div>
          ) : (
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
          )}
          <div className="export-row">
            <button className="btn-ghost" onClick={onCsv}>CSV</button>
            <button className="btn-ghost" onClick={onMd}>Copy Markdown</button>
            <button className="btn-ghost" onClick={onJson}>JSON</button>
            <button className="btn-ghost" onClick={onPdf}>Export PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}
