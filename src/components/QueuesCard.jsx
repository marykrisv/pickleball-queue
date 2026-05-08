import React from 'react';
import { useStore, getNextBracket } from '../state.jsx';
import { isSingleLineMode } from '../util.js';

function QueueList({ ids, players }) {
  if (ids.length === 0) return <div className="queue-list-empty">—</div>;
  return (
    <ul className="queue-list">
      {ids.map((pid, i) => {
        const p = players.find((pl) => pl.id === pid);
        return <li key={pid + '-' + i}>{i + 1}. {p ? p.name : '?'}</li>;
      })}
    </ul>
  );
}

export default function QueuesCard() {
  const { state } = useStore();
  const single = isSingleLineMode(state.players, state.numCourts);

  // Determine which bracket is up next to fill a court.
  const nextBracket = !single && state.started
    ? (state.waiting.length >= 4
        ? null // initial pool still filling courts
        : getNextBracket(state.winnersQueue.length, state.losersQueue.length))
    : null;

  return (
    <div className="card">
      <h2>
        Queues <span className="pill">{single ? 'Single line' : 'W/L brackets'}</span>
      </h2>
      <div className={`queues-grid ${single ? 'single' : ''}`}>
        {!single && (
          <>
            <div className={`queue-card winners${nextBracket === 'winners' ? ' queue-next' : ''}`}>
              <h3>
                Winners <span className="count">{state.winnersQueue.length}</span>
                {nextBracket === 'winners' && <span className="queue-next-badge">NEXT ▶</span>}
              </h3>
              <QueueList ids={state.winnersQueue} players={state.players} />
            </div>
            <div className={`queue-card losers${nextBracket === 'losers' ? ' queue-next' : ''}`}>
              <h3>
                Losers <span className="count">{state.losersQueue.length}</span>
                {nextBracket === 'losers' && <span className="queue-next-badge">NEXT ▶</span>}
              </h3>
              <QueueList ids={state.losersQueue} players={state.players} />
            </div>
          </>
        )}
        <div className="queue-card initial">
          <h3>{single ? 'Waiting Line' : 'Waiting'} <span className="count">{state.waiting.length}</span></h3>
          <QueueList ids={state.waiting} players={state.players} />
        </div>
      </div>
    </div>
  );
}
