// Minimal in-memory fake of the subset of the Supabase JS query builder used
// by src/lib/scan-diagnostics/*, src/lib/ai-diagnostics/*, and
// src/lib/admin-profitability.ts. Not a full reimplementation — only
// supports the method chains this codebase actually calls (select/eq/gt/
// gte/lt/not/in/order/limit/maybeSingle/single/insert/upsert/update/delete,
// plus a pluggable rpc() map). Good enough to unit-test persistence logic
// without a real database.
import crypto from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeSupabase {
  from(table: string): FakeQueryBuilder;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  setRpcHandler(fn: string, handler: (args: Record<string, unknown>) => unknown): void;
  reset(): void;
  seed(table: string, rows: Row[]): void;
  dump(table: string): Row[];
}

interface FakeQueryBuilder extends PromiseLike<{ data: unknown; error: unknown }> {
  select(cols?: string): FakeQueryBuilder;
  eq(col: string, val: unknown): FakeQueryBuilder;
  gt(col: string, val: number): FakeQueryBuilder;
  gte(col: string, val: unknown): FakeQueryBuilder;
  lt(col: string, val: unknown): FakeQueryBuilder;
  not(col: string, operator: string, val: unknown): FakeQueryBuilder;
  in(col: string, vals: unknown[]): FakeQueryBuilder;
  is(col: string, val: null | boolean): FakeQueryBuilder;
  ilike(col: string, pattern: string): FakeQueryBuilder;
  neq(col: string, val: unknown): FakeQueryBuilder;
  order(col: string, opts?: { ascending?: boolean }): FakeQueryBuilder;
  limit(n: number): FakeQueryBuilder;
  insert(payload: Row | Row[]): FakeQueryBuilder;
  upsert(payload: Row | Row[], opts?: { onConflict?: string }): FakeQueryBuilder;
  update(payload: Row): FakeQueryBuilder;
  delete(): FakeQueryBuilder;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
  single(): Promise<{ data: Row | null; error: unknown }>;
}

