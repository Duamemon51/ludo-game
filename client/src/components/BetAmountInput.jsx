export const MIN_BET = 30;
export const MAX_BET = 5000;
const BET_PRESETS = [100, 300, 500, 1000, 2000, 3000, 4000, 5000];
const BET_PREFIXES = new Set();

for (let amount = MIN_BET; amount <= MAX_BET; amount += 1) {
  const text = String(amount);
  for (let length = 1; length < text.length; length += 1) {
    BET_PREFIXES.add(text.slice(0, length));
  }
}

export default function BetAmountInput({ id, value, onChange, hintId, label = 'Bet amount' }) {
  const amount = Number(value);
  const validAmount = Number.isSafeInteger(amount) && amount >= MIN_BET && amount <= MAX_BET;
  const handleChange = (event) => {
    const nextValue = event.target.value.replace(/\D/g, '').slice(0, 4);
    if (
      nextValue
      && (Number(nextValue) > MAX_BET
        || (Number(nextValue) < MIN_BET && !BET_PREFIXES.has(nextValue)))
    ) return;
    onChange(nextValue);
  };
  const handleBlur = () => {
    if (!validAmount) onChange(String(MIN_BET));
  };

  return (
    <>
      <label className="ph-bet-label" htmlFor={id}>{label}</label>
      <div className="ph-bet-stepper">
        <button
          type="button"
          className="ph-bet-stepper-button"
          aria-label="Decrease bet"
          disabled={!validAmount || amount <= MIN_BET}
          onClick={() => onChange(String(amount - 1))}
        >
          -
        </button>
        <input
          id={id}
          className="ph-bet-stepper-value"
          type="text"
          maxLength={4}
          pattern="[0-9]*"
          inputMode="numeric"
          value={value}
          aria-describedby={hintId}
          aria-invalid={!validAmount}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <button
          type="button"
          className="ph-bet-stepper-button"
          aria-label="Increase bet"
          disabled={!validAmount || amount >= MAX_BET}
          onClick={() => onChange(String(amount + 1))}
        >
          +
        </button>
      </div>
      <div className="ph-bet-presets" aria-label="Quick bet amounts">
        {BET_PRESETS.map((amount) => (
          <button
            key={amount}
            type="button"
            className={`ph-bet-preset${Number(value) === amount ? ' selected' : ''}`}
            aria-pressed={Number(value) === amount}
            onClick={() => onChange(String(amount))}
          >
            {amount.toLocaleString()}
          </button>
        ))}
      </div>
    </>
  );
}
