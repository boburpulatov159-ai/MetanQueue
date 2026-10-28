import { beforeEach, describe, expect, it } from "vitest";
import { addVehicle, as, createStation, createUser, setupDb, type Db } from "./harness";

const ref = setupDb();
let db: Db;
let owner: string;
let st: string;
beforeEach(async () => {
  db = ref.db;
  owner = await createUser(db);
  st = await createStation(db, owner);
});

const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
type Ticket = { id: string; number: number; status: string };
const join = (u: string, v: string, station = st) =>
  as(db, u, async () => (await db.query<Ticket>("select * from public.join_queue($1, $2)", [station, v])).rows[0]);
const callNext = (u: string) =>
  as(db, u, async () => (await db.query<Ticket>("select * from public.call_next($1)", [st])).rows[0]);
const setStatus = (u: string, t: string, s: string) =>
  as(db, u, () => rows("select public.set_ticket_status($1, $2::public.ticket_status)", [t, s]));

async function driver(plate: string) {
  const u = await createUser(db);
  return { u, v: await addVehicle(db, u, plate) };
}

describe("получение номера", () => {
  it("номера выдаются по порядку", async () => {
    const a = await driver("01A111AA");
    const b = await driver("01A222BB");
    expect((await join(a.u, a.v)).number).toBe(1);
    expect((await join(b.u, b.v)).number).toBe(2);
  });

  it("второй активный талон запрещён — даже на другой заправке", async () => {
    const a = await driver("01A111AA");
    const st2 = await createStation(db, owner);
    await join(a.u, a.v);
    await expect(join(a.u, a.v)).rejects.toThrow(/already_in_queue/);
    await expect(join(a.u, a.v, st2)).rejects.toThrow(/already_in_queue/);
  });

  it("одна машина не может стоять в очереди дважды с разных аккаунтов", async () => {
    const a = await driver("01A111AA");
    const b = await driver("01A111AA");
    await join(a.u, a.v);
    await expect(join(b.u, b.v)).rejects.toThrow(/plate_in_queue/);
  });

  it("индекс в базе блокирует дубль даже в обход функции", async () => {
    const a = await driver("01A111AA");
    await join(a.u, a.v);
    await expect(
      rows(
        "insert into public.queue_tickets (station_id, user_id, plate, service_date, number) values ($1, $2, '01A999ZZ', current_date, 99)",
        [st, a.u],
      ),
    ).rejects.toThrow(/one_active_ticket_per_user/);
  });

  it("нельзя использовать чужую машину", async () => {
    const a = await driver("01A111AA");
    const b = await createUser(db);
    await expect(join(b, a.v)).rejects.toThrow(/vehicle_not_found/);
  });

  it("закрытая, без метана, неподтверждённая заправка не принимает очередь", async () => {
    const a = await driver("01A111AA");
    const closed = await createStation(db, owner, { work_status: "closed" });
    const empty = await createStation(db, owner, { methane: "none" });
    const pending = await createStation(db, owner, { status: "pending" });
    await expect(join(a.u, a.v, closed)).rejects.toThrow(/station_closed/);
    await expect(join(a.u, a.v, empty)).rejects.toThrow(/no_methane/);
    await expect(join(a.u, a.v, pending)).rejects.toThrow(/station_unavailable/);
  });

  it("лимит очереди", async () => {
    const small = await createStation(db, owner, { max_queue: 1 });
    const a = await driver("01A111AA");
    const b = await driver("01A222BB");
    await join(a.u, a.v, small);
    await expect(join(b.u, b.v, small)).rejects.toThrow(/queue_full/);
  });

  it("не больше 5 талонов в час", async () => {
    const a = await driver("01A111AA");
    for (let i = 0; i < 5; i++) {
      const t = await join(a.u, a.v);
      await as(db, a.u, () => rows("select public.cancel_ticket($1)", [t.id]));
    }
    await expect(join(a.u, a.v)).rejects.toThrow(/rate_limited/);
  });

  it("аноним не может встать в очередь", async () => {
    const a = await driver("01A111AA");
    await expect(as(db, null, () => rows("select public.join_queue($1, $2)", [st, a.v]))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("работа оператора", () => {
  it("вызывается самый ранний; чужой оператор не может вызывать", async () => {
    const a = await driver("01A111AA");
    const b = await driver("01A222BB");
    await join(a.u, a.v);
    await join(b.u, b.v);
    const stranger = await createUser(db);
    await expect(callNext(stranger)).rejects.toThrow(/forbidden/);
    expect((await callNext(owner)).number).toBe(1);
    expect((await callNext(owner)).number).toBe(2);
    await expect(callNext(owner)).rejects.toThrow(/queue_empty/);
  });

  it("допустимые переходы статусов", async () => {
    const a = await driver("01A111AA");
    const t = await join(a.u, a.v);
    await expect(setStatus(owner, t.id, "served")).rejects.toThrow(/invalid_transition/); // ещё не вызван
    await callNext(owner);
    await setStatus(owner, t.id, "arrived");
    await setStatus(owner, t.id, "served");
    await expect(setStatus(owner, t.id, "arrived")).rejects.toThrow(/invalid_transition/);
    // after service the driver can queue again
    expect((await join(a.u, a.v)).number).toBe(2);
  });

  it("клиент не может сам отметить себя обслуженным", async () => {
    const a = await driver("01A111AA");
    const t = await join(a.u, a.v);
    await callNext(owner);
    await expect(setStatus(a.u, t.id, "served")).rejects.toThrow(/forbidden/);
  });

  it("каждое действие пишется в журнал", async () => {
    const a = await driver("01A111AA");
    const t = await join(a.u, a.v);
    await callNext(owner);
    await setStatus(owner, t.id, "served");
    const log = await as(db, owner, () => rows("select action from public.queue_events order by id"));
    expect(log.map((r) => (r as { action: string }).action)).toEqual(["joined", "called", "served"]);
  });

  it("талон без приложения от оператора встаёт в общую очередь", async () => {
    const a = await driver("01A111AA");
    await join(a.u, a.v);
    const w = await as(db, owner, async () => (await db.query<Ticket>("select * from public.add_walk_in($1, '01 b 777 cc')", [st])).rows[0]);
    expect(w.number).toBe(2);
  });
});

describe("позиция и неявки", () => {
  it("my_ticket показывает позицию и ожидание; queue_stats доступна анониму", async () => {
    const a = await driver("01A111AA");
    const b = await driver("01A222BB");
    const c = await driver("01A333CC");
    await join(a.u, a.v);
    await join(b.u, b.v);
    await join(c.u, c.v);
    const mine = await as(db, c.u, () => rows("select ahead, wait_min, number from public.my_ticket()"));
    // 2 ahead * 5 min / 2 columns = 5
    expect(mine).toEqual([{ ahead: 2, wait_min: 5, number: 3 }]);
    const stats = await as(db, null, () => rows("select cars, wait_min from public.queue_stats()"));
    expect(stats).toEqual([{ cars: 3, wait_min: 8 }]); // ceil(3*5/2)
  });

  it("3 неявки за неделю — бан на сутки", async () => {
    const a = await driver("01A111AA");
    for (let i = 0; i < 3; i++) {
      const t = await join(a.u, a.v);
      await callNext(owner);
      await setStatus(owner, t.id, "no_show");
    }
    await expect(join(a.u, a.v)).rejects.toThrow(/banned/);
  });

  it("вызванный, но не приехавший вовремя, автоматически становится неявкой", async () => {
    const a = await driver("01A111AA");
    const t = await join(a.u, a.v);
    await callNext(owner);
    await rows("update public.queue_tickets set called_at = now() - interval '11 minutes' where id = $1", [t.id]);
    expect(await rows("select public.expire_called_tickets() as n")).toEqual([{ n: 1 }]);
    expect(await rows("select status from public.queue_tickets where id = $1", [t.id])).toEqual([{ status: "no_show" }]);
  });
});
