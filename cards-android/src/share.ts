import { Share } from 'react-native';

// Hands the question to Android's share sheet as plain text. The app itself never
// sends anything anywhere; whichever app the person picks does the sending.
export async function shareQuestion(question: string) {
  try { await Share.share({ message: `${question}\n\nFrom Moth & Lamp` }); } catch {}
}
