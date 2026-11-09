import { useId } from 'react';

const clamp = (value, min, max = Infinity) => Math.min(max, Math.max(min, value));

function NumberField({ label, hint, value, onChange, min = 0, max, suffix, disabled }) {
  const id = useId();
  return (
    <div className="sa-field">
      <label htmlFor={id}>{label}</label>
      <div className="sa-input-wrap">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        />
        {suffix && <span className="sa-suffix">{suffix}</span>}
      </div>
      {hint && <p className="sa-field-hint">{hint}</p>}
    </div>
  );
}

export default function SuperAdminSettingsPage({ settings, setSettings, settingsSaving, onSave }) {
  const switchId = useId();
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave();
  };

  return (
    <>
      <div className="sa-heading">
        <div>
          <h1>Settings</h1>
          <p className="sa-subtitle">Configure minimum bet, platform fee and tournament mode.</p>
        </div>
      </div>

      <form className="sa-card" onSubmit={handleSubmit}>
        <div className="sa-card-head">
          <h2>Game settings</h2>
          <span>Stored on the server</span>
        </div>

        <div className="sa-settings">
          <div className="sa-settings-card">
            <h2>Bet and platform fee</h2>
            <div className="sa-form-fields">
              <NumberField
                label="Minimum bet"
                hint="The smallest stake a player can place on a match."
                value={settings.minimumBet}
                suffix="credits"
                onChange={(value) => update('minimumBet', value)}
              />
              <NumberField
                label="Platform fee"
                hint="Between 0 and 100."
                value={settings.feePercent}
                max={100}
                suffix="%"
                onChange={(value) => update('feePercent', value)}
              />
            </div>
          </div>

          <div className="sa-settings-card">
            <h2>Tournaments</h2>
            <div className="sa-switch-row">
              <div>
                <label htmlFor={switchId}>Enable tournaments</label>
                <p className="sa-field-hint">Players can join tournaments while this is on.</p>
              </div>
              <input
                id={switchId}
                className="sa-switch"
                type="checkbox"
                role="switch"
                checked={Boolean(settings.tournamentEnabled)}
                onChange={(event) => update('tournamentEnabled', event.target.checked)}
              />
            </div>
            <div className="sa-form-fields">
              <NumberField
                label="Tournament entry"
                hint={settings.tournamentEnabled ? 'Credits a player pays to join.' : 'Turn tournaments on to edit the entry fee.'}
                value={settings.tournamentEntry}
                suffix="credits"
                disabled={!settings.tournamentEnabled}
                onChange={(value) => update('tournamentEntry', value)}
              />
            </div>
          </div>
        </div>

        <div className="sa-settings-actions">
          <button type="submit" className="sa-primary" disabled={settingsSaving}>
            {settingsSaving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </>
  );
}