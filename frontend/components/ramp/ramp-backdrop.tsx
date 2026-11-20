/** One quiet pool of light behind the card. No texture, no orbs: the card is the focus. */
export function RampBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
      style={{
        background:
          "radial-gradient(60% 100% at 50% 0%, rgb(0 249 199 / 0.10) 0%, transparent 70%)",
      }}
    />
  );
}
