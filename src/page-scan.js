// DOM work shares X's main thread. Yield between small batches so a long
// timeline cannot monopolize input/rendering; never resume an obsolete scan.
export async function scanPageItems(items, visit, current = () => true) {
  let started = performance.now();
  for (const item of items) {
    if (!current()) return;
    visit(item);
    if (performance.now() - started >= 8) {
      if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
      else await new Promise(resolve => setTimeout(resolve, 0));
      started = performance.now();
    }
  }
}
