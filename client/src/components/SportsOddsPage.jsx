import { useState } from 'react';
import './SportsOddsPage.css';

const SAMPLE_RESPONSE = {
  sport: 'cricket',
  event_id: 1789048569,
  event: {
    gmid: 1789048569,
    ename: 'India v Australia',
    etid: 4,
    status: 'OPEN',
  },
  odds: [
    {
      marketId: '1.234',
      marketName: 'Match Odds',
      gtype: 'match',
      status: 'OPEN',
      runners: [
        {
          selectionId: '47999',
          runnerName: 'India',
          status: 'ACTIVE',
          ex: {
            availableToBack: [{ price: 1.75, size: 50.0 }],
            availableToLay: [{ price: 1.76, size: 40.0 }],
          },
        },
      ],
    },
  ],
};

export default function SportsOddsPage({ onBack }) {
  const [selectedOdds, setSelectedOdds] = useState(null);
  const { event, odds, sport, event_id: eventId } = SAMPLE_RESPONSE;

  return (
    <section className="ph-panel ph-sports-panel">
      <header className="ph-sports-heading">
        <button type="button" className="ph-sports-back" onClick={onBack} aria-label="Back to home">
          <span aria-hidden="true">‹</span> Home
        </button>
        <span className="ph-sports-test-tag">TEST MODE</span>
      </header>

      <div className="ph-sports-event">
        <div className="ph-sports-event-meta">
          <span>{sport.toUpperCase()}</span>
          <span className="ph-sports-status"><i /> {event.status}</span>
        </div>
        <h2>{event.ename}</h2>
        <p>Event ID: {eventId}</p>
        <div className="ph-sports-event-id">Match #{event.gmid} <span>·</span> Event type {event.etid}</div>
      </div>

      {odds.map((market) => (
        <section className="ph-sports-market" key={market.marketId}>
          <header className="ph-sports-market-heading">
            <div>
              <span className="ph-sports-live-mark" aria-hidden="true">●</span>
              <strong>{market.marketName}</strong>
              <small>{market.status}</small>
            </div>
            <span className="ph-sports-market-id">{market.marketId}</span>
          </header>

          <div className="ph-sports-column-headings" aria-hidden="true">
            <span>SELECTION</span><span>BACK</span><span>LAY</span>
          </div>

          {market.runners.map((runner) => {
            const back = runner.ex.availableToBack[0];
            const lay = runner.ex.availableToLay[0];
            return (
              <div className="ph-sports-runner" key={runner.selectionId}>
                <div className="ph-sports-runner-name">
                  <strong>{runner.runnerName}</strong>
                  <small>{runner.status}</small>
                </div>
                <button
                  type="button"
                  className={`ph-sports-odd back${selectedOdds?.side === 'Back' ? ' selected' : ''}`}
                  onClick={() => setSelectedOdds({ runner: runner.runnerName, side: 'Back', ...back })}
                  aria-label={`Select Back ${runner.runnerName} at ${back.price}`}
                >
                  <strong>{back.price}</strong><small>{back.size}</small>
                </button>
                <button
                  type="button"
                  className={`ph-sports-odd lay${selectedOdds?.side === 'Lay' ? ' selected' : ''}`}
                  onClick={() => setSelectedOdds({ runner: runner.runnerName, side: 'Lay', ...lay })}
                  aria-label={`Select Lay ${runner.runnerName} at ${lay.price}`}
                >
                  <strong>{lay.price}</strong><small>{lay.size}</small>
                </button>
              </div>
            );
          })}
        </section>
      ))}

      {selectedOdds && (
        <div className="ph-sports-selection" role="status">
          Demo selection: <strong>{selectedOdds.side} {selectedOdds.runner}</strong>
          <span>@ {selectedOdds.price} · Size {selectedOdds.size}</span>
        </div>
      )}

      <p className="ph-sports-disclaimer">Sample API response for UI testing only. No live odds or real bets.</p>
    </section>
  );
}
