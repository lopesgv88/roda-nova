/** Limitadores simples em memória (suficientes para 1 servidor). Em vários servidores, troque por Redis. */
export class Limiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {
    const t = setInterval(() => this.sweep(), 5 * 60_000);
    t.unref?.();
  }
  /** true = permitido; false = estourou o limite */
  hit(key: string): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.hits) {
      const f = v.filter((t) => now - t < this.windowMs);
      if (f.length) this.hits.set(k, f);
      else this.hits.delete(k);
    }
  }
}

/** Bloqueia temporariamente um e-mail depois de muitas senhas erradas seguidas. */
export class LoginGuard {
  private fails = new Map<string, { n: number; until: number }>();
  constructor(
    private maxFails = 8,
    private lockMs = 10 * 60_000,
  ) {}
  locked(key: string): boolean {
    const f = this.fails.get(key);
    return !!f && f.until > Date.now();
  }
  fail(key: string) {
    const f = this.fails.get(key) ?? { n: 0, until: 0 };
    if (f.until && f.until <= Date.now()) f.n = 0;
    f.n += 1;
    if (f.n >= this.maxFails) {
      f.until = Date.now() + this.lockMs;
      f.n = 0;
    }
    this.fails.set(key, f);
  }
  ok(key: string) {
    this.fails.delete(key);
  }
}
