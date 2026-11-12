/**
 * Global decorative background (master spec §2.3):
 * near-black base, faint grid fading out radially, slow drifting gradient
 * orbs and a fine-grain layer. Pure CSS — movement respects reduced motion.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="bg-grid-faint absolute inset-0 [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,black_30%,transparent_100%)]" />
      <div className="animate-drift-a absolute -top-40 left-[6%] size-[34rem] rounded-full bg-violet/20 blur-[110px]" />
      <div className="animate-drift-b absolute top-[32%] right-[2%] size-[30rem] rounded-full bg-indigo/15 blur-[120px]" />
      <div className="animate-drift-c absolute bottom-[-12%] left-[28%] size-[28rem] rounded-full bg-blue/10 blur-[130px]" />
      <div className="noise absolute inset-0" />
    </div>
  );
}
