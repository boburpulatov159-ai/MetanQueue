import { beforeEach, describe, expect, it } from "vitest";
import { addVehicle, as, createStation, createUser, setupDb, type Db } from "./harness";

const ref = setupDb();
let db: Db;
beforeEach(() => {
  db = ref.db;
});

const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

describe("доступ к данным", () => {
  it("аноним видит только подтверждённые заправки", async () => {
    const owner = await createUser(db);
    await createStation(db, owner);
    await createStation(db, owner, { status: "pending" });
    await createStation(db, owner, { status: "suspended" });
    const seen = await as(db, null, () => rows("select status from public.stations"));
    expect(seen).toEqual([{ status: "verified" }]);
  });

  it("владелец видит свою заправку на проверке, чужой пользователь — нет", async () => {
    const owner = await createUser(db);
    const other = await createUser(db);
    await createStation(db, owner, { status: "pending" });
    expect(await as(db, owner, () => rows("select id from public.stations"))).toHaveLength(1);
    expect(await as(db, other, () => rows("select id from public.stations"))).toHaveLength(0);
  });

  it("пользователь не может сделать себя админом или снять бан", async () => {
    const u = await createUser(db);
    await expect(as(db, u, () => rows("update public.profiles set is_admin = true where id = $1", [u]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as(db, u, () => rows("update public.profiles set banned_until = null where id = $1", [u])),
    ).rejects.toThrow(/permission denied/);
    // allowed columns still work
    await as(db, u, () => rows("update public.profiles set full_name = 'Саид' where id = $1", [u]));
  });

  it("чужой профиль, машины и талоны не видны", async () => {
    const a = await createUser(db, { phone: "+998901111111" });
    const b = await createUser(db);
    const owner = await createUser(db);
    const st = await createStation(db, owner);
    const v = await addVehicle(db, a, "01A123BC");
    await as(db, a, () => rows("select public.join_queue($1, $2)", [st, v]));
    const seen = await as(db, b, async () => ({
      profiles: await rows("select id from public.profiles"),
      vehicles: await rows("select id from public.vehicles"),
      tickets: await rows("select id from public.queue_tickets"),
    }));
    expect(seen.profiles).toEqual([{ id: b }]);
    expect(seen.vehicles).toHaveLength(0);
    expect(seen.tickets).toHaveLength(0);
  });

  it("нельзя писать в таблицы очереди, заправок и журнала напрямую", async () => {
    const u = await createUser(db);
    const st = await createStation(db, u);
    await expect(
      as(db, u, () =>
        rows(
          "insert into public.queue_tickets (station_id, user_id, plate, service_date, number) values ($1, $2, '01A123BC', current_date, 1)",
          [st, u],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, u, () => rows("update public.stations set status = 'verified'"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(db, u, () => rows("delete from public.queue_events"))).rejects.toThrow(/permission denied/);
  });

  it("нельзя добавить машину другому пользователю", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await expect(
      as(db, a, () => rows("insert into public.vehicles (user_id, plate) values ($1, '01A123BC')", [b])),
    ).rejects.toThrow(/row-level security/);
  });

  it("служебные функции недоступны клиенту", async () => {
    const u = await createUser(db);
    await expect(as(db, u, () => rows("select public.expire_called_tickets()"))).rejects.toThrow(/permission denied/);
    await expect(as(db, u, () => rows("select public.apply_no_show_penalty($1)", [u]))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("проверка заправок", () => {
  const apply = (db: Db, u: string) =>
    as(db, u, () =>
      db.query<{ id: string }>(
        `select public.apply_station('Метан №8', 'ул. Чиланзар, 5', '+998901234567', 41.28, 69.2,
                                     'ООО ГазМетан', '123456789', 'agnks', 2::smallint) as id`,
      ),
    );

  it("новая заявка не видна на карте до одобрения админом", async () => {
    const owner = await createUser(db);
    const admin = await createUser(db, { admin: true });
    const sid = (await apply(db, owner)).rows[0].id;
    expect(await as(db, null, () => rows("select id from public.stations"))).toHaveLength(0);

    await as(db, admin, () => rows("select public.review_station($1, true)", [sid]));
    expect(await as(db, null, () => rows("select id from public.stations"))).toEqual([{ id: sid }]);
  });

  it("админ без второго фактора (aal1) не может одобрять", async () => {
    const owner = await createUser(db);
    const admin = await createUser(db, { admin: true });
    const sid = (await apply(db, owner)).rows[0].id;
    await expect(
      as(db, admin, () => rows("select public.review_station($1, true)", [sid]), "aal1"),
    ).rejects.toThrow(/forbidden/);
  });

  it("владелец не может одобрить свою заправку", async () => {
    const owner = await createUser(db);
    const sid = (await apply(db, owner)).rows[0].id;
    await expect(as(db, owner, () => rows("select public.review_station($1, true)", [sid]))).rejects.toThrow(/forbidden/);
  });

  it("отказ требует причину; повторная заявка при ожидающей запрещена", async () => {
    const owner = await createUser(db);
    const admin = await createUser(db, { admin: true });
    const sid = (await apply(db, owner)).rows[0].id;
    await expect(apply(db, owner)).rejects.toThrow(/application_pending/);
    await expect(as(db, admin, () => rows("select public.review_station($1, false)", [sid]))).rejects.toThrow(
      /reason_required/,
    );
  });

  it("ИНН и данные заявки не видны другим пользователям и анониму", async () => {
    const owner = await createUser(db);
    const other = await createUser(db);
    await apply(db, owner);
    expect(await as(db, other, () => rows("select * from public.station_applications"))).toHaveLength(0);
    await expect(as(db, null, () => rows("select * from public.station_applications"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("координаты вне Ташкента отклоняются", async () => {
    const owner = await createUser(db);
    await expect(
      as(db, owner, () =>
        rows(`select public.apply_station('X1', 'Москва, Тверская 1', '+998901234567', 55.75, 37.6,
                                          'ООО Тест', '123456789', 'agnks')`),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("приостановленная заправка исчезает с карты и закрывается", async () => {
    const owner = await createUser(db);
    const admin = await createUser(db, { admin: true });
    const st = await createStation(db, owner);
    await as(db, admin, () => rows("select public.set_station_suspended($1, true, 'жалобы')", [st]));
    expect(await as(db, null, () => rows("select id from public.stations"))).toHaveLength(0);
    expect(await rows("select work_status from public.stations where id = $1", [st])).toEqual([
      { work_status: "closed" },
    ]);
  });

  it("оператор чужой заправки не может менять её статус", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const st = await createStation(db, owner);
    await expect(
      as(db, stranger, () => rows("select public.set_station_status($1, 'closed', 'none')", [st])),
    ).rejects.toThrow(/forbidden/);
    await as(db, owner, () => rows("select public.set_station_status($1, 'open', 'low')", [st]));
  });
});
