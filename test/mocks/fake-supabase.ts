// Minimal in-memory fake of the subset of the Supabase JS query builder used
// by src/lib/scan-diagnostics/*. Not a full reimplementation — only
// supports the method chains this codebase actually calls (select/eq/in/
// order/limit/maybeSingle/single/insert/upsert/update/delete, plus a
// pluggable rpc() map). Good enough to unit-test persistence logic without
// a real database.
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
  in(col: string, vals: unknown[]): FakeQueryBuilder;
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
    let orderCol: string | null = null;
    let orderAscending = true;
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
      if (orderCol) {
        const col = orderCol;
        result = [...result].sort((a, b) => {
          const av = a[col] as string | number;
          const bv = b[col] as string | number;
          if (av === bv) return 0;
          return (av < bv ? -1 : 1) * (orderAscending ? 1 : -1);
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
      in(col, vals) {
        filters.push((r) => vals.includes(r[col]));
        return self;
      },
      order(col, opts) {
        orderCol = col;
        orderAscending = opts?.ascending ?? true;
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
    seed(name, rows) {
      tables[name] = [...rows];
    },
    dump(name) {
      return table(name);
    },
  };
}
