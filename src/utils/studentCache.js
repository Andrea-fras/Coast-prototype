/** Account-scoped browser data; never restore legacy unowned chat. */
export function lessonChatKey(userId, folderName) {
  return `coast_lesson_chat_v2_${userId}_${encodeURIComponent(folderName)}`;
}
export function clearStudentSession() {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('coast_')) sessionStorage.removeItem(key);
  }
  window.dispatchEvent(new Event('coast-account-changed'));
}
