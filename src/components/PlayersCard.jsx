import React, { useState } from 'react';
import { useStore } from '../state.jsx';

export default function PlayersCard() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const submitAdd = () => {
    if (!name.trim()) return;
    dispatch({ type: 'ADD_PLAYER', name });
    setName('');
  };

  const submitBulk = () => {
    if (!bulkText.trim()) return;
    dispatch({ type: 'BULK_ADD_PLAYERS', text: bulkText });
    setBulkText('');
  };

  const onClearAll = () => {
    if (!window.confirm('Remove all players and clear all state?')) return;
    dispatch({ type: 'CLEAR_ALL' });
  };

  return (
    <div className="card">
      <h2>
        Players <span className="pill">{state.players.length}</span>
      </h2>
      <div className="add-row">
        <input
          type="text"
          placeholder="Player name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
        />
        <button className="btn-primary" onClick={submitAdd}>Add</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setBulkOpen((v) => !v)}>
          Bulk add
        </button>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={onClearAll}>
          Clear all
        </button>
      </div>
      {bulkOpen && (
        <>
          <textarea
            placeholder="Paste names, one per line, then click Add All"
            rows={4}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <button
            className="btn-primary"
            onClick={submitBulk}
            style={{ width: '100%', marginBottom: 10 }}
          >
            Add All
          </button>
        </>
      )}

      {state.players.length === 0 ? (
        <div className="player-list-empty">No players added yet</div>
      ) : (
        <ul className="player-list">
          {state.players.map((p) => {
            const onCourt = state.courts.some(
              (c) => c.teamA && (c.teamA.includes(p.id) || c.teamB.includes(p.id))
            );
            return (
              <li key={p.id} className={`player-row${p.resting ? ' player-resting' : ''}`}>
                <span className="player-info">
                  <span className="player-name">{p.name}</span>
                  <span className="player-stats">
                    {p.wins}W-{p.losses}L
                  </span>
                  {p.resting && <span className="resting-badge">💤 Resting</span>}
                </span>
                <span className="player-actions">
                  <button
                    className="rest-toggle"
                    onClick={() => dispatch({ type: 'TOGGLE_PLAYER_REST', id: p.id })}
                    disabled={!p.resting && onCourt}
                    title={
                      p.resting
                        ? 'Resume — add back to queue'
                        : onCourt
                        ? "Can't rest mid-game — finish the court first"
                        : 'Rest — remove from queue'
                    }
                  >
                    {p.resting ? 'Resume' : 'Rest'}
                  </button>
                  <button className="remove" onClick={() => dispatch({ type: 'REMOVE_PLAYER', id: p.id })} title="Remove player">
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
