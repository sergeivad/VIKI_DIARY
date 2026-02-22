import { DiaryErrorCode, isDiaryDomainError } from "../../services/diary.errors.js";

export function mapDiaryActionErrorMessage(error: unknown): string | null {
  if (!isDiaryDomainError(error)) {
    return null;
  }

  if (error.code === DiaryErrorCode.entryNotFound) {
    return "Запись не найдена или уже удалена.";
  }

  if (error.code === DiaryErrorCode.entryAccessDenied) {
    return "У вас нет доступа к этой записи.";
  }

  if (error.code === DiaryErrorCode.invalidEventDate) {
    return "Введите дату в формате дд.мм.гггг.";
  }

  return "Не удалось выполнить действие с записью.";
}
