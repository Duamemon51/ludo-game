const isEmojiOnly = (t) => /^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u.test(t) && t.length <= 8;

// vertical: 'top' | 'bottom' (which side of the panel), side: 'left' | 'right' | 'center'
export default function Bubble({ text, vertical, side }) {
  return (
    <div className={`bubble ${vertical} ${side}${isEmojiOnly(text) ? ' big' : ''}`}>{text}</div>
  );
}