export async function requestNotif(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  try {
    if (Notification.permission === "granted") return true;
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch {
    return false;
  }
}
