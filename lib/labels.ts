import type { Tone } from "@/components/ui";
import type { Methane, StationStatus, TicketStatus, WorkStatus } from "./types";

export const workLabel: Record<WorkStatus, [string, Tone]> = {
  open: ["Работает", "ok"],
  break: ["Перерыв", "warn"],
  closed: ["Закрыто", "danger"],
};

export const methaneLabel: Record<Methane, [string, Tone]> = {
  available: ["Метан доступен", "ok"],
  low: ["Метана мало", "warn"],
  none: ["Метана нет", "danger"],
};

export const stationStatusLabel: Record<StationStatus, [string, Tone]> = {
  pending: ["На проверке", "warn"],
  verified: ["Подтверждена", "ok"],
  rejected: ["Отклонена", "danger"],
  suspended: ["Приостановлена", "danger"],
};

export const ticketLabel: Record<TicketStatus, [string, Tone]> = {
  waiting: ["Ожидает", "neutral"],
  called: ["Вызван", "ok"],
  arrived: ["На месте", "ok"],
  served: ["Заправлен", "ok"],
  no_show: ["Не приехал", "danger"],
  cancelled: ["Отменён", "neutral"],
};

// Database raises short codes (see init migration); users see these messages.
const errors: Record<string, string> = {
  not_authenticated: "Войдите в аккаунт.",
  banned: "Запись временно ограничена из-за неявок. Попробуйте позже.",
  forbidden: "Недостаточно прав для этого действия.",
  station_unavailable: "Заправка сейчас недоступна.",
  station_closed: "Заправка сейчас не работает.",
  no_methane: "На заправке нет метана — очередь приостановлена.",
  vehicle_not_found: "Выберите свою машину.",
  already_in_queue: "У вас уже есть активный номер в очереди.",
  plate_in_queue: "Эта машина уже стоит в очереди.",
  rate_limited: "Слишком много попыток. Попробуйте через час.",
  queue_full: "Очередь заполнена. Попробуйте позже.",
  queue_empty: "Очередь пуста.",
  invalid_transition: "Это действие недоступно для текущего статуса.",
  ticket_not_cancellable: "Этот номер уже нельзя отменить.",
  application_pending: "У вас уже есть заявка на проверке.",
  reason_required: "Укажите причину отказа.",
  not_pending: "Заявка уже рассмотрена.",
  user_not_found: "Пользователь с таким телефоном не найден. Он должен сначала зарегистрироваться.",
  station_not_verified: "Заправка ещё не подтверждена.",
};

export function errorMessage(e: { message?: string; code?: string } | null | undefined): string {
  const m = e?.message ?? "";
  if (errors[m]) return errors[m];
  if (e?.code === "23505") return "Такая запись уже существует.";
  if (e?.code === "23514") return "Проверьте правильность данных.";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

export const normalizePlate = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");
export const PLATE_RE = /^[0-9]{2}[A-Z0-9]{4,7}$/;

/** "90 123 45 67", "+998901234567", "8 90 ..." -> "+998901234567" or null */
export function normalizePhone(s: string): string | null {
  const d = s.replace(/\D/g, "");
  const n = d.length === 9 ? "998" + d : d;
  return /^998\d{9}$/.test(n) ? "+" + n : null;
}

export const formatPhone = (p: string) => p.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, "+998 $1 $2 $3 $4");