export function createFakeSupabase(): FakeSupabase {
  const tables: Record<string, Row[]> = {};
  const rpcHandlers: Record<string, (args: Record<string, unknown>) => unknown> = {};

  function table(name: string): Row[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function builder(name: string): FakeQueryBuilder {
    const filters: Filter[] = [];
    // Chained .order() calls accumulate (matching real Postgrest — each call
    // adds a secondary/tertiary sort key rather than replacing the last one).
    const orderClauses: { col: string; ascending: boolean }[] = [];
    let limitN: number | null = null;
    let op:
      | { type: "insert" | "upsert"; payload?: Row[]; onConflict?: string }
      | { type: "update"; payload?: Row }
      | { type: "delete" }
      | null = null;

    async function execute(): Promise<{ data: Row[]; error: unknown }> {
      const rows = table(name);

      if (op?.type === "insert") {
        const inserted = (op.payload ?? []).map((r) => ({ id: crypto.randomUUID(), ...r }));
        rows.push(...inserted);
        return { data: inserted, error: null };
      }

      if (op?.type === "upsert") {
        const conflictCols = (op.onConflict ?? "id").split(",").map((c) => c.trim());
        const result: Row[] = [];
        for (const incoming of op.payload ?? []) {
          const existingIdx = rows.findIndex((r) => conflictCols.every((c) => r[c] === incoming[c]));
          if (existingIdx >= 0) {
            rows[existingIdx] = { ...rows[existingIdx], ...incoming };
            result.push(rows[existingIdx]);
          } else {
            const created = { id: crypto.randomUUID(), ...incoming };
            rows.push(created);
            result.push(created);
          }
        }
        return { data: result, error: null };
      }

      if (op?.type === "update") {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        for (const row of matched) Object.assign(row, op.payload ?? {});
        return { data: matched, error: null };
      }

      if (op?.type === "delete") {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        const remaining = rows.filter((r) => !filters.every((f) => f(r)));
        tables[name] = remaining;
        return { data: matched, error: null };
      }

      let result = rows.filter((r) => filters.every((f) => f(r)));
      if (orderClauses.length > 0) {
        result = [...result].sort((a, b) => {
          for (const { col, ascending } of orderClauses) {
            const av = a[col] as string | number;
            const bv = b[col] as string | number;
            if (av === bv) continue;
            return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
      }
      if (limitN !== null) result = result.slice(0, limitN);
      return { data: result, error: null };
    }

    const self: FakeQueryBuilder = {
      select() {
        return self;
      },
      eq(col, val) {
        filters.push((r) => r[col] === val);
        return self;
      },
      gt(col, val) {
        filters.push((r) => (r[col] as number) > val);
        return self;
      },
      gte(col, val) {
        filters.push((r) => (r[col] as string | number) >= (val as string | number));
        return self;
      },
      lt(col, val) {
        filters.push((r) => (r[col] as string | number) < (val as string | number));
        return self;
      },
      // Only the "is null" negation is implemented (the only shape this
      // codebase actually calls: .not(col, "is", null)) — not a general
      // negated-filter implementation.
      not(col, operator, val) {
        if (operator === "is" && val === null) {
          filters.push((r) => r[col] !== null && r[col] !== undefined);
        }
        return self;
      },
      in(col, vals) {
        filters.push((r) => vals.includes(r[col]));
        return self;
      },
      // Only "is null"/"is not null"-style equality is implemented (the
      // shapes this codebase actually calls: .is(col, null), .is(col, true))
      // — not a general IS DISTINCT FROM implementation.
      is(col, val) {
        filters.push((r) => (r[col] ?? null) === val);
        return self;
      },
      // Only a leading/trailing "%" prefix-or-suffix wildcard is supported
      // (what this codebase's actual .ilike() calls use, e.g. "P030%") —
      // not full SQL LIKE pattern syntax.
      ilike(col, pattern) {
        const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
        filters.push((r) => String(r[col] ?? "").toLowerCase().startsWith(prefix.toLowerCase()));
        return self;
      },
      neq(col, val) {
        filters.push((r) => r[col] !== val);
        return self;
      },
      order(col, opts) {
        orderClauses.push({ col, ascending: opts?.ascending ?? true });
        return self;
      },
      limit(n) {
        limitN = n;
        return self;
      },
      insert(payload) {
        op = { type: "insert", payload: Array.isArray(payload) ? payload : [payload] };
        return self;
      },
      upsert(payload, opts) {
        op = {
          type: "upsert",
          payload: Array.isArray(payload) ? payload : [payload],
          onConflict: opts?.onConflict,
        };
        return self;
      },
      update(payload) {
        op = { type: "update", payload };
        return self;
      },
      delete() {
        op = { type: "delete" };
        return self;
      },
      async maybeSingle() {
        const { data, error } = await execute();
        return { data: data[0] ?? null, error };
      },
      async single() {
        const { data, error } = await execute();
        return { data: data[0] ?? null, error: data.length === 0 ? { message: "no rows" } : error };
      },
      then(onFulfilled, onRejected) {
        return execute().then(onFulfilled, onRejected);
      },
    };

    return self;
  }

  return {
    from: (name: string) => builder(name),
    async rpc(fn, args) {
      const handler = rpcHandlers[fn];
      if (!handler) throw new Error(`No fake RPC handler registered for "${fn}"`);
      return { data: handler(args), error: null };
    },
    setRpcHandler(fn, handler) {
      rpcHandlers[fn] = handler;
    },
    reset() {
      for (const key of Object.keys(tables)) delete tables[key];
      for (const key of Object.keys(rpcHandlers)) delete rpcHandlers[key];
    },
    // Appends rather than replaces — calling seed() multiple times for the
    // same table (e.g. once per fixture case) accumulates rows instead of
    // each call wiping out the previous one.
    seed(name, rows) {
      tables[name] = [...(tables[name] ?? []), ...rows];
    },
    dump(name) {
      return table(name);
    },
  };
}
