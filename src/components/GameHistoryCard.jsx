import React from 'react';
import { useStore } from '../state.jsx';
import { formatDuration } from '../util.js';

export default function GameHistoryCard() {
  const { state } = useStore();

  return (
    <div className="card">
      <h2>
        Game History <span className="pill">{state.history.length}</span>
      </h2>
      {state.history.length === 0 ? (
        <div className="empty-state" style={{ padding: 8 }}>No games played yet</div>
      ) : (
        <div className="history">
          {state.history.slice(0, 30).map((h, i) => {
            const timeObj = h.time instanceof Date ? h.time : new Date(h.time);
            const time = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={i} className="history-entry">
                <div className="meta">
                  Court {h.court} • {h.source || 'mixed'} • {time}
                  {h.durationMs != null && (
                    <span className="duration">⏱ {formatDuration(h.durationMs)}</span>
                  )}
                </div>
                <div><span className="winner">✓ {h.winners.join(' & ')}</span></div>
                <div><span className="loser">✗ {h.losers.join(' & ')}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
