import React from 'react';
import { useStore } from '../state.jsx';

export default function Toast() {
  const { state } = useStore();
  return (
    <div className={`toast ${state.toast ? 'show' : ''}`}>
      {state.toast?.msg || ''}
    </div>
  );
}
